"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getSocket } from "@/lib/socket";

interface ExplorerRow {
  serial: string;
  status: string;
  timestamp: string;
  txHash: string | null;
  blockNumber: number | null;
  isDistressFlagged: boolean;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3005";

export default function ExplorerPage() {
  const [rows, setRows] = useState<ExplorerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchExplorer = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/stats/explorer`).then((r) => r.json());
      if (res.success) {
        setRows(res.data);
        setTotal(res.totalConfirmed);
        setLastUpdated(new Date());
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExplorer();

    const socket = getSocket();
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    // Refresh explorer list on each new vote
    socket.on("vote:update", () => fetchExplorer());

    const interval = setInterval(fetchExplorer, 15_000);
    return () => {
      clearInterval(interval);
      socket.off("vote:update");
      socket.off("connect");
      socket.off("disconnect");
    };
  }, [fetchExplorer]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gray-900 text-white py-4 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg">Blockchain Explorer</h1>
            <p className="text-gray-400 text-xs">Immutable vote audit trail — VeriVote Kenya</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
              <span className="text-xs text-gray-400">{connected ? "Live" : "Reconnecting"}</span>
            </div>
            <Link href="/" className="text-xs text-gray-400 hover:text-white">← Home</Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Summary bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Confirmed</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{total.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">On-chain</p>
            <p className="text-2xl font-black text-green-700 mt-1">
              {rows.filter((r) => r.txHash).length} / {rows.length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Showing</p>
            <p className="text-2xl font-black text-blue-700 mt-1">Latest {rows.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Last Refreshed</p>
            <p className="text-sm font-semibold text-gray-700 mt-2">
              {lastUpdated
                ? lastUpdated.toLocaleTimeString("en-KE")
                : "—"}
            </p>
          </div>
        </div>

        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
          <strong>How this works:</strong> Every vote cast is encrypted with ElGamal, hashed with
          SHA-256, and anchored on the Ethereum blockchain. The TX hash below links directly to the
          on-chain record. Anyone can verify any serial using the{" "}
          <Link href="/verify" className="underline font-medium">Verify page</Link>.
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-500">
            No confirmed votes yet. Cast a vote first and the record will appear here.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-900 text-white text-xs">
                    <th className="text-left px-4 py-3 font-semibold">Serial Number</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Timestamp</th>
                    <th className="text-left px-4 py-3 font-semibold">TX Hash</th>
                    <th className="text-left px-4 py-3 font-semibold">Block</th>
                    <th className="text-left px-4 py-3 font-semibold">Verify</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.serial}
                      className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900">
                        {row.serial}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {new Date(row.timestamp).toLocaleString("en-KE", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {row.txHash ? (
                          <span title={row.txHash}>
                            {row.txHash.slice(0, 10)}…{row.txHash.slice(-6)}
                          </span>
                        ) : (
                          <span className="text-gray-300 italic">pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {row.blockNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/verify?serial=${row.serial}`}
                          className="text-xs font-medium text-blue-600 hover:underline"
                        >
                          Verify →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    CONFIRMED: "bg-green-100 text-green-800",
    PENDING: "bg-yellow-100 text-yellow-800",
    SUPERSEDED: "bg-gray-100 text-gray-600",
    INVALIDATED: "bg-red-100 text-red-800",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}
