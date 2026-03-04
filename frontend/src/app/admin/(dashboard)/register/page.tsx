"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api-client";
import { Header } from "@/components/header";
import { COUNTRY_CODES } from "@/lib/country-codes";
import type { ApiResponse, PaginatedResponse, PollingStation, AdminRegisterResult, SetupLinkResult } from "@/lib/types";

type View = "form" | "fingerprint" | "done";

export default function RegisterPage() {
  const [view, setView] = useState<View>("form");
  const [stations, setStations] = useState<PollingStation[]>([]);

  // Registration form
  const [nationalId, setNationalId] = useState("");
  const [pollingStationId, setPollingStationId] = useState("");
  const [preferredContact, setPreferredContact] = useState<"SMS" | "EMAIL">("EMAIL");
  const [countryCode, setCountryCode] = useState("+254");
  const [localPhone, setLocalPhone] = useState("");
  const [email, setEmail] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState("");

  // After registration
  const [voterId, setVoterId] = useState("");

  // Fingerprint state
  const [fpLoading, setFpLoading] = useState(false);
  const [fpError, setFpError] = useState("");
  const [fpEnrolled, setFpEnrolled] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);

  // Done
  const [registeredContact, setRegisteredContact] = useState("");

  useEffect(() => {
    api
      .get<{ success: boolean } & PaginatedResponse<PollingStation>>(
        "/api/polling-stations?limit=100"
      )
      .then((res) => { if (res.data) setStations(res.data); })
      .catch(() => {});
  }, []);

  // ── Step 1: Register voter ─────────────────────────────────────────────────

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setRegError("");

    const phoneNumber = countryCode + localPhone.replace(/\D/g, "");
    if (preferredContact === "SMS" && !/^\+\d{7,15}$/.test(phoneNumber)) {
      setRegError("Enter a valid phone number.");
      return;
    }
    if (preferredContact === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setRegError("Enter a valid email address.");
      return;
    }

    setRegLoading(true);
    try {
      const res = await api.post<ApiResponse<AdminRegisterResult>>("/api/admin/register-voter", {
        nationalId,
        pollingStationId,
        preferredContact,
        phoneNumber: preferredContact === "SMS" ? phoneNumber : undefined,
        email: preferredContact === "EMAIL" ? email : undefined,
      });

      if (!res.success || !res.data) {
        setRegError(res.error || "Registration failed");
        return;
      }

      setVoterId(res.data.voterId);
      setView("fingerprint");
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegLoading(false);
    }
  }

  // ── Step 2a: Enroll fingerprint (WebAuthn) ─────────────────────────────────

  async function handleEnrollFingerprint() {
    setFpError("");
    setFpLoading(true);
    try {
      const optRes = await api.post<ApiResponse<Record<string, unknown>>>(
        "/api/webauthn/register/options",
        { voterId }
      );
      if (!optRes.success || !optRes.data) throw new Error("Failed to get fingerprint options");

      const { startRegistration } = await import("@simplewebauthn/browser");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attResp = await startRegistration({ optionsJSON: optRes.data as any });

      const verRes = await api.post<ApiResponse<{ verified: boolean }>>(
        "/api/webauthn/register/verify",
        { voterId, response: attResp }
      );
      if (!verRes.success || !verRes.data?.verified) throw new Error("Fingerprint verification failed");

      setFpEnrolled(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fingerprint enrollment failed";
      if (
        msg.toLowerCase().includes("cancel") ||
        msg.toLowerCase().includes("abort") ||
        msg.toLowerCase().includes("user")
      ) {
        setFpError("Fingerprint scan was cancelled. Please ask the voter to try again.");
      } else {
        setFpError(msg);
      }
    } finally {
      setFpLoading(false);
    }
  }

  // ── Step 2b: Send PIN setup link ───────────────────────────────────────────

  async function handleSendLink() {
    setFpError("");
    setLinkLoading(true);
    try {
      const res = await api.post<ApiResponse<SetupLinkResult>>(
        "/api/admin/send-setup-link",
        { voterId }
      );
      if (!res.success || !res.data) {
        setFpError(res.error || "Failed to send setup link");
        return;
      }
      setRegisteredContact(res.data.contact);
      setLinkSent(true);
      setView("done");
    } catch (err) {
      setFpError(err instanceof Error ? err.message : "Failed to send setup link");
    } finally {
      setLinkLoading(false);
    }
  }

  // Skip fingerprint — still sends PIN link so voter can complete setup
  async function handleSkipFingerprint() {
    setFpEnrolled(false);
    await handleSendLink();
  }

  function handleRegisterAnother() {
    setView("form");
    setNationalId("");
    setPollingStationId("");
    setLocalPhone("");
    setEmail("");
    setVoterId("");
    setFpEnrolled(false);
    setFpError("");
    setLinkSent(false);
    setRegisteredContact("");
    setRegError("");
  }

  // ── FORM VIEW ─────────────────────────────────────────────────────────────

  if (view === "form") {
    return (
      <>
        <Header title="Register Voter" />
        <div className="p-6">
          <div className="mx-auto max-w-lg">
            <form onSubmit={handleRegister} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
              {regError && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{regError}</div>
              )}

              <div>
                <label htmlFor="regNationalId" className="mb-1 block text-sm font-medium text-gray-700">
                  National ID
                </label>
                <input
                  id="regNationalId"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{8}"
                  maxLength={8}
                  required
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ""))}
                  placeholder="12345678"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="station" className="mb-1 block text-sm font-medium text-gray-700">
                  Polling Station
                </label>
                <select
                  id="station"
                  required
                  value={pollingStationId}
                  onChange={(e) => setPollingStationId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Select a station...</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>{s.code} — {s.name} ({s.county})</option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">Voter&apos;s Contact Method</p>
                <p className="mb-2 text-xs text-gray-500">
                  A PIN setup link will be sent here after fingerprint enrollment.
                </p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="contact" value="EMAIL" checked={preferredContact === "EMAIL"} onChange={() => setPreferredContact("EMAIL")} className="accent-blue-600" />
                    <span className="text-sm text-gray-700">Email</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="contact" value="SMS" checked={preferredContact === "SMS"} onChange={() => setPreferredContact("SMS")} className="accent-blue-600" />
                    <span className="text-sm text-gray-700">SMS (Phone)</span>
                  </label>
                </div>
              </div>

              {preferredContact === "EMAIL" ? (
                <div>
                  <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
                    Voter&apos;s Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voter@example.com"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Voter&apos;s Phone Number
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="w-36 rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    >
                      {COUNTRY_CODES.map((c) => (
                        <option key={`${c.dial}-${c.name}`} value={c.dial}>{c.flag} {c.dial}</option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      inputMode="numeric"
                      required
                      value={localPhone}
                      onChange={(e) => setLocalPhone(e.target.value.replace(/\D/g, ""))}
                      placeholder="712345678"
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={regLoading || nationalId.length !== 8 || !pollingStationId}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {regLoading ? "Registering..." : "Register Voter →"}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  // ── FINGERPRINT VIEW ───────────────────────────────────────────────────────

  if (view === "fingerprint") {
    return (
      <>
        <Header title="Fingerprint Enrollment" />
        <div className="p-6">
          <div className="mx-auto max-w-md space-y-4">

            {/* Progress indicator */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-white font-bold text-[10px]">✓</span>
              <span className="text-green-700 font-medium">Voter registered</span>
              <span className="flex-1 border-t border-gray-300" />
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-[10px]">2</span>
              <span className="text-blue-700 font-medium">Capture fingerprint</span>
              <span className="flex-1 border-t border-gray-300" />
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-300 text-gray-600 font-bold text-[10px]">3</span>
              <span className="text-gray-400">Send PIN link</span>
            </div>

            {/* Officer instructions */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <strong>IEBC Officer:</strong> Ask the voter to place their finger on the biometric reader
              (or use Windows Hello / Face ID on this device). Do not touch the device during scan.
            </div>

            {/* Main card */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-center space-y-4">

              {/* Fingerprint icon */}
              <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full transition-colors ${
                fpEnrolled ? "bg-green-100" : "bg-blue-50"
              }`}>
                {fpEnrolled ? (
                  <svg className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  /* Fingerprint SVG icon */
                  <svg className="h-10 w-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
                  </svg>
                )}
              </div>

              {fpEnrolled ? (
                <div>
                  <p className="text-base font-semibold text-green-700">Fingerprint Enrolled</p>
                  <p className="mt-1 text-sm text-gray-500">
                    The voter&apos;s biometric credential has been securely captured on this device.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-base font-semibold text-gray-800">Ready to Scan</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Clicking the button below will activate the biometric reader (Windows Hello / Touch ID).
                    The fingerprint never leaves this device.
                  </p>
                </div>
              )}

              {fpError && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{fpError}</div>
              )}

              {!fpEnrolled && (
                <button
                  type="button"
                  onClick={handleEnrollFingerprint}
                  disabled={fpLoading}
                  className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
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

              {/* Send PIN link button — only enabled after enrollment */}
              {fpEnrolled && (
                <button
                  type="button"
                  onClick={handleSendLink}
                  disabled={linkLoading}
                  className="w-full rounded-md bg-green-700 px-4 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {linkLoading ? "Sending link…" : "Send PIN Setup Link →"}
                </button>
              )}
            </div>

            {/* Security note */}
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-500 space-y-1">
              <p className="font-semibold text-gray-600">Security guarantee</p>
              <p>
                The fingerprint is processed entirely on this device using the FIDO2/WebAuthn standard.
                Only a cryptographic public key is stored on the server — no biometric data is transmitted or saved.
                The private key and raw fingerprint template never leave the secure hardware of this device.
              </p>
            </div>

            {/* Skip option */}
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
        </div>
      </>
    );
  }

  // ── DONE VIEW ──────────────────────────────────────────────────────────────

  return (
    <>
      <Header title="Registration Complete" />
      <div className="p-6">
        <div className="mx-auto max-w-md">
          <div className="rounded-lg border border-green-200 bg-green-50 p-6">

            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <svg className="h-5 w-5 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-green-900">Voter Registered Successfully</h3>
            </div>

            <ul className="space-y-2 text-sm text-green-800">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-green-600">✓</span>
                <span>Voter identity recorded and SBT minted on-chain</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-green-600">{fpEnrolled ? "✓" : "–"}</span>
                <span>
                  {fpEnrolled
                    ? "Biometric credential (fingerprint) enrolled on this device"
                    : "Fingerprint skipped — voter can enroll later"}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-green-600">✓</span>
                <span>
                  PIN setup link sent to <span className="font-medium">{registeredContact}</span>
                </span>
              </li>
            </ul>

            <p className="mt-4 text-xs text-green-600">
              The voter will click the link on their own device to set a private PIN.
              Their distress PIN is sent automatically after they complete setup.
              Neither PIN is visible to officers at any point.
            </p>

            <button
              type="button"
              onClick={handleRegisterAnother}
              className="mt-5 w-full rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
            >
              Register Another Voter
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
