#!/usr/bin/env bash
# VeriVote AI Service — startup script
# Run from: ai-service/
set -e

# Load .env if present
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Train model if artefacts missing
if [ ! -f models/isolation_forest.joblib ]; then
  echo "Training model for first run..."
  python training/generate_data.py
  python training/train_model.py
fi

echo "Starting VeriVote AI Service on port 8000..."
echo "  Backend: ${BACKEND_URL:-http://localhost:3005}"
echo "  Monitoring key configured: $([ -n "$AI_INTERNAL_KEY" ] && echo YES || echo NO)"
echo "  Sovereignty: all inference on-premise — no external API calls"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
