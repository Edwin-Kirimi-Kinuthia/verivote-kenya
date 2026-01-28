/**
 * Database Module Index
 * 
 * Re-exports the Prisma client for easy importing
 * 
 * Usage:
 *   import { prisma } from './database/index.js';
 *   // or
 *   import { prisma } from './database';
 */

export { prisma, default as db } from './client.js';
