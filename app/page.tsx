import { redirect } from "next/navigation";
import { currentPersonId } from "@/lib/auth/current-person";
import { asPerson } from "@/lib/as-person";
import { loadCouple, type Cat } from "@/lib/couple";
import { newsFor, seeNews } from "@/lib/news";
import { hearthFor } from "@/lib/mood";
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
    };
  });

  return (
    <TodayView
      dayLabel={shortDayLabel(day)}
      cats={cats}
      line={catLine(groups, couple.partner && days[couple.partner.cat].mood === null ? couple.partner.name : null, day)}
      myCat={couple.me.cat}
      myName={couple.me.name}
      items={items.map((i) => i.id)}
    />
  );
}

/**
 * The one line the cat says. News from today first (충돌 6); then, if the
 * other one has not pressed a face yet, a gentle guess on their behalf (brief
 * §4 — never a prompt, never a red dot); otherwise the warm nothing.
 */
function catLine(
  groups: Awaited<ReturnType<typeof newsFor>>,
  quietPartner: string | null,
  day: string,
): string {
  const fresh = groups.filter((g) => today(g.arrivedAt) === day);
  if (fresh.length > 0) return hearthFor(fresh).caption;
  if (quietPartner) return `${quietPartner}는 아직 바쁜가 봐요`;
  return hearthFor([]).caption;
}
