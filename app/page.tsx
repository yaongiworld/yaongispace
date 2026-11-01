import { redirect } from "next/navigation";
import { currentPersonId } from "@/lib/auth/current-person";
import { asPerson } from "@/lib/as-person";
import { loadCouple, type Cat } from "@/lib/couple";
import { newsFor, newsSeenAt, seeNews } from "@/lib/news";
import { catLine } from "@/lib/today/line";
import { MISS_ENABLED, POKE_ENABLED, pokesLeft } from "@/lib/poke";
import { dailyWord } from "@/lib/today/word";
import { CURRENT_ERA_ID } from "@/lib/era/eras";
import { passportProgress } from "@/lib/era/passport";
import { eraTotals } from "@/lib/era/store";
import { shortDayLabel, today } from "@/lib/today/day";
import { seoulClock } from "@/lib/today/clock";
import { dayFor } from "@/lib/today/store";
import { workoutCount } from "@/lib/workout/store";
import { ITEMS, unlockedItems } from "@/lib/workout/items";
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
  const { couple, days, items, pokes, misses, worn, near, moved } = await asPerson(personId, async (client) => {
    const couple = await loadCouple(client, personId);
    const days = await dayFor(client, couple, day);
    const items = unlockedItems(await workoutCount(client, personId));
    const pokes = POKE_ENABLED && couple.partner ? await pokesLeft(client, personId, day) : 0;
    const misses = MISS_ENABLED && couple.partner ? await pokesLeft(client, personId, day, "miss") : 0;
    const { rows: worn } = await client.query<{ id: string; worn_item: string | null }>(
      "SELECT id, worn_item FROM person",
    );
    // Where South America stands, for 오늘의 한마디 to notice a near trail.
    const era = passportProgress((await eraTotals(client, couple, CURRENT_ERA_ID)).totalM);
    const { rows: moved } = await client.query<{ person_id: string }>(
      "SELECT DISTINCT person_id FROM workout WHERE day = $1",
      [day],
    );
    return {
      couple,
      days,
      items,
      pokes,
      misses,
      worn: Object.fromEntries(worn.map((r) => [r.id, r.worn_item])),
      near: { label: era.trail.label, leftM: era.trailLeftM },
      moved: moved.map((r) => r.person_id),
    };
  });

  const groups = await newsFor(personId);
  const seenAt = await newsSeenAt(personId);
  await seeNews(personId);

  // Both of us, today — the days worth a small cheer.
  const together = {
    moods: Boolean(couple.yangcho && couple.towee && days.yangcho.mood && days.towee.mood),
    moved: Boolean(couple.yangcho && couple.towee && moved.includes(couple.yangcho.id) && moved.includes(couple.towee.id)),
  };

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
      item: who ? (ITEMS.find((i) => i.id === worn[who.id])?.emoji ?? null) : null,
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
        together,
      })}
      together={together}
      speaker={couple.partner ? { cat: couple.partner.cat, mood: days[couple.partner.cat].mood } : null}
      myCat={couple.me.cat}
      needsClaim={!couple.claimed}
      pokesLeft={POKE_ENABLED && couple.partner ? pokes : null}
      missesLeft={MISS_ENABLED && couple.partner ? misses : null}
      missedBy={groups.some((g) => g.items[0].kind === "miss" && today(g.arrivedAt) === day) ? (couple.partner?.name ?? null) : null}
      word={dailyWord(day, near)}
      worn={couple.me ? (worn[couple.me.id] ?? null) : null}
      myName={couple.me.name}
      items={items.map((i) => i.id)}
    />
  );
}
