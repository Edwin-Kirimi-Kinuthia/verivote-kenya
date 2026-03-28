"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import type { ApiResponse } from "@/lib/types";

type ElectionType = "GOVERNMENT" | "INSTITUTIONAL" | "CORPORATE" | "CUSTOM";
type AuthMethod = "PERSONA_KYC" | "EMAIL_DOMAIN" | "OTP_ONLY";

interface NewElectionResponse {
  id: string;
  name: string;
  type: ElectionType;
  status: string;
}

const TYPE_OPTIONS: { value: ElectionType; label: string; description: string }[] = [
  {
    value: "GOVERNMENT",
    label: "Government Election",
    description: "National, county, constituency, and ward positions (President, Governor, Senator, MP, MCA, etc.)",
  },
  {
    value: "INSTITUTIONAL",
    label: "Institutional Election",
    description: "University, cooperative, or professional body elections",
  },
  {
    value: "CORPORATE",
    label: "Corporate Election",
    description: "Board of directors, shareholder votes, or company positions",
  },
  {
    value: "CUSTOM",
    label: "Custom Election",
    description: "Custom enrollment-based elections for any other organization",
  },
];

export default function NewElectionPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const defaultAuthMethod = (type: ElectionType): AuthMethod => {
    if (type === "GOVERNMENT") return "PERSONA_KYC";
    if (type === "INSTITUTIONAL" || type === "CORPORATE") return "EMAIL_DOMAIN";
    return "OTP_ONLY";
  };

  const [form, setForm] = useState({
    name: "",
    description: "",
    type: "GOVERNMENT" as ElectionType,
    orgName: "",
    startDate: "",
    endDate: "",
    authMethod: "PERSONA_KYC" as AuthMethod,
    allowedDomains: "",   // comma-separated input, split on submit
  });

  function update(field: keyof typeof form, value: string) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      // Auto-set auth method when type changes
      if (field === "type") next.authMethod = defaultAuthMethod(value as ElectionType);
      return next;
    });
    if (error) setError("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (form.startDate && form.endDate && form.startDate >= form.endDate) {
      setError("End date must be after start date.");
      return;
    }

    setSaving(true);
    try {
      const domains = form.allowedDomains
        .split(/[,\s]+/)
        .map(d => d.trim().replace(/^@/, "").toLowerCase())
        .filter(Boolean);

      const body: Record<string, unknown> = {
        name:       form.name.trim(),
        type:       form.type,
        authMethod: form.authMethod,
        ...(domains.length > 0 && { allowedDomains: domains }),
      };
      if (form.description.trim()) body.description = form.description.trim();
      if (form.orgName.trim()) body.orgName = form.orgName.trim();
      if (form.startDate) body.startDate = new Date(form.startDate).toISOString();
      if (form.endDate) body.endDate = new Date(form.endDate).toISOString();

      const res = await api.post<ApiResponse<NewElectionResponse>>("/api/elections", body);
      if (!res.success || !res.data) {
        setError(res.error ?? "Failed to create election");
        return;
      }
      router.push(`/admin/elections/${res.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create election");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => router.push("/admin/elections")}
          className="mb-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          All Elections
        </button>
        <h1 className="text-2xl font-bold text-gray-900">New Election</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create an election, then add positions and candidates on the next screen.
        </p>
      </div>

      {error && (
        <div className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Election Type */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Election Type
          </h2>
          <div className="space-y-3">
            {TYPE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 transition-colors ${
                  form.type === opt.value
                    ? "border-green-700 bg-green-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value={opt.value}
                  checked={form.type === opt.value}
                  onChange={(e) => update("type", e.target.value as ElectionType)}
                  className="mt-0.5 h-4 w-4 text-green-700 focus:ring-green-700"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                  <p className="text-xs text-gray-500">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Voter Authentication */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
          <div>
            <h2 className="mb-0.5 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Voter Authentication
            </h2>
            <p className="text-xs text-gray-400">How voters verify their identity to register and vote.</p>
          </div>

          {(
            [
              {
                value: "PERSONA_KYC" as AuthMethod,
                label: "Persona KYC",
                desc: "Full identity scan — government ID or passport photo verified by Persona. Required for national government elections.",
                badge: "Recommended for GOVERNMENT",
                color: "indigo",
              },
              {
                value: "EMAIL_DOMAIN" as AuthMethod,
                label: "Institutional Email",
                desc: "Voter must register with an email from an approved domain (e.g. @uon.ac.ke). Verified by OTP. Ideal for universities and corporates.",
                badge: "Recommended for INSTITUTIONAL / CORPORATE",
                color: "blue",
              },
              {
                value: "OTP_ONLY" as AuthMethod,
                label: "OTP Only",
                desc: "Any email or phone number, verified by a one-time code. No document required. Suitable for open or custom elections.",
                badge: "Recommended for CUSTOM",
                color: "gray",
              },
            ] satisfies { value: AuthMethod; label: string; desc: string; badge: string; color: string }[]
          ).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 transition-colors ${
                form.authMethod === opt.value ? "border-green-700 bg-green-50" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="authMethod"
                value={opt.value}
                checked={form.authMethod === opt.value}
                onChange={(e) => update("authMethod", e.target.value)}
                className="mt-0.5 h-4 w-4 text-green-700 focus:ring-green-700"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{opt.badge}</span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{opt.desc}</p>
              </div>
            </label>
          ))}

          {/* Allowed domains — only shown for EMAIL_DOMAIN */}
          {form.authMethod === "EMAIL_DOMAIN" && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <label className="mb-1 block text-xs font-semibold text-blue-900">
                Allowed Email Domains
              </label>
              <input
                type="text"
                value={form.allowedDomains}
                onChange={(e) => update("allowedDomains", e.target.value)}
                placeholder="e.g. uon.ac.ke, ku.ac.ke (comma-separated)"
                className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-blue-600">
                Leave blank to allow any email with OTP verification.
              </p>
            </div>
          )}
        </div>

        {/* Basic Details */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Details
          </h2>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">
              Election Name <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="e.g. Kenya General Election 2027"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700"
            />
          </div>

          {form.type !== "GOVERNMENT" && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">
                Organisation / Institution Name
              </label>
              <input
                value={form.orgName}
                onChange={(e) => update("orgName", e.target.value)}
                placeholder="e.g. University of Nairobi"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">
              Description
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Optional brief description of the election"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700"
            />
          </div>
        </div>

        {/* Dates */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Voting Window (optional)
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">Start Date &amp; Time</label>
              <input
                type="datetime-local"
                value={form.startDate}
                onChange={(e) => update("startDate", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">End Date &amp; Time</label>
              <input
                type="datetime-local"
                value={form.endDate}
                onChange={(e) => update("endDate", e.target.value)}
                min={form.startDate || undefined}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            You can leave these blank and set them later. The election starts as a <strong>DRAFT</strong> and
            must be advanced to <strong>ACTIVE</strong> before voters can cast ballots.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="rounded-lg bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create Election"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/elections")}
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
