# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (develop) | ✅ |

## Reporting a Vulnerability

VeriVote Kenya is an election integrity system. We take all security reports seriously.

**Please do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

Email: **edwinkirimikinutia@gmail.com** (or open a [GitHub Security Advisory](https://github.com/Edwin-Kirimi-Kinuthia/verivote-kenya/security/advisories/new))

Include:
- Description of the issue
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

### What to Expect

- **Acknowledgement** within 48 hours
- **Status update** within 7 days
- **Credit** in release notes (unless you prefer anonymity)

We follow coordinated disclosure — we ask that you give us reasonable time to fix the issue before public disclosure.

## Scope

Areas of highest interest:
- Vote encryption / ElGamal implementation
- Homomorphic tally correctness
- WebAuthn / authentication bypass
- Smart contract (SBT mint/revoke) logic
- Distress PIN handling
- Shamir key ceremony

## Out of Scope

- Rate limiting / brute force on non-auth endpoints
- Theoretical attacks without a working proof of concept
- Social engineering
