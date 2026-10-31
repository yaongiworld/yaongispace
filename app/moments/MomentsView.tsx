"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import type { Cat } from "@/lib/couple";
import type { Cell } from "@/lib/moments/month";
import type { MomentDay } from "@/lib/moments/store";
import { shortDayLabel } from "@/lib/today/day";
import { moodOf } from "@/lib/today/moods";
import { exerciseOf, type WorkoutKind } from "@/lib/workout/catalog";
import { formatKg, formatKm } from "@/lib/workout/measures";
import { CAT_FACE_ID, ImageSlot } from "../ui/ImageSlot";
import { Sheet } from "../ui/Sheet";
import { Celebrate } from "../ui/Celebrate";
import { saveMemo } from "../today/actions";
import { addAnniversary, removeAnniversary } from "./actions";

export interface MomentEvent {
  id: string;
  day: string;
  title: string;
  yearly: boolean;
  /** "3주년", or null. */
  label: string | null;
}

const WEEK = ["월", "화", "수", "목", "금", "토", "일"];
const CATS: Cat[] = ["yangcho", "towee"];

export function MomentsView({
  month,
  label,
  prev,
  next,
  isThisMonth,
  today,
  grid,
  days,
  events,
  names,
  myCat,
}: {
  month: string;
  label: string;
  prev: string;
  next: string;
  isThisMonth: boolean;
  today: string;
  grid: Cell[][];
  days: Record<string, MomentDay>;
  events: MomentEvent[];
  names: Record<Cat, string>;
  myCat: Cat;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [cheer, setCheer] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const done = useCallback(() => setCheer(null), []);

  const eventsOn = (day: string) => events.filter((e) => e.day === day);

  return (
    <main className="page-in mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-28">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-3xl text-clay-ink" style={{ fontFamily: "var(--font-display)" }}>
          Moments
        </h1>
        <nav aria-label="달" className="flex shrink-0 items-center">
          <Link
            href={`/moments?m=${prev}`}
            aria-label="지난달"
            className="press grid h-11 w-11 place-items-center rounded-full text-xl text-clay-ink-soft"
            scroll={false}
          >
            ‹
          </Link>
          <span className="min-w-[3rem] text-center text-sm font-semibold whitespace-nowrap text-clay-ink" aria-live="polite">
            {label}
          </span>
          <Link
            href={`/moments?m=${next}`}
            aria-label="다음 달"
            className="press grid h-11 w-11 place-items-center rounded-full text-xl text-clay-ink-soft"
            scroll={false}
          >
            ›
          </Link>
        </nav>
      </header>

      <section
        aria-label={`${label} 기분 달력`}
        /* -mx-4 and px-0.5 make each of the seven columns 44px at 320px. */
        className="-mx-4 px-0.5 py-3"
        style={{ background: "var(--color-clay-card)", borderRadius: "var(--radius-clay-lg)", boxShadow: "var(--shadow-clay)" }}
      >
        <div className="grid grid-cols-7" aria-hidden>
          {WEEK.map((w, i) => (
            <span key={w} className="pb-1 text-center text-[11px]" style={{ color: i >= 5 ? "var(--color-clay-berry)" : "var(--color-clay-ink-soft)" }}>
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.flat().map((cell) => {
            const d = days[cell.day];
            const hasHeart = Boolean(d?.memo.yangcho || d?.memo.towee || eventsOn(cell.day).length);
            const moved = Boolean(d?.workouts.length);
            const n = Number(cell.day.slice(8));
            const isToday = cell.day === today;
            return (
              <button
                key={cell.day}
                type="button"
                onClick={() => setOpen(cell.day)}
                aria-label={cellLabel(cell.day, d, hasHeart, names)}
                className="press relative flex min-h-[62px] flex-col items-center gap-0.5 pt-1"
                style={{ opacity: cell.inMonth ? 1 : 0.35, borderRadius: 14 }}
              >
                <span
                  className="grid h-5 min-w-5 place-items-center px-1 text-[11px] tabular-nums"
                  style={{
                    borderRadius: 99,
                    background: isToday ? "var(--color-clay-berry)" : "transparent",
                    color: isToday ? "white" : "var(--color-clay-ink-soft)",
                    fontWeight: isToday ? 700 : 400,
                  }}
                >
                  {n}
                </span>
                {/* Two faces, 양초 left and 토위 right — the only things in a
                    cell that are more than a dot (brief: 덜 조잡하게). */}
                <span className="flex h-5 items-center text-[15px] leading-none">
                  {CATS.map((c) => (
                    <span key={c} className="w-[18px] text-center">
                      {d?.mood[c] ? moodOf(d.mood[c])?.emoji : null}
                    </span>
                  ))}
                </span>
                <span className="flex h-2 items-center gap-1" aria-hidden>
                  {moved ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-clay-ink-soft)" }} /> : null}
                </span>
                {hasHeart ? (
                  <span aria-hidden className="absolute top-0.5 right-0.5 text-[9px] leading-none" style={{ color: "var(--color-clay-berry)" }}>
                    ♥
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {!isThisMonth ? (
        <Link
          href="/moments"
          scroll={false}
          className="press mx-auto flex min-h-11 items-center px-4 text-sm text-clay-ink-soft underline underline-offset-4"
        >
          이번 달로
        </Link>
      ) : null}

      <p className="flex justify-center gap-4 text-[11px] text-clay-ink-soft" aria-hidden>
        <span>
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: "var(--color-clay-ink-soft)" }} />
          운동한 날
        </span>
        <span>
          <span className="mr-1" style={{ color: "var(--color-clay-berry)" }}>
            ♥
          </span>
          메모·기념일
        </span>
      </p>

      <Sheet open={open !== null} onClose={close} title={open ? shortDayLabel(open) : ""}>
        {open ? (
          <DayCard
            key={open}
            day={open}
            data={days[open]}
            events={eventsOn(open)}
            names={names}
            myCat={myCat}
            onCheer={setCheer}
          />
        ) : null}
      </Sheet>

      <Celebrate message={cheer} onDone={done} />
      <span className="sr-only">{month}</span>
    </main>
  );
}

function cellLabel(day: string, d: MomentDay | undefined, heart: boolean, names: Record<Cat, string>): string {
  const parts = [shortDayLabel(day)];
  for (const c of CATS) {
    const m = d?.mood[c] ? moodOf(d.mood[c]) : null;
    if (m) parts.push(`${names[c]} ${m.label}`);
  }
  if (d?.workouts.length) parts.push("운동함");
  if (heart) parts.push("메모나 기념일");
  return parts.join(", ");
}

function DayCard({
  day,
  data,
  events,
  names,
  myCat,
  onCheer,
}: {
  day: string;
  data: MomentDay | undefined;
  events: MomentEvent[];
  names: Record<Cat, string>;
  myCat: Cat;
  onCheer: (m: string) => void;
}) {
  const [memo, setMemo] = useState(data?.memo[myCat] ?? "");
  const [annTitle, setAnnTitle] = useState("");
  const [yearly, setYearly] = useState(true);
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4 pb-2">
      {/* Both of us that day. */}
      <ul className="flex flex-col gap-2">
        {CATS.map((c) => {
          const m = data?.mood[c] ? moodOf(data.mood[c]) : null;
          const line = data?.memo[c];
          return (
            <li
              key={c}
              className="flex items-center gap-3 px-3 py-2.5"
              style={{
                background: "var(--color-clay-card)",
                borderRadius: "var(--radius-clay)",
                boxShadow: `var(--shadow-clay), inset 3px 0 0 ${c === "towee" ? "var(--color-clay-sky)" : "var(--color-clay-berry)"}`,
              }}
            >
              <ImageSlot id={CAT_FACE_ID[c]} size={36} cat={c} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold text-clay-ink">
                  {names[c]} <span className="text-lg">{m?.emoji ?? ""}</span>
                  <span className="ml-1 text-xs font-normal text-clay-ink-soft">{m?.label ?? "—"}</span>
                </span>
                {line ? (
                  <span className="text-base text-clay-ink" style={{ fontFamily: "var(--font-letter)" }}>
                    {line}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      {data?.workouts.length ? (
        <section aria-label="운동" className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold text-clay-ink-soft">운동</h3>
          <ul className="flex flex-wrap gap-1.5">
            {data.workouts.map((w, i) => {
              const ex = exerciseOf(w.kind as WorkoutKind, w.exerciseId);
              const num =
                w.kind === "cardio"
                  ? ` ${formatKm(w.distanceM ?? 0)}km`
                  : w.kind === "strength"
                    ? ` ${formatKg(w.weightDg ?? 0)}kg`
                    : w.kind === "core"
                      ? ` ${w.reps}회`
                      : "";
              return (
                <li
                  key={i}
                  className="px-2.5 py-1 text-xs text-clay-ink"
                  style={{
                    borderRadius: 99,
                    background: `color-mix(in srgb, ${w.cat === "towee" ? "var(--color-clay-sky)" : "var(--color-clay-berry)"} 12%, white)`,
                  }}
                >
                  {ex?.emoji} {ex?.label}
                  {num}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {events.length ? (
        <section aria-label="기념일" className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold text-clay-ink-soft">기념일</h3>
          <ul className="flex flex-col gap-1.5">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm text-clay-ink">
                <span aria-hidden style={{ color: "var(--color-clay-berry)" }}>
                  ♥
                </span>
                <span className="flex-1">
                  {e.title}
                  {e.label ? <span className="ml-1 text-xs text-clay-ink-soft">{e.label}</span> : null}
                  {e.yearly ? <span className="ml-1 text-xs text-clay-ink-soft">· 매년</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (confirmId !== e.id) return setConfirmId(e.id);
                    startTransition(async () => {
                      await removeAnniversary(e.id);
                      onCheer("지웠어요");
                    });
                  }}
                  aria-label={confirmId === e.id ? `${e.title} 정말 지우기` : `${e.title} 지우기`}
                  className="press min-h-11 min-w-11 px-2 text-xs text-clay-ink-soft"
                >
                  {confirmId === e.id ? "정말?" : "✕"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* My line for this day. */}
      <form
        className="flex gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          startTransition(async () => {
            await saveMemo(memo, day);
            onCheer(memo.trim() ? "메모했어요 ✏️" : "메모를 지웠어요");
          });
        }}
      >
        <input
          value={memo}
          onChange={(ev) => setMemo(ev.target.value)}
          maxLength={80}
          placeholder="✏️ 한 줄 메모"
          aria-label="내 한 줄 메모"
          className="min-h-11 min-w-0 flex-1 px-4 text-base text-clay-ink outline-none"
          style={{
            fontFamily: "var(--font-letter)",
            fontSize: 18,
            background: "var(--color-clay-card)",
            borderRadius: "var(--radius-clay-pill)",
            boxShadow: "inset 0 0 0 1.5px var(--color-clay-rose)",
          }}
        />
        <button
          type="submit"
          disabled={pending || memo === (data?.memo[myCat] ?? "")}
          className="press min-h-11 shrink-0 px-4 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--color-clay-berry)", borderRadius: "var(--radius-clay-pill)" }}
        >
          저장
        </button>
      </form>

      {adding ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!annTitle.trim()) return;
            startTransition(async () => {
              await addAnniversary(day, annTitle, yearly);
              setAdding(false);
              setAnnTitle("");
              onCheer("기념일 💗");
            });
          }}
        >
          <input
            autoFocus
            value={annTitle}
            onChange={(ev) => setAnnTitle(ev.target.value)}
            maxLength={40}
            placeholder="예: 처음 만난 날"
            aria-label="기념일 이름"
            className="min-h-11 px-4 text-base text-clay-ink outline-none"
            style={{ background: "var(--color-clay-card)", borderRadius: "var(--radius-clay-pill)", boxShadow: "inset 0 0 0 1.5px var(--color-clay-rose)" }}
          />
          <div className="flex items-center gap-2">
            <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 px-2 text-sm text-clay-ink">
              <input type="checkbox" checked={yearly} onChange={(ev) => setYearly(ev.target.checked)} className="h-5 w-5 accent-[var(--color-clay-berry)]" />
              매년 반복
            </label>
            <button
              type="submit"
              disabled={pending || !annTitle.trim()}
              className="press min-h-11 px-5 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--color-clay-berry)", borderRadius: "var(--radius-clay-pill)" }}
            >
              추가
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="press min-h-11 self-center px-4 text-sm text-clay-ink-soft"
        >
          💗 기념일 추가
        </button>
      )}
    </div>
  );
}
