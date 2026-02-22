import dotenv from 'dotenv';
dotenv.config();

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

import { prisma } from './database/client.js';
import { globalRateLimiter } from './middleware/index.js';
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
import voterRoutes from './routes/voter.routes.js';
import adminRoutes from './routes/admin.routes.js';
import appointmentRoutes from './routes/appointment.routes.js';
import pinResetRoutes from './routes/pin-reset.routes.js';
import voteRoutes from './routes/vote.routes.js';
import receiptRoutes from './routes/receipt.routes.js';
import printQueueRoutes from './routes/print-queue.routes.js';

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
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
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
  // Allow Swagger UI to load its own assets in development
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(globalRateLimiter);

// Attach a request ID to every response (useful for mobile client logging)
app.use((_req: Request, res: Response, next: NextFunction) => {
  const id = _req.headers['x-request-id'] as string || crypto.randomUUID();
  res.setHeader('X-Request-ID', id);
  next();
});

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

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

// Voter routes (registration, PIN verification, listing)
app.use('/api/voters', voterRoutes);

// Admin routes for IEBC manual verification review
app.use('/api/admin', adminRoutes);

// Appointment scheduling for manual reviews
app.use('/api/appointments', appointmentRoutes);

// PIN reset for voters who forgot their PIN
app.use('/api/pin-reset', pinResetRoutes);

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

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);

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
    console.log('✅ Database connected');

    // Initialize ElGamal encryption (fail-fast if key missing)
    encryptionService.init();

    // Connect to blockchain (non-fatal if unavailable)
    try {
      await blockchainService.connect();
      console.log('✅ Blockchain connected');
    } catch (error) {
      console.warn('⚠️  Blockchain not available:', error instanceof Error ? error.message : 'Unknown error');
    }

    // Start background maintenance scheduler
    startScheduler();

    app.listen(PORT, () => {
      console.log('='.repeat(50));
      console.log('🗳️  VeriVote Kenya API Server');
      console.log('='.repeat(50));
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`📋 Health check: http://localhost:${PORT}/health`);
      console.log(`📚 API Docs:     http://localhost:${PORT}/api/docs`);
      console.log(`📊 Statistics:   http://localhost:${PORT}/api/stats`);
      console.log(`🌐 Environment:  ${process.env.NODE_ENV || 'development'}`);
      console.log('='.repeat(50));
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await prisma.$disconnect();
  await disconnectRedis();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down...');
  await prisma.$disconnect();
  await disconnectRedis();
  process.exit(0);
});

export default app;
