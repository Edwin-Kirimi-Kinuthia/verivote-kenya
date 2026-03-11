/**
 * VeriVote Kenya — Structured Logger (Days 45-46 Security Hardening)
 *
 * Winston-based structured logging with:
 *   - JSON output in production (machine-parseable, ready for Datadog/ELK)
 *   - Colorized console output in development
 *   - Rotating file transports: logs/error.log, logs/combined.log
 *   - Audit log: logs/audit.log — security-critical events only
 *   - Morgan HTTP request stream
 *
 * Usage:
 *   import { logger, auditLog } from './logger.js';
 *   logger.info('Server started', { port: 3005 });
 *   auditLog('VOTE_CAST', { serial, voterId, stationId });
 */

import { createLogger, format, transports, type Logger } from 'winston';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import type { StreamOptions } from 'morgan';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '..', '..', 'logs');

// Ensure log directory exists
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

const isProd = process.env.NODE_ENV === 'production';

// ── Shared formats ────────────────────────────────────────────────────────────

const timestampFmt = format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' });

const productionFmt = format.combine(
  timestampFmt,
  format.errors({ stack: true }),
  format.json(),
);

const developmentFmt = format.combine(
  timestampFmt,
  format.colorize({ all: true }),
  format.errors({ stack: true }),
  format.printf(({ timestamp, level, message, ...meta }) => {
    const extra = Object.keys(meta).length
      ? ' ' + JSON.stringify(meta, null, 0)
      : '';
    return `${timestamp} [${level}] ${message}${extra}`;
  }),
);

// ── Main application logger ───────────────────────────────────────────────────

export const logger: Logger = createLogger({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  format: isProd ? productionFmt : developmentFmt,
  defaultMeta: { service: 'verivote-api' },
  transports: [
    new transports.Console(),
    new transports.File({
      filename: join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,   // 10 MB
      maxFiles: 5,
    }),
    new transports.File({
      filename: join(LOG_DIR, 'combined.log'),
      maxsize: 50 * 1024 * 1024,   // 50 MB
      maxFiles: 10,
    }),
  ],
});

// ── Audit logger — security events only ──────────────────────────────────────
// Writes to a separate file so audit trail is never mixed with app logs.

const auditLogger: Logger = createLogger({
  level: 'info',
  format: format.combine(
    timestampFmt,
    format.json(),
  ),
  defaultMeta: { service: 'verivote-audit' },
  transports: [
    new transports.File({
      filename: join(LOG_DIR, 'audit.log'),
      maxsize: 100 * 1024 * 1024,  // 100 MB — never rotate audit log lightly
      maxFiles: 20,
    }),
  ],
});

/**
 * Record a security-critical audit event.
 * All entries are written to logs/audit.log in JSON format.
 *
 * @param event   — machine-readable event type (e.g. 'VOTE_CAST')
 * @param context — structured metadata (no PII beyond what's required for audit)
 */
export function auditLog(
  event: AuditEvent,
  context: Record<string, unknown>,
): void {
  auditLogger.info(event, {
    event,
    ...context,
    ts: new Date().toISOString(),
  });
}

// ── Defined audit event types ─────────────────────────────────────────────────

export type AuditEvent =
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAIL'
  | 'AUTH_LOGOUT'
  | 'AUTH_OTP_SENT'
  | 'AUTH_OTP_VERIFIED'
  | 'AUTH_OTP_FAIL'
  | 'VOTER_REGISTERED'
  | 'VOTER_KYC_APPROVED'
  | 'VOTER_KYC_FAILED'
  | 'VOTER_SUSPENDED'
  | 'VOTE_CAST'
  | 'VOTE_REVOTE'
  | 'VOTE_DISTRESS'
  | 'PIN_SET'
  | 'PIN_RESET_REQUESTED'
  | 'PIN_RESET_APPROVED'
  | 'WEBAUTHN_ENROLLED'
  | 'WEBAUTHN_VERIFIED'
  | 'ADMIN_ACTION'
  | 'TALLY_CEREMONY_STARTED'
  | 'TALLY_CEREMONY_COMPLETE'
  | 'MIXNET_RUN'
  | 'HOMOMORPHIC_CEREMONY'
  | 'RATE_LIMIT_HIT'
  | 'UNAUTHORIZED_ACCESS';

// ── Morgan HTTP stream ────────────────────────────────────────────────────────

/**
 * Morgan stream that pipes HTTP request logs into Winston.
 * Replace morgan('dev') with morgan('combined', { stream: morganStream }) in index.ts.
 */
export const morganStream: StreamOptions = {
  write: (message: string) => {
    logger.http(message.trimEnd());
  },
};

// ── Request logging middleware ────────────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express';

/**
 * Attaches request-scoped logger to req.log.
 * Logs response status + duration on finish.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const requestId = res.getHeader('X-Request-ID') as string | undefined;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error'
                : res.statusCode >= 400 ? 'warn'
                : 'http';

    logger.log(level, `${req.method} ${req.path} ${res.statusCode}`, {
      method:     req.method,
      path:       req.path,
      status:     res.statusCode,
      durationMs: duration,
      requestId,
      ip:         req.ip,
      userAgent:  req.headers['user-agent'],
    });
  });

  next();
}
