import { Router, type Request, type Response } from 'express';
import { voteRepository } from '../repositories/vote.repository.js';
import { receiptRateLimiter } from '../middleware/index.js';

const router: Router = Router();

// GET /api/receipts/:serialNumber
router.get('/:serialNumber', receiptRateLimiter, async (req: Request, res: Response) => {
  try {
    const { serialNumber } = req.params;

    if (!/^[0-9A-F]{16}$/i.test(serialNumber)) {
      res.status(400).json({
        success: false,
        error: 'Invalid serial number format',
      });
      return;
    }

    const result = await voteRepository.verifyBySerialNumber(serialNumber.toUpperCase());

    if (!result.exists) {
      res.status(404).json({
        success: false,
        error: 'No vote found with this serial number',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        serialNumber: serialNumber.toUpperCase(),
        status: result.status,
        blockchainTxHash: result.blockchainTxHash ?? null,
        confirmedAt: result.confirmedAt ?? null,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve receipt',
    });
  }
});

export default router;
