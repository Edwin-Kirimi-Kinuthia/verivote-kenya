# VeriVote Kenya — Live Demo Walkthrough Guide
### Production Guide + Narration Script for YouTube Demo Section

---

## PART A: PRODUCTION GUIDE

### Overview: Shot Types

| Shot Type | Equipment | When to Use |
|---|---|---|
| **Talking Head** | Sony A6400, lens at f/2.8–f/4, 1/50s shutter | Narration, explaining concepts, reactions |
| **Camera-on-Screen** | Sony A6400 pointed at monitor | Showing the live system with natural look |
| **Screen Recording** | OBS Studio at 1920×1080, 60fps | Terminal, browser UI, Postman, VS Code |
| **Animation Cutaway** | Pre-rendered HTML animations (docs/anim-*.html) | Explain the cryptographic steps |

---

### Sony A6400 Camera Settings

- **Profile**: S-Log2 or Flat (for colour grading in post)
- **Resolution**: 4K 24fps (crop mode off for widest field of view)
- **Aperture**: f/2.8 (background blur, you sharp in frame)
- **ISO**: 800–1600 indoors (keep noise low with a ring light or key light)
- **Shutter**: 1/50s (180-degree rule for 24fps)
- **Audio**: Use a lapel/lavalier mic plugged into the 3.5mm jack — do NOT use camera mic
- **Framing**: Medium shot (chest up), slightly off-centre with monitor visible in background
- **White Balance**: Tungsten or custom — match your screen's colour temp so the monitor behind you isn't blown out

---

### Monitor Setup for Camera-on-Screen Shots

- Set browser zoom to 90–100% so UI elements are large enough to read
- Set screen brightness to ~70% to reduce flicker on camera
- Turn off notifications (Do Not Disturb mode)
- Camera angle: 30–45 degrees off to the side of the monitor so glare is minimised
- Use a second monitor for your script/notes so your eyes don't dart off screen constantly

---

### Shot-by-Shot Production Plan

Each scene below is labelled with the primary recording method. Combine in edit.

```
[CAM]  = Sony A6400 talking head
[SCR]  = Screen recording (OBS)
[CAM+SCR] = Camera-on-screen (A6400 pointed at monitor, or PiP overlay in edit)
[ANIM] = Animation cutaway (pre-rendered)
```

---

#### SCENE D1 — "Let me show you the actual system"
**Duration target: 30 seconds**

| Shot | Method | Content |
|---|---|---|
| D1-A | [CAM] | Talking head: "Enough theory. Let me actually show you the system running." |
| D1-B | [SCR] | Terminal: run `docker compose up -d`, `pnpm contracts:node`, then `pnpm contracts:deploy` |
| D1-C | [SCR] | Terminal: start backend (`npx tsx src/index.ts`) — show "Server running on port 3005" |
| D1-D | [SCR] | Terminal: start frontend (`pnpm dev`) — show Next.js ready message |
| D1-E | [CAM] | "All services are running. Four separate systems — database, blockchain, backend API, and the frontend — all talking to each other." |

**Edit tip:** Speed up D1-B to D1-D (2x–4x) with a progress bar overlay. Cut back to talking head at D1-E.

---

#### SCENE D2 — Election Setup (Chairperson POV)
**Duration target: 2 minutes**

| Shot | Method | Content |
|---|---|---|
| D2-A | [CAM] | "The first thing the IEBC Chairperson does is set up the election. Let me log in as the Chairperson." |
| D2-B | [CAM+SCR] | Browser: navigate to `localhost:3001`, log in with National ID `00000005`, password field |
| D2-C | [SCR] | Dashboard loads — show the admin interface, election management section |
| D2-D | [SCR] | Navigate to Elections → show the Kenya 2022 General Election created by the setup script |
| D2-E | [SCR] | Click into the election — show all jurisdiction nodes: Kenya → Nairobi → Westlands → etc. |
| D2-F | [CAM] | "Every node in this tree represents a real administrative boundary — county, constituency, ward, polling station. Each node has a designated IEBC officer assigned to it." |
| D2-G | [SCR] | Click a node — show the `personInCharge` IEBC officer linked to it |
| D2-H | [SCR] | Scroll through positions — Presidential at Kenya level, Governor at County, MP at Constituency, MCA at Ward |
| D2-I | [SCR] | Click a position — show the candidates list with photos, parties, ballot numbers |
| D2-J | [CAM] | "The entire election structure — every position, every candidate, every boundary — is set up through the API before a single vote is cast. No surprises." |

**Cut to:** `[ANIM]` anim-system-flow.html for 5 seconds to break the pace, then back to screen.

---

#### SCENE D3 — Voter Registration (New Voter)
**Duration target: 90 seconds**

| Shot | Method | Content |
|---|---|---|
| D3-A | [CAM] | "Now let me register a new voter. In a real deployment this is done at an IEBC registration centre. I'll do it here from the browser." |
| D3-B | [SCR] | Open a new browser tab or incognito — navigate to `/register` |
| D3-C | [CAM+SCR] | Fill in the registration form: National ID `12345678`, name, phone `+254700000099`, email, ward, county |
| D3-D | [SCR] | OTP sent to phone — show the Mailtrap inbox or Africa's Talking simulator — OTP arrives |
| D3-E | [SCR] | Enter OTP — form advances to identity verification step (Persona KYC) |
| D3-F | [CAM] | "In the sandbox the KYC check runs through Persona's test environment. In production this would verify the voter's national ID against IPRS — the government identity database." |
| D3-G | [SCR] | Complete KYC — status moves to `REGISTERED` |
| D3-H | [SCR] | WebAuthn fingerprint setup prompt — show the browser's built-in biometric dialog |
| D3-I | [SCR] | PIN setup page — set normal PIN `7890` |
| D3-J | [SCR] | Distress PIN sent via SMS — show the notification in the terminal or Mailtrap |
| D3-K | [CAM] | "The voter now has three authentication factors: a password, a biometric passkey, and a 4-digit PIN used at vote-cast time. Plus a secret distress PIN for emergencies — we'll come back to that." |

---

#### SCENE D4 — Normal Vote Cast
**Duration target: 90 seconds**

| Shot | Method | Content |
|---|---|---|
| D4-A | [CAM] | "Let's vote. I'll log in as this new voter and cast a ballot." |
| D4-B | [SCR] | Login with the new voter's credentials |
| D4-C | [SCR] | Navigate to the ballot — show the Presidential race: Ruto, Raila, Wajackoyah, Mwaure |
| D4-D | [CAM+SCR] | Select a candidate — "I'm voting for William Ruto here." |
| D4-E | [SCR] | Scroll down — show Governor, Senator, MP, MCA races — select candidates for each |
| D4-F | [SCR] | PIN entry field — enter `7890` |
| D4-G | [SCR] | Vote submitted — success screen, shows receipt/transaction hash |
| D4-H | [CAM] | "That transaction hash is the blockchain receipt. Copy it. Go to the explorer. You can verify your vote was recorded — encrypted — without anyone knowing what you chose." |
| D4-I | [SCR] | Navigate to `/api/stats/explorer` or blockchain explorer — paste the hash — show the encrypted vote record |

**Cut to:** `[ANIM]` anim-elgamal.html for 10 seconds — narrate: "This is what happened to that vote the moment you hit submit."

---

#### SCENE D5 — Multiple Voting Attempt (Duplicate Rejection)
**Duration target: 45 seconds**

| Shot | Method | Content |
|---|---|---|
| D5-A | [CAM] | "What happens if someone tries to vote twice? Let's find out." |
| D5-B | [SCR] | Still logged in as the same voter — navigate back to the ballot page |
| D5-C | [SCR] | Select a candidate again, enter PIN, hit submit |
| D5-D | [SCR] | **Error response:** `"You have already voted in this election"` — show the red error message |
| D5-E | [CAM] | "That's it. One voter, one vote. The system checks the blockchain AND the database. There is no way around this. Not by refreshing, not by using a different browser, not by clearing cookies. Your national ID is tied to your vote record." |

**Cut to:** `[ANIM]` anim-sbt.html for 8 seconds — show the Soul Bound Token that prevents re-registration.

---

#### SCENE D6 — Distress Voting
**Duration target: 90 seconds**

| Shot | Method | Content |
|---|---|---|
| D6-A | [CAM] | "Now the scenario I mentioned earlier. Distress voting. Imagine a voter is at a polling station and someone is threatening them — telling them how to vote or else. What do they do?" |
| D6-B | [CAM] | "Instead of their normal PIN — let's say 7-8-9-0 — they enter their distress PIN. The vote still goes through. The voter walks away safely. But silently, in the background, something else happens." |
| D6-C | [SCR] | Log in as a second test voter (or create one) — navigate to ballot — select candidates |
| D6-D | [SCR] | In the PIN field, enter the **distress PIN** instead of the normal PIN |
| D6-E | [SCR] | Vote succeeds — voter sees a completely normal success screen. No error. No alert. |
| D6-F | [SCR] | Switch to Mailtrap / terminal — show the **distress alert notification** that fired silently |
| D6-G | [SCR] | Log in as admin — navigate to the votes dashboard — find the vote — show `isDistressFlagged: true` |
| D6-H | [CAM] | "The voter is protected. The vote was cast. But the IEBC security coordinator was instantly notified. Law enforcement can now be dispatched to that polling station. All without alerting the coercer." |

**Cut to:** `[ANIM]` anim-distress-pin.html

---

#### SCENE D7 — AI Fraud Detection
**Duration target: 2 minutes**

| Shot | Method | Content |
|---|---|---|
| D7-A | [CAM] | "VeriVote has a dedicated AI service for fraud detection. It runs a machine learning model — Isolation Forest — trained on voting patterns. Let me show you how it works." |
| D7-B | [SCR] | Open terminal — show the AI service running: `python -m uvicorn main:app --port 8000` |
| D7-C | [SCR] | Open Postman — call `POST /api/ai/analyze` with a voter ID that voted normally — show the anomaly score: low, explanation: no anomaly |
| D7-D | [CAM] | "Now let me simulate what the AI would flag as suspicious. Multiple votes from the same IP range. Votes cast in milliseconds. Statistically impossible geographic patterns." |
| D7-E | [SCR] | Call `POST /api/ai/analyze` with the AI internal key — use a voter ID associated with suspicious activity OR craft a request body with anomalous feature values |
| D7-F | [SCR] | Response: high anomaly score — show the `anomalyScore`, `isFraudulent: true`, and the Llama explanation |
| D7-G | [SCR] | Llama 3.2 explanation field — scroll through the natural language description of *why* this vote pattern was flagged |
| D7-H | [CAM] | "That explanation was written by Llama 3.2 — an open-source AI model running on-premise. It reads the anomaly data and gives a human-readable reason that an investigator can act on. No black box." |
| D7-I | [SCR] | `GET /api/ai/fraud-report` — show a summary report of all flagged votes |
| D7-J | [CAM] | "Every flagged vote is logged. Time-stamped. Auditable. This doesn't override the cryptographic result — it's a layer of intelligence on top of the verifiable foundation." |

**Cut to:** `[ANIM]` anim-ai-fraud.html

---

#### SCENE D8 — Tally Ceremony
**Duration target: 90 seconds**

| Shot | Method | Content |
|---|---|---|
| D8-A | [CAM] | "After voting closes, the tally. This is the part that makes VeriVote different from every other e-voting system." |
| D8-B | [CAM] | "The individual votes are never decrypted. Instead, the encrypted votes are combined mathematically — using a property of ElGamal encryption called homomorphic addition. The totals emerge from the encrypted sum." |
| D8-C | [SCR] | Log in as the IEBC Chairperson — navigate to Elections → Kenya 2022 → Tally |
| D8-D | [SCR] | Click `Run Tally` — watch the tally process run — progress indicator |
| D8-E | [SCR] | Results appear: candidate totals, percentages, winner declared |
| D8-F | [SCR] | Check the `hasTie` field for a race — if tied, show `"No winner declared — tie detected"` |
| D8-G | [CAM] | "Shamir's Secret Sharing means no single person holds the decryption key. In a real deployment, the Chairperson, the Deputy, and an independent auditor must each contribute their key share before the tally runs." |
| D8-H | [SCR] | Show the result declaration endpoint — `POST /api/results/declare` — signed result |
| D8-I | [CAM] | "The declared result is cryptographically signed, timestamped, and pushed to the blockchain. Anyone in Kenya can download the result, run the same math, and get the same answer." |

**Cut to:** `[ANIM]` anim-homomorphic.html for 10 seconds, then `[ANIM]` anim-shamir.html for 8 seconds.

---

#### SCENE D9 — Deceased Voter Handling
**Duration target: 45 seconds**

| Shot | Method | Content |
|---|---|---|
| D9-A | [CAM] | "One more thing. What about deceased voters? This is a real problem in Kenyan elections — ghost voters. VeriVote has a specific mechanism to handle this." |
| D9-B | [SCR] | Log in as admin — navigate to Voter Management |
| D9-C | [SCR] | Find a voter — update status to `DECEASED` via the admin panel or API: `PATCH /api/voters/:id/status` |
| D9-D | [SCR] | Attempt to log in as that voter — **blocked**: `"Account is not eligible to vote"` |
| D9-E | [SCR] | Show the SBT revoke call — `POST /api/blockchain/sbt/revoke/:id` — blockchain transaction confirmed |
| D9-F | [CAM] | "The Soul Bound Token on the blockchain is revoked. Even if someone found the voter's credentials, they couldn't vote. The cryptographic identity is gone." |

---

### Edit Assembly Order

Suggested final cut sequence:

```
D1 (Services up) → ANIM system-flow →
D2 (Election setup) →
D3 (Registration) →
D4 (Normal vote) → ANIM elgamal →
D5 (Duplicate rejection) → ANIM sbt →
D6 (Distress vote) → ANIM distress-pin →
D7 (AI fraud) → ANIM ai-fraud →
D8 (Tally) → ANIM homomorphic → ANIM shamir →
D9 (Deceased voter)
```

**Total estimated demo runtime:** 12–15 minutes of raw material, edit down to 8–10 minutes.

---

### Post-Production Notes

- **Colour grade:** Match Sony S-Log2 footage to your screen recording (use a LUT or Lumetri in Premiere). Aim for a cool-blue tech palette to match the UI.
- **Lower thirds:** Add subtle text overlays identifying what is on screen: `"IEBC Chairperson Dashboard"`, `"ElGamal Encryption in action"`, etc.
- **Zoom/Ken Burns on screen recordings:** When showing a specific UI element, zoom in (2x) for 2–3 seconds so mobile viewers can read it.
- **Callout boxes:** When a key response appears (e.g. the distress flag, the anomaly score), pause + zoom + add a highlight box around the relevant JSON field.
- **Transitions from animation to screen:** Use a fast white flash or a 0.3s dissolve. Don't use long cross-fades — the contrast between animation and real UI is jarring if blended slowly.
- **Music:** Keep demo section music at -20dB under your voice (barely perceptible) — this section is information-dense, music competes.

---

## PART B: DEMO NARRATION SCRIPT

*This is the spoken script for Scenes D1–D9. Read it in one take per scene, then edit for best delivery. `[BEAT]` = pause 1–2 seconds. `[LOOK AT SCREEN]` = glance at monitor.*

---

### D1 — Starting the System

> "Okay. Enough theory. Let me actually show you the thing running.
>
> `[LOOK AT SCREEN]`
> I'm going to start all four services right now.
> First — Docker brings up PostgreSQL and Redis.
> Then the Hardhat node — that's our local Ethereum-compatible blockchain.
> Then we deploy the smart contracts to it.
> Then the backend API on port 3005.
> And finally the Next.js frontend on port 3001.
>
> `[BEAT]`
>
> `[LOOK AT SCREEN]`
> All green. All running.
> Five separate processes, all connected.
> And this is just for local development — when this goes to production it moves to cloud infrastructure with the blockchain on Polygon.
>
> Now — let me show you what it can do."

---

### D2 — Election Setup

> "The system doesn't come pre-loaded with an election.
> Someone has to set it up. That someone is the IEBC Chairperson.
>
> `[LOOK AT SCREEN]`
> I'm logging in with the Chairperson's credentials right now.
> Once in, I go to Election Management.
>
> `[BEAT]`
>
> Here is the Kenya 2022 General Election I configured through the system's API.
> Let me walk you through what it looks like.
>
> `[LOOK AT SCREEN]`
> This tree on the left — that's the jurisdiction hierarchy.
> Kenya at the top. Then the counties — Nairobi, Kiambu, Bomet.
> Inside each county, constituencies. Inside each constituency, wards.
> Inside each ward, polling station nodes.
>
> `[BEAT]`
>
> Click on any node and you see who is in charge of it.
> A specific IEBC officer, by national ID, assigned to manage that node.
> They control when the node is open for voting and they certify the local results.
>
> `[LOOK AT SCREEN]`
> Here are the positions.
> Presidential at the Kenya level — all voters see this race.
> Governor, Senator, and Women Representative at the county level — only voters registered in that county see these.
> Member of Parliament at the constituency.
> MCA — Member of County Assembly — at the ward level.
>
> Six races. Real candidates. Real ballot numbers.
> This is the structure Kenya actually used in 2022."

---

### D3 — Voter Registration

> "Now — a new voter wants to register.
>
> `[LOOK AT SCREEN]`
> This is the registration form.
> National ID number. Full name. Phone number. Email. Ward and county.
>
> Once I submit, the system sends an OTP — a one-time password — to the phone number.
>
> `[BEAT]`
>
> There it is. `[LOOK AT SCREEN]` That SMS just came in through Africa's Talking — Kenya's most widely used SMS gateway. The voter enters that OTP to confirm their phone number is real.
>
> Next step — identity verification through Persona.
> In the sandbox, this simulates checking the national ID against the government IPRS database.
> In production, this is a real KYC check. No ID, no vote.
>
> `[BEAT]`
>
> Status: REGISTERED. Now the voter sets up their biometric passkey — that's the WebAuthn fingerprint login.
>
> `[LOOK AT SCREEN]`
> The browser pops up the native biometric dialog — Windows Hello, Touch ID, whatever the device supports.
>
> Then — their PIN.
> A four-digit PIN they choose. This is entered at vote-cast time as a final confirmation.
>
> And the system generates a distress PIN and sends it to them privately.
> We'll come back to what that is."

---

### D4 — Casting a Normal Vote

> "The voter is registered. Let's vote.
>
> `[LOOK AT SCREEN]`
> I've logged in. The ballot loads automatically based on the voter's registered ward.
> They see exactly the races they are eligible to vote in. No more, no less.
>
> Presidential race at the top.
> William Samoei Ruto — Party: UDA.
> Raila Amolo Odinga — Party: Azimio.
> George Wajackoyah — Party: Roots.
> David Mwaure — Party: Agano.
>
> `[BEAT]`
>
> I'll select a candidate. `[LOOK AT SCREEN]`
> Scroll down. Governor race for Nairobi. Johnson Sakaja versus Polycarp Igathe.
> Senator. Women Representative. MP. MCA.
> I'm selecting across all six races.
>
> At the bottom — the PIN field.
> I enter my four-digit PIN. Hit submit.
>
> `[BEAT]`
>
> Done. `[LOOK AT SCREEN]`
> Vote submitted. There's the receipt — a transaction hash.
>
> That hash is on the Hardhat blockchain right now.
> It proves a vote was recorded at this timestamp, encrypted with this ciphertext.
> It cannot be altered. It cannot be deleted.
>
> And nobody — not me, not the IEBC, not the Supreme Court — can look at that record and know who you voted for."

---

### D5 — Trying to Vote Twice

> "Now — what if I try to vote again?
>
> `[LOOK AT SCREEN]`
> Same voter. Same session. Back to the ballot.
> Select a candidate. Enter PIN. Submit.
>
> `[BEAT]`
>
> `[LOOK AT SCREEN]`
> There it is.
> — quote — 'You have already voted in this election.'
>
> `[BEAT]`
>
> That check happens in two places simultaneously.
> First — the database records that this national ID has voted.
> Second — the blockchain holds that record immutably.
>
> You cannot vote twice. Not by refreshing. Not by using a different browser or device. Not by clearing your cookies. Not by waiting an hour.
> Your national ID is tied to your ballot. One person. One vote. Mathematically enforced."

---

### D6 — Distress Voting

> "Now. The scenario I mentioned.
>
> Picture this: you are a voter. You are at a polling station.
> And someone is standing just outside, watching you.
> They told you who to vote for — or else.
>
> What do you do?
>
> `[BEAT]`
>
> You vote. Normally. You select whoever they told you to.
> But in the PIN field — instead of your real PIN — you enter your distress PIN.
>
> `[BEAT]`
>
> `[LOOK AT SCREEN]`
> Watch what happens. I'm entering the distress PIN now.
> Submit.
>
> `[LOOK AT SCREEN]`
> Vote confirmed. Normal success screen. No error. No flicker.
> As far as anyone watching is concerned, you just voted normally.
>
> `[BEAT]`
>
> `[LOOK AT SCREEN]`
> But look at the backend terminal. An alert just fired.
> Email notification. SMS to the IEBC security coordinator.
> — quote — 'Distress PIN triggered. Voter ID, timestamp, polling station.'
>
> `[BEAT]`
>
> `[LOOK AT SCREEN]`
> And in the admin dashboard — that vote has a flag on it. isDistressFlagged: true.
> Law enforcement can now be dispatched to that station.
>
> The voter is safe. The coercer sees nothing.
> The system protects the most vulnerable voters."

---

### D7 — AI Fraud Detection

> "On top of cryptographic security, VeriVote runs an AI fraud detection layer.
>
> `[LOOK AT SCREEN]`
> This is the AI service — FastAPI on port 8000. It's running an Isolation Forest model — a machine learning algorithm that finds statistical anomalies in voting behaviour.
>
> Let me analyse a normal voter first.
>
> `[LOOK AT SCREEN]`
> Anomaly score: low. No anomaly detected. Expected voting pattern. Clean.
>
> Now let me send it something suspicious.
>
> `[BEAT]`
>
> `[LOOK AT SCREEN]`
> Anomaly score: high. isFraudulent: true.
>
> And here — this is the part I find most interesting — the explanation field.
> That is Llama 3.2. An open-source large language model running entirely on my local machine through Ollama. No API calls to OpenAI. No data leaving the system.
>
> `[BEAT]`
>
> It read the anomaly data and wrote a human explanation.
> Something like: 'This voter's ballot was submitted in under two seconds — far below the human average. The request originated from a data centre IP range. The voting pattern matches a known bot signature across four other flagged accounts.'
>
> An investigator can read that. Act on it. Investigate.
>
> `[BEAT]`
>
> This doesn't override the cryptographic result. The vote still counts.
> But it gives investigators an intelligent, explainable signal — not just a raw number.
> No black box. The AI explains itself."

---

### D8 — The Tally

> "Voting is closed. Now we tally.
>
> I want you to understand what is about to happen, because this is the most important part of the whole system.
>
> When you tallied paper ballots, someone opened a box, took out each ballot, read out the name on it, and wrote a number on a whiteboard. That process — visible, physical, auditable.
>
> In most e-voting systems, the equivalent is: decrypt all the votes, count them, announce the result. But that means someone, somewhere, saw every individual vote. The moment you decrypt individual ballots, you break ballot secrecy.
>
> `[BEAT]`
>
> VeriVote never decrypts individual votes.
>
> `[LOOK AT SCREEN]`
> I'm clicking Run Tally now as the Chairperson.
>
> What is happening under the hood: the system is performing ElGamal homomorphic addition. It is multiplying the ciphertext of every vote together. In ElGamal encryption, multiplying ciphertexts is the same as adding the underlying plaintexts. So the product of all encrypted votes decrypts to the total — without ever seeing any individual ballot.
>
> `[BEAT]`
>
> `[LOOK AT SCREEN]`
> Results.
> Candidate totals. Percentages. Winner declared.
>
> That result is now cryptographically signed by the IEBC private key and pushed to the blockchain.
>
> Anyone. Anywhere in Kenya. Can download the election data, run the same ElGamal addition themselves, and get the exact same result.
>
> `[BEAT]`
>
> No trust required. Just math."

---

### D9 — Deceased Voter

> "Last one. Ghost voters.
>
> This has been a problem in Kenya for decades — voters on the register who have died, whose identities can be used to stuff the roll.
>
> `[LOOK AT SCREEN]`
> Here is how VeriVote handles it.
> Admin updates a voter's status to DECEASED.
>
> Immediately — two things happen.
> First: any attempt to log in with those credentials is blocked.
>
> `[LOOK AT SCREEN]`
> — quote — 'Account is not eligible to vote.'
>
> `[BEAT]`
>
> Second: the system revokes the voter's Soul Bound Token on the blockchain.
>
> `[LOOK AT SCREEN]`
> That is a blockchain transaction. Confirmed. The SBT is burned.
>
> Even if someone had the voter's full credentials — password, fingerprint data, PIN — they cannot vote.
> The on-chain identity is gone.
>
> `[BEAT]`
>
> Every eligible voter has one SBT. No SBT, no vote.
> It is not a database flag that can be altered by a corrupt official.
> It is a cryptographic fact."

---

### DEMO CLOSING TRANSITION

> "That is the live system.
>
> `[BEAT]`
>
> Not a prototype. Not a mock.
> Real encryption. Real blockchain. Real AI.
> Running right now on my machine.
>
> `[BEAT]`
>
> And if you wanted to run it yourself — every line of code is on GitHub.
> The link is in the description.
> Pull it down. Read the cryptography. Audit the smart contracts. Try to break it.
>
> That is what open source means.
>
> `[BEAT]`
>
> This is what Kenyan elections could look like."

---

*[Continue to the existing closing section of the main script — Sections 8 and 9]*
