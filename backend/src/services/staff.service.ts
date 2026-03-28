/**
 * VeriVote Kenya — IEBC Staff Management Service
 *
 * Handles creation, lookup, management, and dashboard data for IEBC staff.
 * Each staff member is a Voter with role=ADMIN who has been assigned
 * an IebcStaff record specifying their role and jurisdiction.
 */

import { prisma } from '../database/client.js';
import { ServiceError } from './voter.service.js';
import type {
  StaffRole, JurisdictionLevel,
  IebcStaffRecord, IebcStaffWithVoter, CreateIebcStaffInput,
} from '../types/database.types.js';
import {
  NATIONAL_TIER, REGIONAL_TIER, COUNTY_TIER, CONSTITUENCY_TIER, STATION_TIER,
} from '../types/auth.types.js';
import { logger } from '../lib/logger.js';
import type { PollingStation } from '@prisma/client';
import type { Prisma } from '@prisma/client';

// ── Jurisdiction validation ───────────────────────────────────────────────────

/** Roles that require a non-null jurisdictionValue */
const REQUIRES_JURISDICTION_VALUE: StaffRole[] = [
  'REGIONAL_COORDINATOR',
  'COUNTY_RO',
  'CONSTITUENCY_RO',
  'PRESIDING_OFFICER',
  'DEPUTY_PRESIDING_OFFICER',
  'POLLING_CLERK',
  'SECURITY_OFFICER',
];

/** Roles that require a department value */
const REQUIRES_DEPARTMENT: StaffRole[] = ['DIRECTOR', 'MANAGER'];

function validateJurisdiction(role: StaffRole, _level: JurisdictionLevel, value?: string | null, department?: string | null): void {
  if (REQUIRES_JURISDICTION_VALUE.includes(role) && !value) {
    throw new ServiceError(
      `Role ${role} requires a jurisdictionValue (region/county/constituency/ward name)`, 400,
    );
  }
  if (REQUIRES_DEPARTMENT.includes(role) && !department) {
    throw new ServiceError(
      `Role ${role} requires a department (e.g. ICT, Finance, HR, Legal, Voter Registration)`, 400,
    );
  }
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createStaff(
  input: CreateIebcStaffInput,
): Promise<IebcStaffRecord> {
  validateJurisdiction(input.staffRole, input.jurisdictionLevel, input.jurisdictionValue, input.department);

  const voter = await prisma.voter.findUnique({ where: { id: input.voterId } });
  if (!voter) throw new ServiceError('Voter not found', 404);
  if (voter.role !== 'ADMIN') throw new ServiceError('Voter must have ADMIN role to be assigned a staff record', 400);

  const existing = await prisma.iebcStaff.findUnique({ where: { voterId: input.voterId } });
  if (existing) throw new ServiceError('This voter already has a staff record', 409);

  const staff = await prisma.iebcStaff.create({
    data: {
      voterId:           input.voterId,
      staffRole:         input.staffRole         as Prisma.IebcStaffCreateInput['staffRole'],
      jurisdictionLevel: input.jurisdictionLevel as Prisma.IebcStaffCreateInput['jurisdictionLevel'],
      jurisdictionValue: input.jurisdictionValue ?? null,
      pollingStationId:  input.pollingStationId ?? null,
      createdByStaffId:  input.createdByStaffId ?? null,
      department:        input.department ?? null,
    },
  });

  logger.info('IEBC staff record created', { staffId: staff.id, role: input.staffRole });
  return staff as unknown as IebcStaffRecord;
}

export async function getStaffById(staffId: string): Promise<IebcStaffWithVoter | null> {
  const record = await prisma.iebcStaff.findUnique({
    where:   { id: staffId },
    include: { voter: { select: { id: true, nationalId: true, email: true, phoneNumber: true } } },
  });
  return record as unknown as IebcStaffWithVoter | null;
}

export async function getStaffByVoterId(voterId: string): Promise<IebcStaffRecord | null> {
  const record = await prisma.iebcStaff.findUnique({ where: { voterId } });
  return record as unknown as IebcStaffRecord | null;
}

export async function listStaff(filter?: {
  staffRole?: StaffRole;
  jurisdictionLevel?: JurisdictionLevel;
  jurisdictionValue?: string;
  isActive?: boolean;
}): Promise<IebcStaffWithVoter[]> {
  const where: Prisma.IebcStaffWhereInput = {};
  if (filter?.staffRole)         where.staffRole         = filter.staffRole;
  if (filter?.jurisdictionLevel) where.jurisdictionLevel = filter.jurisdictionLevel;
  if (filter?.jurisdictionValue) where.jurisdictionValue = { contains: filter.jurisdictionValue, mode: 'insensitive' };
  if (filter?.isActive !== undefined) where.isActive     = filter.isActive;

  const records = await prisma.iebcStaff.findMany({
    where,
    include: { voter: { select: { id: true, nationalId: true, email: true, phoneNumber: true } } },
    orderBy: [{ staffRole: 'asc' }, { jurisdictionValue: 'asc' }],
  });
  return records as unknown as IebcStaffWithVoter[];
}

export async function updateStaff(
  staffId: string,
  patch: {
    staffRole?: StaffRole;
    jurisdictionLevel?: JurisdictionLevel;
    jurisdictionValue?: string | null;
    department?: string | null;
    isActive?: boolean;
  },
): Promise<IebcStaffRecord> {
  const existing = await prisma.iebcStaff.findUnique({ where: { id: staffId } });
  if (!existing) throw new ServiceError('Staff record not found', 404);

  const newRole  = patch.staffRole         ?? (existing.staffRole         as unknown as StaffRole);
  const newLevel = patch.jurisdictionLevel ?? (existing.jurisdictionLevel as unknown as JurisdictionLevel);
  const newValue = patch.jurisdictionValue !== undefined ? patch.jurisdictionValue : existing.jurisdictionValue;
  const newDept  = patch.department !== undefined ? patch.department : existing.department;

  validateJurisdiction(newRole, newLevel, newValue, newDept);

  const updated = await prisma.iebcStaff.update({
    where: { id: staffId },
    data:  patch as Prisma.IebcStaffUpdateInput,
  });
  logger.info('IEBC staff record updated', { staffId });
  return updated as unknown as IebcStaffRecord;
}

export async function deactivateStaff(staffId: string): Promise<void> {
  const existing = await prisma.iebcStaff.findUnique({ where: { id: staffId } });
  if (!existing) throw new ServiceError('Staff record not found', 404);
  await prisma.iebcStaff.update({ where: { id: staffId }, data: { isActive: false } });
  logger.info('IEBC staff record deactivated', { staffId });
}

/** Promote or create admin voter by nationalId — convenience for seeding */
export async function ensureAdminVoterRole(nationalId: string): Promise<string | null> {
  const voter = await prisma.voter.findUnique({ where: { nationalId } });
  if (!voter) return null;
  if (voter.role !== 'ADMIN') {
      await prisma.voter.update({ where: { nationalId }, data: { role: 'ADMIN' } });
  }
  return voter.id;
}

// ── Dashboard data ────────────────────────────────────────────────────────────

export interface StaffDashboard {
  tier: 'national' | 'regional' | 'county' | 'constituency' | 'station' | 'observer';
  role: StaffRole;
  jurisdictionValue: string | null;
  department?: string | null;
  stats: Record<string, number | string | boolean>;
  breakdown?: Array<Record<string, string | number>>;
  myStation?: Record<string, string | number | boolean | null>;
}

export async function getStaffDashboard(
  staffRole: StaffRole,
  jurisdictionValue: string | null,
  pollingStationId: string | null,
  department: string | null,
): Promise<StaffDashboard> {

  if (NATIONAL_TIER.includes(staffRole)) {
    return buildNationalDashboard(staffRole, department);
  }
  if (REGIONAL_TIER.includes(staffRole)) {
    return buildRegionalDashboard(jurisdictionValue);
  }
  if (COUNTY_TIER.includes(staffRole)) {
    return buildCountyDashboard(jurisdictionValue);
  }
  if (CONSTITUENCY_TIER.includes(staffRole)) {
    return buildConstituencyDashboard(jurisdictionValue);
  }
  if (STATION_TIER.includes(staffRole)) {
    return buildStationDashboard(staffRole, pollingStationId, jurisdictionValue);
  }
  // OBSERVER
  return buildObserverDashboard();
}

async function buildNationalDashboard(role: StaffRole, department: string | null): Promise<StaffDashboard> {
  const [totalRegistered, votesCast, totalStations, activeStaff, pendingReviews, distressFlags] = await Promise.all([
    prisma.voter.count({ where: { status: { in: ['REGISTERED', 'VOTED', 'REVOTED', 'DISTRESS_FLAGGED'] } } }),
    prisma.vote.count({ where: { status: { notIn: ['SUPERSEDED', 'INVALIDATED'] } } }),
    prisma.pollingStation.count({ where: { isActive: true } }),
    prisma.iebcStaff.count({ where: { isActive: true } }),
    prisma.voter.count({ where: { status: 'PENDING_MANUAL_REVIEW' } }),
    prisma.vote.count({ where: { isDistressFlagged: true } }),
  ]);

  const turnoutPct = totalRegistered > 0 ? Math.round((votesCast / totalRegistered) * 1000) / 10 : 0;

  // County breakdown: registered voters + vote counts per county
  const countyRegistered = await prisma.pollingStation.groupBy({
    by: ['county'],
    _sum: { registeredVoters: true },
    orderBy: { county: 'asc' },
  });

  const votesPerCounty = await prisma.$queryRaw<Array<{ county: string; votes: bigint }>>`
    SELECT ps.county, COUNT(v.id) AS votes
    FROM votes v
    JOIN polling_stations ps ON v.polling_station_id = ps.id
    WHERE v.status NOT IN ('SUPERSEDED','INVALIDATED')
    GROUP BY ps.county
    ORDER BY ps.county
  `;
  const voteCountMap = new Map(votesPerCounty.map(r => [r.county, Number(r.votes)]));

  const breakdown = countyRegistered.map(r => {
    const reg   = r._sum.registeredVoters ?? 0;
    const votes = voteCountMap.get(r.county) ?? 0;
    return {
      name:     r.county,
      voters:   reg,
      votes,
      turnout:  reg > 0 ? Math.round((votes / reg) * 1000) / 10 : 0,
    };
  });

  return {
    tier:              'national',
    role,
    jurisdictionValue: null,
    department,
    stats: {
      totalRegistered,
      votesCast,
      turnoutPct,
      totalStations,
      activeStaff,
      pendingReviews,
      distressFlags,
    },
    breakdown,
  };
}

async function buildRegionalDashboard(region: string | null): Promise<StaffDashboard> {
  // Regional coordinators oversee multiple counties — we store region name as jurisdictionValue
  // For now, return all counties with a simple prefix match or exact match
  // (In a real system you'd have a regions table; here we just show all counties)
  const countyRegistered = await prisma.pollingStation.groupBy({
    by: ['county'],
    _sum: { registeredVoters: true },
    orderBy: { county: 'asc' },
  });

  const votesPerCounty = await prisma.$queryRaw<Array<{ county: string; votes: bigint }>>`
    SELECT ps.county, COUNT(v.id) AS votes
    FROM votes v
    JOIN polling_stations ps ON v.polling_station_id = ps.id
    WHERE v.status NOT IN ('SUPERSEDED','INVALIDATED')
    GROUP BY ps.county
  `;
  const voteMap = new Map(votesPerCounty.map(r => [r.county, Number(r.votes)]));

  const breakdown = countyRegistered.map(r => {
    const reg   = r._sum.registeredVoters ?? 0;
    const votes = voteMap.get(r.county) ?? 0;
    return { name: r.county, voters: reg, votes, turnout: reg > 0 ? Math.round((votes / reg) * 1000) / 10 : 0 };
  });

  const totalRegistered = breakdown.reduce((s, r) => s + Number(r.voters), 0);
  const totalVotes      = breakdown.reduce((s, r) => s + Number(r.votes), 0);

  return {
    tier:              'regional',
    role:              'REGIONAL_COORDINATOR',
    jurisdictionValue: region,
    stats: {
      totalRegistered,
      votesCast:  totalVotes,
      turnoutPct: totalRegistered > 0 ? Math.round((totalVotes / totalRegistered) * 1000) / 10 : 0,
      counties:   breakdown.length,
    },
    breakdown,
  };
}

async function buildCountyDashboard(county: string | null): Promise<StaffDashboard> {
  if (!county) throw new ServiceError('County jurisdiction not set', 400);

  const [stationAgg, stationCount] = await Promise.all([
    prisma.pollingStation.aggregate({
      where: { county },
      _sum:  { registeredVoters: true },
      _count: true,
    }),
    prisma.pollingStation.count({ where: { county, isActive: true } }),
  ]);

  const votesCast = await prisma.$queryRaw<[{ votes: bigint }]>`
    SELECT COUNT(v.id) AS votes
    FROM votes v
    JOIN polling_stations ps ON v.polling_station_id = ps.id
    WHERE ps.county = ${county} AND v.status NOT IN ('SUPERSEDED','INVALIDATED')
  `;

  const constituencyAgg = await prisma.pollingStation.groupBy({
    by:      ['constituency'],
    where:   { county },
    _sum:    { registeredVoters: true },
    _count:  true,
    orderBy: { constituency: 'asc' },
  });

  const votesPerConstituency = await prisma.$queryRaw<Array<{ constituency: string; votes: bigint }>>`
    SELECT ps.constituency, COUNT(v.id) AS votes
    FROM votes v
    JOIN polling_stations ps ON v.polling_station_id = ps.id
    WHERE ps.county = ${county} AND v.status NOT IN ('SUPERSEDED','INVALIDATED')
    GROUP BY ps.constituency
    ORDER BY ps.constituency
  `;
  const voteMap = new Map(votesPerConstituency.map(r => [r.constituency, Number(r.votes)]));

  const breakdown = constituencyAgg.map(r => {
    const reg   = r._sum.registeredVoters ?? 0;
    const votes = voteMap.get(r.constituency) ?? 0;
    return { name: r.constituency, voters: reg, stations: r._count, votes, turnout: reg > 0 ? Math.round((votes / reg) * 1000) / 10 : 0 };
  });

  const reg   = stationAgg._sum.registeredVoters ?? 0;
  const votes = Number(votesCast[0]?.votes ?? 0);

  return {
    tier:              'county',
    role:              'COUNTY_RO',
    jurisdictionValue: county,
    stats: {
      totalRegistered: reg,
      votesCast:       votes,
      turnoutPct:      reg > 0 ? Math.round((votes / reg) * 1000) / 10 : 0,
      totalStations:   stationAgg._count,
      activeStations:  stationCount,
      constituencies:  breakdown.length,
    },
    breakdown,
  };
}

async function buildConstituencyDashboard(constituency: string | null): Promise<StaffDashboard> {
  if (!constituency) throw new ServiceError('Constituency jurisdiction not set', 400);

  const stations = await prisma.pollingStation.findMany({
    where:   { constituency },
    select:  { id: true, name: true, code: true, ward: true, registeredVoters: true, isActive: true },
    orderBy: { name: 'asc' },
  });

  const votesByStation = await prisma.$queryRaw<Array<{ station_id: string; votes: bigint }>>`
    SELECT v.polling_station_id AS station_id, COUNT(v.id) AS votes
    FROM votes v
    JOIN polling_stations ps ON v.polling_station_id = ps.id
    WHERE ps.constituency = ${constituency} AND v.status NOT IN ('SUPERSEDED','INVALIDATED')
    GROUP BY v.polling_station_id
  `;
  const voteMap = new Map(votesByStation.map(r => [r.station_id, Number(r.votes)]));

  const breakdown = stations.map(s => {
    const votes = voteMap.get(s.id) ?? 0;
    return {
      id:       s.id,
      name:     s.name,
      code:     s.code,
      ward:     s.ward,
      voters:   s.registeredVoters,
      votes,
      turnout:  s.registeredVoters > 0 ? Math.round((votes / s.registeredVoters) * 1000) / 10 : 0,
      active:   s.isActive ? 1 : 0,
    };
  });

  const totalReg   = stations.reduce((s, st) => s + st.registeredVoters, 0);
  const totalVotes = breakdown.reduce((s, b) => s + Number(b.votes), 0);

  return {
    tier:              'constituency',
    role:              'CONSTITUENCY_RO',
    jurisdictionValue: constituency,
    stats: {
      totalRegistered: totalReg,
      votesCast:       totalVotes,
      turnoutPct:      totalReg > 0 ? Math.round((totalVotes / totalReg) * 1000) / 10 : 0,
      totalStations:   stations.length,
      activeStations:  stations.filter(s => s.isActive).length,
    },
    breakdown,
  };
}

async function buildStationDashboard(role: StaffRole, pollingStationId: string | null, jurisdictionValue: string | null): Promise<StaffDashboard> {
  let station: PollingStation | null = null;

  if (pollingStationId) {
    station = await prisma.pollingStation.findUnique({ where: { id: pollingStationId } });
  } else if (jurisdictionValue) {
    // Fallback: match by ward name
    station = await prisma.pollingStation.findFirst({
      where: { ward: { contains: jurisdictionValue, mode: 'insensitive' } },
    });
  }

  if (!station) {
    return {
      tier:              'station',
      role,
      jurisdictionValue,
      stats:             { error: 1 },
      myStation:         undefined,
    };
  }

  const votesCast = await prisma.$queryRaw<[{ votes: bigint }]>`
    SELECT COUNT(id) AS votes FROM votes
    WHERE polling_station_id = ${station.id}::uuid
    AND status NOT IN ('SUPERSEDED','INVALIDATED')
  `;

  const votes   = Number(votesCast[0]?.votes ?? 0);
  const reg     = station.registeredVoters;
  const turnout = reg > 0 ? Math.round((votes / reg) * 1000) / 10 : 0;

  return {
    tier:              'station',
    role,
    jurisdictionValue: station.ward,
    stats: {
      registeredVoters: reg,
      votesCast:        votes,
      turnoutPct:       turnout,
      remainingVoters:  Math.max(0, reg - votes),
    },
    myStation: {
      id:           station.id,
      code:         station.code,
      name:         station.name,
      county:       station.county,
      constituency: station.constituency,
      ward:         station.ward,
      isActive:     station.isActive,
    },
  };
}

async function buildObserverDashboard(): Promise<StaffDashboard> {
  const [totalRegistered, votesCast] = await Promise.all([
    prisma.voter.count({ where: { status: { in: ['REGISTERED', 'VOTED', 'REVOTED'] } } }),
    prisma.vote.count({ where: { status: { notIn: ['SUPERSEDED', 'INVALIDATED'] } } }),
  ]);
  return {
    tier:              'observer',
    role:              'OBSERVER',
    jurisdictionValue: null,
    stats: {
      totalRegistered,
      votesCast,
      turnoutPct: totalRegistered > 0 ? Math.round((votesCast / totalRegistered) * 1000) / 10 : 0,
    },
  };
}
