/**
 * VeriVote Kenya - Main Server Entry Point
 * =========================================
 * 
 * This is the main file that starts our backend server.
 * Think of it as the "front door" of our application.
 * 
 * What this file does:
 * 1. Loads environment variables (secrets, configuration)
 * 2. Creates an Express application (our web server)
 * 3. Sets up middleware (security, logging, JSON parsing)
 * 4. Defines API routes (endpoints that the frontend will call)
 * 5. Starts listening for requests
 */

// ============================================
// IMPORTS
// ============================================

// dotenv: Loads variables from .env file into process.env
// This keeps secrets (passwords, API keys) out of our code
import dotenv from 'dotenv';
dotenv.config();

// express: The web framework that handles HTTP requests
// Think of it as the "waiter" that takes orders (requests) and brings food (responses)
import express, { Request, Response, NextFunction } from 'express';

// cors: Allows our API to be called from different domains (like our frontend)
// Without this, browsers block requests from different origins for security
import cors from 'cors';

// helmet: Adds security headers to protect against common web vulnerabilities
// It's like putting a helmet on your server!
import helmet from 'helmet';

// morgan: Logs every HTTP request (useful for debugging)
// Shows: GET /api/voters 200 15ms
import morgan from 'morgan';

// ============================================
// CREATE EXPRESS APPLICATION
// ============================================

const app = express();

// Get port from environment variable or use 3000 as default
const PORT = process.env.PORT || 3000;

// ============================================
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

app.get('/health', (req: Request, res: Response) => {
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
app.get('/', (req: Request, res: Response) => {
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
app.get('/api/voters', (req: Request, res: Response) => {
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
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
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
