/**
 * VeriVote Kenya — Kenya General Election 2027 via API
 *
 * Creates the election end-to-end using API endpoints, demonstrating:
 *   1. Commission-tier creates election + national structure
 *   2. Commission recruits National RO, who recruits County ROs
 *   3. County ROs add their county's constituencies/wards/polling stations + recruit Constituency ROs
 *   4. Constituency ROs recruit Presiding Officers for their stations
 *   5. Positions follow constitutional hierarchy; result declarations scoped by rank
 *
 * BALLOT SCOPING (safe, no string-name matching):
 *   Positions are created via POST /api/elections/:id/jurisdictions/:jid/positions
 *   which attaches them to a specific jurisdiction node (jurisdictionId on Position).
 *   POLLING_STATION nodes are created with pollingStationId linking them to physical
 *   PollingStation records in the DB.
 *   When a voter gets their ballot, the service finds their home node via:
 *     voter.pollingStationId === node.pollingStationId
 *   then walks ancestors: POLLING_STATION → WARD → CONSTITUENCY → COUNTY → NATIONAL
 *   collecting positions attached to each ancestor node.
 *   This is strictly UUID-based — no string name matching, no mismatch risk.
 *
 * Run from backend/:
 *   npx tsx prisma/create-2027-election.ts
 */

const BASE = 'http://localhost:3005';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { success: boolean; data?: any; error?: string };
  if (!data.success) throw new Error(`POST ${path} → ${data.error}`);
  return data.data;
}

async function patch(path: string, body: unknown, token: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { success: boolean; data?: any; error?: string };
  if (!data.success) throw new Error(`PATCH ${path} → ${data.error}`);
  return data.data;
}

async function get(path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json() as { success: boolean; data?: any; error?: string };
  if (!data.success) throw new Error(`GET ${path} → ${data.error}`);
  return data.data;
}

/**
 * Look up a PollingStation record by code (most reliable, avoids name mismatches).
 * Uses ?q= text search + client-side exact match on the code field.
 * Returns the station's UUID id. Throws if not found so setup fails loudly.
 */
async function stationId(code: string, adminToken: string): Promise<string> {
  // Use text search on the code prefix and fetch a small page
  const data = await get(
    `/api/polling-stations?q=${encodeURIComponent(code)}&limit=10`,
    adminToken,
  );
  const stations: any[] = data.data ?? (Array.isArray(data) ? data : []);
  const station = stations.find((s: any) => s.code === code);
  if (!station) {
    throw new Error(
      `Polling station with code "${code}" not found in DB. ` +
      `Add it via POST /api/polling-stations before running this script.`,
    );
  }
  return station.id as string;
}

/**
 * Create an officer account via the admin endpoint (bypasses Persona KYC).
 * Officers are recruited by their superiors, not self-registered.
 */
async function createOfficerAccount(
  nationalId: string, fullName: string, email: string,
  password: string, adminToken: string,
): Promise<void> {
  await post('/api/admin/create-officer-account', { nationalId, fullName, email, password }, adminToken);
}

/** Admin login → JWT */
async function adminLogin(): Promise<string> {
  const step = await post('/api/admin-auth/login', { identifier: '00000001', password: 'Admin@1234' });
  const otp  = step.mockCode;
  const done = await post('/api/admin-auth/verify-otp', { stepToken: step.stepToken, code: otp });
  return done.token as string;
}

/** Officer login → JWT */
async function officerLogin(nationalId: string, password = 'Officer@Iebc27'): Promise<string> {
  const step = await post('/api/admin-auth/login', { identifier: nationalId, password });
  const done = await post('/api/admin-auth/verify-otp', { stepToken: step.stepToken, code: step.mockCode });
  return done.token as string;
}

// ── Officer definitions ───────────────────────────────────────────────────────

const OFFICERS = {
  nationalRO: { nationalId: '11111101', email: 'national.ro@iebc.go.ke', name: 'John Mutunga' },

  nairobiCRO:  { nationalId: '11111102', email: 'nairobi.cro@iebc.go.ke',  name: 'Mary Wanjiku'  },
  kiambuCRO:   { nationalId: '11111103', email: 'kiambu.cro@iebc.go.ke',   name: 'Peter Kamau'   },

  westlandsRO: { nationalId: '11111104', email: 'westlands.ro@iebc.go.ke', name: 'Grace Achieng' },
  stareheRO:   { nationalId: '11111105', email: 'starehe.ro@iebc.go.ke',   name: 'James Omondi'  },
  limuruRO:    { nationalId: '11111106', email: 'limuru.ro@iebc.go.ke',    name: 'Sarah Wambua'  },
  kabeteRO:    { nationalId: '11111107', email: 'kabete.ro@iebc.go.ke',    name: 'David Njoroge' },

  // Presiding Officers — polling station level
  po1: { nationalId: '11111108', email: 'po.westlands1@iebc.go.ke',  name: 'Alice Njeru'    },
  po2: { nationalId: '11111109', email: 'po.westlands2@iebc.go.ke',  name: 'Brian Otieno'   },
  po3: { nationalId: '11111110', email: 'po.starehe1@iebc.go.ke',    name: 'Carol Wambui'   },
  po4: { nationalId: '11111111', email: 'po.starehe2@iebc.go.ke',    name: 'Daniel Kiprop'  },
  po5: { nationalId: '11111112', email: 'po.limuru1@iebc.go.ke',     name: 'Esther Akinyi'  },
  po6: { nationalId: '11111113', email: 'po.limuru2@iebc.go.ke',     name: 'Francis Mutua'  },
  po7: { nationalId: '11111114', email: 'po.kabete1@iebc.go.ke',     name: 'Grace Mwangi'   },
  po8: { nationalId: '11111115', email: 'po.kabete2@iebc.go.ke',     name: 'Henry Rotich'   },
};

// ── Polling station codes (must exist in polling_stations table) ──────────────
// These are the IEBC station codes registered in the system.
// Looked up by code → UUID to avoid any name-string mismatch.
const STATION_CODES = {
  westlandsPrimary: 'NAI-WL-001',
  // Starehe, Kiambu stations — add their codes here as they are seeded.
  // If a station is not yet in the DB, create it via POST /api/polling-stations first.
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  VeriVote Kenya — General Election 2027 Setup via API');
  console.log('  BALLOT SCOPING: UUID-based node traversal (no string matching)');
  console.log('═══════════════════════════════════════════════════════\n');

  // ── PHASE 1: Admin (Commissioner) login ────────────────────────────────────
  console.log('PHASE 1: Commissioner login...');
  const adminToken = await adminLogin();
  console.log('  ✓ Commissioner authenticated\n');

  // ── PHASE 2: Register officer voter accounts ────────────────────────────────
  console.log('PHASE 2: Registering officer voter accounts...');
  for (const [, o] of Object.entries(OFFICERS)) {
    try {
      await createOfficerAccount(o.nationalId, o.name, o.email, 'Officer@Iebc27', adminToken);
      console.log(`  ✓ ${o.name} (${o.nationalId})`);
    } catch (err: any) {
      // Officer may already exist from a previous run — skip if so
      if (err.message?.includes('already exists') || err.message?.includes('Unique')) {
        console.log(`  ~ ${o.name} (${o.nationalId}) — already exists, skipping`);
      } else {
        throw err;
      }
    }
  }
  console.log();

  // ── PHASE 3: Create election ────────────────────────────────────────────────
  console.log('PHASE 3: Creating Kenya General Election 2027...');
  const election = await post('/api/elections', {
    name:        'Kenya General Election 2027',
    description: 'The 2027 Kenya General Election conducted under the Constitution of Kenya 2010. ' +
                 'Voters elect the President, Governors, Senators, Women Representatives, ' +
                 'Members of National Assembly, and Members of County Assembly.',
    type:        'GOVERNMENT',
    orgName:     'Independent Electoral and Boundaries Commission (IEBC)',
    startDate:   '2027-08-10T06:00:00Z',
    endDate:     '2027-08-10T17:00:00Z',
    authMethod:  'PERSONA_KYC',
  }, adminToken);
  const electionId = election.id;
  console.log(`  ✓ Election created: ${electionId}\n`);

  // ── PHASE 4: Commission recruits National RO ───────────────────────────────
  console.log('PHASE 4: Commission recruits National Returning Officer...');
  const nationalROStaff = await post('/api/staff', {
    nationalId:        OFFICERS.nationalRO.nationalId,
    staffRole:         'NATIONAL_RO',
    jurisdictionLevel: 'NATIONAL',
  }, adminToken);
  const nationalROStaffId = nationalROStaff.id;
  console.log(`  ✓ National RO: ${OFFICERS.nationalRO.name} (staff: ${nationalROStaffId})\n`);

  // National RO logs in
  console.log('  National RO logging in...');
  const nroToken = await officerLogin(OFFICERS.nationalRO.nationalId);
  console.log('  ✓ National RO authenticated\n');

  // ── PHASE 5: Build jurisdiction tree — national root ───────────────────────
  console.log('PHASE 5: Building jurisdiction tree (UUID-linked, no string matching)...');

  // Root node: Kenya (National level) — created by Commissioner
  const kenyaNode = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Kenya', level: 'NATIONAL', orderIndex: 0,
    personInChargeId: nationalROStaffId,
  }, adminToken);
  console.log(`  ✓ Kenya (National) [personInCharge: National RO]`);

  // ── PHASE 6: National RO recruits County ROs ───────────────────────────────
  console.log('\nPHASE 6: National RO recruits County Returning Officers...');

  const nairobiCROStaff = await post('/api/staff', {
    nationalId:        OFFICERS.nairobiCRO.nationalId,
    staffRole:         'COUNTY_RO',
    jurisdictionLevel: 'COUNTY',
    jurisdictionValue: 'Nairobi',
  }, nroToken);
  console.log(`  ✓ Nairobi County RO: ${OFFICERS.nairobiCRO.name}`);

  const kiambuCROStaff = await post('/api/staff', {
    nationalId:        OFFICERS.kiambuCRO.nationalId,
    staffRole:         'COUNTY_RO',
    jurisdictionLevel: 'COUNTY',
    jurisdictionValue: 'Kiambu',
  }, nroToken);
  console.log(`  ✓ Kiambu County RO: ${OFFICERS.kiambuCRO.name}`);

  // County ROs log in
  const nairobiCROToken = await officerLogin(OFFICERS.nairobiCRO.nationalId);
  const kiambuCROToken  = await officerLogin(OFFICERS.kiambuCRO.nationalId);
  console.log('  ✓ County ROs authenticated\n');

  // ── PHASE 7: Nairobi County RO builds Nairobi tree ─────────────────────────
  console.log('PHASE 7: Nairobi County RO builds county jurisdiction tree...');

  const nairobiNode = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Nairobi', level: 'COUNTY', parentId: kenyaNode.id, orderIndex: 0,
    personInChargeId: nairobiCROStaff.id,
  }, adminToken); // commissioner creates county nodes; CRO manages downwards
  console.log(`  ✓ Nairobi County [personInCharge: Mary Wanjiku]`);

  // Nairobi County RO recruits Constituency ROs
  const westlandsROStaff = await post('/api/staff', {
    nationalId:        OFFICERS.westlandsRO.nationalId,
    staffRole:         'CONSTITUENCY_RO',
    jurisdictionLevel: 'CONSTITUENCY',
    jurisdictionValue: 'Westlands',
  }, nairobiCROToken);

  const stareheROStaff = await post('/api/staff', {
    nationalId:        OFFICERS.stareheRO.nationalId,
    staffRole:         'CONSTITUENCY_RO',
    jurisdictionLevel: 'CONSTITUENCY',
    jurisdictionValue: 'Starehe',
  }, nairobiCROToken);

  // Constituency nodes under Nairobi
  const westlandsNode = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Westlands', level: 'CONSTITUENCY', parentId: nairobiNode.id, orderIndex: 0,
    personInChargeId: westlandsROStaff.id,
  }, nairobiCROToken);
  console.log(`  ✓ Westlands Constituency [personInCharge: Grace Achieng]`);

  const stareheNode = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Starehe', level: 'CONSTITUENCY', parentId: nairobiNode.id, orderIndex: 1,
    personInChargeId: stareheROStaff.id,
  }, nairobiCROToken);
  console.log(`  ✓ Starehe Constituency [personInCharge: James Omondi]`);

  // Constituency ROs log in
  const westlandsROToken = await officerLogin(OFFICERS.westlandsRO.nationalId);
  const stareheROToken   = await officerLogin(OFFICERS.stareheRO.nationalId);

  // ── Westlands ward/station nodes ───────────────────────────────────────────
  console.log('\n  Westlands Constituency RO adds wards & presiding officers...');

  // Presiding Officers
  const po1Staff = await post('/api/staff', {
    nationalId: OFFICERS.po1.nationalId, staffRole: 'PRESIDING_OFFICER',
    jurisdictionLevel: 'POLLING_STATION', jurisdictionValue: 'Westlands Primary School',
  }, westlandsROToken);

  const po2Staff = await post('/api/staff', {
    nationalId: OFFICERS.po2.nationalId, staffRole: 'PRESIDING_OFFICER',
    jurisdictionLevel: 'POLLING_STATION', jurisdictionValue: 'Kangemi Primary School',
  }, westlandsROToken);

  // Look up physical polling station UUIDs by code
  // Westlands Primary School: NAI-WL-001
  const westlandsPrimaryStationId = await stationId(STATION_CODES.westlandsPrimary, adminToken);
  console.log(`  ✓ Resolved ${STATION_CODES.westlandsPrimary} → ${westlandsPrimaryStationId}`);

  // Ward nodes
  const westlandsWardNode = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Westlands Ward', level: 'WARD', parentId: westlandsNode.id, orderIndex: 0,
  }, westlandsROToken);

  const parklandsWardNode = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Parklands/Highridge Ward', level: 'WARD', parentId: westlandsNode.id, orderIndex: 1,
  }, westlandsROToken);

  // POLLING_STATION nodes — linked to physical PollingStation records by UUID
  // This is the key: pollingStationId links the node to the physical station.
  // voter.pollingStationId === node.pollingStationId → safe UUID match, no string guessing.
  const wps1Node = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Westlands Primary School', level: 'POLLING_STATION',
    parentId: westlandsWardNode.id, orderIndex: 0,
    personInChargeId: po1Staff.id,
    pollingStationId: westlandsPrimaryStationId,  // ← UUID link to physical station
  }, westlandsROToken);
  console.log(`  ✓ Westlands Primary School (POLLING_STATION, linked to station ${STATION_CODES.westlandsPrimary})`);

  // Kangemi Primary School — look up if in DB, else skip for now
  // Add STATION_CODES.kangemiPrimary when that station is seeded.
  // For now, create the node without linking (voters can still register but will
  // trigger the fallback warning until the station is seeded and linked).
  const wps2Node = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Kangemi Primary School', level: 'POLLING_STATION',
    parentId: westlandsWardNode.id, orderIndex: 1,
    personInChargeId: po2Staff.id,
  }, westlandsROToken);
  console.log(`  ~ Kangemi Primary School (POLLING_STATION, no physical station linked yet — add code to STATION_CODES)`);

  const pps1Node = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Parklands Primary School', level: 'POLLING_STATION',
    parentId: parklandsWardNode.id, orderIndex: 0,
  }, westlandsROToken);

  // ── Starehe ward/station nodes ─────────────────────────────────────────────
  console.log('\n  Starehe Constituency RO adds wards & presiding officers...');

  const po3Staff = await post('/api/staff', {
    nationalId: OFFICERS.po3.nationalId, staffRole: 'PRESIDING_OFFICER',
    jurisdictionLevel: 'POLLING_STATION', jurisdictionValue: 'Ngara Primary School',
  }, stareheROToken);

  const po4Staff = await post('/api/staff', {
    nationalId: OFFICERS.po4.nationalId, staffRole: 'PRESIDING_OFFICER',
    jurisdictionLevel: 'POLLING_STATION', jurisdictionValue: 'Pangani Girls School',
  }, stareheROToken);

  const ngaraWardNode = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Ngara Ward', level: 'WARD', parentId: stareheNode.id, orderIndex: 0,
  }, stareheROToken);

  const panganiWardNode = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Pangani Ward', level: 'WARD', parentId: stareheNode.id, orderIndex: 1,
  }, stareheROToken);

  const sps1Node = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Ngara Primary School', level: 'POLLING_STATION', parentId: ngaraWardNode.id,
    orderIndex: 0, personInChargeId: po3Staff.id,
  }, stareheROToken);

  const sps2Node = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Pangani Girls School', level: 'POLLING_STATION', parentId: panganiWardNode.id,
    orderIndex: 0, personInChargeId: po4Staff.id,
  }, stareheROToken);

  console.log(`  ✓ Starehe: Ngara Ward + Pangani Ward with presiding officers`);

  // ── PHASE 8: Kiambu County RO builds Kiambu tree ───────────────────────────
  console.log('\nPHASE 8: Kiambu County RO builds county jurisdiction tree...');

  const kiambuNode = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Kiambu', level: 'COUNTY', parentId: kenyaNode.id, orderIndex: 1,
    personInChargeId: kiambuCROStaff.id,
  }, adminToken);
  console.log(`  ✓ Kiambu County [personInCharge: Peter Kamau]`);

  const limuruROStaff = await post('/api/staff', {
    nationalId:        OFFICERS.limuruRO.nationalId,
    staffRole:         'CONSTITUENCY_RO',
    jurisdictionLevel: 'CONSTITUENCY',
    jurisdictionValue: 'Limuru',
  }, kiambuCROToken);

  const kabeteROStaff = await post('/api/staff', {
    nationalId:        OFFICERS.kabeteRO.nationalId,
    staffRole:         'CONSTITUENCY_RO',
    jurisdictionLevel: 'CONSTITUENCY',
    jurisdictionValue: 'Kabete',
  }, kiambuCROToken);

  const limuruNode = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Limuru', level: 'CONSTITUENCY', parentId: kiambuNode.id, orderIndex: 0,
    personInChargeId: limuruROStaff.id,
  }, kiambuCROToken);

  const kabeteNode = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Kabete', level: 'CONSTITUENCY', parentId: kiambuNode.id, orderIndex: 1,
    personInChargeId: kabeteROStaff.id,
  }, kiambuCROToken);

  console.log(`  ✓ Limuru Constituency [Sarah Wambua] + Kabete Constituency [David Njoroge]`);

  const limuruROToken = await officerLogin(OFFICERS.limuruRO.nationalId);
  const kabeteROToken  = await officerLogin(OFFICERS.kabeteRO.nationalId);

  // Limuru wards
  const po5Staff = await post('/api/staff', {
    nationalId: OFFICERS.po5.nationalId, staffRole: 'PRESIDING_OFFICER',
    jurisdictionLevel: 'POLLING_STATION', jurisdictionValue: 'Limuru Township Primary',
  }, limuruROToken);

  const po6Staff = await post('/api/staff', {
    nationalId: OFFICERS.po6.nationalId, staffRole: 'PRESIDING_OFFICER',
    jurisdictionLevel: 'POLLING_STATION', jurisdictionValue: 'Ngecha Primary School',
  }, limuruROToken);

  const limuruWardNode = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Limuru Ward', level: 'WARD', parentId: limuruNode.id, orderIndex: 0,
  }, limuruROToken);

  const ngechaWardNode = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Ngecha Ward', level: 'WARD', parentId: limuruNode.id, orderIndex: 1,
  }, limuruROToken);

  await post(`/api/jurisdictions/${electionId}`, {
    name: 'Limuru Township Primary', level: 'POLLING_STATION', parentId: limuruWardNode.id,
    orderIndex: 0, personInChargeId: po5Staff.id,
  }, limuruROToken);

  await post(`/api/jurisdictions/${electionId}`, {
    name: 'Ngecha Primary School', level: 'POLLING_STATION', parentId: ngechaWardNode.id,
    orderIndex: 0, personInChargeId: po6Staff.id,
  }, limuruROToken);

  console.log(`  ✓ Limuru: Limuru Ward + Ngecha Ward with presiding officers`);

  // Kabete wards
  const po7Staff = await post('/api/staff', {
    nationalId: OFFICERS.po7.nationalId, staffRole: 'PRESIDING_OFFICER',
    jurisdictionLevel: 'POLLING_STATION', jurisdictionValue: 'Kabete Primary School',
  }, kabeteROToken);

  const po8Staff = await post('/api/staff', {
    nationalId: OFFICERS.po8.nationalId, staffRole: 'PRESIDING_OFFICER',
    jurisdictionLevel: 'POLLING_STATION', jurisdictionValue: 'Gitaru Primary School',
  }, kabeteROToken);

  const kabeteWardNode = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Kabete Ward', level: 'WARD', parentId: kabeteNode.id, orderIndex: 0,
  }, kabeteROToken);

  const gitaruWardNode = await post(`/api/jurisdictions/${electionId}`, {
    name: 'Gitaru Ward', level: 'WARD', parentId: kabeteNode.id, orderIndex: 1,
  }, kabeteROToken);

  await post(`/api/jurisdictions/${electionId}`, {
    name: 'Kabete Primary School', level: 'POLLING_STATION', parentId: kabeteWardNode.id,
    orderIndex: 0, personInChargeId: po7Staff.id,
  }, kabeteROToken);

  await post(`/api/jurisdictions/${electionId}`, {
    name: 'Gitaru Primary School', level: 'POLLING_STATION', parentId: gitaruWardNode.id,
    orderIndex: 0, personInChargeId: po8Staff.id,
  }, kabeteROToken);

  console.log(`  ✓ Kabete: Kabete Ward + Gitaru Ward with presiding officers\n`);

  // ── PHASE 9: Create positions via jurisdiction nodes (safe scoping) ─────────
  //
  // CRITICAL: Positions are created via POST /api/elections/:id/jurisdictions/:jid/positions
  // This sets jurisdictionId on the position, enabling UUID-based ballot scoping.
  //
  // How ballot scoping works with node-linked positions:
  //   Voter at Westlands Primary (linked to wps1Node) →
  //     ancestor chain: wps1Node → westlandsWardNode → westlandsNode → nairobiNode → kenyaNode
  //   Gets positions attached to any ancestor:
  //     kenyaNode     → President
  //     nairobiNode   → Governor (Nairobi), Senator (Nairobi), Women Rep (Nairobi)
  //     westlandsNode → MP (Westlands)
  //     westlandsWardNode → MCA (Westlands Ward)
  //   Does NOT get: Governor Kiambu (attached to kiambuNode, not an ancestor)
  //
  console.log('PHASE 9: Creating positions via jurisdiction nodes (UUID-based scoping)...');

  // 1. President — NATIONAL scope, linked to Kenya root node
  const president = await post(`/api/elections/${electionId}/jurisdictions/${kenyaNode.id}/positions`, {
    title: 'President of the Republic of Kenya',
    description: 'Head of State and Government. Elected by registered voters nationally. Article 136, Constitution of Kenya.',
    scope: 'NATIONAL',
    orderIndex: 0,
  }, adminToken);
  console.log('  ✓ President (linked to Kenya/NATIONAL node)');

  // 2. Governor — linked to county node (Nairobi and Kiambu separately)
  const governorNairobi = await post(`/api/elections/${electionId}/jurisdictions/${nairobiNode.id}/positions`, {
    title: 'Governor',
    description: 'Chief Executive of the County Government. Article 179, Constitution of Kenya.',
    scope: 'COUNTY',
    orderIndex: 1,
  }, nairobiCROToken);
  console.log('  ✓ Governor — linked to Nairobi node (only Nairobi voters see this)');

  const governorKiambu = await post(`/api/elections/${electionId}/jurisdictions/${kiambuNode.id}/positions`, {
    title: 'Governor',
    description: 'Chief Executive of the County Government. Article 179, Constitution of Kenya.',
    scope: 'COUNTY',
    orderIndex: 1,
  }, kiambuCROToken);
  console.log('  ✓ Governor — linked to Kiambu node (only Kiambu voters see this)');

  // 3. Senator — linked to county node
  const senatorNairobi = await post(`/api/elections/${electionId}/jurisdictions/${nairobiNode.id}/positions`, {
    title: 'Senator',
    description: 'Represents the county in the Senate. Article 98, Constitution of Kenya.',
    scope: 'COUNTY',
    orderIndex: 2,
  }, nairobiCROToken);

  const senatorKiambu = await post(`/api/elections/${electionId}/jurisdictions/${kiambuNode.id}/positions`, {
    title: 'Senator',
    description: 'Represents the county in the Senate. Article 98, Constitution of Kenya.',
    scope: 'COUNTY',
    orderIndex: 2,
  }, kiambuCROToken);
  console.log('  ✓ Senator — Nairobi + Kiambu (each linked to their county node)');

  // 4. Women Representative — linked to county node
  const womenRepNairobi = await post(`/api/elections/${electionId}/jurisdictions/${nairobiNode.id}/positions`, {
    title: 'Women Representative',
    description: 'Represents women in the National Assembly. Article 97(1)(b), Constitution of Kenya.',
    scope: 'COUNTY',
    orderIndex: 3,
  }, nairobiCROToken);

  const womenRepKiambu = await post(`/api/elections/${electionId}/jurisdictions/${kiambuNode.id}/positions`, {
    title: 'Women Representative',
    description: 'Represents women in the National Assembly. Article 97(1)(b), Constitution of Kenya.',
    scope: 'COUNTY',
    orderIndex: 3,
  }, kiambuCROToken);
  console.log('  ✓ Women Representative — Nairobi + Kiambu');

  // 5. Member of National Assembly — linked to constituency node
  const mpWestlands = await post(`/api/elections/${electionId}/jurisdictions/${westlandsNode.id}/positions`, {
    title: 'Member of National Assembly',
    description: 'Represents Westlands Constituency in the National Assembly. Article 97(1)(a), Constitution of Kenya.',
    scope: 'CONSTITUENCY',
    orderIndex: 4,
  }, westlandsROToken);

  const mpStarehe = await post(`/api/elections/${electionId}/jurisdictions/${stareheNode.id}/positions`, {
    title: 'Member of National Assembly',
    description: 'Represents Starehe Constituency in the National Assembly. Article 97(1)(a), Constitution of Kenya.',
    scope: 'CONSTITUENCY',
    orderIndex: 4,
  }, stareheROToken);

  const mpLimuru = await post(`/api/elections/${electionId}/jurisdictions/${limuruNode.id}/positions`, {
    title: 'Member of National Assembly',
    description: 'Represents Limuru Constituency in the National Assembly. Article 97(1)(a), Constitution of Kenya.',
    scope: 'CONSTITUENCY',
    orderIndex: 4,
  }, limuruROToken);

  const mpKabete = await post(`/api/elections/${electionId}/jurisdictions/${kabeteNode.id}/positions`, {
    title: 'Member of National Assembly',
    description: 'Represents Kabete Constituency in the National Assembly. Article 97(1)(a), Constitution of Kenya.',
    scope: 'CONSTITUENCY',
    orderIndex: 4,
  }, kabeteROToken);
  console.log('  ✓ MP — Westlands, Starehe, Limuru, Kabete (each linked to their constituency node)');

  // 6. MCA — linked to ward node (most local — only voters in that ward)
  const mcaWestlandsWard = await post(`/api/elections/${electionId}/jurisdictions/${westlandsWardNode.id}/positions`, {
    title: 'Member of County Assembly',
    description: 'Represents Westlands Ward in the Nairobi County Assembly. Article 177, Constitution of Kenya.',
    scope: 'WARD',
    orderIndex: 5,
  }, westlandsROToken);

  const mcaParklandsWard = await post(`/api/elections/${electionId}/jurisdictions/${parklandsWardNode.id}/positions`, {
    title: 'Member of County Assembly',
    description: 'Represents Parklands/Highridge Ward in the Nairobi County Assembly. Article 177, Constitution of Kenya.',
    scope: 'WARD',
    orderIndex: 5,
  }, westlandsROToken);

  const mcaNgaraWard = await post(`/api/elections/${electionId}/jurisdictions/${ngaraWardNode.id}/positions`, {
    title: 'Member of County Assembly',
    description: 'Represents Ngara Ward in the Nairobi County Assembly. Article 177, Constitution of Kenya.',
    scope: 'WARD',
    orderIndex: 5,
  }, stareheROToken);

  const mcaPanganiWard = await post(`/api/elections/${electionId}/jurisdictions/${panganiWardNode.id}/positions`, {
    title: 'Member of County Assembly',
    description: 'Represents Pangani Ward in the Nairobi County Assembly. Article 177, Constitution of Kenya.',
    scope: 'WARD',
    orderIndex: 5,
  }, stareheROToken);

  const mcaLimuruWard = await post(`/api/elections/${electionId}/jurisdictions/${limuruWardNode.id}/positions`, {
    title: 'Member of County Assembly',
    description: 'Represents Limuru Ward in the Kiambu County Assembly. Article 177, Constitution of Kenya.',
    scope: 'WARD',
    orderIndex: 5,
  }, limuruROToken);

  const mcaKabeteWard = await post(`/api/elections/${electionId}/jurisdictions/${kabeteWardNode.id}/positions`, {
    title: 'Member of County Assembly',
    description: 'Represents Kabete Ward in the Kiambu County Assembly. Article 177, Constitution of Kenya.',
    scope: 'WARD',
    orderIndex: 5,
  }, kabeteROToken);
  console.log('  ✓ MCA — Westlands Ward, Parklands Ward, Ngara, Pangani, Limuru, Kabete\n');

  // ── PHASE 10: Add candidates ────────────────────────────────────────────────
  console.log('PHASE 10: Adding candidates...');

  // President — national
  for (const c of [
    { name: 'William Samoei Ruto',  party: 'UDA',       ballotNumber: 1 },
    { name: 'Raila Amolo Odinga',   party: 'ODM',       ballotNumber: 2 },
    { name: 'Kalonzo Musyoka',      party: 'Wiper',     ballotNumber: 3 },
    { name: 'Martha Karua',         party: 'Narc Kenya', ballotNumber: 4 },
  ]) await post(`/api/elections/positions/${president.id}/candidates`, c, adminToken);
  console.log('  ✓ President: 4 candidates');

  // Nairobi Governor
  for (const c of [
    { name: 'Johnson Sakaja',   party: 'UDA',     ballotNumber: 1 },
    { name: 'Agnes Kagure',     party: 'ODM',     ballotNumber: 2 },
    { name: 'Polycarp Igathe',  party: 'Jubilee', ballotNumber: 3 },
  ]) await post(`/api/elections/positions/${governorNairobi.id}/candidates`, c, nairobiCROToken);
  console.log('  ✓ Nairobi Governor: 3 candidates');

  // Kiambu Governor
  for (const c of [
    { name: 'Kimani Wamatangi',  party: 'UDA',     ballotNumber: 1 },
    { name: 'James Nyoro',       party: 'Jubilee', ballotNumber: 2 },
    { name: 'Gathinji Mwangi',   party: 'ODM',     ballotNumber: 3 },
  ]) await post(`/api/elections/positions/${governorKiambu.id}/candidates`, c, kiambuCROToken);
  console.log('  ✓ Kiambu Governor: 3 candidates');

  // Nairobi Senator
  for (const c of [
    { name: 'Edwin Sifuna',     party: 'ODM', ballotNumber: 1 },
    { name: 'Millicent Omanga', party: 'UDA', ballotNumber: 2 },
  ]) await post(`/api/elections/positions/${senatorNairobi.id}/candidates`, c, nairobiCROToken);
  console.log('  ✓ Nairobi Senator: 2 candidates');

  // Kiambu Senator
  for (const c of [
    { name: 'Karungo Thangwa', party: 'UDA',     ballotNumber: 1 },
    { name: 'Beth Mugo',        party: 'Jubilee', ballotNumber: 2 },
  ]) await post(`/api/elections/positions/${senatorKiambu.id}/candidates`, c, kiambuCROToken);
  console.log('  ✓ Kiambu Senator: 2 candidates');

  // Women Reps
  for (const c of [
    { name: 'Esther Passaris', party: 'ODM', ballotNumber: 1 },
    { name: 'Wavinya Ndeti',   party: 'UDA', ballotNumber: 2 },
  ]) await post(`/api/elections/positions/${womenRepNairobi.id}/candidates`, c, nairobiCROToken);
  console.log('  ✓ Nairobi Women Rep: 2 candidates');

  for (const c of [
    { name: 'Gathoni Wamuchomba', party: 'UDA', ballotNumber: 1 },
    { name: 'Alice Ng\'ang\'a',   party: 'ODM', ballotNumber: 2 },
  ]) await post(`/api/elections/positions/${womenRepKiambu.id}/candidates`, c, kiambuCROToken);
  console.log('  ✓ Kiambu Women Rep: 2 candidates');

  // MPs
  for (const c of [
    { name: 'Kanini Kega',    party: 'UDA',     ballotNumber: 1 },
    { name: 'Imran Sultan',   party: 'Jubilee', ballotNumber: 2 },
    { name: 'Fatuma Hassan',  party: 'ODM',     ballotNumber: 3 },
  ]) await post(`/api/elections/positions/${mpWestlands.id}/candidates`, c, westlandsROToken);
  console.log('  ✓ Westlands MP: 3 candidates');

  for (const c of [
    { name: 'Charles Njagua', party: 'UDA',     ballotNumber: 1 },
    { name: 'Aden Duale',     party: 'Jubilee', ballotNumber: 2 },
  ]) await post(`/api/elections/positions/${mpStarehe.id}/candidates`, c, stareheROToken);
  console.log('  ✓ Starehe MP: 2 candidates');

  for (const c of [
    { name: 'Lenny Kivuti',   party: 'UDA',     ballotNumber: 1 },
    { name: 'Njoroge Baiya',  party: 'Jubilee', ballotNumber: 2 },
    { name: 'Susan Njeri',    party: 'ODM',     ballotNumber: 3 },
  ]) await post(`/api/elections/positions/${mpLimuru.id}/candidates`, c, limuruROToken);
  console.log('  ✓ Limuru MP: 3 candidates');

  for (const c of [
    { name: 'Paul Koinange',  party: 'UDA', ballotNumber: 1 },
    { name: 'George Kariuki', party: 'ODM', ballotNumber: 2 },
  ]) await post(`/api/elections/positions/${mpKabete.id}/candidates`, c, kabeteROToken);
  console.log('  ✓ Kabete MP: 2 candidates');

  // MCAs
  const mcaPositions: Array<[string, string, string, Array<{name:string;party:string;ballotNumber:number}>]> = [
    [mcaWestlandsWard.id, 'Westlands Ward MCA', westlandsROToken, [
      { name: 'Kevin Mwangi',  party: 'UDA',     ballotNumber: 1 },
      { name: 'Anne Wanjiru',  party: 'ODM',     ballotNumber: 2 },
      { name: 'John Karimi',   party: 'Jubilee', ballotNumber: 3 },
    ]],
    [mcaParklandsWard.id, 'Parklands/Highridge Ward MCA', westlandsROToken, [
      { name: 'Patel Rajesh',    party: 'UDA', ballotNumber: 1 },
      { name: 'Lilian Odhiambo', party: 'ODM', ballotNumber: 2 },
    ]],
    [mcaNgaraWard.id, 'Ngara Ward MCA', stareheROToken, [
      { name: 'Hassan Ali', party: 'UDA', ballotNumber: 1 },
      { name: 'Mary Auma',  party: 'ODM', ballotNumber: 2 },
    ]],
    [mcaPanganiWard.id, 'Pangani Ward MCA', stareheROToken, [
      { name: 'Saif Mohamed', party: 'Jubilee', ballotNumber: 1 },
      { name: 'Janet Njeri',  party: 'UDA',     ballotNumber: 2 },
    ]],
    [mcaLimuruWard.id, 'Limuru Ward MCA', limuruROToken, [
      { name: 'Joseph Kamau',  party: 'UDA',     ballotNumber: 1 },
      { name: 'Susan Wanjiru', party: 'Jubilee', ballotNumber: 2 },
    ]],
    [mcaKabeteWard.id, 'Kabete Ward MCA', kabeteROToken, [
      { name: 'Peter Njoroge', party: 'UDA', ballotNumber: 1 },
      { name: 'Grace Wamuyu',  party: 'ODM', ballotNumber: 2 },
    ]],
  ];

  for (const [posId, label, token, candidates] of mcaPositions) {
    for (const c of candidates) {
      await post(`/api/elections/positions/${posId}/candidates`, c, token);
    }
    console.log(`  ✓ ${label}: ${candidates.length} candidates`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  SETUP COMPLETE');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`\n  Election ID: ${electionId}`);
  console.log('\n  Ballot scoping (SAFE — UUID-based, no string matching):');
  console.log('    Voter at Westlands Primary School →');
  console.log('      wps1Node → westlandsWardNode → westlandsNode → nairobiNode → kenyaNode');
  console.log('      Gets: President + Gov Nairobi + Senator Nairobi + Women Rep Nairobi');
  console.log('            + MP Westlands + MCA Westlands Ward');
  console.log('    Voter at Ngara Primary (Starehe) →');
  console.log('      sps1Node → ngaraWardNode → stareheNode → nairobiNode → kenyaNode');
  console.log('      Gets: President + Gov Nairobi + Senator Nairobi + Women Rep Nairobi');
  console.log('            + MP Starehe + MCA Ngara Ward');
  console.log('    Voter in Kiambu (Kabete Primary) →');
  console.log('      kabetePrimaryNode → kabeteWardNode → kabeteNode → kiambuNode → kenyaNode');
  console.log('      Gets: President + Gov Kiambu + Senator Kiambu + Women Rep Kiambu');
  console.log('            + MP Kabete + MCA Kabete Ward');
  console.log('    DOES NOT get: Gov Nairobi, Westlands MP (different county/constituency branch)');
  console.log('\n  Jurisdiction hierarchy:');
  console.log('  Kenya (National) → National RO: John Mutunga');
  console.log('    ├── Nairobi County → County RO: Mary Wanjiku');
  console.log('    │   ├── Westlands Constituency → Constituency RO: Grace Achieng');
  console.log('    │   │   ├── Westlands Ward → Westlands Primary [NAI-WL-001 LINKED] + Kangemi Primary');
  console.log('    │   │   └── Parklands/Highridge Ward → Parklands Primary');
  console.log('    │   └── Starehe Constituency → Constituency RO: James Omondi');
  console.log('    │       ├── Ngara Ward → Ngara Primary');
  console.log('    │       └── Pangani Ward → Pangani Girls School');
  console.log('    └── Kiambu County → County RO: Peter Kamau');
  console.log('        ├── Limuru Constituency → Constituency RO: Sarah Wambua');
  console.log('        │   ├── Limuru Ward → Limuru Township Primary');
  console.log('        │   └── Ngecha Ward → Ngecha Primary School');
  console.log('        └── Kabete Constituency → Constituency RO: David Njoroge');
  console.log('            ├── Kabete Ward → Kabete Primary School');
  console.log('            └── Gitaru Ward → Gitaru Primary School');
  console.log('\n  Officer credentials: password = Officer@Iebc27');
  console.log('    National RO:         11111101');
  console.log('    Nairobi County RO:   11111102  |  Kiambu County RO:    11111103');
  console.log('    Westlands RO:        11111104  |  Starehe RO:          11111105');
  console.log('    Limuru RO:           11111106  |  Kabete RO:           11111107');
  console.log('    Presiding Officers:  11111108 – 11111115');
  console.log('\n  Status: DRAFT');
  console.log('  Next steps:');
  console.log('    1. Add remaining polling station codes to STATION_CODES and re-link');
  console.log('    2. PATCH /api/elections/:id/status → NOMINATIONS to open for candidates');
  console.log('    3. PATCH /api/elections/:id/status → ACTIVE to open voting');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\n✗ Setup failed:', err.message);
  process.exit(1);
});
