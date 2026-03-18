/**
 * /api/election — legacy one-click ceremony endpoints removed.
 *
 * All tallying now goes through the threshold Shamir ceremony:
 *   POST /api/mixnet/run          — Phase 1: re-encryption mixnet
 *   POST /api/ceremony/start      — Phase 2: key splitting, commissioner emails
 *   POST /api/ceremony/partial    — Each commissioner submits their key share
 *   GET  /api/ceremony/status     — Track collection progress
 *   GET  /api/ceremony/result     — Final tally once finalized
 *
 * This router is kept in place (mounted at /api/election) to avoid breaking
 * any imports, but exposes no active endpoints.
 */
import { Router } from 'express';

const router: Router = Router();

export default router;
