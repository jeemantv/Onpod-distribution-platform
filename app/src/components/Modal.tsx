"use client";

import { useEffect } from "react";

export function Modal({
  title,
  subtitle,
  onClose,
  size = "md",
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // On mobile: full-screen. On sm+: centered with width caps.
  const widths = {
    sm: "sm:max-w-[480px]",
    md: "sm:max-w-[640px]",
    lg: "sm:max-w-[860px]",
    xl: "sm:max-w-[1080px]",
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex sm:items-center sm:justify-center sm:p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${widths[size]} sm:my-8 bg-bg-elev border border-border sm:rounded-xl shadow-modal flex flex-col h-[100dvh] sm:h-auto sm:max-h-[calc(100vh-4rem)]`}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-start justify-between p-4 sm:p-6 border-b border-border shrink-0">
          <div className="min-w-0 flex-1 pr-2">
            <h2 className="display text-[22px] sm:text-[26px] leading-tight truncate">
              {title}
            </h2>
            {subtitle ? (
              <p className="text-text-muted text-[12px] sm:text-[13px] mt-1 truncate">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-md text-text-muted hover:text-text hover:bg-bg-elev-2 flex items-center justify-center shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0">{children}</div>
        {footer ? (
          <div
            className="p-4 sm:p-6 border-t border-border flex items-center justify-end gap-2 sm:gap-3 flex-wrap shrink-0"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
