"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { getSocket } from "@/lib/socket";

interface CountyStat {
  county: string;
  stations: number;
  voters: number;
  votes: number;
  turnout: number;
}

interface HourlyPoint {
  hour: string;
  count: number;
}

interface SystemHealth {
  database: string;
  blockchain: string;
}

interface LiveStats {
  totalVotes: number;
  totalVoters: number;
  turnout: number;
  registered: number;
}

interface PublicElection {
  id: string;
  name: string;
  status: "NOMINATIONS" | "ACTIVE" | "CLOSED" | "TALLIED";
  type: string;
  endDate: string | null;
  _count: { votes: number };
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3005";

export default function Home() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [live, setLive] = useState<LiveStats | null>(null);
  const [county, setCounty] = useState<CountyStat[]>([]);
  const [hourly, setHourly] = useState<HourlyPoint[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [elections, setElections] = useState<PublicElection[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, turnoutRes, hourlyRes, healthRes, electionsRes] = await Promise.all([
        fetch(`${API}/api/stats`).then((r) => r.json()),
        fetch(`${API}/api/stats/turnout`).then((r) => r.json()),
        fetch(`${API}/api/stats/hourly`).then((r) => r.json()),
        fetch(`${API}/health`).then((r) => r.json()),
        fetch(`${API}/api/elections/public`).then((r) => r.json()),
      ]);

      if (statsRes.success) {
        setLive({
          totalVotes:
            (statsRes.data.voters.byStatus.voted ?? 0) +
            (statsRes.data.voters.byStatus.revoted ?? 0),
          totalVoters: statsRes.data.voters.total,
          turnout: statsRes.data.voters.turnoutPercentage,
          registered: statsRes.data.voters.byStatus.registered ?? 0,
        });
      }
      if (turnoutRes.success) {
        setCounty(
          [...(turnoutRes.data.byCounty as CountyStat[])]
            .sort((a, b) => b.votes - a.votes)
            .slice(0, 8)
        );
      }
      if (hourlyRes.success) {
        setHourly(
          (hourlyRes.data as { hour: string; count: number }[]).map((p) => ({
            hour: new Date(p.hour).toLocaleTimeString("en-KE", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            count: p.count,
          }))
        );
      }
      if (healthRes.status !== undefined) {
        setHealth({
          database: healthRes.database ?? "unknown",
          blockchain: healthRes.blockchain ?? "unknown",
        });
      }
      if (electionsRes.success && electionsRes.data) {
        // Show NOMINATIONS, ACTIVE, and TALLIED elections (not ARCHIVED/CLOSED)
        setElections(
          (electionsRes.data as PublicElection[]).filter(
            (e) => ["NOMINATIONS", "ACTIVE", "TALLIED"].includes(e.status)
          )
        );
      }
    } catch {
      // backend may not be running yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);
    fetchAll();

    const socket = getSocket();
    if (socket) {
      socket.on("connect", () => setConnected(true));
      socket.on("disconnect", () => setConnected(false));
      socket.on("vote:update", (data: { totalVotes: number; turnout: number }) => {
        setLive((prev) =>
          prev ? { ...prev, totalVotes: data.totalVotes, turnout: data.turnout } : prev
        );
      });
    }

    const interval = setInterval(fetchAll, 30_000);
    return () => {
      clearInterval(interval);
      if (socket) {
        socket.off("vote:update");
        socket.off("connect");
        socket.off("disconnect");
      }
    };
  }, [fetchAll]);

  const dot = (s: string) => (s === "connected" ? "bg-green-500" : "bg-red-500");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-green-800 text-white py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-white/20 flex items-center justify-center font-black text-lg">
              V
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">VeriVote Kenya</h1>
              <p className="text-green-200 text-xs">Public Election Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${connected ? "bg-green-300 animate-pulse" : "bg-gray-400"}`}
            />
            <span className="text-xs text-green-200">{connected ? "Live" : "Offline"}</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Nav cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <NavCard href="/elections" label="Elections" sub="Browse elections &amp; results" cls="border-green-200 hover:border-green-600 hover:bg-green-50" textCls="text-green-700" />
          <NavCard href="/vote" label="Vote" sub="Login to cast your ballot" cls="border-green-300 hover:border-green-700 hover:bg-green-50 bg-green-50" textCls="text-green-800" />
          <NavCard href="/verify" label="Verify Vote" sub="Check your receipt" cls="border-amber-200 hover:border-amber-600 hover:bg-amber-50" textCls="text-amber-700" />
          <NavCard href="/explorer" label="Explorer" sub="Blockchain audit trail" cls="border-purple-200 hover:border-purple-600 hover:bg-purple-50" textCls="text-purple-700" />
        </div>

        {/* Elections portal */}
        {elections.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="bg-green-800 text-white px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-sm">Elections Portal</h2>
                <p className="text-xs text-green-200 mt-0.5">Live elections and official results</p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/vote"
                  className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-400 transition-colors"
                >
                  Login to Vote
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-50 transition-colors"
                >
                  Register
                </Link>
                <Link href="/elections" className="text-xs text-green-200 hover:text-white underline underline-offset-2">
                  View all →
                </Link>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {elections.slice(0, 5).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => router.push(`/elections/${e.id}`)}
                  className="group w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      e.status === "ACTIVE"      ? "bg-green-100 text-green-800" :
                      e.status === "NOMINATIONS" ? "bg-yellow-100 text-yellow-800" :
                      e.status === "TALLIED"     ? "bg-blue-100 text-blue-800" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {e.status === "ACTIVE" ? "Live" :
                       e.status === "NOMINATIONS" ? "Nominations" :
                       e.status === "TALLIED" ? "Results" : e.status}
                    </span>
                    <span className="text-sm font-medium text-gray-900 group-hover:text-green-700 truncate">
                      {e.name}
                    </span>
                  </div>
                  <div className="shrink-0 flex items-center gap-3 text-xs text-gray-400">
                    {e._count.votes > 0 && (
                      <span>{e._count.votes.toLocaleString()} votes</span>
                    )}
                    <svg className="h-4 w-4 text-gray-300 group-hover:text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Live stat cards */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-gray-200 animate-pulse" />
            ))}
          </div>
        ) : live ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Votes Cast" value={live.totalVotes.toLocaleString()} colorClass="text-green-700 border-green-100" live={connected} />
            <StatCard label="Registered" value={live.totalVoters.toLocaleString()} colorClass="text-blue-700 border-blue-100" />
            <StatCard label="Approved" value={live.registered.toLocaleString()} colorClass="text-indigo-700 border-indigo-100" />
            <StatCard label="Turnout" value={`${live.turnout.toFixed(1)}%`} colorClass="text-amber-700 border-amber-100" live={connected} />
          </div>
        ) : null}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {isMounted && county.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-semibold text-gray-800 mb-4 text-sm">Turnout by County (Top 8)</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={county} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="county" tick={{ fontSize: 10 }} interval={0} angle={-28} textAnchor="end" height={46} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                  <Tooltip formatter={(v) => [`${v ?? 0}%`, "Turnout"]} />
                  <Bar dataKey="turnout" fill="#166534" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {isMounted && hourly.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-semibold text-gray-800 mb-4 text-sm">Votes Cast — Last 24 Hours</h2>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={hourly} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#1d4ed8" strokeWidth={2} dot={false} name="Votes" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* System health */}
        {health && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-800 mb-3 text-sm">System Status</h2>
            <div className="flex flex-wrap gap-6">
              {(["database", "blockchain"] as const).map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${dot(health[key])}`} />
                  <span className="text-sm text-gray-700 capitalize">{key}</span>
                  <span className="text-xs text-gray-400">{health[key]}</span>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
                <span className="text-sm text-gray-700">Real-time feed</span>
                <span className="text-xs text-gray-400">{connected ? "WebSocket active" : "reconnecting"}</span>
              </div>
            </div>
          </div>
        )}

        <div className="text-center text-xs text-gray-400 space-x-3 pb-4">
          <Link href="/admin" className="hover:text-gray-600">IEBC Admin Portal</Link>
          <span>·</span>
          <Link href="/elections" className="hover:text-gray-600">Elections</Link>
          <span>·</span>
          <Link href="/explorer" className="hover:text-gray-600">Blockchain Explorer</Link>
          <span>·</span>
          <Link href="/verify" className="hover:text-gray-600">Verify Vote</Link>
        </div>
      </main>
    </div>
  );
}

function NavCard({ href, label, sub, cls, textCls }: { href: string; label: string; sub: string; cls: string; textCls: string }) {
  return (
    <Link href={href} className={`flex flex-col items-center rounded-xl border-2 bg-white p-5 text-center shadow-sm transition-colors ${cls}`}>
      <span className={`text-base font-bold ${textCls}`}>{label}</span>
      <span className="mt-1 text-xs text-gray-500">{sub}</span>
    </Link>
  );
}

function StatCard({ label, value, colorClass, live }: { label: string; value: string; colorClass: string; live?: boolean }) {
  return (
    <div className={`rounded-xl bg-white border shadow-sm p-4 ${colorClass}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        {live && <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse mt-0.5" />}
      </div>
      <p className={`mt-2 text-2xl font-black`}>{value}</p>
    </div>
  );
}
