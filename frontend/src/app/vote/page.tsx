"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import { useTranslation } from "@/contexts/language-context";
import { AppointmentSlotPicker } from "@/components/appointment-slot-picker";
import type { ApiResponse, AuthData, BookedAppointmentResult } from "@/lib/types";

const ELIGIBLE_STATUSES = ["REGISTERED", "VOTED", "REVOTED", "DISTRESS_FLAGGED"];

type LoginTab = "password" | "otp" | "biometric";
type View =
  | "login"
  | "resetForm"
  | "resetOptions"
  | "appointmentBooking"
  | "appointmentConfirmed";

interface VerificationOptions {
  inPerson: { description: string; pollingStationId: string | null };
  biometric: { description: string; inquiryId?: string; url?: string };
}

interface ResetResponse {
  voterId: string;
  message: string;
  verificationOptions: VerificationOptions;
}

export default function VoteLoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useTranslation();

  // Login state
  const [loginTab, setLoginTab] = useState<LoginTab>("password");
  const [nationalId, setNationalId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // OTP login state
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Biometric login state
  const [biometricNationalId, setBiometricNationalId] = useState("");
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricError, setBiometricError] = useState("");

  // PIN reset state
  const [view, setView] = useState<View>("login");
  const [resetNationalId, setResetNationalId] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [verificationOptions, setVerificationOptions] = useState<VerificationOptions | null>(null);
  const [bookedAppointment, setBookedAppointment] = useState<BookedAppointmentResult | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function handleLoginSuccess(auth: AuthData) {
    if (!ELIGIBLE_STATUSES.includes(auth.voter.status)) {
      setError(t("pin.notEligible"));
      return;
    }
    login(auth.token, auth.voter);
    router.push("/vote/ballot");
  }

  // ── Password login ────────────────────────────────────────────────────────

  async function handlePasswordLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post<ApiResponse<AuthData>>("/api/auth/login", {
        identifier: nationalId,
        password,
      });
      if (!res.success || !res.data) {
        setError(res.error || t("pin.error"));
        return;
      }
      handleLoginSuccess(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pin.error"));
    } finally {
      setLoading(false);
    }
  }

  // ── OTP login ─────────────────────────────────────────────────────────────

  async function handleRequestOtp(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOtpLoading(true);
    try {
      await api.post("/api/auth/request-otp", { nationalId, purpose: "LOGIN" });
      setOtpSent(true);
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOtpLoading(true);
    try {
      const res = await api.post<ApiResponse<AuthData>>("/api/auth/verify-otp", {
        nationalId,
        code: otpCode,
        purpose: "LOGIN",
      });
      if (!res.success || !res.data) {
        setError(res.error || "Invalid code");
        return;
      }
      handleLoginSuccess(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return;
    setError("");
    try {
      await api.post("/api/auth/request-otp", { nationalId, purpose: "LOGIN" });
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    }
  }

  // ── Biometric / WebAuthn login ────────────────────────────────────────────

  async function handleBiometricLogin(e: FormEvent) {
    e.preventDefault();
    setBiometricError("");
    setBiometricLoading(true);
    try {
      const optRes = await api.post<ApiResponse<Record<string, unknown>>>(
        "/api/webauthn/authenticate/options",
        { nationalId: biometricNationalId }
      );
      if (!optRes.success || !optRes.data) throw new Error("Failed to get authentication options");

      const { startAuthentication } = await import("@simplewebauthn/browser");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authResp = await startAuthentication({ optionsJSON: optRes.data as any });

      const verRes = await api.post<ApiResponse<{ verified: boolean; auth: AuthData }>>(
        "/api/webauthn/authenticate/verify",
        { nationalId: biometricNationalId, response: authResp }
      );
      if (!verRes.success || !verRes.data?.auth) {
        throw new Error(verRes.error || "Authentication failed");
      }
      handleLoginSuccess(verRes.data.auth);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Biometric authentication failed";
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("user")) {
        setBiometricError("Biometric prompt was cancelled. Please try again.");
      } else {
        setBiometricError(msg);
      }
    } finally {
      setBiometricLoading(false);
    }
  }

  // ── PIN reset ─────────────────────────────────────────────────────────────

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
      setResetError(err instanceof Error ? err.message : t("pinReset.error"));
    } finally {
      setResetLoading(false);
    }
  }

  function switchToReset() {
    setView("resetForm");
    setResetNationalId(nationalId);
    setResetError("");
    setVerificationOptions(null);
  }

  function switchToLogin() {
    setView("login");
    setResetError("");
    setVerificationOptions(null);
    setOtpSent(false);
    setOtpCode("");
    setError("");
  }

  // ── Login view ────────────────────────────────────────────────────────────

  if (view === "login") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900">{t("pin.title")}</h1>
            <p className="mt-2 text-base text-gray-500">Sign in to cast your vote</p>
          </div>

          {/* Tabs */}
          <div className="mb-1 flex rounded-xl border border-gray-200 bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => { setLoginTab("password"); setError(""); setOtpSent(false); }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                loginTab === "password" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => { setLoginTab("otp"); setError(""); }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                loginTab === "otp" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              One-Time Code
            </button>
            <button
              type="button"
              onClick={() => { setLoginTab("biometric"); setError(""); setBiometricError(""); }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                loginTab === "biometric" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Fingerprint
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
            {error && (
              <div
                key={error}
                role="alert"
                className="animate-shake mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5"
              >
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-700">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setError("")}
                  className="shrink-0 text-red-400 hover:text-red-600"
                  aria-label="Dismiss error"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
            )}

            {/* Password tab */}
            {loginTab === "password" && (
              <form onSubmit={handlePasswordLogin} className="space-y-5">
                <div>
                  <label htmlFor="nationalId" className="mb-2 block text-sm font-semibold text-gray-700">
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
                    onChange={(e) => { setNationalId(e.target.value.replace(/\D/g, "")); if (error) setError(""); }}
                    placeholder={t("pin.nationalIdPlaceholder")}
                    className={`w-full rounded-lg border px-4 py-3 text-base transition-colors focus:ring-2 focus:outline-none ${
                      error ? "border-red-400 focus:border-red-500 focus:ring-red-200" : "border-gray-300 focus:border-green-700 focus:ring-green-700"
                    }`}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-semibold text-gray-700">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (error) setError(""); }}
                    placeholder="••••••••"
                    className={`w-full rounded-lg border px-4 py-3 text-base transition-colors focus:ring-2 focus:outline-none ${
                      error ? "border-red-400 focus:border-red-500 focus:ring-red-200" : "border-gray-300 focus:border-green-700 focus:ring-green-700"
                    }`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || nationalId.length !== 8 || !password}
                  className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Signing in..." : "Sign In"}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={switchToReset}
                    className="text-sm text-green-700 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              </form>
            )}

            {/* Biometric / WebAuthn tab */}
            {loginTab === "biometric" && (
              <form onSubmit={handleBiometricLogin} className="space-y-5">
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                    <svg className="h-8 w-8 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500">
                    Use your enrolled fingerprint, Windows Hello, or device biometric to sign in instantly.
                  </p>
                </div>

                {biometricError && (
                  <div
                    key={biometricError}
                    role="alert"
                    className="animate-shake flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5"
                  >
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm font-medium text-red-700">{biometricError}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="biometricId" className="mb-2 block text-sm font-semibold text-gray-700">
                    {t("pin.nationalId")}
                  </label>
                  <input
                    id="biometricId"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{8}"
                    maxLength={8}
                    required
                    value={biometricNationalId}
                    onChange={(e) => setBiometricNationalId(e.target.value.replace(/\D/g, ""))}
                    placeholder={t("pin.nationalIdPlaceholder")}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={biometricLoading || biometricNationalId.length !== 8}
                  className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {biometricLoading ? "Waiting for device…" : "Sign In with Fingerprint / Windows Hello"}
                </button>
              </form>
            )}

            {/* OTP tab */}
            {loginTab === "otp" && (
              <div className="space-y-5">
                {!otpSent ? (
                  <form onSubmit={handleRequestOtp} className="space-y-5">
                    <div>
                      <label htmlFor="otpNationalId" className="mb-2 block text-sm font-semibold text-gray-700">
                        {t("pin.nationalId")}
                      </label>
                      <input
                        id="otpNationalId"
                        type="text"
                        inputMode="numeric"
                        pattern="\d{8}"
                        maxLength={8}
                        required
                        value={nationalId}
                        onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ""))}
                        placeholder={t("pin.nationalIdPlaceholder")}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
                      />
                    </div>
                    <p className="text-sm text-gray-500">
                      We will send a 6-digit code to your registered contact (phone or email).
                    </p>
                    <button
                      type="submit"
                      disabled={otpLoading || nationalId.length !== 8}
                      className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {otpLoading ? "Sending..." : "Send Code"}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-5">
                    <p className="text-sm text-gray-600 text-center">
                      Enter the 6-digit code sent to your registered contact.
                    </p>
                    <div>
                      <label htmlFor="otpCode" className="mb-2 block text-sm font-semibold text-gray-700">
                        One-Time Code
                      </label>
                      <input
                        id="otpCode"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        value={otpCode}
                        onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, "")); if (error) setError(""); }}
                        placeholder="000000"
                        className={`w-full rounded-lg border px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] transition-colors focus:ring-2 focus:outline-none ${
                          error ? "border-red-400 focus:border-red-500 focus:ring-red-200" : "border-gray-300 focus:border-green-700 focus:ring-green-700"
                        }`}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={otpLoading || otpCode.length !== 6}
                      className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {otpLoading ? "Verifying..." : "Verify & Sign In"}
                    </button>
                    <div className="text-center space-y-1">
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={resendCooldown > 0}
                        className="text-sm text-green-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                      </button>
                      <br />
                      <button
                        type="button"
                        onClick={() => { setOtpSent(false); setOtpCode(""); setError(""); }}
                        className="text-sm text-gray-500 hover:underline"
                      >
                        Change National ID
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

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

  // ── PIN reset form view ───────────────────────────────────────────────────

  if (view === "resetForm") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900">{t("pinReset.title")}</h1>
            <p className="mt-2 text-base text-gray-500">{t("pinReset.subtitle")}</p>
          </div>

          <form
            onSubmit={handleResetRequest}
            className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm space-y-5"
          >
            {resetError && (
              <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">
                {resetError}
              </div>
            )}

            <div>
              <label htmlFor="resetNationalId" className="mb-2 block text-sm font-semibold text-gray-700">
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
                onChange={(e) => setResetNationalId(e.target.value.replace(/\D/g, ""))}
                placeholder={t("pin.nationalIdPlaceholder")}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={resetLoading || resetNationalId.length !== 8}
              className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resetLoading ? t("pinReset.submitting") : t("pinReset.submit")}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button type="button" onClick={switchToLogin} className="text-sm font-medium text-green-700 hover:underline">
              {t("pinReset.backToLogin")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Reset options view ────────────────────────────────────────────────────

  if (view === "resetOptions" && verificationOptions) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900">{t("pinReset.chooseMethod")}</h1>
            <p className="mt-2 text-base text-gray-500">{t("pinReset.chooseMethodSubtitle")}</p>
          </div>

          <div className="space-y-4">
            {verificationOptions.biometric.url && (
              <div className="rounded-xl border-2 border-blue-200 bg-white p-6 shadow-sm">
                <h2 className="mb-2 text-lg font-semibold text-gray-900">{t("pinReset.biometricTitle")}</h2>
                <p className="mb-4 text-sm text-gray-500">{t("pinReset.biometricDesc")}</p>
                <a
                  href={verificationOptions.biometric.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-lg bg-blue-600 px-6 py-3 text-center text-base font-semibold text-white hover:bg-blue-700"
                >
                  {t("pinReset.startBiometric")}
                </a>
              </div>
            )}

            <div className="flex flex-col rounded-xl border-2 border-amber-200 bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold text-gray-900">{t("pinReset.inPersonTitle")}</h2>
              <p className="mb-4 flex-1 text-sm text-gray-500">{t("pinReset.inPersonDesc")}</p>
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
              onClick={() => { setView("resetForm"); setVerificationOptions(null); }}
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

  // ── Appointment booking ───────────────────────────────────────────────────

  if (view === "appointmentBooking" && verificationOptions) {
    const stationId = verificationOptions.inPerson.pollingStationId ?? "";
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900">{t("appointment.bookingTitle")}</h1>
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

  // ── Appointment confirmed ─────────────────────────────────────────────────

  if (view === "appointmentConfirmed" && bookedAppointment) {
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
              <span className="font-semibold text-gray-900">{bookedAppointment.durationMinutes} {t("appointment.minutes")}</span>
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

  return null;
}
