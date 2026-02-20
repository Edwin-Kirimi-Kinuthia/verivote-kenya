"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { useTranslation } from "@/contexts/language-context";
import type {
  Appointment,
  AppointmentPurpose,
  BookedAppointmentResult,
  ApiResponse,
  PaginatedResponse,
} from "@/lib/types";

interface Props {
  nationalId: string;
  pollingStationId: string;
  purpose: AppointmentPurpose;
  onBooked: (result: BookedAppointmentResult) => void;
  onCancel: () => void;
}

// Returns YYYY-MM-DD in local time
function toLocalDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateTab(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`); // noon to avoid DST edge
  return d.toLocaleDateString("en-KE", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function AppointmentSlotPicker({ nationalId, pollingStationId, purpose, onBooked, onCancel }: Props) {
  const { t } = useTranslation();

  const [slots, setSlots] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .get<{ success: boolean } & PaginatedResponse<Appointment>>(
        `/api/appointments/available?pollingStationId=${pollingStationId}&limit=50`
      )
      .then((res) => {
        if (res.data) {
          setSlots(res.data);
          // Pre-select the first available date
          if (res.data.length > 0) {
            setSelectedDate(toLocalDateKey(res.data[0].scheduledAt));
          }
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t("common.error"));
      })
      .finally(() => setLoading(false));
  }, [pollingStationId, t]);

  // Build next-7-days tab array
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next7Days: string[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  // Group slots by date key
  const slotsByDate = slots.reduce<Record<string, Appointment[]>>((acc, slot) => {
    const key = toLocalDateKey(slot.scheduledAt);
    if (!acc[key]) acc[key] = [];
    acc[key].push(slot);
    return acc;
  }, {});

  const slotsForSelectedDate = selectedDate ? (slotsByDate[selectedDate] ?? []) : [];

  async function handleBook() {
    if (!selectedSlotId) return;
    setBooking(true);
    setError("");
    try {
      const res = await api.post<ApiResponse<BookedAppointmentResult>>(
        `/api/appointments/${selectedSlotId}/book`,
        { nationalId, purpose }
      );
      if (res.success && res.data) {
        onBooked(res.data);
      } else {
        setError(res.error || t("common.error"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBooking(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500">
        {t("common.loading")}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">{t("appointment.noSlots")}</p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 text-sm font-medium text-green-700 hover:underline"
        >
          {t("appointment.cancel")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Date tab row */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t("appointment.selectDate")}
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {next7Days.map((dateKey) => {
            const count = slotsByDate[dateKey]?.length ?? 0;
            const isSelected = selectedDate === dateKey;
            const disabled = count === 0;
            return (
              <button
                key={dateKey}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setSelectedDate(dateKey);
                  setSelectedSlotId(null);
                }}
                className={`flex shrink-0 flex-col items-center rounded-lg border-2 px-3 py-2 text-xs font-semibold transition-colors ${
                  isSelected
                    ? "border-green-700 bg-green-50 text-green-700"
                    : disabled
                    ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300"
                    : "border-gray-200 bg-white text-gray-700 hover:border-green-500"
                }`}
              >
                <span>{formatDateTab(dateKey)}</span>
                {!disabled && (
                  <span
                    className={`mt-0.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                      isSelected ? "bg-green-700 text-white" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {count} {t("appointment.slotsAvailable")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time slots */}
      {selectedDate && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("appointment.selectTime")}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {slotsForSelectedDate.map((slot) => {
              const isSelected = selectedSlotId === slot.id;
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setSelectedSlotId(isSelected ? null : slot.id)}
                  className={`rounded-lg border-2 p-3 text-left text-sm transition-colors ${
                    isSelected
                      ? "border-green-700 bg-green-50"
                      : "border-gray-200 bg-white hover:border-green-400"
                  }`}
                >
                  <p className={`font-semibold ${isSelected ? "text-green-700" : "text-gray-900"}`}>
                    {formatTime(slot.scheduledAt)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {slot.durationMinutes} {t("appointment.minutes")}
                  </p>
                  {slot.assignedOfficerName && (
                    <p className="mt-0.5 text-xs text-gray-400">{slot.assignedOfficerName}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirm button */}
      {selectedSlotId && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="mb-3 text-sm font-medium text-green-800">
            {formatTime(slots.find((s) => s.id === selectedSlotId)!.scheduledAt)}{" "}
            on {formatDateTab(selectedDate!)}
          </p>
          <button
            type="button"
            onClick={handleBook}
            disabled={booking}
            className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:opacity-50"
          >
            {booking ? t("appointment.booking") : t("appointment.confirmBook")}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="w-full rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        {t("appointment.cancel")}
      </button>
    </div>
  );
}
