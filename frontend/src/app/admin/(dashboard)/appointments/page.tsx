"use client";

import { useEffect, useState, useCallback, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { Header } from "@/components/header";
import { DataTable } from "@/components/data-table";
import { Pagination } from "@/components/pagination";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import type {
  PaginatedResponse,
  PollingStation,
  Appointment,
  SlotCreationResult,
  SlotDeletionResult,
  ApiResponse,
  ColumnDef,
} from "@/lib/types";

const APPOINTMENT_STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  AVAILABLE: { label: "Available", color: "text-gray-800", bg: "bg-gray-100" },
  BOOKED: { label: "Booked", color: "text-blue-800", bg: "bg-blue-100" },
  COMPLETED: { label: "Completed", color: "text-green-800", bg: "bg-green-100" },
  NO_SHOW: { label: "No Show", color: "text-red-800", bg: "bg-red-100" },
  CANCELLED: { label: "Cancelled", color: "text-gray-800", bg: "bg-gray-200" },
};

export default function AppointmentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page")) || 1;

  const [stations, setStations] = useState<PollingStation[]>([]);
  const [error, setError] = useState("");

  // Create slots state
  const [createStation, setCreateStation] = useState("");
  const [createDate, setCreateDate] = useState("");
  const [startHour, setStartHour] = useState("8");
  const [endHour, setEndHour] = useState("17");
  const [duration, setDuration] = useState("15");
  const [createLoading, setCreateLoading] = useState(false);
  const [createResult, setCreateResult] = useState<SlotCreationResult | null>(null);
  const [createError, setCreateError] = useState("");

  // Delete slots state
  const [deleteStation, setDeleteStation] = useState("");
  const [deleteFromDate, setDeleteFromDate] = useState("");
  const [deleteToDate, setDeleteToDate] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteResult, setDeleteResult] = useState<SlotDeletionResult | null>(null);
  const [deleteError, setDeleteError] = useState("");

  // Scheduled appointments state
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const [tableLoading, setTableLoading] = useState(true);
  const [filterStation, setFilterStation] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ success: boolean } & PaginatedResponse<PollingStation>>(
        "/api/polling-stations?limit=100"
      )
      .then((res) => {
        if (res.data) setStations(res.data);
      })
      .catch(() => {});
  }, []);

  const loadAppointments = useCallback(async () => {
    setTableLoading(true);
    setError("");
    try {
      let url = `/api/appointments/scheduled?page=${page}&limit=20`;
      if (filterStation) url += `&pollingStationId=${filterStation}`;
      if (filterDate) url += `&date=${filterDate}`;
      const res = await api.get<
        { success: boolean } & PaginatedResponse<Appointment>
      >(url);
      if (res.data) setAppointments(res.data);
      if (res.pagination) setPagination(res.pagination);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load appointments"
      );
    } finally {
      setTableLoading(false);
    }
  }, [page, filterStation, filterDate]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  function handlePageChange(newPage: number) {
    const params = new URLSearchParams();
    params.set("page", String(newPage));
    if (filterStation) params.set("station", filterStation);
    if (filterDate) params.set("date", filterDate);
    router.push(`/admin/appointments?${params.toString()}`);
  }

  async function handleCreateSlots(e: FormEvent) {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError("");
    setCreateResult(null);
    try {
      const res = await api.post<ApiResponse<SlotCreationResult>>(
        "/api/appointments/create-slots",
        {
          pollingStationId: createStation,
          date: createDate,
          startHour: Number(startHour),
          endHour: Number(endHour),
          slotDurationMinutes: Number(duration),
        }
      );
      if (res.success && res.data) {
        setCreateResult(res.data);
        loadAppointments();
      } else {
        setCreateError(res.error || "Failed to create slots");
      }
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create slots"
      );
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleDeleteSlots(e: FormEvent) {
    e.preventDefault();
    setDeleteLoading(true);
    setDeleteError("");
    setDeleteResult(null);
    try {
      const res = await api.delete<ApiResponse<SlotDeletionResult>>(
        "/api/appointments/slots",
        {
          pollingStationId: deleteStation,
          fromDate: deleteFromDate,
          toDate: deleteToDate,
        }
      );
      if (res.success && res.data) {
        setDeleteResult(res.data);
        loadAppointments();
      } else {
        setDeleteError(res.error || "Failed to delete slots");
      }
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete slots"
      );
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleComplete(id: string) {
    setActionLoading(id);
    try {
      const res = await api.post<ApiResponse<Appointment>>(
        `/api/appointments/${id}/complete`
      );
      if (res.success) {
        loadAppointments();
      } else {
        setError(res.error || "Failed to complete appointment");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to complete appointment"
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleNoShow(id: string) {
    setActionLoading(id);
    try {
      const res = await api.post<ApiResponse<Appointment>>(
        `/api/appointments/${id}/no-show`
      );
      if (res.success) {
        loadAppointments();
      } else {
        setError(res.error || "Failed to mark no-show");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to mark no-show"
      );
    } finally {
      setActionLoading(null);
    }
  }

  const columns: ColumnDef<Appointment>[] = [
    {
      key: "voter",
      header: "Voter National ID",
      render: (row) => row.voter?.nationalId ?? "—",
    },
    {
      key: "pollingStationId",
      header: "Station",
      render: (row) => {
        const station = stations.find((s) => s.id === row.pollingStationId);
        return station ? `${station.code} — ${station.name}` : row.pollingStationId;
      },
    },
    {
      key: "scheduledAt",
      header: "Date/Time",
      render: (row) => new Date(row.scheduledAt).toLocaleString(),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const style = APPOINTMENT_STATUS_STYLES[row.status] || {
          label: row.status,
          color: "text-gray-800",
          bg: "bg-gray-100",
        };
        return (
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.color}`}
          >
            {style.label}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) =>
        row.status === "BOOKED" ? (
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleComplete(row.id);
              }}
              disabled={actionLoading === row.id}
              className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Complete
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNoShow(row.id);
              }}
              disabled={actionLoading === row.id}
              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              No-Show
            </button>
          </div>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
  ];

  const selectClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none";
  const inputClass = selectClass;

  return (
    <>
      <Header title="Appointments" />
      <div className="p-6 space-y-6">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Create Slots */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Create Appointment Slots
          </h2>
          {createError && (
            <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {createError}
            </div>
          )}
          {createResult && (
            <div className="mb-3 rounded-md bg-green-50 p-3 text-sm text-green-700">
              Created {createResult.slotsCreated} slots for{" "}
              {createResult.date}
            </div>
          )}
          <form onSubmit={handleCreateSlots} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Station
              </label>
              <select
                required
                value={createStation}
                onChange={(e) => setCreateStation(e.target.value)}
                className={selectClass}
              >
                <option value="">Select...</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Date
              </label>
              <input
                type="date"
                required
                value={createDate}
                onChange={(e) => setCreateDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Start Hour
              </label>
              <select
                value={startHour}
                onChange={(e) => setStartHour(e.target.value)}
                className={selectClass}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                End Hour
              </label>
              <select
                value={endHour}
                onChange={(e) => setEndHour(e.target.value)}
                className={selectClass}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {String(i + 1).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Duration (min)
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className={selectClass}
              >
                {[5, 10, 15, 20, 30, 45, 60].map((d) => (
                  <option key={d} value={d}>
                    {d} min
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={createLoading}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {createLoading ? "Creating..." : "Create Slots"}
              </button>
            </div>
          </form>
        </div>

        {/* Delete Slots */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Delete Available Slots
          </h2>
          {deleteError && (
            <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {deleteError}
            </div>
          )}
          {deleteResult && (
            <div className="mb-3 rounded-md bg-green-50 p-3 text-sm text-green-700">
              Deleted {deleteResult.deletedCount} available slots
            </div>
          )}
          <form onSubmit={handleDeleteSlots} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Station
              </label>
              <select
                required
                value={deleteStation}
                onChange={(e) => setDeleteStation(e.target.value)}
                className={selectClass}
              >
                <option value="">Select...</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                From Date
              </label>
              <input
                type="date"
                required
                value={deleteFromDate}
                onChange={(e) => setDeleteFromDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                To Date
              </label>
              <input
                type="date"
                required
                value={deleteToDate}
                onChange={(e) => setDeleteToDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={deleteLoading}
                className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? "Deleting..." : "Delete Slots"}
              </button>
            </div>
          </form>
        </div>

        {/* Scheduled Appointments Table */}
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-4 border-b border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-900">
              Scheduled Appointments
            </h2>
            <select
              value={filterStation}
              onChange={(e) => {
                setFilterStation(e.target.value);
                router.push("/admin/appointments?page=1");
              }}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">All Stations</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => {
                setFilterDate(e.target.value);
                router.push("/admin/appointments?page=1");
              }}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
            {(filterStation || filterDate) && (
              <button
                onClick={() => {
                  setFilterStation("");
                  setFilterDate("");
                  router.push("/admin/appointments?page=1");
                }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear filters
              </button>
            )}
          </div>
          {tableLoading ? (
            <div className="p-4">
              <LoadingSkeleton rows={10} />
            </div>
          ) : (
            <>
              <DataTable columns={columns} data={appointments} />
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                hasNext={pagination.hasNext}
                hasPrev={pagination.hasPrev}
                onPageChange={handlePageChange}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
