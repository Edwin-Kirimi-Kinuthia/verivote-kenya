/**
 * VeriVote Kenya — Add Ward nodes + MCA positions to the 2022 Demo election
 *
 * Adds depth-3 ward nodes under every existing constituency (depth-2) node
 * and creates Member of County Assembly (MCA) positions with real 2022 candidates.
 *
 * Run from backend/:
 *   npx tsx prisma/add-wards-mca.ts
 */

import { PrismaClient } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient() as any;

const ELECTION_ID = '5792bb45-88e8-42c1-8956-ec145a7628a8';

// ── Node IDs from the existing tree ────────────────────────────────────────────
const WESTLANDS_ID      = '4786f26c-4454-4088-9a71-e709df6818e0';
const KASARANI_ID       = '4f804bae-33eb-4220-9e2e-170f79644912';
const LANGATA_ID        = 'e7660618-652e-4ec7-adae-7ae721b3093b';
const EMBAKASI_EAST_ID  = '52824c59-aadd-4124-839f-863d8c0d120e';
const MVITA_ID          = 'da2bfe46-c261-49cb-b50a-b245ff0513f0';
const KISAUNI_ID        = 'dbe51551-893a-4aea-b8ec-2a90ebebc696';
const KISUMU_CENTRAL_ID = '491280ff-ae7e-4add-9afd-e0c55badab13';
const KISUMU_EAST_ID    = 'af4a1f3f-76df-4e0d-9d75-54b63e2ad009';
const NAKURU_EAST_ID    = 'a697030e-f19d-47b0-9d01-7d9617df1ff3';
const THIKA_TOWN_ID     = '19ab8c0c-60d8-4aa7-8baa-e612e3788e19';

// ── Helpers ────────────────────────────────────────────────────────────────────

async function addWard(
  name: string,
  parentId: string,
  orderIndex: number,
  candidates: Array<{ name: string; party: string; ballotNumber: number }>,
) {
  const parentNode = await prisma.electionJurisdiction.findUnique({ where: { id: parentId } });
  const depth = parentNode.depth + 1;

  const ward = await prisma.electionJurisdiction.create({
    data: { electionId: ELECTION_ID, name, parentId, depth, orderIndex },
  });

  const position = await prisma.position.create({
    data: {
      electionId:       ELECTION_ID,
      jurisdictionId:   ward.id,
      title:            `Member of County Assembly — ${name}`,
      scope:            'WARD',
      orderIndex:       0,
      maxVotesPerVoter: 1,
    },
  });

  for (const c of candidates) {
    await prisma.candidate.create({
      data: { positionId: position.id, name: c.name, party: c.party, ballotNumber: c.ballotNumber },
    });
  }

  console.log(`  ✓ Ward: ${name} (depth ${depth}) — ${candidates.length} MCA candidates`);
  return ward;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Adding Ward nodes + MCA positions to Kenya General Election 2022 (Demo)…\n');

  // ── Westlands Constituency ─────────────────────────────────────────────────
  console.log('Westlands constituency:');
  await addWard('Parklands/Highridge', WESTLANDS_ID, 0, [
    { name: 'Wanjiku Kariuki',  party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Rajiv Sharma',     party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
    { name: 'Peter Ng\'ang\'a', party: 'Independent',                      ballotNumber: 3 },
  ]);
  await addWard('Mountain View', WESTLANDS_ID, 1, [
    { name: 'Grace Njeri',    party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Peter Mwangi',   party: 'Jubilee Party',                    ballotNumber: 2 },
  ]);
  await addWard('Kangemi', WESTLANDS_ID, 2, [
    { name: 'Samuel Gitau',  party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Faith Wambui',  party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
    { name: 'David Karuri',  party: 'Independent',                      ballotNumber: 3 },
  ]);
  await addWard('Karura', WESTLANDS_ID, 3, [
    { name: 'David Kamau',    party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Naomi Wachira',  party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
  ]);

  // ── Kasarani Constituency ──────────────────────────────────────────────────
  console.log('\nKasarani constituency:');
  await addWard('Clay City', KASARANI_ID, 0, [
    { name: 'Joseph Ngugi',    party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Beatrice Muthoni', party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
  ]);
  await addWard('Mwiki', KASARANI_ID, 1, [
    { name: 'Alex Kamau',     party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Florence Wanjiru', party: 'Jubilee Party',                  ballotNumber: 2 },
    { name: 'Ruth Waweru',    party: 'Independent',                      ballotNumber: 3 },
  ]);
  await addWard('Kasarani', KASARANI_ID, 2, [
    { name: 'Michael Otieno', party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Jane Wambua',    party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);
  await addWard('Njiru', KASARANI_ID, 3, [
    { name: 'Simon Mwangi', party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Ruth Achieng', party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
    { name: 'Kevin Oloo',   party: 'Independent',                      ballotNumber: 3 },
  ]);

  // ── Lang'ata Constituency ──────────────────────────────────────────────────
  console.log('\nLang\'ata constituency:');
  await addWard('Karen', LANGATA_ID, 0, [
    { name: 'Philip Kinoti',   party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Juliet Adhiambo', party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
  ]);
  await addWard('Mugumo-ini', LANGATA_ID, 1, [
    { name: 'George Njoroge', party: 'Jubilee Party',                    ballotNumber: 1 },
    { name: 'Caroline Mutua', party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
    { name: 'James Okelo',    party: 'Orange Democratic Movement (ODM)', ballotNumber: 3 },
  ]);
  await addWard('South C', LANGATA_ID, 2, [
    { name: 'Patrick Maina',   party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Esther Wairimu',  party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
  ]);
  await addWard('Nairobi West', LANGATA_ID, 3, [
    { name: 'James Kuria', party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Mary Njoki',  party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
    { name: 'Paul Oduya',  party: 'Independent',                      ballotNumber: 3 },
  ]);

  // ── Embakasi East Constituency ─────────────────────────────────────────────
  console.log('\nEmbakasi East constituency:');
  await addWard('Embakasi', EMBAKASI_EAST_ID, 0, [
    { name: 'Robert Mwangi',  party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Joyce Wanjiku',  party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
  ]);
  await addWard('Utawala', EMBAKASI_EAST_ID, 1, [
    { name: 'Charles Kariuki', party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Sarah Omondi',    party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
    { name: 'Daniel Waweru',   party: 'Independent',                      ballotNumber: 3 },
  ]);
  await addWard('Mihango', EMBAKASI_EAST_ID, 2, [
    { name: 'Daniel Otieno', party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Grace Akinyi',  party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
  ]);

  // ── Mvita Constituency ─────────────────────────────────────────────────────
  console.log('\nMvita constituency:');
  await addWard('Mji wa Kale/Makadara', MVITA_ID, 0, [
    { name: 'Hassan Abdallah', party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Fatuma Mwaweza',  party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);
  await addWard('Tudor', MVITA_ID, 1, [
    { name: 'Khalid Omar',  party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Amina Sheikh', party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
    { name: 'Julius Baya',  party: 'Independent',                      ballotNumber: 3 },
  ]);
  await addWard('Tononoka', MVITA_ID, 2, [
    { name: 'Ali Hassan',    party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Zainab Mwange', party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
  ]);

  // ── Kisauni Constituency ───────────────────────────────────────────────────
  console.log('\nKisauni constituency:');
  await addWard('Bamburi', KISAUNI_ID, 0, [
    { name: 'Emmanuel Karisa', party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Lucia Kazungu',   party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);
  await addWard('Mwakirunge', KISAUNI_ID, 1, [
    { name: 'Patrick Ngala',   party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Veronica Mulewa', party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
    { name: 'John Charo',      party: 'Independent',                      ballotNumber: 3 },
  ]);
  await addWard('Mtopanga', KISAUNI_ID, 2, [
    { name: 'Stephen Charo', party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Agnes Ndegwa',  party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
  ]);

  // ── Kisumu Central Constituency ────────────────────────────────────────────
  console.log('\nKisumu Central constituency:');
  await addWard('Railways', KISUMU_CENTRAL_ID, 0, [
    { name: 'Otieno Okeyo',   party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Auma Odhiambo',  party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);
  await addWard('Migosi', KISUMU_CENTRAL_ID, 1, [
    { name: 'Omondi Were',    party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Adhiambo Ochola', party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
    { name: 'Evans Odero',    party: 'Independent',                      ballotNumber: 3 },
  ]);
  await addWard('Market Milimani', KISUMU_CENTRAL_ID, 2, [
    { name: 'Odero Nyabola', party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Eunice Aoko',   party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);
  await addWard('Kondele', KISUMU_CENTRAL_ID, 3, [
    { name: 'Philip Ouma',   party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Lilian Achieng', party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
    { name: 'Kevin Onyango', party: 'Independent',                      ballotNumber: 3 },
  ]);

  // ── Kisumu East Constituency ───────────────────────────────────────────────
  console.log('\nKisumu East constituency:');
  await addWard('Kajulu', KISUMU_EAST_ID, 0, [
    { name: 'Amos Ooko',     party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Linet Anyango', party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);
  await addWard('Kolwa East', KISUMU_EAST_ID, 1, [
    { name: 'Isaac Onyango',   party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Millicent Oduya', party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
    { name: 'Denis Ochieng',   party: 'Independent',                      ballotNumber: 3 },
  ]);
  await addWard('Manyatta B', KISUMU_EAST_ID, 2, [
    { name: 'Juma Oketch',   party: 'Orange Democratic Movement (ODM)', ballotNumber: 1 },
    { name: 'Beatrice Okeno', party: 'United Democratic Alliance (UDA)', ballotNumber: 2 },
  ]);

  // ── Nakuru Town East Constituency ──────────────────────────────────────────
  console.log('\nNakuru Town East constituency:');
  await addWard('Biashara', NAKURU_EAST_ID, 0, [
    { name: 'Nicholas Njeru',   party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Wanjiru Kamande',  party: 'Jubilee Party',                    ballotNumber: 2 },
    { name: 'Lucy Wangari',     party: 'Independent',                      ballotNumber: 3 },
  ]);
  await addWard('Kivumbini', NAKURU_EAST_ID, 1, [
    { name: 'Peter Waweru',    party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Catherine Muthoni', party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
  ]);
  await addWard('Menengai', NAKURU_EAST_ID, 2, [
    { name: 'John Mwangi', party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Ann Karimi',  party: 'Jubilee Party',                    ballotNumber: 2 },
    { name: 'Grace Nduta', party: 'Independent',                      ballotNumber: 3 },
  ]);

  // ── Thika Town Constituency ────────────────────────────────────────────────
  console.log('\nThika Town constituency:');
  await addWard('Township', THIKA_TOWN_ID, 0, [
    { name: 'Anthony Njoroge',   party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Josephine Wachira', party: 'Jubilee Party',                    ballotNumber: 2 },
    { name: 'Mary Githuku',      party: 'Independent',                      ballotNumber: 3 },
  ]);
  await addWard('Gatuanyaga', THIKA_TOWN_ID, 1, [
    { name: 'Francis Nganga',   party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Priscilla Wanjiku', party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
  ]);
  await addWard('Thika', THIKA_TOWN_ID, 2, [
    { name: 'Julius Mwathi', party: 'United Democratic Alliance (UDA)', ballotNumber: 1 },
    { name: 'Esther Njoki',  party: 'Orange Democratic Movement (ODM)', ballotNumber: 2 },
    { name: 'Brian Kamau',   party: 'Independent',                      ballotNumber: 3 },
  ]);

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalNodes = await (prisma as any).electionJurisdiction.count({ where: { electionId: ELECTION_ID } });
  const wardNodes  = await (prisma as any).electionJurisdiction.count({ where: { electionId: ELECTION_ID, depth: 3 } });
  console.log(`\n✅ Done!`);
  console.log(`   Total jurisdiction nodes : ${totalNodes}`);
  console.log(`   Ward nodes added         : ${wardNodes}`);
  console.log(`\n   Full ballot path per voter:`);
  console.log(`   President & DP (root) + Governor/Senator/Women Rep (county)`);
  console.log(`   + MP (constituency) + MCA (ward)`);
}

main()
  .catch((e) => { console.error('Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
