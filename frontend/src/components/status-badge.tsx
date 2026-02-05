import { STATUS_CONFIG } from "@/lib/constants";
import type { VoterStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: VoterStatus }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    color: "text-gray-800",
    bg: "bg-gray-100",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.color}`}
    >
      {config.label}
    </span>
  );
}
