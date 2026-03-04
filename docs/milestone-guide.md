# VeriVote Kenya — Milestone Testing Guide
### Weeks 1 – 8 (Infrastructure → Voting → Verification → Auth & KYC)

---

## What Has Been Built

| Week | Theme | Key Deliverables |
|------|-------|-----------------|
| 1 | Backend Infrastructure | PostgreSQL schema, Prisma ORM, seed data, Hardhat blockchain, SBT + VoteRecording contracts, blockchain service |
| 2 | Auth & Admin Panel | Persona KYC, JWT auth, rate limiting, PIN reset flow, full Next.js admin dashboard (register, approve, reject, appointments, PIN resets) |
| 3 | Voter-Facing Voting | Login page (`/vote`), ballot UI, review page, receipt page with print support, revoting (supersede chain) |
| 4 | Encryption & Verification | ElGamal vote encryption, vote hash integrity check, `GET /api/votes/verify/:serial`, `/verify` web page, bilingual UI (EN/SW), printable verification receipt |
| 5 | Hybrid PIN System | Voter-chosen normal PIN + server-generated distress PIN; both stored as Argon2id hashes; distress detection is silent (`isDistressFlagged`) |
| 6 | Password Auth + OTP Login | Password-based voter registration at `/register`; OTP login via Africa's Talking (SMS) or email; setup JWT for post-KYC enrollment |
| 7 | WebAuthn Biometric Login | Fingerprint / Windows Hello enrollment during registration; biometric login tab on `/vote` using `@simplewebauthn/browser` |
| 8 | KYC & UX Improvements | Persona inline iframe (same page, no new tab), 3-attempt tracking, postMessage auto-advance; all-countries phone dropdown with flag emojis; real-time password match feedback; "Forgot password" button |

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

Open `backend/.env` and make these changes:

**a) Frontend URL** — already set correctly, but confirm it reads:

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

**c) Africa's Talking SMS sandbox** (OTP delivery):

```
AT_USERNAME=sandbox
AT_API_KEY=<your AT sandbox API key>
NOTIFICATION_MOCK=false
```

OTPs are always printed to the backend console regardless of the sandbox setting — watch the terminal for the code during testing.

**d) Email (optional sandbox)** — emails fall back to the backend console in development. To see emails in a web inbox, sign up at [mailtrap.io](https://mailtrap.io) and set:

```
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=<mailtrap username>
SMTP_PASS=<mailtrap password>
```

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
| Test voters | 100 | Random national IDs; PINs and passwords unknown — cannot log in |
| Admin user | 1 | National ID `00000001`, password `Admin@1234`, role ADMIN |
| Sample votes | 30 | Mix of CONFIRMED, PENDING, SUPERSEDED |
| Print queue items | 20 | Mix of statuses |

> **Important:** The 100 seed voters have randomly generated hashes — their credentials are unknown. To test the full voter flow, self-register at `/register` or use the admin panel at `/admin/register`.

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
✅ Server running on http://localhost:3005
```

Verify health:
```
GET http://localhost:3005/health
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
| Backend API | http://localhost:3005 | REST API server |
| Health Check | http://localhost:3005/health | Server + DB + blockchain status |
| System Stats | http://localhost:3005/api/stats | Voter/vote/station counts |
| AT SMS Simulator | https://simulator.africastalking.com | View incoming OTP SMS messages |
| Swagger API Docs | http://localhost:3005/api/docs | Interactive API documentation |
| Prisma Studio | http://localhost:5555 | Live database browser |
| Hardhat Node | http://localhost:8545 | Local Ethereum blockchain |
| PostgreSQL | localhost:5432 | Primary database |
| Redis | localhost:6379 | Rate limiting + OTP store |

---

## Test Credentials

### Admin (IEBC Officer)

| Field | Value |
|-------|-------|
| National ID | `00000001` |
| Password | `Admin@1234` |
| Role | ADMIN |

### Test Voter — Self-Registration Flow

The recommended way to test is to self-register:

1. Navigate to `http://localhost:3001/register`
2. Fill in an 8-digit National ID, preferred contact (Email or SMS), and a strong password
3. Complete OTP verification (check backend console or AT Simulator / Mailtrap for the code)
4. Complete Persona KYC in the inline iframe (sandbox auto-approves)
5. Optionally enroll fingerprint / Windows Hello
6. Set your 4-digit voting PIN
7. Your distress PIN is sent to your registered contact — note it down

You can then log in at `http://localhost:3001/vote` using any of:
- **Password tab** — National ID + password
- **One-Time Code tab** — National ID → OTP sent to your contact
- **Fingerprint tab** — National ID → Windows Hello / device biometric prompt

### Admin-Created Voter (Legacy)

Register a voter via `/admin/register` for a simpler flow (no self-registration steps). After approval, the voter's credentials are shown in the admin panel.

---

## Testing Scenarios

### Scenario 1 — Admin Login

1. Navigate to `http://localhost:3001/admin`
2. Enter National ID `00000001` and password `Admin@1234`
3. Confirm you land on the dashboard showing stats cards and recent registrations

---

### Scenario 2 — Self-Register a Voter (Full KYC Flow)

This is the primary voter-facing registration flow.

1. Navigate to `http://localhost:3001/register`
2. Enter an 8-digit National ID (e.g. `87654321`)
3. Optionally select a polling station
4. Choose contact preference: **Email** or **SMS**
   - Email: enter a valid address
   - SMS: select country flag + dial code from the dropdown (all countries available), enter local number
5. Create a strong password (min 8 chars, uppercase, lowercase, number, special char — no sequential patterns like "abcd")
6. Confirm password — live "Passwords match / Passwords do not match" feedback appears
7. Submit → OTP is sent to your contact
8. Enter the 6-digit code (check backend console or AT Simulator / Mailtrap)
9. Choose **Online KYC** — Persona verification loads in an inline iframe on the same page
   - The sandbox flow auto-completes; the page advances automatically when approved
   - If verification fails, you have up to 3 attempts before falling back to in-person booking
10. **Fingerprint setup** (optional) — click "Enroll Fingerprint / Windows Hello" to register your device biometric, or "Skip for now"
11. **Set your PIN** — choose a 4-digit normal PIN (must be unique, non-sequential, non-repeating)
12. Registration complete — your **distress PIN** is sent to your registered contact

---

### Scenario 3 — Manual Review Flow

1. During registration, choose **In-Person Appointment** instead of Online KYC
2. Book an appointment slot — choose date and time
3. Admin panel → **Reviews** — the voter appears in the pending list
4. **Approve:** Click Approve, add optional notes, submit
5. **Reject:** Click Reject, enter a rejection reason, submit

---

### Scenario 4 — Log In and Cast a Vote

Using credentials from Scenario 2:

**Option A — Password Login:**
1. Navigate to `http://localhost:3001/vote`
2. Enter National ID and password → Sign In

**Option B — OTP Login:**
1. Click the **One-Time Code** tab
2. Enter National ID → Send Code
3. Enter the 6-digit code sent to your contact

**Option C — Fingerprint Login** (requires enrollment in Scenario 2):
1. Click the **Fingerprint** tab
2. Enter National ID → click "Sign In with Fingerprint / Windows Hello"
3. Device biometric prompt appears — authenticate

After login:
1. You land on the **Ballot** page — select one candidate per position
2. Click **Review My Selections** — confirm your choices
3. Click **Confirm & Submit Vote**
4. Enter your **4-digit PIN** when prompted
5. The **Receipt** page shows:
   - 16-character hexadecimal **serial number** (e.g. `A3F1B2C4D5E60789`)
   - Blockchain transaction hash (or "Pending confirmation" if blockchain is slow)
   - A **"Verify your vote →"** link

> Copy the serial number — you need it for Scenario 5.

**Revote test:** Log in again with the same credentials and cast a different selection. The previous vote is marked `SUPERSEDED` in the database.

**Distress PIN test:** At the PIN prompt during voting, enter your distress PIN instead. The vote appears successful from the outside, but the vote record is silently marked `isDistressFlagged = true` in the database.

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
curl http://localhost:3005/api/votes/verify/A3F1B2C4D5E60789

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
curl http://localhost:3005/api/votes/verify/TOOSHORT

# Not found — 404 error
curl http://localhost:3005/api/votes/verify/FFFFFFFFFFFFFFFF
```

> **Note on seeded votes:** The 30 votes from `pnpm db:seed` use the old serial format (`VV-XXXXXX-XXXX`). These will return 400 (invalid format) from the verify endpoint. Only votes cast through the UI or `POST /api/votes/cast` produce 16-char hex serials that are verifiable.

---

### Scenario 7 — Legacy Receipt Lookup (API only)

```bash
# Simpler endpoint — returns status and TX hash only, no crypto verification
curl http://localhost:3005/api/receipts/A3F1B2C4D5E60789
```

---

### Scenario 8 — Forgot Password / PIN Reset Flow

1. Voter goes to `http://localhost:3001/vote`
2. Clicks **Forgot password?** (in the Password tab) or **Reset your PIN** (below the login box)
3. Enters their National ID and submits
4. Chooses verification method:
   - **Online** — Persona biometric (sandbox completes immediately) in an inline iframe
   - **In Person** — Book an appointment at their polling station

**Admin side (PIN reset):**
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
curl "http://localhost:3005/api/appointments/available?pollingStationId=<id>"
```

---

### Scenario 10 — Biometric Enrollment + Login

1. Register a voter at `/register` and choose **Enroll Fingerprint / Windows Hello** after KYC
2. Your browser prompts for device biometric — authenticate (fingerprint, PIN, or Windows Hello)
3. The credential is stored in the database against your voter ID
4. Log in at `/vote` → **Fingerprint** tab → enter National ID → click Sign In
5. Device biometric prompt appears again — authenticate
6. If successful, you are logged in and redirected to the ballot

---

### Scenario 11 — Run Tests

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
| POST | `/api/voters/register` | Register a new voter (returns Persona inquiry URL) |
| POST | `/api/voters/request-manual-review` | Request IEBC manual verification |
| GET | `/api/voters/registration-status/:inquiryId` | Check Persona inquiry status + issue setup JWT |
| POST | `/api/voters/set-pin` | Set voter PIN + generate distress PIN (requires setup JWT) |
| POST | `/api/auth/login` | Password login → JWT |
| POST | `/api/auth/request-otp` | Request OTP for login or contact verification |
| POST | `/api/auth/verify-otp` | Verify OTP → JWT (login) or advance registration |
| POST | `/api/webauthn/register/options` | Get WebAuthn registration challenge (requires setup JWT) |
| POST | `/api/webauthn/register/verify` | Store enrolled credential (requires setup JWT) |
| POST | `/api/webauthn/authenticate/options` | Get WebAuthn authentication challenge |
| POST | `/api/webauthn/authenticate/verify` | Verify biometric assertion → JWT |
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
| POST | `/api/votes/cast` | Cast a vote (ballot selections + 4-digit PIN) |
| GET | `/api/voters/:id/status` | Get voter status (own record only) |
| GET | `/api/webauthn/credentials/:voterId` | List enrolled biometric credentials |
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
  "pollingStationId": "uuid-optional",
  "pin": "1234"
}
```

Authorization header:
```
Authorization: Bearer <jwt-token>
```

### Register Voter Request Body

```json
{
  "nationalId": "12345678",
  "pollingStationId": "uuid-optional",
  "preferredContact": "EMAIL",
  "email": "voter@example.com",
  "password": "MyStr0ng!Pass"
}
```

For SMS contact:
```json
{
  "preferredContact": "SMS",
  "phoneNumber": "+254712345678"
}
```

---

## Frontend Pages

| URL | Access | Description |
|-----|--------|-------------|
| `http://localhost:3001/` | Public | Home — Vote / Verify / Admin cards |
| `http://localhost:3001/register` | Public | Self-registration — OTP, Persona KYC, WebAuthn, PIN setup |
| `http://localhost:3001/verify` | Public | Vote verification — enter serial, see result, print |
| `http://localhost:3001/vote` | Public | Voter login (Password / OTP / Fingerprint tabs) |
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

## Voter Registration Flow

```
/register
  └─> Form (National ID, polling station, contact, password)
        └─> OTP verification (SMS via Africa's Talking or Email)
              └─> Identity options
                    ├─> Online KYC (Persona inline iframe — same page)
                    │     └─> Auto-advance on approval (postMessage + polling)
                    │           └─> Fingerprint enrollment (optional, WebAuthn)
                    │                 └─> PIN setup (4-digit + distress PIN sent)
                    │                       └─> Registration complete → /vote
                    └─> In-person appointment → /vote (restricted until approved)
```

---

## Rate Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Global (all routes) | 100 requests | 15 min per IP |
| Auth (`/api/auth/login`, `/api/auth/verify-otp`) | 5 requests | 15 min per IP + National ID |
| Registration | 10 requests | 15 min per IP |
| Vote casting | 5 requests | 15 min per IP |
| Vote / receipt verification | 20 requests | 15 min per IP |
| WebAuthn authentication | 5 requests | 15 min per IP + National ID |
| Admin routes | 200 requests | 15 min per IP |

---

## Security Features

| Feature | Implementation |
|---------|---------------|
| Vote data encryption | ElGamal (2048-bit FFDHE, RFC 7919 group) — same plaintext encrypts differently each time |
| Integrity check | SHA-256 hash of ciphertext stored alongside; verify recomputes and compares |
| Password hashing | Argon2id (memory-hard, GPU-resistant) |
| PIN hashing | Argon2id — normal PIN + distress PIN stored separately |
| Distress PIN | Identical vote experience; silently sets `isDistressFlagged = true` on the vote |
| JWT authentication | 24-hour expiry, role embedded in payload |
| Setup JWT | Short-lived token issued post-KYC for WebAuthn enrollment + PIN setup only |
| OTP | 6-digit code, 10-minute TTL, stored in Redis; purpose-scoped (`LOGIN`, `CONTACT_VERIFY`) |
| WebAuthn | FIDO2 / Passkeys via `@simplewebauthn/server`; credentials stored per voter; origin-validated |
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
│   │   │   ├── voter.service.ts    # Registration, password auth, PIN, JWT
│   │   │   ├── admin.service.ts    # Approve/reject manual reviews
│   │   │   ├── persona.service.ts  # KYC integration (mock or live Persona)
│   │   │   ├── webauthn.service.ts # FIDO2 credential registration + authentication
│   │   │   ├── otp.service.ts      # OTP generation, delivery (AT/email), verification
│   │   │   ├── notification.service.ts  # SMS (Africa's Talking) + Email (SMTP)
│   │   │   ├── auth.service.ts     # Password login, OTP login flows
│   │   │   ├── pin-reset.service.ts
│   │   │   └── appointment.service.ts
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts  # requireAuth, requireAdmin, rate limiters
│   │   │   └── index.ts
│   │   ├── routes/
│   │   │   ├── auth.routes.ts      # POST /login, /request-otp, /verify-otp
│   │   │   ├── webauthn.routes.ts  # POST register/options, register/verify, authenticate/*
│   │   │   ├── vote.routes.ts      # POST /cast, GET /verify/:serial
│   │   │   ├── receipt.routes.ts   # GET /receipts/:serial (legacy)
│   │   │   ├── voter.routes.ts     # POST /register, GET /registration-status, POST /set-pin
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
│       │   ├── register/page.tsx   # Self-registration — OTP, Persona, WebAuthn, PIN
│       │   ├── verify/page.tsx     # Serial lookup + result + print
│       │   ├── vote/               # Login (password/OTP/biometric), ballot, review, receipt
│       │   └── admin/              # Login + full dashboard
│       ├── components/             # DataTable, StatusBadge, Pagination, AppointmentSlotPicker
│       ├── contexts/               # AuthContext, LanguageContext (i18n)
│       └── lib/
│           ├── api-client.ts       # Fetch wrapper with JWT injection
│           ├── country-codes.ts    # All countries with flag emoji + dial code (~195 entries)
│           ├── types.ts            # VerifyVoteResult, VoteReceipt, AuthData, etc.
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
| `pnpm dev` | `backend/` | Start backend with hot-reload (port 3005) |
| `pnpm dev` | `frontend/` | Start frontend dev server (port 3001) |
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
                    └─> Start backend (backend/ pnpm dev) — port 3005
                          └─> Start frontend (frontend/ pnpm dev) — port 3001
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Backend fails to start: "ELGAMAL_PRIVATE_KEY not set" | Missing env var | Run `node scripts/generate-elgamal-keys.js` and paste key into `.env` |
| Vote casting returns 500 | ElGamal key set but wrong format | Regenerate the key; must be a valid hex string |
| Verify endpoint returns 400 for seeded serial | Seed uses old `VV-XXX` format | Only serials from `POST /api/votes/cast` are 16-char hex — cast a vote first |
| CORS errors in browser | `FRONTEND_URL` mismatch | Confirm `FRONTEND_URL=http://localhost:3001` in `backend/.env` and restart backend |
| OTP not arriving via SMS | AT sandbox credentials wrong or voter has email preference | Check backend console — OTP is always logged there; also check AT Simulator |
| OTP not arriving via email | SMTP not configured | Check backend console — emails fall back to console log in dev |
| WebAuthn: "Not allowed" error | Browser security policy | Must access frontend via `http://localhost:3001` (not IP or other origin); or device has no enrolled authenticator |
| WebAuthn login: "No credential found" | Voter never enrolled biometric | Skip to Password or OTP login; enroll fingerprint at registration |
| Persona iframe blank or blocked | Browser security policy on localhost | Persona sandbox allows iframe embedding; try Chrome; check CSP headers |
| "Blockchain not available" warning on startup | Hardhat node not running | Start `npx hardhat node` first, then redeploy contracts |
| Blockchain confirmation shows "Pending" | Blockchain connected but slow | Normal — vote is still stored in DB and cryptographically verified |
| Rate limit hit (429) | Too many requests | Wait 15 minutes or restart Redis (`docker compose restart redis`) |
| Admin login fails with known credentials | Database not seeded | Run `pnpm db:seed` from `backend/` |
| Prisma Studio won't open | Port 5555 in use | Kill the process using that port or specify `--port 5556` |
| Port 3005 already in use | Previous backend process still running | `Get-Process -Name node \| Stop-Process` (PowerShell) or kill from Task Manager |
