import { redirect } from "next/navigation";
import { asPerson } from "@/lib/as-person";
import { currentPersonId } from "@/lib/auth/current-person";
import { loadCouple, type Cat } from "@/lib/couple";
import { anniversaryLabel, seoulDayKey } from "@/lib/calendar/dates";
import { occurrencesBetween } from "@/lib/calendar/events";
import { gridRange, isMonth, monthGrid, monthLabel, monthOf, shiftMonth } from "@/lib/moments/month";
import { momentsBetween } from "@/lib/moments/store";
import { addDays, today } from "@/lib/today/day";
import { MomentsView, type MomentEvent } from "./MomentsView";

/**
 * Moments — the month as a diary (brief §4 Moments, 충돌 2).
 *
 * A month grid, and only that: each day holds the two of our faces and
 * nothing else that shouts — a small dot for a workout, a heart for a memo
 * or an anniversary. Tap a day and its card opens below. A face alone is
 * already a diary entry; writing is for when you want to.
 *
 * The old agenda (/calendar) is hidden, not gone; anniversaries are its
 * Events, with its yearly repeat.
 */

export const metadata = {
  title: "Moments · 야옹이월드",
};

export const dynamic = "force-dynamic";

export default async function MomentsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const personId = await currentPersonId();
  if (!personId) redirect("/sign-in");

  const now = today();
  const { m } = await searchParams;
  const month = isMonth(m) ? m : monthOf(now);
  const { from, to } = gridRange(month);

  const { couple, days } = await asPerson(personId, async (client) => {
    const couple = await loadCouple(client, personId);
    return { couple, days: await momentsBetween(client, couple, from, to) };
  });

  const occurrences = await occurrencesBetween(
    new Date(`${from}T00:00:00+09:00`),
    new Date(`${addDays(to, 1)}T00:00:00+09:00`),
  );
  const events: MomentEvent[] = occurrences.map((o) => ({
    id: o.id,
    day: seoulDayKey(o.occursAt),
    title: o.title,
    yearly: o.repeatsYearly,
    label: anniversaryLabel(o.occursAt, o.occurredAt),
  }));

  const names: Record<Cat, string> = {
    yangcho: couple.yangcho?.name ?? "양초",
    towee: couple.towee?.name ?? "토위",
  };

  return (
    <MomentsView
      month={month}
      label={monthLabel(month, Number(now.slice(0, 4)))}
      prev={shiftMonth(month, -1)}
      next={shiftMonth(month, 1)}
      isThisMonth={month === monthOf(now)}
      today={now}
      grid={monthGrid(month)}
      days={days}
      events={events}
      names={names}
      myCat={couple.me.cat}
    />
  );
}
