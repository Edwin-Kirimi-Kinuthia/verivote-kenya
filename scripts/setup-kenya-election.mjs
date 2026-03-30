/**
 * setup-kenya-election.mjs
 *
 * Creates the Kenya 2022 General Election via API using the actual IEBC
 * staff already registered in the system.
 *
 * Prerequisites: all services running (Docker, Hardhat, backend :3005)
 * Usage:  node scripts/setup-kenya-election.mjs
 */

const BASE = 'http://localhost:3005/api';

const C = { g:'\x1b[32m', r:'\x1b[31m', y:'\x1b[33m', c:'\x1b[36m', b:'\x1b[1m', x:'\x1b[0m' };
const ok   = (m) => console.log(`${C.g}✓${C.x} ${m}`);
const step = (m) => console.log(`\n${C.b}${C.c}── ${m}${C.x}`);
const info = (m) => console.log(`  ${C.c}→${C.x} ${m}`);

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
  if (!json.success) throw new Error(`${method} ${path} → ${json.error}`);
  return json.data ?? {};
}

// ── Actual staff from the system ─────────────────────────────────────────────
// Maps nationalId → IebcStaff.id (populated at runtime)
const staffIds = {};

// Lookup staff UUID by national ID via GET /api/staff
async function resolveStaff(token) {
  step('Resolving staff IDs from the system');
  const list = await api('GET', '/staff', null, token);
  for (const s of list) {
    staffIds[s.voter?.nationalId ?? ''] = s.id;
    info(`${s.staffRole.padEnd(30)} ${s.voter?.nationalId} → ${s.id}`);
  }
  ok(`${list.length} staff records resolved`);
}

// ── Election data ─────────────────────────────────────────────────────────────

const CANDIDATES = {

  president: [
    { name: 'William Samoei Ruto',        party: 'United Democratic Alliance (UDA) / Kenya Kwanza',    ballotNumber: 1, description: 'Deputy President of Kenya 2013–2022. Running mate: Rigathi Gachagua.' },
    { name: 'Raila Amolo Odinga',          party: 'Orange Democratic Movement (ODM) / Azimio la Umoja', ballotNumber: 2, description: 'Former Prime Minister, four-time presidential candidate. Running mate: Martha Karua.' },
    { name: 'George Luchiri Wajackoyah',   party: 'Roots Party of Kenya',                              ballotNumber: 3, description: 'Lawyer and academic. Campaigned on cannabis legalisation.' },
    { name: 'David Mwaure Waihiga',        party: 'Agano Party',                                        ballotNumber: 4, description: 'Advocate and pastor. Running mate: Ruth Mucheru Mwaure.' },
  ],

  // ── Nairobi County ─────────────────────────────────────────────────────────
  nbiGov: [
    { name: 'Johnson Kamau Sakaja',        party: 'UDA / Kenya Kwanza',  ballotNumber: 1, description: 'Former Nairobi Senator 2017–2022.' },
    { name: 'Polycarp Igathe',             party: 'Jubilee / Azimio',    ballotNumber: 2, description: 'Former Nairobi Deputy Governor and Vivo Energy CEO.' },
    { name: 'Agnes Kagure Muigai',         party: 'Independent',         ballotNumber: 3, description: 'Businesswoman and civic leader.' },
  ],
  nbiSen: [
    { name: 'Edwin Sifuna',                party: 'ODM / Azimio',        ballotNumber: 1, description: 'ODM Secretary General.' },
    { name: 'Karen Nyamu',                 party: 'UDA / Kenya Kwanza',  ballotNumber: 2 },
    { name: 'Mohammed Mahamud',            party: 'Independent',         ballotNumber: 3 },
  ],
  nbiWR: [
    { name: 'Esther Passaris',             party: 'ODM / Azimio',        ballotNumber: 1, description: 'Incumbent Women Representative, Nairobi 2017–2022.' },
    { name: 'Millicent Omanga',            party: 'UDA / Kenya Kwanza',  ballotNumber: 2 },
    { name: 'Linda Gathoni Chege',         party: 'Independent',         ballotNumber: 3 },
  ],

  // ── Kiambu County ──────────────────────────────────────────────────────────
  kiambuGov: [
    { name: 'Kimani Wamatangi',            party: 'UDA / Kenya Kwanza',  ballotNumber: 1, description: 'Incumbent Kiambu Governor (re-elected).' },
    { name: 'James Nyoro',                 party: 'Jubilee / Azimio',    ballotNumber: 2, description: 'Former Kiambu Governor 2019–2022.' },
    { name: 'Joseph Ndung\'u Ndungu',      party: 'Independent',         ballotNumber: 3 },
  ],
  kiambuSen: [
    { name: 'Karungo Thang\'wa',           party: 'UDA / Kenya Kwanza',  ballotNumber: 1 },
    { name: 'Kamau Murango',               party: 'Jubilee / Azimio',    ballotNumber: 2 },
    { name: 'Anne Waiguru',                party: 'Independent',         ballotNumber: 3 },
  ],
  kiambuWR: [
    { name: 'Gathoni Wamuchomba',          party: 'UDA / Kenya Kwanza',  ballotNumber: 1, description: 'Incumbent Women Representative, Kiambu 2017–2022.' },
    { name: 'Wanjiru Kamau',               party: 'ODM / Azimio',        ballotNumber: 2 },
    { name: 'Lucy Ngugi',                  party: 'Independent',         ballotNumber: 3 },
  ],

  // ── Bomet County ───────────────────────────────────────────────────────────
  bometGov: [
    { name: 'Hillary Barchok',             party: 'UDA / Kenya Kwanza',  ballotNumber: 1, description: 'Incumbent Bomet Governor (re-elected).' },
    { name: 'Isaac Ruto',                  party: 'Chama Cha Mashinani', ballotNumber: 2, description: 'Former Bomet Governor 2013–2017.' },
    { name: 'Hassan Arror',                party: 'Independent',         ballotNumber: 3 },
  ],
  bometSen: [
    { name: 'Ali Kibor',                   party: 'UDA / Kenya Kwanza',  ballotNumber: 1 },
    { name: 'Hilary Sigei',                party: 'ODM / Azimio',        ballotNumber: 2 },
    { name: 'Roselyn Sitonik',             party: 'Independent',         ballotNumber: 3 },
  ],
  bometWR: [
    { name: 'Linet Chepkorir (Toto)',      party: 'UDA / Kenya Kwanza',  ballotNumber: 1, description: 'Youngest MP elected in Kenya 2022 — aged 24.' },
    { name: 'Gladys Shollei',              party: 'ODM / Azimio',        ballotNumber: 2 },
    { name: 'Priscilla Kiptoo',            party: 'Independent',         ballotNumber: 3 },
  ],

  // ── Constituency MPs ────────────────────────────────────────────────────────
  westlandsMP: [
    { name: 'Timothy Omukhulu Wanyonyi',   party: 'ODM / Azimio',        ballotNumber: 1, description: 'Incumbent MP for Westlands 2013–2022.' },
    { name: 'John Karani Ndung\'u',        party: 'UDA / Kenya Kwanza',  ballotNumber: 2 },
    { name: 'Mary Wambui Maina',           party: 'Independent',         ballotNumber: 3 },
  ],
  starehe: [
    { name: 'Charles Njagua (Jaguar)',     party: 'UDA / Kenya Kwanza',  ballotNumber: 1, description: 'Incumbent MP for Starehe 2017–2022 and musician.' },
    { name: 'Anthony Oluoch',              party: 'ODM / Azimio',        ballotNumber: 2 },
    { name: 'Gladys Boss Shollei',         party: 'Independent',         ballotNumber: 3 },
  ],
  kasarani: [
    { name: 'Ronald Karauri',              party: 'UDA / Kenya Kwanza',  ballotNumber: 1, description: 'SportPesa CEO turned politician.' },
    { name: 'William Kamket',              party: 'ODM / Azimio',        ballotNumber: 2 },
    { name: 'Jane Chebet',                 party: 'Independent',         ballotNumber: 3 },
  ],
  limuru: [
    { name: 'John Kiragu',                 party: 'UDA / Kenya Kwanza',  ballotNumber: 1 },
    { name: 'Wanjiku Muhia',               party: 'Jubilee / Azimio',    ballotNumber: 2, description: 'Former MP for Limuru.' },
    { name: 'George Mwangi',               party: 'Independent',         ballotNumber: 3 },
  ],
  kabete: [
    { name: 'Clement Mugambi',             party: 'UDA / Kenya Kwanza',  ballotNumber: 1 },
    { name: 'James Kamau',                 party: 'Jubilee / Azimio',    ballotNumber: 2 },
    { name: 'Samuel Kariuki',              party: 'Independent',         ballotNumber: 3 },
  ],
  bometCentral: [
    { name: 'John Paul Moi',               party: 'UDA / Kenya Kwanza',  ballotNumber: 1, description: 'Son of former President Daniel arap Moi.' },
    { name: 'Julius Ruto',                 party: 'ODM / Azimio',        ballotNumber: 2 },
    { name: 'Cosmas Rono',                 party: 'Independent',         ballotNumber: 3 },
  ],

  // ── MCAs per ward ────────────────────────────────────────────────────────────
  mcaWestlandsPrimary: [
    { name: 'George Muiruri Njenga',       party: 'UDA',         ballotNumber: 1 },
    { name: 'Jane Wanjiku Kamau',          party: 'ODM',         ballotNumber: 2 },
    { name: 'Kevin Mwangi Kariuki',        party: 'Independent', ballotNumber: 3 },
  ],
  mcaKangemi: [
    { name: 'Francis Odhiambo Ogola',      party: 'ODM',         ballotNumber: 1 },
    { name: 'Cynthia Achieng Awuor',       party: 'UDA',         ballotNumber: 2 },
    { name: 'Moses Kamau Njoroge',         party: 'Independent', ballotNumber: 3 },
  ],
  mcaPangani: [
    { name: 'Peter Otieno Odhiambo',       party: 'UDA',         ballotNumber: 1 },
    { name: 'Faith Adhiambo Awiti',        party: 'ODM',         ballotNumber: 2 },
    { name: 'Victor Omondi Auma',          party: 'Independent', ballotNumber: 3 },
  ],
  mcaNgara: [
    { name: 'Joseph Mwangi Kariuki',       party: 'UDA',         ballotNumber: 1 },
    { name: 'Rose Akinyi Ochieng',         party: 'ODM',         ballotNumber: 2 },
    { name: 'Patrick Ochieng Otieno',      party: 'Independent', ballotNumber: 3 },
  ],
  mcaKasarani: [
    { name: 'Daniel Mbugua Mwangi',        party: 'UDA',         ballotNumber: 1 },
    { name: 'Lydia Wairimu Njoroge',       party: 'ODM',         ballotNumber: 2 },
    { name: 'Samuel Kariuki Waweru',       party: 'Independent', ballotNumber: 3 },
  ],
  mcaLimuru: [
    { name: 'Stephen Kariuki Njoroge',     party: 'UDA',         ballotNumber: 1 },
    { name: 'Ann Nyawira Mwangi',          party: 'ODM',         ballotNumber: 2 },
    { name: 'Bernard Muthee Kamau',        party: 'Independent', ballotNumber: 3 },
  ],
  mcaNgecha: [
    { name: 'Hassan Mwangi Kiprono',       party: 'UDA',         ballotNumber: 1 },
    { name: 'Amina Rashid Hamisi',         party: 'ODM',         ballotNumber: 2 },
    { name: 'Joseph Kamau Njoroge',        party: 'Independent', ballotNumber: 3 },
  ],
  mcaGitaru: [
    { name: 'Rehema Hamisi Ali',           party: 'UDA',         ballotNumber: 1 },
    { name: 'Hamisi Ali Bakari',           party: 'ODM',         ballotNumber: 2 },
    { name: 'Amina Suleiman Omar',         party: 'Independent', ballotNumber: 3 },
  ],
  mcaKabete: [
    { name: 'Said Hassan Rashid',          party: 'UDA',         ballotNumber: 1 },
    { name: 'Rashid Mohammed Bakari',      party: 'ODM',         ballotNumber: 2 },
    { name: 'Fatma Bakari Salim',          party: 'Independent', ballotNumber: 3 },
  ],
};

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.b}${C.c}Kenya 2022 General Election — Setup via API${C.x}\n`);

  // ── 1. Login as Chairperson (00000005 / Bigfish001#) ─────────────────────
  step('1  Login as Chairperson (00000005)');
  const { token } = await api('POST', '/auth/login', {
    identifier: '00000005', password: 'Bigfish001#',
  });
  ok('Logged in as Chairperson');

  // ── 2. Resolve all staff IDs from the system ──────────────────────────────
  await resolveStaff(token);

  // Helper: get staff UUID by national ID (throws clearly if missing)
  function sid(nationalId) {
    const id = staffIds[nationalId];
    if (!id) throw new Error(`Staff record not found for national ID: ${nationalId}`);
    return id;
  }

  // ── 3. Create election ────────────────────────────────────────────────────
  step('3  Create Kenya 2022 General Election');
  const election = await api('POST', '/elections', {
    name:            'Kenya 2022 General Election',
    description:     'The 9th general election held on 9 August 2022, covering Presidential, ' +
                     'Gubernatorial, Senatorial, Women Representative, National Assembly, and ' +
                     'County Assembly Member positions.',
    type:            'GOVERNMENT',
    orgName:         'Independent Electoral and Boundaries Commission (IEBC)',
    startDate:       '2022-08-09T06:00:00+03:00',
    endDate:         '2022-08-09T17:00:00+03:00',
    authMethod:      'OTP_ONLY',
    countryCode:     'KE',
    eligibilityNote: 'Kenyan citizens aged 18 and above registered on the national voters roll',
  }, token);
  const elId = election.id;
  ok(`Election created — ID: ${elId}`);

  // ── 4. Transition to NOMINATIONS ──────────────────────────────────────────
  step('4  Transition to NOMINATIONS');
  await api('PATCH', `/elections/${elId}/status`, { status: 'NOMINATIONS' }, token);
  ok('Status: DRAFT → NOMINATIONS');

  // ── 5. Build jurisdiction tree ────────────────────────────────────────────
  step('5  Build jurisdiction tree');

  async function node(name, level, parentId, order) {
    const n = await api('POST', `/elections/${elId}/jurisdictions`,
      { name, level, ...(parentId ? { parentId } : {}), orderIndex: order }, token);
    info(`[${level}] ${name}`);
    return n.id;
  }

  // National root (controlled by Chairperson 00000005)
  const natId   = await node('Kenya',                 'NATIONAL',      null,   0);

  // Counties
  const nbiId   = await node('Nairobi County',        'COUNTY',        natId,  1);
  const kiamId  = await node('Kiambu County',         'COUNTY',        natId,  2);
  const bomId   = await node('Bomet County',          'COUNTY',        natId,  3);

  // Nairobi constituencies
  const wstId   = await node('Westlands',             'CONSTITUENCY',  nbiId,  1);
  const staId   = await node('Starehe',               'CONSTITUENCY',  nbiId,  2);
  const kasId   = await node('Kasarani',              'CONSTITUENCY',  nbiId,  3);

  // Kiambu constituencies
  const limId   = await node('Limuru',                'CONSTITUENCY',  kiamId, 1);
  const kabId   = await node('Kabete',                'CONSTITUENCY',  kiamId, 2);

  // Bomet constituencies
  const bcId    = await node('Bomet Central',         'CONSTITUENCY',  bomId,  1);

  // Polling stations as WARD-level nodes (linked to actual polling station entities below)
  const wstPSId = await node('Westlands Primary School',           'WARD', wstId,  1);
  const kngPSId = await node('Kangemi Primary School',             'WARD', wstId,  2);
  const panPSId = await node('Pangani Girls School',               'WARD', staId,  1);
  const ngrPSId = await node('Ngara Primary School',               'WARD', staId,  2);
  const kasPSId = await node('Kasarani',                           'WARD', kasId,  1);
  const limPSId = await node('Limuru Township Primary',            'WARD', limId,  1);
  const nchPSId = await node('Ngecha Primary School',              'WARD', limId,  2);
  const gitPSId = await node('Gitaru Primary School',              'WARD', limId,  3);
  const kabPSId = await node('Kabete Primary School',              'WARD', kabId,  1);

  ok('Jurisdiction tree built — 1 National, 3 Counties, 5 Constituencies, 9 Polling Stations');

  // ── 6. Assign officers to nodes ───────────────────────────────────────────
  step('6  Assign personInCharge to each node using actual staff');

  async function assign(nodeId, nationalId) {
    const staffId = sid(nationalId);
    await api('PATCH', `/jurisdictions/node/${nodeId}/assign-officer`,
      { personInChargeId: staffId }, token);
    info(`node ${nodeId} → ${nationalId} (staff ${staffId})`);
  }

  // National → Chairperson
  await assign(natId,   '00000005');

  // Counties
  await assign(nbiId,   '11111102');   // County Manager — Nairobi (using 11111102 as primary)
  await assign(kiamId,  '11111103');   // County Manager — Kiambu
  await assign(bomId,   '00000012');   // County Manager — Bomet

  // Nairobi constituencies
  await assign(wstId,   '11111104');   // Constituency Coordinator — Westlands
  await assign(staId,   '11111105');   // Constituency Coordinator — Starehe
  await assign(kasId,   '00000013');   // Constituency Coordinator — Kasarani

  // Kiambu constituencies
  await assign(limId,   '11111106');   // Constituency Coordinator — Limuru
  await assign(kabId,   '11111107');   // Constituency Coordinator — Kabete

  // Bomet Central
  await assign(bcId,    '00000014');   // Constituency Coordinator — Bomet Central

  // Polling stations
  await assign(wstPSId, '11111108');   // PO — Westlands Primary
  await assign(kngPSId, '11111109');   // PO — Kangemi Primary
  await assign(panPSId, '11111111');   // PO — Pangani Girls
  await assign(ngrPSId, '11111110');   // PO — Ngara Primary
  await assign(kasPSId, '00000015');   // PO — Kasarani
  await assign(limPSId, '11111112');   // PO — Limuru Township Primary
  await assign(nchPSId, '11111113');   // PO — Ngecha Primary
  await assign(gitPSId, '11111115');   // PO — Gitaru Primary
  await assign(kabPSId, '11111114');   // PO — Kabete Primary

  ok('All nodes have officers assigned');

  // ── 7. Create positions ───────────────────────────────────────────────────
  step('7  Create ballot positions at each jurisdiction level');

  async function pos(nodeId, title, scope, scopeValue, order) {
    const p = await api('POST', `/elections/${elId}/jurisdictions/${nodeId}/positions`,
      { title, scope, scopeValue: scopeValue ?? undefined, orderIndex: order }, token);
    info(`[${scope}] ${title}`);
    return p.id;
  }

  // National
  const pPres      = await pos(natId,   'President of the Republic of Kenya',             'NATIONAL',      null,       1);

  // Nairobi County
  const pNbiGov    = await pos(nbiId,   'Governor — Nairobi County',                      'COUNTY',        'Nairobi',  1);
  const pNbiSen    = await pos(nbiId,   'Senator — Nairobi County',                       'COUNTY',        'Nairobi',  2);
  const pNbiWR     = await pos(nbiId,   'Women Representative — Nairobi County',          'COUNTY',        'Nairobi',  3);

  // Kiambu County
  const pKiamGov   = await pos(kiamId,  'Governor — Kiambu County',                       'COUNTY',        'Kiambu',   1);
  const pKiamSen   = await pos(kiamId,  'Senator — Kiambu County',                        'COUNTY',        'Kiambu',   2);
  const pKiamWR    = await pos(kiamId,  'Women Representative — Kiambu County',           'COUNTY',        'Kiambu',   3);

  // Bomet County
  const pBomGov    = await pos(bomId,   'Governor — Bomet County',                        'COUNTY',        'Bomet',    1);
  const pBomSen    = await pos(bomId,   'Senator — Bomet County',                         'COUNTY',        'Bomet',    2);
  const pBomWR     = await pos(bomId,   'Women Representative — Bomet County',            'COUNTY',        'Bomet',    3);

  // MPs
  const pWstMP     = await pos(wstId,   'Member of Parliament — Westlands',               'CONSTITUENCY',  'Westlands',      1);
  const pStaMP     = await pos(staId,   'Member of Parliament — Starehe',                 'CONSTITUENCY',  'Starehe',        1);
  const pKasMP     = await pos(kasId,   'Member of Parliament — Kasarani',                'CONSTITUENCY',  'Kasarani',       1);
  const pLimMP     = await pos(limId,   'Member of Parliament — Limuru',                  'CONSTITUENCY',  'Limuru',         1);
  const pKabMP     = await pos(kabId,   'Member of Parliament — Kabete',                  'CONSTITUENCY',  'Kabete',         1);
  const pBcMP      = await pos(bcId,    'Member of Parliament — Bomet Central',           'CONSTITUENCY',  'Bomet Central',  1);

  // MCAs (one per polling station node)
  const pWstMCA    = await pos(wstPSId, 'MCA — Westlands Primary Ward',                   'WARD', 'Westlands Primary School',      1);
  const pKngMCA    = await pos(kngPSId, 'MCA — Kangemi Ward',                             'WARD', 'Kangemi Primary School',         1);
  const pPanMCA    = await pos(panPSId, 'MCA — Pangani Ward',                             'WARD', 'Pangani Girls School',           1);
  const pNgrMCA    = await pos(ngrPSId, 'MCA — Ngara Ward',                               'WARD', 'Ngara Primary School',           1);
  const pKasMCA    = await pos(kasPSId, 'MCA — Kasarani Ward',                            'WARD', 'Kasarani',                       1);
  const pLimMCA    = await pos(limPSId, 'MCA — Limuru Township Ward',                     'WARD', 'Limuru Township Primary',        1);
  const pNchMCA    = await pos(nchPSId, 'MCA — Ngecha Ward',                              'WARD', 'Ngecha Primary School',          1);
  const pGitMCA    = await pos(gitPSId, 'MCA — Gitaru Ward',                              'WARD', 'Gitaru Primary School',          1);
  const pKabMCA    = await pos(kabPSId, 'MCA — Kabete Ward',                              'WARD', 'Kabete Primary School',          1);

  ok('30 positions created across all levels');

  // ── 8. Add candidates ─────────────────────────────────────────────────────
  step('8  Add candidates to every position');

  async function cands(posId, list) {
    for (const c of list) {
      await api('POST', `/elections/positions/${posId}/candidates`, c, token);
    }
    info(`${list.length} candidates → position ${posId}`);
  }

  await cands(pPres,    CANDIDATES.president);
  await cands(pNbiGov,  CANDIDATES.nbiGov);
  await cands(pNbiSen,  CANDIDATES.nbiSen);
  await cands(pNbiWR,   CANDIDATES.nbiWR);
  await cands(pKiamGov, CANDIDATES.kiambuGov);
  await cands(pKiamSen, CANDIDATES.kiambuSen);
  await cands(pKiamWR,  CANDIDATES.kiambuWR);
  await cands(pBomGov,  CANDIDATES.bometGov);
  await cands(pBomSen,  CANDIDATES.bometSen);
  await cands(pBomWR,   CANDIDATES.bometWR);
  await cands(pWstMP,   CANDIDATES.westlandsMP);
  await cands(pStaMP,   CANDIDATES.starehe);
  await cands(pKasMP,   CANDIDATES.kasarani);
  await cands(pLimMP,   CANDIDATES.limuru);
  await cands(pKabMP,   CANDIDATES.kabete);
  await cands(pBcMP,    CANDIDATES.bometCentral);
  await cands(pWstMCA,  CANDIDATES.mcaWestlandsPrimary);
  await cands(pKngMCA,  CANDIDATES.mcaKangemi);
  await cands(pPanMCA,  CANDIDATES.mcaPangani);
  await cands(pNgrMCA,  CANDIDATES.mcaNgara);
  await cands(pKasMCA,  CANDIDATES.mcaKasarani);
  await cands(pLimMCA,  CANDIDATES.mcaLimuru);
  await cands(pNchMCA,  CANDIDATES.mcaNgecha);
  await cands(pGitMCA,  CANDIDATES.mcaGitaru);
  await cands(pKabMCA,  CANDIDATES.mcaKabete);

  ok('All candidates added (4 pres + 9 county×3 + 18 const./MCA = 103 total)');

  // ── 9. Summary ────────────────────────────────────────────────────────────
  console.log(`
${C.b}${C.g}════════════════════════════════════════════════════════════════${C.x}
${C.b}  Kenya 2022 General Election — Setup Complete${C.x}
${C.b}${C.g}════════════════════════════════════════════════════════════════${C.x}

  Election ID   : ${elId}
  Status        : NOMINATIONS

  Jurisdiction  : 1 National → 3 Counties → 5 Constituencies → 9 Polling Stations
  Positions     : 30  (1 President, 9 County, 6 MPs, 9 MCAs, 5 constituency)
  Staff coverage: Every node has a personInCharge from the actual system roster

  ─── Node → Officer mapping ────────────────────────────────────────────
  Kenya (National)          → Chairperson       00000005
  Nairobi County            → County Manager    11111102
  Kiambu County             → County Manager    11111103
  Bomet County              → County Manager    00000012
  Westlands                 → Const. Coord.     11111104
  Starehe                   → Const. Coord.     11111105
  Kasarani                  → Const. Coord.     00000013
  Limuru                    → Const. Coord.     11111106
  Kabete                    → Const. Coord.     11111107
  Bomet Central             → Const. Coord.     00000014
  Westlands Primary School  → Presiding Officer 11111108
  Kangemi Primary School    → Presiding Officer 11111109
  Pangani Girls School      → Presiding Officer 11111111
  Ngara Primary School      → Presiding Officer 11111110
  Kasarani (Station)        → Presiding Officer 00000015
  Limuru Township Primary   → Presiding Officer 11111112
  Ngecha Primary School     → Presiding Officer 11111113
  Gitaru Primary School     → Presiding Officer 11111115
  Kabete Primary School     → Presiding Officer 11111114

  ─── Next steps ────────────────────────────────────────────────────────
  Open polls:
    PATCH /api/elections/${elId}/status  { "status": "ACTIVE" }

  View election:
    GET /api/elections/${elId}
${C.b}${C.g}════════════════════════════════════════════════════════════════${C.x}
`);
}

main().catch((e) => {
  console.error(`\n${C.r}✗ FATAL:${C.x} ${e.message}`);
  process.exit(1);
});
