"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Seoul's calendar day, `YYYY-MM-DD`, on the phone. */
function seoulToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Keep a screen's "today" honest across midnight.
 *
 * A page knows its day from when it was rendered; left open past 00:00 in
 * Seoul, it would show yesterday while the server saves to today. So: check
 * when the app comes back to the front, and every half-minute while it is
 * open, and re-render from the server the moment the day has turned.
 */
export function useDayRollover(day: string) {
  const router = useRouter();
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible" && seoulToday() !== day) router.refresh();
    };
    const timer = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    check();
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [day, router]);
}
