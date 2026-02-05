interface StatCardProps {
  title: string;
  value: number | string;
  borderColor?: string;
}

export function StatCard({
  title,
  value,
  borderColor = "border-blue-500",
}: StatCardProps) {
  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-5 border-l-4 ${borderColor}`}
    >
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
