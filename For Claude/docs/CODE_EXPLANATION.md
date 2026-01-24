# VeriVote Kenya - Complete Code Explanation

## Overview

This document explains every piece of code in the VeriVote Kenya project for developers who are new to Node.js, TypeScript, and Express.

---

## Project Structure

```
verivote-kenya/
├── .github/
│   └── workflows/
│       └── ci.yml              # CI/CD pipeline (automated testing)
├── backend/
│   ├── src/
│   │   ├── index.ts            # Main Express server
│   │   └── database/
│   │       └── init.sql        # Database schema
│   ├── .env.example            # Environment variable template
│   ├── package.json            # Backend dependencies
│   └── tsconfig.json           # TypeScript configuration
├── frontend/                   # (Coming in Week 3)
├── smart-contracts/            # (Coming in Week 1 Day 5-7)
├── docs/                       # Documentation
├── .gitignore                  # Files Git should ignore
├── docker-compose.yml          # PostgreSQL + Redis containers
├── package.json                # Root project configuration
├── pnpm-workspace.yaml         # Monorepo workspace config
└── README.md                   # Project documentation
```

---

## 1. package.json (Root)

**What it is:** The project's "recipe card" - defines name, scripts, and dependencies.

```json
{
  "name": "verivote-kenya",
  "version": "0.1.0",
  "scripts": {
    "dev": "pnpm --filter backend dev",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down"
  }
}
```

**Key concepts:**
- `"name"` - Project identifier
- `"version"` - Semantic versioning (0.1.0 = early development)
- `"scripts"` - Shortcuts for common commands
- `"private": true` - Prevents accidental npm publish

---

## 2. docker-compose.yml

**What it is:** Defines containers for PostgreSQL and Redis.

```yaml
services:
  postgres:
    image: postgres:16-alpine      # Use PostgreSQL 16
    environment:
      POSTGRES_USER: verivote      # Database username
      POSTGRES_PASSWORD: xxx       # Database password
      POSTGRES_DB: verivote_dev    # Database name
    ports:
      - "5432:5432"                # Expose on port 5432
    volumes:
      - postgres-data:/var/lib/postgresql/data    # Persist data
      - ./backend/src/database/init.sql:/docker-entrypoint-initdb.d/init.sql  # Run on startup
```

**Why Docker?**
- Consistent environment across all developers
- One command setup: `docker compose up -d`
- No manual installation of PostgreSQL/Redis

---

## 3. backend/src/index.ts

**What it is:** The main Express server - the "brain" of the backend.

### Imports Explained

```typescript
import express from 'express';     // Web framework
import cors from 'cors';           // Cross-origin requests
import helmet from 'helmet';       // Security headers
import morgan from 'morgan';       // Request logging
```

### Middleware Chain

```
Request → Helmet → CORS → JSON Parser → Morgan → Your Routes → Response
            ↓        ↓         ↓           ↓
         Security  Access    Parse       Log
         Headers   Control   Body        Request
```

### Routes

```typescript
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});
```

- `app.get()` - Handle GET requests
- `'/health'` - URL path
- `req` - Request object (what client sent)
- `res` - Response object (what we send back)

---

## 4. backend/src/database/init.sql

**What it is:** SQL schema that creates all database tables.

### Voters Table

```sql
CREATE TABLE voters (
    id UUID PRIMARY KEY,           -- Unique identifier
    national_id_hash VARCHAR(64),  -- Hashed for privacy
    sbt_address VARCHAR(42),       -- Blockchain wallet
    normal_pin_hash VARCHAR(255),  -- Hashed voting PIN
    distress_pin_hash VARCHAR(255),-- Hashed coercion PIN
    status VARCHAR(20),            -- registered/voted/etc
    vote_count INTEGER             -- For multiple voting
);
```

**Security decisions:**
- National ID is hashed (one-way encryption)
- PINs are hashed (never stored in plaintext)
- No direct link between voters and votes tables

### Votes Table

```sql
CREATE TABLE votes (
    id UUID PRIMARY KEY,
    serial_number VARCHAR(36),      -- For verification receipts
    encrypted_vote_hash VARCHAR(64),-- Hash of encrypted vote
    blockchain_tx_hash VARCHAR(66), -- Ethereum transaction
    polling_station_id UUID,        -- Where vote was cast
    is_superseded BOOLEAN,          -- Was vote changed?
    is_distress_flagged BOOLEAN     -- Coercion detected?
);
```

**Note:** No `voter_id` column! This is intentional - we can't link votes to voters.

---

## 5. TypeScript Configuration (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2022",      // Output modern JavaScript
    "strict": true,          // Strict type checking
    "outDir": "./dist",      // Compiled files go here
    "rootDir": "./src"       // Source files are here
  }
}
```

**Why TypeScript?**
- Catches bugs at compile time (before running)
- Self-documenting code
- Better IDE support

---

## 6. Environment Variables (.env)

```env
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PASSWORD=verivote_secure_2024
JWT_SECRET=your-secret-key
```

**Why .env files?**
- Keep secrets out of code
- Different values for dev/production
- Never committed to Git

---

## 7. GitHub Actions CI/CD (.github/workflows/ci.yml)

```yaml
on:
  push:
    branches: [main, develop]

jobs:
  lint:     # Check code style
  test:     # Run automated tests
  build:    # Compile TypeScript
  security: # Scan for vulnerabilities
```

**What happens on every push:**
1. GitHub Actions starts
2. Runs lint check
3. Starts test database
4. Runs tests
5. Builds project
6. Reports results

---

## 8. Git Branching Strategy

```
main (production-ready)
  └── develop (active work)
        ├── feature/voter-registration
        ├── feature/vote-casting
        └── feature/blockchain
```

**Workflow:**
1. Create feature branch from `develop`
2. Make changes
3. Push and create Pull Request
4. CI/CD runs tests
5. Merge to `develop` if passing
6. Merge `develop` to `main` for releases

---

## Key Technologies Summary

| Technology | Purpose |
|------------|---------|
| **Node.js** | JavaScript runtime for server |
| **TypeScript** | Type-safe JavaScript |
| **Express** | Web framework for APIs |
| **PostgreSQL** | Relational database |
| **Redis** | Caching and sessions |
| **Docker** | Container orchestration |
| **GitHub Actions** | CI/CD automation |
| **pnpm** | Fast package manager |

---

## Common Commands

```bash
# Start development
cd E:\Projects\Verivote
docker compose up -d       # Start databases
cd backend
pnpm dev                   # Start server

# Git workflow
git checkout develop       # Switch to develop
git checkout -b feature/x  # Create feature branch
git add .                  # Stage changes
git commit -m "message"    # Commit
git push                   # Push to GitHub

# Database
docker exec -it verivote-postgres psql -U verivote -d verivote_dev
```

---

## Next Steps

| Week | Task |
|------|------|
| 2 | Voter Registration + SBT Minting |
| 3 | Vote Casting + Encryption |
| 4 | Verification Portal |
| 5 | Public Dashboard |
| 6 | AI Security Layer |
| 7 | Polish & Security |
| 8 | Testing & Demo |
