"use client";

import { Suspense, useState, useEffect, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import type { ApiResponse } from "@/lib/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function isPinValid(p: string): { ok: boolean; error: string } {
  if (!/^\d{4}$/.test(p)) return { ok: false, error: "PIN must be exactly 4 digits" };
  if (/^(\d)\1{3}$/.test(p)) return { ok: false, error: "PIN cannot be all the same digit (e.g. 1111)" };
  const d = p.split("").map(Number);
  const asc = d.every((v, i) => i === 0 || v === d[i - 1]! + 1);
  const desc = d.every((v, i) => i === 0 || v === d[i - 1]! - 1);
  if (asc || desc) return { ok: false, error: "PIN cannot be a sequential number (e.g. 1234)" };
  return { ok: true, error: "" };
}

function decodeJwtSub(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json.sub ?? null;
  } catch {
    return null;
  }
}

// ── Views ─────────────────────────────────────────────────────────────────────

type View = "webauthn" | "pinSetup" | "done" | "invalid";

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  ) : (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function SetupPinContent() {
  const searchParams = useSearchParams();

  const [view, setView] = useState<View>("webauthn");
  const [voterId, setVoterId] = useState<string | null>(null);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);

  // PIN state
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [distressPin, setDistressPin] = useState("");
  const [confirmDistressPin, setConfirmDistressPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [showDistressPin, setShowDistressPin] = useState(false);
  const [showConfirmDistressPin, setShowConfirmDistressPin] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);

  // Login password state (optional — lets voter log in with password tab)
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // WebAuthn state
  const [webAuthnLoading, setWebAuthnLoading] = useState(false);
  const [webAuthnError, setWebAuthnError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) { setView("invalid"); return; }

    const sub = decodeJwtSub(token);
    if (!sub) { setView("invalid"); return; }

    // Store the voter's JWT so all api calls are authenticated as this voter
    localStorage.setItem("token", token);
    setVoterId(sub);
    setView("webauthn");
  }, [searchParams]);

  // ── Biometric enrollment ──────────────────────────────────────────────────

  async function handleEnrollBiometric() {
    if (!voterId) return;
    setWebAuthnError("");
    setWebAuthnLoading(true);
    try {
      const optRes = await api.post<ApiResponse<Record<string, unknown>>>(
        "/api/webauthn/register/options",
        { voterId }
      );
      if (!optRes.success || !optRes.data) throw new Error("Failed to get registration options");

      const { startRegistration } = await import("@simplewebauthn/browser");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attResp = await startRegistration({ optionsJSON: optRes.data as any });

      const verRes = await api.post<ApiResponse<{ verified: boolean }>>(
        "/api/webauthn/register/verify",
        { voterId, response: attResp }
      );
      if (!verRes.success || !verRes.data?.verified) throw new Error("Biometric enrollment failed");

      setBiometricEnrolled(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Enrollment failed";
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("user")) {
        setWebAuthnError("Biometric capture was cancelled. Please try again or skip to set your PINs.");
      } else {
        setWebAuthnError(msg);
      }
    } finally {
      setWebAuthnLoading(false);
    }
  }

  // ── PIN setup ─────────────────────────────────────────────────────────────

  async function handleSetPin(e: FormEvent) {
    e.preventDefault();
    setPinError("");

    const { ok: pinOk, error: pinErr } = isPinValid(pin);
    if (!pinOk) { setPinError(pinErr); return; }
    if (pin !== confirmPin) { setPinError("PINs do not match"); return; }

    const { ok: distressOk, error: distressErr } = isPinValid(distressPin);
    if (!distressOk) { setPinError(`Distress PIN: ${distressErr}`); return; }
    if (distressPin !== confirmDistressPin) { setPinError("Distress PINs do not match"); return; }

    const diffCount = distressPin.split("").filter((d, i) => d !== pin[i]).length;
    if (diffCount < 2) {
      setPinError("Distress PIN must differ from your normal PIN in at least 2 digit positions");
      return;
    }

    if (password) {
      if (password.length < 8) { setPinError("Password must be at least 8 characters"); return; }
      if (password !== confirmPassword) { setPinError("Passwords do not match"); return; }
    }

    setPinLoading(true);
    try {
      const res = await api.post<ApiResponse<{ pinSet: boolean }>>(
        "/api/voters/set-pin",
        { pin, distressPin }
      );
      if (!res.success) {
        if (res.error?.toLowerCase().includes("expired") || res.error?.toLowerCase().includes("invalid")) {
          setPinError("This setup link has expired. Please contact your IEBC registration officer for a new link.");
        } else {
          setPinError(res.error || "Failed to set PIN. Please try again.");
        }
        return;
      }

      // Optionally set login password
      if (password) {
        try {
          await api.post("/api/auth/set-password", { newPassword: password });
        } catch (pwErr) {
          // Non-fatal — PIN is already set; warn the voter
          setPinError(
            `PINs saved, but password setup failed: ${pwErr instanceof Error ? pwErr.message : "Unknown error"}. You can still log in with fingerprint.`
          );
          setView("done");
          return;
        }
      }

      setView("done");
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "A network error occurred. Please try again.");
    } finally {
      setPinLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (view === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-red-900">Invalid Setup Link</h2>
          <p className="mt-2 text-sm text-red-700">
            This link is missing or malformed. Please contact your IEBC registration officer for a new link.
          </p>
        </div>
      </div>
    );
  }

  if (view === "done") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-green-200 bg-green-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-green-900">Account Secured</h2>
          <p className="mt-3 text-sm text-green-700">Your PINs have been set successfully.</p>
          <ul className="mt-4 space-y-2 rounded-lg border border-green-300 bg-white p-4 text-left text-sm text-gray-700">
            {biometricEnrolled && (
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-green-600">✓</span>
                <span><strong>Biometric:</strong> Fingerprint / Face ID enrolled on this device for quick login.</span>
              </li>
            )}
            {password && (
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-green-600">✓</span>
                <span><strong>Login Password:</strong> You can now log in using the Password tab with your National ID and password.</span>
              </li>
            )}
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-green-600">✓</span>
              <span><strong>Normal PIN:</strong> The 4-digit PIN you chose — use it every time you vote.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-green-600">✓</span>
              <span><strong>Distress PIN:</strong> The second PIN you chose — use it <em>only</em> if forced to vote against your will. It silently alerts IEBC officials without revealing the coercion.</span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-green-600">
            Keep both PINs secret and private. You can now log in and vote on election day.
          </p>
        </div>
      </div>
    );
  }

  if (view === "webauthn") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Secure Your Account</h1>
            <p className="mt-2 text-sm text-gray-500">
              Step 1 of 2 — Optionally enroll your fingerprint or Face ID on <strong>this device</strong> for
              quicker login on election day. This is optional — you can skip and use your password instead.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            {webAuthnError && (
              <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{webAuthnError}</div>
            )}

            {biometricEnrolled ? (
              <div className="flex items-center gap-3 rounded-lg bg-green-50 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <p className="text-sm font-semibold text-green-800">Biometric enrolled on this device</p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                  Your fingerprint or Face ID data <strong>never leaves this device</strong>. Only a
                  cryptographic key is stored on the server — FIDO2/WebAuthn standard.
                </div>
                <button
                  type="button"
                  onClick={handleEnrollBiometric}
                  disabled={webAuthnLoading}
                  className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {webAuthnLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Waiting for biometric…
                    </span>
                  ) : "Enroll Fingerprint / Face ID"}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setView("pinSetup")}
              className="w-full rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {biometricEnrolled ? "Continue to PIN Setup →" : "Skip — Set PINs Only"}
            </button>
          </div>

          <p className="text-center text-xs text-gray-400">VeriVote Kenya — IEBC Secure Voting System</p>
        </div>
      </div>
    );
  }

  // ── PIN setup view ────────────────────────────────────────────────────────

  const { ok: pinOk } = pin.length === 4 ? isPinValid(pin) : { ok: false };
  const confirmMatch = confirmPin.length === 4 && confirmPin === pin;
  const { ok: distressOk } = distressPin.length === 4 ? isPinValid(distressPin) : { ok: false };
  const distressConfirmMatch = confirmDistressPin.length === 4 && confirmDistressPin === distressPin;
  const distressDiffOk =
    pin.length === 4 &&
    distressPin.length === 4 &&
    distressPin.split("").filter((d, i) => d !== pin[i]).length >= 2;
  const canSubmit = pinOk && confirmMatch && distressOk && distressConfirmMatch && distressDiffOk;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Set Your Voting PINs</h1>
          <p className="mt-2 text-sm text-gray-500">
            Step 2 of 2 — Set both your <strong>Normal PIN</strong> (used every time you vote) and your{" "}
            <strong>Distress PIN</strong> (used only if forced to vote against your will — silently alerts
            IEBC without revealing coercion). Keep both secret.
          </p>
        </div>

        <form onSubmit={handleSetPin} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
          {pinError && (
            <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">
              {pinError}
            </div>
          )}

          {/* Normal PIN */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-900">Normal PIN — you choose this</legend>
            <div>
              <label htmlFor="pin" className="mb-1 block text-xs font-medium text-gray-600">Enter PIN</label>
              <div className="relative">
                <input
                  id="pin" type={showPin ? "text" : "password"} inputMode="numeric"
                  maxLength={4} required value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="••••"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 pr-12 text-center text-2xl font-mono tracking-[1em] focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
                />
                <button type="button" onClick={() => setShowPin((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <EyeIcon open={showPin} />
                </button>
              </div>
              {pin.length === 4 && !pinOk && <p className="mt-1 text-xs text-red-600">{isPinValid(pin).error}</p>}
            </div>
            <div>
              <label htmlFor="confirmPin" className="mb-1 block text-xs font-medium text-gray-600">Confirm PIN</label>
              <div className="relative">
                <input
                  id="confirmPin" type={showConfirmPin ? "text" : "password"} inputMode="numeric"
                  maxLength={4} required value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="••••"
                  className={`w-full rounded-lg border px-4 py-3 pr-12 text-center text-2xl font-mono tracking-[1em] focus:ring-2 focus:outline-none ${
                    confirmPin.length === 4 && !confirmMatch
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-green-700 focus:ring-green-700"
                  }`}
                />
                <button type="button" onClick={() => setShowConfirmPin((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <EyeIcon open={showConfirmPin} />
                </button>
              </div>
              {confirmPin.length === 4 && !confirmMatch && <p className="mt-1 text-xs text-red-600">PINs do not match</p>}
            </div>
          </fieldset>

          <hr className="border-gray-200" />

          {/* Distress PIN */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-900">
              Distress PIN{" "}
              <span className="font-normal text-gray-500">— use ONLY if coerced</span>
            </legend>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Choose a PIN you would give under duress. Voting with this PIN casts your vote normally (so
              an attacker cannot tell) but silently flags the vote to IEBC security.
            </div>
            <div>
              <label htmlFor="distressPin" className="mb-1 block text-xs font-medium text-gray-600">Distress PIN</label>
              <div className="relative">
                <input
                  id="distressPin" type={showDistressPin ? "text" : "password"} inputMode="numeric"
                  maxLength={4} required value={distressPin}
                  onChange={(e) => setDistressPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="••••"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 pr-12 text-center text-2xl font-mono tracking-[1em] focus:border-amber-500 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <button type="button" onClick={() => setShowDistressPin((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <EyeIcon open={showDistressPin} />
                </button>
              </div>
              {distressPin.length === 4 && !distressOk && <p className="mt-1 text-xs text-red-600">{isPinValid(distressPin).error}</p>}
              {distressPin.length === 4 && distressOk && pin.length === 4 && !distressDiffOk && (
                <p className="mt-1 text-xs text-red-600">Must differ from Normal PIN in at least 2 positions</p>
              )}
            </div>
            <div>
              <label htmlFor="confirmDistressPin" className="mb-1 block text-xs font-medium text-gray-600">Confirm Distress PIN</label>
              <div className="relative">
                <input
                  id="confirmDistressPin" type={showConfirmDistressPin ? "text" : "password"} inputMode="numeric"
                  maxLength={4} required value={confirmDistressPin}
                  onChange={(e) => setConfirmDistressPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="••••"
                  className={`w-full rounded-lg border px-4 py-3 pr-12 text-center text-2xl font-mono tracking-[1em] focus:ring-2 focus:outline-none ${
                    confirmDistressPin.length === 4 && !distressConfirmMatch
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-amber-500 focus:ring-amber-500"
                  }`}
                />
                <button type="button" onClick={() => setShowConfirmDistressPin((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <EyeIcon open={showConfirmDistressPin} />
                </button>
              </div>
              {confirmDistressPin.length === 4 && !distressConfirmMatch && (
                <p className="mt-1 text-xs text-red-600">Distress PINs do not match</p>
              )}
            </div>
          </fieldset>

          {/* PIN rules */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
            <p className="font-semibold text-gray-700">Rules for both PINs:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Exactly 4 digits</li>
              <li>Not all the same digit (e.g. not 1111)</li>
              <li>Not sequential (e.g. not 1234 or 4321)</li>
              <li>Distress PIN must differ from Normal PIN in at least 2 positions</li>
            </ul>
          </div>

          <hr className="border-gray-200" />

          {/* Login password — optional */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-900">
              Login Password{" "}
              <span className="font-normal text-gray-500">— optional, enables password tab at login</span>
            </legend>
            <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              Set a password here if you want to log in with the <strong>Password</strong> tab on voting day.
              Leave blank to use fingerprint / biometric login only.
            </div>
            <div>
              <label htmlFor="setupPassword" className="mb-1 block text-xs font-medium text-gray-600">Password (min 8 characters)</label>
              <div className="relative">
                <input
                  id="setupPassword"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to skip"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 pr-12 text-sm focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>
            {password && (
              <div>
                <label htmlFor="confirmSetupPassword" className="mb-1 block text-xs font-medium text-gray-600">Confirm Password</label>
                <div className="relative">
                  <input
                    id="confirmSetupPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className={`w-full rounded-lg border px-4 py-3 pr-12 text-sm focus:ring-2 focus:outline-none ${
                      confirmPassword && confirmPassword !== password
                        ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                        : "border-gray-300 focus:border-green-700 focus:ring-green-700"
                    }`}
                  />
                  <button type="button" onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <EyeIcon open={showConfirmPassword} />
                  </button>
                </div>
                {confirmPassword && confirmPassword !== password && (
                  <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
                )}
              </div>
            )}
          </fieldset>

          <button
            type="submit"
            disabled={pinLoading || !canSubmit}
            className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pinLoading ? "Saving PINs…" : "Save My PINs"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400">VeriVote Kenya — IEBC Secure Voting System</p>
      </div>
    </div>
  );
}

export default function SetupPinPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    }>
      <SetupPinContent />
    </Suspense>
  );
}
