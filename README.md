# VeriVote Kenya

**Cryptographically Verifiable Hybrid Electronic Voting System**

A sovereign, open-source election platform combining biometric identity verification, ElGamal encryption, homomorphic tallying, Shamir's Secret Sharing, Soul-Bound Tokens on an EVM blockchain, and on-premise AI fraud detection — built for Kenya's constitutional electoral requirements.

---

## Features

### Identity & Registration
- **Soul-Bound Tokens (SBTs)** — Non-transferable ERC-721 voter identity anchored on-chain; burned on death
- **Persona KYC** — Automated national ID + liveness detection (inline iframe, no redirect)
- **IEBC Manual Review** — In-person verification fallback with appointment scheduling
- **WebAuthn / FIDO2** — Biometric passkey enrolled on the voter's own personal device; during in-person registration the IEBC officer's screen displays a QR code the voter scans with their phone — credential is created on the voter's device via FIDO2 cross-device (Bluetooth hybrid) transport; the officer's biometrics are never captured
- **Deceased Voter Handling** — DECEASED status blocks future login/voting; all prior votes remain CONFIRMED and counted per constitutional requirement

### Voting
- **ElGamal Encryption** — 2048-bit FFDHE (RFC 7919) encryption applied before any vote is stored
- **Revoting** — Voters may change their ballot; only the latest submission counts; all prior ballots are marked SUPERSEDED on-chain
- **Dual-PIN System** — Voter sets both Normal PIN and Distress PIN simultaneously during setup (same form, both chosen privately by the voter); Normal PIN confirms every vote; Distress PIN silently flags coercion
- **Distress Vote Handling** — Distress vote is CONFIRMED and constitutionally counted; admin is alerted with voter contact info; escorted revote arranges a safe free revote that supersedes the coerced ballot
- **Voting Time-Lock** — Configurable open/close window; automatic freeze 2 hours before close
- **Receipt Verification** — Every voter receives a serial number to self-verify their vote publicly

### Cryptographic Tally
- **Homomorphic Tallying** — ElGamal ciphertexts are multiplied (not decrypted); individual ballots are never revealed
- **Shamir's Secret Sharing** — ElGamal private key split across IEBC commissioners; configurable (k, n) threshold; tally requires k keyholders to submit shares
- **Tally Ceremony** — Threshold decryption via authenticated commissioner portal; result cryptographically signed and pushed to blockchain

### Transparency & Audit
- **Blockchain Explorer** — Public audit trail of all confirmed votes with TX hashes
- **Real-Time Dashboard** — WebSocket live vote counter, turnout charts, distress feed
- **Paper Audit Trail** — Admin print queue for post-election physical recount
- **AI Fraud Detection** — On-premise Isolation Forest + Llama 3.2 (Ollama); no data egress

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | Node.js 20, TypeScript, Express.js, Prisma ORM |
| **Database** | PostgreSQL 16, Redis 7 |
| **Blockchain** | EVM-compatible (Hardhat local / Polygon mainnet), Solidity, ethers.js |
| **Encryption** | ElGamal 2048-bit FFDHE, Argon2id (PIN & password hashing) |
| **Identity** | Persona KYC (ID + liveness), WebAuthn / FIDO2 |
| **Frontend** | Next.js 15, React, Tailwind CSS, Recharts, Socket.IO client |
| **Real-Time** | Socket.IO (WebSocket + polling fallback) |
| **Notifications** | Africa's Talking (SMS), Mailtrap / SMTP (email) |
| **AI Service** | Python 3.12, FastAPI, Isolation Forest, Ollama (Llama 3.2) |
| **DevOps** | Docker, Docker Compose |

---

## Project Structure

```
verivote-kenya/
├── backend/                    # Node.js + TypeScript API (port 3005)
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema
│   │   └── seed.ts             # Dev seed data
│   └── src/
│       ├── index.ts            # Server entry point (Express + Socket.IO)
│       ├── routes/             # API endpoint handlers
│       ├── services/           # Business logic
│       │   ├── vote.service.ts         # Cast, revote, distress PIN, verify
│       │   ├── admin.service.ts        # Review, distress dashboard, escorted revote
│       │   ├── encryption.service.ts   # ElGamal encrypt/decrypt
│       │   ├── homomorphic.service.ts  # Exponential ElGamal ballot encoding
│       │   ├── tally.service.ts        # Homomorphic tally + Shamir ceremony
│       │   ├── blockchain.service.ts   # SBT mint/revoke, vote recording
│       │   ├── notification.service.ts # SMS + email (OTP, distress, escorted revote)
│       │   └── ballot.service.ts       # Ballot eligibility by jurisdiction
│       └── repositories/       # Prisma data access layer
├── contracts/                  # Solidity smart contracts
│   ├── contracts/
│   │   ├── VoterSBT.sol        # Soul-Bound Token (ERC-721, transfers blocked)
│   │   └── VoteRecording.sol   # Immutable vote hash anchor
│   └── hardhat.config.ts
├── frontend/                   # Next.js 15 web application (port 3001)
│   └── src/app/
│       ├── page.tsx            # Public portal (live stats + charts)
│       ├── explorer/           # Blockchain explorer (public audit trail)
│       ├── register/           # Voter registration + KYC flow
│       ├── vote/               # Ballot, review, receipt pages
│       ├── verify/             # Receipt verification
│       └── admin/              # IEBC admin portal
├── ai-service/                 # Python FastAPI fraud detection (port 8000)
│   ├── main.py                 # Isolation Forest + Ollama (Llama 3.2) analysis
│   └── requirements.txt
├── docker-compose.yml          # PostgreSQL, Redis
└── package.json                # Monorepo scripts
```

---

## API Reference

### Public

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server, database, and blockchain health |
| `/api/stats` | GET | System-wide voter and vote statistics |
| `/api/stats/turnout` | GET | Turnout by county and polling station |
| `/api/stats/hourly` | GET | Votes per hour (last 24 h) |
| `/api/stats/explorer` | GET | Latest confirmed votes for the blockchain explorer |
| `/api/counties` | GET | Kenyan counties |
| `/api/polling-stations` | GET | Polling stations (filterable by county) |
| `/api/receipts/:serial` | GET | Verify a vote by serial number |

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Password login → JWT |
| `/api/auth/otp-login` | POST | OTP-based login → JWT |
| `/api/auth/set-password` | POST | Set or change account password |

### Voter

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/voters/register` | POST | Self-registration (triggers Persona KYC) |
| `/api/voters/persona-webhook` | POST | Persona webhook on KYC completion |
| `/api/voters/registration-status/:id` | GET | Poll KYC status; issues setup JWT when approved |
| `/api/voters/set-pin` | POST | Set normal + distress PIN (requires setup JWT) |
| `/api/voters/:id/status` | GET | Voter status |
| `/api/voters` | GET | List voters, paginated (admin) |

### Ballot & Voting

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ballot/:electionId` | GET | Fetch ballot positions for the authenticated voter |
| `/api/votes/cast` | POST | Cast or revote (requires PIN; distress PIN silently flags) |
| `/api/votes/status` | GET | Own vote status |
| `/api/votes/verify/:serial` | GET | Cryptographic + blockchain verification by serial |

### Elections

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/elections` | GET / POST | List or create elections |
| `/api/elections/:id` | GET / PATCH | Get or update election |
| `/api/elections/:id/activate` | POST | Move election to ACTIVE |
| `/api/elections/:id/close` | POST | Close voting |
| `/api/elections/:id/reopen` | PATCH | Force-reopen (commission tier) |
| `/api/elections/:id/jurisdictions` | GET / POST | Jurisdiction tree management |
| `/api/elections/:id/jurisdictions/:nodeId/link-station` | PATCH | Link polling station to jurisdiction node |
| `/api/elections/:id/positions` | GET / POST | Positions within an election |
| `/api/elections/:id/positions/:posId/candidates` | GET / POST | Candidates for a position |

### Tally

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tally/run/:electionId` | POST | Run homomorphic tally (Chairperson) |
| `/api/tally/results/:electionId` | GET | Tally results with candidate totals |
| `/api/tally/ceremony/init` | POST | Initialise Shamir key-splitting ceremony |
| `/api/tally/ceremony/submit-share` | POST | Commissioner submits key share |
| `/api/tally/ceremony/status/:electionId` | GET | Ceremony share collection status |

### IEBC Admin

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/review-stats` | GET | Dashboard stats |
| `/api/admin/pending-reviews` | GET | Voters awaiting manual review |
| `/api/admin/review/:voterId` | GET | Voter detail for in-person review |
| `/api/admin/approve/:voterId` | POST | Approve voter (mints SBT) |
| `/api/admin/reject/:voterId` | POST | Reject voter with reason |
| `/api/admin/register-voter` | POST | In-person registration (bypasses Persona) |
| `/api/admin/send-setup-link` | POST | Send PIN setup link to approved voter |
| `/api/admin/distress-votes` | GET | Distress-flagged votes with voter contact info |
| `/api/admin/voters/:id/initiate-escorted-revote` | POST | Notify voter of safe escorted revote |
| `/api/admin/voters/:id/mark-deceased` | POST | Mark voter deceased + revoke SBT on-chain |
| `/api/admin/officials` | GET / POST | List or grant IEBC official access |
| `/api/admin/officials/:voterId` | DELETE | Remove official access |
| `/api/admin/create-officer-account` | POST | Create IEBC officer account (commission tier) |

### WebAuthn

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webauthn/register/options` | POST | Registration challenge |
| `/api/webauthn/register/verify` | POST | Store credential |
| `/api/webauthn/authenticate/options` | POST | Authentication challenge |
| `/api/webauthn/authenticate/verify` | POST | Verify credential → JWT |

### Appointments & PIN Reset

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/appointments/available` | GET | Open appointment slots |
| `/api/appointments/book/:slotId` | POST | Book a slot |
| `/api/appointments/:id/approve-voter` | POST | Approve voter at appointment |
| `/api/pin-reset/request` | POST | Request PIN reset |
| `/api/pin-reset/verify/:voterId` | POST | Complete in-person reset |

### AI Service (port 8000)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/analyze-voting-pattern` | POST | Isolation Forest anomaly score + Llama 3.2 explanation |
| `/fraud-report` | GET | Summary of all flagged votes |
| `/health` | GET | AI service health |

---

## Real-Time Events (Socket.IO)

| Event | Direction | Payload |
|-------|-----------|---------|
| `vote:update` | Server → Client | `{ totalVotes, turnout, lastVoteAt }` |
| `distress:alert` | Server → Client | `{ serial, stationName, stationCode, timestamp }` |

---

## Key Flows

### Registration

```
Voter self-registers online (form + OTP contact verification)
        │
        ▼
  Persona KYC runs inline (ID document + liveness check)
    ┌────┴────┐
    │         │
APPROVED   FAILED ──→ Voter books in-person IEBC appointment
    │                           │
    │                  IEBC officer verifies identity in person
    │                           │
    │                  ┌────────┴────────┐
    │                  │             REJECTED
    └──────────────────┤
                       ▼
          IEBC officer's screen shows a QR code
          Voter scans QR code with their own phone
          WebAuthn credential created on voter's personal device
          (FIDO2 cross-device / Bluetooth hybrid transport —
           officer's biometrics are never captured)
                       │
                       ▼  officer clicks "Approve & Send Setup Link"
          SBT minted on-chain for the voter
          PIN setup link (JWT-embedded URL) sent to voter's
          registered phone (SMS) or email
                       │
                       ▼  voter opens link on their own device privately
          Voter sets both Normal PIN and Distress PIN simultaneously
          on a single form — both chosen by the voter privately,
          never visible to the IEBC officer or anyone else
          Voter may optionally re-enroll biometrics on their
          personal device from the same setup page
```

### Voting & Distress Protection

```
Voter logs in → ballot loaded by jurisdiction
        │
        ▼
  Select candidates + enter PIN
     ┌──────────────────────┐
 Normal PIN             Distress PIN
     │                      │
     ▼                      ▼
 Vote CONFIRMED         Vote CONFIRMED
                        isDistressFlagged = true
                        ─ still counted constitutionally ─
                        Alerts → admin dashboard + SMS/email
                              │
                              ▼
                     Admin: initiate-escorted-revote
                     Voter notified via SMS/email
                              │
                              ▼
                     Voter revotes (normal PIN, with escort)
                     Distress vote → SUPERSEDED on blockchain
                     New vote → CONFIRMED
        │
        ▼
ElGamal encrypt → SHA-256 hash → blockchain anchor
Serial number issued → voter can verify receipt
```

### Tally Ceremony

```
Voting closed
     │
     ▼
Chairperson initiates ceremony → private key split via Shamir's
Each commissioner receives key share (SMS / email)
     │
     ▼
Commissioners submit shares through authenticated portal
     │
 k-of-n threshold met
     │
     ▼
Key reconstructed → ElGamal homomorphic tally runs
Individual votes never decrypted — only the aggregate
     │
     ▼
Result cryptographically signed → pushed to blockchain
Anyone can independently verify: download data, run the same math
```

---

## Quick Start

### Prerequisites

- Node.js 20+, pnpm
- Docker & Docker Compose
- Python 3.12+ (AI service)
- Ollama with `llama3.2` pulled (`ollama pull llama3.2`)

### Setup

```bash
git clone https://github.com/Edwin-Kirimi-Kinuthia/verivote-kenya.git
cd verivote-kenya

# Install JS dependencies
pnpm install

# Start PostgreSQL and Redis
docker compose up -d

# Deploy Hardhat local blockchain
pnpm contracts:node          # in one terminal
pnpm contracts:deploy        # in another

# Configure backend
cp backend/.env.example backend/.env
# Edit backend/.env with your credentials

# Migrate and seed database
cd backend
npx prisma migrate dev
npx prisma db seed
cd ..

# Start all services
npx tsx backend/src/index.ts          # API  :3005
pnpm --filter frontend dev            # UI   :3001
cd ai-service && uvicorn main:app --port 8000   # AI   :8000
```

### Key Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/verivote_dev"

# JWT
JWT_SECRET=your_64_char_hex_secret

# Blockchain (local Hardhat; swap for Polygon in production)
BLOCKCHAIN_MOCK=false
BLOCKCHAIN_RPC_URL=http://localhost:8545
DEPLOYER_PRIVATE_KEY=0x...
SBT_CONTRACT_ADDRESS=0x...
VOTE_CONTRACT_ADDRESS=0x...

# ElGamal encryption key
ELGAMAL_PRIVATE_KEY=...

# Persona KYC (sandbox)
PERSONA_API_KEY=persona_sandbox_xxx
PERSONA_TEMPLATE_ID=itmpl_xxx
PERSONA_WEBHOOK_SECRET=wbhsec_xxx
PERSONA_MOCK=false

# Notifications
AT_API_KEY=atsk_xxx          # Africa's Talking (SMS)
AT_USERNAME=sandbox
MAILTRAP_TOKEN=xxx           # Mailtrap (email testing)
MAILTRAP_INBOX_ID=xxx

# WebAuthn
RP_ID=localhost
RP_NAME=VeriVote Kenya

# Distress alert coordinator (optional — admins also notified)
DISTRESS_ALERT_PHONE=+254700000000
DISTRESS_ALERT_EMAIL=security@iebc.or.ke

# Voting window (optional — unset = always open)
ELECTION_VOTING_OPENS_AT=2027-08-09T06:00:00+03:00
ELECTION_VOTING_CLOSES_AT=2027-08-09T17:00:00+03:00
```

---

## Security

| Feature | Implementation |
|---------|----------------|
| Password hashing | Argon2id |
| PIN hashing | Argon2id (normal + distress PINs stored separately) |
| Vote encryption | ElGamal 2048-bit FFDHE RFC 7919 |
| Vote integrity | SHA-256 hash anchored on-chain |
| Coercion resistance | Dual-PIN; distress vote counted then superseded by escorted revote |
| Individual ballot privacy | Homomorphic tally — individual votes never decrypted |
| Key custody | Shamir's Secret Sharing — no single person holds the decryption key |
| Voter identity | Soul-Bound Token (non-transferable ERC-721); revoked on death |
| Biometrics | WebAuthn / FIDO2 — enrolled on voter's own personal device via QR code scan (FIDO2 cross-device / Bluetooth hybrid); only the public key credential is stored server-side; no raw biometric data ever leaves the voter's device |
| Transport | JWT (24 h expiry), CORS, Helmet, per-route rate limiting |
| Webhooks | HMAC-SHA256 signature verification |
| AI inference | On-premise Llama 3.2 via Ollama — zero data egress |

---

## Constitutional Compliance

VeriVote is designed to satisfy Kenya's electoral law requirements:

- **Every lawfully cast ballot counts** — distress votes and votes cast by voters who subsequently die are CONFIRMED and included in the tally; only a voter's own subsequent revote can supersede a prior ballot
- **Ballot secrecy** — individual votes are never decrypted; only the homomorphic aggregate is revealed
- **Auditability** — every state change (vote, supersede, SBT mint/revoke, result declaration) is immutably recorded on-chain
- **No single point of trust** — tally requires multi-party key reconstruction; no individual can unilaterally read votes or alter results

---

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.
Branch workflow: `feature/*` or `fix/*` → `develop` → PR to `main`.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

*Built for the NIRU Hackathon · Designed for Kenyan Democracy*
