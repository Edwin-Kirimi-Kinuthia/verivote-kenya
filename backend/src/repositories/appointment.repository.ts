/**
 * VeriVote Kenya - Manual Review Appointment Repository
 */

import { prisma } from '../database/client.js';
import type {
  ManualReviewAppointment,
  CreateAppointmentInput,
  UpdateAppointmentInput,
  AppointmentStatus,
  PaginatedResponse,
} from '../types/database.types.js';

// Haversine formula to calculate distance between two coordinates in kilometers
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export class AppointmentRepository {
  private getPagination(params: { page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
  }

  private buildPaginatedResponse<T>(
    data: T[],
    total: number,
    page: number,
    limit: number
  ): PaginatedResponse<T> {
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async findById(id: string): Promise<ManualReviewAppointment | null> {
    return prisma.manualReviewAppointment.findUnique({
      where: { id },
    }) as Promise<ManualReviewAppointment | null>;
  }

  async findByVoterId(voterId: string): Promise<ManualReviewAppointment | null> {
    return prisma.manualReviewAppointment.findUnique({
      where: { voterId },
    }) as Promise<ManualReviewAppointment | null>;
  }

  async create(data: CreateAppointmentInput): Promise<ManualReviewAppointment> {
    return prisma.manualReviewAppointment.create({
      data: {
        scheduledAt: data.scheduledAt,
        durationMinutes: data.durationMinutes || 15,
        pollingStationId: data.pollingStationId,
        assignedOfficerId: data.assignedOfficerId,
        assignedOfficerName: data.assignedOfficerName,
        status: 'AVAILABLE',
      },
    }) as Promise<ManualReviewAppointment>;
  }

  async createBulk(slots: CreateAppointmentInput[]): Promise<number> {
    const result = await prisma.manualReviewAppointment.createMany({
      data: slots.map(slot => ({
        scheduledAt: slot.scheduledAt,
        durationMinutes: slot.durationMinutes || 15,
        pollingStationId: slot.pollingStationId,
        assignedOfficerId: slot.assignedOfficerId,
        assignedOfficerName: slot.assignedOfficerName,
        status: 'AVAILABLE' as const,
      })),
    });
    return result.count;
  }

  async update(id: string, data: UpdateAppointmentInput): Promise<ManualReviewAppointment> {
    return prisma.manualReviewAppointment.update({
      where: { id },
      data,
    }) as Promise<ManualReviewAppointment>;
  }

  async bookSlot(id: string, voterId: string): Promise<ManualReviewAppointment> {
    return prisma.manualReviewAppointment.update({
      where: { id },
      data: {
        voterId,
        status: 'BOOKED',
        bookedAt: new Date(),
      },
    }) as Promise<ManualReviewAppointment>;
  }

  async cancelBooking(id: string): Promise<ManualReviewAppointment> {
    return prisma.manualReviewAppointment.update({
      where: { id },
      data: {
        voterId: null,
        status: 'AVAILABLE',
        bookedAt: null,
      },
    }) as Promise<ManualReviewAppointment>;
  }

  async markCompleted(id: string, notes?: string): Promise<ManualReviewAppointment> {
    return prisma.manualReviewAppointment.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        notes,
      },
    }) as Promise<ManualReviewAppointment>;
  }

  async markNoShow(id: string): Promise<ManualReviewAppointment> {
    return prisma.manualReviewAppointment.update({
      where: { id },
      data: { status: 'NO_SHOW' },
    }) as Promise<ManualReviewAppointment>;
  }

  async findAvailableSlots(params: {
    pollingStationId: string;
    fromDate?: Date;
    toDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<ManualReviewAppointment>> {
    const { page, limit, skip } = this.getPagination(params);

    const where: {
      pollingStationId: string;
      status: AppointmentStatus;
      scheduledAt?: { gte?: Date; lte?: Date };
    } = {
      pollingStationId: params.pollingStationId,
      status: 'AVAILABLE',
    };

    if (params.fromDate || params.toDate) {
      where.scheduledAt = {};
      if (params.fromDate) where.scheduledAt.gte = params.fromDate;
      if (params.toDate) where.scheduledAt.lte = params.toDate;
    }

    const [data, total] = await Promise.all([
      prisma.manualReviewAppointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'asc' },
      }),
      prisma.manualReviewAppointment.count({ where }),
    ]);

    return this.buildPaginatedResponse(data as ManualReviewAppointment[], total, page, limit);
  }

  async findBookedSlots(params: {
    pollingStationId?: string;
    assignedOfficerId?: string;
    fromDate?: Date;
    toDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<ManualReviewAppointment & { voter: { id: string; nationalId: string } | null }>> {
    const { page, limit, skip } = this.getPagination(params);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { status: 'BOOKED' };

    if (params.pollingStationId) {
      where.pollingStationId = params.pollingStationId;
    }

    if (params.assignedOfficerId) {
      where.assignedOfficerId = params.assignedOfficerId;
    }

    if (params.fromDate || params.toDate) {
      where.scheduledAt = {};
      if (params.fromDate) where.scheduledAt.gte = params.fromDate;
      if (params.toDate) where.scheduledAt.lte = params.toDate;
    }

    const [data, total] = await Promise.all([
      prisma.manualReviewAppointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'asc' },
        include: {
          voter: {
            select: { id: true, nationalId: true },
          },
        },
      }),
      prisma.manualReviewAppointment.count({ where }),
    ]);

    return this.buildPaginatedResponse(data as (ManualReviewAppointment & { voter: { id: string; nationalId: string } | null })[], total, page, limit);
  }

  async getSlotsByStation(
    pollingStationId: string,
    date: Date
  ): Promise<ManualReviewAppointment[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return prisma.manualReviewAppointment.findMany({
      where: {
        pollingStationId,
        scheduledAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { scheduledAt: 'asc' },
    }) as Promise<ManualReviewAppointment[]>;
  }

  async delete(id: string): Promise<ManualReviewAppointment> {
    return prisma.manualReviewAppointment.delete({
      where: { id },
    }) as Promise<ManualReviewAppointment>;
  }

  async deleteAvailableSlots(pollingStationId: string, fromDate: Date, toDate: Date): Promise<number> {
    const result = await prisma.manualReviewAppointment.deleteMany({
      where: {
        pollingStationId,
        status: 'AVAILABLE',
        scheduledAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
    });
    return result.count;
  }

  async findNearbyAvailableSlots(params: {
    latitude: number;
    longitude: number;
    maxDistanceKm?: number;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
  }): Promise<{
    slot: ManualReviewAppointment;
    station: { id: string; name: string; code: string; address: string | null; county: string; latitude: number; longitude: number };
    distanceKm: number;
  }[]> {
    const maxDistance = params.maxDistanceKm || 50; // Default 50km radius
    const limit = params.limit || 20;
    const fromDate = params.fromDate || new Date();

    // Get all available slots with their polling stations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereClause: any = {
      status: 'AVAILABLE',
      scheduledAt: { gte: fromDate },
    };

    if (params.toDate) {
      whereClause.scheduledAt.lte = params.toDate;
    }

    const slots = await prisma.manualReviewAppointment.findMany({
      where: whereClause,
      include: {
        pollingStation: {
          select: {
            id: true,
            name: true,
            code: true,
            address: true,
            county: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    // Calculate distances and filter by max distance
    const slotsWithDistance = slots
      .filter(slot => slot.pollingStation.latitude && slot.pollingStation.longitude)
      .map(slot => {
        const stationLat = Number(slot.pollingStation.latitude);
        const stationLon = Number(slot.pollingStation.longitude);
        const distance = calculateDistance(
          params.latitude,
          params.longitude,
          stationLat,
          stationLon
        );
        return {
          slot: {
            id: slot.id,
            scheduledAt: slot.scheduledAt,
            durationMinutes: slot.durationMinutes,
            pollingStationId: slot.pollingStationId,
            status: slot.status as AppointmentStatus,
            voterId: slot.voterId,
            assignedOfficerId: slot.assignedOfficerId,
            assignedOfficerName: slot.assignedOfficerName,
            bookedAt: slot.bookedAt,
            notes: slot.notes,
            createdAt: slot.createdAt,
            updatedAt: slot.updatedAt,
          },
          station: {
            id: slot.pollingStation.id,
            name: slot.pollingStation.name,
            code: slot.pollingStation.code,
            address: slot.pollingStation.address,
            county: slot.pollingStation.county,
            latitude: stationLat,
            longitude: stationLon,
          },
          distanceKm: Math.round(distance * 10) / 10, // Round to 1 decimal
        };
      })
      .filter(item => item.distanceKm <= maxDistance)
      .sort((a, b) => {
        // Sort by distance first, then by time
        if (a.distanceKm !== b.distanceKm) {
          return a.distanceKm - b.distanceKm;
        }
        return new Date(a.slot.scheduledAt).getTime() - new Date(b.slot.scheduledAt).getTime();
      })
      .slice(0, limit);

    return slotsWithDistance;
  }
}

export const appointmentRepository = new AppointmentRepository();
