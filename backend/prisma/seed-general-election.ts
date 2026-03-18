/**
 * VeriVote Kenya — 2022 General Election Demo Seed
 *
 * Creates a "Kenya General Election 2022 (Demo)" election with:
 *   - Jurisdiction tree: Kenya → County → Constituency
 *   - Presidential candidates at root
 *   - Governor, Senator, Women Rep at county level
 *   - MP at constituency level
 *
 * Run from backend/:
 *   npx tsx prisma/seed-general-election.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jurisdictionModel = () => (prisma as any).electionJurisdiction;

async function createNode(
  electionId: string,
  name: string,
  parentId: string | null,
  depth: number,
  orderIndex: number,
) {
  return jurisdictionModel().create({
    data: { electionId, name, parentId, depth, orderIndex },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createPosition(
  electionId: string,
  jurisdictionId: string,
  title: string,
  scope: string,
  orderIndex: number,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma.position as any).create({
    data: { electionId, jurisdictionId, title, scope, orderIndex, maxVotesPerVoter: 1 },
  });
}

async function addCandidates(
  positionId: string,
  candidates: Array<{ name: string; party: string; ballotNumber: number }>,
) {
  for (const c of candidates) {
    await prisma.candidate.create({
      data: { positionId, name: c.name, party: c.party, ballotNumber: c.ballotNumber },
    });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Creating Kenya General Election 2022 (Demo)...');

  // ── 1. Create election ─────────────────────────────────────────────────────
  const election = await prisma.election.create({
    data: {
      name:        'Kenya General Election 2022 (Demo)',
      description: 'Demonstration of the 2022 Kenya General Election structure using the jurisdiction tree. Positions span National, County, and Constituency levels.',
      type:        'GOVERNMENT',
      orgName:     'Independent Electoral and Boundaries Commission (IEBC)',
      startDate:   new Date('2022-08-09T06:00:00Z'),
      endDate:     new Date('2022-08-09T17:00:00Z'),
      status:      'DRAFT',
    },
  });
  console.log(`  ✓ Election created: ${election.id}`);

  // ── 2. Root node: Kenya ────────────────────────────────────────────────────
  const kenya = await createNode(election.id, 'Kenya', null, 0, 0);
  console.log('  ✓ Root node: Kenya');

  // ── 3. Presidential position (at root) ────────────────────────────────────
  const presidentPos = await createPosition(election.id, kenya.id, 'President', 'NATIONAL', 0);
  await addCandidates(presidentPos.id, [
    { name: 'William Samoei Ruto',       party: 'United Democratic Alliance (UDA)',   ballotNumber: 1 },
    { name: 'Raila Amolo Odinga',         party: 'Orange Democratic Movement (ODM)',   ballotNumber: 2 },
    { name: 'George Luchiri Wajackoyah', party: 'Roots Party of Kenya',               ballotNumber: 3 },
    { name: 'David Mwaure Waihiga',      party: 'Agano Party',                        ballotNumber: 4 },
  ]);
  console.log('  ✓ President position + 4 candidates');

  // ── 4. County nodes + positions ───────────────────────────────────────────

  // ── Nairobi County ────────────────────────────────────────────────────────
  const nairobi = await createNode(election.id, 'Nairobi', kenya.id, 1, 0);

  const nbiGovernorPos = await createPosition(election.id, nairobi.id, 'Governor — Nairobi County', 'COUNTY', 0);
  await addCandidates(nbiGovernorPos.id, [
    { name: 'Johnson Arthur Sakaja',   party: 'United Democratic Alliance (UDA)',   ballotNumber: 1 },
    { name: 'Polycarp Igathe',         party: 'Jubilee Party',                      ballotNumber: 2 },
    { name: 'Agnes Kagure Waweru',     party: 'Independent',                        ballotNumber: 3 },
  ]);

  const nbiSenatorPos = await createPosition(election.id, nairobi.id, 'Senator — Nairobi County', 'COUNTY', 1);
  await addCandidates(nbiSenatorPos.id, [
    { name: 'Edwin Sifuna',    party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Tabitha Karanja', party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);

  const nbiWomenRepPos = await createPosition(election.id, nairobi.id, "Women's Representative — Nairobi County", 'COUNTY', 2);
  await addCandidates(nbiWomenRepPos.id, [
    { name: 'Esther Passaris',   party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Millicent Omanga',  party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);
  console.log('  ✓ Nairobi county positions (Governor, Senator, Women Rep)');

  // Nairobi constituencies
  const westlands = await createNode(election.id, 'Westlands', nairobi.id, 2, 0);
  const westlandsMpPos = await createPosition(election.id, westlands.id, 'Member of National Assembly — Westlands', 'CONSTITUENCY', 0);
  await addCandidates(westlandsMpPos.id, [
    { name: 'Tim Wanyonyi Waweru', party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Danson Muchoki',       party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
    { name: 'Sarah Korere',         party: 'Independent',                       ballotNumber: 3 },
  ]);

  const kasarani = await createNode(election.id, 'Kasarani', nairobi.id, 2, 1);
  const kasaraniMpPos = await createPosition(election.id, kasarani.id, 'Member of National Assembly — Kasarani', 'CONSTITUENCY', 0);
  await addCandidates(kasaraniMpPos.id, [
    { name: 'Ronald Karauri Kamau', party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Elizabeth Atieno',      party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
  ]);

  const langata = await createNode(election.id, 'Lang\'ata', nairobi.id, 2, 2);
  const langataMpPos = await createPosition(election.id, langata.id, "Member of National Assembly — Lang'ata", 'CONSTITUENCY', 0);
  await addCandidates(langataMpPos.id, [
    { name: 'Felix Odiwuor (Jalang\'o)', party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Rashid Echesa',              party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);

  console.log('  ✓ Nairobi constituencies (Westlands, Kasarani, Lang\'ata)');

  // ── Mombasa County ────────────────────────────────────────────────────────
  const mombasa = await createNode(election.id, 'Mombasa', kenya.id, 1, 1);

  const mbsGovernorPos = await createPosition(election.id, mombasa.id, 'Governor — Mombasa County', 'COUNTY', 0);
  await addCandidates(mbsGovernorPos.id, [
    { name: 'Abdulswamad Sherif Nassir', party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Hassan Omar Hassan',         party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);

  const mbsSenatorPos = await createPosition(election.id, mombasa.id, 'Senator — Mombasa County', 'COUNTY', 1);
  await addCandidates(mbsSenatorPos.id, [
    { name: 'Mohamed Faki Mwinyihaji', party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Anania Mwaboza',           party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);

  const mbsWomenRepPos = await createPosition(election.id, mombasa.id, "Women's Representative — Mombasa County", 'COUNTY', 2);
  await addCandidates(mbsWomenRepPos.id, [
    { name: 'Zamzam Saleh',  party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Saumu Mwero',   party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);
  console.log('  ✓ Mombasa county positions (Governor, Senator, Women Rep)');

  const mvita = await createNode(election.id, 'Mvita', mombasa.id, 2, 0);
  const mvitaMpPos = await createPosition(election.id, mvita.id, 'Member of National Assembly — Mvita', 'CONSTITUENCY', 0);
  await addCandidates(mvitaMpPos.id, [
    { name: 'Aisha Jumwa',     party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Ali Mbogo',       party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
  ]);

  const kisauni = await createNode(election.id, 'Kisauni', mombasa.id, 2, 1);
  const kisauniMpPos = await createPosition(election.id, kisauni.id, 'Member of National Assembly — Kisauni', 'CONSTITUENCY', 0);
  await addCandidates(kisauniMpPos.id, [
    { name: 'Hamisi Mbarak Ong\'olo', party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Ali Jirani',               party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);
  console.log('  ✓ Mombasa constituencies (Mvita, Kisauni)');

  // ── Kisumu County ──────────────────────────────────────────────────────────
  const kisumu = await createNode(election.id, 'Kisumu', kenya.id, 1, 2);

  const ksmGovernorPos = await createPosition(election.id, kisumu.id, 'Governor — Kisumu County', 'COUNTY', 0);
  await addCandidates(ksmGovernorPos.id, [
    { name: 'Anyang\' Nyong\'o', party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Fred Outa',          party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);

  const ksmSenatorPos = await createPosition(election.id, kisumu.id, 'Senator — Kisumu County', 'COUNTY', 1);
  await addCandidates(ksmSenatorPos.id, [
    { name: 'Tom Ojienda',      party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Edwins Otieno',    party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);

  const ksmWomenRepPos = await createPosition(election.id, kisumu.id, "Women's Representative — Kisumu County", 'COUNTY', 2);
  await addCandidates(ksmWomenRepPos.id, [
    { name: 'Rosa Buyu',       party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Asenath Wacera', party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);
  console.log('  ✓ Kisumu county positions (Governor, Senator, Women Rep)');

  const kisumuc = await createNode(election.id, 'Kisumu Central', kisumu.id, 2, 0);
  const kisumucMpPos = await createPosition(election.id, kisumuc.id, 'Member of National Assembly — Kisumu Central', 'CONSTITUENCY', 0);
  await addCandidates(kisumucMpPos.id, [
    { name: 'Joshua Otieno Oron',  party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Samuel Atandi',        party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);

  const kibos = await createNode(election.id, 'Kisumu East', kisumu.id, 2, 1);
  const kibosMpPos = await createPosition(election.id, kibos.id, 'Member of National Assembly — Kisumu East', 'CONSTITUENCY', 0);
  await addCandidates(kibosMpPos.id, [
    { name: 'Shakeel Shabbir',   party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Charles Oluoch',    party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);
  console.log('  ✓ Kisumu constituencies (Kisumu Central, Kisumu East)');

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n✅ Done! Election created successfully.');
  console.log(`   Election ID : ${election.id}`);
  console.log('   Tree        : Kenya → Nairobi / Mombasa / Kisumu → Constituencies');
  console.log('   Positions   : President (root) + Governor/Senator/Women Rep (county) + MP (constituency)');
  console.log('\n   Jurisdiction node names match polling station fields:');
  console.log('   • "Nairobi"  → voter.pollingStation.county === "Nairobi"');
  console.log('   • "Westlands" → voter.pollingStation.constituency === "Westlands"');
  console.log('\n   Visit: http://localhost:3001/admin/elections');
}

main()
  .catch((e) => { console.error('Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
