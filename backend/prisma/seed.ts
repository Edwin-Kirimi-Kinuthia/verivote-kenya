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

import { PrismaClient, VoterStatus, VoteStatus, PrintStatus } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';

// Create Prisma client for database operations
const prisma = new PrismaClient();

// ============================================================================
// KENYAN DATA
// ============================================================================
// Real polling station locations across Kenya's major counties

/**
 * Polling station data structure
 * Each station has location info matching Kenya's administrative hierarchy
 */
interface PollingStationData {
  code: string;           // Unique station code
  name: string;           // Station name (usually a school or public building)
  county: string;         // One of Kenya's 47 counties
  constituency: string;   // Electoral constituency
  ward: string;           // Smallest administrative unit
  latitude: number;       // GPS latitude
  longitude: number;      // GPS longitude
  address: string;        // Physical address
  registeredVoters: number; // Expected voter count
}

const POLLING_STATIONS: PollingStationData[] = [
  {
    code: 'NAI-WL-001',
    name: 'Westlands Primary School',
    county: 'Nairobi',
    constituency: 'Westlands',
    ward: 'Parklands/Highridge',
    latitude: -1.2634,
    longitude: 36.8045,
    address: 'Waiyaki Way, Westlands, Nairobi',
    registeredVoters: 1250,
  },
  {
    code: 'NAI-KB-002',
    name: 'Olympic Primary School',
    county: 'Nairobi',
    constituency: 'Kibra',
    ward: 'Laini Saba',
    latitude: -1.3119,
    longitude: 36.7866,
    address: 'Kibera Drive, Kibra, Nairobi',
    registeredVoters: 2100,
  },
  {
    code: 'NAI-LG-003',
    name: 'Langata Barracks Hall',
    county: 'Nairobi',
    constituency: 'Langata',
    ward: 'Karen',
    latitude: -1.3425,
    longitude: 36.7234,
    address: 'Karen Road, Langata, Nairobi',
    registeredVoters: 980,
  },
  {
    code: 'MSA-MV-001',
    name: 'Aga Khan Primary Mombasa',
    county: 'Mombasa',
    constituency: 'Mvita',
    ward: 'Mji Wa Kale',
    latitude: -4.0435,
    longitude: 39.6682,
    address: 'Nkrumah Road, Mombasa Island',
    registeredVoters: 1560,
  },
  {
    code: 'MSA-NY-002',
    name: 'Nyali Beach Primary',
    county: 'Mombasa',
    constituency: 'Nyali',
    ward: 'Frere Town',
    latitude: -4.0244,
    longitude: 39.7152,
    address: 'Links Road, Nyali, Mombasa',
    registeredVoters: 1890,
  },
  {
    code: 'KSM-KS-001',
    name: 'Kisumu Boys High School',
    county: 'Kisumu',
    constituency: 'Kisumu Central',
    ward: 'Kondele',
    latitude: -0.1022,
    longitude: 34.7617,
    address: 'Oginga Odinga Street, Kisumu',
    registeredVoters: 1750,
  },
  {
    code: 'NKR-NK-001',
    name: 'Nakuru West Primary',
    county: 'Nakuru',
    constituency: 'Nakuru Town West',
    ward: 'Barut',
    latitude: -0.3031,
    longitude: 36.0800,
    address: 'Kenyatta Avenue, Nakuru',
    registeredVoters: 1420,
  },
  {
    code: 'ELD-WR-001',
    name: 'Eldoret Catholic Church Hall',
    county: 'Uasin Gishu',
    constituency: 'Eldoret North',
    ward: 'Huruma',
    latitude: 0.5143,
    longitude: 35.2698,
    address: 'Uganda Road, Eldoret',
    registeredVoters: 1680,
  },
  {
    code: 'KIA-RUI-001',
    name: 'Ruiru Township Primary',
    county: 'Kiambu',
    constituency: 'Ruiru',
    ward: 'Gatongora',
    latitude: -1.1491,
    longitude: 36.9616,
    address: 'Ruiru-Kiambu Road, Ruiru',
    registeredVoters: 2200,
  },
  {
    code: 'MRU-NTI-001',
    name: 'Meru Technical Institute',
    county: 'Meru',
    constituency: 'North Imenti',
    ward: 'Municipality',
    latitude: 0.0500,
    longitude: 37.6500,
    address: 'Meru-Nanyuki Highway, Meru',
    registeredVoters: 1350,
  },
];

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
 * Creates 10 polling stations across Kenya
 */
async function seedPollingStations(): Promise<string[]> {
  console.log('🏫 Creating polling stations...');
  
  const stationIds: string[] = [];
  
  for (const station of POLLING_STATIONS) {
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
        registeredVoters: station.registeredVoters,
        isActive: true,
        deviceCount: getRandomInt(2, 5),    // 2-5 voting devices
        printerCount: getRandomInt(1, 2),   // 1-2 printers
      },
    });
    
    stationIds.push(created.id);
    console.log(`   ✓ ${station.name} (${station.code})`);
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
        pinHash: generateArgon2Hash(),
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
    
    const vote = await prisma.vote.create({
      data: {
        encryptedVoteHash: generateVoteHash(),
        encryptedVoteData: JSON.stringify({
          encrypted: true,
          scheme: 'BFV',  // Brakerski-Fan-Vercauteren homomorphic encryption
          ciphertext: randomBytes(128).toString('base64'),
        }),
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
    await prisma.manualReviewAppointment.deleteMany();
    await prisma.printQueue.deleteMany();
    await prisma.vote.deleteMany();
    await prisma.voter.deleteMany();
    await prisma.pollingStation.deleteMany();
    console.log('✅ Database cleared\n');
    
    // Step 2: Seed data in order (respecting foreign key relationships)
    const stationIds = await seedPollingStations();
    const voterIds = await seedVoters(stationIds);
    const voteIds = await seedVotes(stationIds);
    await seedPrintQueue(voteIds, stationIds);
    
    // Step 3: Print summary statistics
    console.log('='.repeat(60));
    console.log('📊 SEED SUMMARY');
    console.log('='.repeat(60) + '\n');
    
    const stats = {
      pollingStations: await prisma.pollingStation.count(),
      voters: await prisma.voter.count(),
      votes: await prisma.vote.count(),
      printQueue: await prisma.printQueue.count(),
    };
    
    console.log(`   Polling Stations: ${stats.pollingStations}`);
    console.log(`   Voters:           ${stats.voters}`);
    console.log(`   Votes:            ${stats.votes}`);
    console.log(`   Print Queue:      ${stats.printQueue}`);
    
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
