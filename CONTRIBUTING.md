# Contributing to VeriVote Kenya

Thank you for your interest in contributing to an open, verifiable election system for Kenya.

## Before You Start

- Read the [README](./README.md) to understand the system architecture
- Check [open issues](https://github.com/Edwin-Kirimi-Kinuthia/verivote-kenya/issues) to avoid duplicate work
- For large features, open an issue first to discuss the approach

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm
- Docker Desktop (PostgreSQL + Redis)
- Git

### Steps

```bash
git clone https://github.com/Edwin-Kirimi-Kinuthia/verivote-kenya.git
cd verivote-kenya
pnpm install

# Copy environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
cp ai-service/.env.example ai-service/.env

# Start infrastructure
docker compose up -d

# Start Hardhat local blockchain
pnpm contracts:node

# Deploy contracts (new terminal)
pnpm contracts:deploy

# Generate Prisma client and run migrations
cd backend
npx prisma generate
npx prisma migrate dev
npx prisma db seed
cd ..

# Start services
cd backend && npx tsx src/index.ts   # :3005
cd frontend && pnpm dev              # :3001
cd ai-service && python -m uvicorn main:app --port 8000
```

## Branch Workflow

| Branch | Purpose |
|--------|---------|
| `main` | Stable, production-ready |
| `develop` | Active development — target your PRs here |
| `feature/your-feature` | Your work |

```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
```

## Submitting a Pull Request

1. Make sure your branch is up to date with `develop`
2. Run tests: `cd backend && pnpm test`
3. Run lint: `pnpm lint`
4. Push and open a PR targeting `develop`
5. Fill in the PR template completely

## Code Standards

- **TypeScript** for backend and frontend — no `any` types without justification
- **Prisma** for all database access — no raw SQL unless necessary
- **Zod** for input validation at API boundaries
- Keep PR scope small — one feature or fix per PR
- Write or update tests for any changed logic

## Cryptography

Changes to encryption, tally, or key ceremony logic require:
- A clear explanation of the cryptographic reasoning
- Reference to the relevant academic paper or standard
- Review from a maintainer before merge

## Commit Messages

```
type: short description

feat: add homomorphic partial tally endpoint
fix: prevent double-vote when session expires mid-cast
docs: update WebAuthn setup instructions
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

## Questions?

Open a [GitHub Discussion](https://github.com/Edwin-Kirimi-Kinuthia/verivote-kenya/discussions) or email dev@verivote.go.ke.
