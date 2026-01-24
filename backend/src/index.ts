/**
 * VeriVote Kenya - Main Server Entry Point
 * =========================================
 */

import dotenv from 'dotenv';
dotenv.config();

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

// ============================================
// CREATE EXPRESS APPLICATION
// ============================================

const app: Express = express();

const PORT = process.env.PORT || 3000;
// MIDDLEWARE SETUP
// ============================================
// Middleware = functions that run on EVERY request before reaching your routes
// They process/modify the request or response

// Security headers (protects against XSS, clickjacking, etc.)
app.use(helmet());

// Enable CORS (Cross-Origin Resource Sharing)
// This allows the frontend (running on a different port) to call our API
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true, // Allow cookies to be sent
}));

// Parse JSON request bodies
// When someone sends JSON data, this converts it to a JavaScript object
// Example: POST /api/voters with body {"name": "John"} 
// becomes accessible as req.body.name
app.use(express.json());

// Parse URL-encoded bodies (form submissions)
app.use(express.urlencoded({ extended: true }));

// Request logging (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ============================================
// HEALTH CHECK ROUTE
// ============================================
// This simple endpoint lets us verify the server is running
// Used by Docker, load balancers, and monitoring tools

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ============================================
// API ROUTES
// ============================================
// These are the main endpoints our application will expose
// We'll add more routes in separate files as the project grows

// Root route - API information
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'VeriVote Kenya API',
    version: '0.1.0',
    description: 'Hybrid Electronic Voting System API',
    endpoints: {
      health: 'GET /health - Check if server is running',
      voters: 'Coming soon: /api/voters',
      votes: 'Coming soon: /api/votes',
      verify: 'Coming soon: /api/verify',
    },
  });
});

// Placeholder for voter routes (we'll implement these in Week 2)
app.get('/api/voters', (_req: Request, res: Response) => {
  res.json({
    message: 'Voter endpoints coming soon!',
    planned_endpoints: [
      'POST /api/voters/register - Register a new voter',
      'POST /api/voters/verify-pin - Verify voter PIN',
      'GET /api/voters/:id/status - Get voter status',
    ],
  });
});

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================
// This catches any errors that occur in our routes
// Must be defined AFTER all other routes

// 404 Handler - Route not found
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `The endpoint ${req.method} ${req.path} does not exist`,
  });
});

// Global error handler
// Note: _next is prefixed with underscore because it's required by Express
// but we don't use it in this function
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

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🗳️  VeriVote Kenya API Server');
  console.log('='.repeat(50));
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(50));
});

// Export app for testing purposes
export default app;
