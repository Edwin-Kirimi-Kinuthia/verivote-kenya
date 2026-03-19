"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useTranslation } from "@/contexts/language-context";
import { AppointmentSlotPicker } from "@/components/appointment-slot-picker";
import { CountryCodeSelect } from "@/components/country-code-select";
import type {
  PollingStation,
  NearbyStation,
  BookedAppointmentResult,
  ApiResponse,
  PaginatedResponse,
} from "@/lib/types";

type View =
  | "form"
  | "otp"
  | "options"
  | "personaInProgress"
  | "webauthn"
  | "pinSetup"
  | "pinSent"
  | "booking"
  | "confirmed";

interface RegistrationData {
  voterId: string;
  kycRequired: boolean;
  // Only present when kycRequired = true
  inquiryId?: string;
  personaUrl?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const personaAttemptsRef = useRef(0);

  const [view, setView] = useState<View>("form");
  const [stations, setStations] = useState<PollingStation[]>([]);

  // Form fields
  const [idDocumentType, setIdDocumentType] = useState<"NATIONAL_ID" | "PASSPORT">("NATIONAL_ID");
  const [nationalId, setNationalId] = useState("");
  const [pollingStationId, setPollingStationId] = useState("");
  const [preferredContact, setPreferredContact] = useState<"SMS" | "EMAIL">("EMAIL");
  const [countryCode, setCountryCode] = useState("+254");
  const [localPhone, setLocalPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Data returned from registration
  const [regData, setRegData] = useState<RegistrationData | null>(null);

  // OTP state
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Manual review + booking state
  const [manualLoading, setManualLoading] = useState(false);
  const [bookedAppointment, setBookedAppointment] = useState<BookedAppointmentResult | null>(null);

  // WebAuthn state
  const [webAuthnLoading, setWebAuthnLoading] = useState(false);
  const [webAuthnError, setWebAuthnError] = useState("");

  // PIN setup state
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [distressPin, setDistressPin] = useState("");
  const [confirmDistressPin, setConfirmDistressPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [showDistressPin, setShowDistressPin] = useState(false);
  const [showConfirmDistressPin, setShowConfirmDistressPin] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState("");

  // Polling station search/dropdown
  const [stationSearch, setStationSearch] = useState("");
  const [stationDropdownOpen, setStationDropdownOpen] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [nearbyStationIds, setNearbyStationIds] = useState<string[]>([]);
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null); // null = Kenya / domestic
  const stationDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<{ success: boolean } & PaginatedResponse<PollingStation>>(
        "/api/polling-stations?limit=500"
      )
      .then((res) => { if (res.data) setStations(res.data); })
      .catch(() => {});
  }, []);

  // Close station dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (stationDropdownRef.current && !stationDropdownRef.current.contains(e.target as Node)) {
        setStationDropdownOpen(false);
        setStationSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Cooldown timer for OTP resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Persona postMessage listener — fires when Persona completes in a new tab (opener postMessage)
  useEffect(() => {
    if (view !== "personaInProgress") return;

    const handler = (event: MessageEvent) => {
      const name: string = event.data?.name ?? event.data?.type ?? "";
      if (!name.startsWith("persona:")) return;
      if (name === "persona:inquiry:completed" || name === "persona:inquiry:approved") {
        checkPersonaStatus();
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // ── Geolocation — detect nearest polling stations ─────────────────────────

  async function detectNearbyStations() {
    if (!navigator.geolocation) return;
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          // Step 1 — reverse-geocode to get the actual country (Nominatim/OSM, free, no key)
          let country: string | null = null;
          let countryCode: string | null = null;
          try {
            const geo = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`,
              { headers: { "Accept": "application/json" } }
            );
            if (geo.ok) {
              const geoJson = await geo.json() as { address?: { country?: string; country_code?: string } };
              country = geoJson.address?.country ?? null;
              countryCode = geoJson.address?.country_code?.toLowerCase() ?? null;
            }
          } catch { /* geolocation still works even if reverse-geocoding fails */ }

          const isKenya = !countryCode || countryCode === "ke";

          if (isKenya) {
            // Domestic — find nearest Kenya polling station
            setDetectedCountry(null);
            const res = await api.get<{ success: boolean; data: NearbyStation[] }>(
              `/api/polling-stations/nearby?lat=${lat}&lng=${lng}&limit=5`
            );
            if (res.data?.length) {
              const ids = res.data.map((s) => s.id);
              setNearbyStationIds(ids);
              if (!pollingStationId) setPollingStationId(ids[0]!);
            }
          } else {
            // Diaspora — find nearest embassy/consulate in this specific country
            setDetectedCountry(country);
            const params = `lat=${lat}&lng=${lng}&limit=5&isDiaspora=true${country ? `&country=${encodeURIComponent(country)}` : ""}`;
            const res = await api.get<{ success: boolean; data: NearbyStation[] }>(
              `/api/polling-stations/nearby?${params}`
            );
            // Load all diaspora stations for this country into the dropdown
            if (country) {
              const all = await api.get<{ success: boolean } & PaginatedResponse<PollingStation>>(
                `/api/polling-stations?isDiaspora=true&country=${encodeURIComponent(country)}&limit=200`
              );
              if (all.data) setStations(all.data);
            }
            if (res.data?.length) {
              const ids = res.data.map((s) => s.id);
              setNearbyStationIds(ids);
              if (!pollingStationId) setPollingStationId(ids[0]!);
            }
          }
        } finally {
          setLocationLoading(false);
        }
      },
      () => setLocationLoading(false)
    );
  }

  // ── Password strength ──────────────────────────────────────────────────────

  const KEYBOARD_SEQUENCES = [
    "qwertyuiop", "asdfghjkl", "zxcvbnm",
    "abcdefghijklmnopqrstuvwxyz",
    "0123456789",
  ];

  function hasConsecutiveSequence(pw: string): boolean {
    const lower = pw.toLowerCase();
    for (const seq of KEYBOARD_SEQUENCES) {
      const rev = seq.split("").reverse().join("");
      for (let i = 0; i <= seq.length - 4; i++) {
        if (lower.includes(seq.slice(i, i + 4))) return true;
        if (lower.includes(rev.slice(i, i + 4))) return true;
      }
    }
    return false;
  }

  function passwordStrength(pw: string): { score: number; label: string; color: string; consecutiveError: boolean } {
    const consecutiveError = hasConsecutiveSequence(pw);
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (consecutiveError) score = Math.min(score, 2); // cap at Weak if sequential chars
    const labels = ["", "Very weak", "Weak", "Fair", "Strong", "Very strong"];
    const colors = ["", "bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-blue-500", "bg-green-600"];
    return { score, label: labels[score] || "", color: colors[score] || "", consecutiveError };
  }

  const strength = passwordStrength(password);

  // ── Step 1: Register ──────────────────────────────────────────────────────

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (strength.score < 3) {
      setError("Password is too weak. Use uppercase, lowercase, number, and special character.");
      return;
    }
    if (strength.consecutiveError) {
      setError('Password must not contain more than 3 consecutive keyboard or sequential characters (e.g. "qwer", "1234", "abcd").');
      return;
    }
    const digits = localPhone.replace(/\D/g, "");
    const phoneNumber = countryCode + digits;
    if (preferredContact === "SMS") {
      const isKenya = countryCode === "+254";
      const validLength = isKenya ? (digits.length >= 9 && digits.length <= 10) : (digits.length >= 7 && digits.length <= 12);
      if (!validLength || !/^\+\d+$/.test(phoneNumber)) {
        setError(
          isKenya
            ? "Enter a valid Kenyan number — 9 or 10 digits after +254 (e.g. 712345678)."
            : "Enter a valid phone number (7–12 digits after the country code)."
        );
        return;
      }
    }
    if (preferredContact === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<ApiResponse<RegistrationData>>("/api/voters/register", {
        nationalId,
        idDocumentType,
        pollingStationId: pollingStationId || undefined,
        preferredContact,
        phoneNumber: preferredContact === "SMS" ? (countryCode + localPhone.replace(/\D/g, "")) : undefined,
        email: preferredContact === "EMAIL" ? email : undefined,
        password,
      });

      if (!res.success) {
        setError(res.error || t("common.error"));
        return;
      }

      setRegData(res.data ?? null);

      // Trigger OTP to confirm contact
      await requestOtp();
      setView("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  async function requestOtp() {
    await api.post("/api/auth/request-otp", {
      nationalId,
      purpose: "CONTACT_VERIFY",
    });
    setResendCooldown(60);
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return;
    setError("");
    try {
      await requestOtp();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    }
  }

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOtpLoading(true);
    try {
      const res = await api.post<ApiResponse<unknown>>("/api/auth/verify-otp", {
        nationalId,
        code: otpCode,
        purpose: "CONTACT_VERIFY",
      });
      if (!res.success) {
        setError((res as ApiResponse<unknown> & { error?: string }).error || "Invalid code");
        return;
      }

      // Non-KYC election: complete registration via contact verification, no Persona needed
      if (regData && !regData.kycRequired) {
        const completeRes = await api.post<ApiResponse<{ setupToken?: string }>>("/api/voters/complete-contact-verification", {
          voterId: regData.voterId,
        });
        if (!completeRes.success) {
          setError((completeRes as ApiResponse<unknown> & { error?: string }).error || "Registration failed");
          return;
        }
        if (completeRes.data?.setupToken) {
          localStorage.setItem("token", completeRes.data.setupToken);
        }
        setView("webauthn");
        return;
      }

      // KYC election: proceed to Persona verification
      setView("options");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setOtpLoading(false);
    }
  }

  // ── Step 3: Persona KYC ───────────────────────────────────────────────────

  const [checkingStatus, setCheckingStatus] = useState(false);
  const [personaAttempts, setPersonaAttempts] = useState(0);

  function handleOpenPersona() {
    if (!regData?.personaUrl) return;
    personaAttemptsRef.current = 0;
    setPersonaAttempts(0);
    setError("");
    const tab = window.open(regData.personaUrl, "_blank", "noopener");
    setView("personaInProgress");
    startPolling();
    if (!tab) {
      setError(
        "Your browser blocked the verification tab. Please allow pop-ups for this site, then click \"Re-open Persona Tab\" below."
      );
    }
  }

  function startPolling() {
    if (!regData?.inquiryId) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => checkPersonaStatus(), 6000);
  }

  async function checkPersonaStatus() {
    if (!regData?.inquiryId) return;
    setCheckingStatus(true);
    try {
      const res = await api.get<ApiResponse<{ status: string; setupToken?: string }>>(
        `/api/voters/registration-status/${regData.inquiryId}`
      );
      if (res.data?.status === "REGISTERED") {
        if (pollRef.current) clearInterval(pollRef.current);
        if (res.data.setupToken) {
          localStorage.setItem("token", res.data.setupToken);
        }
        setView("webauthn");
      } else if (
        res.data?.status === "VERIFICATION_FAILED" ||
        res.data?.status === "SUSPENDED" ||
        res.data?.status === "PENDING_MANUAL_REVIEW"
      ) {
        if (pollRef.current) clearInterval(pollRef.current);
        personaAttemptsRef.current += 1;
        setPersonaAttempts(personaAttemptsRef.current);
        if (personaAttemptsRef.current >= 3) {
          setError("Verification failed after 3 attempts. Please book an in-person appointment.");
        } else {
          setError(
            `Verification failed. ${3 - personaAttemptsRef.current} attempt(s) remaining. ` +
            `Click "Try Again" to re-open Persona, or choose in-person verification.`
          );
        }
        setView("options");
      }
    } catch {
      // network hiccup — keep polling
    } finally {
      setCheckingStatus(false);
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

  // ── Step 4: WebAuthn enrollment (optional) ────────────────────────────────

  async function handleEnrollFingerprint() {
    if (!regData?.voterId) return;
    setWebAuthnError("");
    setWebAuthnLoading(true);
    try {
      // Get registration options from backend (setup JWT is in localStorage)
      const optRes = await api.post<ApiResponse<Record<string, unknown>>>(
        "/api/webauthn/register/options",
        { voterId: regData.voterId }
      );
      if (!optRes.success || !optRes.data) throw new Error("Failed to get registration options");

      // Use SimpleWebAuthn browser SDK
      const { startRegistration } = await import("@simplewebauthn/browser");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attResp = await startRegistration({ optionsJSON: optRes.data as any });

      // Verify with backend
      const verRes = await api.post<ApiResponse<unknown>>(
        "/api/webauthn/register/verify",
        { voterId: regData.voterId, response: attResp }
      );
      if (!verRes.success) throw new Error("Fingerprint enrollment failed");

      setView("pinSetup");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Enrollment failed";
      if (msg.includes("cancelled") || msg.includes("user") || msg.includes("abort")) {
        setWebAuthnError("Fingerprint capture was cancelled. Please try again.");
      } else {
        setWebAuthnError(msg);
      }
    } finally {
      setWebAuthnLoading(false);
    }
  }

  // ── Step 5: PIN setup ─────────────────────────────────────────────────────

  function isPinValid(p: string): { ok: boolean; error: string } {
    if (!/^\d{4}$/.test(p)) return { ok: false, error: "PIN must be exactly 4 digits" };
    if (/^(\d)\1{3}$/.test(p)) return { ok: false, error: "PIN cannot be all the same digit (e.g. 1111)" };
    const d = p.split("").map(Number);
    const asc = d.every((v, i) => i === 0 || v === d[i - 1]! + 1);
    const desc = d.every((v, i) => i === 0 || v === d[i - 1]! - 1);
    if (asc || desc) return { ok: false, error: "PIN cannot be a sequential number (e.g. 1234)" };
    return { ok: true, error: "" };
  }

  async function handleSetPin(e: FormEvent) {
    e.preventDefault();
    setPinError("");
    const { ok, error: pinErr } = isPinValid(pin);
    if (!ok) { setPinError(pinErr); return; }
    if (pin !== confirmPin) { setPinError("PINs do not match"); return; }
    const { ok: distressOk, error: distressErr } = isPinValid(distressPin);
    if (!distressOk) { setPinError(`Distress PIN: ${distressErr}`); return; }
    if (distressPin !== confirmDistressPin) { setPinError("Distress PINs do not match"); return; }
    const diffCount = distressPin.split("").filter((d, i) => d !== pin[i]).length;
    if (diffCount < 2) { setPinError("Distress PIN must differ from your normal PIN in at least 2 digit positions"); return; }
    setPinLoading(true);
    try {
      const res = await api.post<ApiResponse<{ pinSet: boolean; message: string }>>(
        "/api/voters/set-pin",
        { pin, distressPin }
      );
      if (!res.success) {
        setPinError((res as ApiResponse<unknown> & { error?: string }).error || "Failed to set PIN");
        return;
      }
      setView("pinSent");
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Failed to set PIN");
    } finally {
      setPinLoading(false);
    }
  }

  // ── VIEWS ─────────────────────────────────────────────────────────────────

  if (view === "form") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900">{t("register.title")}</h1>
            <p className="mt-2 text-base text-gray-500">{t("register.subtitle")}</p>
          </div>

          <form
            onSubmit={handleRegister}
            className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm space-y-5"
          >
            {error && (
              <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            {/* Identity document type */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Identity Document Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["NATIONAL_ID", "PASSPORT"] as const).map((type) => {
                  const labels: Record<string, string> = {
                    NATIONAL_ID: "National ID",
                    PASSPORT: "Passport",
                  };
                  return (
                    <label
                      key={type}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        idDocumentType === type
                          ? "border-green-600 bg-green-50 text-green-800 font-medium"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="idDocumentType"
                        value={type}
                        checked={idDocumentType === type}
                        onChange={() => { setIdDocumentType(type); setNationalId(""); }}
                        className="accent-green-700"
                      />
                      {labels[type]}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Identity document number */}
            <div>
              <label htmlFor="nationalId" className="mb-2 block text-sm font-semibold text-gray-700">
                {idDocumentType === "NATIONAL_ID" ? "National ID Number" : "Passport Number"}
              </label>
              <input
                id="nationalId"
                type="text"
                inputMode={idDocumentType === "NATIONAL_ID" ? "numeric" : "text"}
                maxLength={idDocumentType === "NATIONAL_ID" ? 9 : 12}
                required
                value={nationalId}
                onChange={(e) => {
                  const val = e.target.value;
                  if (idDocumentType === "NATIONAL_ID") {
                    setNationalId(val.replace(/\D/g, "").slice(0, 9));
                  } else {
                    setNationalId(val.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12));
                  }
                }}
                placeholder={idDocumentType === "NATIONAL_ID" ? "12345678" : "AB123456"}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">
                {idDocumentType === "NATIONAL_ID" ? "5–9 digits" : "6–12 alphanumeric characters"}
              </p>
            </div>

            {/* Polling Station — searchable dropdown with geolocation */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-semibold text-gray-700">
                  {t("register.station")}
                </label>
                <button
                  type="button"
                  onClick={detectNearbyStations}
                  disabled={locationLoading}
                  className="flex items-center gap-1 text-xs text-green-700 hover:text-green-800 disabled:opacity-50 font-medium"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {locationLoading ? "Detecting…" : nearbyStationIds.length > 0 ? "Location detected" : "Use my location"}
                </button>
              </div>

              {detectedCountry && (
                <div className="mb-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
                  Diaspora detected: <strong>{detectedCountry}</strong> — showing nearest Kenyan embassy/consulate.
                </div>
              )}
              <div ref={stationDropdownRef} className="relative">
                {/* Trigger button */}
                <button
                  type="button"
                  onClick={() => setStationDropdownOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none bg-white"
                >
                  {(() => {
                    const sel = stations.find((s) => s.id === pollingStationId);
                    return sel ? (
                      <span className="text-gray-900 text-left truncate">{sel.code} — {sel.name}</span>
                    ) : (
                      <span className="text-gray-400">{t("register.stationPlaceholder")}</span>
                    );
                  })()}
                  <svg
                    className={`h-4 w-4 shrink-0 text-gray-400 ml-2 transition-transform ${stationDropdownOpen ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {stationDropdownOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                    {/* Search input */}
                    <div className="border-b border-gray-100 p-2">
                      <input
                        type="text"
                        value={stationSearch}
                        onChange={(e) => setStationSearch(e.target.value)}
                        placeholder="Search by name or code…"
                        autoFocus
                        className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600 focus:outline-none"
                      />
                    </div>
                    <ul className="max-h-56 overflow-y-auto py-1">
                      {(() => {
                        const q = stationSearch.trim().toLowerCase();
                        const filtered = q
                          ? stations.filter((s) =>
                              s.name.toLowerCase().includes(q) ||
                              s.code.toLowerCase().includes(q) ||
                              s.county.toLowerCase().includes(q) ||
                              s.constituency.toLowerCase().includes(q) ||
                              s.ward.toLowerCase().includes(q)
                            )
                          : [...stations].sort((a, b) => {
                              const aN = nearbyStationIds.indexOf(a.id);
                              const bN = nearbyStationIds.indexOf(b.id);
                              if (aN !== -1 && bN !== -1) return aN - bN;
                              if (aN !== -1) return -1;
                              if (bN !== -1) return 1;
                              return 0;
                            });
                        if (filtered.length === 0) {
                          return <li className="px-3 py-2 text-sm text-gray-400">No stations found</li>;
                        }
                        return filtered.map((s) => (
                          <li
                            key={s.id}
                            onClick={() => { setPollingStationId(s.id); setStationDropdownOpen(false); setStationSearch(""); }}
                            className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-green-50 ${pollingStationId === s.id ? "bg-green-50 font-semibold text-green-800" : "text-gray-800"}`}
                          >
                            {nearbyStationIds.includes(s.id) && (
                              <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">Near you</span>
                            )}
                            <span className="flex-1 truncate">{s.code} — {s.name}</span>
                            <span className="shrink-0 text-xs text-gray-400">{s.county}</span>
                          </li>
                        ));
                      })()}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Contact preference */}
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-700">How should we reach you?</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="preferredContact"
                    value="EMAIL"
                    checked={preferredContact === "EMAIL"}
                    onChange={() => setPreferredContact("EMAIL")}
                    className="accent-green-700"
                  />
                  <span className="text-sm text-gray-700">Email</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="preferredContact"
                    value="SMS"
                    checked={preferredContact === "SMS"}
                    onChange={() => setPreferredContact("SMS")}
                    className="accent-green-700"
                  />
                  <span className="text-sm text-gray-700">SMS (Phone)</span>
                </label>
              </div>
            </div>

            {/* Email or Phone */}
            {preferredContact === "EMAIL" ? (
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-gray-700">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
                />
              </div>
            ) : (
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Phone Number
                </label>
                <div className="flex gap-2">
                  <CountryCodeSelect
                    value={countryCode}
                    onChange={setCountryCode}
                    className="w-36"
                  />
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    required
                    value={localPhone}
                    onChange={(e) => setLocalPhone(e.target.value.replace(/\D/g, "").slice(0, countryCode === "+254" ? 10 : 12))}
                    placeholder={countryCode === "+254" ? "712345678" : "XXXXXXXXX"}
                    maxLength={countryCode === "+254" ? 10 : 12}
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {countryCode === "+254"
                    ? `9–10 digits — Full: ${countryCode}${localPhone || "712345678"}`
                    : `Full number: ${countryCode}${localPhone || "XXXXXXXXX"}`}
                </p>
              </div>
            )}

            {/* Password */}
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
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 pr-11 text-base focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
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
              {password.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1 h-1.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-full ${i <= strength.score ? strength.color : "bg-gray-200"}`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">
                    {strength.label} — Must have uppercase, lowercase, number &amp; special character
                  </p>
                  {strength.consecutiveError && (
                    <p className="text-xs text-red-600 font-medium">
                      ✗ No more than 3 consecutive keyboard or sequential characters (e.g. &quot;qwer&quot;, &quot;1234&quot;, &quot;abcd&quot;)
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="mb-2 block text-sm font-semibold text-gray-700">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className={`w-full rounded-lg border px-4 py-3 pr-11 text-base focus:ring-2 focus:outline-none ${
                    confirmPassword && confirmPassword !== password
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-green-700 focus:ring-green-700"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? (
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
              {confirmPassword.length > 0 && confirmPassword !== password && (
                <p className="mt-1 text-xs font-medium text-red-600">Passwords do not match</p>
              )}
              {confirmPassword.length > 0 && confirmPassword === password && (
                <p className="mt-1 text-xs font-medium text-green-600">Passwords match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !(
                idDocumentType === "NATIONAL_ID" ? /^\d{5,9}$/.test(nationalId) :
                /^[A-Z0-9]{6,12}$/i.test(nationalId)
              )}
              className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Registering..." : t("register.submit")}
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

  // ── OTP verification view ────────────────────────────────────────────────

  if (view === "otp") {
    const contactHint =
      preferredContact === "EMAIL"
        ? `your email ${email}`
        : `your phone ${countryCode}${localPhone}`;

    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
              <svg className="h-7 w-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zm0 0c0 1.657 1.007 3 2.25 3S21 13.657 21 12a9 9 0 10-2.636 6.364M16.5 12V8.25" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Verify Your Contact</h1>
            <p className="mt-2 text-sm text-gray-500">
              We sent a 6-digit code to {contactHint}. Enter it below to continue.
            </p>
          </div>

          <form
            onSubmit={handleVerifyOtp}
            className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm space-y-5"
          >
            {error && (
              <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

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
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-500 text-center">Code expires in 10 minutes</p>
            </div>

            <button
              type="submit"
              disabled={otpLoading || otpCode.length !== 6}
              className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {otpLoading ? "Verifying..." : "Verify Code"}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendCooldown > 0}
                className="text-sm text-green-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ── Verification options ──────────────────────────────────────────────────

  if (view === "options") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900">Verify Your Identity</h1>
            <p className="mt-2 text-sm text-gray-500">
              Your contact has been confirmed. Now verify your identity to complete registration.
            </p>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Online KYC */}
            <div className="flex flex-col rounded-xl border-2 border-blue-200 bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center gap-3">
                <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
                </svg>
                <h2 className="text-base font-semibold text-gray-900">{t("register.personaTitle")}</h2>
              </div>
              <p className="mb-4 flex-1 text-sm text-gray-500">
                Complete a quick Government ID + Selfie check online. Takes about 2 minutes.
              </p>
              <button
                type="button"
                onClick={handleOpenPersona}
                disabled={!regData?.personaUrl}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {t("register.personaButton")}
              </button>
            </div>

            {/* In-person */}
            <div className="flex flex-col rounded-xl border-2 border-amber-200 bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center gap-3">
                <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
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

  // ── Persona in-progress — new tab, polling-based auto-advance ───────────

  if (view === "personaInProgress") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-6">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
              {checkingStatus ? (
                <svg className="h-8 w-8 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              )}
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Identity Verification</h1>
            <p className="mt-2 text-sm text-gray-500">
              Persona has opened in a new tab. Complete your Government ID + Selfie check there.
              This page will advance automatically once verification is complete.
            </p>
            {personaAttempts > 0 && (
              <span className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                Attempt {personaAttempts + 1} / 3
              </span>
            )}
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs text-blue-700">
              Status is checked automatically every 6 seconds. Click <strong>Check Status</strong> manually after finishing in the Persona tab.
            </p>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={checkPersonaStatus}
              disabled={checkingStatus}
              className="w-full rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
            >
              {checkingStatus ? "Checking…" : "Check Status"}
            </button>
            <a
              href={regData?.personaUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={`block w-full rounded-lg border border-blue-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-blue-700 hover:bg-blue-50 ${!regData?.personaUrl ? "pointer-events-none opacity-50" : ""}`}
            >
              Re-open Persona Tab
            </a>
            <button
              type="button"
              onClick={() => {
                if (pollRef.current) clearInterval(pollRef.current);
                setError("");
                setView("options");
              }}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── WebAuthn enrollment (optional) ───────────────────────────────────────

  if (view === "webauthn") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Set Up Fingerprint Login</h1>
            <p className="mt-2 text-sm text-gray-500">
              Enroll your fingerprint or device biometric (Windows Hello, Face ID) for faster login. This is optional — you can use your password instead.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm space-y-4">
            {webAuthnError && (
              <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
                {webAuthnError}
              </div>
            )}

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              Fingerprint enrollment is required to complete registration. Please use your device biometric reader (Windows Hello, Touch ID, or fingerprint sensor).
            </div>

            <button
              type="button"
              onClick={handleEnrollFingerprint}
              disabled={webAuthnLoading}
              className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:opacity-50"
            >
              {webAuthnLoading ? "Waiting for device..." : "Enroll Fingerprint / Windows Hello"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── PIN setup ─────────────────────────────────────────────────────────────

  if (view === "pinSetup") {
    const { ok: pinOk } = pin.length === 4 ? isPinValid(pin) : { ok: false };
    const confirmMatch = confirmPin.length === 4 && confirmPin === pin;
    const { ok: distressOk } = distressPin.length === 4 ? isPinValid(distressPin) : { ok: false };
    const distressConfirmMatch = confirmDistressPin.length === 4 && confirmDistressPin === distressPin;
    const distressDiffOk = pin.length === 4 && distressPin.length === 4 &&
      distressPin.split("").filter((d, i) => d !== pin[i]).length >= 2;
    const canSubmit = pinOk && confirmMatch && distressOk && distressConfirmMatch && distressDiffOk;

    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Set Your Voting PINs</h1>
            <p className="mt-2 text-sm text-gray-500">
              Set both your <strong>Normal PIN</strong> (used every time you vote) and your <strong>Distress PIN</strong> (used only if forced to vote against your will — silently alerts IEBC). Keep both secret.
            </p>
          </div>

          <form onSubmit={handleSetPin} className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm space-y-5">
            {pinError && (
              <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">
                {pinError}
              </div>
            )}

            <div>
              <label htmlFor="pin" className="mb-2 block text-sm font-semibold text-gray-700">
                Normal PIN (you choose)
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
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-2xl font-mono tracking-[1em] focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
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

            <div>
              <label htmlFor="confirmPin" className="mb-2 block text-sm font-semibold text-gray-700">
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
                  className={`w-full rounded-lg border px-4 py-3 text-center text-2xl font-mono tracking-[1em] focus:ring-2 focus:outline-none ${
                    confirmPin.length === 4 && confirmPin !== pin
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
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
              <p className="font-semibold">PIN rules (apply to both PINs):</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Exactly 4 digits</li>
                <li>Not all the same (e.g. 1111)</li>
                <li>Not sequential (e.g. 1234 or 4321)</li>
                <li>Distress PIN must differ from Normal PIN in at least 2 positions</li>
              </ul>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200 pt-2">
              <p className="text-sm font-semibold text-gray-700 mb-4">
                Distress PIN
                <span className="ml-2 text-xs font-normal text-gray-500">— enter this if forced to vote against your will</span>
              </p>
            </div>

            {/* Distress PIN */}
            <div>
              <label htmlFor="distressPin" className="mb-2 block text-sm font-semibold text-gray-700">
                Distress PIN (you choose)
              </label>
              <div className="relative">
                <input
                  id="distressPin"
                  type={showDistressPin ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={4}
                  required
                  value={distressPin}
                  onChange={(e) => setDistressPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="••••"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-2xl font-mono tracking-[1em] focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowDistressPin((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showDistressPin ? "Hide PIN" : "Show PIN"}
                >
                  {showDistressPin ? (
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
              {distressPin.length === 4 && !distressOk && (
                <p className="mt-1 text-xs text-red-600">{isPinValid(distressPin).error}</p>
              )}
              {distressPin.length === 4 && distressOk && pin.length === 4 && !distressDiffOk && (
                <p className="mt-1 text-xs text-red-600">Must differ from your Normal PIN in at least 2 positions</p>
              )}
            </div>

            {/* Confirm Distress PIN */}
            <div>
              <label htmlFor="confirmDistressPin" className="mb-2 block text-sm font-semibold text-gray-700">
                Confirm Distress PIN
              </label>
              <div className="relative">
                <input
                  id="confirmDistressPin"
                  type={showConfirmDistressPin ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={4}
                  required
                  value={confirmDistressPin}
                  onChange={(e) => setConfirmDistressPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="••••"
                  className={`w-full rounded-lg border px-4 py-3 text-center text-2xl font-mono tracking-[1em] focus:ring-2 focus:outline-none ${
                    confirmDistressPin.length === 4 && confirmDistressPin !== distressPin
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-green-700 focus:ring-green-700"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmDistressPin((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showConfirmDistressPin ? "Hide PIN" : "Show PIN"}
                >
                  {showConfirmDistressPin ? (
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
              disabled={pinLoading || !canSubmit}
              className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pinLoading ? "Setting up PINs..." : "Set PINs & Finish Registration"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── PIN sent confirmation ─────────────────────────────────────────────────

  if (view === "pinSent") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Registration Complete!</h1>
          <p className="mt-2 text-sm text-gray-500">
            Both your <strong>Normal PIN</strong> and <strong>Distress PIN</strong> have been set. Keep them safe.
          </p>

          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-left">
            <p className="text-sm font-semibold text-amber-800">Important — Keep your PINs safe</p>
            <ul className="mt-2 space-y-1 text-sm text-amber-700 list-disc list-inside">
              <li>Use your <strong>Normal PIN</strong> to vote regularly</li>
              <li>Use your <strong>Distress PIN</strong> only if forced to vote against your will — it silently alerts IEBC without the attacker knowing</li>
              <li>Never share either PIN with anyone, including IEBC officials</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => router.push("/vote")}
            className="mt-6 w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800"
          >
            Proceed to Login
          </button>
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

  // ── Confirmed (after manual appointment) ─────────────────────────────────

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
              <span className="font-semibold text-gray-900">{bookedAppointment.durationMinutes} {t("appointment.minutes")}</span>
            </div>
          </div>

          <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            {t("appointment.bringId")} An IEBC officer will verify your identity and set up your voting PIN at your appointment.
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
