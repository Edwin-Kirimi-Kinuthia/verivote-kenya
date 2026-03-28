# VeriVote Kenya — YouTube Video Script
## "How We Built a Tamper-Proof Election System for Kenya"

**Format:** Screen recording demo + infographic cutaways
**Target length:** 15–20 minutes
**Audience:** Developers, tech enthusiasts, election integrity advocates
**Tone:** Confident, educational, slightly cinematic

---

## SECTION 0 — HOOK (0:00 – 0:45)

**[Screen: Kenyan flag waving, then cut to bold title card]**

> "In 2007, disputed election results in Kenya triggered violence that killed over 1,500 people.
> In 2017, Kenya's Supreme Court nullified a presidential election — the first time in African history.
> The problem wasn't just politics. It was *trust*."

**[Cut to infographic: traditional ballot box with question marks]**

> "What if the votes themselves were mathematically provable? What if no single person — not even the election commission — could alter results? What if a voter who was coerced could secretly signal for help?"

**[Title card: VeriVote Kenya]**

> "This is VeriVote Kenya. A sovereign, cryptographically verifiable election system built entirely on open-source technology — and today I'm going to show you exactly how it works."

---

## SECTION 1 — SYSTEM OVERVIEW (0:45 – 2:30)

**[Screen: System architecture infographic]**

> "VeriVote is a full-stack election platform with four main layers:"

**[Highlight each layer as you mention it]**

1. **Backend** — Node.js + Express + PostgreSQL. Handles voter registration, authentication, and vote submission.
2. **Smart Contracts** — Ethereum (Hardhat). Two contracts: SoulBoundToken for voter identity, VoteRecording for immutable vote logs.
3. **Frontend** — Next.js 15. Two portals: an IEBC admin dashboard and a public voter portal.
4. **AI Service** — Python FastAPI + Isolation Forest + Ollama (Llama 3.2). Continuous fraud detection running entirely on-premise.

**[Show the data flow arrow diagram]**

> "Voter registers → gets a Soul Bound Token on the blockchain → casts an ElGamal-encrypted vote → vote is anonymised through a mixnet → tallied homomorphically without ever being decrypted → results declared in a cryptographic ceremony where keys are reassembled using Shamir's Secret Sharing."

> "Let me break down each of those concepts."

---

## SECTION 2 — VOTER IDENTITY: THE SOUL BOUND TOKEN (2:30 – 4:30)

**[Cut to SBT infographic]**

> "Every registered voter gets what's called a Soul Bound Token — an NFT that cannot be transferred. It's permanently bound to your identity."

**[Show SBT mint transaction on screen]**

> "When the IEBC registers you, a transaction is sent to our SoulBoundToken smart contract. The token is minted to a wallet address derived from your national ID. It cannot be sold, sent, or moved. It is *you* — on the blockchain."

**[Show the override function]**

> "If a voter dies before voting, an IEBC admin can mark them as deceased. The system automatically calls `revokeSBT()` — burning the token on-chain — and permanently blocks that identity from authentication. No ghost voting."

**[Show code snippet: markDeceased endpoint]**

> "The status is set to DECEASED, timestamps recorded, and the SBT is burned in the same transaction. Fully auditable on the blockchain."

---

## SECTION 3 — AUTHENTICATION: WEBAUTHN + PIN + DISTRESS (4:30 – 6:30)

**[Cut to auth flow infographic]**

> "Logging in to vote doesn't use a password. It uses WebAuthn — the same standard your phone uses for fingerprint and face unlock."

**[Demo: voter login on screen]**

> "The voter registers their biometric device during KYC onboarding. At vote time, they authenticate using their device. No passwords to steal, no phishing."

> "But we added something else — a distress PIN."

**[Cut to PIN infographic]**

> "Every voter sets a 4-digit normal PIN used to confirm their vote. But they also receive a *distress PIN* — a different 4-digit code sent privately to their phone."

> "If a voter is being coerced — someone standing over them forcing them to vote a certain way — they enter the distress PIN instead of their normal PIN. The vote appears to go through normally. The voter sees a success screen. But silently, the system flags that vote with `isDistressFlagged = true`."

> "The coercer sees nothing wrong. The voter is safe. And the IEBC security team gets an alert."

---

## SECTION 4 — ELGAMAL ENCRYPTION (6:30 – 9:00)

**[Cut to ElGamal infographic — mathematical visual]**

> "When a voter casts their ballot, their vote is never stored in plaintext. It's encrypted using ElGamal encryption — a public-key cryptosystem."

> "Here's how it works:"

**[Animate the math step by step]**

> "We have a large prime `p` and a generator `g`. The election authority generates a private key `x` and a public key `h = g^x mod p`."

> "To encrypt a vote `m`, the voter's device picks a random number `r`, then computes:
> - `C1 = g^r mod p`
> - `C2 = m × h^r mod p`
>
> The ciphertext `(C1, C2)` is stored. Without knowing `x`, you cannot recover `m`."

**[Show ciphertext in database]**

> "This is what's stored in our PostgreSQL database. Two large numbers. Completely meaningless without the private key — which no single person holds."

---

## SECTION 5 — HOMOMORPHIC TALLY (9:00 – 11:00)

**[Cut to homomorphic tally infographic]**

> "Here's where it gets beautiful. ElGamal encryption has a special property: it's *multiplicatively homomorphic*."

**[Animate ciphertext multiplication]**

> "If you multiply two ElGamal ciphertexts together, you get the encryption of the *sum* of the original votes — without decrypting either of them."

> "So to tally 1 million votes, we multiply all the ciphertexts together. We get one giant ciphertext that, when decrypted, gives us the total vote count for each candidate."

**[Show tally endpoint]**

> "This means: votes are never individually decrypted. A tally officer can't look at any single vote. The only thing that ever gets decrypted is the final aggregate — and even that requires multiple keyholders."

---

## SECTION 6 — SHAMIR'S SECRET SHARING (11:00 – 13:00)

**[Cut to Shamir infographic — the key splitting visual]**

> "The ElGamal private key — the key that can decrypt the final tally — is never held by one person. It's split using Shamir's Secret Sharing."

**[Animate the (k, n) threshold scheme]**

> "Here's the concept: imagine you have a secret number. You split it into `n` shares and give one to each of `n` keyholders — say, 5 senior IEBC commissioners."

> "The secret can only be reconstructed if at least `k` of them cooperate — say, any 3 of the 5. This is called a (3, 5) threshold scheme."

> "Mathematically: we define a polynomial of degree `k-1` where the secret is the constant term. Each share is a point on that polynomial. Any `k` points uniquely determine the polynomial — and thus the secret."

**[Show ceremony page in frontend]**

> "In VeriVote, we call this the decryption ceremony. Keyholders submit their shares through an authenticated portal. Once the threshold is met, the system reconstructs the private key, decrypts the aggregate ciphertext, and produces the final result."

> "No ceremony — no result. Not even the IEBC chairman can unilaterally reveal the outcome."

---

## SECTION 7 — AI FRAUD DETECTION (13:00 – 15:30)

**[Cut to AI service infographic]**

> "Running alongside all of this is an AI fraud detection service."

**[Show the 5 fraud signals]**

> "It monitors 5 signals at every polling station, every 60 seconds:"

1. **Voting velocity** — Are votes being cast abnormally fast?
2. **Temporal deviation** — Is voting happening outside normal hours?
3. **Geographic cluster score** — Is one station spiking while neighbours are normal?
4. **Repeat PIN attempt rate** — Is someone credential-testing or impersonating voters?
5. **Distress correlation** — Are multiple distress PINs appearing from the same station?

**[Show Isolation Forest explanation]**

> "An Isolation Forest machine learning model scores each station's pattern. If the anomaly score exceeds 70 out of 100, an alert fires."

**[Show the Ollama LLM explainer]**

> "And here's the part I'm most proud of: when an alert fires, a local Llama 3.2 model — running on-premise, zero data egress — generates a plain-English briefing for the IEBC security officer."

**[Show example explanation on screen]**

> "Something like: *'CRITICAL ALERT — Station NAI-001: Ballot stuffing pattern detected. Voting velocity is 4.2× the station average. Suspend voting and conduct an immediate manual count verification.'*"

> "No cloud. No OpenAI. Sovereign AI on Kenyan infrastructure."

---

## SECTION 8 — LIVE DEMO (15:30 – 18:30)

**[Switch to screen recording of running system]**

> "Let me show you this running live."

**[Demo sequence:]**
1. Start all services (show terminals briefly)
2. Admin login → create an election → add candidates
3. Show a registered voter → their SBT on the blockchain explorer
4. Voter login → WebAuthn prompt → select candidate → PIN confirmation
5. Show encrypted vote in database (the ciphertext)
6. Run tally → show homomorphic result
7. Trigger AI analysis on a station → show the LLM explanation
8. Mark a voter as deceased → show SBT burn transaction

---

## SECTION 9 — CLOSING (18:30 – 19:30)

**[Back to camera or title card]**

> "VeriVote Kenya is our answer to the question: can technology restore trust in elections?"

> "Every vote is encrypted the moment it's cast. The tally is computed without reading a single ballot. The result requires multiple keyholders to unlock. And an AI system watches for fraud in real time — in Swahili if needed."

> "The code is open source. The cryptography is auditable. The blockchain is public."

> "This was built for the NIRU Hackathon — but the vision is bigger than a hackathon."

**[Show GitHub link]**

> "The full source code is on GitHub. If you're a developer, a security researcher, or someone who cares about election integrity — I'd love your feedback."

> "If you found this useful, subscribe, and I'll be documenting more of the technical implementation in future videos."

> "Thanks for watching."

---

## PRODUCTION NOTES

### Recommended Shot Order for CapCut
1. Record infographic screen captures first (open each HTML file in browser, fullscreen)
2. Record the live demo in one continuous take
3. Record voiceover separately for clean audio
4. Use CapCut's auto-caption for accessibility
5. Add Kenyan flag color scheme overlays (green #006600, red #BB0000, black #000000)

### Suggested B-Roll / Cutaways
- Kenyan parliament / IEBC building (stock footage)
- Terminal running `pnpm contracts:deploy` (show output)
- Database table showing encrypted ciphertexts
- Blockchain explorer showing SBT mint/burn transactions
- AI service logs showing fraud scores updating

### Music Suggestion
- Intro: Cinematic orchestral (Epidemic Sound: "Sovereignty" type)
- Demo sections: Subtle electronic/ambient
- Outro: Uplifting

### Thumbnail Text
**"Kenya's Tamper-Proof Election System"**
Subtitle: "ElGamal + Homomorphic + AI"
Visual: Ballot box with padlock + blockchain nodes + Kenyan flag colors
