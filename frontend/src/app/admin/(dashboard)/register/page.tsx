"use client";

import { useEffect, useState, useRef, type FormEvent } from "react";
import { api } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import { Header } from "@/components/header";
import { CountryCodeSelect } from "@/components/country-code-select";
import { startRegistration } from "@simplewebauthn/browser";
import type {
  ApiResponse,
  PaginatedResponse,
  PollingStation,
  NearbyStation,
  AdminRegisterResult,
  ApproveResult,
  SetupLinkResult,
  KycStartResult,
} from "@/lib/types";

type View = "form" | "kyc" | "fingerprint" | "approve" | "done";

export default function RegisterPage() {
  const { voter: adminVoter } = useAuth();
  const [view, setView] = useState<View>("form");

  // Station search state
  const [stationQuery, setStationQuery] = useState("");
  const [stationResults, setStationResults] = useState<PollingStation[]>([]);
  const [selectedStation, setSelectedStation] = useState<PollingStation | null>(null);
  const [stationDropdownOpen, setStationDropdownOpen] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [geoError, setGeoError] = useState("");
  const comboboxRef = useRef<HTMLDivElement>(null);

  // Diaspora
  const [isDiaspora, setIsDiaspora] = useState(false);

  // Registration form
  const [idDocumentType, setIdDocumentType] = useState<"NATIONAL_ID" | "PASSPORT">("NATIONAL_ID");
  const [nationalId, setNationalId] = useState("");
  const [preferredContact, setPreferredContact] = useState<"SMS" | "EMAIL">("EMAIL");
  const [countryCode, setCountryCode] = useState("+254");
  const [localPhone, setLocalPhone] = useState("");
  const [email, setEmail] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState("");

  // Post-registration state (persisted across steps)
  const [registeredVoterId, setRegisteredVoterId] = useState("");
  const [registeredNationalId, setRegisteredNationalId] = useState("");
  const [inquiryId, setInquiryId] = useState("");
  const [personaUrl, setPersonaUrl] = useState("");
  const [registeredContact, setRegisteredContact] = useState("");

  // KYC polling
  const [kycPolling, setKycPolling] = useState(false);
  const [kycError, setKycError] = useState("");
  const kycPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fingerprint
  const [fpLoading, setFpLoading] = useState(false);
  const [fpDone, setFpDone] = useState(false);
  const [fpError, setFpError] = useState("");

  // Approve + send link
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveError, setApproveError] = useState("");

  // Clean up polling on unmount
  useEffect(() => {
    return () => { if (kycPollRef.current) clearInterval(kycPollRef.current); };
  }, []);

  // ── Close dropdown on outside click ──────────────────────────────────────

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setStationDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // ── Load all active stations once, filter client-side ────────────────────

  const [allStations, setAllStations] = useState<PollingStation[]>([]);

  useEffect(() => {
    const diasporaParam = isDiaspora ? "isDiaspora=true" : "";
    api
      .get<{ success: boolean } & PaginatedResponse<PollingStation>>(
        `/api/polling-stations?${diasporaParam ? diasporaParam + "&" : ""}limit=500`
      )
      .then((res) => { if (res.data) setAllStations(res.data); })
      .catch(() => {});
  }, [isDiaspora]);

  useEffect(() => {
    const q = stationQuery.trim().toLowerCase();
    if (!q) { setStationResults(allStations.slice(0, 50)); return; }
    setStationResults(
      allStations
        .filter((s) =>
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          s.county.toLowerCase().includes(q) ||
          s.constituency.toLowerCase().includes(q)
        )
        .slice(0, 50)
    );
  }, [stationQuery, allStations]);

  // ── Geolocation nearest ───────────────────────────────────────────────────

  function handleNearestStation() {
    setGeoError("");
    if (!navigator.geolocation) { setGeoError("Geolocation is not supported by this browser."); return; }
    setNearbyLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        api
          .get<ApiResponse<NearbyStation[]>>(
            `/api/polling-stations/nearby?lat=${latitude}&lng=${longitude}&limit=5`
          )
          .then((res) => {
            if (res.success && res.data && res.data.length > 0) {
              const nearbyIds = new Set(res.data.map((s) => s.id));
              const enriched = allStations.filter((s) => nearbyIds.has(s.id));
              setStationResults(enriched.length > 0 ? enriched : (res.data as unknown as PollingStation[]));
              setStationDropdownOpen(true);
              setStationQuery("");
            } else {
              setGeoError("No nearby stations found.");
            }
          })
          .catch(() => setGeoError("Failed to fetch nearby stations."))
          .finally(() => setNearbyLoading(false));
      },
      () => { setGeoError("Location access denied. Please search manually."); setNearbyLoading(false); }
    );
  }

  function selectStation(station: PollingStation) {
    setSelectedStation(station);
    setStationQuery(`${station.code} — ${station.name} (${station.county})`);
    setStationDropdownOpen(false);
  }

  // ── Step 1: Register voter (creates PENDING_MANUAL_REVIEW record) ──────────

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setRegError("");
    if (!selectedStation) { setRegError("Please select a polling station."); return; }

    const digits = localPhone.replace(/\D/g, "");
    const phoneNumber = countryCode + digits;
    if (preferredContact === "SMS") {
      const isKenya = countryCode === "+254";
      const validLength = isKenya ? (digits.length >= 9 && digits.length <= 10) : (digits.length >= 7 && digits.length <= 12);
      if (!validLength || !/^\+\d+$/.test(phoneNumber)) {
        setRegError(isKenya
          ? "Enter a valid Kenyan number — 9 or 10 digits after +254 (e.g. 712345678)."
          : "Enter a valid phone number (7–12 digits after the country code)."
        );
        return;
      }
    }
    if (preferredContact === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setRegError("Enter a valid email address.");
      return;
    }

    setRegLoading(true);
    try {
      const res = await api.post<ApiResponse<AdminRegisterResult>>("/api/admin/register-voter", {
        nationalId,
        idDocumentType,
        pollingStationId: selectedStation.id,
        preferredContact,
        phoneNumber: preferredContact === "SMS" ? phoneNumber : undefined,
        email: preferredContact === "EMAIL" ? email : undefined,
      });

      if (!res.success || !res.data) { setRegError(res.error || "Registration failed"); return; }

      setRegisteredVoterId(res.data.voterId);
      setRegisteredNationalId(res.data.nationalId);

      // Immediately start KYC for the newly created voter
      const kycRes = await api.post<ApiResponse<KycStartResult>>(
        `/api/admin/start-kyc/${res.data.voterId}`
      );
      if (!kycRes.success || !kycRes.data) {
        setRegError(kycRes.error || "Voter registered but failed to start KYC. Refresh and try again.");
        return;
      }

      setInquiryId(kycRes.data.inquiryId);
      setPersonaUrl(kycRes.data.personaUrl);
      setKycPolling(false);
      setKycError("");
      setView("kyc");
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegLoading(false);
    }
  }

  // ── Step 2: KYC polling ───────────────────────────────────────────────────

  function startKycPolling() {
    if (kycPollRef.current) clearInterval(kycPollRef.current);
    setKycPolling(true);
    setKycError("");

    kycPollRef.current = setInterval(async () => {
      try {
        const res = await api.get<ApiResponse<{ status: string; completed: boolean }>>(
          `/api/admin/kyc-status?inquiryId=${inquiryId}`
        );
        if (res.data?.completed) {
          clearInterval(kycPollRef.current!);
          kycPollRef.current = null;
          setKycPolling(false);
          setFpDone(false);
          setFpError("");
          setView("fingerprint");
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 3000);
  }

  // ── Step 3: Fingerprint via voter's own phone (cross-platform / QR) ───────

  async function handleEnrollFingerprint() {
    setFpError("");
    setFpLoading(true);
    try {
      const optRes = await api.post<ApiResponse<Record<string, unknown>>>(
        "/api/webauthn/register/options",
        { voterId: registeredVoterId, adminAssisted: true }
      );
      if (!optRes.success || !optRes.data) throw new Error("Failed to get fingerprint options");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attResp = await startRegistration({ optionsJSON: optRes.data as any });

      const verRes = await api.post<ApiResponse<{ verified: boolean }>>(
        "/api/webauthn/register/verify",
        { voterId: registeredVoterId, response: attResp }
      );
      if (!verRes.success || !verRes.data?.verified) throw new Error("Fingerprint verification failed");

      setFpDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Enrollment failed";
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("notallowed")) {
        setFpError("Cancelled — ask the voter to scan the QR code with their phone and try again.");
      } else {
        setFpError(msg);
      }
    } finally {
      setFpLoading(false);
    }
  }

  // ── Step 4: Approve (mint SBT) + send PIN setup link ─────────────────────

  async function handleApproveAndSend() {
    setApproveError("");
    setApproveLoading(true);
    try {
      const approveRes = await api.post<ApiResponse<ApproveResult>>(
        `/api/admin/approve/${registeredVoterId}`,
        { reviewerId: adminVoter?.id }
      );
      if (!approveRes.success) { setApproveError(approveRes.error || "Approval failed"); return; }

      const linkRes = await api.post<ApiResponse<SetupLinkResult>>(
        "/api/admin/send-setup-link",
        { voterId: registeredVoterId }
      );
      if (!linkRes.success || !linkRes.data) {
        setApproveError(linkRes.error || "Voter approved but failed to send setup link");
        return;
      }

      setRegisteredContact(linkRes.data.contact);
      if (kycPollRef.current) { clearInterval(kycPollRef.current); kycPollRef.current = null; }
      setView("done");
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Failed to complete approval");
    } finally {
      setApproveLoading(false);
    }
  }

  function handleRegisterAnother() {
    setView("form");
    setIdDocumentType("NATIONAL_ID");
    setNationalId("");
    setSelectedStation(null);
    setStationQuery("");
    setStationResults([]);
    setIsDiaspora(false);
    setGeoError("");
    setLocalPhone("");
    setEmail("");
    setRegisteredVoterId("");
    setRegisteredNationalId("");
    setInquiryId("");
    setPersonaUrl("");
    setRegisteredContact("");
    setKycPolling(false);
    setKycError("");
    setFpDone(false);
    setFpError("");
    setApproveError("");
    setRegError("");
    if (kycPollRef.current) { clearInterval(kycPollRef.current); kycPollRef.current = null; }
  }

  // ── STEP INDICATOR helper ─────────────────────────────────────────────────

  const steps = [
    { key: "form", label: "Register" },
    { key: "kyc", label: "KYC" },
    { key: "fingerprint", label: "Fingerprint" },
    { key: "done", label: "Approve & Send" },
  ] as const;

  // ── FORM VIEW ─────────────────────────────────────────────────────────────

  if (view === "form") {
    return (
      <>
        <Header title="Register Voter" />
        <div className="p-6">
          <div className="mx-auto max-w-lg">
            {/* Step pills */}
            <div className="mb-5 flex items-center gap-2">
              {steps.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ${i === 0 ? "bg-blue-600" : "bg-gray-200 text-gray-400"}`}>{i + 1}</span>
                  <span className={`text-xs font-medium ${i === 0 ? "text-blue-700" : "text-gray-400"}`}>{s.label}</span>
                  {i < steps.length - 1 && <span className="w-4 border-t border-gray-200" />}
                </div>
              ))}
            </div>

            <form onSubmit={handleRegister} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
              {regError && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{regError}</div>
              )}

              {/* Document type */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Identity Document Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["NATIONAL_ID", "PASSPORT"] as const).map((type) => (
                    <label
                      key={type}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                        idDocumentType === type
                          ? "border-blue-500 bg-blue-50 text-blue-800 font-medium"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="idDocumentType"
                        value={type}
                        checked={idDocumentType === type}
                        onChange={() => { setIdDocumentType(type); setNationalId(""); }}
                        className="accent-blue-600"
                      />
                      {type === "NATIONAL_ID" ? "National ID" : "Passport"}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="regNationalId" className="mb-1 block text-sm font-medium text-gray-700">
                  {idDocumentType === "NATIONAL_ID" ? "National ID Number" : "Passport Number"}
                </label>
                <input
                  id="regNationalId"
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
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
                <p className="mt-0.5 text-xs text-gray-400">
                  {idDocumentType === "NATIONAL_ID" ? "5–9 digits" : "6–12 alphanumeric characters"}
                </p>
              </div>

              {/* Diaspora toggle */}
              <div className="flex items-center gap-3">
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={isDiaspora}
                    onChange={(e) => {
                      setIsDiaspora(e.target.checked);
                      setSelectedStation(null);
                      setStationQuery("");
                      setStationResults([]);
                      setStationDropdownOpen(false);
                    }}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                </label>
                <span className="text-sm text-gray-700">Diaspora voter (embassy/high-commission station)</span>
              </div>

              {/* Polling station combobox */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    {isDiaspora ? "Embassy / High Commission" : "Polling Station"}
                  </label>
                  {!isDiaspora && (
                    <button
                      type="button"
                      onClick={handleNearestStation}
                      disabled={nearbyLoading}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      {nearbyLoading ? (
                        <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                      {nearbyLoading ? "Locating…" : "📍 Nearest"}
                    </button>
                  )}
                </div>

                {geoError && <p className="mb-1 text-xs text-red-600">{geoError}</p>}

                <div className="relative" ref={comboboxRef}>
                  <input
                    type="text"
                    value={stationQuery}
                    onChange={(e) => { setStationQuery(e.target.value); setSelectedStation(null); setStationDropdownOpen(true); }}
                    onFocus={() => setStationDropdownOpen(true)}
                    placeholder={isDiaspora ? "Search embassy or country…" : "Search by name, code, or county…"}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    autoComplete="off"
                  />
                  {stationDropdownOpen && stationResults.length > 0 && (
                    <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg text-sm">
                      {stationResults.map((s) => (
                        <li key={s.id} onMouseDown={() => selectStation(s)} className="cursor-pointer px-3 py-2 hover:bg-blue-50">
                          <div className="font-medium text-gray-900">{s.isDiaspora ? `🌍 ${s.name}` : s.name}</div>
                          <div className="text-xs text-gray-500">
                            {s.isDiaspora ? s.country : `${s.code} · ${s.constituency}, ${s.county}`}
                            {"distanceKm" in s && ` · ${(s as NearbyStation).distanceKm.toFixed(1)} km`}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {stationDropdownOpen && stationResults.length === 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 shadow-lg">
                      {stationQuery.trim() ? `No stations found for "${stationQuery}"` : "No stations loaded yet"}
                    </div>
                  )}
                </div>

                {selectedStation && (
                  <p className="mt-1 text-xs text-green-700">
                    ✓ {selectedStation.isDiaspora
                      ? `${selectedStation.country} — ${selectedStation.name}`
                      : `${selectedStation.county} / ${selectedStation.constituency} / ${selectedStation.ward}`}
                    {selectedStation.isDiaspora && (
                      <span className="ml-2 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">Diaspora</span>
                    )}
                  </p>
                )}
              </div>

              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">Voter&apos;s Contact Method</p>
                <p className="mb-2 text-xs text-gray-500">
                  A PIN setup link will be sent here after KYC and fingerprint enrollment are complete.
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
                  <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">Voter&apos;s Email Address</label>
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
                  <label className="mb-1 block text-sm font-medium text-gray-700">Voter&apos;s Phone Number</label>
                  <div className="flex gap-2">
                    <CountryCodeSelect value={countryCode} onChange={setCountryCode} className="w-36" />
                    <input
                      type="tel"
                      inputMode="numeric"
                      required
                      value={localPhone}
                      onChange={(e) => setLocalPhone(e.target.value.replace(/\D/g, "").slice(0, countryCode === "+254" ? 10 : 12))}
                      placeholder={countryCode === "+254" ? "712345678" : "XXXXXXXXX"}
                      maxLength={countryCode === "+254" ? 10 : 12}
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{countryCode === "+254" ? "9–10 digits (e.g. 712345678)" : "Digits only, no leading 0"}</p>
                </div>
              )}

              <div className="rounded-md bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
                After registering, you will complete KYC via Persona, enroll the voter&apos;s fingerprint via their phone, then approve and send the PIN setup link.
              </div>

              <button
                type="submit"
                disabled={regLoading || !selectedStation || !(
                  idDocumentType === "NATIONAL_ID" ? /^\d{5,9}$/.test(nationalId) : /^[A-Z0-9]{6,12}$/i.test(nationalId)
                )}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {regLoading ? "Registering & Starting KYC…" : "Register Voter & Start KYC →"}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  // ── KYC VIEW ─────────────────────────────────────────────────────────────

  if (view === "kyc") {
    return (
      <>
        <Header title="Step 2 — Identity Verification (KYC)" />
        <div className="p-6">
          <div className="mx-auto max-w-lg space-y-4">
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              <strong>IEBC Officer:</strong> Hand the device to voter{" "}
              <strong>{registeredNationalId}</strong>. They will complete identity verification on
              this screen. The system will automatically detect when it is done.
            </div>

            {kycError && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{kycError}</div>}

            <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
              {personaUrl && (
                <a
                  href={personaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={startKycPolling}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-purple-600 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-700"
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
                  Open the KYC link above — the system will automatically advance when complete.
                </p>
              )}
            </div>

            <p className="text-center text-xs text-gray-400">
              Voter registered as <span className="font-medium">{registeredNationalId}</span>. KYC must complete before the registration is approved.
            </p>
          </div>
        </div>
      </>
    );
  }

  // ── FINGERPRINT VIEW ──────────────────────────────────────────────────────

  if (view === "fingerprint") {
    return (
      <>
        <Header title="Step 3 — Fingerprint Enrollment" />
        <div className="p-6">
          <div className="mx-auto max-w-lg space-y-4">
            <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              KYC verified — proceed to fingerprint enrollment
            </div>

            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
              <strong>IEBC Officer:</strong> Click the button below. A QR code will appear — ask voter{" "}
              <strong>{registeredNationalId}</strong> to scan it with their own phone to enroll their
              fingerprint. <em>Only the voter&apos;s biometric is registered — the officer&apos;s
              device cannot be used to impersonate them.</em>
            </div>

            {fpError && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{fpError}</div>}

            <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
              {fpDone ? (
                <div className="flex items-center gap-2 text-green-700">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-semibold">Fingerprint enrolled on voter&apos;s phone</span>
                </div>
              ) : (
                <>
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
                    ) : "Enroll Fingerprint via Voter's Phone (QR Code)"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFpDone(true)}
                    disabled={fpLoading}
                    className="w-full text-center text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                  >
                    Skip — voter will enroll fingerprint on their own device later
                  </button>
                </>
              )}
            </div>

            {fpDone && (
              <button
                type="button"
                onClick={() => setView("approve")}
                className="w-full rounded-md bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
              >
                Continue to Approve →
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  // ── APPROVE VIEW ──────────────────────────────────────────────────────────

  if (view === "approve") {
    return (
      <>
        <Header title="Step 4 — Approve Registration" />
        <div className="p-6">
          <div className="mx-auto max-w-lg space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">✓</span>
                  <span>Voter <span className="font-medium">{registeredNationalId}</span> registered in IEBC system</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">✓</span>
                  <span>KYC identity verified via Persona</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">✓</span>
                  <span>Fingerprint credential enrolled on voter&apos;s phone (or skipped)</span>
                </li>
              </ul>

              <p className="text-xs text-gray-500">
                Clicking <strong>Approve</strong> will mint the voter&apos;s SBT on-chain and send
                them a secure link to set up their PINs on their own device.
              </p>

              {approveError && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{approveError}</div>}

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
          </div>
        </div>
      </>
    );
  }

  // ── DONE VIEW ─────────────────────────────────────────────────────────────

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
              <h3 className="text-base font-semibold text-green-900">Voter Registered &amp; Approved</h3>
            </div>

            <ul className="space-y-2 text-sm text-green-800">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-green-600">✓</span>
                <span>Identity verified via Persona KYC</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-green-600">✓</span>
                <span>Fingerprint enrolled on voter&apos;s own phone (or skipped)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-green-600">✓</span>
                <span>Registration approved — SBT minted on-chain</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-green-600">✓</span>
                <span>
                  PIN setup link sent to{" "}
                  <span className="font-medium">{registeredContact}</span>
                </span>
              </li>
            </ul>

            <p className="mt-4 text-xs text-green-600">
              The voter will open the link on their own device to set both their normal PIN and distress PIN privately.
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
