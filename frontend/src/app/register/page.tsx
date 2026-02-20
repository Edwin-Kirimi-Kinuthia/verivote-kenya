"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useTranslation } from "@/contexts/language-context";
import { AppointmentSlotPicker } from "@/components/appointment-slot-picker";
import type {
  PollingStation,
  BookedAppointmentResult,
  ApiResponse,
  PaginatedResponse,
} from "@/lib/types";

type View = "form" | "options" | "personaInProgress" | "mockSuccess" | "booking" | "confirmed";

interface RegistrationData {
  voterId?: string;
  inquiryId?: string;
  personaUrl?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [view, setView] = useState<View>("form");
  const [stations, setStations] = useState<PollingStation[]>([]);

  // Form state
  const [nationalId, setNationalId] = useState("");
  const [pollingStationId, setPollingStationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Data returned from registration endpoint
  const [regData, setRegData] = useState<RegistrationData | null>(null);

  // Mock verification result (development only)
  const [mockPins, setMockPins] = useState<{ pin: string; distressPin: string } | null>(null);
  const [mockVerifyLoading, setMockVerifyLoading] = useState(false);

  // Manual review + booking state
  const [manualLoading, setManualLoading] = useState(false);
  const [bookedAppointment, setBookedAppointment] = useState<BookedAppointmentResult | null>(null);

  // True when personaUrl points to the local mock endpoint instead of real Persona
  const isMockMode = Boolean(regData?.personaUrl?.includes("mock-persona") || regData?.personaUrl?.includes("localhost"));

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

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post<ApiResponse<RegistrationData>>(
        "/api/voters/register",
        { nationalId, pollingStationId: pollingStationId || undefined }
      );

      if (!res.success) {
        setError(res.error || t("common.error"));
        return;
      }

      setRegData(res.data ?? null);
      // Always show verification options — never bypass the verification step
      setView("options");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleMockVerify() {
    if (!regData?.inquiryId) return;
    setMockVerifyLoading(true);
    setError("");
    try {
      const res = await api.post<ApiResponse<{ pin: string; distressPin: string }>>(
        "/api/voters/mock-verify",
        { inquiryId: regData.inquiryId }
      );
      if (res.success && res.data) {
        setMockPins({ pin: res.data.pin, distressPin: res.data.distressPin });
        setView("mockSuccess");
      } else {
        setError(res.error || t("common.error"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setMockVerifyLoading(false);
    }
  }

  async function handleScheduleManual() {
    setManualLoading(true);
    setError("");
    try {
      await api.post("/api/voters/request-manual-review", { nationalId });
      setView("booking");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setManualLoading(false);
    }
  }

  // ── Form view ────────────────────────────────────────────────────────────
  if (view === "form") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900">{t("register.title")}</h1>
            <p className="mt-2 text-base text-gray-500">{t("register.subtitle")}</p>
          </div>

          <form
            onSubmit={handleRegister}
            className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm"
          >
            {error && (
              <div role="alert" className="mb-6 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <div className="mb-5">
              <label htmlFor="nationalId" className="mb-2 block text-sm font-semibold text-gray-700">
                {t("register.nationalId")}
              </label>
              <input
                id="nationalId"
                type="text"
                inputMode="numeric"
                pattern="\d{8}"
                maxLength={8}
                required
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ""))}
                placeholder="12345678"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
              />
            </div>

            <div className="mb-8">
              <label htmlFor="station" className="mb-2 block text-sm font-semibold text-gray-700">
                {t("register.station")}
              </label>
              <select
                id="station"
                value={pollingStationId}
                onChange={(e) => setPollingStationId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
              >
                <option value="">{t("register.stationPlaceholder")}</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || nationalId.length !== 8}
              className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? t("register.submitting") : t("register.submit")}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500">
            {t("register.alreadyRegistered")}{" "}
            <a href="/vote" className="font-medium text-green-700 hover:underline">
              {t("register.loginLink")}
            </a>
          </p>
        </div>
      </div>
    );
  }

  // ── Options view — always shown after registration ────────────────────────
  if (view === "options") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900">Verify Your Identity</h1>
            <p className="mt-2 text-sm text-gray-500">
              Your registration is saved. You must verify your identity before you can vote.
            </p>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Persona / online verification card */}
            <div className="flex flex-col rounded-xl border-2 border-blue-200 bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center gap-3">
                <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                </svg>
                <h2 className="text-base font-semibold text-gray-900">{t("register.personaTitle")}</h2>
              </div>
              <p className="mb-4 flex-1 text-sm text-gray-500">{t("register.personaDesc")}</p>

              {isMockMode ? (
                <button
                  type="button"
                  onClick={handleMockVerify}
                  disabled={mockVerifyLoading}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {mockVerifyLoading ? "Verifying..." : "Simulate Verification (Mock)"}
                </button>
              ) : regData?.personaUrl ? (
                <a
                  href={regData.personaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setView("personaInProgress")}
                  className="block w-full rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {t("register.personaButton")}
                </a>
              ) : null}
            </div>

            {/* Manual in-person card */}
            <div className="flex flex-col rounded-xl border-2 border-amber-200 bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center gap-3">
                <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
                </svg>
                <h2 className="text-base font-semibold text-gray-900">{t("register.manualTitle")}</h2>
              </div>
              <p className="mb-4 flex-1 text-sm text-gray-500">{t("register.manualDesc")}</p>
              <button
                type="button"
                onClick={handleScheduleManual}
                disabled={manualLoading}
                className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {manualLoading ? t("common.loading") : t("register.manualButton")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Persona in-progress view (live mode: voter opened Persona in a new tab) ──
  if (view === "personaInProgress") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
            <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Verification in Progress</h1>
          <p className="mt-2 text-sm text-gray-500">
            Complete the identity verification in the tab that opened. Once approved, you will receive your voting PIN via SMS or you can log in to check your status.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-6 rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  // ── Mock success view — PINs issued after simulated Persona verification ──
  if (view === "mockSuccess" && mockPins) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">{t("register.successTitle")}</h1>
            <p className="mt-1 text-xs font-medium text-blue-600 uppercase tracking-wide">
              Mock mode — development only
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border-2 border-green-200 bg-green-50 p-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-700">
                {t("register.yourPin")}
              </p>
              <p className="font-mono text-3xl font-bold tracking-widest text-green-800">
                {mockPins.pin}
              </p>
            </div>

            <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                {t("register.yourDistressPin")}
              </p>
              <p className="font-mono text-3xl font-bold tracking-widest text-amber-800">
                {mockPins.distressPin}
              </p>
            </div>

            <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
              {t("register.distressPinNote")}
            </p>

            <button
              type="button"
              onClick={() => router.push("/vote")}
              className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800"
            >
              {t("register.proceedToVote")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Booking view ──────────────────────────────────────────────────────────
  if (view === "booking") {
    const stationId = pollingStationId || stations[0]?.id || "";
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900">{t("appointment.bookingTitle")}</h1>
          </div>
          <AppointmentSlotPicker
            nationalId={nationalId}
            pollingStationId={stationId}
            purpose="REGISTRATION"
            onBooked={(result) => {
              setBookedAppointment(result);
              setView("confirmed");
            }}
            onCancel={() => setView("options")}
          />
        </div>
      </div>
    );
  }

  // ── Confirmed view (after booking manual appointment) ─────────────────────
  if (view === "confirmed" && bookedAppointment) {
    const scheduledDate = new Date(bookedAppointment.scheduledAt);
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">{t("appointment.confirmedTitle")}</h1>
            <p className="mt-2 text-sm text-gray-500">{t("appointment.confirmedSubtitle")}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-gray-500">{t("appointment.date")}</span>
              <span className="font-semibold text-gray-900">
                {scheduledDate.toLocaleDateString("en-KE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}{" "}
                {scheduledDate.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: true })}
              </span>
            </div>
            {bookedAppointment.pollingStationName && (
              <div className="flex justify-between text-sm">
                <span className="font-medium text-gray-500">{t("appointment.station")}</span>
                <span className="font-semibold text-gray-900">{bookedAppointment.pollingStationName}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="font-medium text-gray-500">{t("appointment.duration")}</span>
              <span className="font-semibold text-gray-900">
                {bookedAppointment.durationMinutes} {t("appointment.minutes")}
              </span>
            </div>
          </div>

          <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            {t("appointment.bringId")} An IEBC officer will verify your identity and provide your voting PIN at your appointment.
          </p>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-4 w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800"
          >
            {t("appointment.done")}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
