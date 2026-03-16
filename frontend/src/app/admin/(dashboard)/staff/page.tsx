"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api-client";
import type { IebcStaffMember, StaffRole, JurisdictionLevel } from "@/lib/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<StaffRole, string> = {
  COMMISSIONER:       "Commissioner",
  NATIONAL_RO:        "National RO",
  COUNTY_RO:          "County RO",
  CONSTITUENCY_RO:    "Constituency RO",
  PRESIDING_OFFICER:  "Presiding Officer",
  ICT_ADMIN:          "ICT Admin",
  OBSERVER:           "Observer",
};

const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  COMMISSIONER:       "Full oversight of all elections",
  NATIONAL_RO:        "National Returning Officer",
  COUNTY_RO:          "County-level returning officer",
  CONSTITUENCY_RO:    "Constituency-level returning officer",
  PRESIDING_OFFICER:  "Manages a single polling station",
  ICT_ADMIN:          "System administration access",
  OBSERVER:           "Read-only observation access",
};

const JURISDICTION_LABELS: Record<JurisdictionLevel, string> = {
  NATIONAL:        "National",
  COUNTY:          "County",
  CONSTITUENCY:    "Constituency",
  WARD:            "Ward",
  POLLING_STATION: "Polling Station",
};

// Roles that require a jurisdiction value
const NEEDS_JURISDICTION = new Set<StaffRole>(["COUNTY_RO", "CONSTITUENCY_RO", "PRESIDING_OFFICER"]);

// Default jurisdiction level for each role
const DEFAULT_JURISDICTION: Record<StaffRole, JurisdictionLevel> = {
  COMMISSIONER:       "NATIONAL",
  NATIONAL_RO:        "NATIONAL",
  COUNTY_RO:          "COUNTY",
  CONSTITUENCY_RO:    "CONSTITUENCY",
  PRESIDING_OFFICER:  "POLLING_STATION",
  ICT_ADMIN:          "NATIONAL",
  OBSERVER:           "NATIONAL",
};

const ROLE_COLORS: Record<StaffRole, string> = {
  COMMISSIONER:      "bg-purple-100 text-purple-800",
  NATIONAL_RO:       "bg-blue-100 text-blue-800",
  COUNTY_RO:         "bg-indigo-100 text-indigo-800",
  CONSTITUENCY_RO:   "bg-cyan-100 text-cyan-800",
  PRESIDING_OFFICER: "bg-teal-100 text-teal-800",
  ICT_ADMIN:         "bg-orange-100 text-orange-800",
  OBSERVER:          "bg-gray-100 text-gray-800",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const { voter } = useAuth();
  const isCommissioner = voter?.staffRole === "COMMISSIONER";

  const [staff, setStaff] = useState<IebcStaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [nationalId, setNationalId] = useState("");
  const [newRole, setNewRole] = useState<StaffRole>("PRESIDING_OFFICER");
  const [newLevel, setNewLevel] = useState<JurisdictionLevel>("POLLING_STATION");
  const [newValue, setNewValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Cascading geo dropdowns
  const [counties, setCounties] = useState<string[]>([]);
  const [constituencies, setConstituencies] = useState<string[]>([]);
  const [wards, setWards] = useState<string[]>([]);
  const [geoCounty, setGeoCounty] = useState("");
  const [geoConstituency, setGeoConstituency] = useState("");
  const [geoWard, setGeoWard] = useState("");

  // Filter
  const [filterRole, setFilterRole] = useState<StaffRole | "">("");

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: IebcStaffMember[] }>("/api/staff");
      setStaff(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  // Load counties on mount
  useEffect(() => {
    api.get<{ success: boolean; data: string[] }>("/api/geo/counties")
      .then(res => setCounties(res.data ?? []))
      .catch(() => {});
  }, []);

  // Load constituencies when county changes
  useEffect(() => {
    if (!geoCounty) { setConstituencies([]); setGeoConstituency(""); return; }
    api.get<{ success: boolean; data: Array<{ constituency: string }> }>(`/api/geo/constituencies?county=${encodeURIComponent(geoCounty)}`)
      .then(res => setConstituencies((res.data ?? []).map((r: { constituency: string }) => r.constituency)))
      .catch(() => {});
    setGeoConstituency("");
    setGeoWard("");
  }, [geoCounty]);

  // Load wards when constituency changes
  useEffect(() => {
    if (!geoConstituency) { setWards([]); setGeoWard(""); return; }
    api.get<{ success: boolean; data: Array<{ ward: string }> }>(`/api/geo/wards?constituency=${encodeURIComponent(geoConstituency)}`)
      .then(res => setWards((res.data ?? []).map((r: { ward: string }) => r.ward)))
      .catch(() => {});
    setGeoWard("");
  }, [geoConstituency]);

  // Auto-update jurisdiction level when role changes
  function handleRoleChange(role: StaffRole) {
    setNewRole(role);
    setNewLevel(DEFAULT_JURISDICTION[role]);
    setNewValue("");
    setGeoCounty("");
    setGeoConstituency("");
    setGeoWard("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    const trimmedId = nationalId.trim().toUpperCase();
    if (trimmedId.length < 5) {
      setCreateError("National ID / Passport must be at least 5 characters");
      setCreating(false);
      return;
    }
    try {
      // Use cascading geo value if available
      let jurisdictionValue: string | undefined = newValue.trim() || undefined;
      if (newRole === "COUNTY_RO" && geoCounty) jurisdictionValue = geoCounty;
      else if (newRole === "CONSTITUENCY_RO" && geoConstituency) jurisdictionValue = geoConstituency;
      else if (newRole === "PRESIDING_OFFICER" && geoWard) jurisdictionValue = geoWard;

      await api.post("/api/staff", {
        nationalId: trimmedId,
        staffRole: newRole,
        jurisdictionLevel: newLevel,
        jurisdictionValue,
      });
      setShowCreate(false);
      setNationalId("");
      setNewValue("");
      setNewRole("PRESIDING_OFFICER");
      setNewLevel("POLLING_STATION");
      setGeoCounty("");
      setGeoConstituency("");
      setGeoWard("");
      await loadStaff();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create staff member");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeactivate(staffId: string, displayId: string) {
    if (!confirm(`Deactivate ${displayId}? They will lose portal access.`)) return;
    try {
      await api.delete(`/api/staff/${staffId}`);
      await loadStaff();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to deactivate");
    }
  }

  const displayed = filterRole ? staff.filter((s) => s.staffRole === filterRole) : staff;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">IEBC Staff &amp; Officials</h1>
          <p className="mt-1 text-sm text-gray-500">
            All IEBC officials, returning officers, presiding officers, and admins
          </p>
        </div>
        {isCommissioner && (
          <button
            onClick={() => { setShowCreate(!showCreate); setCreateError(null); }}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Staff Member
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && isCommissioner && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-6">
          <h2 className="mb-1 font-semibold text-blue-900">Add New Staff Member</h2>
          <p className="mb-4 text-xs text-gray-500">
            The person must already be registered as a voter in the system. Their account will be
            upgraded to admin access with the role you assign.
          </p>

          <form onSubmit={handleCreate} className="space-y-4">
            {/* National ID */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                National ID or Passport Number *
              </label>
              <input
                type="text"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                required
                autoComplete="off"
                placeholder="e.g. 12345678 or A1234567"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">Accepts national IDs (digits) and passport numbers (alphanumeric)</p>
            </div>

            {/* Role */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Role *</label>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(Object.keys(ROLE_LABELS) as StaffRole[]).map((r) => (
                  <label
                    key={r}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
                      newRole === r
                        ? "border-blue-500 bg-white ring-1 ring-blue-500"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="staffRole"
                      value={r}
                      checked={newRole === r}
                      onChange={() => handleRoleChange(r)}
                      className="mt-0.5 accent-blue-600"
                    />
                    <div>
                      <p className="font-medium text-gray-900">{ROLE_LABELS[r]}</p>
                      <p className="text-xs text-gray-500">{ROLE_DESCRIPTIONS[r]}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Jurisdiction — shown for roles that need it */}
            {NEEDS_JURISDICTION.has(newRole) && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Jurisdiction Area</label>
                {/* County selector for all geo roles */}
                <select
                  value={geoCounty}
                  onChange={(e) => setGeoCounty(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Select County —</option>
                  {counties.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {/* Constituency selector for CONSTITUENCY_RO and PRESIDING_OFFICER */}
                {(newRole === "CONSTITUENCY_RO" || newRole === "PRESIDING_OFFICER") && geoCounty && (
                  <select
                    value={geoConstituency}
                    onChange={(e) => setGeoConstituency(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select Constituency —</option>
                    {constituencies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                {/* Ward selector for PRESIDING_OFFICER */}
                {newRole === "PRESIDING_OFFICER" && geoConstituency && (
                  <select
                    value={geoWard}
                    onChange={(e) => setGeoWard(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select Ward —</option>
                    {wards.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                )}
              </div>
            )}

            {createError && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{createError}</div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={creating || nationalId.trim().length < 5}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create Staff Member"}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setCreateError(null); setNationalId(""); setNewValue(""); }}
                className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Filter bar */}
      {!loading && staff.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Filter:</span>
          <button
            onClick={() => setFilterRole("")}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filterRole === "" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            All ({staff.length})
          </button>
          {(Object.keys(ROLE_LABELS) as StaffRole[])
            .filter((r) => staff.some((s) => s.staffRole === r))
            .map((r) => (
              <button
                key={r}
                onClick={() => setFilterRole(r)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${filterRole === r ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {ROLE_LABELS[r]} ({staff.filter((s) => s.staffRole === r).length})
              </button>
            ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-gray-400">Loading staff…</div>
      ) : staff.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center text-gray-400">
          No staff members found.{isCommissioner ? " Click \"Add Staff Member\" to get started." : ""}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">National ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Jurisdiction</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                {isCommissioner && <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-900">
                    {s.voter?.nationalId ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[s.staffRole]}`}>
                      {ROLE_LABELS[s.staffRole]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className="font-medium">{JURISDICTION_LABELS[s.jurisdictionLevel]}</span>
                    {s.jurisdictionValue && (
                      <span className="ml-1 text-gray-400">— {s.jurisdictionValue}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      s.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
                    }`}>
                      {s.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {isCommissioner && (
                    <td className="px-4 py-3">
                      {s.isActive && s.staffRole !== "COMMISSIONER" ? (
                        <button
                          onClick={() => handleDeactivate(s.id, s.voter?.nationalId ?? s.id)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
