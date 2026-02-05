# VeriVote Kenya - Week 1 & 2 Milestone Guide

## Overview

This document covers the work completed across **Week 1** and **Week 2** of the VeriVote Kenya project. Week 1 established the backend infrastructure, database, and blockchain layer. Week 2 added authentication, identity verification, admin panel frontend, and full admin workflows.

---

## Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 8.0.0
- **Docker Desktop** (running)
- **Git**

---

## Setup & Run Instructions

### Step 1: Install Dependencies

```bash
pnpm install
```

### Step 2: Start Infrastructure (PostgreSQL + Redis)

```bash
cd E:\Projects\Verivote
pnpm docker:up
```

This starts two Docker containers:
- **PostgreSQL 16** on `localhost:5432` (database: `verivote_dev`)
- **Redis 7** on `localhost:6379`

To verify they are running:
```bash
docker compose ps
```

### Step 3: Configure Environment

```bash
cp backend/.env.example backend/.env
```

The `.env.example` has all default values pre-filled for local development. No changes needed for initial setup.

### Step 4: Generate Prisma Client & Run Migrations

```bash
cd E:\Projects\Verivote\backend
npx prisma generate
npx prisma migrate deploy
```

This creates all database tables: `voters`, `votes`, `polling_stations`, `print_queue`, and `manual_review_appointments`.

### Step 5: Seed the Database

```bash
cd E:\Projects\Verivote\backend
pnpm db:seed
```

Expected output:
- 10 polling stations (across Nairobi, Mombasa, Kisumu, Nakuru, Eldoret, Kiambu, Meru)
- 100 test voters (with realistic Kenyan names and national IDs)
- 30 sample votes (mix of PENDING, CONFIRMED, SUPERSEDED)
- 20 print queue items

### Step 6: Start the Local Blockchain

```bash
cd E:\Projects\Verivote\smart-contracts
npx hardhat node
```

This starts a Hardhat local Ethereum node at `http://localhost:8545`. **Keep this terminal open.**

### Step 7: Deploy Smart Contracts (new terminal)

```bash
cd E:\Projects\Verivote\smart-contracts
npx hardhat run scripts/deploy.ts --network localhost
```

This deploys two Solidity contracts. Copy the printed addresses into `backend/.env`:

```
SBT_CONTRACT_ADDRESS=<address from output>
VOTE_CONTRACT_ADDRESS=<address from output>
```

### Step 8: Start the Backend API

```bash
cd E:\Projects\Verivote\backend
pnpm dev
```

The Express server starts at `http://localhost:3000`. Verify health:

```
http://localhost:3000/health
```

Expected: `"database": "connected", "blockchain": "connected"`

### Step 9: Start the Frontend

```bash
cd E:\Projects\Verivote\frontend
pnpm dev
```

The Next.js app starts at `http://localhost:3001`.

### Step 10: Browse the Database (Optional)

```bash
cd E:\Projects\Verivote\backend
npx prisma studio
```

Opens Prisma Studio GUI at `http://localhost:5555` to browse all tables and seeded data.

### Step 11: Run Tests

```bash
cd E:\Projects\Verivote\smart-contracts
npx hardhat test

cd E:\Projects\Verivote\backend
pnpm test
```

---

## Terminal Layout

| Terminal | Directory | Command | Stays Running |
|----------|-----------|---------|---------------|
| 1 | `E:\Projects\Verivote` | `pnpm docker:up` | Yes |
| 2 | `E:\Projects\Verivote\smart-contracts` | `npx hardhat node` | Yes |
| 3 | `E:\Projects\Verivote\backend` | `pnpm dev` | Yes |
| 4 | `E:\Projects\Verivote\frontend` | `pnpm dev` | Yes |
| 5 | `E:\Projects\Verivote\smart-contracts` | `npx hardhat run scripts/deploy.ts --network localhost` | One-time |
| 6 | `E:\Projects\Verivote\backend` | `pnpm db:seed`, curl commands | Working terminal |

---

## Service Summary

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:3001 | Next.js admin panel |
| Backend API | http://localhost:3000 | Express REST server |
| Health Check | http://localhost:3000/health | Server status endpoint |
| API Stats | http://localhost:3000/api/stats | Database statistics |
| Prisma Studio | http://localhost:5555 | Database GUI browser |
| Hardhat Node | http://localhost:8545 | Local Ethereum blockchain |
| PostgreSQL | localhost:5432 | Primary database |
| Redis | localhost:6379 | Rate limiting cache |

---

## Startup Order

```
Docker (PostgreSQL + Redis)
  -> Prisma Migrate/Seed (backend/)
  -> Hardhat Node (smart-contracts/)
    -> Deploy Smart Contracts (smart-contracts/)
      -> Start Backend (backend/)
        -> Start Frontend (frontend/)
```

---

## Week 1 Progress Summary

### Days 3-4: Database Schema & Core Models

1. **Prisma Schema** (`backend/prisma/schema.prisma`)
   - Models: `Voter`, `Vote`, `PollingStation`, `PrintQueue`
   - Enums: `VoterStatus`, `VoteStatus`, `PrintStatus`
   - Proper foreign key relationships and indexes
   - UUID primary keys for security

2. **Voter Table**
   - Fields: nationalId, sbtAddress, sbtTokenId, pinHash, distressPinHash, status, voteCount
   - Status tracking: REGISTERED -> VOTED -> REVOTED (supports revoting)
   - Distress PIN mechanism for coercion detection
   - Linked to polling station via foreign key

3. **Vote Table**
   - Encrypted vote storage (hash + encrypted data)
   - Serial number for voter receipt verification
   - ZKP (Zero-Knowledge Proof) field for vote validity
   - Blockchain anchoring fields (txHash, blockNumber, confirmedAt)
   - Revote chain via self-referencing previousVoteId

4. **PollingStation Table**
   - Kenya administrative hierarchy: County > Constituency > Ward
   - GPS coordinates for geolocation
   - Capacity tracking (registeredVoters, deviceCount, printerCount)

5. **PrintQueue Table**
   - Centralized print job management
   - Status tracking: PENDING -> PRINTING -> PRINTED / FAILED
   - Ballot number and QR code data fields

6. **Database Migrations** (`backend/prisma/migrations/`)

7. **Seed Data** (`backend/prisma/seed.ts`)
   - 10 real Kenyan polling stations with actual GPS coordinates
   - 100 voters with realistic names and national IDs
   - 30 votes with varied statuses
   - 20 print queue items

8. **Repository Layer** (`backend/src/repositories/`)
   - `base.repository.ts` - Generic CRUD operations with pagination
   - `voter.repository.ts` - Voter-specific queries (find by national ID, status filtering, stats)
   - `vote.repository.ts` - Vote-specific queries
   - `polling-station.repository.ts` - Station queries with county filtering
   - `print-queue.repository.ts` - Print queue queries

### Days 5-7: Blockchain Setup

1. **Local Ethereum Testnet**
   - Hardhat configuration with Solidity 0.8.24 and optimizer
   - Local network on `http://localhost:8545`

2. **Soul-Bound Token (SBT) Contract** (`smart-contracts/contracts/SoulBoundToken.sol`)
   - ERC721-based non-transferable token
   - `mint()` ties national ID hash to token
   - One SBT per voter (duplicate prevention)
   - Transfer/approval functions blocked (non-transferable)
   - Owner can revoke tokens (voter suspension)

3. **Vote Recording Contract** (`smart-contracts/contracts/VoteRecording.sol`)
   - Records vote hashes on-chain (not actual votes)
   - Supports revoting (marks previous votes as superseded)
   - Authorized recorder pattern (only backend can write)

4. **Backend Blockchain Service** (`backend/src/services/blockchain.service.ts`)
   - ethers.js integration for contract interaction
   - Functions: mintSBT, recordVote, getVoteRecord, supersedeVote, hasVoterToken

5. **Blockchain API Routes** (`backend/src/routes/blockchain.routes.ts`)
   - `POST /api/blockchain/mint-sbt` - Mint SBT for a voter
   - `POST /api/blockchain/record-vote` - Record vote hash on-chain
   - `GET /api/blockchain/verify-vote/:serialNumber` - Verify a recorded vote

---

## Week 2 Progress Summary

### Days 8-9: Identity Verification & Authentication

1. **Persona Identity Verification** (`backend/src/services/persona.service.ts`)
   - Integration with Persona KYC API for automated identity verification
   - Mock mode (`PERSONA_MOCK=true`) for local development that auto-completes verification
   - Webhook receiver for verification status updates
   - Webhook signature verification for production security

2. **Manual Review System** (`backend/src/services/admin.service.ts`)
   - Voters who fail automated verification are routed to manual review
   - IEBC officials can approve (triggers SBT minting + PIN generation) or reject with reason
   - Full audit trail: reviewer ID, notes, timestamps

3. **Appointment Scheduling** (`backend/src/services/appointment.service.ts`)
   - IEBC creates time slots at polling stations (configurable date, hours, duration)
   - Voters can browse available slots, book, and cancel appointments
   - Geolocation-based slot search (find nearby stations by GPS coordinates)
   - Appointment lifecycle: AVAILABLE -> BOOKED -> COMPLETED / NO_SHOW / CANCELLED
   - `ManualReviewAppointment` database model with proper indexes

4. **JWT Authentication** (`backend/src/middleware/auth.middleware.ts`)
   - Token-based authentication using JSON Web Tokens
   - `requireAuth` middleware validates Bearer tokens on protected routes
   - `requireSelf` middleware ensures voters can only access their own data
   - Distress flag embedded in JWT (invisible to coercer)

5. **Rate Limiting** (`backend/src/middleware/rate-limit.middleware.ts`)
   - Global: 100 requests per 15 minutes per IP
   - Auth: 5 requests per 15 minutes per IP+nationalId (prevents brute force)
   - Registration: 10 requests per 15 minutes per IP
   - Admin: 200 requests per 15 minutes per IP

6. **PIN Reset Flow** (`backend/src/services/pin-reset.service.ts`)
   - Voter requests PIN reset online
   - Two verification paths: in-person (IEBC officer) or biometric (Persona)
   - Generates new 4-digit PIN + distress PIN pair
   - Clears reset request flag after completion
   - Cancel endpoint if voter changes their mind

### Days 10-14: Admin Panel Frontend

1. **Next.js Frontend** (`frontend/`)
   - Next.js 15 with App Router, TypeScript, Tailwind CSS
   - Runs on `http://localhost:3001`
   - Authentication context with JWT token management
   - Auto-redirect to login page when unauthenticated
   - API client with automatic token injection and 401 handling

2. **Admin Login Page** (`frontend/src/app/admin/login/page.tsx`)
   - National ID (8-digit) + PIN (4-digit) authentication
   - Client-side input validation (numeric only, exact length enforcement)
   - Calls `POST /api/voters/verify-pin`

3. **Dashboard Page** (`frontend/src/app/admin/(dashboard)/page.tsx`)
   - 4 stat cards: Total Voters, SBTs Minted, Pending Reviews, Failed Verifications
   - Recent registrations table (last 5 voters)
   - Click-through to voter detail pages

4. **Register Voter Page** (`frontend/src/app/admin/(dashboard)/register/page.tsx`)
   - Form with National ID input and polling station dropdown
   - Displays PINs in green success box after registration
   - Supports both mock mode (direct PINs) and live mode (Persona redirect)

5. **Voters List Page** (`frontend/src/app/admin/(dashboard)/voters/page.tsx`)
   - Paginated table of all voters (20 per page)
   - Columns: National ID, Status, SBT Address, Token ID, Minted At
   - Click-through to voter detail page

6. **Voter Detail Page** (`frontend/src/app/admin/(dashboard)/voters/[id]/page.tsx`)
   - Full voter information card (ID, status, station, timestamps)
   - Blockchain/SBT confirmation card (wallet address, token ID, mint date)
   - Failure reason and manual review timestamps when applicable

7. **Manual Reviews Page** (`frontend/src/app/admin/(dashboard)/reviews/page.tsx`)
   - Paginated table of voters pending manual review
   - **Approve action**: Inline confirmation with optional notes, displays generated PINs
   - **Reject action**: Inline confirmation with required rejection reason
   - Station name resolution from polling station data

8. **Appointments Page** (`frontend/src/app/admin/(dashboard)/appointments/page.tsx`)
   - **Create Slots form**: Station, date, start/end hour, duration selectors
   - **Delete Slots form**: Station and date range to remove available slots
   - **Scheduled Appointments table**: Paginated, filterable by station and date
   - Row actions: Complete and No-Show buttons on booked appointments

9. **PIN Resets Page** (`frontend/src/app/admin/(dashboard)/pin-resets/page.tsx`)
   - Paginated table of pending PIN reset requests
   - Filterable by polling station
   - **Verify & Reset action**: Officer ID (pre-filled), optional notes
   - Displays new PINs in green success box after reset

10. **Reusable Components**
    - `DataTable` - Generic paginated table with click-through support
    - `Pagination` - Page navigation with Previous/Next
    - `StatusBadge` - Color-coded voter status badges (8 statuses)
    - `Header` - Page title bar with logout and current user display
    - `Sidebar` - Navigation with 6 menu items and SVG icons
    - `StatCard` - Dashboard metric card with colored left border
    - `LoadingSkeleton` / `CardSkeleton` - Loading state placeholders

---

## API Endpoints Summary

### Public Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Server and database health check |
| GET | `/api/stats` | System-wide statistics |
| GET | `/api/polling-stations` | List polling stations (paginated, filterable by county) |
| GET | `/api/counties` | List all counties |
| GET | `/api/voters` | List all voters (paginated) |
| POST | `/api/voters/register` | Register a new voter |
| POST | `/api/voters/verify-pin` | Authenticate with national ID + PIN |
| POST | `/api/voters/request-manual-review` | Request IEBC manual verification |
| GET | `/api/voters/registration-status/:inquiryId` | Check registration status |
| POST | `/api/blockchain/mint-sbt` | Mint Soul-Bound Token |
| POST | `/api/blockchain/record-vote` | Record vote hash on-chain |
| GET | `/api/blockchain/verify-vote/:serialNumber` | Verify a recorded vote |
| GET | `/api/appointments/available` | View available appointment slots |
| GET | `/api/appointments/nearby` | Find slots near GPS coordinates |
| GET | `/api/appointments/near-me` | Find slots near voter's station |
| POST | `/api/appointments/:id/book` | Book an appointment slot |
| DELETE | `/api/appointments/my-booking` | Cancel voter's booking |
| GET | `/api/appointments/my-booking` | View voter's current booking |
| POST | `/api/pin-reset/request` | Request PIN reset |
| POST | `/api/pin-reset/cancel` | Cancel PIN reset request |
| GET | `/api/pin-reset/status` | Check PIN reset status |

### Authenticated Endpoints (Require JWT)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/voters/:id/status` | Get voter status (self only) |
| GET | `/api/admin/pending-reviews` | List voters awaiting manual review |
| GET | `/api/admin/review-stats` | Review statistics |
| GET | `/api/admin/review/:voterId` | Get voter review details |
| POST | `/api/admin/approve/:voterId` | Approve voter after verification |
| POST | `/api/admin/reject/:voterId` | Reject voter with reason |

### Admin Appointment Management

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/appointments/create-slots` | Create time slots at a station |
| GET | `/api/appointments/scheduled` | View booked appointments |
| POST | `/api/appointments/:id/complete` | Mark appointment completed |
| POST | `/api/appointments/:id/no-show` | Mark voter as no-show |
| DELETE | `/api/appointments/slots` | Delete available slots in date range |

### Admin PIN Reset Management

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/pin-reset/pending` | List pending PIN reset requests |
| POST | `/api/pin-reset/verify/:voterId` | Complete in-person PIN reset |

---

## Security Features

| Feature | Implementation |
|---------|---------------|
| PIN Hashing | Argon2id (memory-hard, GPU-resistant) |
| PIN Length | 4-digit system-generated (both normal and distress) |
| Distress Detection | Distress PIN silently flags voter, response identical to normal login |
| Authentication | JWT tokens with 24-hour expiry |
| Rate Limiting | Tiered limits per endpoint type (auth, registration, admin) |
| Identity Verification | Persona KYC integration with webhook signature verification |
| Blockchain Anchoring | Vote hashes recorded on Ethereum (Hardhat local testnet) |
| Non-Transferable Identity | Soul-Bound Tokens (ERC721 with blocked transfers) |
| Vote Superseding | Previous votes marked SUPERSEDED on re-vote |

---

## Project Structure

```
VeriVote/
├── backend/                        # Express.js API (TypeScript)
│   ├── src/
│   │   ├── index.ts                # Server entry point
│   │   ├── database/               # Prisma client setup
│   │   ├── repositories/           # Data access layer
│   │   ├── services/               # Business logic
│   │   │   ├── voter.service.ts    # Registration, PIN verification
│   │   │   ├── admin.service.ts    # Manual review approve/reject
│   │   │   ├── blockchain.service.ts # SBT minting, vote recording
│   │   │   ├── persona.service.ts  # Identity verification (KYC)
│   │   │   ├── pin-reset.service.ts # PIN reset flow
│   │   │   ├── appointment.service.ts # Slot management
│   │   │   └── auth.service.ts     # JWT token generation
│   │   ├── middleware/             # Auth, rate limiting
│   │   └── routes/                 # API endpoints
│   └── prisma/
│       ├── schema.prisma           # Database schema
│       ├── seed.ts                 # Test data seeder
│       └── migrations/             # Database migrations
├── smart-contracts/                # Hardhat + Solidity
│   ├── contracts/
│   │   ├── SoulBoundToken.sol      # Non-transferable voter identity
│   │   └── VoteRecording.sol       # On-chain vote hashes
│   ├── scripts/deploy.ts           # Deployment script
│   ├── test/                       # Contract tests
│   └── hardhat.config.ts           # Hardhat configuration
├── frontend/                       # Next.js 15 Admin Panel
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx            # Root redirect
│   │   │   ├── layout.tsx          # Root layout with AuthProvider
│   │   │   └── admin/
│   │   │       ├── login/page.tsx  # Login form
│   │   │       └── (dashboard)/
│   │   │           ├── layout.tsx  # Sidebar + auth guard
│   │   │           ├── page.tsx    # Dashboard with stats
│   │   │           ├── register/   # Voter registration form
│   │   │           ├── voters/     # Voter list + detail pages
│   │   │           ├── reviews/    # Manual review approve/reject
│   │   │           ├── appointments/ # Slot management
│   │   │           └── pin-resets/ # PIN reset verification
│   │   ├── components/             # Reusable UI components
│   │   ├── contexts/               # Auth context provider
│   │   └── lib/                    # API client, types, constants
│   ├── package.json
│   └── tsconfig.json
├── docs/                           # Documentation
├── docker-compose.yml              # PostgreSQL + Redis
└── pnpm-workspace.yaml             # Monorepo config
```

---

## Useful Commands Reference

| Command | Directory | Description |
|---------|-----------|-------------|
| `pnpm docker:up` | `E:\Projects\Verivote` | Start PostgreSQL + Redis containers |
| `pnpm docker:down` | `E:\Projects\Verivote` | Stop Docker containers |
| `pnpm docker:logs` | `E:\Projects\Verivote` | View Docker container logs |
| `pnpm db:migrate` | `E:\Projects\Verivote\backend` | Run database migrations |
| `pnpm db:seed` | `E:\Projects\Verivote\backend` | Seed database with test data |
| `npx prisma studio` | `E:\Projects\Verivote\backend` | Open database GUI browser |
| `npx hardhat node` | `E:\Projects\Verivote\smart-contracts` | Start local blockchain |
| `npx hardhat test` | `E:\Projects\Verivote\smart-contracts` | Run smart contract tests |
| `npx hardhat run scripts/deploy.ts --network localhost` | `E:\Projects\Verivote\smart-contracts` | Deploy contracts |
| `pnpm dev` | `E:\Projects\Verivote\backend` | Start backend with hot-reload |
| `pnpm dev` | `E:\Projects\Verivote\frontend` | Start frontend dev server |
| `pnpm test` | `E:\Projects\Verivote\backend` | Run backend tests |
| `npx next build` | `E:\Projects\Verivote\frontend` | Build frontend for production |
