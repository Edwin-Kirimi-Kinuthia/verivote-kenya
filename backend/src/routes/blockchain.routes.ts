import { Router, Request, Response } from 'express';
import { blockchainService } from '../services/blockchain.service.js';

const router = Router();

router.post('/mint-sbt', async (req: Request, res: Response) => {
  try {
    const { voterAddress, nationalIdHash } = req.body;

    if (!voterAddress || !nationalIdHash) {
      res.status(400).json({
        success: false,
        error: 'voterAddress and nationalIdHash are required',
      });
      return;
    }

    const result = await blockchainService.mintSBT(voterAddress, nationalIdHash);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mint SBT',
    });
  }
});

router.post('/record-vote', async (req: Request, res: Response) => {
  try {
    const { voteHash, serialNumber } = req.body;

    if (!voteHash || !serialNumber) {
      res.status(400).json({
        success: false,
        error: 'voteHash and serialNumber are required',
      });
      return;
    }

    const result = await blockchainService.recordVote(voteHash, serialNumber);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record vote',
    });
  }
});

router.get('/verify-vote/:serialNumber', async (req: Request, res: Response) => {
  try {
    const { serialNumber } = req.params;
    const record = await blockchainService.getVoteRecord(serialNumber);

    if (!record) {
      res.status(404).json({ success: false, error: 'Vote not found' });
      return;
    }

    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify vote',
    });
  }
});

export default router;
