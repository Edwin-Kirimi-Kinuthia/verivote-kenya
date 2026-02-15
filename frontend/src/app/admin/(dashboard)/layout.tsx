"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token, voter, isLoading } = useAuth();
  const router = useRouter();

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
