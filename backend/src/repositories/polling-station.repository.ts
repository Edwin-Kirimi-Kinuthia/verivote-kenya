/**
 * VeriVote Kenya - Polling Station Repository
 */

import { prisma } from '../database/client.js';
import { BaseRepository } from './base.repository.js';
import type {
  PollingStation,
  CreatePollingStationInput,
  UpdatePollingStationInput,
  PollingStationQueryParams,
  PollingStationStats,
  PaginatedResponse,
} from '../types/database.types.js';

export class PollingStationRepository extends BaseRepository<
  PollingStation,
  CreatePollingStationInput,
  UpdatePollingStationInput
> {
  
  async findById(id: string): Promise<PollingStation | null> {
    return prisma.pollingStation.findUnique({
      where: { id },
    }) as Promise<PollingStation | null>;
  }

  async findByCode(code: string): Promise<PollingStation | null> {
    return prisma.pollingStation.findUnique({
      where: { code },
    }) as Promise<PollingStation | null>;
  }

  async findMany(params: PollingStationQueryParams = {}): Promise<PaginatedResponse<PollingStation>> {
    const { page, limit, skip } = this.getPagination(params);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    
    if (params.county) where.county = params.county;
    if (params.constituency) where.constituency = params.constituency;
    if (params.ward) where.ward = params.ward;
    if (params.isActive !== undefined) where.isActive = params.isActive;

    const [data, total] = await Promise.all([
      prisma.pollingStation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { code: 'asc' },
      }),
      prisma.pollingStation.count({ where }),
    ]);

    return this.buildPaginatedResponse(data as PollingStation[], total, page, limit);
  }

  async findActive(): Promise<PollingStation[]> {
    return prisma.pollingStation.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    }) as Promise<PollingStation[]>;
  }

  async findByCounty(county: string): Promise<PollingStation[]> {
    return prisma.pollingStation.findMany({
      where: { county, isActive: true },
      orderBy: { code: 'asc' },
    }) as Promise<PollingStation[]>;
  }

  async findByConstituency(constituency: string): Promise<PollingStation[]> {
    return prisma.pollingStation.findMany({
      where: { constituency, isActive: true },
      orderBy: { code: 'asc' },
    }) as Promise<PollingStation[]>;
  }

  async create(data: CreatePollingStationInput): Promise<PollingStation> {
    return prisma.pollingStation.create({
      data: {
        code: data.code,
        name: data.name,
        county: data.county,
        constituency: data.constituency,
        ward: data.ward,
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
        registeredVoters: data.registeredVoters || 0,
        deviceCount: data.deviceCount || 0,
        printerCount: data.printerCount || 0,
      },
    }) as Promise<PollingStation>;
  }

  async update(id: string, data: UpdatePollingStationInput): Promise<PollingStation> {
    return prisma.pollingStation.update({
      where: { id },
      data,
    }) as Promise<PollingStation>;
  }

  async delete(id: string): Promise<PollingStation> {
    return prisma.pollingStation.delete({
      where: { id },
    }) as Promise<PollingStation>;
  }

  async count(): Promise<number> {
    return prisma.pollingStation.count();
  }

  async activate(id: string): Promise<PollingStation> {
    return prisma.pollingStation.update({
      where: { id },
      data: { isActive: true },
    }) as Promise<PollingStation>;
  }

  async deactivate(id: string): Promise<PollingStation> {
    return prisma.pollingStation.update({
      where: { id },
      data: { isActive: false },
    }) as Promise<PollingStation>;
  }

  async setOperatingHours(
    id: string,
    openingTime: Date,
    closingTime: Date
  ): Promise<PollingStation> {
    return prisma.pollingStation.update({
      where: { id },
      data: { openingTime, closingTime },
    }) as Promise<PollingStation>;
  }

  async getCounties(): Promise<string[]> {
    const result = await prisma.pollingStation.findMany({
      select: { county: true },
      distinct: ['county'],
      orderBy: { county: 'asc' },
    });
    return result.map((r) => r.county);
  }

  async getConstituenciesByCounty(county: string): Promise<string[]> {
    const result = await prisma.pollingStation.findMany({
      where: { county },
      select: { constituency: true },
      distinct: ['constituency'],
      orderBy: { constituency: 'asc' },
    });
    return result.map((r) => r.constituency);
  }

  async getWardsByConstituency(constituency: string): Promise<string[]> {
    const result = await prisma.pollingStation.findMany({
      where: { constituency },
      select: { ward: true },
      distinct: ['ward'],
      orderBy: { ward: 'asc' },
    });
    return result.map((r) => r.ward);
  }

  async codeExists(code: string): Promise<boolean> {
    const count = await prisma.pollingStation.count({ where: { code } });
    return count > 0;
  }

  async getStats(): Promise<PollingStationStats> {
    const [stationStats, countyStats] = await Promise.all([
      prisma.pollingStation.aggregate({
        _count: true,
        _sum: { registeredVoters: true },
      }),
      prisma.pollingStation.groupBy({
        by: ['county'],
        _count: true,
        _sum: { registeredVoters: true },
        where: { isActive: true },
      }),
    ]);

    const activeCount = await prisma.pollingStation.count({
      where: { isActive: true },
    });

    const votesByStation = await prisma.vote.groupBy({
      by: ['pollingStationId'],
      _count: true,
    });

    const stationVoteMap = new Map<string, number>(
      votesByStation.map((v) => [v.pollingStationId, v._count])
    );

    const stations = await prisma.pollingStation.findMany({
      select: { id: true, county: true },
    });

    const stationCountyMap = new Map<string, string>(
      stations.map((s) => [s.id, s.county])
    );

    const votesByCounty = new Map<string, number>();
    for (const [stationId, voteCount] of stationVoteMap) {
      const county = stationCountyMap.get(stationId);
      if (county) {
        votesByCounty.set(county, (votesByCounty.get(county) || 0) + voteCount);
      }
    }

    const totalVotes = Array.from(votesByCounty.values()).reduce((a, b) => a + b, 0);
    const totalRegistered = stationStats._sum.registeredVoters || 0;

    const byCounty = countyStats.map((cs) => {
      const votes = votesByCounty.get(cs.county) || 0;
      const voters = cs._sum.registeredVoters || 0;
      return {
        county: cs.county,
        stations: cs._count,
        voters,
        votes,
        turnout: voters > 0 ? Math.round((votes / voters) * 10000) / 100 : 0,
      };
    });

    return {
      totalStations: stationStats._count,
      activeStations: activeCount,
      totalRegisteredVoters: totalRegistered,
      totalVotesCast: totalVotes,
      overallTurnout: totalRegistered > 0
        ? Math.round((totalVotes / totalRegistered) * 10000) / 100
        : 0,
      byCounty,
    };
  }

  async getTurnoutByStation(): Promise<{
    stationId: string;
    code: string;
    name: string;
    registered: number;
    voted: number;
    turnout: number;
  }[]> {
    const stations = await prisma.pollingStation.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        registeredVoters: true,
        _count: { select: { votes: true } },
      },
    });

    return stations.map((s) => ({
      stationId: s.id,
      code: s.code,
      name: s.name,
      registered: s.registeredVoters,
      voted: s._count.votes,
      turnout: s.registeredVoters > 0
        ? Math.round((s._count.votes / s.registeredVoters) * 10000) / 100
        : 0,
    }));
  }
}

export const pollingStationRepository = new PollingStationRepository();
