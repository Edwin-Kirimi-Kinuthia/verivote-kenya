#!/usr/bin/env bash
# =============================================================================
# VeriVote Kenya — New Client Provisioner
#
# Usage:
#   bash scripts/new-client.sh <client-name> [backend-port] [frontend-port]
#
# Examples:
#   bash scripts/new-client.sh acme          # ports auto-allocated from 5500
#   bash scripts/new-client.sh iebc 6000 6001
#
# What this script does:
#   1. Creates clients/<client-name>/.env with unique ports + credentials
#   2. Starts PostgreSQL + Redis containers isolated to this client
#   3. Runs Prisma migrations against the fresh database
#   4. Seeds the admin account (national ID 00000001, password Admin@1234)
#   5. Prints startup instructions for backend + frontend
# =============================================================================

set -euo pipefail

CLIENT="${1:-}"
if [[ -z "$CLIENT" ]]; then
  echo "Usage: bash scripts/new-client.sh <client-name> [backend-port] [frontend-port]"
  exit 1
fi

# Sanitise: lowercase letters/digits/hyphens only
CLIENT=$(echo "$CLIENT" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9-' '-' | sed 's/-$//')
if [[ -z "$CLIENT" ]]; then
  echo "ERROR: client name must contain at least one alphanumeric character."
  exit 1
fi

# ── Port allocation ───────────────────────────────────────────────────────────
# Each client needs: DB_PORT, REDIS_PORT, BACKEND_PORT, FRONTEND_PORT
# Default base: 5500 (add 10 per client slot, determined by existing dirs)

EXISTING=$(ls -d clients/*/  2>/dev/null | wc -l)
BASE_PORT=$((5500 + EXISTING * 10))

BACKEND_PORT="${2:-$BASE_PORT}"
FRONTEND_PORT="${3:-$((BASE_PORT + 1))}"
DB_PORT="$((BASE_PORT + 2))"
REDIS_PORT="$((BASE_PORT + 3))"

# ── Client directory ──────────────────────────────────────────────────────────
CLIENT_DIR="clients/$CLIENT"
if [[ -d "$CLIENT_DIR" ]]; then
  echo "Client '$CLIENT' already exists at $CLIENT_DIR"
  echo "To restart: docker compose -p verivote-$CLIENT -f docker-compose.client.yml up -d"
  exit 0
fi
mkdir -p "$CLIENT_DIR"

# ── Generate secrets ──────────────────────────────────────────────────────────
DB_PASS=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 64)
ELGAMAL_KEY=$(openssl rand -hex 64)

# ── Write .env ────────────────────────────────────────────────────────────────
cat > "$CLIENT_DIR/.env" <<EOF
# VeriVote Kenya — Client: $CLIENT
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# DO NOT commit this file.

CLIENT_NAME=$CLIENT
NODE_ENV=production
PORT=$BACKEND_PORT
FRONTEND_URL=http://localhost:$FRONTEND_PORT

# PostgreSQL
DB_HOST=localhost
DB_PORT=$DB_PORT
DB_NAME=verivote_${CLIENT//-/_}
DB_USER=verivote_${CLIENT//-/_}
DB_PASSWORD=$DB_PASS
DATABASE_URL=postgresql://verivote_${CLIENT//-/_}:$DB_PASS@localhost:$DB_PORT/verivote_${CLIENT//-/_}

# Redis
REDIS_HOST=localhost
REDIS_PORT=$REDIS_PORT
REDIS_URL=redis://localhost:$REDIS_PORT

# JWT
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=24h

# ElGamal
ELGAMAL_PRIVATE_KEY=$ELGAMAL_KEY

# Blockchain — Hardhat local testnet (start separately with pnpm contracts:node)
BLOCKCHAIN_MOCK=false
BLOCKCHAIN_NETWORK=localhost
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
SBT_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
VOTE_CONTRACT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

# KYC (copy your Persona sandbox credentials)
PERSONA_MOCK=true
PERSONA_API_KEY=
PERSONA_TEMPLATE_ID=
PERSONA_WEBHOOK_SECRET=

# SMS (copy your Africa's Talking sandbox credentials)
NOTIFICATION_MOCK=true
AT_API_KEY=
AT_USERNAME=sandbox

# Email (copy your Mailtrap credentials)
MAILTRAP_TOKEN=
MAILTRAP_INBOX_ID=

# WebAuthn
RP_ID=localhost
RP_NAME=VeriVote Kenya — $CLIENT

# AI
AI_INTERNAL_KEY=verivote-ai-internal-key-$CLIENT

# Voting window (leave blank = always open)
ELECTION_VOTING_OPENS_AT=
ELECTION_VOTING_CLOSES_AT=
DISTRESS_ALERT_PHONE=
DISTRESS_ALERT_EMAIL=
EOF

echo "✓ Created $CLIENT_DIR/.env"

# ── Start containers ──────────────────────────────────────────────────────────
echo ""
echo "Starting Docker containers for client '$CLIENT'..."
CLIENT_NAME="$CLIENT" \
DB_PASSWORD="$DB_PASS" \
DB_PORT="$DB_PORT" \
REDIS_PORT="$REDIS_PORT" \
docker compose -p "verivote-$CLIENT" -f docker-compose.client.yml up -d

echo "✓ Containers started (postgres :$DB_PORT, redis :$REDIS_PORT)"

# Wait for Postgres to be ready
echo "Waiting for PostgreSQL to be ready..."
for i in $(seq 1 20); do
  if docker exec "verivote-${CLIENT}-postgres" pg_isready -U "verivote_${CLIENT//-/_}" -d "verivote_${CLIENT//-/_}" > /dev/null 2>&1; then
    echo "✓ PostgreSQL ready"
    break
  fi
  if [[ $i -eq 20 ]]; then
    echo "ERROR: PostgreSQL did not become ready in time."
    exit 1
  fi
  sleep 2
done

# ── Run migrations ────────────────────────────────────────────────────────────
echo ""
echo "Running Prisma migrations..."
cd backend
DATABASE_URL="postgresql://verivote_${CLIENT//-/_}:$DB_PASS@localhost:$DB_PORT/verivote_${CLIENT//-/_}" \
  npx prisma migrate deploy
echo "✓ Database schema applied"

# ── Seed admin account ────────────────────────────────────────────────────────
echo ""
echo "Seeding admin account (national ID: 00000001, password: Admin@1234)..."
DATABASE_URL="postgresql://verivote_${CLIENT//-/_}:$DB_PASS@localhost:$DB_PORT/verivote_${CLIENT//-/_}" \
  npx tsx prisma/seed.ts 2>&1 | tail -5
echo "✓ Admin seeded"
cd ..

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  CLIENT: $CLIENT"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Database:  localhost:$DB_PORT"
echo "  Redis:     localhost:$REDIS_PORT"
echo ""
echo "  To start the backend:"
echo "    cd backend && cp ../clients/$CLIENT/.env .env && npx tsx src/index.ts"
echo ""
echo "  To start the frontend (port $FRONTEND_PORT):"
echo "    cd frontend && NEXT_PUBLIC_API_URL=http://localhost:$BACKEND_PORT pnpm dev -p $FRONTEND_PORT"
echo ""
echo "  Admin login:"
echo "    National ID: 00000001"
echo "    Password:    Admin@1234"
echo ""
echo "  Config saved to: $CLIENT_DIR/.env"
echo "═══════════════════════════════════════════════════════"
