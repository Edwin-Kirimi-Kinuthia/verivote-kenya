# VeriVote Kenya - Week 1 Milestone Guide

## Overview

This document covers the work completed in **Week 1 (Days 3-7)** of the VeriVote Kenya project. It includes setup instructions to run and verify all services locally, and a summary of what was built.

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
cd backend
npx prisma generate
npx prisma migrate deploy
```

This creates all 4 database tables: `voters`, `votes`, `polling_stations`, and `print_queue`.

### Step 5: Seed the Database

```bash
pnpm db:seed
```

Expected output:
- 10 polling stations (across Nairobi, Mombasa, Kisumu, Nakuru, Eldoret, Kiambu, Meru)
- 100 test voters (with realistic Kenyan names and national IDs)
- 30 sample votes (mix of PENDING, CONFIRMED, SUPERSEDED)
- 20 print queue items

### Step 6: Start the Local Blockchain (Terminal 2)

```bash
pnpm contracts:node
```

This starts a Hardhat local Ethereum node at `http://localhost:8545`. **Keep this terminal open.**

### Step 7: Deploy Smart Contracts (Terminal 3)

```bash
pnpm contracts:deploy
```

This deploys two Solidity contracts and saves their addresses to `smart-contracts/deployments/localhost.json`. Copy the printed addresses into `backend/.env`:

```
SBT_CONTRACT_ADDRESS=<address from output>
VOTE_CONTRACT_ADDRESS=<address from output>
```

### Step 8: Start the Backend API (Terminal 3)

```bash
pnpm dev
```

The Express server starts at `http://localhost:3000`.

### Step 9: Browse the Database (Optional)

```bash
cd backend && pnpm db:studio
```

Opens Prisma Studio GUI at `http://localhost:5555` to browse all tables and seeded data.

### Step 10: Run Tests

```bash
pnpm contracts:test    # Smart contract unit tests
pnpm test              # Backend unit tests
```

---

## Service Summary

| Service          | URL                          | Purpose                    |
|------------------|------------------------------|----------------------------|
| Backend API      | http://localhost:3000         | Express REST server        |
| Health Check     | http://localhost:3000/health  | Server status endpoint     |
| API Stats        | http://localhost:3000/api/stats | Database statistics       |
| Prisma Studio    | http://localhost:5555         | Database GUI browser       |
| Hardhat Node     | http://localhost:8545         | Local Ethereum blockchain  |
| PostgreSQL       | localhost:5432                | Primary database           |
| Redis            | localhost:6379                | Cache / sessions           |

---

## Startup Order

The services must be started in this order due to dependencies:

```
Docker (PostgreSQL + Redis)
  -> Prisma Migrate/Seed
  -> Hardhat Node
    -> Deploy Smart Contracts
      -> Update .env with contract addresses
        -> Start Backend
```

---

## Week 1 Progress Summary

### Days 3-4: Database Schema & Core Models

**Completed:**

1. **Prisma Schema** (`backend/prisma/schema.prisma`)
   - 4 models: `Voter`, `Vote`, `PollingStation`, `PrintQueue`
   - 3 enums: `VoterStatus`, `VoteStatus`, `PrintStatus`
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
   - Single init migration covering all tables

7. **Seed Data** (`backend/prisma/seed.ts`)
   - 10 real Kenyan polling stations with actual locations
   - 100 voters with realistic names, national IDs, and SBT addresses
   - 30 votes with varied statuses
   - 20 print queue items

8. **Repository Layer** (`backend/src/repositories/`)
   - `base.repository.ts` - Generic CRUD operations
   - `voter.repository.ts` - Voter-specific queries
   - `vote.repository.ts` - Vote-specific queries
   - `polling-station.repository.ts` - Station queries
   - `print-queue.repository.ts` - Print queue queries

### Days 5-7: Blockchain Setup

**Completed:**

1. **Local Ethereum Testnet**
   - Hardhat configuration (`smart-contracts/hardhat.config.ts`)
   - Solidity 0.8.24 with optimizer enabled
   - Local network on `http://localhost:8545`

2. **Soul-Bound Token (SBT) Contract** (`smart-contracts/contracts/SoulBoundToken.sol`)
   - ERC721-based non-transferable token
   - `mint()` function ties national ID hash to token
   - One SBT per voter (duplicate prevention)
   - Transfer/approval functions blocked (non-transferable)
   - Owner can revoke tokens (voter suspension)
   - Events: `SBTMinted`, `SBTRevoked`

3. **Vote Recording Contract** (`smart-contracts/contracts/VoteRecording.sol`)
   - Records vote hashes on-chain (not actual votes)
   - Supports revoting (marks previous votes as superseded)
   - Authorized recorder pattern (only backend can write)
   - View function to verify recorded votes
   - Events: `VoteRecorded`, `VoteSuperseded`, `RecorderUpdated`

4. **Deployment Script** (`smart-contracts/scripts/deploy.ts`)
   - Deploys both contracts to local network
   - Saves deployment addresses to `deployments/localhost.json`

5. **Backend Blockchain Service** (`backend/src/services/blockchain.service.ts`)
   - ethers.js integration for contract interaction
   - Functions for minting SBTs and recording votes

6. **Blockchain API Routes** (`backend/src/routes/blockchain.routes.ts`)
   - REST endpoints for blockchain operations

---

## Project Structure

```
VeriVote/
├── backend/                    # Express.js API (TypeScript)
│   ├── src/
│   │   ├── index.ts            # Server entry point
│   │   ├── database/           # Prisma client setup
│   │   ├── repositories/       # Data access layer (5 files)
│   │   ├── services/           # Business logic (blockchain)
│   │   ├── routes/             # API endpoints
│   │   └── types/              # TypeScript type definitions
│   └── prisma/
│       ├── schema.prisma       # Database schema
│       ├── seed.ts             # Test data seeder
│       └── migrations/         # Database migrations
├── smart-contracts/            # Hardhat + Solidity
│   ├── contracts/              # SoulBoundToken.sol, VoteRecording.sol
│   ├── scripts/deploy.ts       # Deployment script
│   ├── test/                   # Contract tests
│   └── hardhat.config.ts       # Hardhat configuration
├── frontend/                   # Next.js (not started yet)
├── docs/                       # Documentation
├── docker-compose.yml          # PostgreSQL + Redis
└── pnpm-workspace.yaml         # Monorepo config
```

---

## Useful Commands Reference

| Command                  | Description                              |
|--------------------------|------------------------------------------|
| `pnpm docker:up`         | Start PostgreSQL + Redis containers      |
| `pnpm docker:down`       | Stop Docker containers                   |
| `pnpm docker:logs`       | View Docker container logs               |
| `pnpm db:migrate`        | Run database migrations (dev)            |
| `pnpm db:seed`           | Seed database with test data             |
| `pnpm contracts:node`    | Start local Hardhat blockchain           |
| `pnpm contracts:compile` | Compile Solidity contracts               |
| `pnpm contracts:test`    | Run smart contract tests                 |
| `pnpm contracts:deploy`  | Deploy contracts to local network        |
| `pnpm dev`               | Start backend with hot-reload            |
| `pnpm test`              | Run backend tests                        |
| `pnpm build`             | Build backend for production             |

---
