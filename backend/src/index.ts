import dotenv from 'dotenv';
dotenv.config();

import * as Sentry from '@sentry/node';
import http from 'http';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { logger, morganStream, requestLogger } from './lib/logger.js';

import { prisma } from './database/client.js';
import { globalRateLimiter, publicStatsRateLimiter } from './middleware/index.js';
import { disconnectRedis } from './config/redis.js';
import { swaggerOptions } from './config/swagger.js';

import {
  voterRepository,
  voteRepository,
  pollingStationRepository,
  printQueueRepository
} from './repositories/index.js';

import blockchainRoutes from './routes/blockchain.routes.js';
import { blockchainService } from './services/blockchain.service.js';
import { encryptionService } from './services/encryption.service.js';
import { startScheduler } from './services/scheduler.js';
import { initSocket } from './lib/socket.js';
import authRoutes from './routes/auth.routes.js';
import voterRoutes from './routes/voter.routes.js';
import adminRoutes from './routes/admin.routes.js';
import appointmentRoutes from './routes/appointment.routes.js';
import pinResetRoutes from './routes/pin-reset.routes.js';
import webAuthnRoutes from './routes/webauthn.routes.js';
import voteRoutes from './routes/vote.routes.js';
import receiptRoutes from './routes/receipt.routes.js';
import printQueueRoutes from './routes/print-queue.routes.js';
import aiRoutes from './routes/ai.routes.js';
import tallyRoutes from './routes/tally.routes.js';
import mixnetRoutes from './routes/mixnet.routes.js';
import ceremonyRoutes from './routes/ceremony.routes.js';

// ============================================
// SENTRY — initialise before anything else
// ============================================

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
  logger.info('Sentry error tracking initialised');
}

// ============================================
// CREATE EXPRESS APPLICATION
// ============================================

const app: Express = express();
const PORT = process.env.PORT || 3000;
const API_VERSION = 'v1';

// ============================================
// CORS — supports web browser + mobile clients
// ============================================

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  // Mobile app origins (React Native / Expo)
  'http://localhost:19006',
  'http://localhost:8081',
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
];

app.use(cors({
  origin: (origin, callback) => {
    // In production: require an explicit origin (block curl/Postman scraping)
    // In development: allow no-origin for ease of testing
    if (!origin) {
      if (process.env.NODE_ENV === 'production') {
        return callback(new Error('CORS: requests with no origin are not permitted in production'));
      }
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
}));

// ============================================
// MIDDLEWARE SETUP
// ============================================

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      styleSrc:       ["'self'", "'unsafe-inline'"],   // Swagger UI needs inline styles
      imgSrc:         ["'self'", 'data:'],
      connectSrc:     ["'self'"],
      fontSrc:        ["'self'"],
      objectSrc:      ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      ...(process.env.NODE_ENV !== 'production' && {
        // Swagger UI loads scripts from CDN in dev — relax only in dev
        scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
        styleSrc:  ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
        imgSrc:    ["'self'", 'data:', 'cdn.jsdelivr.net'],
      }),
    },
  },
  crossOriginEmbedderPolicy: false,           // needed for Swagger UI
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: false,
  dnsPrefetchControl: { allow: false },
}));
// Capture raw body for webhook signature verification (must be before json parser)
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.path === '/api/voters/persona-webhook') {
    let raw = '';
    req.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
    req.on('end', () => {
      (req as Request & { rawBody?: string }).rawBody = raw;
      try { req.body = JSON.parse(raw); } catch { req.body = {}; }
      next();
    });
  } else {
    next();
  }
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(globalRateLimiter);

// Attach a request ID to every response (useful for mobile client logging)
app.use((_req: Request, res: Response, next: NextFunction) => {
  const id = _req.headers['x-request-id'] as string || crypto.randomUUID();
  res.setHeader('X-Request-ID', id);
  next();
});

// Structured request logging — dev uses 'dev' format through Winston stream,
// production uses 'combined' (Apache format) for log aggregation tools.
app.use(morgan(
  process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
  { stream: morganStream },
));
app.use(requestLogger);

// ============================================
// SWAGGER API DOCS
// ============================================

const swaggerSpec = swaggerJsdoc(swaggerOptions);

app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'VeriVote Kenya API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  }),
);

// Raw OpenAPI JSON spec (useful for mobile codegen tools)
app.get('/api/docs.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ============================================
// HEALTH CHECK ROUTE
// ============================================

app.get('/health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    const blockchainHealthy = await blockchainService.isHealthy();

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      blockchain: blockchainHealthy ? 'connected' : 'disconnected',
      apiVersion: API_VERSION,
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// API ROUTES
// ============================================

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'VeriVote Kenya API',
    version: '1.0.0',
    apiVersion: API_VERSION,
    description: 'Hybrid Electronic Voting System API',
    docs: `http://localhost:${PORT}/api/docs`,
    endpoints: {
      health: 'GET /health',
      docs: 'GET /api/docs - Swagger UI',
      docsJson: 'GET /api/docs.json - OpenAPI spec',
      stats: 'GET /api/stats',
      voters: '/api/voters',
      votes: '/api/votes',
      receipts: '/api/receipts/:serial',
      printQueue: '/api/print-queue (admin)',
      admin: '/api/admin (admin)',
      appointments: '/api/appointments',
      blockchain: '/api/blockchain',
      pollingStations: '/api/polling-stations',
    },
  });
});

app.get('/api/stats', async (_req: Request, res: Response) => {
  try {
    const [voterStats, voteStats, stationStats, printStats] = await Promise.all([
      voterRepository.getStats(),
      voteRepository.getStats(),
      pollingStationRepository.getStats(),
      printQueueRepository.getStats(),
    ]);

    res.json({
      success: true,
      data: {
        voters: voterStats,
        votes: voteStats,
        pollingStations: stationStats,
        printQueue: printStats,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch stats',
    });
  }
});

// Turnout breakdown by county and per-station (public)
app.get('/api/stats/turnout', publicStatsRateLimiter, async (_req: Request, res: Response) => {
  try {
    const [stationStats, stationTurnout] = await Promise.all([
      pollingStationRepository.getStats(),
      pollingStationRepository.getTurnoutByStation(),
    ]);
    res.json({
      success: true,
      data: {
        byCounty: stationStats.byCounty,
        byStation: stationTurnout,
        overall: {
          registered: stationStats.totalRegisteredVoters,
          voted: stationStats.totalVotesCast,
          turnout: stationStats.overallTurnout,
        },
      },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch turnout' });
  }
});

// Votes per hour for the last 24 hours (public)
app.get('/api/stats/hourly', publicStatsRateLimiter, async (_req: Request, res: Response) => {
  try {
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    const data = await voteRepository.getVotesPerHour(from, to);
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch hourly data' });
  }
});

// Blockchain explorer — recent 20 confirmed votes (public)
app.get('/api/stats/explorer', publicStatsRateLimiter, async (_req: Request, res: Response) => {
  try {
    const { data } = await voteRepository.findMany({ page: 1, limit: 20, status: 'CONFIRMED' });
    const rows = data.map((v) => ({
      serial: v.serialNumber,
      status: v.status,
      timestamp: v.timestamp,
      txHash: v.blockchainTxHash ?? null,
      blockNumber: v.blockNumber != null ? v.blockNumber.toString() : null,
      isDistressFlagged: v.isDistressFlagged,
    }));
    const totalConfirmed = await voteRepository.findMany({ page: 1, limit: 1, status: 'CONFIRMED' });
    res.json({ success: true, data: rows, totalConfirmed: totalConfirmed.pagination.total });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch explorer data' });
  }
});

app.get('/api/polling-stations', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const county = req.query.county as string | undefined;

    const result = await pollingStationRepository.findMany({
      page,
      limit,
      county,
      isActive: true,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch stations',
    });
  }
});

app.get('/api/counties', async (_req: Request, res: Response) => {
  try {
    const counties = await pollingStationRepository.getCounties();
    res.json({
      success: true,
      data: counties,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch counties',
    });
  }
});

// Password login and set-password
app.use('/api/auth', authRoutes);

// Voter routes (registration, listing)
app.use('/api/voters', voterRoutes);

// Admin routes for IEBC manual verification review
app.use('/api/admin', adminRoutes);

// Appointment scheduling for manual reviews
app.use('/api/appointments', appointmentRoutes);

// Credential re-enrollment for voters who lost access to their device
app.use('/api/pin-reset', pinResetRoutes);

// WebAuthn fingerprint registration and authentication
app.use('/api/webauthn', webAuthnRoutes);

// Vote casting
app.use('/api/votes', voteRoutes);

// Receipt verification
app.use('/api/receipts', receiptRoutes);

// Print queue management (admin only)
app.use('/api/print-queue', printQueueRoutes);

// ============================================
// BLOCKCHAIN ROUTES
// ============================================

app.use('/api/blockchain', blockchainRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/tally', tallyRoutes);
app.use('/api/mixnet', mixnetRoutes);
app.use('/api/ceremony', ceremonyRoutes);

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `The endpoint ${req.method} ${req.path} does not exist`,
  });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', {
    message: err.message,
    stack:   err.stack,
    method:  req.method,
    path:    req.path,
    requestId: res.getHeader('X-Request-ID'),
  });

  // Forward to Sentry if configured
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }

  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong'
      : err.message,
  });
});

// ============================================
// START SERVER
// ============================================

async function startServer() {
  try {
    await prisma.$connect();
    logger.info('Database connected');

    // Initialize ElGamal encryption (fail-fast if key missing)
    encryptionService.init();

    // Connect to blockchain (non-fatal if unavailable)
    try {
      await blockchainService.connect();
      logger.info('Blockchain connected');
    } catch (error) {
      logger.warn('Blockchain not available', {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Start background maintenance scheduler
    startScheduler();

    const httpServer = http.createServer(app);
    initSocket(httpServer, allowedOrigins);

    httpServer.listen(PORT, () => {
      logger.info('VeriVote Kenya API Server started', {
        port:        PORT,
        environment: process.env.NODE_ENV ?? 'development',
        health:      `http://localhost:${PORT}/health`,
        docs:        `http://localhost:${PORT}/api/docs`,
        websocket:   `ws://localhost:${PORT}/socket.io`,
      });
    });
  } catch (error) {
    logger.error('Failed to start server', {
      message: error instanceof Error ? error.message : String(error),
      stack:   error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

startServer();

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

async function gracefulShutdown(signal: string) {
  logger.info(`Shutting down on ${signal}`);
  await prisma.$disconnect();
  await disconnectRedis();
  process.exit(0);
}

process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export default app;
