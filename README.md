# 🗳️ VeriVote Kenya

**Hybrid Electronic Voting System for Kenya**

A secure, transparent, and verifiable voting system that combines the trustworthiness of paper ballots with cutting-edge cryptography and artificial intelligence.

---

## 🌟 Features

- **Soul-Bound Tokens (SBTs)** - Tamper-proof digital voter identity
- **Zero-Knowledge Proofs** - Verify votes without revealing choices
- **Blockchain Recording** - Immutable, transparent vote storage
- **Homomorphic Encryption** - Privacy-preserving vote tallying
- **Distress PIN** - Coercion resistance mechanism
- **AI Security Layer** - Real-time fraud detection
- **Multiple Voting** - Voters can change their vote (only last counts)
- **Paper Audit Trail** - Post-election printing for recounts

---

## 🛠️ Tech Stack

| Category | Technologies |
|----------|-------------|
| **Backend** | Node.js, TypeScript, Express.js, Prisma ORM |
| **Database** | PostgreSQL 16, Redis 7 |
| **Blockchain** | Polygon (Ethereum L2), Solidity |
| **Frontend** | React, Next.js, Tailwind CSS |
| **AI/ML** | Python, scikit-learn, OpenAI API |
| **DevOps** | Docker, GitHub Actions |

---

## 📁 Project Structure

```
verivote-kenya/
├── backend/              # Node.js + TypeScript API
│   ├── prisma/           # Database schema & migrations
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── index.ts      # Server entry point
│   │   ├── database/     # Prisma client
│   │   ├── repositories/ # Data access layer
│   │   └── types/        # TypeScript definitions
│   └── package.json
├── frontend/             # Next.js web application
├── smart-contracts/      # Solidity contracts
├── docs/                 # Documentation
├── .github/workflows/    # CI/CD pipelines
├── docker-compose.yml    # Local development services
└── package.json          # Root monorepo config
```

---

## 🐳 Docker Services

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Main database |
| Redis | 6379 | Caching & sessions |

---

## 📚 API Documentation

### Health Check
```
GET /health
```
Returns server status and uptime.

### Statistics
```
GET /api/stats
```
Returns database statistics for voters, votes, and polling stations.

### Voters
```
POST /api/voters/register    # Register new voter
POST /api/voters/verify-pin  # Verify voter PIN
GET  /api/voters/:id/status  # Get voter status
```

### Votes
```
POST /api/votes/cast         # Cast a vote
GET  /api/votes/verify/:id   # Verify a vote
```

---

## 🧪 Testing

```bash
cd backend
pnpm test
```

---

## 🔐 Security Features

1. **PIN Security** - Argon2 hashing, rate limiting
2. **Distress PIN** - Silent coercion alert
3. **Encryption** - AES-256 for data, homomorphic for votes
4. **ZKPs** - Vote validity proofs
5. **Blockchain** - Tamper-proof audit trail
6. **AI Monitoring** - Anomaly detection

---

## 📅 Development Roadmap

| Week | Focus |
|------|-------|
| 1 | Foundation & Infrastructure |
| 2 | Voter Registration & SBT |
| 3 | Vote Casting & Encryption |
| 4 | Verification & Print System |
| 5 | Public Portal & Real-time |
| 6 | AI Security Layer |
| 7 | Polish & Security |
| 8 | Testing & Demo |

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- IEBC Kenya for electoral process insights
- Hyperledger & Polygon communities
- Open-source cryptography libraries

---

**Built with ❤️ for Kenyan Democracy**
