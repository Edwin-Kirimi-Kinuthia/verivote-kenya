"use client";

import { useEffect, useState, useCallback, type FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
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
  ApproveResult,
  SetupLinkResult,
} from "@/lib/types";

const APPOINTMENT_STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  AVAILABLE: { label: "Available", color: "text-gray-800", bg: "bg-gray-100" },
  BOOKED: { label: "Booked", color: "text-blue-800", bg: "bg-blue-100" },
  COMPLETED: { label: "Completed", color: "text-green-800", bg: "bg-green-100" },
  NO_SHOW: { label: "No Show", color: "text-red-800", bg: "bg-red-100" },
  CANCELLED: { label: "Cancelled", color: "text-gray-800", bg: "bg-gray-200" },
};

export default function AppointmentsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading appointments…</div>}>
      <AppointmentsContent />
    </Suspense>
  );
}

function AppointmentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page")) || 1;
  const { voter } = useAuth();

  const [stations, setStations] = useState<PollingStation[]>([]);
  const [error, setError] = useState("");

  // Create slots state
  const [createStation, setCreateStation] = useState("");
  const [createFromDate, setCreateFromDate] = useState("");
  const [createToDate, setCreateToDate] = useState("");
  // Days of week: index 0=Mon, 1=Tue, ..., 5=Sat, 6=Sun (ISO: Mon=1 .. Sun=7)
  const [daysOfWeek, setDaysOfWeek] = useState<boolean[]>([true, true, true, true, true, true, false]);
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

  // Approve / reject registration action state
  const [activeAction, setActiveAction] = useState<{
    appointmentId: string;
    type: "approve" | "reject";
  } | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [actionError, setActionError] = useState("");
  const [appointmentActionLoading, setAppointmentActionLoading] = useState(false);

  // Post-approval fingerprint + setup-link flow
  const [postApproval, setPostApproval] = useState<{
    voterId: string;
    nationalId: string;
    step: "fingerprint" | "done";
    contact?: string;
  } | null>(null);
  const [fpLoading, setFpLoading] = useState(false);
  const [fpError, setFpError] = useState("");
  const [fpEnrolled, setFpEnrolled] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);

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
    // Convert boolean array (Mon-Sun) to ISO day numbers (1=Mon, 7=Sun)
    const selectedDays = daysOfWeek
      .map((checked, i) => (checked ? i + 1 : null))
      .filter((d): d is number => d !== null);
    try {
      const res = await api.post<ApiResponse<SlotCreationResult>>(
        "/api/appointments/create-slots",
        {
          pollingStationId: createStation,
          fromDate: createFromDate,
          toDate: createToDate,
          daysOfWeek: selectedDays,
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

  function openAction(appointmentId: string, type: "approve" | "reject") {
    setActiveAction({ appointmentId, type });
    setActionNotes("");
    setActionError("");
    setPostApproval(null);
  }

  function cancelAction() {
    setActiveAction(null);
    setActionNotes("");
    setActionError("");
  }

  async function handleApproveVoter() {
    if (!activeAction) return;
    setAppointmentActionLoading(true);
    setActionError("");
    try {
      const res = await api.post<ApiResponse<ApproveResult>>(
        `/api/appointments/${activeAction.appointmentId}/approve-voter`,
        { reviewerId: voter?.id, notes: actionNotes || undefined }
      );
      if (res.success && res.data) {
        setActiveAction(null);
        setFpEnrolled(false);
        setFpError("");
        setPostApproval({
          voterId: res.data.voterId,
          nationalId: res.data.nationalId,
          step: "fingerprint",
        });
        loadAppointments();
      } else {
        setActionError(res.error || "Approval failed");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setAppointmentActionLoading(false);
    }
  }

  async function handleRejectVoter() {
    if (!activeAction) return;
    if (!actionNotes.trim()) {
      setActionError("Rejection reason is required");
      return;
    }
    setAppointmentActionLoading(true);
    setActionError("");
    try {
      const res = await api.post<ApiResponse<unknown>>(
        `/api/appointments/${activeAction.appointmentId}/reject-voter`,
        { reviewerId: voter?.id, reason: actionNotes }
      );
      if (res.success) {
        setActiveAction(null);
        loadAppointments();
      } else {
        setActionError(res.error || "Rejection failed");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setAppointmentActionLoading(false);
    }
  }

  // ── Fingerprint enrollment + setup link ────────────────────────────────────

  async function handleEnrollFingerprint() {
    if (!postApproval) return;
    setFpError("");
    setFpLoading(true);
    try {
      const optRes = await api.post<ApiResponse<Record<string, unknown>>>(
        "/api/webauthn/register/options",
        { voterId: postApproval.voterId }
      );
      if (!optRes.success || !optRes.data)
        throw new Error("Failed to get fingerprint options");
      const { startRegistration } = await import("@simplewebauthn/browser");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attResp = await startRegistration({ optionsJSON: optRes.data as any });
      const verRes = await api.post<ApiResponse<{ verified: boolean }>>(
        "/api/webauthn/register/verify",
        { voterId: postApproval.voterId, response: attResp }
      );
      if (!verRes.success || !verRes.data?.verified)
        throw new Error("Fingerprint verification failed");
      setFpEnrolled(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fingerprint enrollment failed";
      setFpError(
        msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("user")
          ? "Fingerprint scan was cancelled. Please ask the voter to try again."
          : msg
      );
    } finally {
      setFpLoading(false);
    }
  }

  async function handleSendLink() {
    if (!postApproval) return;
    setFpError("");
    setLinkLoading(true);
    try {
      const res = await api.post<ApiResponse<SetupLinkResult>>(
        "/api/admin/send-setup-link",
        { voterId: postApproval.voterId }
      );
      if (!res.success || !res.data) {
        setFpError(res.error || "Failed to send setup link");
        return;
      }
      setPostApproval((prev) =>
        prev ? { ...prev, step: "done", contact: res.data!.contact } : null
      );
    } catch (err) {
      setFpError(err instanceof Error ? err.message : "Failed to send setup link");
    } finally {
      setLinkLoading(false);
    }
  }

  async function handleSkipFingerprint() {
    setFpEnrolled(false);
    await handleSendLink();
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
      key: "purpose",
      header: "Purpose",
      render: (row) => {
        if (row.purpose === "PIN_RESET") {
          return (
            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
              PIN Reset
            </span>
          );
        }
        return (
          <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            Identity Verification
          </span>
        );
      },
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
          row.purpose === "REGISTRATION" ? (
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openAction(row.id, "approve");
                }}
                disabled={appointmentActionLoading}
                className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openAction(row.id, "reject");
                }}
                disabled={appointmentActionLoading}
                className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          ) : (
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
          )
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
              Created {createResult.slotsCreated} slots ({createResult.fromDate} – {createResult.toDate})
            </div>
          )}
          <form onSubmit={handleCreateSlots} className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
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
                  From Date
                </label>
                <input
                  type="date"
                  required
                  value={createFromDate}
                  onChange={(e) => setCreateFromDate(e.target.value)}
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
                  value={createToDate}
                  onChange={(e) => setCreateToDate(e.target.value)}
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
            </div>

            {/* Days of week */}
            <div>
              <label className="mb-2 block text-xs font-medium text-gray-700">
                Days of Week
              </label>
              <div className="flex flex-wrap gap-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => (
                  <label key={day} className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={daysOfWeek[i]}
                      onChange={(e) => {
                        const next = [...daysOfWeek];
                        next[i] = e.target.checked;
                        setDaysOfWeek(next);
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className={`text-sm font-medium ${daysOfWeek[i] ? "text-gray-900" : "text-gray-400"}`}>
                      {day}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={createLoading}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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

        {/* Post-approval: fingerprint enrollment */}
        {postApproval && postApproval.step === "fingerprint" && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-white font-bold text-[10px]">✓</span>
              <span className="text-sm font-medium text-green-700">Voter approved — SBT minted</span>
              <span className="flex-1 border-t border-blue-200" />
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-[10px]">2</span>
              <span className="text-sm font-medium text-blue-700">Capture fingerprint</span>
              <span className="flex-1 border-t border-blue-200" />
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-300 text-gray-600 font-bold text-[10px]">3</span>
              <span className="text-sm text-gray-400">Send PIN link</span>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <strong>IEBC Officer:</strong> Ask voter <strong>{postApproval.nationalId}</strong> to place
              their finger on the biometric reader or use Windows Hello / Face ID on this device.
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-center space-y-3">
              <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${fpEnrolled ? "bg-green-100" : "bg-blue-50"}`}>
                {fpEnrolled ? (
                  <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
                  </svg>
                )}
              </div>
              {fpEnrolled ? (
                <p className="text-sm font-semibold text-green-700">Fingerprint enrolled</p>
              ) : (
                <p className="text-sm text-gray-700">Ready to capture fingerprint</p>
              )}
              {fpError && (
                <div className="rounded-md bg-red-50 p-2 text-xs text-red-700">{fpError}</div>
              )}
              {!fpEnrolled && (
                <button
                  type="button"
                  onClick={handleEnrollFingerprint}
                  disabled={fpLoading}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {fpLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Waiting for scan…
                    </span>
                  ) : "Scan Fingerprint"}
                </button>
              )}
              {fpEnrolled && (
                <button
                  type="button"
                  onClick={handleSendLink}
                  disabled={linkLoading}
                  className="w-full rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {linkLoading ? "Sending link…" : "Send PIN Setup Link →"}
                </button>
              )}
            </div>
            <p className="text-xs text-blue-600">
              FIDO2/WebAuthn — only a cryptographic key is stored, no biometric data leaves this device.
            </p>
            {!fpEnrolled && (
              <button
                type="button"
                onClick={handleSkipFingerprint}
                disabled={linkLoading || fpLoading}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                {linkLoading ? "Sending link…" : "Skip fingerprint — device not available"}
              </button>
            )}
          </div>
        )}

        {/* Post-approval: done */}
        {postApproval && postApproval.step === "done" && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-5">
            <h3 className="mb-3 text-sm font-semibold text-green-900">Voter Approved &amp; Notified</h3>
            <ul className="space-y-2 text-sm text-green-800">
              <li className="flex items-start gap-2">
                <span className="text-green-600">✓</span>
                <span>Identity verified — SBT minted on-chain</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600">{fpEnrolled ? "✓" : "–"}</span>
                <span>{fpEnrolled ? "Biometric credential enrolled" : "Fingerprint skipped — voter can enroll later"}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600">✓</span>
                <span>PIN setup link sent to <span className="font-medium">{postApproval.contact}</span></span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-green-600">
              The voter will set their own PIN privately. Neither PIN is visible to officers.
            </p>
            <button
              onClick={() => setPostApproval(null)}
              className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Action panel — approve or reject a REGISTRATION appointment */}
        {activeAction && (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">
              {activeAction.type === "approve"
                ? "Approve Voter Registration"
                : "Reject Voter Registration"}
            </h2>
            {actionError && (
              <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
                {actionError}
              </div>
            )}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {activeAction.type === "approve"
                  ? "Notes (optional)"
                  : "Rejection reason (required)"}
              </label>
              <textarea
                rows={3}
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder={
                  activeAction.type === "approve"
                    ? "e.g. Identity confirmed in person"
                    : "e.g. Document did not match national ID"
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-3">
              {activeAction.type === "approve" ? (
                <button
                  onClick={handleApproveVoter}
                  disabled={appointmentActionLoading}
                  className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {appointmentActionLoading ? "Approving..." : "Confirm Approval"}
                </button>
              ) : (
                <button
                  onClick={handleRejectVoter}
                  disabled={appointmentActionLoading}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {appointmentActionLoading ? "Rejecting..." : "Confirm Rejection"}
                </button>
              )}
              <button
                onClick={cancelAction}
                disabled={appointmentActionLoading}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

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
