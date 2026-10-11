"""Train a Random Forest classifier for substation equipment health.

Run once with:
    python -m app.ml.train

It synthesizes a labeled dataset (Healthy / Warning / Critical) using the
same physical envelopes the simulator uses, trains a RandomForestClassifier,
reports test accuracy, and writes `model.pkl` next to this file.
"""
from __future__ import annotations

import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split

FEATURES = ["temperature", "voltage", "current", "oil_level", "humidity", "vibration"]
LABELS = ["Healthy", "Warning", "Critical"]
MODEL_PATH = Path(__file__).with_name("model.pkl")


def _label(row: pd.Series) -> str:
    """Rule that generates ground truth from a raw reading."""
    score = 0
    if row.temperature >= 95: score += 2
    elif row.temperature >= 80: score += 1
    if row.voltage >= 420: score += 2
    elif row.voltage >= 410: score += 1
    if row.current >= 1100: score += 2
    elif row.current >= 950: score += 1
    if row.oil_level <= 45: score += 2
    elif row.oil_level <= 55: score += 1
    if row.humidity >= 80: score += 2
    elif row.humidity >= 65: score += 1
    if row.vibration >= 7.5: score += 2
    elif row.vibration >= 5.0: score += 1

    if score >= 3: return "Critical"
    if score >= 1: return "Warning"
    return "Healthy"


def build_dataset(n: int = 4000, seed: int = 42) -> pd.DataFrame:
    """Synthesize a balanced dataset across normal + fault scenarios."""
    rng = np.random.default_rng(seed)
    modes = rng.choice(["normal", "overheat", "overload", "oil_leak", "insulation"],
                       size=n, p=[0.55, 0.12, 0.12, 0.11, 0.10])
    rows = []
    for m in modes:
        base = dict(
            temperature=rng.normal(55, 6),
            voltage=rng.normal(400, 2.5),
            current=rng.normal(550, 120),
            oil_level=rng.normal(78, 5),
            humidity=rng.normal(38, 7),
            vibration=rng.normal(2.0, 0.7),
        )
        if m == "overheat":
            base["temperature"] = rng.normal(92, 5)
            base["oil_level"] = rng.normal(58, 3)
        elif m == "overload":
            base["current"] = rng.normal(1050, 60)
            base["temperature"] = rng.normal(82, 4)
        elif m == "oil_leak":
            base["oil_level"] = rng.normal(48, 3)
            base["temperature"] = rng.normal(78, 4)
        elif m == "insulation":
            base["humidity"] = rng.normal(75, 5)
            base["vibration"] = rng.normal(6.0, 0.8)
        rows.append(base)

    df = pd.DataFrame(rows)
    df["label"] = df.apply(_label, axis=1)
    return df


def train() -> None:
    df = build_dataset()
    X = df[FEATURES]
    y = df["label"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    clf = RandomForestClassifier(
        n_estimators=200, max_depth=12, random_state=42, n_jobs=-1
    )
    clf.fit(X_train, y_train)

    print("=== Test set report ===")
    print(classification_report(y_test, clf.predict(X_test)))

    joblib.dump({"model": clf, "features": FEATURES, "labels": LABELS}, MODEL_PATH)
    print(f"Saved model to {MODEL_PATH.resolve()}")


if __name__ == "__main__":
    train()
