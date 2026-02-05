"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api-client";
import { Header } from "@/components/header";
import type {
  ApiResponse,
  PaginatedResponse,
  PollingStation,
  RegisterResult,
  RegisterLiveResult,
} from "@/lib/types";

export default function RegisterPage() {
  const [nationalId, setNationalId] = useState("");
  const [pollingStationId, setPollingStationId] = useState("");
  const [stations, setStations] = useState<PollingStation[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [liveResult, setLiveResult] = useState<RegisterLiveResult | null>(null);
  const [error, setError] = useState("");

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLiveResult(null);
    setLoading(true);

    try {
      const res = await api.post<ApiResponse<RegisterResult | RegisterLiveResult>>(
        "/api/voters/register",
        { nationalId, pollingStationId }
      );

      if (!res.success || !res.data) {
        setError(res.error || "Registration failed");
        return;
      }

      // Mock mode returns pin/distressPin (201), live returns personaUrl (202)
      if ("pin" in res.data) {
        setResult(res.data as RegisterResult);
      } else {
        setLiveResult(res.data as RegisterLiveResult);
      }

      setNationalId("");
      setPollingStationId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header title="Register Voter" />
      <div className="p-6">
        <div className="mx-auto max-w-lg">
          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-gray-200 bg-white p-6"
          >
            {error && (
              <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label
                htmlFor="regNationalId"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
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
                onChange={(e) =>
                  setNationalId(e.target.value.replace(/\D/g, ""))
                }
                placeholder="12345678"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="mb-6">
              <label
                htmlFor="station"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
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
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name} ({s.county})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || nationalId.length !== 8 || !pollingStationId}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Registering..." : "Register Voter"}
            </button>
          </form>

          {result && (
            <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-6">
              <h3 className="mb-3 text-sm font-semibold text-green-900">
                Registration Successful
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-green-700">Voter ID</dt>
                  <dd className="font-mono text-green-900">{result.voterId}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-green-700">PIN</dt>
                  <dd className="font-mono text-lg font-bold text-green-900">
                    {result.pin}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-green-700">Distress PIN</dt>
                  <dd className="font-mono text-lg font-bold text-red-700">
                    {result.distressPin}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-green-700">Wallet</dt>
                  <dd className="font-mono text-green-900 break-all">
                    {result.walletAddress}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-green-700">SBT Token ID</dt>
                  <dd className="font-mono text-green-900">
                    {result.sbtTokenId}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-green-700">Tx Hash</dt>
                  <dd className="font-mono text-green-900 break-all">
                    {result.txHash}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-green-600">
                Save these PINs securely. They cannot be retrieved later.
              </p>
            </div>
          )}

          {liveResult && (
            <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-6">
              <h3 className="mb-3 text-sm font-semibold text-blue-900">
                Verification Required
              </h3>
              <p className="mb-3 text-sm text-blue-700">
                Complete identity verification via Persona:
              </p>
              <a
                href={liveResult.personaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Open Verification
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
