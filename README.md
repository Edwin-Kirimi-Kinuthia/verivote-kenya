# VeriVote Kenya

**Hybrid Electronic Voting System for Kenya**

A secure, transparent, and verifiable voting system combining in-person identity verification, ElGamal cryptographic encryption, Soul-Bound Tokens on an EVM blockchain, and a real-time public transparency portal.

---

## Features

- **Soul-Bound Tokens (SBTs)** — Non-transferable ERC-721 voter identity anchored on-chain
- **Persona KYC** — Automated ID document + liveness detection (inline iframe, no redirect)
- **IEBC Manual Review** — Fallback in-person verification with appointment scheduling
- **WebAuthn / FIDO2** — Fingerprint enrollment at the polling station during approval
- **ElGamal Encryption** — 2048-bit FFDHE (RFC 7919) vote encryption before storage
- **Blockchain Recording** — SHA-256 hash of each encrypted vote anchored on-chain
- **Dual-PIN System** — Normal PIN + silent Distress PIN (coercion resistance)
- **Distress Alerts** — Real-time socket alert + SMS/email to all registered IEBC officials
- **Voting Time-Lock** — Configurable window; freeze period 2 hours before polls close
- **Multiple Voting** — Voters can change their vote; only the last submission counts
- **Receipt Verification** — Every voter gets a serial number to verify their vote publicly
- **Blockchain Explorer** — Public audit trail of all confirmed votes with TX hashes
- **Real-Time Dashboard** — WebSocket-powered live vote counter, charts, distress feed
- **Paper Audit Trail** — Admin print queue for post-election physical recount

---

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Backend** | Node.js 20, TypeScript, Express.js, Prisma ORM |
| **Database** | PostgreSQL 16, Redis 7 |
| **Blockchain** | EVM-compatible (local Hardhat testnet; Polygon for production), Solidity, ethers.js |
| **Encryption** | ElGamal 2048-bit FFDHE, Argon2id (PIN hashing) |
| **Identity** | Persona (ID + liveness), WebAuthn / FIDO2 (fingerprint) |
| **Frontend** | Next.js 15, React, Tailwind CSS, Recharts |
| **Real-Time** | Socket.IO (WebSocket + polling fallback) |
| **Notifications** | Africa's Talking (SMS), Nodemailer (SMTP) |
| **DevOps** | Docker, Docker Compose, GitHub Actions |

---

## Project Structure

```
verivote-kenya/
├── backend/                 # Node.js + TypeScript API
│   ├── prisma/              # Database schema & migrations
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── index.ts         # Server entry point (Express + Socket.IO)
│       ├── lib/
│       │   └── socket.ts    # Socket.IO emitters (vote:update, distress:alert)
│       ├── database/        # Prisma client
│       ├── repositories/    # Data access layer
│       ├── services/        # Business logic
│       │   ├── voter.service.ts
│       │   ├── vote.service.ts
│       │   ├── admin.service.ts
│       │   ├── appointment.service.ts
│       │   ├── pin-reset.service.ts
│       │   ├── persona.service.ts
│       │   ├── notification.service.ts
│       │   ├── encryption.service.ts
│       │   ├── blockchain.service.ts
│       │   └── scheduler.ts
│       └── routes/          # API endpoint handlers
├── contracts/               # Solidity smart contracts
│   ├── contracts/
│   │   └── VoterSBT.sol     # Soul-Bound Token (ERC-721, all transfers blocked)
│   └── hardhat.config.ts
├── frontend/                # Next.js 15 web application
│   └── src/app/
│       ├── page.tsx             # Public election portal (live stats + charts)
│       ├── explorer/            # Blockchain explorer (public audit trail)
│       ├── register/            # Voter self-registration + KYC flow
│       ├── vote/                # Ballot, review, receipt pages
│       ├── verify/              # Receipt verification
│       └── admin/               # IEBC admin portal
├── docker-compose.yml       # Local development services
└── package.json             # Root monorepo config
```

---

## API Endpoints

### Public

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server status, database & blockchain health |
| `/api/stats` | GET | System-wide voter and vote statistics |
| `/api/stats/turnout` | GET | Turnout breakdown by county and polling station |
| `/api/stats/hourly` | GET | Votes per hour for the last 24 hours |
| `/api/stats/explorer` | GET | Latest 20 confirmed votes for the blockchain explorer |
| `/api/counties` | GET | List of Kenyan counties |
| `/api/polling-stations` | GET | Polling stations with county filter |
| `/api/receipts/:serial` | GET | Verify a vote by serial number |

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Password login (returns JWT) |
| `/api/auth/otp-login` | POST | OTP-based login |
| `/api/auth/set-password` | POST | Set account password |

### Voter Registration

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/voters/register` | POST | Start registration (triggers Persona KYC) |
| `/api/voters/persona-webhook` | POST | Persona webhook on verification complete |
| `/api/voters/registration-status/:inquiryId` | GET | Poll KYC status; issues setup JWT when approved |
| `/api/voters/set-pin` | POST | Set normal voting PIN (requires setup JWT) |
| `/api/voters/:id/status` | GET | Get voter status |
| `/api/voters` | GET | List voters, paginated (admin) |

### Vote Casting

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/votes/cast` | POST | Cast or change a vote (requires PIN) |
| `/api/votes/status` | GET | Check own vote status |

### IEBC Admin Portal

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/review-stats` | GET | Dashboard stats (voters, reviews, distress) |
| `/api/admin/pending-reviews` | GET | Voters awaiting manual review |
| `/api/admin/review/:voterId` | GET | Voter detail for in-person review |
| `/api/admin/approve/:voterId` | POST | Approve voter (mints SBT) |
| `/api/admin/reject/:voterId` | POST | Reject voter |
| `/api/admin/distress-votes` | GET | List distress-flagged votes |
| `/api/admin/send-setup-link` | POST | Send PIN setup link to approved voter |
| `/api/admin/officials` | GET | List IEBC officials |
| `/api/admin/officials` | POST | Grant official access (voter must be REGISTERED) |

### Appointments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/appointments/create-slots` | POST | Bulk-create time slots (admin) |
| `/api/appointments/slots` | DELETE | Delete available slots (admin) |
| `/api/appointments/available` | GET | List open slots |
| `/api/appointments/nearby` | GET | Slots near GPS coordinates |
| `/api/appointments/book/:slotId` | POST | Book a slot |
| `/api/appointments/cancel/:slotId` | POST | Cancel a booking |
| `/api/appointments/:id/approve-voter` | POST | Approve voter at appointment |
| `/api/appointments/:id/reject-voter` | POST | Reject voter at appointment |
| `/api/appointments/scheduled` | GET | List booked appointments (admin) |

### PIN Reset

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pin-reset/request` | POST | Request a PIN reset |
| `/api/pin-reset/status` | GET | Check reset status |
| `/api/pin-reset/pending` | GET | List pending resets (admin) |
| `/api/pin-reset/verify/:voterId` | POST | Complete in-person reset verification |

### WebAuthn

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webauthn/register/options` | POST | Get registration options |
| `/api/webauthn/register/verify` | POST | Verify and store credential |
| `/api/webauthn/authenticate/options` | POST | Get authentication options |
| `/api/webauthn/authenticate/verify` | POST | Verify authentication response |

### Blockchain

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/blockchain/status` | GET | Contract deployment and connection status |
| `/api/blockchain/mint-sbt` | POST | Mint SBT for a voter |
| `/api/blockchain/verify-sbt/:address` | GET | Verify SBT ownership |

---

## Real-Time Events (Socket.IO)

| Event | Direction | Payload |
|-------|-----------|---------|
| `vote:update` | Server → Client | `{ totalVotes, turnout, lastVoteAt }` |
| `distress:alert` | Server → Client | `{ serial, stationName, stationCode, timestamp }` |

---

## Registration Flow

```
Voter submits form
        │
        ▼
  Persona KYC (inline)
        │
   ┌────┴────┐
   │         │
APPROVED   FAILED
   │         │
   ▼         ▼
Mint SBT   Book appointment at polling station
Set PINs        │
   │        IEBC officer verifies in person
   │            │
   │       ┌────┴────┐
   │       │         │
   │   APPROVED   REJECTED
   │       │
   └───────┤
           ▼
  Setup JWT issued → voter sets PIN on own device
  Distress PIN delivered via SMS/email
  WebAuthn fingerprint enrolled at station (optional)
```

---

## Voting Flow

```
Voter logs in (password or OTP)
        │
        ▼
Check: REGISTERED status + PIN set
        │
        ▼
Voting window open? (ELECTION_VOTING_OPENS_AT / ELECTION_VOTING_CLOSES_AT)
        │
        ▼
Enter ballot selections + PIN
        │
   ┌────┴────────────┐
Normal PIN       Distress PIN
   │                  │
   ▼                  ▼
Vote recorded    Vote recorded silently
                 isDistressFlagged = true
                 SMS/email → all IEBC admins
                 socket distress:alert emitted
        │
        ▼
ElGamal encrypt → SHA-256 hash → blockchain anchor
Serial number issued → voter can verify receipt
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- Docker & Docker Compose

### Setup

```bash
git clone https://github.com/Edwin-Kirimi-Kinuthia/verivote-kenya.git
cd verivote-kenya

# Install dependencies
pnpm install

# Start PostgreSQL, Redis, and Hardhat
docker-compose up -d

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your values

# Run migrations and seed
cd backend
npx prisma migrate dev
npx prisma db seed

# Start everything
cd ..
pnpm dev
```

Frontend: `http://localhost:3001` | API: `http://localhost:3005` | API Docs: `http://localhost:3005/api/docs`

### Key Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/verivote_dev"

# Blockchain (local Hardhat; swap RPC URL for Polygon in production)
BLOCKCHAIN_MOCK=true
BLOCKCHAIN_RPC_URL=http://localhost:8545
BLOCKCHAIN_NETWORK=localhost
DEPLOYER_PRIVATE_KEY=0xac0974...

# Persona KYC
PERSONA_API_KEY=persona_sandbox_xxx
PERSONA_TEMPLATE_ID=itmpl_xxx
PERSONA_WEBHOOK_SECRET=wbhsec_xxx
PERSONA_MOCK=false

# SMS & Email (Africa's Talking + SMTP)
NOTIFICATION_MOCK=false
AT_API_KEY=atsk_xxx
AT_USERNAME=sandbox
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=app_password

# Distress alert recipients (also sent to all admin voter contacts)
DISTRESS_ALERT_PHONE=+254700000000
DISTRESS_ALERT_EMAIL=security@iebc.or.ke

# Voting window (optional — if unset, voting is always open)
ELECTION_VOTING_OPENS_AT=2027-08-09T06:00:00+03:00
ELECTION_VOTING_CLOSES_AT=2027-08-09T17:00:00+03:00

# Encryption
ELGAMAL_PRIVATE_KEY=...

# JWT
JWT_SECRET=your_jwt_secret
```

---

## Docker Services

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Main database |
| Redis | 6379 | OTP cache & rate limiting |
| Hardhat | 8545 | Local EVM blockchain |

---

## Security

| Feature | Implementation |
|---------|----------------|
| PIN hashing | Argon2id |
| Vote encryption | ElGamal 2048-bit FFDHE RFC 7919 |
| Vote integrity | SHA-256 hash anchored on-chain |
| Coercion resistance | Dual-PIN (normal + distress) with silent flagging |
| Identity | Soul-Bound Token (non-transferable ERC-721) |
| Biometrics | WebAuthn / FIDO2 — only public key stored, no raw biometric |
| Transport | JWT (24h expiry), CORS, Helmet, rate limiting |
| Webhooks | HMAC-SHA256 signature verification |

---

## Development Roadmap

| Milestone | Focus | Status |
|-----------|-------|--------|
| Week 1–2 | Infrastructure, database, blockchain, SBT contract | Done |
| Week 3 | Voter registration, Persona KYC, IEBC review portal | Done |
| Week 4 | Vote casting, ElGamal encryption, receipt verification, print queue | Done |
| Week 5 | PIN system, WebAuthn, password auth, OTP login, admin hardening | Done |
| Week 6 | Public portal, blockchain explorer, real-time WebSocket, time-lock | Done |
| Week 7 | AI fraud detection (face re-ID, anomaly detection) | Planned |
| Week 8 | Load testing, security audit, production deployment | Planned |

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

**Built for Kenyan Democracy**
