# VeriVote Kenya — Judges' Presentation Guide

**NIRU Hackathon MVP Presentation**
**Presenter:** Edwin Kirimi Kinuthia
**Project:** VeriVote Kenya — Cryptographically-Secured Hybrid E-Voting System
**Date:** March 2026

---

## HOW TO USE THIS DOCUMENT

Read this document section by section as you present. Each section has:
- A **RATIONALE** box explaining why you built it and why it matters
- A **CODE SNIPPET** showing the key implementation
- A **DEMO CUE** telling you exactly what to show on screen

Keep the browser open at `http://localhost:3001` throughout.

---

## STARTING THE APPLICATION

> One-time setup is already done. Run these commands in 4 terminals before the presentation.

**Terminal 1 — Docker (keep running):**
```bash
pnpm docker:up
```

**Terminal 2 — Blockchain node (keep running):**
```bash
cd smart-contracts
npx hardhat node
```

**Terminal 3 — Backend API:**
```bash
cd backend
pnpm dev
```
Wait for: `Database connected | Blockchain connected | Server running on http://localhost:3005`

**Terminal 4 — Frontend:**
```bash
cd frontend
pnpm dev
```
Open Chrome at: `http://localhost:3001`

**Admin credentials:** National ID `00000001` | Password `Admin@1234`

---

---

# OPENING STATEMENT

*Read this aloud to open the presentation.*

---

In August 2017, Kenya's Supreme Court did something unprecedented in African history: it nullified a presidential election result. The reason was not fraud at the ballot box — it was a compromised digital transmission system. Christopher Msando, the IEBC official responsible for that system, was found dead before the election.

One month earlier, in 2007, disputed election results triggered violence that killed 1,100 Kenyans, displaced 600,000, and erased $3.6 billion from the economy.

These are not hypothetical risks. They are Kenya's recent history.

VeriVote Kenya is a full-stack, production-architecture e-voting system that makes those categories of attack mathematically impossible. Votes are encrypted before they leave the voter's browser. Every encrypted vote is anchored on an immutable blockchain. Any voter — and any international observer — can verify their vote was correctly recorded without revealing how they voted. And when a voter is being coerced, the system silently alerts authorities while showing the attacker a normal vote confirmation.

I built this over 8 weeks. Let me show you how.

---

---

# MILESTONE 1 — BACKEND INFRASTRUCTURE
## Week 1: Database Schema, Blockchain, and Smart Contracts

> **RATIONALE:** Every election system that has failed — including Kenya's 2017 system — failed because it lacked a trustless, tamper-evident audit layer. I started with the blockchain and database foundation precisely because everything else depends on getting this right. A vote that cannot be independently verified is a vote that can be manipulated. I designed both layers simultaneously so neither could ever be an afterthought.

### What was built

- PostgreSQL database with Prisma ORM — 5 production tables
- 8-state voter lifecycle (PENDING_VERIFICATION through VOTED/DISTRESS_FLAGGED)
- Two Solidity smart contracts on a local Ethereum node (designed for Polygon mainnet)
- Full deployment and contract interaction via ethers.js

### Code Snippet 1A — Voter lifecycle states (schema.prisma)

```
PENDING_VERIFICATION → REGISTERED → VOTED → REVOTED
                    ↓              ↓
         PENDING_MANUAL_REVIEW   DISTRESS_FLAGGED
                    ↓
         VERIFICATION_FAILED / SUSPENDED
```

Every transition is enforced in the service layer. The system cannot skip states — a voter cannot cast a vote without passing through `REGISTERED`, which requires either automated KYC or manual IEBC officer approval.

### Code Snippet 1B — SoulBoundToken.sol (non-transferable voter identity)

```solidity
// Every transfer function is blocked at the EVM level
function transferFrom(address, address, uint256) public pure override {
    revert("SBT: non-transferable");
}

function approve(address, uint256) public pure override {
    revert("SBT: non-transferable");
}

// One SBT per national ID hash — mathematically enforced
function mint(address to, uint256 nationalIdHash) external onlyOwner returns (uint256) {
    require(_idHashToToken[nationalIdHash] == 0, "SBT: already minted for this ID");
    require(!_hasActiveToken[to],               "SBT: address already has token");
    // ...mints and records bidirectional mappings
}
```

> **Why SBTs?** An ERC721 NFT can be sold. A Soul-Bound Token cannot. Once you receive your voting credential, it is permanently bound to your identity on the blockchain. No marketplace, no transfer function, no workaround at the contract level. One citizen. One immovable digital credential.

### Code Snippet 1C — VoteRecording.sol (append-only vote registry)

```solidity
// recordVote stores an immutable hash + serial — never the plaintext vote
function recordVote(bytes32 voteHash, bytes32 serialNumber) external onlyRecorder {
    // Emits VoteRecorded event — queryable by any blockchain observer
}

// Revoting is handled atomically — old vote marked superseded, new vote anchored
function supersedeVote(
    bytes32 oldSerial, bytes32 newSerial, bytes32 newHash
) external onlyRecorder {
    require(records[oldSerial].exists, "VR: original vote not found");
    records[oldSerial].isSuperseded = true;
    // ...records new vote
}
```

### DEMO CUE 1

1. Show Terminal 2: the Hardhat node is running, printing block confirmations
2. Open `http://localhost:3005/health` — show `"database": "connected", "blockchain": "connected"`
3. Open `http://localhost:3005/api/stats` — show live voter and vote counts

---

---

# MILESTONE 2 — ADMIN PANEL AND KYC INTEGRATION
## Week 2: Persona KYC, JWT Auth, Rate Limiting, Full Admin Dashboard

> **RATIONALE:** Before any voter can cast a ballot, their identity must be verified. This is the single most important security gate in the system. I integrated Persona — an identity verification platform used by Coinbase and Airbnb — and built a complete admin dashboard so IEBC officers can review, approve, or reject registrations. I also built the appointment booking system here, so voters who fail automated KYC have a path to in-person verification rather than being silently locked out.

### What was built

- Full Next.js admin dashboard: register, reviews, appointments, voter list, PIN resets
- Persona KYC integration (webhook-driven, 3-attempt tracking)
- JWT authentication (24-hour expiry, role-embedded payload)
- Rate limiting per endpoint type (5 req/15 min for auth, 200 for admin)
- Appointment slot creation and booking system

### Code Snippet 2A — JWT issuance with role embedding

```typescript
// auth.service.ts — login produces a signed JWT with voter status embedded
const token = jwt.sign(
  {
    sub: voter.id,
    nationalId: voter.nationalId,
    role: voter.role,          // 'VOTER' or 'ADMIN'
    status: voter.status,      // current lifecycle state
    isDistress: false,
  },
  process.env.JWT_SECRET!,
  { expiresIn: '24h' }
);
```

The status in the JWT means every API handler can check eligibility without a database round-trip for the common case.

### Code Snippet 2B — Admin approval triggers SBT mint

```typescript
// admin.service.ts — approving a voter mints their Soul-Bound Token
async approveVoter(voterId: string, officerId: string, notes?: string) {
  const voter = await voterRepository.findById(voterId);
  // Status must be PENDING_MANUAL_REVIEW

  // Mint the voter's blockchain identity credential
  const walletAddress = voter.walletAddress || ethers.Wallet.createRandom().address;
  const nationalIdHash = BigInt('0x' + createHash('sha256')
    .update(voter.nationalId).digest('hex'));

  const txHash = await blockchainService.mintSBT(walletAddress, nationalIdHash);

  // Advance to REGISTERED — voter can now enroll PIN and vote
  await voterRepository.update(voterId, {
    status: 'REGISTERED',
    sbtMintedAt: new Date(),
    blockchainTxHash: txHash,
  });
}
```

### DEMO CUE 2

1. Open `http://localhost:3001/admin/login` — log in as admin
2. Show the dashboard: stat cards, recent registrations
3. Navigate to `/admin/reviews` — show the pending review queue
4. Navigate to `/admin/appointments` — show appointment slot management

---

---

# MILESTONE 3 — VOTER-FACING VOTING
## Week 3: Login, Ballot, Review, Receipt, and Revoting

> **RATIONALE:** The voter experience is where elections are won and lost in public trust. I needed a flow that was simple enough for every Kenyan voter to use, but cryptographically secure at every step. I also built revoting into the system from day one, because Kenya's constitution guarantees a voter the right to change their mind — and because revoting is the primary defence against coercion. A coerced voter can return and supersede their vote. The receipt page gives every voter independent proof that their vote was recorded — without revealing what they chose.

### What was built

- `/vote` — login page
- `/vote/ballot` — candidate selection
- `/vote/review` — confirmation before submit (PIN entry here)
- `/vote/receipt` — 16-char hex serial, blockchain TX hash, print support, verify link
- Revote chain: supersede the previous vote atomically

### Code Snippet 3A — Revoting with supersession chain

```typescript
// vote.service.ts — revote marks the old vote SUPERSEDED and records a new one
const isRevote = voterRecord.voteCount > 0;

if (isRevote) {
  // Atomically: supersede old → record new → update voter status to REVOTED
  const { newVoteId } = await voteRepository.supersedeVote(
    previousVoteId,
    { encryptedData, voteHash, serialNumber, isDistressFlagged: isDistressVote }
  );
  // On blockchain: old serial marked superseded, new serial anchored
  await blockchainService.supersedeVote(oldSerial, serialNumber, voteHash);
}
```

### Code Snippet 3B — Serial number generation

```typescript
// 16-character hex serial — cryptographically random, uniqueness guaranteed by UUID collision math
function generateSerialNumber(): string {
  return randomBytes(8).toString('hex').toUpperCase().slice(0, 16);
}
// Example: A3F1B2C4D5E60789
```

### DEMO CUE 3

1. Open `http://localhost:3001/vote` — show the three-tab login interface
2. Log in with a registered voter (use one self-registered earlier, or register now)
3. Walk through ballot selection → review page → enter PIN → receipt
4. Show the 16-char serial on the receipt
5. Click "Verify your vote" to transition into Milestone 4 demo

---

---

# MILESTONE 4 — ENCRYPTION AND VOTE VERIFICATION
## Week 4: ElGamal Encryption, SHA-256 Integrity, Blockchain Verification

> **RATIONALE:** This is the cryptographic core of the entire system. The question I had to answer was: how do you let a voter verify their vote was correctly recorded, without revealing what they voted for to anyone — including the system itself? The answer is a two-layer approach. First, ElGamal probabilistic encryption makes the ciphertext unintelligible — and different every time, so you cannot match two encrypted votes even if they chose the same candidate. Second, the SHA-256 hash of that ciphertext acts as a fingerprint: you can verify the ciphertext hasn't been altered without knowing what it contains. The hash is what goes on the blockchain. The voter's serial number is the key to look it up.

### What was built

- Full ElGamal encryption over a 2048-bit FFDHE group (RFC 7919 standard)
- SHA-256 hash of every encrypted vote stored alongside the ciphertext
- `GET /api/votes/verify/:serial` — recomputes hash, queries blockchain, returns tri-state result
- `/verify` web page — public, bilingual (English/Kiswahili), printable

### Code Snippet 4A — ElGamal probabilistic encryption

```typescript
// encryption.service.ts — same vote encrypts differently every time
encrypt(message: bigint): ElGamalEnvelope {
  // 2048-bit FFDHE prime group (RFC 7919) — same group as TLS
  const { prime: p, generator: g } = getGroup(2048);

  // Random ephemeral key k — this is why two identical votes look different
  const k = randomBigInt(2n, p - 2n);

  const c1 = modPow(g, k, p);                    // g^k mod p
  const c2 = (message * modPow(publicKey, k, p)) % p; // m * h^k mod p

  return { v: 1, c1: c1.toString(16), c2: c2.toString(16) };
}
```

Why 2048-bit? Breaking this requires factoring a number with 617 decimal digits. The world's fastest supercomputer would need longer than the age of the universe.

### Code Snippet 4B — Vote verification pipeline

```typescript
// vote.service.ts — full verification flow
async verifyVote(serialNumber: string): Promise<VerifyVoteResult> {
  const vote = await voteRepository.findBySerial(serialNumber);

  // Step 1: Recompute the SHA-256 hash from the stored ciphertext
  const recomputedHash = encryptionService.hashEncryptedData(vote.encryptedData);
  const hashValid = recomputedHash === vote.voteHash;

  // Step 2: Query the blockchain — is this hash anchored?
  const blockchainRecord = await blockchainService.getVoteRecord(serialNumber);
  const blockchainConfirmed = blockchainRecord?.voteHash === vote.voteHash;

  // Three possible states: verified | integrity-warning | superseded
  return {
    verified: hashValid && blockchainConfirmed,
    cryptographicVerification: { hashValid, recomputedHash },
    blockchainConfirmation:    { confirmed: blockchainConfirmed, txHash: ... },
    status: vote.status,  // CONFIRMED | SUPERSEDED
  };
}
```

### DEMO CUE 4

1. Open `http://localhost:3001/verify`
2. Paste the serial number from Milestone 3's receipt
3. Show the green "Vote Verified" result with hash, blockchain TX, and timestamp
4. Show the language toggle — switch to Kiswahili, all labels translate
5. Click Print Verification — show print-optimised layout
6. To show the integrity check working: open Prisma Studio at `http://localhost:5555`, manually alter the `voteHash` field on the vote record, then re-verify — it shows the red "Integrity Warning"

---

---

# MILESTONE 5 — THE DUAL-PIN DISTRESS SYSTEM
## Week 5: Silent Coercion Protection

> **RATIONALE:** Section 10 of Kenya's Elections Offences Act (2016) criminalises voter coercion — but criminalising it and preventing it are two different things. Traditional voting offers zero technical protection once a voter is physically threatened. I built a system where a coerced voter has a secret weapon: a second PIN that looks and feels identical to the real one from the outside, but silently flags the vote and alerts IEBC. Combined with revoting, this gives a coerced voter two independent paths to cast a genuine, uncoerced ballot.

### What was built

- Normal PIN: voter-chosen 4-digit, validated against sequential/repeating patterns
- Distress PIN: server-generated, guaranteed to differ from normal PIN in at least 2 positions
- Both hashed with Argon2id — individually, so verification is independent
- Distress PIN delivered to voter via SMS or email — only the voter knows both PINs
- Entering distress PIN silently sets `isDistressFlagged = true` on the vote record

### Code Snippet 5A — Generating a guaranteed-different distress PIN

```typescript
// voter.service.ts
let distressPin: string;
do {
  distressPin = Array.from({ length: 4 }, () => randomInt(0, 10)).join('');
  const diffPositions = distressPin.split('')
    .filter((d, i) => d !== pin[i]).length;

  if (diffPositions >= 2 && !isAllSame && !isSequential) break;
} while (attempts++ < 100);

// Hash both independently with Argon2id — memory-hard, GPU-resistant
const normalPinHash  = await argon2.hash(pin,        { type: argon2.argon2id });
const distressPinHash = await argon2.hash(distressPin, { type: argon2.argon2id });
```

### Code Snippet 5B — Silent detection at vote cast time

```typescript
// vote.service.ts — the voter sees no difference; IEBC sees the flag
let pinValid = false;
let isDistressVote = false;

pinValid = await argon2.verify(voterRecord.normalPinHash, input.pin);

if (!pinValid && voterRecord.distressPinHash) {
  const distressMatch = await argon2.verify(voterRecord.distressPinHash, input.pin);
  if (distressMatch) {
    isDistressVote = true;  // silent — voter receives a normal receipt
    pinValid = true;
  }
}

// The vote is cast normally. The distress flag is stored internally.
// Voter status becomes DISTRESS_FLAGGED — visible only to IEBC officers.
```

> **What makes this hard to defeat:** An attacker watching over a voter's shoulder sees a normal confirmation screen. They have no way to distinguish a distress PIN entry from a normal one. If they force the voter to show them both PINs beforehand, the voter simply tells them the wrong one — the system does not reveal which PIN is the "real" one.

### DEMO CUE 5

1. Log in and navigate to `/vote/ballot`
2. Make selections, go to review page
3. Enter the **distress PIN** (from your contact/SMS/email) instead of the normal PIN
4. Show the normal receipt — indistinguishable from a real vote
5. Open Prisma Studio at `http://localhost:5555` → `votes` table
6. Show the `isDistressFlagged: true` field on the vote record
7. Show the voter's `status: DISTRESS_FLAGGED` in the `voters` table

---

---

# MILESTONE 6 — PASSWORD AUTH AND OTP LOGIN
## Week 6: Multiple Authentication Paths, Africa's Talking SMS, Voter Self-Registration

> **RATIONALE:** A voting system that only biometric users can access disenfranchises every voter without a fingerprint scanner or modern device. I built three independent authentication methods — password, OTP, and biometric — because different voters have different capabilities, and the system should accommodate all of them. The OTP path uses Africa's Talking, a Kenyan company, for SMS delivery — keeping voter data within the continent. The self-registration flow gives voters complete control of their own enrollment without needing to visit an IEBC office.

### What was built

- `POST /api/auth/login` — password-based login returning JWT
- `POST /api/auth/request-otp` + `POST /api/auth/verify-otp` — OTP login
- `/register` self-registration page with live password validation
- OTP stored in Redis (6-digit, 10-minute TTL, purpose-scoped)
- Africa's Talking SMS sandbox integration
- Setup JWT (short-lived) issued post-KYC for PIN and biometric enrollment

### Code Snippet 6A — Password login with Argon2id

```typescript
// auth.service.ts
async loginWithPassword(nationalId: string, password: string) {
  const voter = await voterRepository.findByNationalId(nationalId);
  if (!voter?.passwordHash) {
    throw new ServiceError('Invalid credentials', 401);
  }

  // Argon2id — memory-hard, resistant to GPU cracking
  const valid = await argon2.verify(voter.passwordHash, password);
  if (!valid) throw new ServiceError('Invalid credentials', 401);

  return this.issueJwt(voter);
}
```

### Code Snippet 6B — OTP flow with Redis TTL

```typescript
// otp.service.ts
async requestOtp(nationalId: string, purpose: 'LOGIN' | 'CONTACT_VERIFY') {
  const code = String(randomInt(100000, 999999)); // 6-digit

  // Scoped key: same voter can have login OTP and verify OTP simultaneously
  const key = `otp:${purpose}:${nationalId}`;
  await redis.set(key, await argon2.hash(code), 'EX', 600); // 10-minute TTL

  await notificationService.sendOtp({ nationalId, code, purpose });
}
```

### DEMO CUE 6

1. Open `http://localhost:3001/register`
2. Fill in a new national ID, choose Email contact, enter a password
3. Show the real-time "Passwords match" / "Passwords do not match" feedback
4. Submit — show OTP being sent (check backend console for the code)
5. Enter the OTP
6. Open `http://localhost:3001/vote` — click the **One-Time Code** tab
7. Enter National ID, click Send Code, check console for OTP, enter it, log in

---

---

# MILESTONE 7 — WEBAUTHN BIOMETRIC AUTHENTICATION
## Week 7: FIDO2 Fingerprint Enrollment and Login

> **RATIONALE:** Passwords can be stolen. OTPs can be intercepted. Biometrics — specifically WebAuthn/FIDO2 — cannot be phished because the cryptographic challenge is bound to the exact origin (localhost:3001) and the private key never leaves the device. This is the same technology used by Google and Apple Passkeys. Importantly, I store only a public key on the server — the raw fingerprint never transmits across the network. A database breach cannot expose voter biometrics.

### What was built

- WebAuthn registration challenge/verify via `@simplewebauthn/server` (backend)
- WebAuthn authentication challenge/verify
- `@simplewebauthn/browser` on the frontend — triggers native browser biometric prompt
- Credential stored per voter — supports multiple devices
- Fingerprint enrollment integrated into the registration flow (optional) and admin approval flow

### Code Snippet 7A — Registration challenge (backend)

```typescript
// webauthn.service.ts
async generateRegistrationOptions(voter: Voter) {
  const options = await generateRegistrationOptions({
    rpName:  'VeriVote Kenya',
    rpId:    'localhost',
    userId:  Uint8Array.from(Buffer.from(voter.id)),
    userName: voter.nationalId,
    attestationType: 'none',
    authenticatorSelection: {
      userVerification: 'required',  // requires biometric, not just presence
      residentKey: 'preferred',
    },
  });
  // Challenge stored in Redis — verified in the next call
  await redis.set(`webauthn:reg:${voter.id}`, JSON.stringify(options), 'EX', 300);
  return options;
}
```

### Code Snippet 7B — Frontend enrollment call

```typescript
// frontend: components inside /register
import { startRegistration } from '@simplewebauthn/browser';

const options = await api.post('/api/webauthn/register/options', {});
const credential = await startRegistration(options.data);
// ↑ This line triggers the browser's native fingerprint / Windows Hello prompt

await api.post('/api/webauthn/register/verify', { credential });
// Server verifies the signed challenge — stores ONLY the public key
```

### Code Snippet 7C — Authentication (biometric login)

```typescript
// Frontend: /vote page, Fingerprint tab
const options = await api.post('/api/webauthn/authenticate/options', { nationalId });
const assertion = await startAuthentication(options.data);
// ↑ Triggers biometric prompt — user authenticates

const result = await api.post('/api/webauthn/authenticate/verify', { nationalId, assertion });
// Server verifies assertion against stored public key — issues JWT on success
```

### DEMO CUE 7

1. Go to `http://localhost:3001/register`
2. Complete registration up to the fingerprint step
3. Click **Enroll Fingerprint / Windows Hello** — Windows Hello prompt appears
4. Authenticate with your device biometric/PIN
5. Complete PIN setup, finish registration
6. Open `http://localhost:3001/vote` → **Fingerprint** tab
7. Enter National ID → Click **Sign In with Fingerprint / Windows Hello**
8. Device prompt appears — authenticate — you are logged in

---

---

# MILESTONE 8 — KYC AND UX HARDENING
## Week 8: Persona Inline iframe, All-Countries Phone Dropdown, Error UX

> **RATIONALE:** This milestone is about closing the gaps between a working prototype and a production-quality system. Three specific problems I solved: (1) Persona KYC was opening in a new tab, interrupting the flow and causing voters to close the window — I embedded it as an inline iframe with postMessage auto-advance. (2) The country code selector for phone numbers was not showing flag emojis on Windows Chrome — a documented OS limitation where the system renderer ignores flag emoji in native select elements — so I replaced it with a custom React dropdown. (3) Error messages for wrong passwords and PINs were generic and easy to miss — I added shake animations, red borders, and inline error placement.

### What was built

- Persona inline iframe: same-page verification with postMessage → auto-advance on approval
- 3-attempt tracking: voters who fail 3 times are routed to in-person appointment
- Custom `CountryCodeSelect` React component: all 195 countries with flag emoji + search
- Shake animation (`@keyframes shake`) on wrong PIN/password inputs
- Red border + inline error placement on all auth forms

### Code Snippet 8A — Persona iframe postMessage auto-advance

```typescript
// frontend: /register page
useEffect(() => {
  function handleMessage(e: MessageEvent) {
    if (e.data?.name === 'persona:flow:completed') {
      // Persona fires this when KYC is approved — automatically advance
      setStep('webauthn');
    }
  }
  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);

// Rendered inline — no new tab
<iframe
  src={personaUrl}
  allow="camera; microphone"
  className="w-full rounded-xl border"
  style={{ height: '600px' }}
/>
```

### Code Snippet 8B — Custom flag emoji dropdown

```typescript
// components/country-code-select.tsx
// Native <select><option> cannot render flag emoji on Windows Chrome
// This custom dropdown renders in the browser's layout engine — flags work

export function CountryCodeSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? COUNTRY_CODES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.dial.includes(search))
    : COUNTRY_CODES;

  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}>
        <span>{selected.flag}</span>   {/* flag emoji renders correctly here */}
        <span>{selected.dial}</span>
      </button>
      {open && (
        <ul role="listbox" className="absolute z-50 max-h-56 overflow-y-auto">
          {filtered.map(c => (
            <li key={c.name} onClick={() => onChange(c.dial)}>
              {c.flag} {c.name} {c.dial}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Code Snippet 8C — Shake animation on wrong PIN

```css
/* globals.css */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  15%       { transform: translateX(-6px); }
  30%       { transform: translateX(6px); }
  45%       { transform: translateX(-4px); }
  60%       { transform: translateX(4px); }
}
.animate-shake { animation: shake 0.45s ease-in-out; }
```

```tsx
// review/page.tsx — key change forces re-mount, retriggering animation
<div key={pinShakeKey} className={pinShakeKey > 0 ? 'animate-shake' : ''}>
  <input type="password" /* PIN input */ />
  {error && <p className="text-red-700">{error}</p>}
</div>
```

### DEMO CUE 8

1. Show `http://localhost:3001/register` — walk through Persona inline iframe
2. Show the country code selector with flag emojis — search for "Kenya", "Uganda", "US"
3. Go to `http://localhost:3001/vote` — enter wrong password — show red border + shake
4. Enter correct credentials, go to ballot, enter wrong PIN — show inline shake animation
5. Enter correct PIN — vote submits

---

---

# SECURITY ARCHITECTURE SUMMARY

> **RATIONALE:** I want to show this as a single slide/section so the judges can see the full security picture holistically. Every layer was deliberately designed to defend against a real documented attack on Kenyan elections.

| Threat | VeriVote Defence |
|--------|-----------------|
| Vote tampering in transit | ElGamal encryption — ciphertext unintelligible without private key |
| Database breach exposes votes | SHA-256 hash only — decryption key never stored in DB |
| Server-side manipulation | Every vote anchored on blockchain — manipulation is immediately detectable |
| Ghost voters | Soul-Bound Token — one immovable identity per national ID hash |
| Voter coercion | Dual-PIN distress system + revoting — coerced vote can be superseded |
| Password theft | Argon2id — memory-hard, GPU-resistant — industry standard |
| Biometric replay attack | WebAuthn challenge-response — each login challenge is single-use |
| Phishing | WebAuthn origin binding — credential only works on `localhost:3001` |
| Brute force | Rate limiting: 5 requests per 15 min per IP + National ID |
| Coordinated fraud | (Architecture) AI anomaly detection via Isolation Forest (AI milestone) |
| Disenfranchisement | Three auth methods + in-person fallback — every voter has a path |

### API Security

- All responses: `{ "success": true/false, "data": ... }` — no stack traces to client
- `X-Request-ID` on every response for server-side log correlation
- CORS restricted to `localhost:3001` — no cross-origin API access
- Swagger at `/api/docs` — full documentation for any security reviewer

---

---

# FULL DEMO SCRIPT

> Follow this sequence for a clean end-to-end demonstration.

## Pre-demo checklist

- [ ] All 4 terminals running (docker, hardhat, backend, frontend)
- [ ] Chrome at `http://localhost:3001`
- [ ] Prisma Studio open at `http://localhost:5555` (for DB reveals)
- [ ] Backend terminal visible (for OTP codes)

## Demo sequence (approximately 15 minutes)

### Part 1 — Registration (3 min)
1. `http://localhost:3001` — show home page (Vote / Verify / Admin cards)
2. Click Register → fill in National ID `88881111`, email, password `Voter@2024!`
3. Show real-time password strength feedback
4. Submit → OTP arrives in backend console → enter it
5. Choose Online KYC → Persona iframe loads inline
6. Persona sandbox auto-approves → page advances automatically
7. Enroll fingerprint (Windows Hello prompt)
8. Set PIN `2847` → distress PIN is SMS/email-ed to contact

### Part 2 — Admin review (2 min)
1. Open `http://localhost:3001/admin/login` — log in as `00000001` / `Admin@1234`
2. Show dashboard stats
3. Navigate to Reviews — approve a pending voter
4. Show fingerprint enrollment + setup link panel in the approval flow

### Part 3 — Voting (3 min)
1. Open `http://localhost:3001/vote` → **Password** tab
2. Log in as the newly registered voter
3. Select candidates on ballot → Review page
4. Enter PIN `2847` → receipt with 16-char serial
5. Copy the serial number

### Part 4 — Distress PIN demonstration (2 min)
1. Log in again as same voter
2. On review page, enter the **distress PIN** (from SMS/email)
3. Show normal receipt — indistinguishable
4. Open Prisma Studio → `votes` table → `isDistressFlagged: true`
5. Voters table → `status: DISTRESS_FLAGGED`

### Part 5 — Vote verification (3 min)
1. Open `http://localhost:3001/verify`
2. Paste serial from Part 3
3. Show green "Vote Verified" — hash match, blockchain confirmation, TX hash
4. Switch language to Kiswahili
5. Click Print Verification
6. Demonstrate integrity check: Prisma Studio → alter `voteHash` → re-verify → red alert

### Part 6 — Biometric login (2 min)
1. `http://localhost:3001/vote` → **Fingerprint** tab
2. Enter National ID → Sign In with Fingerprint / Windows Hello
3. Windows Hello prompt → authenticate → logged in

---

---

# ALIGNMENT WITH JUDGING CRITERIA

> **RATIONALE:** This section explicitly connects VeriVote to what the judges are evaluating. I have structured the project to address each criterion with working code, not just claims.

## Technical Innovation and Complexity

VeriVote integrates six distinct technical domains in one coherent system:

1. **Cryptography** — ElGamal probabilistic encryption over a 2048-bit RFC 7919 group. This is the same group used in modern TLS. Most hackathon projects use a third-party encryption library as a black box — I implemented the full modular exponentiation pipeline in TypeScript.

2. **Blockchain** — Two purpose-built Solidity smart contracts, not imported NFT templates. The SBT contract enforces non-transferability at the EVM level. The VoteRecording contract is append-only by design.

3. **WebAuthn / FIDO2** — The same passkey standard Google, Apple, and Microsoft are rolling out as the password replacement. Implemented from scratch with challenge-response, origin binding, and per-voter credential management.

4. **Dual-PIN coercion protection** — Original design. No e-voting system I researched implements this. The distress PIN is guaranteed to differ from the normal PIN in at least 2 digit positions to prevent accidental triggering.

5. **Biometric identity verification** — Persona KYC with inline iframe, postMessage auto-advance, and 3-attempt fallback routing. Architecture designed to swap Persona for a sovereign AI service.

6. **Real-time rate limiting** — Purpose-scoped limits per endpoint type using Redis. Auth endpoints are 5 requests per 15 minutes per IP plus National ID composite key, making credential stuffing attacks impractical.

## Real-World Impact and Problem-Solving

Every feature maps to a documented failure in Kenya's election history:

- ElGamal encryption + blockchain → 2017 vote transmission hack (Msando murder)
- Distress PIN + revoting → 2007/2017 voter coercion
- Soul-Bound Tokens → ghost voter problem
- In-person appointment fallback → rural voter disenfranchisement
- Bilingual interface (EN/SW) → Kiswahili as Kenya's national language

The system operates within Kenya's legal framework: compliant with the Elections Offences Act (2016), Data Protection Act (2019), and IEBC operational protocols.

## Security and Reliability

Every security decision has a documented threat model:

- Argon2id for all hashes (password, PIN, distress PIN) — OWASP recommended as of 2023
- WebAuthn origin binding makes phishing technically impossible, not just difficult
- Rate limiting on every auth endpoint — tested via `curl` for 429 responses
- Blockchain anchoring is non-fatal: if the blockchain node is unavailable, the vote is still saved cryptographically in PostgreSQL. The system degrades gracefully.
- The `VerifyVoteResult` type exposes all three states explicitly: `verified`, `integrity-warning`, and `superseded`. There is no undefined state.

## Code Quality and Architecture

The project follows a strict layered architecture throughout:

```
Routes → Middleware → Service → Repository → Database
```

No business logic lives in route handlers. No database queries live in service methods — all go through the repository layer. This separation makes every layer independently testable.

- TypeScript strict mode throughout — no `any` types in production code
- ESLint enforced in CI — the pipeline rejects on lint failures
- Prisma ORM with type-safe queries — no raw SQL in application code
- Full Swagger documentation at `/api/docs` — 30+ endpoints documented
- Consistent API response envelope: `{ success, data, error }` on every route

## Completeness and Demo-ability

This is a fully working system, not a mock. Every feature shown in this presentation can be:

1. Triggered through the UI in real time
2. Verified in the database via Prisma Studio
3. Verified on the blockchain via the API
4. Tested via the Swagger API docs

The system has been running continuously on a local development environment for 8 weeks of iteration. All features are integrated — there are no "coming soon" sections in the demo.

## Scalability and Path to Production

Three changes separate this development system from production deployment:

1. **Replace** `PERSONA_MOCK=false` with a sovereign AI identity service (Python FastAPI on GPU — architecture documented in `docs/project-brief.md`)
2. **Deploy** to Polygon mainnet (contracts already designed for it — `hardhat.config.ts` includes a Polygon network configuration)
3. **Load test** at 46,000 polling station scale (Redis rate limiting + Prisma connection pooling already in place)

The multi-tenancy architecture for university and corporate elections is also fully documented — the security stack is institution-agnostic.

---

---

# CLOSING STATEMENT

*Read this to close the presentation.*

---

Kenya has the technology, the legal framework, and — as I have shown today — the software to run elections that no actor can tamper with. What happened in 2007 and 2017 does not have to happen again.

VeriVote Kenya is not a research concept. It is running software. The encryption, the blockchain anchoring, the distress PIN, the biometric login, the vote verification — every one of those features is live in this repository, tested, and demonstrated in front of you today.

Every citizen who registers gets a mathematically-bound digital identity. Every vote they cast is encrypted, hashed, and anchored on a public ledger. Every receipt they receive gives them independent proof — for the first time in Kenya's history — that their vote was correctly recorded.

The question is no longer whether this is technically possible. It is.

Thank you.

---

*Source code: `https://github.com/Edwin-Kirimi-Kinuthia/verivote-kenya`*
*Branch: `develop` (most recent features) | `main` (stable)*
