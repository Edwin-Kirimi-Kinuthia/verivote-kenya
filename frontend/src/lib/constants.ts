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

import type { StaffRole } from "./types";

// ── Role tier helpers ─────────────────────────────────────────────────────────
const COMMISSION = ["CHAIRPERSON","COMMISSIONER","COMMISSION_SECRETARY","DEPUTY_COMMISSION_SECRETARY"] as StaffRole[];
const SECRETARIAT = ["DIRECTOR","MANAGER","NATIONAL_RO","ICT_ADMIN"] as StaffRole[];
const NATIONAL = [...COMMISSION, ...SECRETARIAT];
const FIELD = [...NATIONAL, "REGIONAL_COORDINATOR","COUNTY_RO","CONSTITUENCY_RO"] as StaffRole[];
const ALL_STAFF = [...FIELD, "PRESIDING_OFFICER","DEPUTY_PRESIDING_OFFICER","POLLING_CLERK","SECURITY_OFFICER","OBSERVER"] as StaffRole[];

/** All nav items with optional role restriction (undefined = any admin) */
export const ALL_NAV_ITEMS = [
  { href: "/admin",                  label: "Dashboard",         icon: "grid",            allowedRoles: undefined },
  { href: "/admin/staff-portal",     label: "My Portal",         icon: "users-cog",       allowedRoles: ALL_STAFF },
  { href: "/admin/register",         label: "Register Voter",    icon: "user-plus",       allowedRoles: [...NATIONAL, "PRESIDING_OFFICER"] as StaffRole[] },
  { href: "/admin/voters",           label: "Voters",            icon: "users",           allowedRoles: undefined },
  { href: "/admin/reviews",          label: "Reviews",           icon: "clipboard-check", allowedRoles: undefined },
  { href: "/admin/appointments",     label: "Appointments",      icon: "calendar",        allowedRoles: undefined },
  { href: "/admin/pin-resets",       label: "PIN Resets",        icon: "key",             allowedRoles: undefined },
  { href: "/admin/staff",            label: "IEBC Officials",    icon: "shield",          allowedRoles: COMMISSION },
  { href: "/admin/ai-security",      label: "AI Security",       icon: "cpu",             allowedRoles: [...NATIONAL] as StaffRole[] },
  { href: "/admin/elections",        label: "Elections",         icon: "ballot",          allowedRoles: COMMISSION },
  { href: "/admin/election-ceremony",label: "Election Ceremony", icon: "chart-bar",       allowedRoles: [...COMMISSION, "NATIONAL_RO","ICT_ADMIN"] as StaffRole[] },
  { href: "/admin/declarations",     label: "Declarations",      icon: "document-check",  allowedRoles: [...COMMISSION, "NATIONAL_RO","COUNTY_RO","CONSTITUENCY_RO"] as StaffRole[] },
  { href: "/admin/polling-stations", label: "Polling Stations",  icon: "map-pin",         allowedRoles: [...FIELD, "PRESIDING_OFFICER","DEPUTY_PRESIDING_OFFICER"] as StaffRole[] },
];

/** Returns the nav items visible to a given staff role (or all unrestricted items for plain admins) */
export function getNavItems(staffRole?: StaffRole | null) {
  return ALL_NAV_ITEMS.filter((item) => {
    if (!item.allowedRoles) return true;       // visible to all admins regardless of role
    if (!staffRole) return false;              // plain admin (no IebcStaff record) — hide role-gated items
    return item.allowedRoles.includes(staffRole);
  });
}

/** Legacy alias — sidebar uses getNavItems() but some pages still reference NAV_ITEMS */
export const NAV_ITEMS = ALL_NAV_ITEMS;
