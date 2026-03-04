"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import type { ApiResponse, AuthData } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [nationalId, setNationalId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post<ApiResponse<AuthData>>("/api/auth/login", {
        identifier: nationalId,
        password,
      });

      if (!res.success || !res.data) {
        setError(res.error || "Invalid National ID or password. Please try again.");
        return;
      }

      if (res.data.voter.role !== "ADMIN") {
        setError("Access denied. This portal is for IEBC officials only.");
        return;
      }

      login(res.data.token, res.data.voter);
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const hasError = error.length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">VeriVote Admin</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in with your admin credentials</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-4"
        >
          {/* Error alert — key resets animation on every new error */}
          {hasError && (
            <div
              key={error}
              role="alert"
              className="animate-shake flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              <p className="text-sm font-medium text-red-700">{error}</p>
            </div>
          )}

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
              onChange={(e) => {
                setNationalId(e.target.value.replace(/\D/g, ""));
                if (error) setError("");
              }}
              placeholder="12345678"
              className={`w-full rounded-md border px-3 py-2 text-sm transition-colors focus:ring-1 focus:outline-none ${
                hasError
                  ? "border-red-400 focus:border-red-500 focus:ring-red-300"
                  : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              }`}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError("");
              }}
              placeholder="••••••••"
              className={`w-full rounded-md border px-3 py-2 text-sm transition-colors focus:ring-1 focus:outline-none ${
                hasError
                  ? "border-red-400 focus:border-red-500 focus:ring-red-300"
                  : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              }`}
            />
          </div>

          <button
            type="submit"
            disabled={loading || nationalId.length !== 8 || !password}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
