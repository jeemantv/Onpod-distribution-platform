"use client";

// Tiny controlled search input used as a building block for the
// per-page filterable lists. Same icon + styling as the /account
// session search so the app feels consistent.

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchBar({ value, onChange, placeholder, autoFocus }: Props) {
  return (
    <div className="relative">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Search…"}
        autoFocus={autoFocus}
        className="w-full pl-10 pr-3 py-2.5 bg-bg-elev border border-border rounded-[10px] text-[13px] placeholder:text-text-dim focus:outline-none focus:border-border-strong"
      />
    </div>
  );
}
