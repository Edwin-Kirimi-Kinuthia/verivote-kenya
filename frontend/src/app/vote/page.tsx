"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import { useTranslation } from "@/contexts/language-context";
import { AppointmentSlotPicker } from "@/components/appointment-slot-picker";
import type { ApiResponse, AuthData, BookedAppointmentResult } from "@/lib/types";

const ELIGIBLE_STATUSES = ["REGISTERED", "VOTED", "REVOTED", "DISTRESS_FLAGGED"];

type View = "login" | "resetForm" | "resetOptions" | "resetStatus" | "appointmentBooking" | "appointmentConfirmed";

interface VerificationOptions {
  inPerson: {
    description: string;
    pollingStationId: string | null;
  };
  biometric: {
    description: string;
    inquiryId?: string;
    url?: string;
  };
}

interface ResetResponse {
  voterId: string;
  message: string;
  verificationOptions: VerificationOptions;
}

interface ResetStatusResponse {
  voterId: string;
  pinResetRequested: boolean;
  pinResetRequestedAt: string | null;
  pinLastResetAt: string | null;
}

export default function VotePinPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useTranslation();

  // Login state
  const [nationalId, setNationalId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // PIN reset state
  const [view, setView] = useState<View>("login");
  const [resetNationalId, setResetNationalId] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [verificationOptions, setVerificationOptions] =
    useState<VerificationOptions | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [bookedAppointment, setBookedAppointment] = useState<BookedAppointmentResult | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post<
        ApiResponse<{ valid: boolean; auth: AuthData }>
      >("/api/voters/verify-pin", { nationalId, pin });

      if (!res.success || !res.data?.valid || !res.data.auth) {
        setError(t("pin.error"));
        return;
      }

      const { auth } = res.data;

      if (!ELIGIBLE_STATUSES.includes(auth.voter.status)) {
        setError(t("pin.notEligible"));
        return;
      }

      login(auth.token, auth.voter);
      router.push("/vote/ballot");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pin.error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleResetRequest(e: FormEvent) {
    e.preventDefault();
    setResetError("");
    setResetLoading(true);

    try {
      const res = await api.post<ApiResponse<ResetResponse>>(
        "/api/pin-reset/request",
        { nationalId: resetNationalId }
      );

      if (res.data?.verificationOptions) {
        setVerificationOptions(res.data.verificationOptions);
        setView("resetOptions");
      }
    } catch (err) {
      setResetError(
        err instanceof Error ? err.message : t("pinReset.error")
      );
    } finally {
      setResetLoading(false);
    }
  }

  async function handleCheckStatus(e: FormEvent) {
    e.preventDefault();
    setResetError("");
    setStatusMessage("");
    setResetLoading(true);

    try {
      const res = await api.get<ApiResponse<ResetStatusResponse>>(
        `/api/pin-reset/status?nationalId=${resetNationalId}`
      );

      if (res.data?.pinResetRequested) {
        setStatusMessage(t("pinReset.statusPending"));
      } else if (res.data?.pinLastResetAt) {
        setStatusMessage(t("pinReset.statusApproved"));
      } else {
        setStatusMessage(t("pinReset.statusNone"));
      }
    } catch (err) {
      setResetError(
        err instanceof Error ? err.message : t("pinReset.error")
      );
    } finally {
      setResetLoading(false);
    }
  }

  function switchToReset() {
    setView("resetForm");
    setResetNationalId(nationalId);
    setResetError("");
    setVerificationOptions(null);
    setStatusMessage("");
  }

  function switchToLogin() {
    setView("login");
    setResetError("");
    setVerificationOptions(null);
    setStatusMessage("");
  }

  // ---- Login view ----
  if (view === "login") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900">
              {t("pin.title")}
            </h1>
            <p className="mt-2 text-base text-gray-500">
              {t("pin.subtitle")}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm"
          >
            {error && (
              <div
                role="alert"
                className="mb-6 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700"
              >
                {error}
              </div>
            )}

            <div className="mb-5">
              <label
                htmlFor="nationalId"
                className="mb-2 block text-sm font-semibold text-gray-700"
              >
                {t("pin.nationalId")}
              </label>
              <input
                id="nationalId"
                type="text"
                inputMode="numeric"
                pattern="\d{8}"
                maxLength={8}
                required
                value={nationalId}
                onChange={(e) =>
                  setNationalId(e.target.value.replace(/\D/g, ""))
                }
                placeholder={t("pin.nationalIdPlaceholder")}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
              />
            </div>

            <div className="mb-8">
              <label
                htmlFor="pin"
                className="mb-2 block text-sm font-semibold text-gray-700"
              >
                {t("pin.pin")}
              </label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder={t("pin.pinPlaceholder")}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading || nationalId.length !== 8 || pin.length !== 4}
              className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? t("pin.submitting") : t("pin.submit")}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={switchToReset}
              className="text-sm font-medium text-green-700 hover:text-green-800 hover:underline"
            >
              {t("pinReset.link")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Verification options view (after request submitted) ----
  if (view === "resetOptions" && verificationOptions) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900">
              {t("pinReset.chooseMethod")}
            </h1>
            <p className="mt-2 text-base text-gray-500">
              {t("pinReset.chooseMethodSubtitle")}
            </p>
          </div>

          <div className="space-y-4">
            {/* Biometric option */}
            <div className="rounded-xl border-2 border-blue-200 bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center gap-3">
                <svg
                  className="h-8 w-8 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                  />
                </svg>
                <h2 className="text-lg font-semibold text-gray-900">
                  {t("pinReset.biometricTitle")}
                </h2>
              </div>
              <p className="mb-4 text-sm text-gray-500">
                {t("pinReset.biometricDesc")}
              </p>
              {verificationOptions.biometric.url ? (
                <a
                  href={verificationOptions.biometric.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-lg bg-blue-600 px-6 py-3 text-center text-base font-semibold text-white hover:bg-blue-700"
                >
                  {t("pinReset.startBiometric")}
                </a>
              ) : (
                <p className="text-sm italic text-gray-400">
                  {verificationOptions.biometric.description}
                </p>
              )}
            </div>

            {/* In-person option */}
            <div className="flex flex-col rounded-xl border-2 border-amber-200 bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center gap-3">
                <svg
                  className="h-8 w-8 text-amber-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"
                  />
                </svg>
                <h2 className="text-lg font-semibold text-gray-900">
                  {t("pinReset.inPersonTitle")}
                </h2>
              </div>
              <p className="mb-4 flex-1 text-sm text-gray-500">
                {t("pinReset.inPersonDesc")}
              </p>
              <button
                type="button"
                onClick={() => setView("appointmentBooking")}
                className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
              >
                {t("appointment.bookingTitle")}
              </button>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setView("resetForm");
                setVerificationOptions(null);
              }}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50"
            >
              {t("pinReset.back")}
            </button>
            <button
              type="button"
              onClick={switchToLogin}
              className="flex-1 rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800"
            >
              {t("pinReset.backToLogin")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Appointment booking view (in-person PIN reset) ----
  if (view === "appointmentBooking" && verificationOptions) {
    const stationId = verificationOptions.inPerson.pollingStationId ?? "";
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-lg">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900">
              {t("appointment.bookingTitle")}
            </h1>
          </div>
          <AppointmentSlotPicker
            nationalId={resetNationalId}
            pollingStationId={stationId}
            purpose="PIN_RESET"
            onBooked={(result) => {
              setBookedAppointment(result);
              setView("appointmentConfirmed");
            }}
            onCancel={() => setView("resetOptions")}
          />
        </div>
      </div>
    );
  }

  // ---- Appointment confirmed view ----
  if (view === "appointmentConfirmed" && bookedAppointment) {
    const scheduledDate = new Date(bookedAppointment.scheduledAt);
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">
              {t("appointment.confirmedTitle")}
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              {t("appointment.confirmedSubtitle")}
            </p>
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
            {t("appointment.pinResetNote")}
          </p>

          <button
            type="button"
            onClick={switchToLogin}
            className="mt-4 w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800"
          >
            {t("pinReset.backToLogin")}
          </button>
        </div>
      </div>
    );
  }

  // ---- Reset form / status check view ----
  const isStatusTab = view === "resetStatus";

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            {t("pinReset.title")}
          </h1>
          <p className="mt-2 text-base text-gray-500">
            {t("pinReset.subtitle")}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          {resetError && (
            <div
              role="alert"
              className="mb-6 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700"
            >
              {resetError}
            </div>
          )}

          {statusMessage && (
            <div
              role="status"
              className="mb-6 rounded-lg bg-blue-50 p-4 text-sm font-medium text-blue-700"
            >
              <p className="mb-1 font-semibold">
                {t("pinReset.statusTitle")}
              </p>
              {statusMessage}
            </div>
          )}

          <div className="mb-5">
            <label
              htmlFor="resetNationalId"
              className="mb-2 block text-sm font-semibold text-gray-700"
            >
              {t("pin.nationalId")}
            </label>
            <input
              id="resetNationalId"
              type="text"
              inputMode="numeric"
              pattern="\d{8}"
              maxLength={8}
              required
              value={resetNationalId}
              onChange={(e) =>
                setResetNationalId(e.target.value.replace(/\D/g, ""))
              }
              placeholder={t("pin.nationalIdPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
            />
          </div>

          {/* Tabs */}
          <div className="mb-5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setView("resetForm");
                setStatusMessage("");
              }}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                !isStatusTab
                  ? "bg-green-700 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t("pinReset.submit")}
            </button>
            <button
              type="button"
              onClick={() => {
                setView("resetStatus");
                setResetError("");
              }}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                isStatusTab
                  ? "bg-green-700 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t("pinReset.checkStatus")}
            </button>
          </div>

          {!isStatusTab ? (
            <form onSubmit={handleResetRequest}>
              <button
                type="submit"
                disabled={resetLoading || resetNationalId.length !== 8}
                className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resetLoading
                  ? t("pinReset.submitting")
                  : t("pinReset.submit")}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCheckStatus}>
              <button
                type="submit"
                disabled={resetLoading || resetNationalId.length !== 8}
                className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resetLoading
                  ? t("pinReset.checking")
                  : t("pinReset.checkStatus")}
              </button>
            </form>
          )}
        </div>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={switchToLogin}
            className="text-sm font-medium text-green-700 hover:text-green-800 hover:underline"
          >
            {t("pinReset.backToLogin")}
          </button>
        </div>
      </div>
    </div>
  );
}
