import type { Prediction } from "@/lib/types";
import { Wrench } from "lucide-react";

// Maintenance recommendation card — driven by the current AI prediction.
export function RecommendationPanel({ prediction }: { prediction: Prediction }) {
  const tone =
    prediction.status === "Critical"
      ? "border-critical/40 bg-critical/10 text-critical"
      : prediction.status === "Warning"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-healthy/40 bg-healthy/10 text-healthy";

  return (
    <div className={`panel p-5 border ${tone}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider">
        <Wrench className="h-4 w-4" />
        Maintenance Recommendation
      </div>
      <p className="mt-3 text-sm leading-relaxed text-foreground">{prediction.recommendation}</p>
    </div>
  );
}
