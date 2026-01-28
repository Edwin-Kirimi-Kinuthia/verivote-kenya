/**
 * Repositories Index
 * 
 * Re-exports all repositories for easy importing:
 * 
 *   import { voterRepository, voteRepository } from './repositories';
 */

export { BaseRepository } from './base.repository.js';
export { VoterRepository, voterRepository } from './voter.repository.js';
export { VoteRepository, voteRepository } from './vote.repository.js';
export { PollingStationRepository, pollingStationRepository } from './polling-station.repository.js';
export { PrintQueueRepository, printQueueRepository } from './print-queue.repository.js';
