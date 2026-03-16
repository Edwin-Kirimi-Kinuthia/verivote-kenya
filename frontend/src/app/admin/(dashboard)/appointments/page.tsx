"use client";

import { useEffect, useState, useCallback, useRef, type FormEvent, Suspense } from "react";
import { startRegistration } from "@simplewebauthn/browser";
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
  KycStartResult,
  ApproveResult,
  SetupLinkResult,
} from "@/lib/types";

// ── Searchable station combobox ────────────────────────────────────────────

function StationCombobox({
  stations,
  value,
  onChange,
  placeholder = "Select station…",
  required,
  className,
}: {
  stations: PollingStation[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = stations.find((s) => s.id === value);

  const filtered = query.trim()
    ? stations.filter((s) => {
        const q = query.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          s.county.toLowerCase().includes(q) ||
          s.constituency.toLowerCase().includes(q) ||
          s.ward.toLowerCase().includes(q)
        );
      })
    : stations;

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setQuery(""); }}
        className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
      >
        <span className={selected ? "text-gray-900 truncate" : "text-gray-400"}>
          {selected ? `${selected.code} — ${selected.name}` : placeholder}
        </span>
        <svg className={`ml-2 h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Hidden native select for form required validation */}
      {required && (
        <select
          required
          value={value}
          onChange={() => {}}
          tabIndex={-1}
          aria-hidden
          className="absolute inset-0 opacity-0 pointer-events-none"
        >
          <option value="" />
          {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[260px] rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, code, county…"
              autoFocus
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {!required && (
              <li
                onMouseDown={() => { onChange(""); setOpen(false); setQuery(""); }}
                className="cursor-pointer px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50"
              >
                — Clear selection —
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">No stations found</li>
            ) : (
              filtered.map((s) => (
                <li
                  key={s.id}
                  onMouseDown={() => { onChange(s.id); setOpen(false); setQuery(""); }}
                  className={`cursor-pointer px-3 py-2 text-sm hover:bg-blue-50 ${value === s.id ? "bg-blue-50 font-semibold text-blue-800" : "text-gray-800"}`}
                >
                  <div className="font-medium truncate">{s.code} — {s.name}</div>
                  <div className="text-xs text-gray-400">{s.constituency}, {s.county}</div>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-gray-100 px-3 py-1.5 text-xs text-gray-400">
            {filtered.length} of {stations.length} stations
          </div>
        </div>
      )}
    </div>
  );
}

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

  // Post-approval KYC → fingerprint → approve flow
  const [postApproval, setPostApproval] = useState<{
    voterId: string;
    nationalId: string;
    appointmentId: string;
    reviewerId: string;
    notes?: string;
    step: "kyc" | "fingerprint" | "done";
    personaUrl?: string;
    inquiryId: string;
    contact?: string;
  } | null>(null);
  const [kycVerified, setKycVerified] = useState(false);
  const [kycPolling, setKycPolling] = useState(false);
  const [fpLoading, setFpLoading] = useState(false);
  const [fpDone, setFpDone] = useState(false);
  const [fpError, setFpError] = useState("");
  const [postError, setPostError] = useState("");
  const [approveLoading, setApproveLoading] = useState(false);
  const kycPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api
      .get<{ success: boolean } & PaginatedResponse<PollingStation>>(
        "/api/polling-stations/all?limit=1000"
      )
      .then((res) => {
        if (res.data) setStations(res.data);
      })
      .catch(() => {});
  }, []);

  // Clean up KYC polling interval on unmount
  useEffect(() => {
    return () => {
      if (kycPollRef.current) clearInterval(kycPollRef.current);
    };
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
      const res = await api.post<ApiResponse<KycStartResult>>(
        `/api/appointments/${activeAction.appointmentId}/start-kyc`
      );
      if (res.success && res.data) {
        setActiveAction(null);
        setKycVerified(false);
        setKycPolling(false);
        setPostError("");
        if (kycPollRef.current) clearInterval(kycPollRef.current);
        setFpDone(false);
        setFpError("");
        setPostApproval({
          voterId: res.data.voterId,
          nationalId: res.data.nationalId,
          appointmentId: activeAction.appointmentId,
          reviewerId: voter?.id ?? "",
          notes: actionNotes || undefined,
          step: "kyc",
          personaUrl: res.data.personaUrl,
          inquiryId: res.data.inquiryId,
        });
      } else {
        setActionError(res.error || "Failed to start KYC");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to start KYC");
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

  // ── KYC polling ────────────────────────────────────────────────────────────

  function startKycPolling(pa: NonNullable<typeof postApproval>) {
    if (kycPollRef.current) clearInterval(kycPollRef.current);
    setKycPolling(true);
    setPostError("");

    kycPollRef.current = setInterval(async () => {
      try {
        const res = await api.get<ApiResponse<{ status: string; completed: boolean }>>(
          `/api/appointments/${pa.appointmentId}/kyc-status?inquiryId=${pa.inquiryId}`
        );
        if (res.data?.completed) {
          clearInterval(kycPollRef.current!);
          kycPollRef.current = null;
          setKycPolling(false);
          setKycVerified(true);
          setPostApproval((prev) => prev ? { ...prev, step: "fingerprint" } : null);
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 3000);
  }

  // ── Admin-assisted fingerprint enrollment (cross-platform → voter's phone) ─

  async function handleEnrollFingerprint() {
    if (!postApproval) return;
    setFpLoading(true);
    setFpError("");
    try {
      // Step 1: Get registration options (adminAssisted=true → cross-platform → QR code on screen)
      const optRes = await api.post<{ success: boolean; data: unknown }>(
        "/api/webauthn/register/options",
        { voterId: postApproval.voterId, adminAssisted: true }
      );
      if (!optRes.success || !optRes.data) {
        setFpError("Failed to start fingerprint enrollment");
        return;
      }
      // Step 2: Browser shows QR code — voter scans with their phone and approves
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const credential = await startRegistration({ optionsJSON: optRes.data as any });
      // Step 3: Verify credential with backend
      const verRes = await api.post<{ success: boolean; data?: { credentialId: string } }>(
        "/api/webauthn/register/verify",
        { voterId: postApproval.voterId, response: credential }
      );
      if (!verRes.success) {
        setFpError("Fingerprint registration failed — please try again");
        return;
      }
      setFpDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Enrollment failed";
      // User cancelled the QR / authenticator prompt
      if (msg.includes("cancel") || msg.includes("abort") || msg.includes("NotAllowed")) {
        setFpError("Cancelled — ask voter to scan the QR code with their phone and try again");
      } else {
        setFpError(msg);
      }
    } finally {
      setFpLoading(false);
    }
  }

  // ── Approve voter + send PIN setup link ────────────────────────────────────

  async function handleApproveAndSend() {
    if (!postApproval) return;
    setPostError("");
    setApproveLoading(true);
    try {
      // 1. Approve voter & mint SBT
      const approveRes = await api.post<ApiResponse<ApproveResult>>(
        `/api/appointments/${postApproval.appointmentId}/approve-voter`,
        { reviewerId: postApproval.reviewerId, notes: postApproval.notes }
      );
      if (!approveRes.success) {
        setPostError(approveRes.error || "Approval failed");
        return;
      }
      // 2. Send PIN setup link (voter sets PINs + biometric on their own device)
      const linkRes = await api.post<ApiResponse<SetupLinkResult>>(
        "/api/admin/send-setup-link",
        { voterId: postApproval.voterId }
      );
      if (!linkRes.success || !linkRes.data) {
        setPostError(linkRes.error || "Failed to send setup link");
        return;
      }
      setPostApproval((prev) =>
        prev ? { ...prev, step: "done", contact: linkRes.data!.contact } : null
      );
      loadAppointments();
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Failed to complete approval");
    } finally {
      setApproveLoading(false);
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
                <StationCombobox
                  stations={stations}
                  value={createStation}
                  onChange={setCreateStation}
                  placeholder="Select station…"
                  required
                />
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
              <StationCombobox
                stations={stations}
                value={deleteStation}
                onChange={setDeleteStation}
                placeholder="Select station…"
                required
              />
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

        {/* Post-approval: KYC → fingerprint → approve flow */}
        {postApproval && postApproval.step !== "done" && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-5 space-y-4">
            {/* Step indicator: KYC → Fingerprint → Approve */}
            <div className="flex items-center gap-2 flex-wrap text-[10px] font-bold">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${kycVerified ? "bg-green-600" : "bg-purple-600"}`}>
                {kycVerified ? "✓" : "1"}
              </span>
              <span className={`text-sm font-medium ${kycVerified ? "text-green-700" : "text-purple-700"}`}>
                {kycVerified ? "KYC verified" : "Identity Verification (KYC)"}
              </span>
              <span className="border-t border-purple-200 w-6" />
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${fpDone ? "bg-green-600" : kycVerified ? "bg-purple-600" : "bg-gray-300 text-gray-600"}`}>
                {fpDone ? "✓" : "2"}
              </span>
              <span className={`text-sm font-medium ${fpDone ? "text-green-700" : kycVerified ? "text-purple-700" : "text-gray-400"}`}>
                {fpDone ? "Fingerprint enrolled" : "Fingerprint (voter's phone)"}
              </span>
              <span className="border-t border-purple-200 w-6" />
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${fpDone ? "bg-purple-600" : "bg-gray-300 text-gray-600"}`}>3</span>
              <span className={`text-sm font-medium ${fpDone ? "text-purple-700" : "text-gray-400"}`}>Approve &amp; Send PIN link</span>
            </div>

            {postError && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{postError}</div>
            )}

            {/* Step 1: KYC */}
            {!kycVerified && (
              <div className="space-y-3">
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <strong>IEBC Officer:</strong> Hand the device to voter{" "}
                  <strong>{postApproval.nationalId}</strong>. They will complete identity verification on
                  this screen. The system will automatically detect when it is done.
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                  {postApproval.personaUrl && (
                    <a
                      href={postApproval.personaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => startKycPolling(postApproval)}
                      className="flex w-full items-center justify-center gap-2 rounded-md bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open KYC Verification
                    </a>
                  )}
                  {kycPolling && (
                    <div className="flex items-center justify-center gap-2 py-2 text-sm text-purple-700">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Waiting for voter to complete KYC…
                    </div>
                  )}
                  {!kycPolling && (
                    <p className="text-center text-xs text-gray-400">
                      Open the KYC link above — the system will automatically detect completion.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Fingerprint enrollment via voter's phone (cross-platform / QR code) */}
            {kycVerified && !fpDone && (
              <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                  <strong>IEBC Officer:</strong> Click the button below. A QR code will appear on screen.
                  Ask voter <strong>{postApproval.nationalId}</strong> to scan it with their own phone to
                  enroll their fingerprint. <em>This ensures only the voter&apos;s biometric is registered —
                  the officer&apos;s device cannot be used to impersonate them.</em>
                </div>
                {fpError && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{fpError}</div>
                )}
                <button
                  type="button"
                  onClick={handleEnrollFingerprint}
                  disabled={fpLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {fpLoading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Waiting for voter&apos;s phone…
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0-1.657-1.343-3-3-3S6 9.343 6 11m0 0v1a6 6 0 0012 0v-1m-6-3V5m0 0a2 2 0 100-4 2 2 0 000 4z" />
                      </svg>
                      Enroll Fingerprint via Voter&apos;s Phone (QR Code)
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setFpDone(true)}
                  disabled={fpLoading}
                  className="w-full text-center text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  Skip fingerprint enrollment (voter will enroll on their own device)
                </button>
              </div>
            )}

            {/* Step 3: Approve */}
            {fpDone && (
              <div className="rounded-lg border border-green-200 bg-white p-4 space-y-3">
                <div className="flex items-center gap-2 text-green-700">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-semibold">Identity verified — ready to approve</span>
                </div>
                <p className="text-xs text-gray-500">
                  Clicking <strong>Approve</strong> will mint the voter&apos;s SBT on-chain and send them a
                  secure link to set up their PINs on their own device.
                </p>
                <button
                  type="button"
                  onClick={handleApproveAndSend}
                  disabled={approveLoading}
                  className="w-full rounded-md bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {approveLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Approving &amp; sending link…
                    </span>
                  ) : "Approve Registration & Send PIN Setup Link →"}
                </button>
              </div>
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
                <span>KYC identity verified via Persona</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600">✓</span>
                <span>Fingerprint credential enrolled on voter&apos;s own phone (or skipped — voter can enroll later)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600">✓</span>
                <span>Registration approved — SBT minted on-chain</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600">✓</span>
                <span>PIN setup link sent to <span className="font-medium">{postApproval.contact}</span></span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-green-600">
              The voter will set both PINs and optionally re-enroll their fingerprint on their own device via the link.
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
                  {appointmentActionLoading ? "Starting KYC..." : "Start KYC Verification"}
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
            <StationCombobox
              stations={stations}
              value={filterStation}
              onChange={(id) => {
                setFilterStation(id);
                router.push("/admin/appointments?page=1");
              }}
              placeholder="All Stations"
              className="w-64"
            />
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
