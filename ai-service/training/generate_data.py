"""
Generate synthetic Kenyan election training data for the Isolation Forest model.

Features engineered from realistic Kenyan election patterns:
  voting_velocity         - votes per hour at this station (normalised 0-1)
  temporal_deviation      - how far current time deviates from expected hourly pattern (0-1)
  geographic_cluster_score - station surge vs county average, z-score normalised (0-1)
  repeat_attempt_rate     - failed PIN attempts before successful vote (0-1)
  distress_correlation    - distress flag density at this station in last 60 min (0-1)

Normal range references (2017/2022 IEBC data estimates):
  - Average station throughput: 400-600 voters/day over 12h = ~40-50 voters/hr
  - Peak hours: 06:00-09:00 and 15:00-17:00 (Nairobi) / 07:00-10:00 (rural)
  - Distress rate baseline: < 0.1% of votes
"""

import numpy as np
import pandas as pd
from pathlib import Path

RNG = np.random.default_rng(42)
OUT = Path(__file__).parent.parent / "models" / "training_data.parquet"


def _clamp(arr: np.ndarray) -> np.ndarray:
    return np.clip(arr, 0.0, 1.0)


def generate_normal(n: int = 8_000) -> pd.DataFrame:
    """Simulate clean voting sessions across Kenyan polling stations."""
    # Velocity: 0.1-0.5 (40-200 voters/hr at a 400-capacity station)
    velocity = _clamp(RNG.normal(0.28, 0.08, n))
    # Temporal: low deviation during standard hours
    temporal = _clamp(RNG.beta(2, 8, n))
    # Geographic: near-zero cluster anomaly
    geo = _clamp(RNG.beta(2, 10, n))
    # Repeat attempts: almost always first-try
    repeat = _clamp(RNG.beta(1.2, 15, n))
    # Distress: near-zero baseline
    distress = _clamp(RNG.beta(1.1, 40, n))

    return pd.DataFrame({
        "voting_velocity": velocity,
        "temporal_deviation": temporal,
        "geographic_cluster_score": geo,
        "repeat_attempt_rate": repeat,
        "distress_correlation": distress,
        "label": "normal",
    })


def generate_velocity_fraud(n: int = 300) -> pd.DataFrame:
    """Ballot stuffing: extremely high throughput, low individual variance."""
    velocity = _clamp(RNG.normal(0.82, 0.06, n))          # 3-4× normal
    temporal = _clamp(RNG.normal(0.45, 0.15, n))           # spread across day
    geo = _clamp(RNG.normal(0.75, 0.10, n))                # isolated surge
    repeat = _clamp(RNG.beta(1.5, 12, n))                  # smooth access
    distress = _clamp(RNG.beta(1.2, 20, n))

    return pd.DataFrame({
        "voting_velocity": velocity,
        "temporal_deviation": temporal,
        "geographic_cluster_score": geo,
        "repeat_attempt_rate": repeat,
        "distress_correlation": distress,
        "label": "velocity_fraud",
    })


def generate_coercion_cluster(n: int = 250) -> pd.DataFrame:
    """Organised coercion: elevated distress + high velocity + narrow time window."""
    velocity = _clamp(RNG.normal(0.65, 0.10, n))
    temporal = _clamp(RNG.normal(0.70, 0.12, n))           # compressed window
    geo = _clamp(RNG.normal(0.60, 0.12, n))
    repeat = _clamp(RNG.beta(2, 10, n))
    distress = _clamp(RNG.normal(0.72, 0.14, n))           # elevated distress

    return pd.DataFrame({
        "voting_velocity": velocity,
        "temporal_deviation": temporal,
        "geographic_cluster_score": geo,
        "repeat_attempt_rate": repeat,
        "distress_correlation": distress,
        "label": "coercion_cluster",
    })


def generate_bot_registration(n: int = 200) -> pd.DataFrame:
    """Ghost voters: high repeat PIN attempts, unusual temporal pattern."""
    velocity = _clamp(RNG.normal(0.55, 0.12, n))
    temporal = _clamp(RNG.normal(0.80, 0.10, n))           # off-peak (night?)
    geo = _clamp(RNG.normal(0.40, 0.15, n))
    repeat = _clamp(RNG.normal(0.78, 0.12, n))             # many failed PINs
    distress = _clamp(RNG.beta(2, 15, n))

    return pd.DataFrame({
        "voting_velocity": velocity,
        "temporal_deviation": temporal,
        "geographic_cluster_score": geo,
        "repeat_attempt_rate": repeat,
        "distress_correlation": distress,
        "label": "bot_registration",
    })


def generate_geographic_surge(n: int = 250) -> pd.DataFrame:
    """Station-level surge: one station wildly above county average."""
    velocity = _clamp(RNG.normal(0.58, 0.10, n))
    temporal = _clamp(RNG.beta(3, 7, n))
    geo = _clamp(RNG.normal(0.88, 0.07, n))                # extreme geographic outlier
    repeat = _clamp(RNG.beta(1.5, 14, n))
    distress = _clamp(RNG.beta(1.5, 18, n))

    return pd.DataFrame({
        "voting_velocity": velocity,
        "temporal_deviation": temporal,
        "geographic_cluster_score": geo,
        "repeat_attempt_rate": repeat,
        "distress_correlation": distress,
        "label": "geographic_surge",
    })


def main() -> None:
    frames = [
        generate_normal(),
        generate_velocity_fraud(),
        generate_coercion_cluster(),
        generate_bot_registration(),
        generate_geographic_surge(),
    ]
    df = pd.concat(frames, ignore_index=True).sample(frac=1, random_state=42)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    csv_out = OUT.with_suffix(".csv")
    df.to_csv(csv_out, index=False)

    total = len(df)
    normals = (df["label"] == "normal").sum()
    anomalies = total - normals
    print(f"Generated {total} samples: {normals} normal, {anomalies} anomalous")
    print(f"Saved to {csv_out}")
    print(df.describe().to_string())


if __name__ == "__main__":
    main()
