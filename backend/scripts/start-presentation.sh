#!/usr/bin/env bash
# =============================================================================
# VeriVote Kenya — Presentation Startup Script
# =============================================================================
# Starts the full stack in sandbox / testnet mode:
#   1. Hardhat local blockchain node (http://localhost:8545)
#   2. Smart contract deployment (deterministic addresses)
#   3. Database migrations
#   4. Backend API server
#
# Usage (from repo root):
#   bash backend/scripts/start-presentation.sh
#
# For Persona webhooks via ngrok, run in a separate terminal:
#   ngrok http 3005
#   → copy the HTTPS URL → paste into Persona dashboard as webhook endpoint
#
# Prerequisites:
#   - Node.js + pnpm installed
#   - PostgreSQL running on localhost:5432
#   - All credentials filled in backend/.env  (see .env.example)
# =============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="$ROOT/backend"
CONTRACTS="$ROOT/smart-contracts"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log()   { echo -e "${BLUE}[VeriVote]${NC} $*"; }
ok()    { echo -e "${GREEN}  ✓${NC} $*"; }
warn()  { echo -e "${YELLOW}  !${NC} $*"; }
die()   { echo -e "${RED}  ✗ $*${NC}"; exit 1; }

# ── 0. Load and validate .env ─────────────────────────────────────────────────

cd "$BACKEND"

if [[ ! -f .env ]]; then
  die ".env not found. Copy .env.example → .env and fill in your credentials."
fi

# Export vars for this script (without overwriting existing env)
set -a
source .env
set +a

MISSING=()

[[ "${AT_API_KEY:-}" == "your-at-api-key" || -z "${AT_API_KEY:-}" ]] && \
  MISSING+=("AT_API_KEY       — get from africastalking.com (Sandbox > Settings > API Key)")

[[ "${AT_USERNAME:-}" == "your-username" || -z "${AT_USERNAME:-}" ]] && \
  MISSING+=("AT_USERNAME      — set to 'sandbox' for Africa's Talking sandbox")

[[ "${PERSONA_API_KEY:-}" == "persona_sandbox_xxx" || -z "${PERSONA_API_KEY:-}" ]] && \
  MISSING+=("PERSONA_API_KEY      — get from withpersona.com (Sandbox > API Keys)")

[[ "${PERSONA_TEMPLATE_ID:-}" == "itmpl_xxx" || -z "${PERSONA_TEMPLATE_ID:-}" ]] && \
  MISSING+=("PERSONA_TEMPLATE_ID  — get from Persona dashboard (Templates)")

[[ "${PERSONA_WEBHOOK_SECRET:-}" == "wbhsec_xxx" || -z "${PERSONA_WEBHOOK_SECRET:-}" ]] && \
  MISSING+=("PERSONA_WEBHOOK_SECRET — Persona dashboard → Webhooks → signing secret")

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo ""
  echo -e "${RED}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  Missing credentials in backend/.env                     ║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════════════════╝${NC}"
  for m in "${MISSING[@]}"; do
    echo "   → $m"
  done
  echo ""
  echo "  Fill these in then re-run this script."
  echo "  See backend/.env.example for full instructions."
  echo ""
  exit 1
fi

if [[ "${SMTP_HOST:-}" == "smtp.placeholder.com" || -z "${SMTP_HOST:-}" ]]; then
  warn "SMTP not configured — email OTPs will fail. SMS will still work."
fi

# Confirm mocks are off
if [[ "${BLOCKCHAIN_MOCK:-}" == "true" ]]; then
  die "BLOCKCHAIN_MOCK=true in .env — set it to false for the presentation."
fi
if [[ "${NOTIFICATION_MOCK:-}" == "true" ]]; then
  die "NOTIFICATION_MOCK=true in .env — set it to false for the presentation."
fi
if [[ "${PERSONA_MOCK:-}" == "true" ]]; then
  die "PERSONA_MOCK=true in .env — set it to false for the presentation."
fi

ok "Credentials validated"

# ── 1. Start Hardhat node ──────────────────────────────────────────────────────

log "Starting Hardhat local blockchain node on http://localhost:8545 ..."

cd "$CONTRACTS"

# Kill stale node on 8545 (Windows-compatible via netstat)
STALE_PID=$(netstat -ano 2>/dev/null | grep ":8545 " | awk '{print $NF}' | head -1 || true)
if [[ -n "$STALE_PID" && "$STALE_PID" != "0" ]]; then
  warn "Killing stale process on port 8545 (PID $STALE_PID)"
  powershell -command "Stop-Process -Id $STALE_PID -Force" 2>/dev/null || true
  sleep 2
fi

npx hardhat node > /tmp/hardhat-node.log 2>&1 &
HARDHAT_PID=$!
echo "$HARDHAT_PID" > /tmp/hardhat.pid

# Wait up to 15 s for node to respond
READY=0
for i in $(seq 1 15); do
  if curl -sf -X POST http://127.0.0.1:8545 \
      -H 'Content-Type: application/json' \
      -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
      > /dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

[[ $READY -eq 1 ]] || die "Hardhat node failed to start. Check /tmp/hardhat-node.log"
ok "Hardhat node running (PID $HARDHAT_PID)"

# ── 2. Deploy smart contracts ──────────────────────────────────────────────────

log "Deploying SoulBoundToken + VoteRecording to local testnet..."
npx hardhat run scripts/deploy.ts --network localhost 2>&1 | grep -E "Deploying|deployed|Saving|saved" || true
ok "Contracts at deterministic addresses:
     SBT:  ${SBT_CONTRACT_ADDRESS}
     Vote: ${VOTE_CONTRACT_ADDRESS}"

# ── 3. Database migrations ─────────────────────────────────────────────────────

cd "$BACKEND"
log "Applying database migrations..."
pnpm exec prisma migrate deploy 2>&1 | grep -E "migrat|applied|up to date" | head -5 || true
ok "Database up to date"

# ── 4. Start backend ───────────────────────────────────────────────────────────

log "Starting VeriVote backend..."

# Kill stale backend process
BACKEND_PORT="${PORT:-3005}"
STALE_BACK=$(netstat -ano 2>/dev/null | grep ":${BACKEND_PORT} " | awk '{print $NF}' | head -1 || true)
if [[ -n "$STALE_BACK" && "$STALE_BACK" != "0" ]]; then
  warn "Killing stale backend process on port $BACKEND_PORT (PID $STALE_BACK)"
  powershell -command "Stop-Process -Id $STALE_BACK -Force" 2>/dev/null || true
  sleep 2
fi

pnpm exec tsx src/index.ts > /tmp/backend.log 2>&1 &
BACK_PID=$!

READY=0
for i in $(seq 1 15); do
  if curl -sf "http://localhost:${BACKEND_PORT}/health" > /dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done
[[ $READY -eq 1 ]] || die "Backend failed to start. Check /tmp/backend.log"

# Print final health status
HEALTH=$(curl -s "http://localhost:${BACKEND_PORT}/health")
DB_STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('database','?'))" 2>/dev/null || echo "?")
BC_STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('blockchain','?'))" 2>/dev/null || echo "?")

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       VeriVote Kenya — READY FOR PRESENTATION          ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════╣${NC}"
printf  "${GREEN}║${NC}  %-52s${GREEN}║${NC}\n" "API:        http://localhost:${BACKEND_PORT}"
printf  "${GREEN}║${NC}  %-52s${GREEN}║${NC}\n" "API Docs:   http://localhost:${BACKEND_PORT}/api/docs"
printf  "${GREEN}║${NC}  %-52s${GREEN}║${NC}\n" "Blockchain: http://localhost:8545 (Hardhat testnet)"
echo -e "${GREEN}╠════════════════════════════════════════════════════════╣${NC}"
printf  "${GREEN}║${NC}  %-52s${GREEN}║${NC}\n" "Database:   ${DB_STATUS}"
printf  "${GREEN}║${NC}  %-52s${GREEN}║${NC}\n" "Blockchain: ${BC_STATUS}"
printf  "${GREEN}║${NC}  %-52s${GREEN}║${NC}\n" "Mode:       SANDBOX / TESTNET"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

if [[ "${PERSONA_MOCK:-}" != "true" ]]; then
  echo -e "${YELLOW}  Persona webhooks:${NC}"
  echo "   Run in a separate terminal:  ngrok http ${BACKEND_PORT}"
  echo "   Then paste the HTTPS URL into Persona dashboard:"
  echo "   https://<ngrok-id>.ngrok-free.app/api/voters/persona-webhook"
  echo ""
fi

# Keep running — Ctrl+C stops everything
trap "
  echo ''
  log 'Stopping servers...'
  kill $HARDHAT_PID $BACK_PID 2>/dev/null || true
  exit 0
" INT TERM

wait $BACK_PID
