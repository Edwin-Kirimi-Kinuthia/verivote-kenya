"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api-client";
import type { PollingStation } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────────

interface StationFormData {
  code: string;
  name: string;
  county: string;
  constituency: string;
  ward: string;
  address: string;
  latitude: string;
  longitude: string;
  isDiaspora: boolean;
  country: string;
  registeredVoters: string;
}

const EMPTY_FORM: StationFormData = {
  code: "", name: "", county: "", constituency: "", ward: "",
  address: "", latitude: "", longitude: "",
  isDiaspora: false, country: "", registeredVoters: "0",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function PollingStationsPage() {
  const { voter } = useAuth();
  const canWrite  = ["COMMISSIONER","NATIONAL_RO","COUNTY_RO","CONSTITUENCY_RO","PRESIDING_OFFICER","ICT_ADMIN"].includes(voter?.staffRole ?? "");
  const canDelete = ["COMMISSIONER","NATIONAL_RO","COUNTY_RO","CONSTITUENCY_RO"].includes(voter?.staffRole ?? "");

  const [stations, setStations]   = useState<PollingStation[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  // Filters
  const [search, setSearch]             = useState("");
  const [filterCounty, setFilterCounty] = useState("");
  const [page, setPage]                 = useState(1);
  const LIMIT = 50;

  // Form state
  const [showForm, setShowForm]       = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [form, setForm]               = useState<StationFormData>(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);

  // Delete confirmation
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [deleting, setDeleting]       = useState(false);

  const loadStations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search)       params.set("q",      search);
      if (filterCounty) params.set("county", filterCounty);
      const res = await api.get<{ success: boolean; data: PollingStation[]; pagination: { total: number } }>(
        `/api/polling-stations/all?${params}`
      );
      setStations(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stations");
    } finally {
      setLoading(false);
    }
  }, [page, search, filterCounty]);

  useEffect(() => { loadStations(); }, [loadStations]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(s: PollingStation) {
    setEditingId(s.id);
    setForm({
      code:             s.code,
      name:             s.name,
      county:           s.county,
      constituency:     s.constituency,
      ward:             s.ward,
      address:          s.address ?? "",
      latitude:         s.latitude != null ? String(s.latitude) : "",
      longitude:        s.longitude != null ? String(s.longitude) : "",
      isDiaspora:       s.isDiaspora,
      country:          s.country ?? "",
      registeredVoters: String(s.registeredVoters),
    });
    setFormError(null);
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const body = {
      code:             form.code.trim(),
      name:             form.name.trim(),
      county:           form.county.trim(),
      constituency:     form.constituency.trim(),
      ward:             form.ward.trim(),
      address:          form.address.trim() || null,
      latitude:         form.latitude  ? parseFloat(form.latitude)  : null,
      longitude:        form.longitude ? parseFloat(form.longitude) : null,
      isDiaspora:       form.isDiaspora,
      country:          form.country.trim() || null,
      registeredVoters: parseInt(form.registeredVoters) || 0,
    };

    try {
      if (editingId) {
        // PATCH — exclude code and isDiaspora (immutable after creation); country is kept
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { code: _code, isDiaspora: _dia, ...patchBody } = body;
        await api.patch(`/api/polling-stations/${editingId}`, patchBody);
      } else {
        await api.post("/api/polling-stations", body);
      }
      setShowForm(false);
      await loadStations();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await api.delete(`/api/polling-stations/${id}`);
      setDeletingId(null);
      await loadStations();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleActive(s: PollingStation) {
    try {
      await api.patch(`/api/polling-stations/${s.id}`, { isActive: !s.isActive });
      await loadStations();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update status");
    }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Polling Stations</h1>
          <p className="mt-1 text-sm text-gray-500">
            {total.toLocaleString()} stations · manage locations, coordinates, and status
          </p>
        </div>
        {canWrite && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Station
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-3">
        <input
          type="text"
          placeholder="Search by name or code…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <input
          type="text"
          placeholder="Filter by county…"
          value={filterCounty}
          onChange={(e) => { setFilterCounty(e.target.value); setPage(1); }}
          className="w-48 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Error */}
      {error && <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-gray-400">Loading stations...</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Code</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Name</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">County</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Constituency</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Coordinates</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Voters</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Status</th>
                {canWrite && <th className="px-3 py-3 text-left font-medium text-gray-600">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stations.map((s) => (
                <tr key={s.id} className={`hover:bg-gray-50 ${!s.isActive ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-700">{s.code}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-900">{s.name}</div>
                    {s.address && <div className="text-xs text-gray-400 truncate max-w-[200px]">{s.address}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{s.county}</td>
                  <td className="px-3 py-2.5 text-gray-600">{s.constituency}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-500">
                    {s.latitude != null && s.longitude != null
                      ? `${Number(s.latitude).toFixed(4)}, ${Number(s.longitude).toFixed(4)}`
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{s.registeredVoters.toLocaleString()}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
                    }`}>
                      {s.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(s)}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(s)}
                          className={`text-xs ${s.isActive ? "text-orange-600 hover:text-orange-800" : "text-green-600 hover:text-green-800"}`}
                        >
                          {s.isActive ? "Deactivate" : "Reactivate"}
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => setDeletingId(s.id)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <span className="text-xs text-gray-500">
                Page {page} of {totalPages} · {total.toLocaleString()} stations
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded border border-gray-300 px-3 py-1 text-xs disabled:opacity-40 hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded border border-gray-300 px-3 py-1 text-xs disabled:opacity-40 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Create / Edit form modal ─────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? "Edit Polling Station" : "Add New Polling Station"}
              </h2>
            </div>
            <form onSubmit={handleSave} className="p-6">
              <div className="grid grid-cols-2 gap-4">
                {/* Code — only for create */}
                {!editingId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Station Code *</label>
                    <input
                      type="text"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      required
                      placeholder="e.g. NAI-WL-001"
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                )}

                {/* Name */}
                <div className={editingId ? "col-span-2" : ""}>
                  <label className="block text-sm font-medium text-gray-700">Station Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    placeholder="e.g. Westlands Primary School"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* County */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">County *</label>
                  <input
                    type="text"
                    value={form.county}
                    onChange={(e) => setForm({ ...form, county: e.target.value })}
                    required
                    placeholder="e.g. Nairobi"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Constituency */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Constituency *</label>
                  <input
                    type="text"
                    value={form.constituency}
                    onChange={(e) => setForm({ ...form, constituency: e.target.value })}
                    required
                    placeholder="e.g. Westlands"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Ward */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Ward *</label>
                  <input
                    type="text"
                    value={form.ward}
                    onChange={(e) => setForm({ ...form, ward: e.target.value })}
                    required
                    placeholder="e.g. Parklands/Highridge"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Address</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Street address or landmark"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Latitude */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={form.latitude}
                    onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                    placeholder="e.g. -1.2921"
                    min="-90" max="90"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Longitude */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={form.longitude}
                    onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                    placeholder="e.g. 36.8219"
                    min="-180" max="180"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Registered voters */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Registered Voters</label>
                  <input
                    type="number"
                    min="0"
                    value={form.registeredVoters}
                    onChange={(e) => setForm({ ...form, registeredVoters: e.target.value })}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Diaspora toggle — create only */}
                {!editingId && (
                  <div className="flex items-center gap-3 pt-6">
                    <input
                      type="checkbox"
                      id="isDiaspora"
                      checked={form.isDiaspora}
                      onChange={(e) => setForm({ ...form, isDiaspora: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <label htmlFor="isDiaspora" className="text-sm font-medium text-gray-700">
                      Diaspora station (abroad)
                    </label>
                  </div>
                )}

                {/* Country — diaspora only */}
                {!editingId && form.isDiaspora && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Country *</label>
                    <input
                      type="text"
                      value={form.country}
                      onChange={(e) => setForm({ ...form, country: e.target.value })}
                      required={form.isDiaspora}
                      placeholder="e.g. United Kingdom"
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {formError && (
                <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{formError}</div>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Create Station"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setFormError(null); }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ──────────────────────────────────────── */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Delete Polling Station?</h2>
            <p className="mt-2 text-sm text-gray-500">
              This will permanently remove the station. Stations with registered voters or votes
              cannot be deleted — deactivate them instead.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => handleDelete(deletingId)}
                disabled={deleting}
                className="flex-1 rounded-md bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete Station"}
              </button>
              <button
                onClick={() => setDeletingId(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
