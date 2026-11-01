"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A sheet that rises from the bottom — the one pattern for every form and
 * every detail in the couple app, so there is only one way things open.
 *
 * Above the tab bar (z-60 over its z-50), at most 88% of the screen (96% on a
 * short phone, so a form's wheels clear its pinned button), its own
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
  const root = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panel.current) return;
      // Tab goes round the sheet, not out of it (the page behind is inert,
      // so leaving would only reach the browser's own chrome).
      const stops = [
        ...panel.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && at === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Everything behind the sheet goes inert: Tab cannot wander out to the
    // page or the tab bar, and a screen reader stays in the sheet.
    const behind = [...document.body.children].filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== root.current && !el.inert,
    );
    behind.forEach((el) => (el.inert = true));
    // Move focus in — unless a child already took it (an `autoFocus` input
    // must keep it, or the phone keyboard never comes up).
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      behind.forEach((el) => (el.inert = false));
      // Hand focus back only if nobody else has taken it: when one sheet
      // closes *into* another (오늘 기록하기 → 한 줄 메모), the next sheet's
      // input already has focus, and taking it back would drop the keyboard.
      const now = document.activeElement;
      if (!now || now === document.body) previous?.focus?.();
    };
  }, [open, onClose, mounted]);

  if (!open || !mounted) return null;

  return createPortal(
    <div ref={root} className="fixed inset-0 z-[60] flex items-end justify-center">
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
        className="sheet-panel relative flex max-h-[88dvh] w-full max-w-md flex-col outline-none [@media(max-height:700px)]:max-h-[96dvh]"
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
        {/* `overscroll-contain`: the sheet's own bounce, never the page's. */}
        <div className="overflow-y-auto overscroll-contain px-5 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
