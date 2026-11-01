import { redirect } from "next/navigation";
import { currentPersonId } from "@/lib/auth/current-person";
import { asPerson } from "@/lib/as-person";
import { loadCouple, type Cat } from "@/lib/couple";
import { newsFor, newsSeenAt, seeNews } from "@/lib/news";
import { catLine } from "@/lib/today/line";
import { shortDayLabel, today } from "@/lib/today/day";
import { seoulClock } from "@/lib/today/clock";
import { dayFor } from "@/lib/today/store";
import { workoutCount } from "@/lib/workout/store";
import { unlockedItems } from "@/lib/workout/items";
import { TodayView, type TodayCat } from "./today/TodayView";

/**
 * Today — the couple app's home (brief §4 Today, 충돌 1).
 *
 * Still a hearth, not a dashboard: the two cats and how each of us is today
 * are the content; one cat says one quiet line; and the record button is
 * small, at the bottom, and never nags. Nothing here counts what has not
 * been done.
 *
 * The page is a server component that gathers the day and hands it to
 * `TodayView`, which owns the taps and the sheets. It has no links of its own
 * — the tab bar navigates (the hearth test still holds it to that).
 */

export const metadata = {
  title: "야옹이월드",
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const personId = await currentPersonId();
  if (!personId) redirect("/sign-in");

  const day = today();
  const { couple, days, items } = await asPerson(personId, async (client) => {
    const couple = await loadCouple(client, personId);
    const days = await dayFor(client, couple, day);
    const items = unlockedItems(await workoutCount(client, personId));
    return { couple, days, items };
  });

  const groups = await newsFor(personId);
  const seenAt = await newsSeenAt(personId);
  await seeNews(personId);

  const cats: TodayCat[] = (["yangcho", "towee"] as Cat[]).map((cat) => {
    const who = couple[cat];
    const d = days[cat];
    return {
      cat,
      name: who?.name ?? (cat === "yangcho" ? "양초" : "토위"),
      isMe: couple.me.cat === cat,
      present: Boolean(who),
      mood: d.mood,
      leaveMinute: d.leaveMinute,
      leftAt: d.leftAt ? seoulClock(d.leftAt) : null,
      memo: d.memo,
      protein: d.protein,
    };
  });

  return (
    <TodayView
      day={day}
      dayLabel={shortDayLabel(day)}
      cats={cats}
      line={catLine({
        groups,
        seenAt,
        quietPartner: couple.partner && days[couple.partner.cat].mood === null ? couple.partner.name : null,
      })}
      myCat={couple.me.cat}
      needsClaim={!couple.claimed}
      myName={couple.me.name}
      items={items.map((i) => i.id)}
    />
  );
}
