/**
 * ============================================================================
 * VeriVote Kenya - Database Seed Script
 * ============================================================================
 * 
 * This script populates the database with realistic test data:
 * - 10 polling stations across Kenya
 * - 100 test voters with SBT addresses
 * - 30 sample votes
 * - 20 print queue items
 * 
 * Run with: npx prisma db seed
 * Or:       pnpm db:seed
 * 
 * ============================================================================
 */

import { PrismaClient, VoterStatus, VoteStatus, PrintStatus, UserRole, ElectionType, ElectionStatus, PositionScope, StaffRole, JurisdictionLevel } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import argon2 from 'argon2';
import * as dotenv from 'dotenv';
import { encryptionService } from '../src/services/encryption.service.js';
import { encryptHomomorphicBallot } from '../src/services/homomorphic.service.js';
import { ALL_STATIONS } from './iebc-data.js';

dotenv.config();
encryptionService.init();

// Create Prisma client for database operations
const prisma = new PrismaClient();

// ============================================================================
// KENYAN DATA
// ============================================================================
// Real polling station locations across Kenya's major counties

// IEBC data is imported from iebc-data.ts (290 domestic + 15 diaspora stations)
// ALL_STATIONS is used directly in seedPollingStations below

// Common Kenyan names for generating realistic test voters
const FIRST_NAMES = [
  // Male names
  'James', 'John', 'Peter', 'David', 'Joseph', 'Michael', 'Daniel', 'Samuel',
  'Kevin', 'Brian', 'Dennis', 'Stephen', 'Patrick', 'Charles', 'Francis',
  // Female names
  'Mary', 'Jane', 'Elizabeth', 'Sarah', 'Grace', 'Faith', 'Joyce', 'Agnes',
  'Anne', 'Catherine', 'Margaret', 'Ruth', 'Esther', 'Mercy', 'Caroline',
  // Traditional Kenyan names
  'Wanjiku', 'Akinyi', 'Njeri', 'Wambui', 'Chebet', 'Otieno', 'Kipchoge',
];

const LAST_NAMES = [
  // Kikuyu names
  'Kamau', 'Mwangi', 'Njoroge', 'Kimani', 'Karanja', 'Maina', 'Gitonga',
  // Luo names  
  'Ochieng', 'Onyango', 'Odhiambo', 'Owino', 'Otieno', 'Okoth', 'Ouma',
  // Kalenjin names
  'Kipchoge', 'Kosgei', 'Cheruiyot', 'Kiptoo', 'Rotich', 'Bett', 'Kibet',
  // Luhya names
  'Wekesa', 'Wafula', 'Simiyu', 'Masinde', 'Barasa',
  // Other
  'Mutua', 'Ndirangu', 'Macharia', 'Muturi', 'Sang',
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generates a realistic Kenyan national ID
 * Format: 8 digits (e.g., "12345678")
 */
function generateNationalId(): string {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

/**
 * Generates a random Ethereum-style wallet address
 * Format: 0x followed by 40 hexadecimal characters
 */
function generateEthereumAddress(): string {
  return '0x' + randomBytes(20).toString('hex');
}

/**
 * Generates a unique serial number for vote receipts
 * Format: VV-{timestamp in base36}-{random hex}
 * Example: VV-LKJ5M2-A3B2C1D4
 */
function generateSerialNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = randomBytes(4).toString('hex').toUpperCase();
  return `VV-${timestamp}-${random}`;
}

/**
 * Generates a SHA-256 hash (simulating encrypted vote hash)
 */
function generateVoteHash(): string {
  return createHash('sha256').update(randomBytes(32)).digest('hex');
}

/**
 * Generates a simulated Zero-Knowledge Proof
 * In production, this would be a real ZKP from circom/snarkjs
 */
function generateZkpProof(): string {
  return JSON.stringify({
    pi_a: [randomBytes(32).toString('hex'), randomBytes(32).toString('hex')],
    pi_b: [
      [randomBytes(32).toString('hex'), randomBytes(32).toString('hex')],
      [randomBytes(32).toString('hex'), randomBytes(32).toString('hex')],
    ],
    pi_c: [randomBytes(32).toString('hex'), randomBytes(32).toString('hex')],
    protocol: 'groth16',
    curve: 'bn128',
  });
}

/**
 * Generates a blockchain transaction hash
 * Format: 0x followed by 64 hexadecimal characters
 */
function generateBlockchainTxHash(): string {
  return '0x' + randomBytes(32).toString('hex');
}

/**
 * Picks a random element from an array
 */
function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generates a random integer between min and max (inclusive)
 */
function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generates a simulated Argon2 hash (for PIN storage)
 * In production, use the actual argon2 library
 */
function generateArgon2Hash(): string {
  const salt = randomBytes(16).toString('base64');
  const hash = randomBytes(32).toString('base64');
  return `$argon2id$v=19$m=65536,t=3,p=4$${salt}$${hash}`;
}

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

/**
 * Creates 305 polling stations across Kenya (290 domestic + 15 diaspora)
 */
async function seedPollingStations(): Promise<string[]> {
  console.log('🏫 Creating polling stations...');

  const stationIds: string[] = [];

  for (const station of ALL_STATIONS) {
    const created = await prisma.pollingStation.create({
      data: {
        code: station.code,
        name: station.name,
        county: station.county,
        constituency: station.constituency,
        ward: station.ward,
        latitude: station.latitude,
        longitude: station.longitude,
        address: station.address,
        isDiaspora: station.isDiaspora,
        country: station.country,
        registeredVoters: station.registeredVoters,
        isActive: true,
        deviceCount: getRandomInt(2, 5),
        printerCount: getRandomInt(1, 2),
      },
    });

    stationIds.push(created.id);
  }

  console.log(`✅ Created ${stationIds.length} polling stations\n`);
  return stationIds;
}

/**
 * Creates 100 test voters distributed across polling stations
 */
async function seedVoters(stationIds: string[]): Promise<string[]> {
  console.log('👥 Creating voters...');
  
  const voterIds: string[] = [];
  const usedNationalIds = new Set<string>();
  
  for (let i = 0; i < 100; i++) {
    // Generate unique national ID
    let nationalId: string;
    do {
      nationalId = generateNationalId();
    } while (usedNationalIds.has(nationalId));
    usedNationalIds.add(nationalId);
    
    // Assign to a random polling station
    const stationId = getRandomElement(stationIds);
    
    // Determine voter status distribution:
    // - 80% registered (haven't voted)
    // - 15% voted
    // - 5% revoted
    const statusRoll = Math.random();
    let status: VoterStatus;
    let voteCount = 0;
    let lastVotedAt: Date | null = null;
    
    if (statusRoll < 0.80) {
      status = VoterStatus.REGISTERED;
    } else if (statusRoll < 0.95) {
      status = VoterStatus.VOTED;
      voteCount = 1;
      lastVotedAt = new Date(Date.now() - getRandomInt(1, 72) * 60 * 60 * 1000);
    } else {
      status = VoterStatus.REVOTED;
      voteCount = 2;
      lastVotedAt = new Date(Date.now() - getRandomInt(1, 24) * 60 * 60 * 1000);
    }
    
    const voter = await prisma.voter.create({
      data: {
        nationalId,
        sbtAddress: generateEthereumAddress(),
        sbtTokenId: `${i + 1}`,
        sbtMintedAt: new Date(Date.now() - getRandomInt(7, 30) * 24 * 60 * 60 * 1000),
        normalPinHash: generateArgon2Hash(),
        distressPinHash: generateArgon2Hash(),
        status,
        voteCount,
        lastVotedAt,
        pollingStationId: stationId,
      },
    });
    
    voterIds.push(voter.id);
    
    // Progress indicator every 20 voters
    if ((i + 1) % 20 === 0) {
      console.log(`   ✓ Created ${i + 1} voters...`);
    }
  }
  
  console.log(`✅ Created ${voterIds.length} voters\n`);
  return voterIds;
}

/**
 * Creates 30 sample votes with various statuses
 */
async function seedVotes(stationIds: string[]): Promise<string[]> {
  console.log('🗳️  Creating votes...');
  
  const voteIds: string[] = [];
  
  for (let i = 0; i < 30; i++) {
    const stationId = getRandomElement(stationIds);
    
    // Vote status distribution:
    // - 70% confirmed on blockchain
    // - 20% pending
    // - 10% superseded (revotes)
    const statusRoll = Math.random();
    let status: VoteStatus;
    let blockchainTxHash: string | null = null;
    let blockNumber: bigint | null = null;
    let confirmedAt: Date | null = null;
    
    if (statusRoll < 0.70) {
      status = VoteStatus.CONFIRMED;
      blockchainTxHash = generateBlockchainTxHash();
      blockNumber = BigInt(getRandomInt(50000000, 51000000));
      confirmedAt = new Date(Date.now() - getRandomInt(1, 48) * 60 * 60 * 1000);
    } else if (statusRoll < 0.90) {
      status = VoteStatus.PENDING;
    } else {
      status = VoteStatus.SUPERSEDED;
    }
    
    // Candidate pools
    const presidentCandidates = ['pres-1', 'pres-2', 'pres-3', 'pres-4'];
    const governorCandidates = ['gov-1', 'gov-2', 'gov-3'];
    const selections = {
      president: getRandomElement(presidentCandidates),
      governor: getRandomElement(governorCandidates),
    };
    const encryptedVoteData = encryptionService.encryptVote(selections);
    const homomorphicBallot = JSON.stringify(
      encryptHomomorphicBallot(selections, encryptionService.getPublicKey())
    );

    const vote = await prisma.vote.create({
      data: {
        encryptedVoteData: encryptedVoteData,
        homomorphicBallot: homomorphicBallot,
        encryptedVoteHash: encryptionService.hashEncryptedData(encryptedVoteData),
        serialNumber: generateSerialNumber(),
        zkpProof: generateZkpProof(),
        blockchainTxHash,
        blockNumber,
        confirmedAt,
        status,
        pollingStationId: stationId,
        timestamp: new Date(Date.now() - getRandomInt(1, 72) * 60 * 60 * 1000),
      },
    });
    
    voteIds.push(vote.id);
  }
  
  console.log(`✅ Created ${voteIds.length} votes\n`);
  return voteIds;
}

/**
 * Creates 20 print queue items for the printing system
 */
async function seedPrintQueue(voteIds: string[], stationIds: string[]): Promise<void> {
  console.log('🖨️  Creating print queue items...');
  
  // Take first 20 votes for print queue
  const votesToPrint = voteIds.slice(0, 20);
  
  for (let i = 0; i < votesToPrint.length; i++) {
    const voteId = votesToPrint[i];
    const stationId = getRandomElement(stationIds);
    
    // Print status distribution:
    // - 30% pending
    // - 20% printing
    // - 40% printed
    // - 10% failed
    const statusRoll = Math.random();
    let status: PrintStatus;
    let printerId: string | null = null;
    let printedAt: Date | null = null;
    let printAttempts = 0;
    let ballotNumber: string | null = null;
    
    if (statusRoll < 0.30) {
      status = PrintStatus.PENDING;
    } else if (statusRoll < 0.50) {
      status = PrintStatus.PRINTING;
      printerId = `PRINTER-${getRandomInt(1, 5)}`;
      printAttempts = 1;
    } else if (statusRoll < 0.90) {
      status = PrintStatus.PRINTED;
      printerId = `PRINTER-${getRandomInt(1, 5)}`;
      printedAt = new Date(Date.now() - getRandomInt(1, 24) * 60 * 60 * 1000);
      printAttempts = 1;
      ballotNumber = `BLT-${Date.now().toString(36)}-${i.toString().padStart(4, '0')}`.toUpperCase();
    } else {
      status = PrintStatus.FAILED;
      printerId = `PRINTER-${getRandomInt(1, 5)}`;
      printAttempts = getRandomInt(1, 3);
    }
    
    await prisma.printQueue.create({
      data: {
        voteId,
        pollingStationId: stationId,
        status,
        priority: getRandomInt(0, 10),
        printerId,
        printedAt,
        printAttempts,
        lastError: status === PrintStatus.FAILED ? 'Paper jam detected' : null,
        ballotNumber,
        qrCodeData: ballotNumber
          ? JSON.stringify({
              serial: ballotNumber,
              hash: generateVoteHash().substring(0, 16),
              timestamp: Date.now(),
            })
          : null,
      },
    });
  }
  
  console.log(`✅ Created ${votesToPrint.length} print queue items\n`);
}

/**
 * Creates an IEBC admin user with known credentials for dev testing
 * National ID: 00000001, PIN: 1234, Distress PIN: 5678
 */
async function seedAdminUser(stationIds: string[]): Promise<void> {
  console.log('🔑 Creating admin user...');

  const adminPin = '1234';
  const adminDistressPin = '5678';
  const adminPassword = 'Admin@1234';

  const [normalPinHash, distressPinHash, passwordHash] = await Promise.all([
    argon2.hash(adminPin, { type: argon2.argon2id }),
    argon2.hash(adminDistressPin, { type: argon2.argon2id }),
    argon2.hash(adminPassword, { type: argon2.argon2id }),
  ]);

  await prisma.voter.upsert({
    where: { nationalId: '00000001' },
    create: {
      nationalId: '00000001',
      role: UserRole.ADMIN,
      email: 'admin@iebc.go.ke',
      emailVerifiedAt: new Date(),
      sbtAddress: generateEthereumAddress(),
      sbtTokenId: 'ADMIN-1',
      sbtMintedAt: new Date(),
      normalPinHash,
      distressPinHash,
      passwordHash,
      status: VoterStatus.REGISTERED,
      pollingStationId: stationIds[0],
    },
    update: {
      passwordHash,
      normalPinHash,
      distressPinHash,
      email: 'admin@iebc.go.ke',
      emailVerifiedAt: new Date(),
      status: VoterStatus.REGISTERED,
    },
  });

  console.log('   ✓ Admin user seeded (National ID: 00000001, Password: Admin@1234, PIN: 1234)');
  console.log('   ✓ OTP contact: admin@iebc.go.ke');

  // Promote the seeded admin to COMMISSIONER role (creates IebcStaff record)
  const adminVoter = await prisma.voter.findUnique({ where: { nationalId: '00000001' } });
  if (adminVoter) {
    await prisma.iebcStaff.upsert({
      where:  { voterId: adminVoter.id },
      create: {
        voterId:           adminVoter.id,
        staffRole:         StaffRole.COMMISSIONER,
        jurisdictionLevel: JurisdictionLevel.NATIONAL,
        jurisdictionValue: null,
        isActive:          true,
      },
      update: {
        staffRole:         StaffRole.COMMISSIONER,
        jurisdictionLevel: JurisdictionLevel.NATIONAL,
        isActive:          true,
      },
    });
    console.log('   ✓ Admin promoted to COMMISSIONER (IebcStaff record created)');
  }

  console.log('✅ Admin user seeded\n');
}

// ============================================================================
// ELECTION SEED DATA
// ============================================================================

async function seedElections(): Promise<void> {
  console.log('🗳️  Creating elections...');

  // ── Kenya 2027 General Election ──────────────────────────────────────────
  const kenya2027 = await prisma.election.create({
    data: {
      name: 'Kenya 2027 General Election',
      description: 'The 2027 Kenyan General Election for all elective positions under the Constitution of Kenya 2010.',
      type: ElectionType.GOVERNMENT,
      status: ElectionStatus.ACTIVE,
      startDate: new Date('2027-08-10T06:00:00Z'),
      endDate: new Date('2027-08-10T17:00:00Z'),
    },
  });
  console.log('   ✓ Kenya 2027 General Election');

  // President (NATIONAL)
  const presPosition = await prisma.position.create({
    data: {
      electionId: kenya2027.id,
      title: 'President of the Republic of Kenya',
      description: 'Head of State and Government. Elected by a majority of votes cast in a national election.',
      scope: PositionScope.NATIONAL,
      orderIndex: 0,
    },
  });
  await prisma.candidate.createMany({
    data: [
      { positionId: presPosition.id, name: 'Amina Wanjiku Kariuki', party: 'Jubilee Party', ballotNumber: 1 },
      { positionId: presPosition.id, name: 'Raila Achieng Odinga', party: 'Orange Democratic Movement', ballotNumber: 2 },
      { positionId: presPosition.id, name: 'William Samoei Ruto', party: 'United Democratic Alliance', ballotNumber: 3 },
      { positionId: presPosition.id, name: 'Martha Wangari Karua', party: 'Narc Kenya', ballotNumber: 4 },
    ],
  });

  // Nairobi County — Governor & Senator
  const naiGovPos = await prisma.position.create({
    data: {
      electionId: kenya2027.id,
      title: 'Governor — Nairobi City County',
      scope: PositionScope.COUNTY,
      scopeValue: 'Nairobi',
      orderIndex: 1,
    },
  });
  await prisma.candidate.createMany({
    data: [
      { positionId: naiGovPos.id, name: 'Johnson Sakaja Mwangi', party: 'United Democratic Alliance', ballotNumber: 1 },
      { positionId: naiGovPos.id, name: 'Polycarp Igathe Gachagua', party: 'Jubilee Party', ballotNumber: 2 },
      { positionId: naiGovPos.id, name: 'Agnes Kagure Waweru', party: 'Independent', ballotNumber: 3 },
    ],
  });

  const naiSenPos = await prisma.position.create({
    data: {
      electionId: kenya2027.id,
      title: 'Senator — Nairobi City County',
      scope: PositionScope.COUNTY,
      scopeValue: 'Nairobi',
      orderIndex: 2,
    },
  });
  await prisma.candidate.createMany({
    data: [
      { positionId: naiSenPos.id, name: 'Edwin Sifuna Ayieko', party: 'Orange Democratic Movement', ballotNumber: 1 },
      { positionId: naiSenPos.id, name: 'Esther Ngugi Passaris', party: 'Jubilee Party', ballotNumber: 2 },
      { positionId: naiSenPos.id, name: 'Millicent Omanga Awuor', party: 'United Democratic Alliance', ballotNumber: 3 },
    ],
  });

  // Mombasa County — Governor & Senator
  const msaGovPos = await prisma.position.create({
    data: {
      electionId: kenya2027.id,
      title: 'Governor — Mombasa County',
      scope: PositionScope.COUNTY,
      scopeValue: 'Mombasa',
      orderIndex: 3,
    },
  });
  await prisma.candidate.createMany({
    data: [
      { positionId: msaGovPos.id, name: 'Abdulswamad Nassir Sharrif', party: 'Orange Democratic Movement', ballotNumber: 1 },
      { positionId: msaGovPos.id, name: 'Hassan Omar Hassan', party: 'Wiper Democratic Movement', ballotNumber: 2 },
      { positionId: msaGovPos.id, name: 'Suleiman Shahbal Mbwana', party: 'Independent', ballotNumber: 3 },
    ],
  });

  const msaSenPos = await prisma.position.create({
    data: {
      electionId: kenya2027.id,
      title: 'Senator — Mombasa County',
      scope: PositionScope.COUNTY,
      scopeValue: 'Mombasa',
      orderIndex: 4,
    },
  });
  await prisma.candidate.createMany({
    data: [
      { positionId: msaSenPos.id, name: 'Mohamed Faki Mwinyihaji', party: 'Orange Democratic Movement', ballotNumber: 1 },
      { positionId: msaSenPos.id, name: 'Fatuma Achani Ali', party: 'United Democratic Alliance', ballotNumber: 2 },
    ],
  });

  // Kisumu County — Governor & Senator
  const ksmGovPos = await prisma.position.create({
    data: {
      electionId: kenya2027.id,
      title: 'Governor — Kisumu County',
      scope: PositionScope.COUNTY,
      scopeValue: 'Kisumu',
      orderIndex: 5,
    },
  });
  await prisma.candidate.createMany({
    data: [
      { positionId: ksmGovPos.id, name: 'Anyang\' Nyong\'o Peter', party: 'Orange Democratic Movement', ballotNumber: 1 },
      { positionId: ksmGovPos.id, name: 'Fred Oluoch Outa', party: 'Jubilee Party', ballotNumber: 2 },
      { positionId: ksmGovPos.id, name: 'Rose Auma Obama', party: 'Independent', ballotNumber: 3 },
    ],
  });

  const ksmSenPos = await prisma.position.create({
    data: {
      electionId: kenya2027.id,
      title: 'Senator — Kisumu County',
      scope: PositionScope.COUNTY,
      scopeValue: 'Kisumu',
      orderIndex: 6,
    },
  });
  await prisma.candidate.createMany({
    data: [
      { positionId: ksmSenPos.id, name: 'Tom Joseph Ojienda', party: 'Orange Democratic Movement', ballotNumber: 1 },
      { positionId: ksmSenPos.id, name: 'Caroli Omondi', party: 'Independent', ballotNumber: 2 },
    ],
  });

  // Constituency MPs (CONSTITUENCY-scoped)
  const mpConstituencies = [
    { title: 'Member of Parliament — Westlands Constituency', scopeValue: 'Westlands', orderIndex: 7,
      candidates: [
        { name: 'Tim Wanyonyi Wetangula', party: 'Orange Democratic Movement', ballotNumber: 1 },
        { name: 'Danson Mugambi Mwirigi', party: 'United Democratic Alliance', ballotNumber: 2 },
        { name: 'Jane Wanjiku Kirabi', party: 'Jubilee Party', ballotNumber: 3 },
      ],
    },
    { title: 'Member of Parliament — Kibra Constituency', scopeValue: 'Kibra', orderIndex: 8,
      candidates: [
        { name: 'Imran Sultan Okoth', party: 'Orange Democratic Movement', ballotNumber: 1 },
        { name: 'George Kaluma Opondo', party: 'Independent', ballotNumber: 2 },
      ],
    },
    { title: 'Member of Parliament — Mvita Constituency', scopeValue: 'Mvita', orderIndex: 9,
      candidates: [
        { name: 'Abdulkhaleef Hussein Ali', party: 'Orange Democratic Movement', ballotNumber: 1 },
        { name: 'Asha Mohamed Said', party: 'Jubilee Party', ballotNumber: 2 },
        { name: 'Shehe Juma Funge', party: 'Independent', ballotNumber: 3 },
      ],
    },
    { title: 'Member of Parliament — Kisumu Central Constituency', scopeValue: 'Kisumu Central', orderIndex: 10,
      candidates: [
        { name: 'Joshua Oron Odongo', party: 'Orange Democratic Movement', ballotNumber: 1 },
        { name: 'Mark Otieno Ndege', party: 'United Democratic Alliance', ballotNumber: 2 },
      ],
    },
  ];

  for (const mpData of mpConstituencies) {
    const mpPos = await prisma.position.create({
      data: {
        electionId: kenya2027.id,
        title: mpData.title,
        scope: PositionScope.CONSTITUENCY,
        scopeValue: mpData.scopeValue,
        orderIndex: mpData.orderIndex,
      },
    });
    await prisma.candidate.createMany({ data: mpData.candidates.map(c => ({ ...c, positionId: mpPos.id })) });
  }

  // Ward MCAs (WARD-scoped) — sample wards
  const mcaWards = [
    { title: 'Member of County Assembly — Parklands/Highridge Ward', scopeValue: 'Parklands/Highridge', orderIndex: 11,
      candidates: [
        { name: 'Peter Gitau Kamau', party: 'United Democratic Alliance', ballotNumber: 1 },
        { name: 'Grace Njeri Wambua', party: 'Jubilee Party', ballotNumber: 2 },
      ],
    },
    { title: 'Member of County Assembly — Laini Saba Ward', scopeValue: 'Laini Saba', orderIndex: 12,
      candidates: [
        { name: 'Ali Hassan Joho Jr.', party: 'Orange Democratic Movement', ballotNumber: 1 },
        { name: 'Fatuma Wanjiru Kariuki', party: 'Independent', ballotNumber: 2 },
      ],
    },
    { title: 'Member of County Assembly — Kondele Ward', scopeValue: 'Kondele', orderIndex: 13,
      candidates: [
        { name: 'Otieno Juma Achieng', party: 'Orange Democratic Movement', ballotNumber: 1 },
        { name: 'Beatrice Akinyi Ogola', party: 'United Democratic Alliance', ballotNumber: 2 },
      ],
    },
    { title: 'Member of County Assembly — Mji Wa Kale Ward', scopeValue: 'Mji Wa Kale', orderIndex: 14,
      candidates: [
        { name: 'Omar Shariff Mwandishi', party: 'Orange Democratic Movement', ballotNumber: 1 },
        { name: 'Rahma Abdi Salim', party: 'Jubilee Party', ballotNumber: 2 },
      ],
    },
  ];

  for (const mcaData of mcaWards) {
    const mcaPos = await prisma.position.create({
      data: {
        electionId: kenya2027.id,
        title: mcaData.title,
        scope: PositionScope.WARD,
        scopeValue: mcaData.scopeValue,
        orderIndex: mcaData.orderIndex,
      },
    });
    await prisma.candidate.createMany({ data: mcaData.candidates.map(c => ({ ...c, positionId: mcaPos.id })) });
  }

  console.log('   ✓ Kenya 2027 General Election — President, Governors, Senators, MPs, MCAs');

  // ── University of Nairobi SRC Election ───────────────────────────────────
  const uonSrc = await prisma.election.create({
    data: {
      name: 'University of Nairobi SRC Elections 2026',
      description: 'Student Representative Council general elections for the 2026/2027 academic year.',
      type: ElectionType.INSTITUTIONAL,
      status: ElectionStatus.ACTIVE,
      orgName: 'University of Nairobi',
      startDate: new Date('2026-04-01T07:00:00Z'),
      endDate: new Date('2026-04-01T18:00:00Z'),
    },
  });

  const srcPositions = [
    { title: 'SRC President', description: 'Overall student body leader', orderIndex: 0,
      candidates: [
        { name: 'Brian Otieno Oduor', party: 'Students First Alliance', ballotNumber: 1 },
        { name: 'Wanjiku Njeri Mwangi', party: 'Progressive Students Front', ballotNumber: 2 },
        { name: 'Kevin Kipchoge Bett', party: 'Independent', ballotNumber: 3 },
      ],
    },
    { title: 'SRC Vice President', orderIndex: 1,
      candidates: [
        { name: 'Akinyi Adhiambo Ouma', party: 'Students First Alliance', ballotNumber: 1 },
        { name: 'James Maina Gitonga', party: 'Progressive Students Front', ballotNumber: 2 },
      ],
    },
    { title: 'Secretary General', orderIndex: 2,
      candidates: [
        { name: 'Mercy Wambui Kariuki', party: 'Students First Alliance', ballotNumber: 1 },
        { name: 'Dennis Odhiambo Owino', party: 'Independent', ballotNumber: 2 },
        { name: 'Faith Chebet Kosgei', party: 'Progressive Students Front', ballotNumber: 3 },
      ],
    },
    { title: 'Finance Secretary', orderIndex: 3,
      candidates: [
        { name: 'Samuel Njoroge Karanja', party: 'Students First Alliance', ballotNumber: 1 },
        { name: 'Anne Achieng Otieno', party: 'Progressive Students Front', ballotNumber: 2 },
      ],
    },
    { title: 'Academics Secretary', orderIndex: 4,
      candidates: [
        { name: 'Ruth Wafula Simiyu', party: 'Independent', ballotNumber: 1 },
        { name: 'Patrick Mutua Macharia', party: 'Students First Alliance', ballotNumber: 2 },
      ],
    },
  ];

  for (const posData of srcPositions) {
    const pos = await prisma.position.create({
      data: {
        electionId: uonSrc.id,
        title: posData.title,
        description: posData.description ?? null,
        scope: PositionScope.CUSTOM,
        orderIndex: posData.orderIndex,
      },
    });
    await prisma.candidate.createMany({ data: posData.candidates.map(c => ({ ...c, positionId: pos.id })) });
  }
  console.log('   ✓ University of Nairobi SRC Elections 2026');

  // ── Safaricom PLC Board Election ─────────────────────────────────────────
  const safaricomBoard = await prisma.election.create({
    data: {
      name: 'Safaricom PLC Board of Directors Election 2026',
      description: 'Annual general meeting election for independent non-executive directors of Safaricom PLC.',
      type: ElectionType.CORPORATE,
      status: ElectionStatus.ACTIVE,
      orgName: 'Safaricom PLC',
      startDate: new Date('2026-05-15T09:00:00Z'),
      endDate: new Date('2026-05-15T16:00:00Z'),
    },
  });

  const boardPositions = [
    { title: 'Chair — Board of Directors', orderIndex: 0,
      candidates: [
        { name: 'Dr. Bitange Ndemo', party: null, ballotNumber: 1 },
        { name: 'Adil Khawaja', party: null, ballotNumber: 2 },
      ],
    },
    { title: 'Independent Non-Executive Director (Slot A)', orderIndex: 1,
      candidates: [
        { name: 'Susan Mudhune', party: null, ballotNumber: 1 },
        { name: 'Francis Muriu', party: null, ballotNumber: 2 },
        { name: 'Esther Koimett', party: null, ballotNumber: 3 },
      ],
    },
    { title: 'Independent Non-Executive Director (Slot B)', orderIndex: 2,
      candidates: [
        { name: 'Mohamed Joosub', party: null, ballotNumber: 1 },
        { name: 'Sylvia Mulinge', party: null, ballotNumber: 2 },
      ],
    },
    { title: 'Audit Committee Chair', orderIndex: 3,
      candidates: [
        { name: 'Paul Kagame Ndirangu', party: null, ballotNumber: 1 },
        { name: 'Jane Karuku Sang', party: null, ballotNumber: 2 },
      ],
    },
  ];

  for (const posData of boardPositions) {
    const pos = await prisma.position.create({
      data: {
        electionId: safaricomBoard.id,
        title: posData.title,
        scope: PositionScope.CUSTOM,
        orderIndex: posData.orderIndex,
      },
    });
    await prisma.candidate.createMany({ data: posData.candidates.map(c => ({ ...c, positionId: pos.id })) });
  }
  console.log('   ✓ Safaricom PLC Board of Directors Election 2026');
  console.log('✅ Elections seeded\n');
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🌱 VeriVote Kenya - Database Seeding');
  console.log('='.repeat(60) + '\n');
  
  try {
    // Step 1: Clear existing data (in correct order for foreign keys)
    console.log('🧹 Clearing existing data...');
    await prisma.resultDeclaration.deleteMany();
    await prisma.iebcStaff.deleteMany();
    await prisma.webAuthnCredential.deleteMany();
    await prisma.otpCode.deleteMany();
    await prisma.manualReviewAppointment.deleteMany();
    await prisma.printQueue.deleteMany();
    await prisma.vote.deleteMany();
    await prisma.voter.deleteMany();
    await prisma.pollingStation.deleteMany();
    // Election system (cascade handles positions/candidates/enrollments)
    await prisma.election.deleteMany();
    console.log('✅ Database cleared\n');
    
    // Step 2: Seed data in order (respecting foreign key relationships)
    const stationIds = await seedPollingStations();
    await seedAdminUser(stationIds);
    const voterIds = await seedVoters(stationIds);
    const voteIds = await seedVotes(stationIds);
    await seedPrintQueue(voteIds, stationIds);
    await seedElections();
    
    // Step 3: Print summary statistics
    console.log('='.repeat(60));
    console.log('📊 SEED SUMMARY');
    console.log('='.repeat(60) + '\n');
    
    const stats = {
      pollingStations: await prisma.pollingStation.count(),
      voters: await prisma.voter.count(),
      votes: await prisma.vote.count(),
      printQueue: await prisma.printQueue.count(),
      elections: await prisma.election.count(),
      positions: await prisma.position.count(),
      candidates: await prisma.candidate.count(),
    };

    console.log(`   Polling Stations: ${stats.pollingStations}`);
    console.log(`   Voters:           ${stats.voters}`);
    console.log(`   Votes:            ${stats.votes}`);
    console.log(`   Print Queue:      ${stats.printQueue}`);
    console.log(`   Elections:        ${stats.elections}`);
    console.log(`   Positions:        ${stats.positions}`);
    console.log(`   Candidates:       ${stats.candidates}`);
    
    // Voter status breakdown
    const votersByStatus = await prisma.voter.groupBy({
      by: ['status'],
      _count: true,
    });
    
    console.log('\n   Voter Status Breakdown:');
    for (const item of votersByStatus) {
      console.log(`     ${item.status}: ${item._count}`);
    }
    
    // Vote status breakdown
    const votesByStatus = await prisma.vote.groupBy({
      by: ['status'],
      _count: true,
    });
    
    console.log('\n   Vote Status Breakdown:');
    for (const item of votesByStatus) {
      console.log(`     ${item.status}: ${item._count}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Database seeded successfully!');
    console.log('='.repeat(60) + '\n');
    
    console.log('Next steps:');
    console.log('  1. Run `npx prisma studio` to browse your data');
    console.log('  2. Run `pnpm dev` to start the API server');
    console.log('  3. Visit http://localhost:3000/health to verify\n');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
}

// Execute the seed
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // Always disconnect when done
    await prisma.$disconnect();
  });
