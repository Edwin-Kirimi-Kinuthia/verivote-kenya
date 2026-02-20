import { appointmentRepository, voterRepository, pollingStationRepository } from '../repositories/index.js';
import { ServiceError } from './voter.service.js';
import { adminService } from './admin.service.js';

export class AppointmentService {
  /**
   * IEBC creates available time slots across a date range
   * daysOfWeek: 1=Monday, 2=Tuesday, ..., 7=Sunday (ISO 8601)
   */
  async createSchedule(params: {
    pollingStationId: string;
    fromDate: Date;
    toDate: Date;
    daysOfWeek?: number[];
    startHour: number;
    endHour: number;
    slotDurationMinutes: number;
    assignedOfficerId?: string;
    assignedOfficerName?: string;
  }) {
    const { pollingStationId, fromDate, toDate, startHour, endHour, slotDurationMinutes } = params;
    const daysOfWeek = params.daysOfWeek ?? [1, 2, 3, 4, 5, 6, 7];

    if (startHour >= endHour) {
      throw new ServiceError('Start hour must be before end hour', 400);
    }

    if (slotDurationMinutes < 5 || slotDurationMinutes > 60) {
      throw new ServiceError('Slot duration must be between 5 and 60 minutes', 400);
    }

    const slots = [];
    const current = new Date(fromDate);
    current.setHours(0, 0, 0, 0);

    const rangeEnd = new Date(toDate);
    rangeEnd.setHours(23, 59, 59, 999);

    while (current <= rangeEnd) {
      // Convert JS day (0=Sun, 1=Mon...) to ISO day (1=Mon, 7=Sun)
      const jsDay = current.getDay();
      const isoDay = jsDay === 0 ? 7 : jsDay;

      if (daysOfWeek.includes(isoDay)) {
        const dayStart = new Date(current);
        dayStart.setHours(startHour, 0, 0, 0);

        const dayEnd = new Date(current);
        dayEnd.setHours(endHour, 0, 0, 0);

        let slotTime = new Date(dayStart);
        while (slotTime < dayEnd) {
          slots.push({
            scheduledAt: new Date(slotTime),
            durationMinutes: slotDurationMinutes,
            pollingStationId,
            assignedOfficerId: params.assignedOfficerId,
            assignedOfficerName: params.assignedOfficerName,
          });
          slotTime = new Date(slotTime.getTime() + slotDurationMinutes * 60000);
        }
      }

      current.setDate(current.getDate() + 1);
    }

    const count = await appointmentRepository.createBulk(slots);

    return {
      slotsCreated: count,
      pollingStationId,
      fromDate: fromDate.toISOString().split('T')[0],
      toDate: toDate.toISOString().split('T')[0],
      daysOfWeek,
      startHour,
      endHour,
      slotDurationMinutes,
    };
  }

  /**
   * Get available slots for a polling station
   */
  async getAvailableSlots(pollingStationId: string, fromDate?: Date, toDate?: Date, page = 1, limit = 20) {
    return appointmentRepository.findAvailableSlots({
      pollingStationId,
      fromDate: fromDate || new Date(),
      toDate,
      page,
      limit,
    });
  }

  /**
   * Voter books an available slot
   */
  async bookSlot(slotId: string, nationalId: string, purpose: 'REGISTRATION' | 'PIN_RESET' = 'REGISTRATION') {
    const voter = await voterRepository.findByNationalId(nationalId);
    if (!voter) {
      throw new ServiceError('Voter not found', 404);
    }

    if (purpose === 'PIN_RESET') {
      if (!voter.pinResetRequested) {
        throw new ServiceError('No PIN reset request found for this voter. Please request a PIN reset first.', 400);
      }
    } else {
      // REGISTRATION: voter must be pending manual review OR already registered (mock/test mode)
      const allowedStatuses = ['PENDING_MANUAL_REVIEW', 'REGISTERED'];
      if (!allowedStatuses.includes(voter.status)) {
        throw new ServiceError('Only voters pending manual review can book appointments', 400);
      }
    }

    // Check if voter already has a booking
    const existingBooking = await appointmentRepository.findByVoterId(voter.id);
    if (existingBooking && existingBooking.status === 'BOOKED') {
      throw new ServiceError('You already have a booked appointment', 409);
    }

    const slot = await appointmentRepository.findById(slotId);
    if (!slot) {
      throw new ServiceError('Appointment slot not found', 404);
    }

    if (slot.status !== 'AVAILABLE') {
      throw new ServiceError('This slot is no longer available', 409);
    }

    if (new Date(slot.scheduledAt) < new Date()) {
      throw new ServiceError('Cannot book a slot in the past', 400);
    }

    const bookedSlot = await appointmentRepository.bookSlot(slotId, voter.id, purpose);

    // Fetch station name for the confirmation
    const station = await pollingStationRepository.findById(bookedSlot.pollingStationId);

    return {
      appointmentId: bookedSlot.id,
      scheduledAt: bookedSlot.scheduledAt,
      pollingStationId: bookedSlot.pollingStationId,
      pollingStationName: station?.name,
      durationMinutes: bookedSlot.durationMinutes,
      purpose,
      message: 'Appointment booked successfully. Please bring your national ID for verification.',
    };
  }

  /**
   * Voter cancels their booking
   */
  async cancelBooking(nationalId: string) {
    const voter = await voterRepository.findByNationalId(nationalId);
    if (!voter) {
      throw new ServiceError('Voter not found', 404);
    }

    const booking = await appointmentRepository.findByVoterId(voter.id);
    if (!booking) {
      throw new ServiceError('No booking found', 404);
    }

    if (booking.status !== 'BOOKED') {
      throw new ServiceError('Booking cannot be cancelled', 400);
    }

    await appointmentRepository.cancelBooking(booking.id);

    return { message: 'Booking cancelled successfully' };
  }

  /**
   * Get voter's current booking
   */
  async getVoterBooking(nationalId: string) {
    const voter = await voterRepository.findByNationalId(nationalId);
    if (!voter) {
      throw new ServiceError('Voter not found', 404);
    }

    const booking = await appointmentRepository.findByVoterId(voter.id);
    if (!booking || booking.status !== 'BOOKED') {
      return null;
    }

    return booking;
  }

  /**
   * IEBC gets scheduled appointments for review
   */
  async getScheduledAppointments(params: {
    pollingStationId?: string;
    assignedOfficerId?: string;
    date?: Date;
    page?: number;
    limit?: number;
  }) {
    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (params.date) {
      fromDate = new Date(params.date);
      fromDate.setHours(0, 0, 0, 0);
      toDate = new Date(params.date);
      toDate.setHours(23, 59, 59, 999);
    }

    return appointmentRepository.findBookedSlots({
      pollingStationId: params.pollingStationId,
      assignedOfficerId: params.assignedOfficerId,
      fromDate,
      toDate,
      page: params.page,
      limit: params.limit,
    });
  }

  /**
   * IEBC marks appointment as completed
   */
  async completeAppointment(appointmentId: string, notes?: string) {
    const appointment = await appointmentRepository.findById(appointmentId);
    if (!appointment) {
      throw new ServiceError('Appointment not found', 404);
    }

    if (appointment.status !== 'BOOKED') {
      throw new ServiceError('Only booked appointments can be marked as completed', 400);
    }

    return appointmentRepository.markCompleted(appointmentId, notes);
  }

  /**
   * IEBC marks voter as no-show
   */
  async markNoShow(appointmentId: string) {
    const appointment = await appointmentRepository.findById(appointmentId);
    if (!appointment) {
      throw new ServiceError('Appointment not found', 404);
    }

    if (appointment.status !== 'BOOKED') {
      throw new ServiceError('Only booked appointments can be marked as no-show', 400);
    }

    return appointmentRepository.markNoShow(appointmentId);
  }

  /**
   * Admin completes a REGISTRATION appointment and approves the voter (mints SBT, generates PINs)
   */
  async approveVoterAtAppointment(appointmentId: string, reviewerId: string, notes?: string) {
    const appointment = await appointmentRepository.findById(appointmentId);
    if (!appointment) {
      throw new ServiceError('Appointment not found', 404);
    }
    if (appointment.status !== 'BOOKED') {
      throw new ServiceError('Only booked appointments can be completed', 400);
    }
    if (!appointment.voterId) {
      throw new ServiceError('No voter is linked to this appointment', 400);
    }

    // Mark appointment as completed first
    await appointmentRepository.markCompleted(appointmentId, notes);

    // Approve the voter — mints SBT, generates PINs, sets status REGISTERED
    return adminService.approveVoter(appointment.voterId, reviewerId, notes);
  }

  /**
   * Admin completes a REGISTRATION appointment and rejects the voter's identity verification
   */
  async rejectVoterAtAppointment(appointmentId: string, reviewerId: string, reason: string) {
    const appointment = await appointmentRepository.findById(appointmentId);
    if (!appointment) {
      throw new ServiceError('Appointment not found', 404);
    }
    if (appointment.status !== 'BOOKED') {
      throw new ServiceError('Only booked appointments can be completed', 400);
    }
    if (!appointment.voterId) {
      throw new ServiceError('No voter is linked to this appointment', 400);
    }

    // Mark appointment as completed (the meeting happened, we just rejected them)
    await appointmentRepository.markCompleted(appointmentId, `REJECTED: ${reason}`);

    // Reject the voter
    return adminService.rejectVoter(appointment.voterId, reviewerId, reason);
  }

  /**
   * Delete available (unbooked) slots for a time range
   */
  async deleteAvailableSlots(pollingStationId: string, fromDate: Date, toDate: Date) {
    const count = await appointmentRepository.deleteAvailableSlots(pollingStationId, fromDate, toDate);
    return { deletedCount: count };
  }

  /**
   * Find available slots near a given location
   */
  async findNearbySlots(params: {
    latitude: number;
    longitude: number;
    maxDistanceKm?: number;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
  }) {
    return appointmentRepository.findNearbyAvailableSlots(params);
  }

  /**
   * Find available slots near a voter's registered polling station
   */
  async findSlotsNearVoter(nationalId: string, maxDistanceKm?: number, limit?: number) {
    const voter = await voterRepository.findByNationalId(nationalId);
    if (!voter) {
      throw new ServiceError('Voter not found', 404);
    }

    if (!voter.pollingStationId) {
      throw new ServiceError('Voter has no registered polling station', 400);
    }

    // Get voter's polling station to get coordinates
    const station = await pollingStationRepository.findById(voter.pollingStationId);
    if (!station) {
      throw new ServiceError('Polling station not found', 404);
    }

    if (!station.latitude || !station.longitude) {
      throw new ServiceError('Polling station has no location data', 400);
    }

    const slots = await appointmentRepository.findNearbyAvailableSlots({
      latitude: Number(station.latitude),
      longitude: Number(station.longitude),
      maxDistanceKm: maxDistanceKm || 30, // Default 30km for voter searches
      limit: limit || 20,
    });

    return {
      voterLocation: {
        pollingStationId: station.id,
        pollingStationName: station.name,
        county: station.county,
        latitude: Number(station.latitude),
        longitude: Number(station.longitude),
      },
      nearbySlots: slots,
    };
  }
}

export const appointmentService = new AppointmentService();
