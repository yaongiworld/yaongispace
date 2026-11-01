"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Cat } from "@/lib/couple";
import { addDays, relativeDayLabel } from "@/lib/today/day";
import {
  CARDIO,
  CORE,
  KINDS,
  STRENGTH,
  STRENGTH_CATEGORIES,
  exerciseOf,
  type StrengthCategory,
  type WorkoutKind,
} from "@/lib/workout/catalog";
import {
  FIRST_REPS,
  FIRST_WEIGHT_DG,
  KG_HALF,
  KG_WHOLE,
  KM_TENTH,
  KM_WHOLE,
  MINUTES,
  REPS,
  dgToWheels,
  formatKg,
  formatKm,
  metersToWheels,
  wheelsToDg,
  wheelsToMeters,
} from "@/lib/workout/measures";
import type { Defaults } from "@/lib/workout/store";
import { byDay, weekSummary } from "@/lib/workout/summary";
import { CAT_FACE_ID, ImageSlot } from "../ui/ImageSlot";
import { Sheet } from "../ui/Sheet";
import { Wheel } from "../ui/Wheel";
import { Celebrate } from "../ui/Celebrate";
import { fixWorkout, removeWorkout, saveWorkout, type Saved } from "./actions";

export interface WorkoutPerson {
  id: string;
  name: string;
  cat: Cat;
  isMe: boolean;
  defaults: Defaults;
}

export interface WorkoutRow {
  id: string;
  personId: string;
  enteredBy: string;
  day: string;
  kind: WorkoutKind;
  exerciseId: string;
  distanceM: number | null;
  minutes: number | null;
  weightDg: number | null;
  reps: number | null;
  createdAt: string;
}

type Filter = "all" | Cat;

export function WorkoutView({
  today,
  weekStart,
  people,
  workouts,
  openNew,
}: {
  today: string;
  weekStart: string;
  people: WorkoutPerson[];
  workouts: WorkoutRow[];
  openNew: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [form, setForm] = useState<null | { mode: "new" } | { mode: "edit"; row: WorkoutRow }>(
    openNew ? { mode: "new" } : null,
  );
  const [cheer, setCheer] = useState<string | null>(null);

  // `?new=1` (from Today's record sheet) opens the form once, then leaves the
  // URL clean so a reload does not reopen it.
  useEffect(() => {
    if (openNew) router.replace("/workout", { scroll: false });
  }, [openNew, router]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const shown = workouts.filter((w) => filter === "all" || byId.get(w.personId)?.cat === filter);
  const week = weekSummary(
    shown.filter((w) => w.day >= weekStart).map((w) => ({ ...w, createdAt: new Date(w.createdAt) })),
  );
  const days = byDay(shown.map((w) => ({ ...w, createdAt: new Date(w.createdAt) })));

  const close = useCallback(() => setForm(null), []);
  const done = useCallback(() => setCheer(null), []);

  const onSaved = (saved: Saved, fallback: string) => {
    setForm(null);
    if (!saved.ok) {
      setCheer("저장하지 못했어요 😿");
      return;
    }
    const parts = [fallback];
    if (saved.trails?.length) parts.push(`${saved.trails.join(", ")} 완주!`);
    if (saved.item) parts.push(`새 소품 ${saved.item.emoji}`);
    setCheer(parts.join(" · "));
  };

  return (
    <main className="page-in mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-28">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl text-clay-ink" style={{ fontFamily: "var(--font-display)" }}>
          Workout
        </h1>
        <button
          type="button"
          onClick={() => setForm({ mode: "new" })}
          aria-label="운동 기록하기"
          className="press grid h-12 w-12 place-items-center rounded-full text-3xl leading-none text-white"
          style={{ background: "var(--color-clay-berry)", boxShadow: "var(--shadow-clay-lift)" }}
        >
          ＋
        </button>
      </header>

      <div role="radiogroup" aria-label="누구 기록" className="flex gap-2">
        {(["all", "yangcho", "towee"] as Filter[]).map((f) => {
          const label = f === "all" ? "전체" : (people.find((p) => p.cat === f)?.name ?? (f === "yangcho" ? "양초" : "토위"));
          const on = filter === f;
          const accent = f === "towee" ? "var(--color-clay-sky)" : "var(--color-clay-berry)";
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setFilter(f)}
              className="press min-h-11 min-w-0 flex-1 truncate px-3 text-sm font-semibold"
              style={{
                borderRadius: "var(--radius-clay-pill)",
                background: on ? `color-mix(in srgb, ${accent} 16%, white)` : "var(--color-clay-card-quiet)",
                color: on ? "var(--color-clay-ink)" : "var(--color-clay-ink-soft)",
                boxShadow: on ? `inset 0 0 0 2px ${accent}` : "var(--shadow-clay)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <p className="text-sm text-clay-ink-soft" aria-live="polite">
        이번 주 <b className="text-clay-ink">{week.sessions}번</b>
        {week.cardioM > 0 ? (
          <>
            {" "}
            · 유산소 <b className="text-clay-ink">{formatKm(week.cardioM)}km</b>
          </>
        ) : null}
      </p>

      {days.length === 0 ? (
        <div
          className="flex flex-col items-center gap-3 px-6 py-12 text-center"
          style={{ background: "var(--color-clay-card-quiet)", borderRadius: "var(--radius-clay-lg)", boxShadow: "var(--shadow-clay)" }}
        >
          <ImageSlot id="workout-empty" size={64} emoji="🐾" />
          <p className="text-sm text-clay-ink-soft">아직 기록이 없어요</p>
        </div>
      ) : (
        <ol className="flex flex-col gap-5">
          {days.map((d) => (
            <li key={d.day} className="flex flex-col gap-2">
              <h2 className="px-1 text-xs font-semibold text-clay-ink-soft">{relativeDayLabel(d.day, today)}</h2>
              <ul className="flex flex-col gap-2">
                {d.workouts.map((w) => {
                  const row = workouts.find((r) => r.id === w.id)!;
                  return (
                    <li key={w.id}>
                      <Row row={row} owner={byId.get(w.personId)} writer={byId.get(w.enteredBy)} onClick={() => setForm({ mode: "edit", row })} />
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}

      <Sheet open={form !== null} onClose={close} title={form?.mode === "edit" ? "기록 고치기" : "운동 기록"}>
        {form ? (
          <WorkoutForm
            key={form.mode === "edit" ? form.row.id : "new"}
            people={people}
            today={today}
            editing={form.mode === "edit" ? form.row : null}
            onSaved={onSaved}
            onDeleted={() => {
              setForm(null);
              setCheer("지웠어요");
            }}
          />
        ) : null}
      </Sheet>

      <Celebrate message={cheer} onDone={done} />
    </main>
  );
}

function Row({
  row,
  owner,
  writer,
  onClick,
}: {
  row: WorkoutRow;
  owner?: WorkoutPerson;
  writer?: WorkoutPerson;
  onClick: () => void;
}) {
  const ex = exerciseOf(row.kind, row.exerciseId);
  const cat = owner?.cat ?? "yangcho";
  const forOther = row.enteredBy !== row.personId;
  const { big, small } = resultOf(row);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${owner?.name ?? ""} ${ex?.label ?? row.exerciseId} ${big}${small ? ` ${small}` : ""}${forOther ? `, ${writer?.name ?? ""}가 대신 기록` : ""}. 고치기`}
      className="press flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left"
      style={{
        background: "var(--color-clay-card)",
        borderRadius: "var(--radius-clay)",
        boxShadow: `var(--shadow-clay), inset 3px 0 0 ${cat === "towee" ? "var(--color-clay-sky)" : "var(--color-clay-berry)"}`,
      }}
    >
      <ImageSlot id={CAT_FACE_ID[cat]} size={36} cat={cat} />
      <span className="flex min-w-0 flex-1 flex-col">
        {/* Two lines rather than an ellipsis: 불가리안 스플릿 스쿼트 is the
            whole point of the row at 320px. */}
        <span className="line-clamp-2 text-sm leading-snug text-clay-ink">
          <span aria-hidden>{ex?.emoji} </span>
          {ex?.label ?? row.exerciseId}
          {forOther ? (
            <span className="ml-1" aria-hidden title={`${writer?.name}가 대신 기록`}>
              💌
            </span>
          ) : null}
        </span>
        {small ? <span className="text-xs text-clay-ink-soft">{small}</span> : null}
      </span>
      <span className="shrink-0 text-2xl text-clay-ink tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
        {big}
      </span>
    </button>
  );
}

function resultOf(row: WorkoutRow): { big: string; small: string | null } {
  switch (row.kind) {
    case "cardio":
      return { big: `${formatKm(row.distanceM ?? 0)}km`, small: `${row.minutes}분` };
    case "strength":
      return { big: `${formatKg(row.weightDg ?? 0)}kg`, small: null };
    case "core":
      return { big: `${row.reps}회`, small: null };
    case "stretch":
      return { big: "✓", small: null };
  }
}

/* -------------------------------------------------------------------------
   The form. Opens on the last kind and the last numbers, so an unchanged
   workout is ＋ then 저장 — two taps (brief §4). Strength is three:
   category → exercise → 저장.
   ------------------------------------------------------------------------- */

function WorkoutForm({
  people,
  today,
  editing,
  onSaved,
  onDeleted,
}: {
  people: WorkoutPerson[];
  today: string;
  editing: WorkoutRow | null;
  onSaved: (saved: Saved, message: string) => void;
  onDeleted: () => void;
}) {
  const me = people.find((p) => p.isMe)!;
  const [ownerId, setOwnerId] = useState(editing?.personId ?? me.id);
  const owner = people.find((p) => p.id === ownerId) ?? me;
  const d = owner.defaults;

  const [kind, setKind] = useState<WorkoutKind>(editing?.kind ?? d.kind);
  const [day, setDay] = useState(editing?.day ?? today);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Cardio
  const [cardioId, setCardioId] = useState(editing?.kind === "cardio" ? editing.exerciseId : d.cardio.exerciseId);
  const [km, setKm] = useState(metersToWheels(editing?.distanceM ?? d.cardio.distanceM));
  const [minutes, setMinutes] = useState(editing?.minutes ?? d.cardio.minutes);
  // Strength
  const firstStrength = editing?.kind === "strength" ? editing.exerciseId : d.lastStrength;
  const [category, setCategory] = useState<StrengthCategory>(
    STRENGTH.find((s) => s.id === firstStrength)?.category ?? "upper",
  );
  const [strengthId, setStrengthId] = useState<string | null>(firstStrength);
  const [kg, setKg] = useState(dgToWheels(editing?.weightDg ?? (firstStrength ? d.weightDg[firstStrength] : undefined) ?? FIRST_WEIGHT_DG));
  // Core
  const [coreId, setCoreId] = useState(editing?.kind === "core" ? editing.exerciseId : (d.lastCore ?? CORE[0].id));
  const [reps, setReps] = useState(editing?.reps ?? d.reps[coreId] ?? FIRST_REPS);

  // Writing for the other one starts from *their* last numbers.
  const switchOwner = (id: string) => {
    setOwnerId(id);
    const nd = people.find((p) => p.id === id)!.defaults;
    setKind(nd.kind);
    setCardioId(nd.cardio.exerciseId);
    setKm(metersToWheels(nd.cardio.distanceM));
    setMinutes(nd.cardio.minutes);
    setStrengthId(nd.lastStrength);
    setCategory(STRENGTH.find((s) => s.id === nd.lastStrength)?.category ?? "upper");
    setKg(dgToWheels((nd.lastStrength ? nd.weightDg[nd.lastStrength] : undefined) ?? FIRST_WEIGHT_DG));
    setCoreId(nd.lastCore ?? CORE[0].id);
    setReps((nd.lastCore ? nd.reps[nd.lastCore] : undefined) ?? FIRST_REPS);
  };

  const pickStrength = (id: string) => {
    setStrengthId(id);
    setKg(dgToWheels(owner.defaults.weightDg[id] ?? FIRST_WEIGHT_DG));
  };
  const pickCore = (id: string) => {
    setCoreId(id);
    setReps(owner.defaults.reps[id] ?? FIRST_REPS);
  };

  const distanceM = wheelsToMeters(km[0], km[1]);
  const payload = (() => {
    const base = { personId: ownerId, day };
    switch (kind) {
      case "cardio":
        return distanceM > 0 ? { ...base, kind, exerciseId: cardioId, distanceM, minutes } : null;
      case "strength":
        return strengthId ? { ...base, kind, exerciseId: strengthId, weightDg: wheelsToDg(kg[0], kg[1]) } : null;
      case "core":
        return { ...base, kind, exerciseId: coreId, reps };
      case "stretch":
        return { ...base, kind, exerciseId: "stretch" };
    }
  })();

  const submit = () => {
    if (!payload || pending) return;
    const forOther = ownerId !== me.id;
    startTransition(async () => {
      const saved = editing ? await fixWorkout(editing.id, payload) : await saveWorkout(payload);
      onSaved(saved, editing ? "고쳤어요" : forOther ? `${owner.name}에게 기록해줬어요 💌` : "기록했어요!");
    });
  };

  const partner = people.find((p) => !p.isMe);

  return (
    <div className="flex flex-col gap-3 pb-2">
      {/* 누구 거예요? — 나 by default (brief §4), fixed once written — and
          when, on one line so the wheels stay on screen on a short phone. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {!editing && partner ? (
          <div role="radiogroup" aria-label="누구 거예요?" className="flex items-center gap-1.5">
            <span className="mr-0.5 text-xs text-clay-ink-soft" aria-hidden>
              누구 거예요?
            </span>
            {[me, partner].map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={ownerId === p.id}
                onClick={() => switchOwner(p.id)}
                className="press flex min-h-11 max-w-[9rem] min-w-0 items-center gap-1.5 pr-3 pl-1.5 text-sm font-semibold"
                style={chip(ownerId === p.id, p.cat)}
              >
                <ImageSlot id={CAT_FACE_ID[p.cat]} size={28} cat={p.cat} />
                <span className="truncate">{p.isMe ? "나" : p.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-clay-ink-soft">
            <ImageSlot id={CAT_FACE_ID[owner.cat]} size={28} cat={owner.cat} /> {owner.name}의 기록
          </p>
        )}

        <div className="flex gap-1.5" role="radiogroup" aria-label="언제">
          {[today, addDays(today, -1), ...(day !== today && day !== addDays(today, -1) ? [day] : [])].map((dd) => (
            <button
              key={dd}
              type="button"
              role="radio"
              aria-checked={day === dd}
              onClick={() => setDay(dd)}
              className="press min-h-11 px-3 text-sm"
              style={chip(day === dd)}
            >
              {relativeDayLabel(dd, today)}
            </button>
          ))}
        </div>
      </div>

      {!editing ? (
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="운동 종류">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={kind === k.id}
              onClick={() => setKind(k.id)}
              className="press flex min-h-14 flex-col items-center justify-center px-1 text-[12px] font-semibold"
              style={{ ...chip(kind === k.id), borderRadius: "var(--radius-clay-sm)" }}
            >
              <span className="text-xl" aria-hidden>
                {k.emoji}
              </span>
              <span className="whitespace-nowrap">{k.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {kind === "cardio" ? (
        <>
          <ChipList label="유산소 종류" items={CARDIO} value={cardioId} onPick={setCardioId} row />
          <div className="flex items-center justify-center gap-1">
            <Wheel label="킬로미터" values={KM_WHOLE} value={km[0]} onChange={(v) => setKm((k) => [v, k[1]])} width={64} />
            <span className="text-3xl text-clay-ink" style={{ fontFamily: "var(--font-display)" }}>
              .
            </span>
            <Wheel label="0.1 킬로미터" values={KM_TENTH} value={km[1]} onChange={(v) => setKm((k) => [k[0], v])} width={52} />
            <span className="mr-3 text-base text-clay-ink-soft">km</span>
            <Wheel label="분" values={MINUTES} value={minutes} onChange={setMinutes} width={64} />
            <span className="text-base text-clay-ink-soft">분</span>
          </div>
        </>
      ) : null}

      {kind === "strength" ? (
        <>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="부위">
            {STRENGTH_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={category === c.id}
                onClick={() => setCategory(c.id)}
                className="press min-h-11 text-sm font-semibold"
                style={chip(category === c.id)}
              >
                <span aria-hidden>{c.emoji}</span> {c.label}
              </button>
            ))}
          </div>
          <ChipList
            label="근력 운동"
            items={STRENGTH.filter((s) => s.category === category)}
            value={strengthId}
            onPick={pickStrength}
          />
          {strengthId ? (
            <div className="flex items-center justify-center gap-1">
              <Wheel label="킬로그램" values={KG_WHOLE} value={kg[0]} onChange={(v) => setKg((k) => [v, k[1]])} width={72} />
              <span className="text-3xl text-clay-ink" style={{ fontFamily: "var(--font-display)" }}>
                .
              </span>
              <Wheel label="0.5 킬로그램" values={KG_HALF} value={kg[1]} onChange={(v) => setKg((k) => [k[0], v])} width={52} />
              <span className="text-base text-clay-ink-soft">kg</span>
            </div>
          ) : (
            <p className="text-center text-sm text-clay-ink-soft">운동을 골라요</p>
          )}
        </>
      ) : null}

      {kind === "core" ? (
        <>
          <ChipList label="복근·코어 운동" items={CORE} value={coreId} onPick={pickCore} />
          <div className="flex items-center justify-center gap-1">
            <Wheel label="횟수" values={REPS} value={reps} onChange={setReps} width={72} />
            <span className="text-base text-clay-ink-soft">회</span>
          </div>
        </>
      ) : null}

      {kind === "stretch" ? <p className="py-4 text-center text-5xl" aria-hidden>🧘</p> : null}

      {/* Pinned to the bottom of the sheet, so on a 320×568 phone the second
          tap of "＋ → 저장" never needs a scroll first. */}
      <div
        className="pointer-events-none sticky bottom-0 -mx-5 -mb-2 px-5 pt-3 pb-2"
        style={{ background: "linear-gradient(to bottom, rgb(255 250 246 / 0), #fffaf6 30%)" }}
      >
        <button
          type="button"
          onClick={submit}
          disabled={!payload || pending}
          className="press pointer-events-auto min-h-12 w-full py-3 text-base font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--color-clay-berry)", borderRadius: "var(--radius-clay-pill)", boxShadow: "var(--shadow-clay-lift)" }}
        >
          {kind === "stretch" && !editing ? "완료" : "저장"}
        </button>
      </div>

      {editing ? (
        <button
          type="button"
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            startTransition(async () => {
              await removeWorkout(editing.id);
              onDeleted();
            });
          }}
          className="press min-h-11 text-sm text-clay-ink-soft underline underline-offset-4"
        >
          {confirmDelete ? "정말 지울까요? 한 번 더 누르면 지워요" : "이 기록 지우기"}
        </button>
      ) : null}
    </div>
  );
}

/** `row` keeps a long list to one sideways-scrolling line, so the wheels
 *  stay on screen on a short phone. */
function ChipList({
  label,
  items,
  value,
  onPick,
  row = false,
}: {
  label: string;
  items: readonly { id: string; label: string; emoji: string }[];
  value: string | null;
  onPick: (id: string) => void;
  row?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Bring the chosen chip into view when a row opens scrolled away from it.
  useEffect(() => {
    if (!row) return;
    const el = ref.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [row, value]);
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      className={row ? "-mx-5 flex gap-2 overflow-x-auto px-5 py-1 [scrollbar-width:none]" : "flex flex-wrap gap-2"}
    >
      {items.map((e) => (
        <button
          key={e.id}
          type="button"
          role="radio"
          aria-checked={value === e.id}
          onClick={() => onPick(e.id)}
          className="press min-h-11 shrink-0 px-3.5 text-sm whitespace-nowrap"
          style={chip(value === e.id)}
        >
          {e.label}
        </button>
      ))}
    </div>
  );
}

function chip(on: boolean, cat?: Cat): React.CSSProperties {
  const accent = cat === "towee" ? "var(--color-clay-sky)" : "var(--color-clay-berry)";
  return {
    borderRadius: "var(--radius-clay-pill)",
    background: on ? `color-mix(in srgb, ${accent} 14%, white)` : "var(--color-clay-card)",
    color: on ? "var(--color-clay-ink)" : "var(--color-clay-ink-soft)",
    boxShadow: on ? `inset 0 0 0 2px ${accent}` : "var(--shadow-clay)",
    fontWeight: on ? 600 : 400,
  };
}
