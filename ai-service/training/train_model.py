"""
Train the Isolation Forest anomaly detector on synthetic Kenyan election data.

Saves two artefacts to models/:
  isolation_forest.joblib  - trained sklearn model
  scaler.joblib            - fitted StandardScaler for feature normalisation
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report

MODELS = Path(__file__).parent.parent / "models"
DATA = MODELS / "training_data.csv"
FEATURES = [
    "voting_velocity",
    "temporal_deviation",
    "geographic_cluster_score",
    "repeat_attempt_rate",
    "distress_correlation",
]


def score_to_anomaly(raw_scores: np.ndarray) -> np.ndarray:
    """
    Convert Isolation Forest decision_function scores to 0-100 anomaly scale.
    decision_function returns negative values for anomalies, positive for normal.
    We invert and normalise to [0, 100].
    """
    inverted = -raw_scores
    lo, hi = inverted.min(), inverted.max()
    if hi == lo:
        return np.full_like(inverted, 50.0)
    normalised = (inverted - lo) / (hi - lo)
    return (normalised * 100).round(1)


def main() -> None:
    if not DATA.exists():
        print("Training data not found. Run generate_data.py first.")
        return

    df = pd.read_csv(DATA)
    X = df[FEATURES].values
    y_true = (df["label"] != "normal").astype(int)  # 1 = anomaly

    # Fit scaler on all data (unsupervised — Isolation Forest doesn't use labels)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Isolation Forest
    # contamination = fraction of anomalies in training set
    n_anomalies = (df["label"] != "normal").sum()
    contamination = round(float(n_anomalies) / len(df), 3)
    print(f"Contamination estimate: {contamination:.3f}")

    model = IsolationForest(
        n_estimators=200,
        max_samples="auto",
        contamination=contamination,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_scaled)

    # Evaluate: IF labels -1 (anomaly) / 1 (normal)
    preds_raw = model.predict(X_scaled)
    preds_binary = (preds_raw == -1).astype(int)

    print("\nClassification Report (on training data — indicative only):")
    print(classification_report(y_true, preds_binary, target_names=["normal", "anomaly"]))

    # Save artefacts
    MODELS.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODELS / "isolation_forest.joblib")
    joblib.dump(scaler, MODELS / "scaler.joblib")

    # Save metadata for the API to load
    meta = {
        "features": FEATURES,
        "contamination": contamination,
        "n_estimators": 200,
        "training_samples": len(df),
        "anomaly_threshold": 70,
    }
    with open(MODELS / "model_meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\nModel artefacts saved to {MODELS}")

    # Quick sanity check — score a few synthetic cases
    test_cases = pd.DataFrame([
        {  # normal voter
            "voting_velocity": 0.25,
            "temporal_deviation": 0.10,
            "geographic_cluster_score": 0.08,
            "repeat_attempt_rate": 0.02,
            "distress_correlation": 0.01,
        },
        {  # velocity fraud
            "voting_velocity": 0.90,
            "temporal_deviation": 0.50,
            "geographic_cluster_score": 0.80,
            "repeat_attempt_rate": 0.05,
            "distress_correlation": 0.03,
        },
        {  # coercion cluster
            "voting_velocity": 0.65,
            "temporal_deviation": 0.75,
            "geographic_cluster_score": 0.60,
            "repeat_attempt_rate": 0.15,
            "distress_correlation": 0.80,
        },
    ])
    X_test = scaler.transform(test_cases[FEATURES].values)
    raw = model.decision_function(X_test)
    scores = score_to_anomaly(raw)
    print("\nSanity check scores (expect: low, high, high):")
    for i, (label, score) in enumerate(zip(["normal", "velocity_fraud", "coercion"], scores)):
        print(f"  {label}: {score:.1f}/100")


if __name__ == "__main__":
    main()
