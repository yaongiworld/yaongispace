"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 하트 팡 — a burst of hearts and a short line after a save (brief §5).
 * Decorative only: the line is also announced politely for screen readers,
 * and under reduced motion only the line shows.
 */
export function Celebrate({ message, onDone }: { message: string | null; onDone: () => void }) {
  const [hearts, setHearts] = useState<{ id: number; dx: number; left: number; emoji: string; delay: number }[]>([]);

  useEffect(() => {
    if (!message) return;
    const emojis = ["💗", "💕", "✨", "💖", "🩵"];
    setHearts(
      Array.from({ length: 9 }, (_, i) => ({
        id: Date.now() + i,
        dx: Math.round((Math.random() - 0.5) * 160),
        left: 40 + Math.random() * 20,
        emoji: emojis[i % emojis.length],
        delay: i * 45,
      })),
    );
    const t = setTimeout(onDone, 1900);
    return () => clearTimeout(t);
  }, [message, onDone]);

  if (!message || typeof document === "undefined") return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[70] flex justify-center px-4">
      <div className="relative">
        {hearts.map((h) => (
          <span
            key={h.id}
            aria-hidden
            className="heart-pop text-2xl"
            style={{ left: `${h.left}%`, top: 0, animationDelay: `${h.delay}ms`, ["--dx" as string]: `${h.dx}px` }}
          >
            {h.emoji}
          </span>
        ))}
        <p
          role="status"
          className="toast-in px-5 py-3 text-center text-base text-clay-ink"
          style={{
            fontFamily: "var(--font-display)",
            background: "var(--color-clay-card)",
            borderRadius: "var(--radius-clay-pill)",
            boxShadow: "var(--shadow-clay-lift)",
          }}
        >
          {message}
        </p>
      </div>
    </div>,
    document.body,
  );
}
