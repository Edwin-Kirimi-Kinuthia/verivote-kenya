/**
 * ============================================================================
 * VeriVote Kenya - Database Client
 * ============================================================================
 * 
 * This file creates a singleton Prisma client that's used across the app.
 * 
 * WHY A SINGLETON?
 * ----------------
 * In development, every time you save a file, the server restarts (hot-reload).
 * If we created a new PrismaClient each time, we'd quickly run out of database
 * connections. The singleton pattern ensures we reuse the same client.
 * 
 * HOW IT WORKS:
 * -------------
 * 1. We store the client in `globalThis` (a global variable that persists)
 * 2. On each reload, we check if a client already exists
 * 3. If yes, reuse it; if no, create a new one
 * 
 * ============================================================================
 */

import { PrismaClient } from '@prisma/client';

// Extend the global type to include our prisma property
// This is TypeScript magic to allow us to add a property to globalThis
declare global {
  // Using `var` is required here for global scope (not let or const)
  var prisma: PrismaClient | undefined;
}

/**
 * Creates a new PrismaClient with logging configuration
 * 
 * In development: Logs all queries, warnings, and errors (helpful for debugging)
 * In production: Only logs errors (better performance)
 */
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'info', 'warn', 'error']  // Verbose logging for development
      : ['error'],                            // Minimal logging for production
    errorFormat: 'pretty',  // Human-readable error messages
  });
}

/**
 * The singleton Prisma client
 * 
 * Uses nullish coalescing (??): 
 * - If globalThis.prisma exists, use it
 * - Otherwise, create a new client
 */
export const prisma = globalThis.prisma ?? createPrismaClient();

// In non-production environments, store the client globally
// This ensures it survives hot-reloads
if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

/**
 * Graceful shutdown handler
 * 
 * When the Node.js process is about to exit, we disconnect from the database.
 * This ensures all pending queries complete and connections are closed properly.
 */
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// Export as default for convenient importing
export default prisma;

/**
 * USAGE EXAMPLE:
 * 
 * ```typescript
 * import { prisma } from './database/client.js';
 * 
 * // Find all voters
 * const voters = await prisma.voter.findMany();
 * 
 * // Find one voter by ID
 * const voter = await prisma.voter.findUnique({
 *   where: { id: 'some-uuid' }
 * });
 * 
 * // Create a voter
 * const newVoter = await prisma.voter.create({
 *   data: {
 *     nationalId: '12345678',
 *     pollingStationId: 'station-uuid',
 *   }
 * });
 * 
 * // Include related data
 * const voterWithStation = await prisma.voter.findUnique({
 *   where: { id: 'some-uuid' },
 *   include: { pollingStation: true }  // JOIN!
 * });
 * ```
 */
