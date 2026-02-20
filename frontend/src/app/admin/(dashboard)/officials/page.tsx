"use client";

import { useEffect, useState, useCallback, type FormEvent } from "react";
import { api } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import { Header } from "@/components/header";
import { DataTable } from "@/components/data-table";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import type { PaginatedResponse, Voter, ApiResponse, ColumnDef } from "@/lib/types";

export default function OfficialsPage() {
  const { voter: currentVoter } = useAuth();

  const [officials, setOfficials] = useState<Voter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add official form
  const [nationalId, setNationalId] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");

  // Remove
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);

  const loadOfficials = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<{ success: boolean } & PaginatedResponse<Voter>>(
        "/api/admin/officials"
      );
      if (res.data) setOfficials(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load officials");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOfficials();
  }, [loadOfficials]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    setAddError("");
    setAddSuccess("");
    try {
      const res = await api.post<ApiResponse<Voter>>("/api/admin/officials", { nationalId });
      if (res.success) {
        setAddSuccess(`Official added successfully (ID: ${nationalId})`);
        setNationalId("");
        loadOfficials();
      } else {
        setAddError(res.error || "Failed to add official");
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add official");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemove(voterId: string) {
    setRemoveLoading(voterId);
    setError("");
    try {
      const res = await api.delete<ApiResponse<Voter>>(`/api/admin/officials/${voterId}`);
      if (res.success) {
        loadOfficials();
      } else {
        setError(res.error || "Failed to remove official");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove official");
    } finally {
      setRemoveLoading(null);
    }
  }

  const columns: ColumnDef<Voter>[] = [
    { key: "nationalId", header: "National ID" },
    {
      key: "createdAt",
      header: "Registered",
      render: (row) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) =>
        row.id === currentVoter?.id ? (
          <span className="text-xs text-gray-400">Current user</span>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRemove(row.id);
            }}
            disabled={removeLoading === row.id}
            className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {removeLoading === row.id ? "Removing..." : "Remove"}
          </button>
        ),
    },
  ];

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none";

  return (
    <>
      <Header title="IEBC Officials" />
      <div className="p-6 space-y-6">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* Add official */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">Add IEBC Official</h2>
          <p className="mb-4 text-xs text-gray-500">
            Enter the national ID of a registered voter to grant them admin access.
          </p>

          {addError && (
            <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{addError}</div>
          )}
          {addSuccess && (
            <div className="mb-3 rounded-md bg-green-50 p-3 text-sm text-green-700">
              {addSuccess}
            </div>
          )}

          <form onSubmit={handleAdd} className="flex gap-3">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{8}"
              maxLength={8}
              required
              placeholder="National ID (8 digits)"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ""))}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={addLoading || nationalId.length !== 8}
              className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {addLoading ? "Adding..." : "Add Official"}
            </button>
          </form>
        </div>

        {/* Officials table */}
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Current Officials{" "}
              {!loading && (
                <span className="font-normal text-gray-400">({officials.length})</span>
              )}
            </h2>
          </div>
          {loading ? (
            <div className="p-4">
              <LoadingSkeleton rows={5} />
            </div>
          ) : (
            <DataTable columns={columns} data={officials} />
          )}
        </div>
      </div>
    </>
  );
}
