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

  const widths = {
    sm: "max-w-[480px]",
    md: "max-w-[640px]",
    lg: "max-w-[860px]",
    xl: "max-w-[1080px]",
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${widths[size]} my-8 bg-bg-elev border border-border rounded-xl shadow-modal flex flex-col max-h-[calc(100vh-4rem)]`}
      >
        <div className="flex items-start justify-between p-6 border-b border-border">
          <div>
            <h2 className="display text-[26px] leading-tight">{title}</h2>
            {subtitle ? (
              <p className="text-text-muted text-[13px] mt-1">{subtitle}</p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-md text-text-muted hover:text-text hover:bg-bg-elev-2 flex items-center justify-center"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
        {footer ? (
          <div className="p-6 border-t border-border flex items-center justify-end gap-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
