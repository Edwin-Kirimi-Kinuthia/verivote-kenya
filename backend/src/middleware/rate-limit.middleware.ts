import rateLimit from 'express-rate-limit';

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const nationalId = req.body?.nationalId || req.body?.identifier || 'unknown';
    const ip = req.ip ?? '0.0.0.0';
    return `${ip}-${nationalId}`;
  },
  validate: { xForwardedForHeader: false, ip: false, default: false },
  message: { success: false, error: 'Too many authentication attempts, please try again later' },
});

// OTP-specific limiter: slightly higher burst to allow request + verify within
// one window. Keyed per-IP + per-nationalId to prevent cross-voter abuse.
export const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const nationalId = req.body?.nationalId || 'unknown';
    const ip = req.ip ?? '0.0.0.0';
    return `otp:${ip}-${nationalId}`;
  },
  validate: { xForwardedForHeader: false, ip: false, default: false },
  message: { success: false, error: 'Too many OTP requests, please try again later' },
});

// Voter registration: keyed per IP. Limit is generous because a polling
// station clerk legitimately registers many voters in one session.
export const registrationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many registration attempts, please try again later' },
});

// WebAuthn credential enrollment: keyed per voterId (from body) so one
// voter's enrollments don't exhaust the budget for everyone else.
export const webAuthnEnrollRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const voterId = req.body?.voterId || 'unknown';
    return `webauthn-enroll:${voterId}`;
  },
  validate: { xForwardedForHeader: false, ip: false, default: false },
  message: { success: false, error: 'Too many credential enrollment attempts, please try again later' },
});

export const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
});

export const voteRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many vote attempts, please try again later' },
});

export const receiptRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many receipt lookup attempts, please try again later' },
});

export const printQueueRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many print queue requests, please try again later' },
});

/**
 * Per-client rate limiter for mobile API key holders.
 * Key is the X-API-Key header value, falling back to IP.
 * Mobile clients get a higher burst allowance (500 req / 15 min).
 */
export const mobileApiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    return apiKey ? `apikey:${apiKey}` : (req.ip ?? 'unknown');
  },
  validate: { xForwardedForHeader: false, ip: false, default: false },
  message: { success: false, error: 'Mobile API rate limit exceeded, please retry later' },
});
