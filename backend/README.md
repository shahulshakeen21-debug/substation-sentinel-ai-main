# AI/ML Digital Twin — FastAPI Backend

Backend for the **AI/ML Enabled Digital Twin for EHV 400/220 kV Substation** mini project.
Pairs with the React/Tailwind/Recharts frontend in the parent folder.

## Stack

- **FastAPI** — REST API
- **SQLAlchemy + PostgreSQL** — persistence (SQLite fallback for local dev)
- **Pandas + scikit-learn (Random Forest)** — health prediction model
- **Pydantic** — request/response validation

## Project layout

```
backend/
├── app/
│   ├── main.py              # FastAPI app + CORS + router mounting
│   ├── database.py          # SQLAlchemy engine/session
│   ├── models.py            # ORM: User, SensorData, Prediction, Alert
│   ├── schemas.py           # Pydantic DTOs (mirror frontend types)
│   ├── auth.py              # Password hashing + login helpers
│   ├── seed.py              # Insert default operator user
│   ├── routers/
│   │   ├── auth.py          # POST /auth/login
│   │   ├── sensors.py       # GET  /sensors/latest, /sensors/history
│   │   ├── predictions.py   # POST /predict
│   │   ├── alerts.py        # GET  /alerts
│   │   └── reports.py       # GET  /reports/summary
│   └── ml/
│       ├── train.py         # Generates dataset + trains RandomForest → model.pkl
│       └── predict.py       # Loads model.pkl and returns Prediction
├── requirements.txt
├── .env.example
└── README.md
```

## Quick start

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env    # edit DATABASE_URL if you use Postgres

# 1. Train the Random Forest model (writes app/ml/model.pkl)
python -m app.ml.train

# 2. Launch the API
uvicorn app.main:app --reload --port 8000
```

Open **http://localhost:8000/docs** for the Swagger UI.

## Point the frontend at this backend

In the project root (Lovable app), create a `.env` with:

```
VITE_API_URL=http://localhost:8000
```

Restart the dev server. The header status pill will switch from **DEMO MODE** to
**API LIVE**.

## Default credentials

`operator / substation` (seeded automatically on first boot).

## Database

Uses SQLite (`./digital_twin.db`) out of the box for zero-config demos.
To use PostgreSQL, set:

```
DATABASE_URL=postgresql+psycopg2://user:pass@localhost:5432/digital_twin
```

Tables are auto-created on startup. Create the DB first:
`createdb digital_twin`.
