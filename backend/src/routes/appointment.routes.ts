import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { appointmentService } from '../services/appointment.service.js';
import { ServiceError } from '../services/voter.service.js';

const router: Router = Router();

const createSlotsSchema = z.object({
  pollingStationId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
  slotDurationMinutes: z.number().int().min(5).max(60).default(15),
  assignedOfficerId: z.string().optional(),
  assignedOfficerName: z.string().optional(),
});

const bookSlotSchema = z.object({
  nationalId: z.string().regex(/^\d{8}$/, 'National ID must be exactly 8 digits'),
});

// ============================================
// IEBC ADMIN ENDPOINTS
// ============================================

// POST /api/appointments/create-slots - IEBC creates time slots for a day
router.post('/create-slots', async (req: Request, res: Response) => {
  try {
    const parsed = createSlotsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map(e => e.message).join(', '),
      });
      return;
    }

    const result = await appointmentService.createSlots({
      ...parsed.data,
      date: new Date(parsed.data.date),
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create slots',
    });
  }
});

// GET /api/appointments/scheduled - IEBC views scheduled appointments
router.get('/scheduled', async (req: Request, res: Response) => {
  try {
    const pollingStationId = req.query.pollingStationId as string | undefined;
    const assignedOfficerId = req.query.assignedOfficerId as string | undefined;
    const date = req.query.date ? new Date(req.query.date as string) : undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await appointmentService.getScheduledAppointments({
      pollingStationId,
      assignedOfficerId,
      date,
      page,
      limit,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch appointments',
    });
  }
});

// POST /api/appointments/:id/complete - IEBC marks appointment as completed
router.post('/:id/complete', async (req: Request, res: Response) => {
  try {
    const { notes } = req.body;
    const result = await appointmentService.completeAppointment(req.params.id, notes);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to complete appointment',
    });
  }
});

// POST /api/appointments/:id/no-show - IEBC marks voter as no-show
router.post('/:id/no-show', async (req: Request, res: Response) => {
  try {
    const result = await appointmentService.markNoShow(req.params.id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark no-show',
    });
  }
});

// DELETE /api/appointments/slots - Delete available slots for a time range
router.delete('/slots', async (req: Request, res: Response) => {
  try {
    const { pollingStationId, fromDate, toDate } = req.body;

    if (!pollingStationId || !fromDate || !toDate) {
      res.status(400).json({
        success: false,
        error: 'pollingStationId, fromDate, and toDate are required',
      });
      return;
    }

    const result = await appointmentService.deleteAvailableSlots(
      pollingStationId,
      new Date(fromDate),
      new Date(toDate)
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete slots',
    });
  }
});

// ============================================
// VOTER ENDPOINTS
// ============================================

// GET /api/appointments/nearby - Find slots near a location
router.get('/nearby', async (req: Request, res: Response) => {
  try {
    const latitude = parseFloat(req.query.latitude as string);
    const longitude = parseFloat(req.query.longitude as string);

    if (isNaN(latitude) || isNaN(longitude)) {
      res.status(400).json({
        success: false,
        error: 'Valid latitude and longitude are required',
      });
      return;
    }

    const maxDistanceKm = req.query.maxDistanceKm
      ? parseFloat(req.query.maxDistanceKm as string)
      : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const fromDate = req.query.fromDate ? new Date(req.query.fromDate as string) : undefined;
    const toDate = req.query.toDate ? new Date(req.query.toDate as string) : undefined;

    const slots = await appointmentService.findNearbySlots({
      latitude,
      longitude,
      maxDistanceKm,
      fromDate,
      toDate,
      limit,
    });

    res.json({
      success: true,
      data: slots,
      searchLocation: { latitude, longitude },
      maxDistanceKm: maxDistanceKm || 50,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to find nearby slots',
    });
  }
});

// GET /api/appointments/near-me - Find slots near voter's registered polling station
router.get('/near-me', async (req: Request, res: Response) => {
  try {
    const nationalId = req.query.nationalId as string;
    if (!nationalId) {
      res.status(400).json({
        success: false,
        error: 'nationalId is required',
      });
      return;
    }

    const maxDistanceKm = req.query.maxDistanceKm
      ? parseFloat(req.query.maxDistanceKm as string)
      : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

    const result = await appointmentService.findSlotsNearVoter(nationalId, maxDistanceKm, limit);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to find nearby slots',
    });
  }
});

// GET /api/appointments/available - Voter views available slots
router.get('/available', async (req: Request, res: Response) => {
  try {
    const pollingStationId = req.query.pollingStationId as string;
    if (!pollingStationId) {
      res.status(400).json({
        success: false,
        error: 'pollingStationId is required',
      });
      return;
    }

    const fromDate = req.query.fromDate ? new Date(req.query.fromDate as string) : undefined;
    const toDate = req.query.toDate ? new Date(req.query.toDate as string) : undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await appointmentService.getAvailableSlots(
      pollingStationId,
      fromDate,
      toDate,
      page,
      limit
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch available slots',
    });
  }
});

// POST /api/appointments/:id/book - Voter books a slot
router.post('/:id/book', async (req: Request, res: Response) => {
  try {
    const parsed = bookSlotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map(e => e.message).join(', '),
      });
      return;
    }

    const result = await appointmentService.bookSlot(req.params.id, parsed.data.nationalId);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to book slot',
    });
  }
});

// DELETE /api/appointments/my-booking - Voter cancels their booking
router.delete('/my-booking', async (req: Request, res: Response) => {
  try {
    const { nationalId } = req.body;
    if (!nationalId) {
      res.status(400).json({
        success: false,
        error: 'nationalId is required',
      });
      return;
    }

    const result = await appointmentService.cancelBooking(nationalId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel booking',
    });
  }
});

// GET /api/appointments/my-booking - Voter views their booking
router.get('/my-booking', async (req: Request, res: Response) => {
  try {
    const nationalId = req.query.nationalId as string;
    if (!nationalId) {
      res.status(400).json({
        success: false,
        error: 'nationalId is required',
      });
      return;
    }

    const booking = await appointmentService.getVoterBooking(nationalId);

    res.json({
      success: true,
      data: booking,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch booking',
    });
  }
});

export default router;
