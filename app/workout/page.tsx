import { redirect } from "next/navigation";
import { asPerson } from "@/lib/as-person";
import { currentPersonId } from "@/lib/auth/current-person";
import { loadCouple, type Cat } from "@/lib/couple";
import { addDays, today, weekStart } from "@/lib/today/day";
import { defaultsFor, listWorkouts } from "@/lib/workout/store";
import { WorkoutView, type WorkoutPerson } from "./WorkoutView";

/**
 * Workout — every workout, both of ours (brief §4 Workout, 메뉴 구조 A안).
 *
 * The only place workouts are written. A record-first list: who, what, and
 * the result big; nothing about levels or points. Either of us can write one
 * for the other (💌), and either can fix it.
 */

export const metadata = {
  title: "Workout · 야옹이월드",
};

export const dynamic = "force-dynamic";

export default async function WorkoutPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const personId = await currentPersonId();
  if (!personId) redirect("/sign-in");

  const now = today();
  const data = await asPerson(personId, async (client) => {
    const couple = await loadCouple(client, personId);
    const workouts = await listWorkouts(client, { from: addDays(now, -120), limit: 400 });
    const people: WorkoutPerson[] = [];
    for (const cat of ["yangcho", "towee"] as Cat[]) {
      const p = couple[cat];
      if (!p) continue;
      people.push({ id: p.id, name: p.name, cat, isMe: p.id === personId, defaults: await defaultsFor(client, p.id) });
    }
    return { workouts, people };
  });

  const { new: openNew } = await searchParams;

  return (
    <WorkoutView
      today={now}
      weekStart={weekStart(now)}
      people={data.people}
      workouts={data.workouts.map((w) => ({ ...w, createdAt: w.createdAt.toISOString() }))}
      openNew={openNew === "1"}
    />
  );
}
