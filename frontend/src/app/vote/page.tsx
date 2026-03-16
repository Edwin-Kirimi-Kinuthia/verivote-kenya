"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import { useTranslation } from "@/contexts/language-context";
import { AppointmentSlotPicker } from "@/components/appointment-slot-picker";
import type { ApiResponse, AuthData, BookedAppointmentResult } from "@/lib/types";

const ELIGIBLE_STATUSES = ["REGISTERED", "VOTED", "REVOTED", "DISTRESS_FLAGGED"];

type LoginTab = "password" | "biometric";
type View =
  | "login"
  | "otp-verify"
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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Attempt limiting — max 3 first-factor failures before reset
  const [loginAttempts, setLoginAttempts] = useState(0);
  const MAX_LOGIN_ATTEMPTS = 3;

  // 2FA OTP state — shown after password / biometric succeeds
  const [pendingAuthData, setPendingAuthData] = useState<AuthData | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);

  // Biometric login state
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
    // Clear any ballot state from a previous session so no candidate is preselected
    sessionStorage.removeItem("ballot-selections");
    sessionStorage.removeItem("ballot-election-id");
    sessionStorage.removeItem("ballot-election-name");
    sessionStorage.removeItem("ballot-data");
    login(auth.token, auth.voter);
    router.push("/vote/elections");
  }

  // ── Shared: send 2FA OTP after first factor succeeds ─────────────────────

  async function sendLoginOtp(id: string) {
    const res = await api.post<{ success: boolean; data?: { mockCode?: string } }>(
      "/api/auth/request-otp",
      { nationalId: id, purpose: "LOGIN" }
    );
    setResendCooldown(60);
    // In non-production, the backend returns the OTP in the response so the
    // flow can be tested without a working email / SMS service.
    if (res.data?.mockCode) {
      setDevOtpCode(res.data.mockCode);
    }
  }

  // ── Password login (first factor) ─────────────────────────────────────────

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
        const attempts = loginAttempts + 1;
        setLoginAttempts(attempts);
        setError(
          attempts >= MAX_LOGIN_ATTEMPTS
            ? "Too many failed attempts. Please try again."
            : res.error || t("pin.error")
        );
        if (attempts >= MAX_LOGIN_ATTEMPTS) {
          setNationalId("");
          setPassword("");
          setLoginAttempts(0);
        }
        return;
      }
      if (!ELIGIBLE_STATUSES.includes(res.data.voter.status)) {
        setError(t("pin.notEligible"));
        return;
      }
      setLoginAttempts(0);
      setPendingAuthData(res.data);
      await sendLoginOtp(nationalId);
      setView("otp-verify");
    } catch (err) {
      const attempts = loginAttempts + 1;
      setLoginAttempts(attempts);
      setError(
        attempts >= MAX_LOGIN_ATTEMPTS
          ? "Too many failed attempts. Please try again."
          : err instanceof Error ? err.message : t("pin.error")
      );
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        setNationalId("");
        setPassword("");
        setLoginAttempts(0);
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Biometric / WebAuthn login (first factor) ─────────────────────────────

  async function handleBiometricLogin(e: FormEvent) {
    e.preventDefault();
    setBiometricError("");
    setBiometricLoading(true);
    try {
      const optRes = await api.post<ApiResponse<Record<string, unknown>>>(
        "/api/webauthn/authenticate/options",
        { nationalId }
      );
      if (!optRes.success || !optRes.data) throw new Error("Failed to get authentication options");

      const { startAuthentication } = await import("@simplewebauthn/browser");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authResp = await startAuthentication({ optionsJSON: optRes.data as any });

      const verRes = await api.post<ApiResponse<{ verified: boolean; auth: AuthData }>>(
        "/api/webauthn/authenticate/verify",
        { nationalId, response: authResp }
      );
      if (!verRes.success || !verRes.data?.auth) {
        throw new Error(verRes.error || "Authentication failed");
      }
      const authData = verRes.data.auth;
      if (!ELIGIBLE_STATUSES.includes(authData.voter.status)) {
        setBiometricError(t("pin.notEligible"));
        return;
      }
      setPendingAuthData(authData);
      await sendLoginOtp(nationalId);
      setView("otp-verify");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Biometric authentication failed";
      const isCancelled = msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("user");
      if (isCancelled) {
        setBiometricError("Biometric prompt was cancelled. Please try again.");
      } else {
        const attempts = loginAttempts + 1;
        setLoginAttempts(attempts);
        setBiometricError(
          attempts >= MAX_LOGIN_ATTEMPTS
            ? "Too many failed attempts. Please try again."
            : msg
        );
        if (attempts >= MAX_LOGIN_ATTEMPTS) {
          setNationalId("");
          setLoginAttempts(0);
        }
      }
    } finally {
      setBiometricLoading(false);
    }
  }

  // ── 2FA OTP verification (second factor) ──────────────────────────────────

  async function handleVerifyLoginOtp(e: FormEvent) {
    e.preventDefault();
    if (!pendingAuthData) return;
    setError("");
    setOtpLoading(true);
    try {
      const res = await api.post<ApiResponse<unknown>>("/api/auth/verify-otp", {
        nationalId,
        code: otpCode,
        purpose: "LOGIN",
      });
      if (!res.success) {
        const attempts = otpAttempts + 1;
        setOtpAttempts(attempts);
        if (attempts >= MAX_LOGIN_ATTEMPTS) {
          // Too many wrong OTP attempts — go back to first factor
          setPendingAuthData(null);
          setOtpCode("");
          setOtpAttempts(0);
          setView("login");
          setError("Too many incorrect codes. Please sign in again.");
        } else {
          setOtpCode("");
          setError(`Incorrect code. ${MAX_LOGIN_ATTEMPTS - attempts} attempt${MAX_LOGIN_ATTEMPTS - attempts === 1 ? "" : "s"} remaining.`);
        }
        return;
      }
      handleLoginSuccess(pendingAuthData);
    } catch (err) {
      const attempts = otpAttempts + 1;
      setOtpAttempts(attempts);
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        setPendingAuthData(null);
        setOtpCode("");
        setOtpAttempts(0);
        setView("login");
        setError("Too many incorrect codes. Please sign in again.");
      } else {
        setOtpCode("");
        setError(err instanceof Error ? err.message : "Verification failed");
      }
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return;
    setError("");
    try {
      await sendLoginOtp(nationalId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
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
    setPendingAuthData(null);
    setOtpCode("");
    setOtpAttempts(0);
    setLoginAttempts(0);
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
              onClick={() => { setLoginTab("password"); setError(""); }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                loginTab === "password" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Password
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
                    inputMode="text"
                    maxLength={12}
                    required
                    value={nationalId}
                    onChange={(e) => { setNationalId(e.target.value.toUpperCase()); if (error) setError(""); }}
                    placeholder="ID or Passport number"
                    className={`w-full rounded-lg border px-4 py-3 text-base transition-colors focus:ring-2 focus:outline-none ${
                      error ? "border-red-400 focus:border-red-500 focus:ring-red-200" : "border-gray-300 focus:border-green-700 focus:ring-green-700"
                    }`}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-semibold text-gray-700">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (error) setError(""); }}
                      placeholder="••••••••"
                      className={`w-full rounded-lg border px-4 py-3 pr-11 text-base transition-colors focus:ring-2 focus:outline-none ${
                        error ? "border-red-400 focus:border-red-500 focus:ring-red-200" : "border-gray-300 focus:border-green-700 focus:ring-green-700"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || nationalId.length < 5 || !password}
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
                    inputMode="text"
                    maxLength={12}
                    required
                    value={nationalId}
                    onChange={(e) => { setNationalId(e.target.value.toUpperCase()); if (biometricError) setBiometricError(""); }}
                    placeholder="ID or Passport number"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={biometricLoading || nationalId.length < 5}
                  className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {biometricLoading ? "Waiting for device…" : "Sign In with Fingerprint / Windows Hello"}
                </button>
              </form>
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

  // ── 2FA OTP verify view ───────────────────────────────────────────────────

  if (view === "otp-verify") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg className="h-7 w-7 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Verify Your Identity</h1>
            <p className="mt-1 text-sm text-gray-500">
              A 6-digit code was sent to your registered phone or email.
            </p>
          </div>

          {devOtpCode && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>Dev mode:</strong> OTP code is <strong className="font-mono tracking-widest">{devOtpCode}</strong>
              <span className="ml-2 text-xs text-amber-600">(not shown in production)</span>
            </div>
          )}

          <form
            onSubmit={handleVerifyLoginOtp}
            className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm space-y-5"
          >
            {error && (
              <div
                key={error}
                role="alert"
                className="animate-shake flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5"
              >
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
                <p className="flex-1 text-sm font-medium text-red-700">{error}</p>
                <button type="button" onClick={() => setError("")} className="shrink-0 text-red-400 hover:text-red-600">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
            )}

            <div>
              <label htmlFor="loginOtpCode" className="mb-2 block text-sm font-semibold text-gray-700">
                One-Time Code
              </label>
              <input
                id="loginOtpCode"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                autoFocus
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
              {otpLoading ? "Verifying..." : "Verify & Proceed"}
            </button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendCooldown > 0}
                className="text-green-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
              </button>
              <button
                type="button"
                onClick={switchToLogin}
                className="text-gray-500 hover:underline"
              >
                Back to login
              </button>
            </div>
          </form>
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
                inputMode="text"
                maxLength={12}
                required
                value={resetNationalId}
                onChange={(e) => setResetNationalId(e.target.value.toUpperCase())}
                placeholder="ID or Passport number"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={resetLoading || resetNationalId.length < 5}
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
