"use client";

import { useState, useRef, useEffect } from "react";
import { COUNTRY_CODES } from "@/lib/country-codes";

interface Props {
  value: string;
  onChange: (dial: string) => void;
  className?: string;
}

export function CountryCodeSelect({ value, onChange, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = COUNTRY_CODES.find((c) => c.dial === value) ?? COUNTRY_CODES[0];

  const filtered = search.trim()
    ? COUNTRY_CODES.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.dial.includes(search)
      )
    : COUNTRY_CODES;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  function handleSelect(dial: string) {
    onChange(dial);
    setOpen(false);
    setSearch("");
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 truncate">
          <span className="text-lg leading-none">{selected!.flag}</span>
          <span className="font-medium text-gray-800">{selected!.dial}</span>
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg">
          {/* Search */}
          <div className="border-b border-gray-100 p-2">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country or code…"
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600 focus:outline-none"
            />
          </div>

          {/* Options */}
          <ul
            role="listbox"
            className="max-h-56 overflow-y-auto py-1"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-400">No results</li>
            )}
            {filtered.map((c) => (
              <li
                key={`${c.dial}-${c.name}`}
                role="option"
                aria-selected={c.dial === value}
                onClick={() => handleSelect(c.dial)}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-green-50 ${
                  c.dial === value ? "bg-green-50 font-semibold text-green-800" : "text-gray-800"
                }`}
              >
                <span className="text-lg leading-none">{c.flag}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="shrink-0 text-gray-500">{c.dial}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
