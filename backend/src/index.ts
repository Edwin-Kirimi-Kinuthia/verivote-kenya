import dotenv from 'dotenv';
dotenv.config();

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { prisma } from './database/client.js';
import { globalRateLimiter } from './middleware/index.js';
import { disconnectRedis } from './config/redis.js';

import {
  voterRepository,
  voteRepository,
  pollingStationRepository,
  printQueueRepository
} from './repositories/index.js';

import blockchainRoutes from './routes/blockchain.routes.js';
import { blockchainService } from './services/blockchain.service.js';
import { encryptionService } from './services/encryption.service.js';
import voterRoutes from './routes/voter.routes.js';
import adminRoutes from './routes/admin.routes.js';
import appointmentRoutes from './routes/appointment.routes.js';
import pinResetRoutes from './routes/pin-reset.routes.js';
import voteRoutes from './routes/vote.routes.js';
import receiptRoutes from './routes/receipt.routes.js';

// ============================================
// CREATE EXPRESS APPLICATION
// ============================================

const app: Express = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE SETUP
// ============================================

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(globalRateLimiter);

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

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
    version: '0.1.0',
    description: 'Hybrid Electronic Voting System API',
    endpoints: {
      health: 'GET /health - Check if server is running',
      stats: 'GET /api/stats - Get database statistics',
      voters: 'GET /api/voters - List voters',
      votes: 'GET /api/votes - Cast and manage votes',
      receipts: 'GET /api/receipts/:serial - Verify a vote receipt',
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

// ============================================
// BLOCKCHAIN ROUTES
// ============================================

app.use('/api/blockchain', blockchainRoutes);

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `The endpoint ${req.method} ${req.path} does not exist`,
  });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);

  res.status(500).json({
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

    app.listen(PORT, () => {
      console.log('='.repeat(50));
      console.log('🗳️  VeriVote Kenya API Server');
      console.log('='.repeat(50));
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`📋 Health check: http://localhost:${PORT}/health`);
      console.log(`📊 Statistics: http://localhost:${PORT}/api/stats`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
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
