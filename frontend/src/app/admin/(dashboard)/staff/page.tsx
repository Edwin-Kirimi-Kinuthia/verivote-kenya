"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api-client";
import type { IebcStaffMember, StaffRole, JurisdictionLevel } from "@/lib/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// Role groups for display ordering
const ROLE_GROUPS = [
  { label: "Commission", roles: ["CHAIRPERSON","COMMISSIONER","COMMISSION_SECRETARY","DEPUTY_COMMISSION_SECRETARY"] as StaffRole[] },
  { label: "Secretariat", roles: ["DIRECTOR","MANAGER","NATIONAL_RO","ICT_ADMIN"] as StaffRole[] },
  { label: "Field Offices", roles: ["REGIONAL_COORDINATOR","COUNTY_RO","CONSTITUENCY_RO"] as StaffRole[] },
  { label: "Polling Station", roles: ["PRESIDING_OFFICER","DEPUTY_PRESIDING_OFFICER","POLLING_CLERK","SECURITY_OFFICER"] as StaffRole[] },
  { label: "Special", roles: ["OBSERVER"] as StaffRole[] },
];

const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  CHAIRPERSON:                 "Presidential Returning Officer — highest authority",
  COMMISSIONER:                "Policy oversight and election supervision",
  COMMISSION_SECRETARY:        "CEO — executes Commission decisions",
  DEPUTY_COMMISSION_SECRETARY: "Supports CEO in managing electoral operations",
  DIRECTOR:                    "Heads a functional department",
  MANAGER:                     "Manages day-to-day department operations",
  NATIONAL_RO:                 "Coordinates national results collation",
  ICT_ADMIN:                   "Manages KIEMS, results transmission, and system security",
  REGIONAL_COORDINATOR:        "Oversees IEBC activities across multiple counties",
  COUNTY_RO:                   "County-level operations and results declaration",
  CONSTITUENCY_RO:             "Constituency operations — tallying and Form 34B",
  PRESIDING_OFFICER:           "In charge of a polling station — Form 34A",
  DEPUTY_PRESIDING_OFFICER:    "Handles voter queue and verification at station",
  POLLING_CLERK:               "Verifies voter identity and marks indelible ink",
  SECURITY_OFFICER:            "Law and order at polling station (read-only)",
  OBSERVER:                    "Accredited read-only observer",
};

const JURISDICTION_LABELS: Record<JurisdictionLevel, string> = {
  NATIONAL:        "National",
  COUNTY:          "County",
  CONSTITUENCY:    "Constituency",
  WARD:            "Ward",
  POLLING_STATION: "Polling Station",
};

// Roles that require a jurisdiction value
const NEEDS_JURISDICTION = new Set<StaffRole>([
  "REGIONAL_COORDINATOR", "COUNTY_RO", "CONSTITUENCY_RO",
  "PRESIDING_OFFICER", "DEPUTY_PRESIDING_OFFICER", "POLLING_CLERK", "SECURITY_OFFICER",
]);

// Roles that require a department
const NEEDS_DEPARTMENT = new Set<StaffRole>(["DIRECTOR", "MANAGER"]);

// Default jurisdiction level for each role
const DEFAULT_JURISDICTION: Record<StaffRole, JurisdictionLevel> = {
  CHAIRPERSON:                 "NATIONAL",
  COMMISSIONER:                "NATIONAL",
  COMMISSION_SECRETARY:        "NATIONAL",
  DEPUTY_COMMISSION_SECRETARY: "NATIONAL",
  DIRECTOR:                    "NATIONAL",
  MANAGER:                     "NATIONAL",
  NATIONAL_RO:                 "NATIONAL",
  ICT_ADMIN:                   "NATIONAL",
  REGIONAL_COORDINATOR:        "COUNTY",
  COUNTY_RO:                   "COUNTY",
  CONSTITUENCY_RO:             "CONSTITUENCY",
  PRESIDING_OFFICER:           "POLLING_STATION",
  DEPUTY_PRESIDING_OFFICER:    "POLLING_STATION",
  POLLING_CLERK:               "POLLING_STATION",
  SECURITY_OFFICER:            "POLLING_STATION",
  OBSERVER:                    "NATIONAL",
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const { voter } = useAuth();
  // Any senior commission role can manage staff
  const canManageStaff = voter?.staffRole
    ? (["CHAIRPERSON","COMMISSIONER","COMMISSION_SECRETARY","DEPUTY_COMMISSION_SECRETARY"] as StaffRole[]).includes(voter.staffRole as StaffRole)
    : false;
  const isChairperson = voter?.staffRole === "CHAIRPERSON";
  const COMMISSION_TIER = new Set(["CHAIRPERSON","COMMISSIONER","COMMISSION_SECRETARY","DEPUTY_COMMISSION_SECRETARY"]);

  const [staff, setStaff] = useState<IebcStaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [nationalId, setNationalId] = useState("");
  const [newRole, setNewRole] = useState<StaffRole>("PRESIDING_OFFICER");
  const [newLevel, setNewLevel] = useState<JurisdictionLevel>("POLLING_STATION");
  const [newValue, setNewValue] = useState("");
  const [newDepartment, setNewDepartment] = useState("");
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
      if ((newRole === "COUNTY_RO" || newRole === "REGIONAL_COORDINATOR") && geoCounty) jurisdictionValue = geoCounty;
      else if (newRole === "CONSTITUENCY_RO" && geoConstituency) jurisdictionValue = geoConstituency;
      else if ((newRole === "PRESIDING_OFFICER" || newRole === "DEPUTY_PRESIDING_OFFICER" || newRole === "POLLING_CLERK" || newRole === "SECURITY_OFFICER") && geoWard) jurisdictionValue = geoWard;

      await api.post("/api/staff", {
        nationalId: trimmedId,
        staffRole: newRole,
        jurisdictionLevel: newLevel,
        jurisdictionValue,
        ...(NEEDS_DEPARTMENT.has(newRole) && newDepartment.trim() ? { department: newDepartment.trim() } : {}),
      });
      setShowCreate(false);
      setNationalId("");
      setNewValue("");
      setNewDepartment("");
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
        {canManageStaff && (
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
      {showCreate && canManageStaff && (
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
              <div className="space-y-3">
                {ROLE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{group.label}</p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {group.roles.map((r) => (
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
                ))}
              </div>
            </div>

            {/* Department — shown for Director and Manager */}
            {NEEDS_DEPARTMENT.has(newRole) && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Department *</label>
                <input
                  type="text"
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value)}
                  placeholder="e.g. Electoral Operations, ICT, Legal"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

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
                {/* Constituency selector for CONSTITUENCY_RO and all station roles */}
                {(newRole === "CONSTITUENCY_RO" || newRole === "PRESIDING_OFFICER" || newRole === "DEPUTY_PRESIDING_OFFICER" || newRole === "POLLING_CLERK" || newRole === "SECURITY_OFFICER") && geoCounty && (
                  <select
                    value={geoConstituency}
                    onChange={(e) => setGeoConstituency(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select Constituency —</option>
                    {constituencies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                {/* Ward selector for all station roles */}
                {(newRole === "PRESIDING_OFFICER" || newRole === "DEPUTY_PRESIDING_OFFICER" || newRole === "POLLING_CLERK" || newRole === "SECURITY_OFFICER") && geoConstituency && (
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
                onClick={() => { setShowCreate(false); setCreateError(null); setNationalId(""); setNewValue(""); setNewDepartment(""); }}
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
          No staff members found.{canManageStaff ? " Click \"Add Staff Member\" to get started." : ""}
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
                {canManageStaff && <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>}
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
                  {canManageStaff && (
                    <td className="px-4 py-3">
                      {s.isActive && (isChairperson ? s.staffRole !== "CHAIRPERSON" : !COMMISSION_TIER.has(s.staffRole)) ? (
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
