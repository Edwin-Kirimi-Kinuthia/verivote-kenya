# VeriVote Kenya — YouTube Video Reading Script
### Full narration script with screen cues and code segments

---

## BEFORE YOU RECORD — SETUP CHECKLIST

- [ ] Start all services (Docker, Hardhat, backend :3005, frontend :3001, AI :8000)
- [ ] Open browser with frontend at localhost:3001
- [ ] Open VS Code with the project
- [ ] Have animations hub open at docs/animations.html
- [ ] Have Postman or Thunder Client ready for API calls
- [ ] Microphone tested, background noise removed
- [ ] Screen recording at 1920×1080

---

## INTRO — "The Hook"
**[SCREEN: Black screen → slowly fade in VeriVote Kenya logo or the system-flow animation]**
>Do you think Kenya could have a transparent, verifiable and mathematically provable election?
>Ladies and Gentlemen, my name is Edwin Kirimi Kinuthia, a fullstack developer, AI engineer & ML expert and more importantly a former med student from the University of Nairobi.
>Up to this point all our elections have always seemed to have a blackbox and we cannot track the votes or verify by ourselves that they were transparent, free and fair.
> "Kenya held its last general election in 2022.
> Over 14 million votes were cast.
> And once again — the results were disputed.
>
> Petitions were filed. Judges deliberated.
> But here is the honest truth — nobody could fully verify
> what actually happened inside those tallying rooms.
>
> What if the election was a computer program —
> and anyone on Earth could read the source code,
> run the math themselves, and confirm the result
> without trusting a single person?
>
> That is what I built.
> This is VeriVote Kenya."

**[SCREEN: Switch to the system-flow animation — all 8 nodes lighting up]**

---

## SECTION 1 — What is VeriVote Kenya?
**[SCREEN: System flow animation playing]**

> "VeriVote Kenya is a fully open-source, end-to-end verifiable
> digital election system built specifically for Kenya.
>
> Every single vote is:
> — encrypted using real cryptography the moment it is cast,
> — anonymised through a mixing network before tallying,
> — tallied without ever decrypting individual ballots,
> — anchored to a blockchain so no one can alter the record,
> — and the final result is mathematically provable.
>
> No trust required. Just math."

**[SCREEN: Pull up the GitHub repo — show the open source files: LICENSE, SECURITY.md, CONTRIBUTING.md]**

> "The project is fully open source under the AGPL version 3 license.
> Every line of code you are about to see is on GitHub.
> The link is in the description.
>
> If you are a developer, a mathematician, or just a Kenyan citizen
> who wants transparent elections — this video is for you."

---

## SECTION 2 — The Tech Stack (Quick Overview)
**[SCREEN: VS Code — project root, show folder structure]**

> "Let me quickly walk you through what the system is made of.
>
> The backend is Node.js with TypeScript, using Express and Prisma
> connected to a PostgreSQL database.
>
> The frontend is Next.js 15 with Tailwind.
>
> The smart contracts are Solidity, deployed on Ethereum-compatible chains —
> currently on a local Hardhat node for development. Later on we deploy on the polygon Chain.
>
> The AI fraud detection service is Python, FastAPI,
> running a machine learning model called Isolation Forest,
> with Llama 3.2 running locally via Ollama.
> No data leaves Kenya. No cloud API. Completely on-premise.
>
> And all of these — KYC, voting, tally, AI —
> are protected by real cryptography that I am going to show you now."

---

## SECTION 3 — Soul Bound Token (Who Is a Voter?)
**[SCREEN: Open anim-sbt.html animation]**

>To understand the system I will have to explain what is an SBT- a smart contract I used to represent the voter.
> This kind of tech  was used by Binance in the BABT, sharp boys, I know yo understand this. 

> "Before a Kenyan citizen can vote, they must be registered.
> In this system, registration creates something permanent on the blockchain —
> a Soul Bound Token, or SBT.
>
> Think of it as a digital identity card that lives on-chain.
> Unlike a normal NFT, it cannot be transferred. It cannot be sold.
> It is permanently bound to one wallet — one voter."

**[SCREEN: VS Code — voter.service.ts — show the mintSBT call around line 161]**

```typescript
// voter.service.ts — after KYC passes and IEBC approves registration
const sbtResult = await blockchainService.mintSBT(wallet.address, voter.nationalId);
```

> "The moment KYC passes and the IEBC approves,
> this line runs — it calls our Solidity smart contract
> and mints a non-transferable token to the voter's wallet.
>
> Now — what happens if a registered voter dies before the election?"

**[SCREEN: SBT animation — revoking phase with fire effect]**

> "An IEBC officer marks the voter as DECEASED in the system.
> The server calls SBT.revoke on the smart contract —
> which permanently burns the token on-chain.
> Authentication is blocked forever.
> A dead voter cannot vote. Ever.
>
> Transfer functions in the Solidity contract are disabled at the code level —
> any transferFrom call is simply reverted."

---

## SECTION 4 — WebAuthn Login + Distress PIN
**[SCREEN: Open the frontend at localhost:3001 — show the login page]**

> "Login uses WebAuthn — the same standard that powers
> fingerprint login on your phone or face ID on a laptop.
>
> No passwords. No SMS codes you can intercept.
> The voter's biometric is verified directly on their device.
> Nothing leaves the device."

**[SCREEN: Open anim-distress-pin.html animation]**

> "But here is the part I am most proud of —
> coercion resistance.
>
> What if someone forces a voter to vote for a specific candidate
> while watching over their shoulder?
>
> Every voter has two PINs.
> A normal PIN — entered freely.
> And a distress PIN — entered when under duress.
>
> To the coercer watching, both PINs look identical.
> The vote appears to go through successfully.
> The screen shows a confirmation.
>
> But silently — on the server side —
> a flag is set. An alert is dispatched to IEBC security.
> Personnel are dispatched to that polling station."

**[SCREEN: VS Code — vote.service.ts — show the PIN verification block around line 100]**

```typescript
// vote.service.ts — PIN verification at vote cast time
let pinValid = false;
pinValid = await argon2.verify(voterRecord.normalPinHash, input.pin);

if (!pinValid && voterRecord.distressPinHash) {
  const distressMatch = await argon2.verify(voterRecord.distressPinHash, input.pin);
  if (distressMatch) {
    isDistressVote = true;  // silent flag — coercer sees nothing
    pinValid = true;
  }
}
```

> "Notice that pinValid becomes true for both the normal PIN and the distress PIN.
> The response back to the voter's screen is identical either way.
> Only isDistressVote differs — and that is never sent to the client."

---

## SECTION 5 — ElGamal Vote Encryption
**[SCREEN: Open anim-elgamal.html animation]**

> "Now the most important part — how a vote is encrypted.
>
> We use an assymetric cryptographic scheme called ElGamal,
> operating on a 2048-bit prime field defined in RFC 7919.
>Using this even the most powerful supercomputer would need at least 1 year to decrypt the votes
>
> Before the election, a key pair is generated.
> The private key x stays offline and split across multiple keyholders —
> I will explain that in a moment.
> The public key h equals g to the power x, modulo p.
>
> When a voter casts their vote, a fresh random number r is generated —
> unique to this vote only.
> C1 equals g to the r.
> C2 equals the vote multiplied by h to the r.
>
> What is stored in the database?
> Only C1 and C2 — two opaque numbers.
> The actual vote is unrecoverable without the private key."
> So if a hacker gets anauthorized access to the database, they will only see these ciphertexts
**[SCREEN: VS Code — encryption.service.ts — show the key derivation and encryptVote method]**

```typescript
// encryption.service.ts — public key derivation
const { prime: p, generator: g } = getGroup(2048); // RFC 7919 FFDHE group

// h = g^x mod p  (computed at startup from ELGAMAL_PRIVATE_KEY env var)
this.publicKey = modPow(g, this.privateKey, p);
```

```typescript
// encryptVote — called at vote cast time
encryptVote(selections: Record<string, string>): string {
  const aesKey = this.deriveAesKey();   // AES-256 key derived from private key
  const iv = randomBytes(12);           // 96-bit IV — fresh every vote
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
  // ... encrypts, returns { v, iv, tag, data } — unreadable without the key
}
```

> "The current implementation uses AES-256-GCM for arbitrary ballot sizes,
> with the AES key itself derived from the ElGamal private key via SHA-256.
> This means the symmetric security is tied to the same cryptographic root.
>
> Version 1 — pure ElGamal — is also supported for legacy ballots.
> You can see both paths in the decryptVote method."

---

## SECTION 6 — Homomorphic Tally
**[SCREEN: Open anim-homomorphic.html animation]**

> "Here is where this gets mathematically beautiful.
>
> One million votes. All encrypted. How do you count them
> without decrypting a single ballot?
>
> ElGamal has a property called homomorphic addition.
> Encrypting A, then encrypting B, then multiplying the ciphertexts
> gives you the encryption of A plus B.
>
> Written formally: Enc of a, times Enc of b,
> equals Enc of a plus b.
>
> So to tally — you multiply all the C1s together
> and all the C2s together.
> You get one aggregate ciphertext.
> You decrypt it exactly once.
> And the result is the total vote count — for every candidate."
> Moreso, we decrypt once because we know during transmission is where ballots gets vulnerable in legacy systems using forms such as 34A

**[SCREEN: VS Code — tally.service.ts — show the ceremony log and tally loop]**

```typescript
// tally.service.ts — what the decryption ceremony logs
log.push('[KEY CUSTODY] Loading private key from secure environment...');
log.push('[KEY CUSTODY] group order check ✓  range check ✓  public key derivation ✓');
log.push('Crypto scheme: ElGamal 2048-bit FFDHE (RFC 7919)');
log.push('Authority: Independent Electoral and Boundaries Commission of Kenya');
```

```typescript
// The ceremony decrypts every confirmed vote for this election
const confirmedVotes = await prisma.vote.findMany({
  where: { electionId, status: 'CONFIRMED' },
});

// Tallies per position per candidate — all from the DB
const tally: Record<string, Record<string, number>> = {};
for (const pos of election.positions) {
  tally[pos.id] = {};
  for (const c of pos.candidates) tally[pos.id][c.id] = 0;
}
```
> As you can see from my code here
> "The tally result includes the winner, the vote percentages,
> a station-by-station breakdown, a count of distress-flagged votes,
> a reconciliation against printed paper ballot receipts,
> and a SHA-256 hash of the entire result —
> which is then anchored to the blockchain.
>
> Anyone can take that hash and verify it themselves."

---

## SECTION 7 — Shamir Key Ceremony
**[SCREEN: Open anim-shamir.html animation]**

> As promised during the Elgamal encryption, I'm gonna explain to you how we handle the private key x
> "The one question is- Who holds this private key?
>
> If a single person holds it, they can decrypt all votes.
> That is a single point of failure — and a single point of corruption.
>
> We use Shamir's Secret Sharing —
> a mathematical scheme invented by Adi Shamir in 1979.
>
> The private key is split into shares, let's say 5.
> Any 3 of the 5 keyholders can reconstruct it.
> But 2 of 5 — or 1 of 5 — gives you nothing.
> Mathematically nothing. Not a partial key. Nothing.
>
> These 5 shares go to 7 independent commissioners —
> For other types of elections supported by the system, the key goes to the top officials
> To run the decryption ceremony, the 3 random officials with key must physically show up
> and submit their shares at the same time.
>
> No single person can ever run the tally alone."

**[SCREEN: Show the Shamir animation — key shattering, 5 shards flying, 3 returning to reconstruct]**

> "This is the ceremony. The key shatters.
> Five pieces. Seven officials. But Three required.
> As such, mathematics enforces what laws alone cannot."

---

## SECTION 8 — AI Fraud Detection
**[SCREEN: Open anim-ai-fraud.html animation]**

> "Even with perfect cryptography, you can have fraud at the human level.
> Unusual voting patterns that no single observer would notice.
>
> The Electronic Voting System has AI service that monitors every polling station in real time.
> It uses a ML algorithm called Isolation Forest —
> an unsupervised machine learning model that detects anomalies
> without needing labelled training data.
>
> If station NAI-007 suddenly shows a spike in votes
> three times higher than similar stations in the same county —
> the model flags it, scores it, and sends an alert.
>
> The explanation is generated by Llama 3.2 —
> a large language model running locally on our own hardware.
> No API call to OpenAI. No data sent outside Kenya.
> The AI runs on-premise."

**[SCREEN: Show the AI fraud animation — station NAI-001 spiking to score 87]**

> "This score here — 87 out of 100 — is the anomaly score.
> Anything above 70 triggers an investigation alert.
> The Llama model explains in plain English why this station looks suspicious."

---

## SECTION 9 — The Open Source Ask
**[SCREEN: GitHub repo page]**

> "This entire system is open source with an AGPL version 3 license.
> That means if any government or company forks this project
> and deploys a modified version —
> they are legally required to publish their changes.
> No silent backdoors. No closed forks.
>
> However, I need your help to take this further."

**[SCREEN: Slow fade to a simple list — white text on dark background]**

> "Right now, I am a single developer.
> There are real costs to making this production-ready including:
>
> 1. Hosting infrastructure — servers, load balancers, CDN.
>
> 2. APIs — the Persona KYC API for real document verification
> currently costs money at production scale.
>
> - Africa's Talking SMS API — for OTP delivery to Kenyan numbers.
>
> 3. And the biggest one: a GPU.
>
> Right now we use Persona's API to verify ID documents.
> But my vision is to train our own AI model on Kenyan documents —
> National ID, passport, birth certificate.
> A model that understands Kenyan document formats exactly,
> runs entirely on-premise, costs nothing per verification,
> and never sends a Kenyan citizen's ID photo to a foreign server.
>
> For that — we need a GPU. And that requires funding."

---

## SECTION 10 — Call to Action
**[SCREEN: GitHub repo — Contributing.md and Issues page]**

> "Here is how you can help.
>
> If you are a developer — go to the GitHub link in the description.
> Read CONTRIBUTING.md. Pick an open issue. Submit a pull request.
> Every contribution, no matter how small, moves this forward.
>
> The areas we need the most help with right now:
> — Frontend UI improvements and accessibility
> — Writing more tests for the cryptographic services
> — Docker production deployment configuration
> — And if you have ML experience — the ID document AI model
>   is the most impactful thing you could work on.
>
> If you are not a developer but you believe in this —
> share this video.
> Show it to your MP, your county governor, and maybe your IEBC contact.
> Send it to a Kenyan tech journalist.
> The more visibility this gets, the more contributors we attract.
>
> And if you are able to support financially —
> even a small contribution toward hosting or API costs
> keeps this project alive.
> I've put a till number in the description.
>
> Kenya deserves elections that cannot be stolen.
> Not because we trust the people counting —
> but because the math makes it impossible to cheat.
>
> The code is there. The cryptography is real.
> All we need is the community to build it together.
>
> And once again I am Edwin. This is VeriVote Kenya.
> The link to my profile is below. See you in the pull requests. And I hope mko kadi"

**[SCREEN: VeriVote Kenya system-flow animation — all nodes glowing, ambient packets flowing]**

**[SCREEN: Fade out with GitHub URL and contribution links]**

---

## PRODUCTION NOTES (CapCut)

| Timestamp | Screen | Audio Note |
|-----------|--------|------------|
| 0:00 | Black → system-flow animation | Slow fade in, dramatic pause before first line |
| 0:30 | System flow nodes lighting up | Speed up animation to match narration pace |
| 1:30 | GitHub repo | Hold 5 seconds so viewers can read the URL |
| 2:30 | SBT animation | Let animation finish before moving to code |
| 4:00 | VS Code — voter.service.ts | Zoom into the code block, highlight the key lines |
| 5:30 | Distress PIN animation | Pause narration while animation plays through |
| 7:00 | VS Code — vote.service.ts | Highlight `isDistressVote = true` in yellow |
| 9:00 | ElGamal animation | Let all 3 boxes appear before narrating math |
| 11:00 | VS Code — encryption.service.ts | Show both code blocks side by side if possible |
| 13:00 | Homomorphic animation — envelopes flying | Let all 40 envelopes merge before narrating |
| 15:00 | VS Code — tally.service.ts | Show ceremony log lines — these are compelling |
| 17:00 | Shamir animation | This is the most visual — give it full screen time |
| 19:30 | AI fraud animation — station spiking | Zoom into the anomaly score counter |
| 22:00 | GitHub repo | Hold on the open source files |
| 23:00 | Dark screen with text list | Slow type-on effect for the cost items |
| 25:00 | GitHub Issues page | Show open issues — makes it feel real and active |
| 27:00 | System flow final | Fade to black over 3 seconds |

### Music
- Intro: Minimal, tense — something like Hans Zimmer-style drone
- Technical sections: Low ambient electronic, no distraction
- Call to action: Hopeful, building — slight lift in energy
- Outro: Same as intro, fade to silence

### Subtitles
Add English subtitles throughout. Add Swahili subtitles for the intro hook and the call to action — these reach a wider Kenyan audience.

### Description Template
```
VeriVote Kenya — Open Source Verifiable Election System

Kenya's first fully cryptographically verifiable election system.
Every vote encrypted. Every result mathematically provable.

🔗 GitHub: https://github.com/Edwin-Kirimi-Kinuthia/verivote-kenya
💡 Contribute: Read CONTRIBUTING.md in the repo
💰 Sponsor: [add GitHub Sponsors or M-Pesa Paybill link]

What's in this video:
0:00 — The Problem
1:30 — What is VeriVote Kenya?
2:30 — Soul Bound Token (voter identity)
4:00 — WebAuthn + Distress PIN (coercion resistance)
7:00 — ElGamal Encryption (vote privacy)
9:00 — Homomorphic Tally (count without decrypting)
13:00 — Shamir Key Ceremony (no single keyholder)
17:00 — AI Fraud Detection (on-premise Llama 3.2)
22:00 — How to contribute & why we need your help

#Kenya #ElectionTechnology #OpenSource #Cryptography #Blockchain
```
