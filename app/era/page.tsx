import { redirect } from "next/navigation";
import { asPerson } from "@/lib/as-person";
import { currentPersonId } from "@/lib/auth/current-person";
import { loadCouple } from "@/lib/couple";
import { CURRENT_ERA_ID, ERAS, LAP_M, PASSPORT_TRAILS } from "@/lib/era/eras";
import { formatPercent, passportProgress } from "@/lib/era/passport";
import { eraTotals } from "@/lib/era/store";
import { formatKm } from "@/lib/workout/measures";
import { ImageSlot } from "../ui/ImageSlot";

/**
 * Era — where our cardio has walked us (brief §4 Era, 메뉴 구조 A안).
 *
 * **Look only.** There is nothing to type here: cardio is written in
 * Workout, and this page adds it up — both of ours, solo days too — into
 * South America's five trails. A list of cards, not a map. The other eras
 * hold their place, locked.
 *
 * The maths is the old prototype's passport (lib/era/passport.ts): 36.5km a
 * lap, trails in a fixed order, and a lap that rolls over rather than
 * resetting.
 */

export const metadata = {
  title: "Era · 야옹이월드",
};

export const dynamic = "force-dynamic";

export default async function EraPage() {
  const personId = await currentPersonId();
  if (!personId) redirect("/sign-in");

  const totals = await asPerson(personId, async (client) =>
    eraTotals(client, await loadCouple(client, personId), CURRENT_ERA_ID),
  );
  const p = passportProgress(totals.totalM);
  const lapPercent = Math.floor((p.lapM * 100) / LAP_M);

  return (
    <main className="page-in mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-28">
      <h1 className="text-3xl text-clay-ink" style={{ fontFamily: "var(--font-display)" }}>
        Era
      </h1>

      {/* The open era. */}
      <section
        aria-labelledby="era-south-america"
        className="flex flex-col gap-4 p-5"
        style={{ background: "var(--color-clay-card)", borderRadius: "var(--radius-clay-lg)", boxShadow: "var(--shadow-clay)" }}
      >
        <div className="flex items-center gap-3">
          <ImageSlot id="era-south-america" size={56} emoji="🌎" />
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 id="era-south-america" className="text-xl text-clay-ink" style={{ fontFamily: "var(--font-display)" }}>
              남미
            </h2>
            <span className="text-xs text-clay-ink-soft">
              {p.lap}회차 · 코스 {p.trailNumber}/{PASSPORT_TRAILS.length}
            </span>
          </div>
          <span className="text-3xl text-clay-ink tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
            {formatPercent(p.percentTenths)}
            <span className="text-base">%</span>
          </span>
        </div>

        <Bar percent={lapPercent} label={`이번 회차 ${lapPercent}%`} />

        <p className="flex justify-between text-sm text-clay-ink-soft tabular-nums">
          <span>
            <b className="text-clay-ink">{formatKm(totals.totalM)}km</b> 걸었어요
          </span>
          <span>
            회차까지 <b className="text-clay-ink">{formatKm(LAP_M - p.lapM)}km</b>
          </span>
        </p>

        <ol className="flex flex-col gap-2" aria-label="코스">
          {PASSPORT_TRAILS.map((t, i) => {
            const status = p.trails[i];
            const doneM = status === "done" ? t.distanceM : status === "current" ? p.trailDoneM : 0;
            const pct = Math.floor((doneM * 100) / t.distanceM);
            return (
              <li
                key={t.id}
                aria-current={status === "current" ? "step" : undefined}
                className="flex items-center gap-3 px-3 py-3"
                style={{
                  borderRadius: "var(--radius-clay)",
                  background:
                    status === "current"
                      ? "var(--color-clay-blush)"
                      : status === "done"
                        ? "color-mix(in srgb, var(--color-clay-apricot) 30%, white)"
                        : "transparent",
                  boxShadow: status === "next" ? "inset 0 0 0 1.5px var(--color-clay-apricot)" : "none",
                  opacity: status === "next" ? 0.7 : 1,
                }}
              >
                <ImageSlot id={`trail-${t.id}`} size={40} emoji={t.emoji} />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 text-sm font-semibold text-clay-ink">{t.label}</span>
                    {status !== "current" ? (
                      <span className="shrink-0 text-xs text-clay-ink-soft tabular-nums">
                        {status === "done" ? "완주 ✓" : `${formatKm(t.distanceM)}km`}
                      </span>
                    ) : null}
                  </div>
                  {/* The current trail gets its numbers on their own line, so
                      a long name like 미라도르 토레스 is never cut at 320px. */}
                  {status === "current" ? (
                    <>
                      <Bar percent={pct} label={`${t.label} ${pct}%`} thin />
                      <span className="flex justify-between gap-2 text-xs text-clay-ink-soft tabular-nums">
                        <span>
                          {formatKm(doneM)} / {formatKm(t.distanceM)}km
                        </span>
                        <span>남은 {formatKm(p.trailLeftM)}km</span>
                      </span>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>

        <p className="text-center text-xs text-clay-ink-soft">유산소를 Workout에 적으면 저절로 쌓여요 🐾</p>
      </section>

      {/* The rest hold their place (brief §4 — how they open is for later). */}
      <ul className="flex flex-col gap-3" aria-label="다른 여행지">
        {ERAS.filter((e) => !e.open).map((e) => (
          <li
            key={e.id}
            className="flex items-center gap-3 px-5 py-4"
            style={{ background: "var(--color-clay-card-quiet)", borderRadius: "var(--radius-clay)", boxShadow: "var(--shadow-clay)" }}
          >
            <ImageSlot id={`era-${e.id.replace(/_/g, "-")}`} size={44} emoji={e.emoji} className="opacity-60" />
            <span className="flex-1 text-base text-clay-ink-soft">{e.label}</span>
            <span className="text-sm text-clay-ink-soft">🔒 곧 열려요</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Bar({ percent, label, thin = false }: { percent: number; label: string; thin?: boolean }) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="w-full overflow-hidden"
      style={{ height: thin ? 8 : 14, borderRadius: 99, background: "color-mix(in srgb, var(--color-clay-apricot) 45%, white)" }}
    >
      <div
        className="bar-grow h-full"
        style={{
          width: `${pct}%`,
          borderRadius: 99,
          background: "linear-gradient(90deg, var(--color-clay-berry), color-mix(in srgb, var(--color-clay-berry) 50%, var(--color-clay-sky)))",
        }}
      />
    </div>
  );
}
