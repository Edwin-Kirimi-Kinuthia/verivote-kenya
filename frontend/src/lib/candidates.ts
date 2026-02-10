import type { Candidate, BallotPosition } from "./types";

const presidentialCandidates: Candidate[] = [
  {
    id: "pres-1",
    name: "Amina Wanjiku",
    party: "National Unity Alliance",
    partyAbbreviation: "NUA",
    photoPlaceholder: "#15803d",
    position: "president",
  },
  {
    id: "pres-2",
    name: "James Ochieng",
    party: "Democratic Progress Party",
    partyAbbreviation: "DPP",
    photoPlaceholder: "#1d4ed8",
    position: "president",
  },
  {
    id: "pres-3",
    name: "Fatuma Hassan",
    party: "Kenya First Movement",
    partyAbbreviation: "KFM",
    photoPlaceholder: "#b91c1c",
    position: "president",
  },
  {
    id: "pres-4",
    name: "Peter Kamau",
    party: "People's Reform Coalition",
    partyAbbreviation: "PRC",
    photoPlaceholder: "#7c3aed",
    position: "president",
  },
];

const governorCandidates: Candidate[] = [
  {
    id: "gov-1",
    name: "Grace Muthoni",
    party: "National Unity Alliance",
    partyAbbreviation: "NUA",
    photoPlaceholder: "#15803d",
    position: "governor",
  },
  {
    id: "gov-2",
    name: "David Kiprop",
    party: "Democratic Progress Party",
    partyAbbreviation: "DPP",
    photoPlaceholder: "#1d4ed8",
    position: "governor",
  },
  {
    id: "gov-3",
    name: "Sarah Akinyi",
    party: "Kenya First Movement",
    partyAbbreviation: "KFM",
    photoPlaceholder: "#b91c1c",
    position: "governor",
  },
];

export const ballotPositions: BallotPosition[] = [
  {
    id: "president",
    title: "President",
    titleKey: "ballot.position.president",
    candidates: presidentialCandidates,
  },
  {
    id: "governor",
    title: "Governor",
    titleKey: "ballot.position.governor",
    candidates: governorCandidates,
  },
];

export function getCandidateById(id: string): Candidate | undefined {
  for (const position of ballotPositions) {
    const candidate = position.candidates.find((c) => c.id === id);
    if (candidate) return candidate;
  }
  return undefined;
}

export function getPositionById(id: string): BallotPosition | undefined {
  return ballotPositions.find((p) => p.id === id);
}
