/**
 * VeriVote Kenya — IEBC Staff Management Service
 *
 * Handles creation, lookup, and management of IEBC staff records.
 * Each staff member is a Voter with role=ADMIN who has been assigned
 * an IebcStaff record specifying their role and jurisdiction.
 */

import { prisma } from '../database/client.js';
import { ServiceError } from './voter.service.js';
import type {
  StaffRole, JurisdictionLevel,
  IebcStaffRecord, IebcStaffWithVoter, CreateIebcStaffInput,
} from '../types/database.types.js';
import { logger } from '../lib/logger.js';

// ── Jurisdiction validation ───────────────────────────────────────────────────

/** Roles that require a non-null jurisdictionValue */
const REQUIRES_JURISDICTION_VALUE: StaffRole[] = [
  'COUNTY_RO', 'CONSTITUENCY_RO', 'PRESIDING_OFFICER',
];

function validateJurisdiction(role: StaffRole, _level: JurisdictionLevel, value?: string): void {
  if (REQUIRES_JURISDICTION_VALUE.includes(role) && !value) {
    throw new ServiceError(
      `Role ${role} requires a jurisdictionValue (county/constituency/ward name)`, 400,
    );
  }
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createStaff(
  input: CreateIebcStaffInput,
): Promise<IebcStaffRecord> {
  validateJurisdiction(input.staffRole, input.jurisdictionLevel, input.jurisdictionValue);

  // Ensure the voter exists and is ADMIN
  const voter = await prisma.voter.findUnique({ where: { id: input.voterId } });
  if (!voter) throw new ServiceError('Voter not found', 404);
  if (voter.role !== 'ADMIN') throw new ServiceError('Voter must have ADMIN role to be assigned a staff record', 400);

  // Check not already a staff member
  const existing = await prisma.iebcStaff.findUnique({ where: { voterId: input.voterId } });
  if (existing) throw new ServiceError('This voter already has a staff record', 409);

  const staff = await prisma.iebcStaff.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: {
      voterId:           input.voterId,
      staffRole:         input.staffRole as any,
      jurisdictionLevel: input.jurisdictionLevel as any,
      jurisdictionValue: input.jurisdictionValue ?? null,
      pollingStationId:  input.pollingStationId ?? null,
      createdByStaffId:  input.createdByStaffId ?? null,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
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
  patch: { staffRole?: StaffRole; jurisdictionLevel?: JurisdictionLevel; jurisdictionValue?: string | null; isActive?: boolean },
): Promise<IebcStaffRecord> {
  const existing = await prisma.iebcStaff.findUnique({ where: { id: staffId } });
  if (!existing) throw new ServiceError('Staff record not found', 404);

  const newRole  = patch.staffRole         ?? (existing.staffRole         as unknown as StaffRole);
  const newLevel = patch.jurisdictionLevel ?? (existing.jurisdictionLevel as unknown as JurisdictionLevel);
  const newValue = patch.jurisdictionValue !== undefined ? patch.jurisdictionValue : existing.jurisdictionValue;

  validateJurisdiction(newRole, newLevel, newValue ?? undefined);

  const updated = await prisma.iebcStaff.update({
    where: { id: staffId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: patch as any,
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
    await prisma.voter.update({ where: { nationalId }, data: { role: 'ADMIN' as any } });
  }
  return voter.id;
}
