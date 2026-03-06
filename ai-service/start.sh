#!/usr/bin/env bash
# VeriVote AI Service — startup script
# Run from: ai-service/
set -e

# Train model if artefacts missing
if [ ! -f models/isolation_forest.joblib ]; then
  echo "Training model for first run..."
  python training/generate_data.py
  python training/train_model.py
fi

echo "Starting VeriVote AI Service on port 8000..."
echo "Sovereignty: all inference on-premise — no external API calls"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
