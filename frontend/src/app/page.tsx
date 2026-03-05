"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
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

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3005";

export default function Home() {
  const [live, setLive] = useState<LiveStats | null>(null);
  const [county, setCounty] = useState<CountyStat[]>([]);
  const [hourly, setHourly] = useState<HourlyPoint[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, turnoutRes, hourlyRes, healthRes] = await Promise.all([
        fetch(`${API}/api/stats`).then((r) => r.json()),
        fetch(`${API}/api/stats/turnout`).then((r) => r.json()),
        fetch(`${API}/api/stats/hourly`).then((r) => r.json()),
        fetch(`${API}/health`).then((r) => r.json()),
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
    } catch {
      // backend may not be running yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();

    const socket = getSocket();
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("vote:update", (data: { totalVotes: number; turnout: number }) => {
      setLive((prev) =>
        prev ? { ...prev, totalVotes: data.totalVotes, turnout: data.turnout } : prev
      );
    });

    const interval = setInterval(fetchAll, 30_000);
    return () => {
      clearInterval(interval);
      socket.off("vote:update");
      socket.off("connect");
      socket.off("disconnect");
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
          <NavCard href="/register" label="Register" sub="Create voter account" cls="border-green-200 hover:border-green-600 hover:bg-green-50" textCls="text-green-700" />
          <NavCard href="/vote" label="Vote" sub="Cast your ballot" cls="border-blue-200 hover:border-blue-600 hover:bg-blue-50" textCls="text-blue-700" />
          <NavCard href="/verify" label="Verify Vote" sub="Check your receipt" cls="border-amber-200 hover:border-amber-600 hover:bg-amber-50" textCls="text-amber-700" />
          <NavCard href="/explorer" label="Explorer" sub="Blockchain audit trail" cls="border-purple-200 hover:border-purple-600 hover:bg-purple-50" textCls="text-purple-700" />
        </div>

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
          {county.length > 0 && (
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

          {hourly.length > 0 && (
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
          <Link href="/explorer" className="hover:text-gray-600">Blockchain Explorer</Link>
          <span>·</span>
          <Link href="/verify" className="hover:text-gray-600">Verify Your Vote</Link>
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
