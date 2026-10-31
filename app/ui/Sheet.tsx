"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A sheet that rises from the bottom — the one pattern for every form and
 * every detail in the couple app, so there is only one way things open.
 *
 * Above the tab bar (z-60 over its z-50), at most 88% of the screen, its own
 * scroll, and the home-indicator inset kept clear. Portalled to <body>: a page
 * that animates in (`.page-in`) is a stacking context, and a sheet rendered
 * inside it would sit *under* the tab bar whatever its z-index. Escape, the backdrop and
 * the ✕ all close it; focus moves in on open and back out on close.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus in — unless a child already took it (an `autoFocus` input
    // must keep it, or the phone keyboard never comes up).
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose, mounted]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div
        className="sheet-backdrop absolute inset-0"
        style={{ background: "rgb(74 59 51 / 0.28)" }}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="sheet-panel relative flex max-h-[88dvh] w-full max-w-md flex-col outline-none"
        style={{
          background: "#fffaf6",
          borderRadius: "var(--radius-clay-lg) var(--radius-clay-lg) 0 0",
          boxShadow: "0 -12px 40px rgb(190 140 120 / 0.25)",
        }}
      >
        <div className="flex items-center justify-between gap-2 px-5 pt-3 pb-1">
          <span aria-hidden className="w-11" />
          <div className="flex flex-col items-center gap-2">
            <span aria-hidden className="h-1.5 w-10 rounded-full" style={{ background: "var(--color-clay-apricot)" }} />
            <h2 id={titleId} className="text-lg text-clay-ink" style={{ fontFamily: "var(--font-display)" }}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="press grid h-11 w-11 place-items-center rounded-full text-lg text-clay-ink-soft"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
