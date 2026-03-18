"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api-client";
import type { StaffRole } from "@/lib/types";

// ── Role metadata ─────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<StaffRole, string> = {
  CHAIRPERSON:                 "Chairperson",
  COMMISSIONER:                "Commissioner",
  COMMISSION_SECRETARY:        "Commission Secretary (CEO)",
  DEPUTY_COMMISSION_SECRETARY: "Deputy Commission Secretary",
  DIRECTOR:                    "Director",
  MANAGER:                     "Manager",
  NATIONAL_RO:                 "National Returning Officer",
  ICT_ADMIN:                   "ICT Administrator",
  REGIONAL_COORDINATOR:        "Regional Election Coordinator",
  COUNTY_RO:                   "County Election Manager",
  CONSTITUENCY_RO:             "Constituency Election Coordinator",
  PRESIDING_OFFICER:           "Presiding Officer",
  DEPUTY_PRESIDING_OFFICER:    "Deputy Presiding Officer",
  POLLING_CLERK:               "Polling Clerk",
  SECURITY_OFFICER:            "Security Officer",
  OBSERVER:                    "Observer",
};

const ROLE_TIER: Record<StaffRole, string> = {
  CHAIRPERSON:                 "Commission",
  COMMISSIONER:                "Commission",
  COMMISSION_SECRETARY:        "Secretariat",
  DEPUTY_COMMISSION_SECRETARY: "Secretariat",
  DIRECTOR:                    "Secretariat",
  MANAGER:                     "Secretariat",
  NATIONAL_RO:                 "Secretariat",
  ICT_ADMIN:                   "Secretariat",
  REGIONAL_COORDINATOR:        "Field — Regional",
  COUNTY_RO:                   "Field — County",
  CONSTITUENCY_RO:             "Field — Constituency",
  PRESIDING_OFFICER:           "Polling Station",
  DEPUTY_PRESIDING_OFFICER:    "Polling Station",
  POLLING_CLERK:               "Polling Station",
  SECURITY_OFFICER:            "Polling Station",
  OBSERVER:                    "Observer",
};

const ROLE_COLORS: Record<StaffRole, string> = {
  CHAIRPERSON:                 "bg-red-100 text-red-800",
  COMMISSIONER:                "bg-purple-100 text-purple-800",
  COMMISSION_SECRETARY:        "bg-purple-100 text-purple-800",
  DEPUTY_COMMISSION_SECRETARY: "bg-purple-50 text-purple-700",
  DIRECTOR:                    "bg-blue-100 text-blue-800",
  MANAGER:                     "bg-blue-50 text-blue-700",
  NATIONAL_RO:                 "bg-indigo-100 text-indigo-800",
  ICT_ADMIN:                   "bg-orange-100 text-orange-800",
  REGIONAL_COORDINATOR:        "bg-teal-100 text-teal-800",
  COUNTY_RO:                   "bg-cyan-100 text-cyan-800",
  CONSTITUENCY_RO:             "bg-sky-100 text-sky-800",
  PRESIDING_OFFICER:           "bg-green-100 text-green-800",
  DEPUTY_PRESIDING_OFFICER:    "bg-green-50 text-green-700",
  POLLING_CLERK:               "bg-lime-100 text-lime-800",
  SECURITY_OFFICER:            "bg-gray-100 text-gray-700",
  OBSERVER:                    "bg-gray-100 text-gray-600",
};

// ── Capability definitions per role ──────────────────────────────────────────

type Capability = { label: string; description: string; href?: string; action?: string };

const CAPABILITIES: Partial<Record<StaffRole, Capability[]>> = {
  CHAIRPERSON: [
    { label: "Declare Presidential Results", description: "Formally declare the presidential election outcome", href: "/admin/declarations" },
    { label: "Oversee All Elections", description: "Full visibility into all election processes", href: "/admin/elections" },
    { label: "Manage Commissioners", description: "Create and manage commissioner accounts", href: "/admin/staff" },
    { label: "Election Ceremony", description: "Oversee the decryption and tally ceremony", href: "/admin/election-ceremony" },
    { label: "AI Security Alerts", description: "Review fraud detection and security alerts", href: "/admin/ai-security" },
  ],
  COMMISSIONER: [
    { label: "Oversight Dashboard", description: "Monitor election progress and results", href: "/admin/elections" },
    { label: "Tabulate Results", description: "Participate in results tabulation and verification", href: "/admin/declarations" },
    { label: "Manage Officials", description: "Create and manage IEBC staff accounts", href: "/admin/staff" },
    { label: "Election Ceremony", description: "Participate in the decryption ceremony", href: "/admin/election-ceremony" },
    { label: "AI Security Alerts", description: "Review fraud and security alerts", href: "/admin/ai-security" },
  ],
  COMMISSION_SECRETARY: [
    { label: "Manage All Staff", description: "Hire, assign, and deactivate any IEBC staff", href: "/admin/staff" },
    { label: "Election Operations", description: "Oversee all election operations nationwide", href: "/admin/elections" },
    { label: "Declare Results", description: "Execute commission decisions on result declarations", href: "/admin/declarations" },
    { label: "AI Security Alerts", description: "Review system-wide security alerts", href: "/admin/ai-security" },
  ],
  DEPUTY_COMMISSION_SECRETARY: [
    { label: "Staff Management", description: "Manage IEBC staff under CEO direction", href: "/admin/staff" },
    { label: "Election Operations", description: "Support nationwide electoral operations", href: "/admin/elections" },
    { label: "Declare Results", description: "Support result declaration process", href: "/admin/declarations" },
  ],
  NATIONAL_RO: [
    { label: "National Results", description: "Coordinate national results tallying", href: "/admin/declarations" },
    { label: "Election Ceremony", description: "Coordinate the decryption ceremony", href: "/admin/election-ceremony" },
    { label: "All Elections", description: "View all active and past elections", href: "/admin/elections" },
    { label: "Security Monitoring", description: "Monitor security alerts nationally", href: "/admin/ai-security" },
  ],
  REGIONAL_COORDINATOR: [
    { label: "Regional Elections", description: "Coordinate elections across counties in your region", href: "/admin/elections" },
    { label: "County Oversight", description: "Monitor all counties in your region", href: "/admin/polling-stations" },
  ],
  COUNTY_RO: [
    { label: "County Results", description: "Formally declare county-level election results", href: "/admin/declarations" },
    { label: "County Stations", description: "View and manage polling stations in your county", href: "/admin/polling-stations" },
    { label: "Constituency Breakdown", description: "See detailed results by constituency", href: "/admin/elections" },
  ],
  CONSTITUENCY_RO: [
    { label: "Constituency Results", description: "Formally declare constituency-level results (Form 34B)", href: "/admin/declarations" },
    { label: "Station Management", description: "Monitor all polling stations in your constituency", href: "/admin/polling-stations" },
    { label: "Manage Presiding Officers", description: "Oversee polling station officials", href: "/admin/staff" },
  ],
  PRESIDING_OFFICER: [
    { label: "Station Results (Form 34A)", description: "Submit and transmit polling station results", href: "/admin/declarations" },
    { label: "My Polling Station", description: "View voters registered at your station", href: "/admin/polling-stations" },
    { label: "Register Voter", description: "Register voters who arrive at your station", href: "/admin/register" },
  ],
  DEPUTY_PRESIDING_OFFICER: [
    { label: "Voter Queue", description: "Manage and verify the voter queue", href: "/admin/voters" },
    { label: "Station Status", description: "View your station's current status", href: "/admin/polling-stations" },
  ],
  POLLING_CLERK: [
    { label: "Verify Voters", description: "Use KIEMS kit to verify voter identity and mark register", href: "/admin/voters" },
    { label: "Station Status", description: "View your station's voter count", href: "/admin/polling-stations" },
  ],
  SECURITY_OFFICER: [
    { label: "Station Status", description: "Monitor your polling station status (read-only)", href: "/admin/polling-stations" },
  ],
  OBSERVER: [
    { label: "View Results", description: "View election results and declarations (read-only)", href: "/admin/elections" },
    { label: "Turnout Data", description: "Monitor voter turnout across all stations", href: "/admin/polling-stations" },
  ],
};

// ── Dashboard data types ───────────────────────────────────────────────────────

interface DashboardData {
  tier: "national" | "regional" | "county" | "constituency" | "station" | "observer";
  role: StaffRole;
  jurisdictionValue: string | null;
  department?: string | null;
  stats: Record<string, number | string | boolean>;
  breakdown?: Array<Record<string, string | number>>;
  myStation?: Record<string, string | number | boolean | null> | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function BreakdownTable({
  rows,
  columns,
}: {
  rows: Array<Record<string, string | number>>;
  columns: Array<{ key: string; label: string; isNumber?: boolean }>;
}) {
  const [search, setSearch] = useState("");
  const filtered = rows.filter(r =>
    String(r[columns[0].key]).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div>
      <div className="relative mb-3">
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          placeholder={`Search ${rows.length} entries…`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map(c => (
                <th key={c.key} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 ${c.isNumber ? "text-right" : "text-left"}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filtered.slice(0, 100).map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {columns.map(c => (
                  <td key={c.key} className={`px-4 py-2.5 ${c.isNumber ? "text-right font-mono text-gray-700" : "text-gray-900 font-medium"}`}>
                    {c.key === "turnout" ? `${row[c.key]}%` : c.isNumber ? Number(row[c.key]).toLocaleString() : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-gray-400">No matches</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 100 && <p className="mt-2 text-xs text-gray-400">Showing first 100 of {filtered.length} results</p>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function StaffPortalPage() {
  const { voter } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const staffRole = voter?.staffRole as StaffRole | undefined;

  useEffect(() => {
    if (!staffRole) { setLoading(false); return; }
    api.get<{ success: boolean; data: DashboardData }>("/api/staff/dashboard")
      .then(res => setData(res.data))
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [staffRole]);

  if (!staffRole) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
        <p className="text-lg font-medium">No IEBC Staff Role Assigned</p>
        <p className="mt-2 text-sm">Your account does not have an IEBC staff role. Contact the Commission Secretary.</p>
      </div>
    );
  }

  const capabilities = CAPABILITIES[staffRole] ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">My Portal</h1>
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${ROLE_COLORS[staffRole]}`}>
              {ROLE_LABELS[staffRole]}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {ROLE_TIER[staffRole]}
            {voter?.jurisdictionValue ? ` · ${voter.jurisdictionValue}` : ""}
            {data?.department ? ` · ${data.department} Department` : ""}
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      )}

      {/* Stats */}
      {!loading && data && (
        <>
          {/* ── National / Regional tier ── */}
          {(data.tier === "national" || data.tier === "regional" || data.tier === "observer") && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Registered Voters" value={Number(data.stats.totalRegistered)} />
              <StatCard label="Votes Cast" value={Number(data.stats.votesCast)} />
              <StatCard label="Turnout" value={`${data.stats.turnoutPct}%`} />
              {data.tier === "national" && (
                <>
                  <StatCard label="Active Stations" value={Number(data.stats.totalStations)} />
                  <StatCard label="Active Staff" value={Number(data.stats.activeStaff)} />
                  <StatCard label="Pending Reviews" value={Number(data.stats.pendingReviews)} sub="Manual identity reviews" />
                  <StatCard label="Distress Flags" value={Number(data.stats.distressFlags)} sub="Potential coercion cases" />
                </>
              )}
              {data.tier === "regional" && (
                <StatCard label="Counties" value={Number(data.stats.counties)} />
              )}
            </div>
          )}

          {/* ── County tier ── */}
          {data.tier === "county" && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Registered Voters" value={Number(data.stats.totalRegistered)} sub={`in ${data.jurisdictionValue} County`} />
              <StatCard label="Votes Cast" value={Number(data.stats.votesCast)} />
              <StatCard label="Turnout" value={`${data.stats.turnoutPct}%`} />
              <StatCard label="Polling Stations" value={Number(data.stats.totalStations)} />
              <StatCard label="Active Stations" value={Number(data.stats.activeStations)} />
              <StatCard label="Constituencies" value={Number(data.stats.constituencies)} />
            </div>
          )}

          {/* ── Constituency tier ── */}
          {data.tier === "constituency" && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Registered Voters" value={Number(data.stats.totalRegistered)} sub={`in ${data.jurisdictionValue}`} />
              <StatCard label="Votes Cast" value={Number(data.stats.votesCast)} />
              <StatCard label="Turnout" value={`${data.stats.turnoutPct}%`} />
              <StatCard label="Polling Stations" value={Number(data.stats.totalStations)} />
              <StatCard label="Active Stations" value={Number(data.stats.activeStations)} />
            </div>
          )}

          {/* ── Station tier ── */}
          {data.tier === "station" && data.myStation && (
            <>
              <div className="rounded-xl border border-green-200 bg-green-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-700">My Polling Station</p>
                <p className="mt-1 text-xl font-bold text-gray-900">{String(data.myStation.name)}</p>
                <p className="text-sm text-gray-600">
                  Code: <span className="font-mono">{String(data.myStation.code)}</span>
                  {" · "}{String(data.myStation.ward)} Ward
                  {" · "}{String(data.myStation.constituency)}, {String(data.myStation.county)}
                </p>
                <span className={`mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${data.myStation.isActive ? "bg-green-200 text-green-800" : "bg-gray-200 text-gray-700"}`}>
                  {data.myStation.isActive ? "● Open" : "● Closed"}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Registered at Station" value={Number(data.stats.registeredVoters)} />
                <StatCard label="Votes Cast" value={Number(data.stats.votesCast)} />
                <StatCard label="Turnout" value={`${data.stats.turnoutPct}%`} sub={`${Number(data.stats.remainingVoters).toLocaleString()} voters remaining`} />
              </div>
            </>
          )}

          {/* ── Breakdown table ── */}
          {data.breakdown && data.breakdown.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-gray-900">
                {data.tier === "national" || data.tier === "regional" ? "County Breakdown" :
                 data.tier === "county" ? "Constituency Breakdown" :
                 "Polling Station Breakdown"}
              </h2>
              {(data.tier === "national" || data.tier === "regional") && (
                <BreakdownTable
                  rows={data.breakdown}
                  columns={[
                    { key: "name", label: "County" },
                    { key: "voters", label: "Registered", isNumber: true },
                    { key: "votes", label: "Votes Cast", isNumber: true },
                    { key: "turnout", label: "Turnout %" },
                  ]}
                />
              )}
              {data.tier === "county" && (
                <BreakdownTable
                  rows={data.breakdown}
                  columns={[
                    { key: "name", label: "Constituency" },
                    { key: "voters", label: "Registered", isNumber: true },
                    { key: "stations", label: "Stations", isNumber: true },
                    { key: "votes", label: "Votes Cast", isNumber: true },
                    { key: "turnout", label: "Turnout %" },
                  ]}
                />
              )}
              {data.tier === "constituency" && (
                <BreakdownTable
                  rows={data.breakdown}
                  columns={[
                    { key: "name", label: "Station" },
                    { key: "code", label: "Code" },
                    { key: "ward", label: "Ward" },
                    { key: "voters", label: "Registered", isNumber: true },
                    { key: "votes", label: "Votes Cast", isNumber: true },
                    { key: "turnout", label: "Turnout %" },
                  ]}
                />
              )}
            </div>
          )}
        </>
      )}

      {/* Capabilities / Quick actions */}
      {capabilities.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-900">My Responsibilities & Actions</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(cap => (
              <Link
                key={cap.label}
                href={cap.href ?? "#"}
                className="flex flex-col rounded-lg border border-gray-200 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50"
              >
                <span className="text-sm font-semibold text-gray-900">{cap.label}</span>
                <span className="mt-1 text-xs text-gray-500">{cap.description}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Role description */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-5">
        <h3 className="text-sm font-semibold text-gray-700">Role Overview — {ROLE_LABELS[staffRole]}</h3>
        <RoleDescription role={staffRole} />
      </div>
    </div>
  );
}

function RoleDescription({ role }: { role: StaffRole }) {
  const descriptions: Partial<Record<StaffRole, string>> = {
    CHAIRPERSON: "Acts as the returning officer for the presidential election. Oversees the overall conduct of all elections, chairs Commission meetings, and is responsible for declaring presidential results.",
    COMMISSIONER: "Provides policy oversight on the implementation of electoral processes by the Secretariat. Participates in tabulation of results, ensures adherence to the Constitution, and supervises Commission decisions.",
    COMMISSION_SECRETARY: "The CEO of the IEBC Secretariat. Responsible for executing Commission decisions, managing the day-to-day running of the Commission, and supervising all staff.",
    DEPUTY_COMMISSION_SECRETARY: "Supports the Commission Secretary in managing electoral operations, deputising for the CEO and coordinating field operations.",
    DIRECTOR: "Responsible for a specific functional area — managing its budget, staff, and deliverables. Reports to the Commission Secretary.",
    MANAGER: "Manages day-to-day operations within a functional department. Reports to the relevant Director.",
    NATIONAL_RO: "Coordinates national-level results collation, manages the national tallying centre, and transmits results to the Chairperson for declaration.",
    ICT_ADMIN: "Manages KIEMS kits, voter identification systems, results transmission infrastructure, and system security monitoring.",
    REGIONAL_COORDINATOR: "Oversees IEBC activities across multiple counties within their region. Coordinates County Election Managers and manages regional logistics.",
    COUNTY_RO: "Coordinates IEBC activities within a single county. Manages constituency coordinators, oversees county tallying, and formally declares county-level results.",
    CONSTITUENCY_RO: "Responsible for coordinating voter registration, training election officials, managing the constituency tallying process, and formally declaring constituency results (Form 34B).",
    PRESIDING_OFFICER: "Overall in charge of a specific polling station on Election Day. Manages KIEMS kits, declares voting open and closed, supervises clerks, counts votes, and transmits results on Form 34A.",
    DEPUTY_PRESIDING_OFFICER: "Deputises for the Presiding Officer. Primarily handles the voter queue and KIEMS-based voter verification, especially when the PO is occupied.",
    POLLING_CLERK: "Verifies voter identity against the register or KIEMS kit and marks the voter's finger with indelible ink before allowing them to collect their ballot.",
    SECURITY_OFFICER: "Ensures law and order at the polling station. Has read-only access to station status information.",
    OBSERVER: "Accredited observer with read-only access to election results, turnout data, and audit reports. Cannot modify any data.",
  };
  return (
    <p className="mt-2 text-sm text-gray-600 leading-relaxed">
      {descriptions[role] ?? "Contact the Commission Secretary for details about your role and responsibilities."}
    </p>
  );
}
