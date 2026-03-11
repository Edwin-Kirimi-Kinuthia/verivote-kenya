"use client";

import { useState, useEffect, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3005";

interface MixNodeProof {
  nodeId: string;
  nodeLabel: string;
  inputCount: number;
  inputCommitment: string;
  outputCount: number;
  outputCommitment: string;
  proofHash: string;
  durationMs: number;
}

interface PublicProof {
  ceremonyId: string;
  completedAt: string;
  inputVoteCount: number;
  outputVoteCount: number;
  nodes: MixNodeProof[];
  finalCommitment: string;
}

// ── Animation helpers ─────────────────────────────────────────────────────────

const VOTE_COLORS = [
  "bg-red-400", "bg-blue-400", "bg-green-400", "bg-yellow-400",
  "bg-purple-400", "bg-pink-400", "bg-orange-400", "bg-teal-400",
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MixnetPublicPage() {
  const [proof, setProof] = useState<PublicProof | null>(null);
  const [proofAvailable, setProofAvailable] = useState<boolean | null>(null);

  // Animation state
  const [animStep, setAnimStep] = useState(0); // 0=idle 1=node1 2=node2 3=node3 4=done
  const [votes, setVotes] = useState([0, 1, 2, 3, 4, 5, 6, 7]);
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`${API}/api/mixnet/proof`)
      .then((r) => r.json())
      .then((data) => {
        if (data.available) {
          setProof(data.proof);
          setProofAvailable(true);
        } else {
          setProofAvailable(false);
        }
      })
      .catch(() => setProofAvailable(false));
  }, []);

  function startAnimation() {
    if (animating) return;
    setAnimating(true);
    setAnimStep(1);
    setVotes(shuffle([0, 1, 2, 3, 4, 5, 6, 7]));

    timerRef.current = setTimeout(() => {
      setAnimStep(2);
      setVotes(shuffle([0, 1, 2, 3, 4, 5, 6, 7]));

      timerRef.current = setTimeout(() => {
        setAnimStep(3);
        setVotes(shuffle([0, 1, 2, 3, 4, 5, 6, 7]));

        timerRef.current = setTimeout(() => {
          setAnimStep(4);
          setAnimating(false);
        }, 1200);
      }, 1200);
    }, 1200);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const stepLabels = ["", "Node Alpha — Nairobi HQ", "Node Beta — Mombasa", "Node Gamma — Kisumu"];
  const stepColors = ["", "text-blue-700", "text-purple-700", "text-green-700"];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-green-800 text-white px-6 py-3 flex items-center justify-between">
        <span className="font-bold tracking-wide">VeriVote Kenya</span>
        <div className="flex gap-6 text-sm">
          <a href="/" className="opacity-80 hover:opacity-100">Home</a>
          <a href="/explorer" className="opacity-80 hover:opacity-100">Explorer</a>
          <a href="/verify" className="opacity-80 hover:opacity-100">Verify</a>
          <a href="/mixnet" className="font-semibold">Mixnet</a>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-4 py-10 space-y-10">

        {/* Hero */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold text-gray-900">Vote Anonymisation — Mixnet</h1>
          <p className="text-gray-500 max-w-xl mx-auto">
            After you vote, your encrypted ballot passes through three independent mix nodes.
            Each node re-encrypts it with fresh randomness and shuffles all ballots randomly.
            The result: no one can tell which output ballot came from which voter.
          </p>
        </div>

        {/* Visual animation */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Live Shuffle Animation</h2>
            <button
              onClick={startAnimation}
              disabled={animating}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {animating ? "Mixing…" : "Run Animation"}
            </button>
          </div>

          {/* Status label */}
          <div className={`text-center text-sm font-semibold mb-4 min-h-5 transition-all ${stepColors[animStep] || "text-gray-400"}`}>
            {animStep === 0 && "Press Run to see the mixing process"}
            {animStep >= 1 && animStep <= 3 && `Processing through ${stepLabels[animStep]}…`}
            {animStep === 4 && "✓ Mix complete — vote order is now cryptographically randomised"}
          </div>

          {/* Vote boxes */}
          <div className="flex flex-wrap justify-center gap-2 py-2">
            {votes.map((v, i) => (
              <div
                key={`${animStep}-${v}-${i}`}
                className={`${VOTE_COLORS[v]} flex h-10 w-10 items-center justify-center rounded-lg text-white text-xs font-bold shadow transition-all duration-500`}
                style={{ transform: animating ? `translateY(${(i % 2) * -4}px)` : "none" }}
              >
                {String.fromCharCode(65 + v)}
              </div>
            ))}
          </div>

          {/* Node progress dots */}
          <div className="mt-4 flex justify-center gap-4">
            {["Alpha", "Beta", "Gamma"].map((name, i) => (
              <div key={name} className="flex items-center gap-1.5 text-xs">
                <div className={`h-2.5 w-2.5 rounded-full transition-colors duration-500 ${
                  animStep > i ? "bg-green-500" : animStep === i + 1 ? "bg-blue-400 animate-pulse" : "bg-gray-200"
                }`} />
                <span className={animStep > i ? "text-gray-700" : "text-gray-400"}>
                  {name} {animStep > i ? "✓" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* The math */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">The Cryptography</h2>

          <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm text-green-300 space-y-1">
            <div className="text-gray-500 text-xs mb-2"># ElGamal Re-encryption</div>
            <div>Given: ciphertext (c1, c2) = (g^r, m·h^r)</div>
            <div>Fresh randomness: r' (new per ciphertext per node)</div>
            <div className="pt-1">
              <span className="text-yellow-300">c1&apos;</span> = c1 · g^r&apos; mod p
            </div>
            <div>
              <span className="text-yellow-300">c2&apos;</span> = c2 · h^r&apos; mod p
            </div>
            <div className="pt-1 text-gray-400 text-xs"># Verification: same private key decrypts</div>
            <div>decrypt(c1&apos;, c2&apos;) = c2&apos; · (c1&apos;^x)^-1 = m ✓</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
              <p className="font-semibold text-blue-800 mb-1">Re-encryption</p>
              <p className="text-blue-700 text-xs">
                Each vote gets new random numbers added. The ciphertext looks completely different
                but decrypts to the exact same vote.
              </p>
            </div>
            <div className="rounded-lg bg-purple-50 border border-purple-200 p-3">
              <p className="font-semibold text-purple-800 mb-1">Shuffling</p>
              <p className="text-purple-700 text-xs">
                After re-encryption, the entire batch is randomly reordered using
                cryptographically random permutations (Fisher-Yates).
              </p>
            </div>
            <div className="rounded-lg bg-green-50 border border-green-200 p-3">
              <p className="font-semibold text-green-800 mb-1">3 Independent Nodes</p>
              <p className="text-green-700 text-xs">
                Three separate nodes each apply their own re-encryption and shuffle.
                No single node knows the full mapping from input to output.
              </p>
            </div>
          </div>
        </div>

        {/* What gets proved */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-3">
          <h2 className="font-semibold text-gray-800">What the Proof Guarantees</h2>
          <div className="space-y-2">
            {[
              ["Count integrity", "Output count = Input count — no votes added or removed"],
              ["Re-encryption correctness", "Each output decrypts to a valid vote with the IEBC key"],
              ["Shuffle auditability", "Each node commits to its input and output via SHA-256 before anyone can verify"],
              ["Sovereignty", "All operations on IEBC infrastructure — no foreign servers"],
            ].map(([title, desc]) => (
              <div key={title} className="flex gap-3 items-start">
                <span className="mt-0.5 text-green-600 font-bold">✓</span>
                <div>
                  <span className="text-sm font-semibold text-gray-800">{title}: </span>
                  <span className="text-sm text-gray-600">{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live proof commitments */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Live Cryptographic Proof</h2>
          <p className="text-sm text-gray-500">
            These are the real SHA-256 commitments from the last mixnet ceremony run on this election.
          </p>

          {proofAvailable === null && (
            <p className="text-sm text-gray-400 animate-pulse">Loading…</p>
          )}

          {proofAvailable === false && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-center text-sm text-gray-500">
              The mixnet ceremony has not been run yet for this election.
              <br />
              Proof commitments will appear here after the IEBC administrator runs the ceremony.
            </div>
          )}

          {proofAvailable && proof && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                  <p className="text-xl font-bold text-gray-900">{proof.inputVoteCount}</p>
                  <p className="text-xs text-gray-500 mt-1">Votes in</p>
                </div>
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                  <p className="text-xl font-bold text-gray-900">{proof.nodes.length}</p>
                  <p className="text-xs text-gray-500 mt-1">Mix nodes</p>
                </div>
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                  <p className="text-xl font-bold text-gray-900">{proof.outputVoteCount}</p>
                  <p className="text-xs text-gray-500 mt-1">Votes out</p>
                </div>
              </div>

              {proof.nodes.map((node, i) => {
                const bg = ["bg-blue-50 border-blue-200", "bg-purple-50 border-purple-200", "bg-green-50 border-green-200"][i];
                const label = ["text-blue-800", "text-purple-800", "text-green-800"][i];
                return (
                  <div key={node.nodeId} className={`rounded-lg border ${bg} p-4`}>
                    <p className={`text-sm font-semibold ${label} mb-2`}>{node.nodeLabel}</p>
                    <div className="space-y-1 font-mono text-xs text-gray-700">
                      <div>
                        <span className="text-gray-400">in  </span>
                        <span className="break-all">{node.inputCommitment}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">out </span>
                        <span className="break-all">{node.outputCommitment}</span>
                      </div>
                      <div className="pt-1 border-t border-gray-200">
                        <span className="text-gray-400">prf </span>
                        <span className="font-bold break-all">{node.proofHash}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="rounded-lg bg-gray-900 p-4 text-white">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
                  Final Ceremony Commitment
                </p>
                <p className="font-mono text-sm text-green-400 break-all">
                  {proof.finalCommitment}
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Ceremony {proof.ceremonyId.slice(0, 8)}… &nbsp;·&nbsp;{" "}
                  {new Date(proof.completedAt).toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Production note */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          <p className="font-semibold mb-1">Production deployment</p>
          <p>
            In full deployment, each of the three mix nodes is operated by an independent IEBC
            official on a separate machine. No single person can see the complete vote-to-position
            mapping because each node only knows its own input and output — not the mappings of
            the other two nodes. This MVP runs all nodes in one process to demonstrate the
            cryptography; the architecture is designed for multi-party operation.
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 pb-4">
          VeriVote Kenya · NIRU Hackathon · Zero foreign API dependencies
        </p>
      </div>
    </div>
  );
}
