"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Redirected to /admin/staff — staff management is now consolidated there.
 */
export default function OfficialsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/staff"); }, [router]);
  return null;
}
