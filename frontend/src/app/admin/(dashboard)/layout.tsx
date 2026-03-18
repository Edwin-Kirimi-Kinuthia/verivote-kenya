"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Sidebar } from "@/components/sidebar";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const IDLE_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token, voter, isLoading, logout } = useAuth();
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      logout();
      router.replace("/admin/login?reason=idle");
    }, IDLE_TIMEOUT_MS);
  }, [logout, router]);

  // Start idle timer when logged in
  useEffect(() => {
    if (!token) return;
    resetTimer();
    IDLE_EVENTS.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      IDLE_EVENTS.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [token, resetTimer]);

  useEffect(() => {
    if (!isLoading && (!token || voter?.role !== "ADMIN")) {
      router.replace("/admin/login");
    }
  }, [token, voter, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!token || voter?.role !== "ADMIN") return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-56 flex-1">{children}</main>
    </div>
  );
}
