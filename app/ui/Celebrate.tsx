"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 하트 팡 — a burst of hearts and a short line after a save (brief §5).
 * Decorative only: the line is also announced politely for screen readers,
 * and under reduced motion only the line shows.
 *
 * `big` is for the moments worth more than a save — a trail finished, a new
 * item for the cat, a day both of us moved: twice the burst, confetti among
 * the hearts, a hopping 🎉, and a little longer on screen. (Not a 🐱: the cats
 * are drawn now, and an emoji cat beside them would be a different cat.)
 */
export function Celebrate({
  message,
  onDone,
  big = false,
}: {
  message: string | null;
  onDone: () => void;
  big?: boolean;
}) {
  const [hearts, setHearts] = useState<{ id: number; dx: number; left: number; emoji: string; delay: number }[]>([]);

  useEffect(() => {
    if (!message) return;
    const emojis = big ? ["🎉", "💗", "✨", "🌸", "💖", "🩵", "⭐"] : ["💗", "💕", "✨", "💖", "🩵"];
    const n = big ? 18 : 9;
    setHearts(
      Array.from({ length: n }, (_, i) => ({
        id: Date.now() + i,
        dx: Math.round((Math.random() - 0.5) * (big ? 280 : 160)),
        left: 30 + Math.random() * 40,
        emoji: emojis[i % emojis.length],
        delay: i * (big ? 35 : 45),
      })),
    );
    const t = setTimeout(onDone, big ? 2800 : 1900);
    return () => clearTimeout(t);
  }, [message, onDone, big]);

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
          className={`toast-in px-5 py-3 text-center whitespace-pre-line text-clay-ink ${big ? "text-lg leading-snug" : "text-base"}`}
          style={{
            fontFamily: "var(--font-display)",
            background: "var(--color-clay-card)",
            borderRadius: "var(--radius-clay-pill)",
            boxShadow: "var(--shadow-clay-lift)",
          }}
        >
          {big ? (
            <span aria-hidden className="cat-hop mr-1.5 inline-block text-2xl align-middle">
              🎉
            </span>
          ) : null}
          {message}
        </p>
      </div>
    </div>,
    document.body,
  );
}
