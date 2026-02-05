"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";

export function Header({ title }: { title: string }) {
  const { voter, logout } = useAuth();
  const router = useRouter();

  function handleLogout() {
    logout();
    router.push("/admin/login");
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-4">
        {voter && (
          <span className="text-sm text-gray-500">
            ID: {voter.nationalId}
          </span>
        )}
        <button
          onClick={handleLogout}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
