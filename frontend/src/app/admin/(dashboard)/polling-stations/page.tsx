"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api-client";
import type { PollingStation, PollingStationDetail, StationStaff } from "@/lib/types";

// ── Role helpers ───────────────────────────────────────────────────────────────

const STATION_ROLES = ["PRESIDING_OFFICER", "DEPUTY_PRESIDING_OFFICER", "POLLING_CLERK", "SECURITY_OFFICER"];
const WRITE_ROLES   = ["COMMISSIONER","CHAIRPERSON","COMMISSION_SECRETARY","DEPUTY_COMMISSION_SECRETARY",
                        "NATIONAL_RO","COUNTY_RO","CONSTITUENCY_RO","PRESIDING_OFFICER","ICT_ADMIN","DIRECTOR","MANAGER"];
const DELETE_ROLES  = ["COMMISSIONER","CHAIRPERSON","COMMISSION_SECRETARY","DEPUTY_COMMISSION_SECRETARY",
                        "NATIONAL_RO","COUNTY_RO","CONSTITUENCY_RO"];

const ROLE_LABELS: Record<string, string> = {
  PRESIDING_OFFICER: "PO", DEPUTY_PRESIDING_OFFICER: "DPO",
  POLLING_CLERK: "Clerk", SECURITY_OFFICER: "Security",
};

// ── Google Maps helpers ────────────────────────────────────────────────────────

function mapsUrl(s: PollingStation) {
  if (s.latitude != null && s.longitude != null)
    return `https://www.google.com/maps?q=${s.latitude},${s.longitude}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name} ${s.county} Kenya`)}`;
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// ── Station form types ─────────────────────────────────────────────────────────

interface FormData {
  code: string; name: string; county: string; constituency: string; ward: string;
  address: string; latitude: string; longitude: string;
  isDiaspora: boolean; country: string; registeredVoters: string;
  deviceCount: string; printerCount: string;
  openingTime: string; closingTime: string;
}

const EMPTY_FORM: FormData = {
  code: "", name: "", county: "", constituency: "", ward: "",
  address: "", latitude: "", longitude: "",
  isDiaspora: false, country: "", registeredVoters: "0",
  deviceCount: "0", printerCount: "0",
  openingTime: "", closingTime: "",
};

// ── Sub-component: station card ────────────────────────────────────────────────

function StationCard({
  station, canWrite, canDelete, canEdit,
  onEdit, onToggle, onDelete, onSelect,
}: {
  station: PollingStation;
  canWrite: boolean; canDelete: boolean; canEdit: boolean;
  onEdit: () => void; onToggle: () => void; onDelete: () => void; onSelect: () => void;
}) {
  const hasCoords = station.latitude != null && station.longitude != null;
  return (
    <div
      className={`group rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${
        station.isActive ? "border-gray-200" : "border-red-200 opacity-60"
      }`}
    >
      {/* Top row: code + status + actions */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold text-gray-700">
            {station.code}
          </span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            station.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
          }`}>
            {station.isActive ? "Active" : "Inactive"}
          </span>
          {station.isDiaspora && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">Diaspora</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canEdit && (
            <button onClick={onEdit} className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">Edit</button>
          )}
          {canWrite && (
            <button onClick={onToggle} className={`rounded px-2 py-1 text-xs ${
              station.isActive ? "text-orange-600 hover:bg-orange-50" : "text-green-600 hover:bg-green-50"
            }`}>
              {station.isActive ? "Deactivate" : "Reactivate"}
            </button>
          )}
          {canDelete && (
            <button onClick={onDelete} className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50">Delete</button>
          )}
        </div>
      </div>

      {/* Name */}
      <button onClick={onSelect} className="mb-1 text-left">
        <h3 className="text-base font-semibold text-gray-900 leading-tight hover:text-blue-600">
          {station.name}
        </h3>
      </button>

      {/* Jurisdiction breadcrumb */}
      <p className="mb-3 text-xs text-gray-400">
        {station.ward} &middot; {station.constituency} &middot; {station.county}
        {station.country ? ` · ${station.country}` : ""}
      </p>

      {/* Address */}
      {station.address && (
        <p className="mb-2 truncate text-xs text-gray-500">{station.address}</p>
      )}

      {/* Google Maps link */}
      <a
        href={mapsUrl(station)}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        {hasCoords
          ? `${Number(station.latitude).toFixed(4)}, ${Number(station.longitude).toFixed(4)}`
          : "View on Google Maps"}
      </a>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
          </svg>
          <strong className="text-gray-700">{station.registeredVoters.toLocaleString()}</strong> voters
        </span>
        {(station.deviceCount ?? 0) > 0 && (
          <span>{station.deviceCount} device{station.deviceCount !== 1 ? "s" : ""}</span>
        )}
        {(station.printerCount ?? 0) > 0 && (
          <span>{station.printerCount} printer{station.printerCount !== 1 ? "s" : ""}</span>
        )}
        {(station.openingTime || station.closingTime) && (
          <span>
            {fmtTime(station.openingTime)} – {fmtTime(station.closingTime)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Sub-component: detail modal ────────────────────────────────────────────────

function StationDetailModal({ stationId, onClose, onEdit }: { stationId: string; onClose: () => void; onEdit: () => void }) {
  const [detail, setDetail] = useState<PollingStationDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ success: boolean; data: PollingStationDetail }>(`/api/polling-stations/${stationId}`)
      .then(res => setDetail(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [stationId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="font-semibold text-gray-900">Station Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : detail ? (
          <div className="p-6 space-y-5">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded text-gray-700">{detail.code}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${detail.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
                  {detail.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <h3 className="text-xl font-bold text-gray-900">{detail.name}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{detail.ward} · {detail.constituency} · {detail.county}</p>
            </div>

            {/* Location */}
            <div className="rounded-lg bg-gray-50 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Location</p>
              {detail.address && <p className="text-sm text-gray-700">{detail.address}</p>}
              {detail.latitude != null && detail.longitude != null ? (
                <>
                  <p className="font-mono text-sm text-gray-600">
                    {Number(detail.latitude).toFixed(6)}, {Number(detail.longitude).toFixed(6)}
                  </p>
                  <a href={mapsUrl(detail)} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Open in Google Maps
                  </a>
                </>
              ) : (
                <a href={mapsUrl(detail)} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline">Search on Google Maps</a>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Registered Voters", value: detail.registeredVoters.toLocaleString() },
                { label: "Votes Cast", value: detail._count?.votes?.toLocaleString() ?? "0" },
                { label: "Registered in System", value: detail._count?.voters?.toLocaleString() ?? "0" },
              ].map(stat => (
                <div key={stat.label} className="rounded-lg bg-gray-50 p-3 text-center">
                  <p className="text-xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Equipment & hours */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-400 mb-1">Equipment</p>
                <p className="text-gray-700">{detail.deviceCount ?? 0} voting device{detail.deviceCount !== 1 ? "s" : ""}</p>
                <p className="text-gray-700">{detail.printerCount ?? 0} printer{detail.printerCount !== 1 ? "s" : ""}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-400 mb-1">Election Day Hours</p>
                <p className="text-gray-700">Open: {fmtTime(detail.openingTime)}</p>
                <p className="text-gray-700">Close: {fmtTime(detail.closingTime)}</p>
              </div>
            </div>

            {/* Assigned staff */}
            {detail.iebcStaff && detail.iebcStaff.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Assigned Officers</p>
                <div className="space-y-1">
                  {detail.iebcStaff.map((s: StationStaff) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <span className="font-medium text-gray-700">{ROLE_LABELS[s.staffRole] ?? s.staffRole}</span>
                      <span className="font-mono text-xs text-gray-500">{s.voter.nationalId}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={onEdit}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Edit Station
              </button>
              <button onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        ) : (
          <p className="p-6 text-center text-gray-400">Failed to load station details</p>
        )}
      </div>
    </div>
  );
}

// ── Sub-component: Create/Edit form ────────────────────────────────────────────

function StationForm({
  editingId, initialForm, lockedCounty, lockedConstituency,
  onSave, onClose,
}: {
  editingId: string | null;
  initialForm: FormData;
  lockedCounty?: string;
  lockedConstituency?: string;
  onSave: (form: FormData) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormData>(initialForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [counties, setCounties] = useState<string[]>([]);
  const [constituencies, setConstituencies] = useState<string[]>([]);
  const [wards, setWards] = useState<string[]>([]);

  // Load counties
  useEffect(() => {
    api.get<{ success: boolean; data: string[] }>("/api/geo/counties")
      .then(r => setCounties(r.data ?? []))
      .catch(() => {});
  }, []);

  // Load constituencies when county changes
  useEffect(() => {
    const county = form.county || lockedCounty;
    if (!county) { setConstituencies([]); return; }
    api.get<{ success: boolean; data: Array<{ constituency: string }> }>(
      `/api/geo/constituencies?county=${encodeURIComponent(county)}`
    ).then(r => setConstituencies((r.data ?? []).map(x => x.constituency)))
      .catch(() => {});
  }, [form.county, lockedCounty]);

  // Load wards when constituency changes
  useEffect(() => {
    const constituency = form.constituency || lockedConstituency;
    if (!constituency) { setWards([]); return; }
    api.get<{ success: boolean; data: Array<{ ward: string }> }>(
      `/api/geo/wards?constituency=${encodeURIComponent(constituency)}`
    ).then(r => setWards((r.data ?? []).map(x => x.ward)))
      .catch(() => {});
  }, [form.constituency, lockedConstituency]);

  const f = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await onSave(form);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {editingId ? "Edit Polling Station" : "Add New Polling Station"}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-5">
            {/* Identity */}
            <div className="grid grid-cols-2 gap-4">
              {!editingId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Station Code *</label>
                  <input type="text" value={form.code} onChange={f("code")} required
                    placeholder="e.g. NAI-KSN-001"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              )}
              <div className={editingId ? "col-span-2" : ""}>
                <label className="block text-sm font-medium text-gray-700">Station Name *</label>
                <input type="text" value={form.name} onChange={f("name")} required
                  placeholder="e.g. Westlands Primary School"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>

            {/* Jurisdiction — cascading dropdowns */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Jurisdiction</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">County *</label>
                  {lockedCounty ? (
                    <input type="text" value={lockedCounty} disabled
                      className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500" />
                  ) : (
                    <select value={form.county} onChange={e => {
                      setForm(p => ({ ...p, county: e.target.value, constituency: "", ward: "" }));
                    }} required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                      <option value="">— County —</option>
                      {counties.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Constituency *</label>
                  {lockedConstituency ? (
                    <input type="text" value={lockedConstituency} disabled
                      className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500" />
                  ) : (
                    <select value={form.constituency} onChange={e => {
                      setForm(p => ({ ...p, constituency: e.target.value, ward: "" }));
                    }} required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                      <option value="">— Constituency —</option>
                      {constituencies.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Ward *</label>
                  <select value={form.ward} onChange={f("ward")} required
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                    <option value="">— Ward —</option>
                    {wards.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Location */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Location</p>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700">Address / Landmark</label>
                <input type="text" value={form.address} onChange={f("address")}
                  placeholder="e.g. Off Waiyaki Way, near Total petrol station"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Latitude</label>
                  <input type="number" step="any" min="-90" max="90" value={form.latitude} onChange={f("latitude")}
                    placeholder="-1.2921"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Longitude</label>
                  <input type="number" step="any" min="-180" max="180" value={form.longitude} onChange={f("longitude")}
                    placeholder="36.8219"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                Tip: right-click a location in Google Maps → &quot;What&apos;s here?&quot; to copy exact coordinates.
              </p>
            </div>

            {/* Diaspora (create only) */}
            {!editingId && (
              <div className="flex items-center gap-3">
                <input type="checkbox" id="isDiaspora" checked={form.isDiaspora}
                  onChange={e => setForm(p => ({ ...p, isDiaspora: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                <label htmlFor="isDiaspora" className="text-sm font-medium text-gray-700">
                  Diaspora station (abroad embassy / consulate)
                </label>
              </div>
            )}
            {!editingId && form.isDiaspora && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Country *</label>
                <input type="text" value={form.country} onChange={f("country")} required={form.isDiaspora}
                  placeholder="e.g. United Kingdom"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            )}

            {/* Capacity & equipment */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Capacity &amp; Equipment</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Registered Voters</label>
                  <input type="number" min="0" value={form.registeredVoters} onChange={f("registeredVoters")}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Devices (KIEMS)</label>
                  <input type="number" min="0" value={form.deviceCount} onChange={f("deviceCount")}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Printers</label>
                  <input type="number" min="0" value={form.printerCount} onChange={f("printerCount")}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
            </div>

            {/* Election day hours */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Election Day Hours</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Opening Time</label>
                  <input type="datetime-local" value={form.openingTime} onChange={f("openingTime")}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Closing Time</label>
                  <input type="datetime-local" value={form.closingTime} onChange={f("closingTime")}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
            </div>
          </div>

          {formError && (
            <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{formError}</div>
          )}

          <div className="mt-6 flex gap-3">
            <button type="submit" disabled={saving}
              className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
              {saving ? "Saving..." : editingId ? "Save Changes" : "Create Station"}
            </button>
            <button type="button" onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Sub-component: geo tree ────────────────────────────────────────────────────

function GeoTree({
  counties, constituenciesOf, wardsOf, expanded, loadingNode, selected,
  onCountyClick, onConstituencyClick, onWardClick, onAll,
  lockedCounty, lockedConstituency,
}: {
  counties: string[];
  constituenciesOf: Record<string, string[]>;
  wardsOf: Record<string, string[]>;
  expanded: Set<string>;
  loadingNode: string | null;
  selected: { county?: string; constituency?: string; ward?: string };
  onCountyClick: (county: string) => void;
  onConstituencyClick: (county: string, constituency: string) => void;
  onWardClick: (county: string, constituency: string, ward: string) => void;
  onAll: () => void;
  lockedCounty?: string;
  lockedConstituency?: string;
}) {
  const [search, setSearch] = useState("");
  const isAll = !selected.county && !selected.constituency && !selected.ward;

  const visibleCounties = lockedCounty
    ? [lockedCounty]
    : counties.filter(c => !search || c.toLowerCase().includes(search.toLowerCase()) ||
        (constituenciesOf[c] ?? []).some(cs => cs.toLowerCase().includes(search.toLowerCase())) ||
        Object.values(wardsOf).flat().some(w => w.toLowerCase().includes(search.toLowerCase()))
      );

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text" placeholder="Search area…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-md border border-gray-200 py-1.5 pl-8 pr-3 text-xs focus:border-blue-500 focus:outline-none" />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {/* All node */}
        {!lockedCounty && (
          <button onClick={onAll}
            className={`w-full rounded-md px-3 py-1.5 text-left text-xs font-semibold ${
              isAll ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}>
            All Stations
          </button>
        )}

        {visibleCounties.map(county => {
          const countyKey = `county:${county}`;
          const isCountyExpanded = expanded.has(countyKey);
          const isCountySelected = selected.county === county && !selected.constituency;
          const constituencies = constituenciesOf[county] ?? [];

          return (
            <div key={county}>
              {/* County row */}
              <div className="flex items-center">
                <button
                  onClick={() => onCountyClick(county)}
                  className={`flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs ${
                    isCountySelected ? "bg-blue-100 font-semibold text-blue-800" : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {loadingNode === countyKey ? (
                    <svg className="h-3 w-3 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  ) : (
                    <svg className={`h-3 w-3 text-gray-400 transition-transform ${isCountyExpanded ? "rotate-90" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                  <span className="truncate font-medium">{county}</span>
                </button>
              </div>

              {/* Constituencies */}
              {isCountyExpanded && constituencies.map(cs => {
                const csKey = `cs:${county}:${cs}`;
                const isCsExpanded = expanded.has(csKey);
                const isCsSelected = selected.county === county && selected.constituency === cs && !selected.ward;
                const wards = wardsOf[csKey] ?? [];

                return (
                  <div key={cs} className="ml-4">
                    <div className="flex items-center">
                      <button
                        onClick={() => onConstituencyClick(county, cs)}
                        className={`flex flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs ${
                          isCsSelected ? "bg-blue-100 font-semibold text-blue-800" : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        {loadingNode === csKey ? (
                          <svg className="h-3 w-3 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                        ) : (
                          <svg className={`h-3 w-3 text-gray-400 transition-transform ${isCsExpanded ? "rotate-90" : ""}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                        <span className="truncate">{cs}</span>
                      </button>
                    </div>

                    {/* Wards */}
                    {isCsExpanded && wards.map(ward => {
                      const isWardSelected = selected.county === county && selected.constituency === cs && selected.ward === ward;
                      return (
                        <button
                          key={ward}
                          onClick={() => onWardClick(county, cs, ward)}
                          className={`ml-4 block w-full rounded-md px-3 py-1 text-left text-xs ${
                            isWardSelected ? "bg-blue-600 text-white font-medium" : "text-gray-500 hover:bg-gray-100"
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            <span className="text-gray-300">–</span>
                            <span className="truncate">{ward}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PollingStationsPage() {
  const { voter } = useAuth();
  const staffRole = voter?.staffRole ?? "";
  const jurisdictionValue = voter?.jurisdictionValue ?? null;

  const isStationRole  = STATION_ROLES.includes(staffRole);
  const canWrite       = WRITE_ROLES.includes(staffRole);
  const canDelete      = DELETE_ROLES.includes(staffRole);
  const canEdit = (s: PollingStation) => {
    if (!canWrite) return false;
    if (staffRole === "PRESIDING_OFFICER" || staffRole === "DEPUTY_PRESIDING_OFFICER") return false; // only their own via detail
    return true;
  };

  // ── Geo tree state ──────────────────────────────────────────────────────────
  const [geoCounties, setGeoCounties] = useState<string[]>([]);
  const [constituenciesOf, setConstituenciesOf] = useState<Record<string, string[]>>({});
  const [wardsOf, setWardsOf] = useState<Record<string, string[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingNode, setLoadingNode] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ county?: string; constituency?: string; ward?: string }>({});

  // ── Station list state ──────────────────────────────────────────────────────
  const [stations, setStations] = useState<PollingStation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const LIMIT = 24;

  // ── Modals ──────────────────────────────────────────────────────────────────
  const [detailStationId, setDetailStationId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingStation, setEditingStation] = useState<PollingStation | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Determine locked jurisdiction (COUNTY_RO, CONSTITUENCY_RO) ─────────────
  const lockedCounty = staffRole === "COUNTY_RO" && jurisdictionValue ? jurisdictionValue : undefined;
  const lockedConstituency = staffRole === "CONSTITUENCY_RO" && jurisdictionValue ? jurisdictionValue : undefined;

  // ── Load counties ───────────────────────────────────────────────────────────
  useEffect(() => {
    api.get<{ success: boolean; data: string[] }>("/api/geo/counties")
      .then(r => setGeoCounties(r.data ?? []))
      .catch(() => {});
  }, []);

  // ── Auto-scope tree on mount ────────────────────────────────────────────────
  const autoScopedRef = useRef(false);
  useEffect(() => {
    if (autoScopedRef.current || !staffRole) return;
    autoScopedRef.current = true;

    if (lockedCounty) {
      // Pre-expand county for COUNTY_RO and set filter
      setSelected({ county: lockedCounty });
      expandCounty(lockedCounty);
    } else if (lockedConstituency) {
      // CONSTITUENCY_RO: need to find which county their constituency is in
      api.get<{ success: boolean; data: Array<{ county: string; constituency: string }> }>(
        `/api/geo/constituencies`
      ).then(r => {
        const match = (r.data ?? []).find(c => c.constituency === lockedConstituency);
        if (match) {
          setSelected({ county: match.county, constituency: lockedConstituency });
          expandCounty(match.county, lockedConstituency);
        }
      }).catch(() => {});
    } else if (isStationRole && jurisdictionValue) {
      // Station role: filter by ward (jurisdiction value)
      setSelected({ ward: jurisdictionValue });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffRole, lockedCounty, lockedConstituency]);

  function expandCounty(county: string, autoExpandConstituency?: string) {
    setLoadingNode(`county:${county}`);
    api.get<{ success: boolean; data: Array<{ constituency: string }> }>(
      `/api/geo/constituencies?county=${encodeURIComponent(county)}`
    ).then(r => {
      const list = (r.data ?? []).map(x => x.constituency);
      setConstituenciesOf(prev => ({ ...prev, [county]: list }));
      setExpanded(prev => new Set([...prev, `county:${county}`]));
      if (autoExpandConstituency) expandConstituency(county, autoExpandConstituency);
    }).finally(() => setLoadingNode(null));
  }

  function expandConstituency(county: string, constituency: string) {
    const csKey = `cs:${county}:${constituency}`;
    setLoadingNode(csKey);
    api.get<{ success: boolean; data: Array<{ ward: string }> }>(
      `/api/geo/wards?constituency=${encodeURIComponent(constituency)}&county=${encodeURIComponent(county)}`
    ).then(r => {
      const list = (r.data ?? []).map(x => x.ward);
      setWardsOf(prev => ({ ...prev, [csKey]: list }));
      setExpanded(prev => new Set([...prev, csKey]));
    }).finally(() => setLoadingNode(null));
  }

  // ── Tree click handlers ─────────────────────────────────────────────────────
  function handleCountyClick(county: string) {
    const key = `county:${county}`;
    if (expanded.has(key)) {
      setExpanded(prev => { const s = new Set(prev); s.delete(key); return s; });
    } else {
      if (!constituenciesOf[county]) expandCounty(county);
      else setExpanded(prev => new Set([...prev, key]));
    }
    setSelected({ county });
    setPage(1);
  }

  function handleConstituencyClick(county: string, constituency: string) {
    const csKey = `cs:${county}:${constituency}`;
    if (expanded.has(csKey)) {
      setExpanded(prev => { const s = new Set(prev); s.delete(csKey); return s; });
    } else {
      if (!wardsOf[csKey]) expandConstituency(county, constituency);
      else setExpanded(prev => new Set([...prev, csKey]));
    }
    setSelected({ county, constituency });
    setPage(1);
  }

  function handleWardClick(county: string, constituency: string, ward: string) {
    setSelected({ county, constituency, ward });
    setPage(1);
  }

  // ── Load stations ───────────────────────────────────────────────────────────
  const loadStations = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      // For station roles, use their ward
      const effectiveWard = isStationRole && jurisdictionValue ? jurisdictionValue : (selected.ward ?? "");
      const effectiveCounty = lockedCounty ?? selected.county ?? "";
      const effectiveConstituency = lockedConstituency ?? selected.constituency ?? "";
      if (effectiveCounty)        params.set("county",        effectiveCounty);
      if (effectiveConstituency)  params.set("constituency",  effectiveConstituency);
      if (effectiveWard)          params.set("ward",          effectiveWard);
      if (search)                 params.set("q",             search);
      const res = await api.get<{ success: boolean; data: PollingStation[]; pagination: { total: number } }>(
        `/api/polling-stations/all?${params}`
      );
      setStations(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load stations");
    } finally {
      setListLoading(false);
    }
  }, [page, search, selected, lockedCounty, lockedConstituency, isStationRole, jurisdictionValue]);

  useEffect(() => { loadStations(); }, [loadStations]);

  // ── Form save ───────────────────────────────────────────────────────────────
  async function handleSave(form: FormData) {
    const body = {
      code:             form.code.trim(),
      name:             form.name.trim(),
      county:           lockedCounty  ?? form.county,
      constituency:     lockedConstituency ?? form.constituency,
      ward:             form.ward.trim(),
      address:          form.address.trim() || null,
      latitude:         form.latitude  ? parseFloat(form.latitude)  : null,
      longitude:        form.longitude ? parseFloat(form.longitude) : null,
      isDiaspora:       form.isDiaspora,
      country:          form.country.trim() || null,
      registeredVoters: parseInt(form.registeredVoters) || 0,
      deviceCount:      parseInt(form.deviceCount)      || 0,
      printerCount:     parseInt(form.printerCount)     || 0,
      openingTime:      form.openingTime || null,
      closingTime:      form.closingTime || null,
    };
    if (editingStation) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { code: _c, isDiaspora: _d, ...patchBody } = body;
      await api.patch(`/api/polling-stations/${editingStation.id}`, patchBody);
    } else {
      await api.post("/api/polling-stations", body);
    }
    setShowForm(false);
    setEditingStation(null);
    await loadStations();
  }

  function openEdit(s: PollingStation) {
    setEditingStation(s);
    setShowForm(true);
    setDetailStationId(null);
  }

  function openCreate() {
    setEditingStation(null);
    setShowForm(true);
  }

  async function handleToggle(s: PollingStation) {
    try {
      await api.patch(`/api/polling-stations/${s.id}`, { isActive: !s.isActive });
      await loadStations();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/polling-stations/${id}`);
      setDeletingId(null);
      await loadStations();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  // ── Breadcrumb label ────────────────────────────────────────────────────────
  const breadcrumb = isStationRole
    ? `My Station — ${jurisdictionValue ?? ""}`
    : lockedConstituency
    ? `${lockedConstituency} Constituency`
    : lockedCounty
    ? `${lockedCounty} County`
    : selected.ward
    ? `${selected.county} › ${selected.constituency} › ${selected.ward}`
    : selected.constituency
    ? `${selected.county} › ${selected.constituency}`
    : selected.county
    ? `${selected.county} County`
    : "All Stations";

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Geo tree sidebar (hidden for station-level roles) ─────────────── */}
      {!isStationRole && (
        <aside className="w-56 shrink-0 overflow-hidden border-r border-gray-200 bg-gray-50">
          <div className="border-b border-gray-200 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Jurisdiction Tree</p>
          </div>
          <GeoTree
            counties={geoCounties}
            constituenciesOf={constituenciesOf}
            wardsOf={wardsOf}
            expanded={expanded}
            loadingNode={loadingNode}
            selected={selected}
            onCountyClick={handleCountyClick}
            onConstituencyClick={handleConstituencyClick}
            onWardClick={handleWardClick}
            onAll={() => { setSelected({}); setPage(1); }}
            lockedCounty={lockedCounty}
            lockedConstituency={lockedConstituency}
          />
        </aside>
      )}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{breadcrumb}</h1>
            <p className="mt-0.5 text-xs text-gray-500">
              {listLoading ? "Loading…" : `${total.toLocaleString()} station${total !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
              </svg>
              <input
                type="text" placeholder="Search name or code…" value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="rounded-md border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none w-52" />
            </div>
            {canWrite && !isStationRole && (
              <button onClick={openCreate}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Station
              </button>
            )}
          </div>
        </div>

        {/* Station grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {listError && (
            <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{listError}</div>
          )}

          {listLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
          ) : stations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center text-gray-400">
              <p className="text-base font-medium">No stations found</p>
              <p className="mt-1 text-sm">
                {search ? "Try a different search term" : "Select a jurisdiction from the tree or add a new station"}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {stations.map(s => (
                <StationCard
                  key={s.id}
                  station={s}
                  canWrite={canWrite}
                  canDelete={canDelete}
                  canEdit={canEdit(s)}
                  onEdit={() => openEdit(s)}
                  onToggle={() => handleToggle(s)}
                  onDelete={() => setDeletingId(s.id)}
                  onSelect={() => setDetailStationId(s.id)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Page {page} of {totalPages} &middot; {total.toLocaleString()} stations
              </span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="rounded border border-gray-300 px-3 py-1 text-xs disabled:opacity-40 hover:bg-gray-50">
                  Previous
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="rounded border border-gray-300 px-3 py-1 text-xs disabled:opacity-40 hover:bg-gray-50">
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Detail modal ──────────────────────────────────────────────────── */}
      {detailStationId && (
        <StationDetailModal
          stationId={detailStationId}
          onClose={() => setDetailStationId(null)}
          onEdit={() => {
            const s = stations.find(x => x.id === detailStationId);
            if (s) openEdit(s);
          }}
        />
      )}

      {/* ── Create / Edit form ────────────────────────────────────────────── */}
      {showForm && (
        <StationForm
          editingId={editingStation?.id ?? null}
          initialForm={editingStation ? {
            code: editingStation.code, name: editingStation.name,
            county: editingStation.county, constituency: editingStation.constituency,
            ward: editingStation.ward,
            address: editingStation.address ?? "", latitude: editingStation.latitude != null ? String(editingStation.latitude) : "",
            longitude: editingStation.longitude != null ? String(editingStation.longitude) : "",
            isDiaspora: editingStation.isDiaspora, country: editingStation.country ?? "",
            registeredVoters: String(editingStation.registeredVoters),
            deviceCount: String(editingStation.deviceCount ?? 0),
            printerCount: String(editingStation.printerCount ?? 0),
            openingTime: editingStation.openingTime ? new Date(editingStation.openingTime).toISOString().slice(0, 16) : "",
            closingTime: editingStation.closingTime ? new Date(editingStation.closingTime).toISOString().slice(0, 16) : "",
          } : {
            ...EMPTY_FORM,
            county: lockedCounty ?? selected.county ?? "",
            constituency: lockedConstituency ?? selected.constituency ?? "",
            ward: selected.ward ?? "",
          }}
          lockedCounty={lockedCounty}
          lockedConstituency={lockedConstituency}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingStation(null); }}
        />
      )}

      {/* ── Delete confirmation ───────────────────────────────────────────── */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Delete Polling Station?</h2>
            <p className="mt-2 text-sm text-gray-500">
              Permanently removes the station. Stations with registered voters or votes cannot be
              deleted — deactivate them instead.
            </p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => handleDelete(deletingId)}
                className="flex-1 rounded-md bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700">
                Delete Station
              </button>
              <button onClick={() => setDeletingId(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
