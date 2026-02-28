# VeriVote Kenya — Milestone Testing Guide
### Weeks 1 – 4 (Infrastructure → Voting → Verification)

---

## What Has Been Built

| Week | Theme | Key Deliverables |
|------|-------|-----------------|
| 1 | Backend Infrastructure | PostgreSQL schema, Prisma ORM, seed data, Hardhat blockchain, SBT + VoteRecording contracts, blockchain service |
| 2 | Auth & Admin Panel | Persona KYC, JWT auth, rate limiting, PIN reset flow, full Next.js admin dashboard (register, approve, reject, appointments, PIN resets) |
| 3 | Voter-Facing Voting | Login page (`/vote`), ballot UI, review page, receipt page with print support, revoting (supersede chain) |
| 4 | Encryption & Verification | ElGamal vote encryption, vote hash integrity check, `GET /api/votes/verify/:serial`, `/verify` web page, bilingual UI (EN/SW), printable verification receipt |

---

## Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 8.0.0
- **Docker Desktop** running
- **Git**

---

## One-Time Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start PostgreSQL + Redis

```bash
pnpm docker:up
```

Starts two containers:
- PostgreSQL 16 on `localhost:5432` (database: `verivote_dev`)
- Redis 7 on `localhost:6379`

Verify:

```bash
docker compose ps
```

### 3. Configure Environment

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and make these two changes:

**a) Fix the CORS origin** — the frontend runs on port 3001, not 5173:

```
FRONTEND_URL=http://localhost:3001
```

**b) Generate the ElGamal encryption key** (required for vote casting):

```bash
node backend/scripts/generate-elgamal-keys.js
```

Copy the printed private key value and paste it into `.env`:

```
ELGAMAL_PRIVATE_KEY=<paste value here>
```

> Without this key the backend will refuse to start with an error about missing `ELGAMAL_PRIVATE_KEY`.

### 4. Run Database Migrations

```bash
cd backend
npx prisma generate
npx prisma migrate deploy
```

### 5. Seed the Database

```bash
cd backend
pnpm db:seed
```

What gets created:

| Data | Count | Notes |
|------|-------|-------|
| Polling stations | 10 | Real Kenyan locations (Nairobi, Mombasa, Kisumu, Nakuru, Eldoret, Kiambu, Meru) |
| Test voters | 100 | Random national IDs; **PINs are not testable** (fake hashes) |
| Admin user | 1 | National ID `00000001`, PIN `1234`, Distress PIN `5678` |
| Sample votes | 30 | Mix of CONFIRMED, PENDING, SUPERSEDED |
| Print queue items | 20 | Mix of statuses |

> **Important:** The 100 seed voters have randomly generated Argon2 hashes — their PINs are unknown and cannot be used to log in. To test the full voter flow, register a new voter through the admin panel, which gives you real PINs.

### 6. Start the Local Blockchain

Open a dedicated terminal (keep it running):

```bash
cd smart-contracts
npx hardhat node
```

This starts a Hardhat local Ethereum node at `http://localhost:8545`.

### 7. Deploy Smart Contracts

In a second terminal:

```bash
cd smart-contracts
npx hardhat run scripts/deploy.ts --network localhost
```

Copy the two addresses printed to console into `backend/.env`:

```
SBT_CONTRACT_ADDRESS=0x...
VOTE_CONTRACT_ADDRESS=0x...
```

### 8. Start the Backend

```bash
cd backend
pnpm dev
```

Expected startup output:
```
✅ Database connected
✅ Blockchain connected
✅ Server running on http://localhost:3000
```

Verify health:
```
GET http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "connected",
  "blockchain": "connected"
}
```

### 9. Start the Frontend

```bash
cd frontend
pnpm dev
```

The Next.js app starts at `http://localhost:3001`.

### 10. (Optional) Open Prisma Studio

```bash
cd backend
npx prisma studio
```

Browse all tables at `http://localhost:5555`.

---

## Terminal Layout

| Terminal | Directory | Command | Stays Running? |
|----------|-----------|---------|----------------|
| 1 | root | `pnpm docker:up` | Yes |
| 2 | `smart-contracts/` | `npx hardhat node` | Yes |
| 3 | `backend/` | `pnpm dev` | Yes |
| 4 | `frontend/` | `pnpm dev` | Yes |
| 5 | `smart-contracts/` | `npx hardhat run scripts/deploy.ts --network localhost` | One-time |
| 6 | `backend/` | Seed + curl testing | Working terminal |

---

## Service Map

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:3001 | All voter/admin pages |
| Backend API | http://localhost:3000 | REST API server |
| Health Check | http://localhost:3000/health | Server + DB + blockchain status |
| System Stats | http://localhost:3000/api/stats | Voter/vote/station counts |
| Prisma Studio | http://localhost:5555 | Live database browser |
| Hardhat Node | http://localhost:8545 | Local Ethereum blockchain |
| PostgreSQL | localhost:5432 | Primary database |
| Redis | localhost:6379 | Rate limiting store |

---

## Test Credentials

### Admin (IEBC Officer)

| Field | Value |
|-------|-------|
| National ID | `00000001` |
| PIN | `1234` |
| Distress PIN | `5678` |
| Role | ADMIN |

### Test Voter (register one through admin panel)

Register a new voter via the admin panel at `/admin/register` to get a real PIN pair for the voter-facing flow. The 100 seeded voters have unknown PINs and cannot be used to log in.

---

## Testing Scenarios

### Scenario 1 — Admin Login

1. Navigate to `http://localhost:3001/admin`
2. Enter National ID `00000001` and PIN `1234`
3. Confirm you land on the dashboard showing stats cards and recent registrations

**Distress PIN test:** Log in with PIN `5678`. The login appears identical from the outside. Check the database (`Prisma Studio → voters`) to confirm `status` is now `DISTRESS_FLAGGED`.

---

### Scenario 2 — Register a New Voter

1. Admin panel → Sidebar → **Register Voter**
2. Enter any 8-digit National ID (e.g. `12345678`) and pick a polling station
3. Submit
4. The response box shows:
   - **PIN** — 4-digit normal PIN
   - **Distress PIN** — 4-digit coercion PIN
5. Note these down — you need them for voter login in Scenario 4

> In mock mode (`PERSONA_MOCK=true`, the default), registration completes immediately with PINs. In live mode, it would redirect to Persona for biometric verification.

---

### Scenario 3 — Manual Review Flow

1. Register a voter with a national ID that Persona flags (set `PERSONA_MOCK=false` and use a test ID that fails, or manually set a voter's status to `PENDING_MANUAL_REVIEW` in Prisma Studio)
2. Admin panel → **Reviews** — the voter appears in the pending list
3. **Approve:** Click Approve, add optional notes, submit — PINs are shown
4. **Reject:** Click Reject, enter a rejection reason, submit

---

### Scenario 4 — Cast a Vote (End-to-End Voter Flow)

Using the PIN pair from Scenario 2:

1. Navigate to `http://localhost:3001/vote`
2. Enter the national ID and PIN you registered
3. You land on the **Ballot** page — select one candidate per position
4. Click **Review My Selections** — confirm your choices
5. Click **Confirm & Submit Vote**
6. The **Receipt** page shows:
   - 16-character hexadecimal **serial number** (e.g. `A3F1B2C4D5E60789`)
   - Blockchain transaction hash (or "Pending confirmation" if blockchain is slow)
   - A **"Verify your vote →"** link

> Copy the serial number — you need it for Scenario 5.

**Revote test:** Log in again with the same credentials and cast a different selection. The previous vote will be marked `SUPERSEDED` in the database.

---

### Scenario 5 — Verify a Vote (Web Interface)

1. Navigate to `http://localhost:3001/verify`
   - Or click "Verify" from the home page at `http://localhost:3001`
   - Or click "Verify your vote →" on the receipt page
2. Enter the 16-character serial number from your receipt
   - The input auto-uppercases and strips non-hex characters
   - A character counter shows `16/16` when complete
3. Click **Verify Vote**
4. The result page displays one of three states:

| State | Condition | Display |
|-------|-----------|---------|
| **Vote Verified** (green checkmark) | Hash valid + blockchain confirmed | Serial, status, timestamp, TX hash, blockchain timestamp |
| **Integrity Warning** (red X) | Hash mismatch — data may be altered | Serial + contact IEBC message |
| **Vote Superseded** (amber icon) | Vote was replaced by a newer vote | Serial + "only most recent vote counts" |

5. Click **Print Verification** to print — UI chrome hides, full TX hash shown, generated timestamp printed
6. Click **Verify Another** to check a second serial
7. Switch language toggle (English ↔ Kiswahili) — all labels, statuses, and messages translate

---

### Scenario 6 — Verify a Vote (API)

```bash
# Valid serial — returns full verification result
curl http://localhost:3000/api/votes/verify/A3F1B2C4D5E60789

# Expected response (verified):
# {
#   "success": true,
#   "data": {
#     "verified": true,
#     "serialNumber": "A3F1B2C4D5E60789",
#     "status": "CONFIRMED",
#     "timestamp": "2025-...",
#     "cryptographicVerification": { "hashValid": true, "checkedAt": "..." },
#     "blockchainConfirmation": { "confirmed": true, "txHash": "0x...", ... },
#     "message": "verified"
#   }
# }

# Invalid format — 400 error
curl http://localhost:3000/api/votes/verify/TOOSHORT

# Not found — 404 error
curl http://localhost:3000/api/votes/verify/FFFFFFFFFFFFFFFF
```

> **Note on seeded votes:** The 30 votes from `pnpm db:seed` use the old serial format (`VV-XXXXXX-XXXX`). These will return 400 (invalid format) from the verify endpoint. Only votes cast through the UI or `POST /api/votes/cast` produce 16-char hex serials that are verifiable.

---

### Scenario 7 — Legacy Receipt Lookup (API only)

```bash
# Simpler endpoint — returns status and TX hash only, no crypto verification
curl http://localhost:3000/api/receipts/A3F1B2C4D5E60789
```

---

### Scenario 8 — PIN Reset Flow

1. Voter goes to `http://localhost:3001/vote`
2. Clicks **Forgot your PIN?** below the login form
3. Enters their National ID and submits the reset request
4. Chooses verification method:
   - **Online** — Persona biometric (mock mode completes immediately)
   - **In Person** — shown the steps to visit an IEBC office

**Admin side:**
1. Admin panel → **PIN Resets** — the request appears
2. Click **Verify & Reset**, enter your officer ID, optional notes, submit
3. New PIN + Distress PIN are shown — give to voter

---

### Scenario 9 — Appointment Scheduling

1. Admin panel → **Appointments**
2. **Create Slots:** Select a polling station, date, start/end hour, slot duration (e.g. 30 min) → Submit
3. Slots appear in the Scheduled Appointments table
4. **Complete / No-Show:** Click the action on a booked appointment row

API test (get available slots):
```bash
curl "http://localhost:3000/api/appointments/available?pollingStationId=<id>"
```

---

### Scenario 10 — Run Tests

**Smart contract tests:**
```bash
cd smart-contracts
npx hardhat test
```

**Backend unit tests:**
```bash
cd backend
pnpm test
```

**Backend test coverage:**
```bash
cd backend
pnpm test --coverage
```

---

## Complete API Reference

### Public Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Server, DB, and blockchain status |
| GET | `/api/stats` | System-wide counts and breakdowns |
| GET | `/api/polling-stations` | List stations (`?county=Nairobi&page=1&limit=20`) |
| GET | `/api/counties` | List all counties |
| POST | `/api/voters/register` | Register a new voter (triggers Persona or mock) |
| POST | `/api/voters/verify-pin` | Authenticate with National ID + PIN → JWT |
| POST | `/api/voters/request-manual-review` | Request IEBC manual verification |
| GET | `/api/voters/registration-status/:inquiryId` | Check Persona inquiry status |
| GET | `/api/votes/verify/:serial` | **Full cryptographic + blockchain verification** |
| GET | `/api/receipts/:serial` | Legacy receipt lookup (status + TX hash only) |
| GET | `/api/appointments/available` | Browse open appointment slots |
| GET | `/api/appointments/nearby` | Slots near GPS coordinates |
| GET | `/api/appointments/near-me` | Slots near voter's assigned station |
| POST | `/api/appointments/:id/book` | Book an appointment |
| DELETE | `/api/appointments/my-booking` | Cancel voter's booking |
| GET | `/api/appointments/my-booking` | View current booking |
| POST | `/api/pin-reset/request` | Request PIN reset |
| POST | `/api/pin-reset/cancel` | Cancel PIN reset request |
| GET | `/api/pin-reset/status` | Check PIN reset status |

### Authenticated Endpoints (Bearer JWT Required)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/votes/cast` | Cast a vote (ballot selections + polling station ID) |
| GET | `/api/voters/:id/status` | Get voter status (own record only) |
| GET | `/api/admin/pending-reviews` | List voters pending manual review |
| GET | `/api/admin/review-stats` | Counts of pending/approved/rejected |
| GET | `/api/admin/review/:voterId` | Full details for one voter under review |
| POST | `/api/admin/approve/:voterId` | Approve voter (mints SBT, generates PINs) |
| POST | `/api/admin/reject/:voterId` | Reject voter with required reason |
| POST | `/api/appointments/create-slots` | Create appointment slots at a station |
| GET | `/api/appointments/scheduled` | View all booked appointments |
| POST | `/api/appointments/:id/complete` | Mark appointment completed |
| POST | `/api/appointments/:id/no-show` | Mark voter as no-show |
| DELETE | `/api/appointments/slots` | Delete slots in a date range |
| GET | `/api/pin-reset/pending` | List pending PIN reset requests |
| POST | `/api/pin-reset/verify/:voterId` | Complete in-person PIN reset |
| POST | `/api/blockchain/mint-sbt` | Mint a Soul-Bound Token |
| POST | `/api/blockchain/record-vote` | Record vote hash on blockchain |
| GET | `/api/blockchain/verify-vote/:serialNumber` | Blockchain-only vote check |

### Cast Vote Request Body

```json
{
  "selections": {
    "president": "candidate-id-here",
    "governor": "candidate-id-here"
  },
  "pollingStationId": "uuid-optional"
}
```

Authorization header:
```
Authorization: Bearer <jwt-token>
```

---

## Frontend Pages

| URL | Access | Description |
|-----|--------|-------------|
| `http://localhost:3001/` | Public | Home — Vote / Verify / Admin cards |
| `http://localhost:3001/verify` | Public | Vote verification — enter serial, see result, print |
| `http://localhost:3001/vote` | Public | Voter login (National ID + PIN) |
| `http://localhost:3001/vote/ballot` | Authenticated voter | Candidate selection |
| `http://localhost:3001/vote/review` | Authenticated voter | Review selections before submit |
| `http://localhost:3001/vote/receipt` | Authenticated voter | Serial + TX hash + verify link |
| `http://localhost:3001/admin/login` | Public | Admin login |
| `http://localhost:3001/admin` | Admin | Dashboard — stat cards + recent registrations |
| `http://localhost:3001/admin/register` | Admin | Register a new voter |
| `http://localhost:3001/admin/voters` | Admin | Paginated voter list |
| `http://localhost:3001/admin/voters/:id` | Admin | Voter detail — status, SBT, history |
| `http://localhost:3001/admin/reviews` | Admin | Approve / reject pending reviews |
| `http://localhost:3001/admin/appointments` | Admin | Create slots, view bookings, mark outcomes |
| `http://localhost:3001/admin/pin-resets` | Admin | Verify and complete PIN reset requests |

---

## Rate Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Global (all routes) | 100 requests | 15 min per IP |
| Auth (`/api/voters/verify-pin`) | 5 requests | 15 min per IP + National ID |
| Registration | 10 requests | 15 min per IP |
| Vote casting | 5 requests | 15 min per IP |
| Vote / receipt verification | 20 requests | 15 min per IP |
| Admin routes | 200 requests | 15 min per IP |

---

## Security Features

| Feature | Implementation |
|---------|---------------|
| Vote data encryption | ElGamal (2048-bit FFDHE, RFC 7919 group) — same plaintext encrypts differently each time |
| Integrity check | SHA-256 hash of ciphertext stored alongside; verify recomputes and compares |
| PIN hashing | Argon2id (memory-hard, GPU-resistant) |
| Distress PIN | Identical login experience; silently flags voter as `DISTRESS_FLAGGED` in DB and JWT |
| JWT authentication | 24-hour expiry, role embedded in payload |
| Blockchain anchoring | Vote hash + serial recorded on Ethereum; non-fatal if blockchain unavailable |
| Soul-Bound Tokens | ERC721 with blocked transfers/approvals — one identity per voter |
| Revoting | Previous vote marked `SUPERSEDED`, new vote created with `previousVoteId` link — full audit chain |
| Ballot secrecy | Encrypted data is unintelligible without the private key; verification confirms recording without revealing choices |

---

## Project Structure

```
verivote-kenya/
├── backend/                        # Express.js API (TypeScript)
│   ├── src/
│   │   ├── index.ts                # Server entry point + route registration
│   │   ├── database/               # Prisma client
│   │   ├── repositories/           # Data access (CRUD + pagination)
│   │   │   ├── base.repository.ts
│   │   │   ├── voter.repository.ts
│   │   │   ├── vote.repository.ts
│   │   │   ├── polling-station.repository.ts
│   │   │   └── print-queue.repository.ts
│   │   ├── services/               # Business logic
│   │   │   ├── vote.service.ts     # Cast vote, verify vote (crypto + blockchain)
│   │   │   ├── encryption.service.ts  # ElGamal encrypt/decrypt + SHA-256 hash
│   │   │   ├── blockchain.service.ts  # ethers.js — SBT, recordVote, getVoteRecord
│   │   │   ├── voter.service.ts    # Registration, PIN verification, JWT
│   │   │   ├── admin.service.ts    # Approve/reject manual reviews
│   │   │   ├── persona.service.ts  # KYC integration (mock or live)
│   │   │   ├── pin-reset.service.ts
│   │   │   ├── appointment.service.ts
│   │   │   └── auth.service.ts
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts  # requireAuth, requireSelf
│   │   │   └── rate-limit.middleware.ts
│   │   ├── routes/
│   │   │   ├── vote.routes.ts      # POST /cast, GET /verify/:serial
│   │   │   ├── receipt.routes.ts   # GET /receipts/:serial (legacy)
│   │   │   ├── voter.routes.ts
│   │   │   ├── admin.routes.ts
│   │   │   ├── appointment.routes.ts
│   │   │   ├── pin-reset.routes.ts
│   │   │   └── blockchain.routes.ts
│   │   └── types/
│   │       ├── database.types.ts   # All shared types incl. VerifyVoteResult
│   │       └── auth.types.ts       # JwtPayload, AuthenticatedRequest
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/
│   ├── scripts/
│   │   └── generate-elgamal-keys.js
│   └── jest.config.ts
├── smart-contracts/                # Hardhat + Solidity 0.8.24
│   ├── contracts/
│   │   ├── SoulBoundToken.sol      # ERC721 non-transferable voter identity
│   │   └── VoteRecording.sol       # On-chain vote hash + serial registry
│   ├── scripts/deploy.ts
│   ├── test/
│   └── hardhat.config.ts
├── frontend/                       # Next.js 15, React 19, Tailwind CSS 4
│   └── src/
│       ├── app/
│       │   ├── page.tsx            # Home — Vote / Verify / Admin cards
│       │   ├── verify/page.tsx     # Serial lookup + result + print
│       │   ├── vote/               # Login, ballot, review, receipt
│       │   └── admin/              # Login + full dashboard
│       ├── components/             # DataTable, StatusBadge, Pagination, etc.
│       ├── contexts/               # AuthContext, LanguageContext (i18n)
│       └── lib/
│           ├── api-client.ts       # Fetch wrapper with JWT injection
│           ├── types.ts            # VerifyVoteResult, VoteReceipt, etc.
│           └── i18n/
│               ├── en.json         # English — all feature namespaces
│               └── sw.json         # Kiswahili — all feature namespaces
├── docs/
├── docker-compose.yml
└── pnpm-workspace.yaml
```

---

## Useful Commands

| Command | Directory | Description |
|---------|-----------|-------------|
| `pnpm install` | root | Install all workspace dependencies |
| `pnpm docker:up` | root | Start PostgreSQL + Redis |
| `pnpm docker:down` | root | Stop containers |
| `pnpm docker:logs` | root | View container logs |
| `pnpm db:migrate` | `backend/` | Run pending migrations |
| `pnpm db:seed` | `backend/` | Seed database (clears existing data first) |
| `npx prisma studio` | `backend/` | Open database GUI at port 5555 |
| `npx prisma generate` | `backend/` | Regenerate Prisma client after schema changes |
| `node scripts/generate-elgamal-keys.js` | `backend/` | Generate ElGamal key pair |
| `npx hardhat node` | `smart-contracts/` | Start local blockchain (keep terminal open) |
| `npx hardhat run scripts/deploy.ts --network localhost` | `smart-contracts/` | Deploy contracts |
| `npx hardhat test` | `smart-contracts/` | Run Solidity contract tests |
| `pnpm dev` | `backend/` | Start backend with hot-reload |
| `pnpm dev` | `frontend/` | Start frontend dev server |
| `pnpm test` | `backend/` | Run Jest unit tests |
| `pnpm test --coverage` | `backend/` | Tests + coverage report |
| `npx next build` | `frontend/` | Production build check |

---

## Startup Order

```
Docker (PostgreSQL + Redis)
  └─> Prisma migrate + seed (backend/)
        └─> Hardhat node (smart-contracts/)
              └─> Deploy contracts → copy addresses to .env
                    └─> Start backend (backend/ pnpm dev)
                          └─> Start frontend (frontend/ pnpm dev)
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Backend fails to start: "ELGAMAL_PRIVATE_KEY not set" | Missing env var | Run `node scripts/generate-elgamal-keys.js` and paste key into `.env` |
| Vote casting returns 500 | ElGamal key set but wrong format | Regenerate the key; must be a valid hex string |
| Verify endpoint returns 400 for seeded serial | Seed uses old `VV-XXX` format | Only serials from `POST /api/votes/cast` are 16-char hex — cast a vote first |
| CORS errors in browser | `FRONTEND_URL` still set to 5173 | Change to `http://localhost:3001` in `backend/.env` and restart backend |
| "Blockchain not available" warning on startup | Hardhat node not running | Start `npx hardhat node` first, then redeploy contracts |
| Blockchain confirmation shows "Pending" | Blockchain connected but slow | Normal — vote is still stored in DB and cryptographically verified |
| Rate limit hit (429) | Too many requests | Wait 15 minutes or restart Redis (`docker compose restart redis`) |
| Admin login fails with known credentials | Database not seeded | Run `pnpm db:seed` from `backend/` |
| Prisma Studio won't open | Port 5555 in use | Kill the process using that port or specify `--port 5556` |
