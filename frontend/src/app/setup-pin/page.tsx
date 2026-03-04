"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

function isPinValid(p: string): { ok: boolean; error: string } {
  if (!/^\d{4}$/.test(p)) return { ok: false, error: "PIN must be exactly 4 digits" };
  if (/^(\d)\1{3}$/.test(p)) return { ok: false, error: "PIN cannot be all the same digit (e.g. 1111)" };
  const d = p.split("").map(Number);
  const asc = d.every((v, i) => i === 0 || v === d[i - 1]! + 1);
  const desc = d.every((v, i) => i === 0 || v === d[i - 1]! - 1);
  if (asc || desc) return { ok: false, error: "PIN cannot be a sequential number (e.g. 1234)" };
  return { ok: true, error: "" };
}

function SetupPinForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (!token) {
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
            This link is missing required information. Please contact your IEBC registration officer for a new link.
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-green-200 bg-green-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-green-900">PIN Set Successfully</h2>
          <p className="mt-3 text-sm text-green-700">
            Your voting PIN has been saved. Your distress PIN has been sent to your registered contact (email or phone).
          </p>
          <div className="mt-4 rounded-lg border border-green-300 bg-white p-4 text-left text-sm text-gray-700 space-y-2">
            <p><span className="font-semibold">Normal PIN:</span> The one you just chose — use this to vote.</p>
            <p><span className="font-semibold">Distress PIN:</span> The one just sent to you — use it <em>only</em> if you are forced to vote against your will. It silently alerts IEBC officials.</p>
          </div>
          <p className="mt-4 text-xs text-green-600">
            You can now log in and cast your vote on election day. Keep both PINs safe and private.
          </p>
        </div>
      </div>
    );
  }

  async function handleSetPin(e: FormEvent) {
    e.preventDefault();
    setError("");

    const { ok, error: pinErr } = isPinValid(pin);
    if (!ok) { setError(pinErr); return; }
    if (pin !== confirmPin) { setError("PINs do not match"); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/voters/set-pin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ pin }),
      });

      const data: { success: boolean; error?: string } = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 401) {
          setError("This setup link has expired or is invalid. Please contact your IEBC registration officer.");
        } else {
          setError(data.error || "Failed to set PIN. Please try again.");
        }
        return;
      }

      setDone(true);
    } catch {
      setError("A network error occurred. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const { ok: pinOk } = pin.length === 4 ? isPinValid(pin) : { ok: false };
  const confirmMatch = confirmPin.length === 4 && confirmPin === pin;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Set Your Voting PIN</h1>
          <p className="mt-2 text-sm text-gray-500">
            Choose a private 4-digit PIN you will use on election day to cast your vote.
            After you set it, a distress PIN will be sent to your registered contact.
          </p>
        </div>

        <form onSubmit={handleSetPin} className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm space-y-5">

          {error && (
            <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          {/* Normal PIN */}
          <div>
            <label htmlFor="pin" className="mb-1 block text-sm font-semibold text-gray-700">
              Your PIN <span className="font-normal text-gray-400">(you choose)</span>
            </label>
            <div className="relative">
              <input
                id="pin"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                maxLength={4}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 pr-12 text-center text-2xl font-mono tracking-[1em] focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPin ? "Hide PIN" : "Show PIN"}
              >
                {showPin ? (
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
            {pin.length === 4 && !pinOk && (
              <p className="mt-1 text-xs text-red-600">{isPinValid(pin).error}</p>
            )}
          </div>

          {/* Confirm PIN */}
          <div>
            <label htmlFor="confirmPin" className="mb-1 block text-sm font-semibold text-gray-700">
              Confirm PIN
            </label>
            <div className="relative">
              <input
                id="confirmPin"
                type={showConfirmPin ? "text" : "password"}
                inputMode="numeric"
                maxLength={4}
                required
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                className={`w-full rounded-lg border px-4 py-3 pr-12 text-center text-2xl font-mono tracking-[1em] focus:ring-2 focus:outline-none ${
                  confirmPin.length === 4 && !confirmMatch
                    ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                    : "border-gray-300 focus:border-green-700 focus:ring-green-700"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPin((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showConfirmPin ? "Hide PIN" : "Show PIN"}
              >
                {showConfirmPin ? (
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
            {confirmPin.length === 4 && !confirmMatch && (
              <p className="mt-1 text-xs text-red-600">PINs do not match</p>
            )}
            {confirmPin.length === 4 && confirmMatch && pinOk && (
              <p className="mt-1 text-xs text-green-600">PINs match</p>
            )}
          </div>

          {/* PIN rules */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">PIN rules:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Exactly 4 digits</li>
              <li>Not all the same digit (e.g. not 1111)</li>
              <li>Not sequential (e.g. not 1234 or 4321)</li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={loading || !pinOk || !confirmMatch}
            className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Setting PIN…" : "Set My PIN"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-400">
          VeriVote Kenya — IEBC Secure Voting System
        </p>
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
      <SetupPinForm />
    </Suspense>
  );
}
