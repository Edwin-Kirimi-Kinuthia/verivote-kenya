/**
 * VeriVote Kenya - Background Scheduler
 *
 * Runs periodic maintenance tasks using setInterval.
 * All jobs are non-fatal: errors are logged but never crash the server.
 */

import { appointmentRepository } from '../repositories/index.js';
import { prisma } from '../database/client.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

async function cleanExpiredSlots(): Promise<void> {
  try {
    const deleted = await appointmentRepository.deleteExpiredAvailableSlots();
    if (deleted > 0) {
      console.log(`🗑️  Scheduler: Removed ${deleted} expired appointment slot(s)`);
    }
  } catch (error) {
    console.error(
      '⚠️  Scheduler: Slot cleanup failed:',
      error instanceof Error ? error.message : error
    );
  }
}

async function closeExpiredElections(): Promise<void> {
  try {
    const result = await prisma.election.updateMany({
      where: {
        status: 'ACTIVE',
        endDate: { lt: new Date() },
      },
      data: { status: 'CLOSED' },
    });
    if (result.count > 0) {
      console.log(`🗳️  Scheduler: Auto-closed ${result.count} election(s) that passed their end date`);
    }
  } catch (error) {
    console.error(
      '⚠️  Scheduler: Election auto-close failed:',
      error instanceof Error ? error.message : error
    );
  }
}

export function startScheduler(): void {
  // Run once immediately so stale slots from previous runs are cleared on startup
  cleanExpiredSlots();
  closeExpiredElections();

  // Then repeat every hour
  setInterval(cleanExpiredSlots, ONE_HOUR_MS);
  setInterval(closeExpiredElections, ONE_HOUR_MS);

  console.log('✅ Scheduler started (expired slot cleanup + election auto-close every hour)');
}
