# VeriVote Kenya

**Hybrid Electronic Voting System for Kenya**

A secure, transparent, and verifiable voting system that combines the trustworthiness of paper ballots with cutting-edge cryptography and blockchain technology.

---

## Features

- **Soul-Bound Tokens (SBTs)** - Tamper-proof digital voter identity on Ethereum
- **Persona Identity Verification** - Automated ID document + liveness check
- **IEBC Manual Review** - Fallback physical verification when automated check fails
- **Appointment Scheduling** - Book verification slots at nearby polling stations
- **Zero-Knowledge Proofs** - Verify votes without revealing choices
- **Blockchain Recording** - Immutable, transparent vote storage on Polygon
- **Homomorphic Encryption** - Privacy-preserving vote tallying
- **Distress PIN** - Coercion resistance mechanism
- **PIN Reset** - Secure PIN recovery via in-person or biometric verification
- **Multiple Voting** - Voters can change their vote (only last counts)
- **Paper Audit Trail** - Post-election printing for manual recounts

---

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Backend** | Node.js, TypeScript, Express.js, Prisma ORM |
| **Database** | PostgreSQL 16, Redis 7 |
| **Blockchain** | Polygon (Ethereum L2), Solidity, Hardhat |
| **Identity** | Persona (ID verification + liveness) |
| **Frontend** | React, Next.js, Tailwind CSS |
| **DevOps** | Docker, GitHub Actions |

---

## Project Structure

```
verivote-kenya/
├── backend/                 # Node.js + TypeScript API
│   ├── prisma/              # Database schema & migrations
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── index.ts         # Server entry point
│   │   ├── database/        # Prisma client
│   │   ├── repositories/    # Data access layer
│   │   ├── services/        # Business logic
│   │   │   ├── voter.service.ts
│   │   │   ├── admin.service.ts
│   │   │   ├── appointment.service.ts
│   │   │   ├── pin-reset.service.ts
│   │   │   ├── persona.service.ts
│   │   │   └── blockchain.service.ts
│   │   ├── routes/          # API endpoints
│   │   └── types/           # TypeScript definitions
│   └── package.json
├── contracts/               # Solidity smart contracts
│   ├── contracts/
│   │   └── VoterSBT.sol     # Soul-Bound Token contract
│   └── hardhat.config.ts
├── frontend/                # Next.js web application
├── docs/                    # Documentation
├── .github/workflows/       # CI/CD pipelines
├── docker-compose.yml       # Local development services
└── package.json             # Root monorepo config
```

---

## API Documentation

### Health & Stats
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server status, database & blockchain connection |
| `/api/stats` | GET | System-wide statistics |
| `/api/counties` | GET | List of Kenyan counties |
| `/api/polling-stations` | GET | List polling stations with filters |

### Voter Registration
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/voters/register` | POST | Initiate registration (starts Persona verification) |
| `/api/voters/persona-webhook` | POST | Persona callback on verification complete |
| `/api/voters/registration-status/:inquiryId` | GET | Check registration status |
| `/api/voters/verify-pin` | POST | Verify voter PIN |
| `/api/voters/:id/status` | GET | Get voter status |
| `/api/voters` | GET | List all voters (paginated) |

### IEBC Manual Review (Admin)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/pending-reviews` | GET | List voters pending manual review |
| `/api/admin/review/:voterId` | GET | Get voter details for review |
| `/api/admin/approve/:voterId` | POST | Approve voter (mints SBT, generates PINs) |
| `/api/admin/reject/:voterId` | POST | Reject voter verification |
| `/api/admin/stats` | GET | Review statistics |

### Appointment Scheduling
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/appointments/slots` | POST | Create appointment slots (admin) |
| `/api/appointments/available` | GET | List available slots |
| `/api/appointments/nearby` | GET | Find slots near GPS coordinates |
| `/api/appointments/voter/:voterId/nearby` | GET | Find slots near voter's station |
| `/api/appointments/book/:slotId` | POST | Book an appointment slot |
| `/api/appointments/cancel/:slotId` | POST | Cancel a booking |
| `/api/appointments/complete/:slotId` | POST | Mark appointment complete |
| `/api/appointments/no-show/:slotId` | POST | Mark voter as no-show |
| `/api/appointments/scheduled` | GET | List scheduled appointments |

### PIN Reset
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pin-reset/request` | POST | Request PIN reset |
| `/api/pin-reset/cancel` | POST | Cancel pending reset request |
| `/api/pin-reset/status` | GET | Check reset status |
| `/api/pin-reset/pending` | GET | List pending resets (admin) |
| `/api/pin-reset/verify/:voterId` | POST | Complete in-person verification |
| `/api/pin-reset/biometric-webhook` | POST | Persona biometric callback |

### Blockchain
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/blockchain/status` | GET | Contract deployment status |
| `/api/blockchain/mint-sbt` | POST | Mint SBT for voter |
| `/api/blockchain/verify-sbt/:address` | GET | Verify SBT ownership |

---

## Voter Registration Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VOTER REGISTRATION                           │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  POST /voters/register │
                    │  (nationalId, station) │
                    └───────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Persona ID + Liveness │
                    │    Verification        │
                    └───────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
        ┌──────────┐    ┌─────────────┐    ┌──────────────┐
        │ APPROVED │    │   FAILED    │    │   EXPIRED    │
        └──────────┘    └─────────────┘    └──────────────┘
              │                 │
              ▼                 ▼
    ┌──────────────────┐  ┌─────────────────────┐
    │ Mint SBT Token   │  │ Route to IEBC       │
    │ Generate PINs    │  │ Manual Review       │
    │ Status: REGISTERED│ │ Book Appointment    │
    └──────────────────┘  └─────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  In-Person Verification│
                    │  at Polling Station    │
                    └───────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                                   ▼
    ┌──────────────────┐              ┌──────────────────┐
    │ APPROVED         │              │ REJECTED         │
    │ Mint SBT + PINs  │              │ Status: FAILED   │
    └──────────────────┘              └──────────────────┘
```

---

## PIN Reset Flow

```
Voter forgot PIN
       │
       ▼
POST /pin-reset/request
       │
       ├─────────────────────────────────┐
       ▼                                 ▼
┌─────────────────┐            ┌─────────────────┐
│  In-Person      │            │   Biometric     │
│  Verification   │            │   (Persona)     │
└─────────────────┘            └─────────────────┘
       │                                 │
       ▼                                 ▼
Visit Polling Station          Complete Liveness Check
IEBC verifies ID                       │
       │                                 │
       ▼                                 ▼
POST /verify/:voterId          Webhook Callback
       │                                 │
       └─────────────┬───────────────────┘
                     ▼
           New PINs Generated
           (PIN + Distress PIN)
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm
- Docker & Docker Compose
- PostgreSQL 16

### Setup

```bash
# Clone repository
git clone https://github.com/Edwin-Kirimi-Kinuthia/verivote-kenya.git
cd verivote-kenya

# Install dependencies
pnpm install

# Start database
docker-compose up -d

# Setup environment
cp backend/.env.example backend/.env
# Edit .env with your configuration

# Run database migrations
cd backend
npx prisma migrate dev

# Seed database (optional)
npx prisma db seed

# Start development server
pnpm dev
```

### Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/verivote_dev"

# Blockchain (Hardhat local)
HARDHAT_RPC_URL="http://127.0.0.1:8545"
DEPLOYER_PRIVATE_KEY="0xac0974..."

# Persona Identity Verification
PERSONA_API_KEY="persona_sandbox_xxx"
PERSONA_TEMPLATE_ID="itmpl_xxx"
PERSONA_WEBHOOK_SECRET="wbhsec_xxx"
PERSONA_MOCK="true"  # Set to false for production

# Server
PORT=3000
NODE_ENV=development
```

---

## Docker Services

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Main database |
| Redis | 6379 | Caching & sessions |
| Hardhat | 8545 | Local blockchain |

---

## Security Features

| Feature | Description |
|---------|-------------|
| **Argon2id Hashing** | Industry-standard PIN hashing |
| **Distress PIN** | Silent coercion alert system |
| **SBT Tokens** | Non-transferable voter identity |
| **Webhook Signatures** | HMAC-SHA256 verification |
| **Rate Limiting** | Brute-force protection |
| **ZK Proofs** | Vote validity without revealing choice |
| **Blockchain Anchoring** | Tamper-proof vote records |

---

## Development Roadmap

| Week | Focus | Status |
|------|-------|--------|
| 1 | Foundation & Infrastructure | Done |
| 2 | Voter Registration & SBT | Done |
| 3 | Vote Casting & Encryption | In Progress |
| 4 | Verification & Print System | Planned |
| 5 | Public Portal & Real-time | Planned |
| 6 | AI Security Layer | Planned |
| 7 | Polish & Security Audit | Planned |
| 8 | Testing & Demo | Planned |

---

## Testing

```bash
# Run backend tests
cd backend
pnpm test

# Run linter
pnpm lint

# Type check
npx tsc --noEmit
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- IEBC Kenya for electoral process insights
- Persona for identity verification platform
- Polygon & Ethereum communities
- Open-source cryptography libraries

---

**Built for Kenyan Democracy**
