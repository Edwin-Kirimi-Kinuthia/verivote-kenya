import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { webAuthnService } from '../services/webauthn.service.js';
import { ServiceError } from '../services/voter.service.js';
import { requireAuth, requireAdmin, authRateLimiter, webAuthnEnrollRateLimiter } from '../middleware/index.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';

const router: Router = Router();

// ── REGISTRATION ──────────────────────────────────────────────────────────────

// POST /api/webauthn/register/options
// Returns a PublicKeyCredentialCreationOptionsJSON for the browser.
// Rate-limited per voterId to prevent challenge-slot flooding.
router.post('/register/options', webAuthnEnrollRateLimiter, async (req: Request, res: Response) => {
  const parsed = z.object({ voterId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }

  try {
    const options = await webAuthnService.getRegistrationOptions(parsed.data.voterId);
    res.json({ success: true, data: options });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to generate registration options' });
  }
});

// POST /api/webauthn/register/verify
// Verifies the authenticator's attestation and stores the public-key credential.
router.post('/register/verify', webAuthnEnrollRateLimiter, async (req: Request, res: Response) => {
  const parsed = z
    .object({ voterId: z.string().uuid(), response: z.record(z.unknown()) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await webAuthnService.verifyRegistration(parsed.data.voterId, parsed.data.response as any);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Registration verification failed' });
  }
});

// ── AUTHENTICATION ────────────────────────────────────────────────────────────

// POST /api/webauthn/authenticate/options
// Returns a PublicKeyCredentialRequestOptionsJSON for the browser.
// Rate-limited per IP + nationalId to prevent enumeration and DoS.
router.post('/authenticate/options', authRateLimiter, async (req: Request, res: Response) => {
  const parsed = z
    .object({ nationalId: z.string().regex(/^\d{8}$/, 'National ID must be 8 digits') })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }

  try {
    const options = await webAuthnService.getAuthenticationOptions(parsed.data.nationalId);
    res.json({ success: true, data: options });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to generate authentication options' });
  }
});

// POST /api/webauthn/authenticate/verify
// Verifies the authenticator's assertion and issues a JWT.
router.post('/authenticate/verify', authRateLimiter, async (req: Request, res: Response) => {
  const parsed = z
    .object({
      nationalId: z.string().regex(/^\d{8}$/, 'National ID must be 8 digits'),
      response: z.record(z.unknown()),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await webAuthnService.verifyAuthentication(parsed.data.nationalId, parsed.data.response as any);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
});

// ── CREDENTIAL MANAGEMENT ──────────────────────────────────────────────────────

// GET /api/webauthn/credentials/:voterId
// List enrolled credentials. Voters can only view their own; admins can view any.
router.get('/credentials/:voterId', requireAuth, async (req: Request, res: Response) => {
  const authenticated = (req as AuthenticatedRequest).voter;

  // IDOR guard: only the credential owner or an admin may view
  if (authenticated.sub !== req.params.voterId && authenticated.role !== 'ADMIN') {
    res.status(403).json({ success: false, error: 'Access denied' });
    return;
  }

  try {
    const credentials = await webAuthnService.listCredentials(req.params.voterId);
    res.json({ success: true, data: credentials });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to list credentials' });
  }
});

// DELETE /api/webauthn/credentials/:voterId
// Clear all credentials for a voter (admin only) to force re-enrollment.
router.delete('/credentials/:voterId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await webAuthnService.deleteCredentials(req.params.voterId);
    res.json({
      success: true,
      data: result,
      message: 'Credentials cleared. Voter must re-enroll their fingerprint.',
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to delete credentials' });
  }
});

export default router;
