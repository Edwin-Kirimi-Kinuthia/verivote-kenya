import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { ServiceError } from '../services/voter.service.js';
import { getActiveElectionsForVoter, getVoterBallot } from '../services/ballot.service.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';

const router: Router = Router();
router.use(requireAuth);

function handleError(err: unknown, res: Response) {
  if (err instanceof ServiceError) {
    res.status(err.statusCode).json({ success: false, error: err.message });
    return;
  }
  res.status(500).json({ success: false, error: 'Internal server error' });
}

// GET /api/ballot/active — active elections this voter is eligible for
router.get('/active', async (req: Request, res: Response) => {
  try {
    const voterId = (req as AuthenticatedRequest).voter.sub;
    res.json({ success: true, data: await getActiveElectionsForVoter(voterId) });
  } catch (e) { handleError(e, res); }
});

// GET /api/ballot/:electionId — personalised ballot for the voter
router.get('/:electionId', async (req: Request, res: Response) => {
  try {
    const voterId = (req as AuthenticatedRequest).voter.sub;
    res.json({ success: true, data: await getVoterBallot(voterId, req.params.electionId) });
  } catch (e) { handleError(e, res); }
});

export default router;
