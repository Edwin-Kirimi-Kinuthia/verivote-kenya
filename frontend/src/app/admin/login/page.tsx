"use client";

import { useState, useRef, Suspense, type FormEvent, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { useAuth } from "@/contexts/auth-context";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3005";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "password" | "otp" | "biometric" | "done";

interface StepOneData {
  stepToken: string;
  contactHint: string;
  hasWebAuthn: boolean;
  mockCode?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res  = await fetch(`${API}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error ?? "Request failed");
  return data.data as T;
}

// ── OTP input — 6 individual boxes ───────────────────────────────────────────

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null, null, null]);

  function handleKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !inputRefs.current[i]?.value && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  }

  function handleChange(i: number, v: string) {
    const digit = v.replace(/\D/g, "").slice(-1);
    const chars = value.split("").slice(0, 6);
    chars[i] = digit;
    const next = chars.join("").padEnd(0, "").slice(0, 6);
    onChange(next.slice(0, 6));
    if (digit && i < 5) inputRefs.current[i + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      onChange(pasted);
      inputRefs.current[5]?.focus();
      e.preventDefault();
    }
  }

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          className="h-12 w-10 rounded-md border border-gray-300 text-center text-lg font-bold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
      ))}
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS = ["Credentials", "Verification", "Access Granted"];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {STEPS.map((label, i) => {
        const done    = i < current;
        const active  = i === current;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                done   ? "bg-green-500 border-green-500 text-white" :
                active ? "bg-blue-600 border-blue-600 text-white" :
                         "bg-white border-gray-300 text-gray-400"
              }`}>
                {done ? "✓" : i + 1}
              </div>
              <span className={`mt-1 text-[10px] font-medium ${
                active ? "text-blue-700" : done ? "text-green-700" : "text-gray-400"
              }`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-10 h-0.5 mx-1 mb-4 ${done ? "bg-green-400" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function AdminLoginPageContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const idleLogout   = searchParams.get("reason") === "idle";
  const { login } = useAuth();

  const [step, setStep]           = useState<Step>("password");
  const [stepData, setStepData]   = useState<StepOneData | null>(null);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);

  // Step 1 fields
  const [nationalId, setNationalId] = useState("");
  const [password, setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Step 2 fields
  const [otp, setOtp]             = useState("");

  const stepIndex = step === "password" ? 0 : step === "done" ? 2 : 1;

  function clearError() { if (error) setError(""); }

  // ── Step 1: Password ────────────────────────────────────────────────────────

  async function handlePassword(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiPost<StepOneData>("/api/admin-auth/login", {
        identifier: nationalId,
        password,
      });
      setStepData(data);
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2a: OTP ────────────────────────────────────────────────────────────

  async function handleOtp(e: FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) return;
    setError("");
    setLoading(true);
    try {
      const data = await apiPost<{ token: string; voter: Record<string, unknown> }>(
        "/api/admin-auth/verify-otp",
        { stepToken: stepData!.stepToken, code: otp },
      );
      login(data.token, data.voter as Parameters<typeof login>[1]);
      setStep("done");
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTP verification failed");
      setOtp("");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2b: WebAuthn biometric ─────────────────────────────────────────────

  async function handleBiometric() {
    setError("");
    setLoading(true);
    try {
      // Get assertion options from the server (validates stepToken)
      const options = await apiPost<Record<string, unknown>>(
        "/api/admin-auth/webauthn-options",
        { stepToken: stepData!.stepToken },
      );

      // Prompt biometric via browser
      const assertion = await startAuthentication({ optionsJSON: options as never });

      // Verify with server
      const data = await apiPost<{ token: string; voter: Record<string, unknown> }>(
        "/api/admin-auth/webauthn-verify",
        { stepToken: stepData!.stepToken, response: assertion },
      );

      login(data.token, data.voter as Parameters<typeof login>[1]);
      setStep("done");
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Biometric authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    if (!stepData) return;
    setError("");
    try {
      await fetch(`${API}/api/auth/request-otp`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ nationalId, purpose: "LOGIN" }),
      });
    } catch {
      // silent — the OTP was already sent on login; this is a best-effort resend
    }
  }

  const hasError = error.length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">VeriVote Admin</h1>
          <p className="mt-1 text-sm text-gray-500">IEBC secure portal</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
          <StepBar current={stepIndex} />

          {/* Idle logout notice */}
          {idleLogout && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <p className="text-sm font-medium text-amber-700">
                You were logged out due to 30 minutes of inactivity. Please sign in again.
              </p>
            </div>
          )}

          {/* Error */}
          {hasError && (
            <div
              key={error}
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              <p className="text-sm font-medium text-red-700">{error}</p>
            </div>
          )}

          {/* ── Step 1: Password ── */}
          {step === "password" && (
            <form onSubmit={handlePassword} className="space-y-4">
              <div>
                <label htmlFor="nationalId" className="mb-1 block text-sm font-medium text-gray-700">
                  National ID
                </label>
                <input
                  id="nationalId"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{8}"
                  maxLength={8}
                  required
                  value={nationalId}
                  onChange={(e) => { setNationalId(e.target.value.replace(/\D/g, "")); clearError(); }}
                  placeholder="12345678"
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:ring-1 focus:outline-none transition-colors ${
                    hasError ? "border-red-400 focus:border-red-500 focus:ring-red-300"
                             : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearError(); }}
                    placeholder="••••••••"
                    className={`w-full rounded-md border px-3 py-2 pr-9 text-sm focus:ring-1 focus:outline-none transition-colors ${
                      hasError ? "border-red-400 focus:border-red-500 focus:ring-red-300"
                               : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || nationalId.length !== 8 || !password}
                className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Verifying…" : "Continue"}
              </button>

              <p className="text-center text-xs text-gray-400">
                A one-time code will be sent to your registered contact.
              </p>
            </form>
          )}

          {/* ── Step 2: OTP + optional biometric ── */}
          {step === "otp" && stepData && (
            <div className="space-y-5">
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-center">
                <p className="text-sm text-blue-800 font-medium">Code sent to</p>
                <p className="text-sm text-blue-700 font-mono mt-0.5">{stepData.contactHint}</p>
              </div>

              {stepData.mockCode && (
                <div className="rounded-lg bg-yellow-50 border border-yellow-300 p-3 text-center">
                  <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-1">Dev mode — OTP code</p>
                  <p className="text-xl font-mono font-bold text-yellow-900 tracking-widest">{stepData.mockCode}</p>
                </div>
              )}

              <form onSubmit={handleOtp} className="space-y-4">
                <div>
                  <label className="mb-3 block text-sm font-medium text-gray-700 text-center">
                    Enter 6-digit code
                  </label>
                  <OtpInput value={otp} onChange={(v) => { setOtp(v); clearError(); }} />
                </div>

                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "Verifying…" : "Verify Code"}
                </button>
              </form>

              {/* Biometric alternative */}
              {stepData.hasWebAuthn && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-3 text-xs text-gray-400">or use biometrics</span>
                  </div>
                </div>
              )}

              {stepData.hasWebAuthn && (
                <button
                  type="button"
                  onClick={handleBiometric}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
                  </svg>
                  {loading ? "Authenticating…" : "Use Fingerprint / Face ID"}
                </button>
              )}

              <div className="flex items-center justify-between text-xs text-gray-400">
                <button
                  type="button"
                  onClick={() => { setStep("password"); setOtp(""); setError(""); }}
                  className="hover:text-gray-600"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={resendOtp}
                  className="hover:text-gray-600"
                >
                  Resend code
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          VeriVote Kenya · IEBC Secure Electoral System
        </p>
      </div>
    </div>
  );
}

export default function AdminLoginPage() { return <Suspense><AdminLoginPageContent /></Suspense>; }
