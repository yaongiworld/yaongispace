"use client";

import { useCallback, useEffect, useRef } from "react";

const ROW = 44;

/**
 * A wheel you turn with a thumb (brief §9 — 숫자를 직접 치지 않아요).
 *
 * Native scrolling with snap points, so momentum and the feel of a flick are
 * the phone's own; the value is whichever row settles in the middle. Every
 * row is a legal value, so there is nothing to validate and no error to show.
 * Arrow keys and tapping a row work too, and it announces itself as a
 * spinbutton.
 */
export function Wheel<T extends number>({
  values,
  value,
  onChange,
  label,
  format = String,
  width = 72,
}: {
  values: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  format?: (v: T) => string;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = Math.max(0, values.indexOf(value));

  // Put the current value in the middle when the wheel mounts or the value
  // changes from outside (e.g. switching exercise).
  useEffect(() => {
    const el = ref.current;
    if (el && Math.round(el.scrollTop / ROW) !== index) el.scrollTop = index * ROW;
  }, [index]);

  const onScroll = useCallback(() => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ROW)));
      if (values[i] !== value) onChange(values[i]);
    }, 90);
  }, [values, value, onChange]);

  const go = (i: number) => {
    const clamped = Math.min(values.length - 1, Math.max(0, i));
    ref.current?.scrollTo({ top: clamped * ROW, behavior: "smooth" });
    onChange(values[clamped]);
  };

  return (
    <div className="relative" style={{ width }}>
      {/* The highlighted middle row. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0"
        style={{
          top: ROW,
          height: ROW,
          borderRadius: "var(--radius-clay-sm)",
          background: "var(--color-clay-blush)",
          boxShadow: "inset 0 0 0 1.5px var(--color-clay-rose)",
        }}
      />
      <div
        ref={ref}
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        aria-valuemin={values[0]}
        aria-valuemax={values[values.length - 1]}
        onScroll={onScroll}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            go(index - 1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            go(index + 1);
          }
        }}
        className="wheel relative overflow-y-scroll rounded-[16px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-clay-berry)]"
        style={{ height: ROW * 3, paddingBlock: ROW }}
      >
        {values.map((v, i) => (
          <div
            key={v}
            data-wheel-item
            onClick={() => go(i)}
            className="grid cursor-pointer place-items-center text-2xl tabular-nums"
            style={{
              height: ROW,
              fontFamily: "var(--font-display)",
              color: i === index ? "var(--color-clay-ink)" : "var(--color-clay-ink-soft)",
              opacity: Math.abs(i - index) > 1 ? 0.35 : 1,
            }}
          >
            {format(v)}
          </div>
        ))}
      </div>
    </div>
  );
}
