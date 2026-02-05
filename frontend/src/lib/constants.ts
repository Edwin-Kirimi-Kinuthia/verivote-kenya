import type { VoterStatus } from "./types";

export const STATUS_CONFIG: Record<
  VoterStatus,
  { label: string; color: string; bg: string }
> = {
  PENDING_VERIFICATION: {
    label: "Pending Verification",
    color: "text-yellow-800",
    bg: "bg-yellow-100",
  },
  PENDING_MANUAL_REVIEW: {
    label: "Manual Review",
    color: "text-orange-800",
    bg: "bg-orange-100",
  },
  REGISTERED: {
    label: "Registered",
    color: "text-green-800",
    bg: "bg-green-100",
  },
  VERIFICATION_FAILED: {
    label: "Failed",
    color: "text-red-800",
    bg: "bg-red-100",
  },
  VOTED: {
    label: "Voted",
    color: "text-blue-800",
    bg: "bg-blue-100",
  },
  REVOTED: {
    label: "Revoted",
    color: "text-indigo-800",
    bg: "bg-indigo-100",
  },
  DISTRESS_FLAGGED: {
    label: "Distress",
    color: "text-red-800",
    bg: "bg-red-200",
  },
  SUSPENDED: {
    label: "Suspended",
    color: "text-gray-800",
    bg: "bg-gray-200",
  },
};

export const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: "grid" },
  { href: "/admin/register", label: "Register Voter", icon: "user-plus" },
  { href: "/admin/voters", label: "Voters", icon: "users" },
  { href: "/admin/reviews", label: "Reviews", icon: "clipboard-check" },
  { href: "/admin/appointments", label: "Appointments", icon: "calendar" },
  { href: "/admin/pin-resets", label: "PIN Resets", icon: "key" },
] as const;
