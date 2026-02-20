/**
 * VeriVote Kenya - Background Scheduler
 *
 * Runs periodic maintenance tasks using setInterval.
 * All jobs are non-fatal: errors are logged but never crash the server.
 */

import { appointmentRepository } from '../repositories/index.js';

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

export function startScheduler(): void {
  // Run once immediately so stale slots from previous runs are cleared on startup
  cleanExpiredSlots();

  // Then repeat every hour
  setInterval(cleanExpiredSlots, ONE_HOUR_MS);

  console.log('✅ Scheduler started (expired slot cleanup every hour)');
}
