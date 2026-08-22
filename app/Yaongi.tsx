"use client";

import { useCallback, useRef, useState } from "react";
import { MOOD_ASSET, type Mood } from "@/lib/mood";

/**
 * The hero cat.
 *
 * **It navigates nowhere.** Tapping it gets a squash-and-sparkle and nothing
 * else — no route, no sheet, no menu. That is deliberate and it is the whole
 * character of the home page: the cat is the content, and the tab bar is what
 * navigates. A cat that opened something would make the hearth a launcher,
 * which is the dashboard this page is explicitly not (CLAUDE.md, "Home is a
 * hearth, not a dashboard"). This is a `<button>` rather than a `<div>` only
 * so that the reaction is reachable from a keyboard.
 *
 * **CSS 3D transforms, not WebGL** (ADR-0008). All three approaches were
 * prototyped and measured at phone size: real three.js cost ~600KB and a
 * measurably warmer battery for a difference invisible at 132px. The
 * liveliness comes from the *reaction*, not the rendering. The keyframes below
 * are carried over from `prototypes/cat-dimension.html`, option B.
 *
 * Because the hero is a plain swappable image, the cat gets moods for free —
 * which is the real answer to "charming at first, grating by week three".
 */

/** How long the spin runs. Matches `spin3d` below. */
const POKE_MS = 850;

export function Yaongi({ mood }: { mood: Mood }) {
  const [poked, setPoked] = useState(false);
  const [sparkles, setSparkles] = useState<{ id: number; left: number; top: number }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const poke = useCallback(() => {
    // Ignore a second tap mid-spin: restarting the animation looks like a
    // stutter rather than an eagerness.
    if (poked) return;
    setPoked(true);

    setSparkles(
      Array.from({ length: 3 }, () => ({
        id: nextId.current++,
        left: 28 + Math.random() * 62,
        top: 24 + Math.random() * 32,
      })),
    );

    timer.current = setTimeout(() => {
      setPoked(false);
      setSparkles([]);
    }, POKE_MS);
  }, [poked]);

  return (
    <div className="flex justify-center" style={{ perspective: "620px" }}>
      <button
        type="button"
        onClick={poke}
        aria-label="야옹이"
        className="relative grid place-items-center border-0 bg-transparent p-0"
        style={{
          width: 200,
          height: 200,
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a plain <img>
            is the point: the mood swap is a src change on an already-loaded
            asset, and next/image would add a wrapper and a loader for a 40KB
            PNG that ships with the app. */}
        <img
          src={MOOD_ASSET[mood]}
          alt=""
          width={132}
          height={132}
          className={poked ? "yaongi yaongi-poke" : "yaongi"}
          style={{ filter: "drop-shadow(0 10px 14px rgb(140 70 60 / 0.28))" }}
        />

        {sparkles.map((s, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={s.id}
            src="/yaongi/sparkles.png"
            alt=""
            width={26}
            height={26}
            className="yaongi-sparkle"
            style={{
              position: "absolute",
              left: `${s.left}%`,
              top: `${s.top}%`,
              animationDelay: `${i * 80}ms`,
              pointerEvents: "none",
            }}
          />
        ))}
      </button>
    </div>
  );
}
