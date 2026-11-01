"use client";

import { useCallback, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Cat } from "@/lib/couple";
import { DEFAULT_LEAVE_MINUTE, LEAVE_MINUTES, clockLabel } from "@/lib/today/clock";
import { MOODS, moodOf, type MoodId } from "@/lib/today/moods";
import { ITEMS, imageIdOf } from "@/lib/workout/items";
import { CAT_FACE_ID, ImageSlot } from "../ui/ImageSlot";
import { Sheet } from "../ui/Sheet";
import { Wheel } from "../ui/Wheel";
import { Celebrate } from "../ui/Celebrate";
import { chooseLeaveTime, chooseMood, claimCat, countProtein, leftWork, saveMemo, signOut, undoLeftWork } from "./actions";

export interface TodayCat {
  cat: Cat;
  name: string;
  isMe: boolean;
  /** False before the second of us has ever signed in. */
  present: boolean;
  mood: MoodId | null;
  leaveMinute: number | null;
  /** "18:07" once they have left, Seoul time. */
  leftAt: string | null;
  /** Today's one line, if any. */
  memo: string | null;
  /** Times they had protein today. */
  protein: number;
}

type Open = null | "mood" | "clock" | "record" | "memo" | "yaongi";

const ACCENT: Record<Cat, string> = {
  yangcho: "var(--color-clay-berry)",
  towee: "var(--color-clay-sky)",
};

export function TodayView({
  dayLabel,
  cats,
  line,
  myCat,
  myName,
  items,
  needsClaim = false,
}: {
  needsClaim?: boolean;
  dayLabel: string;
  cats: TodayCat[];
  line: string;
  myCat: Cat;
  myName: string;
  items: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [cheer, setCheer] = useState<string | null>(null);
  const [hop, setHop] = useState(0);
  const [, startTransition] = useTransition();

  // My own card answers a tap at once; the server catches up behind it.
  const [mine, patchMine] = useOptimistic(
    cats.find((c) => c.isMe)!,
    (state: TodayCat, patch: Partial<TodayCat>) => ({ ...state, ...patch }),
  );
  const shown = cats.map((c) => (c.isMe ? mine : c));

  const close = useCallback(() => setOpen(null), []);
  const done = useCallback(() => setCheer(null), []);

  const pickMood = (mood: MoodId) => {
    setOpen(null);
    setHop((n) => n + 1);
    setCheer(`오늘은 ${moodOf(mood)!.emoji} ${moodOf(mood)!.label}`);
    startTransition(async () => {
      patchMine({ mood });
      await chooseMood(mood);
    });
  };

  return (
    <main className="page-in mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-28">
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs text-clay-ink-soft">{dayLabel}</span>
          <h1 className="text-3xl text-clay-ink" style={{ fontFamily: "var(--font-display)" }}>
            Today
          </h1>
        </div>
        {/* Yaongi is not a tab (brief §3): it is this cat in the corner. */}
        <button
          type="button"
          onClick={() => setOpen("yaongi")}
          aria-label="야옹이 — 아이템과 설정"
          className="press grid h-12 w-12 place-items-center rounded-full"
        >
          <ImageSlot id="yaongi-button" size={44} cat={myCat} />
        </button>
      </header>

      {needsClaim ? <Welcome /> : null}

      {/* The two of us. 양초 left, 토위 right, always. */}
      <section aria-label="오늘 우리" className="mt-6 grid grid-cols-2 gap-3">
        {shown.map((c) => (
          <CatCard
            key={c.cat}
            c={c}
            hop={c.isMe ? hop : 0}
            onMood={c.isMe ? () => setOpen("mood") : undefined}
            onClock={c.isMe ? () => setOpen("clock") : undefined}
            onProtein={
              c.isMe
                ? () => {
                    const next = Math.min(20, mine.protein + 1);
                    setCheer(`🥚 오늘 ${next}번`);
                    startTransition(async () => {
                      patchMine({ protein: next });
                      await countProtein(1);
                    });
                  }
                : undefined
            }
          />
        ))}
      </section>

      {/* The cat's one line. */}
      <div className="bubble-in relative mt-6 flex items-start gap-3">
        <ImageSlot id="cat-speaker" size={40} emoji="🐈" />
        <p
          className="relative min-w-0 flex-1 px-4 py-3 text-base break-words text-clay-ink"
          style={{
            fontFamily: "var(--font-display)",
            background: "var(--color-clay-card)",
            borderRadius: "6px var(--radius-clay) var(--radius-clay) var(--radius-clay)",
            boxShadow: "var(--shadow-clay)",
          }}
        >
          {line}
        </p>
      </div>

      <div className="flex-1" />

      {/* 충돌 1: present but quiet — small, at the bottom, and it says nothing
          if nobody presses it. */}
      <div className="mt-10 flex justify-center">
        <button
          type="button"
          onClick={() => setOpen("record")}
          className="press flex min-h-11 items-center gap-2 px-5 py-2.5 text-sm font-semibold"
          style={{
            color: "var(--color-clay-berry)",
            background: "var(--color-clay-card)",
            borderRadius: "var(--radius-clay-pill)",
            boxShadow: "var(--shadow-clay)",
          }}
        >
          <span aria-hidden>✏️</span> 오늘 기록하기
        </button>
      </div>

      <Sheet open={open === "mood"} onClose={close} title="오늘 기분">
        <MoodPicker current={mine.mood} onPick={pickMood} />
      </Sheet>

      <Sheet open={open === "clock"} onClose={close} title="퇴근 시간">
        <ClockPicker
          me={mine}
          onSave={(minute) => {
            setOpen(null);
            setCheer(`${clockLabel(minute)}에 나가요`);
            startTransition(async () => {
              patchMine({ leaveMinute: minute });
              await chooseLeaveTime(minute);
            });
          }}
          onLeft={() => {
            setOpen(null);
            setHop((n) => n + 1);
            setCheer("수고했어요! 🏃");
            startTransition(async () => {
              patchMine({ leftAt: "지금" });
              await leftWork();
            });
          }}
          onUndo={() => {
            setOpen(null);
            startTransition(async () => {
              patchMine({ leftAt: null });
              await undoLeftWork();
            });
          }}
        />
      </Sheet>

      <Sheet open={open === "record"} onClose={close} title="오늘 기록하기">
        <ul className="flex flex-col gap-3">
          <RecordChoice emoji="😊" label="오늘 기분" onClick={() => setOpen("mood")} />
          <RecordChoice emoji="🏃" label="운동 기록" onClick={() => router.push("/workout?new=1")} />
          <RecordChoice emoji="✏️" label="한 줄 메모" onClick={() => setOpen("memo")} />
        </ul>
      </Sheet>

      <Sheet open={open === "memo"} onClose={close} title="한 줄 메모">
        <MemoForm
          initial={mine.memo ?? ""}
          onSave={(body) => {
            setOpen(null);
            setCheer(body.trim() ? "메모했어요 ✏️" : "메모를 지웠어요");
            startTransition(async () => {
              patchMine({ memo: body.trim() || null });
              await saveMemo(body);
            });
          }}
        />
      </Sheet>

      <Sheet open={open === "yaongi"} onClose={close} title="야옹이">
        <YaongiSheet myCat={myCat} myName={myName} unlocked={items} />
      </Sheet>

      <Celebrate message={cheer} onDone={done} />
    </main>
  );
}

/**
 * The short welcome (brief §1 "온보딩은 짧은 환영 한 장"): shown only until we
 * know which cat this person is — when the Google name was not 양초 or 토위.
 * One tap, once; the other one's cat is settled by the same answer.
 */
function Welcome() {
  const [pending, startTransition] = useTransition();
  return (
    <section
      aria-labelledby="welcome-title"
      className="toast-in mt-5 flex flex-col items-center gap-4 px-5 py-5 text-center"
      style={{ background: "var(--color-clay-card)", borderRadius: "var(--radius-clay-lg)", boxShadow: "var(--shadow-clay-lift)" }}
    >
      <h2 id="welcome-title" className="text-xl text-clay-ink" style={{ fontFamily: "var(--font-display)" }}>
        어서 와요! 나는 누구예요?
      </h2>
      <div className="flex w-full gap-3">
        {(["yangcho", "towee"] as Cat[]).map((cat) => (
          <button
            key={cat}
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => claimCat(cat))}
            className="press flex min-h-24 flex-1 flex-col items-center justify-center gap-2 py-3 text-base font-semibold text-clay-ink disabled:opacity-50"
            style={{
              borderRadius: "var(--radius-clay)",
              background: `color-mix(in srgb, ${ACCENT[cat]} 12%, white)`,
              boxShadow: `inset 0 0 0 2px ${ACCENT[cat]}`,
            }}
          >
            <ImageSlot id={CAT_FACE_ID[cat]} size={48} cat={cat} />
            {cat === "yangcho" ? "양초" : "토위"}
          </button>
        ))}
      </div>
      <p className="text-xs text-clay-ink-soft">한 번만 물어봐요</p>
    </section>
  );
}

function CatCard({
  c,
  hop,
  onMood,
  onClock,
  onProtein,
}: {
  c: TodayCat;
  hop: number;
  onMood?: () => void;
  onClock?: () => void;
  onProtein?: () => void;
}) {
  const mood = moodOf(c.mood);
  const accent = ACCENT[c.cat];

  return (
    <article
      aria-label={`${c.name}${c.isMe ? " (나)" : ""}`}
      className="flex min-w-0 flex-col items-center gap-2 px-2 pt-4 pb-3"
      style={{
        background: "var(--color-clay-card)",
        borderRadius: "var(--radius-clay-lg)",
        boxShadow: `var(--shadow-clay), inset 0 3px 0 color-mix(in srgb, ${accent} 45%, transparent)`,
      }}
    >
      <div key={hop} className={hop ? "cat-hop relative" : "relative"}>
        <ImageSlot id={CAT_FACE_ID[c.cat]} size={72} cat={c.cat} label={`${c.name} 고양이`} />
        {/* The face of the day, pinned to the cat. Mine is a button. */}
        <MoodBadge mood={mood?.emoji ?? null} name={c.name} onClick={onMood} accent={accent} />
      </div>

      {/* The name may be cut; the "나" beside it never is. */}
      <span className="mt-1 flex max-w-full items-baseline gap-1 text-sm font-semibold text-clay-ink">
        <span className="min-w-0 truncate">{c.name}</span>
        {c.isMe ? <span className="shrink-0 text-xs font-normal text-clay-ink-soft">나</span> : null}
      </span>

      <OffworkChip c={c} onClick={onClock} />
      <ProteinChip count={c.protein} name={c.name} onClick={onProtein} />
    </article>
  );
}

function MoodBadge({
  mood,
  name,
  onClick,
  accent,
}: {
  mood: string | null;
  name: string;
  onClick?: () => void;
  accent: string;
}) {
  const style: React.CSSProperties = {
    position: "absolute",
    right: -14,
    bottom: -10,
    width: 44,
    height: 44,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    fontSize: mood ? 26 : 18,
    background: "white",
    boxShadow: mood
      ? "var(--shadow-clay)"
      : `inset 0 0 0 2px color-mix(in srgb, ${accent} 40%, transparent)`,
    color: "var(--color-clay-ink-soft)",
  };
  const content = mood ?? (onClick ? "＋" : "…");
  if (!onClick) {
    return (
      <span style={style} role="img" aria-label={mood ? `${name}의 오늘 기분 ${mood}` : `${name}는 아직`}>
        {content}
      </span>
    );
  }
  return (
    <button type="button" onClick={onClick} style={style} className="press" aria-label={mood ? `내 기분 ${mood} 바꾸기` : "내 기분 고르기"}>
      {content}
    </button>
  );
}

function OffworkChip({ c, onClick }: { c: TodayCat; onClick?: () => void }) {
  const text = c.leftAt
    ? `🏃 ${c.leftAt === "지금" ? "방금" : c.leftAt} 나옴`
    : c.leaveMinute !== null
      ? `🏢 ${clockLabel(c.leaveMinute)}`
      : onClick
        ? "🏢 퇴근 시간"
        : "🏢 --:--";

  const style: React.CSSProperties = {
    fontFamily: "var(--font-display)",
    background: c.leftAt ? "color-mix(in srgb, var(--color-clay-apricot) 55%, white)" : "var(--color-clay-dawn)",
    borderRadius: "var(--radius-clay-pill)",
  };

  if (!onClick) {
    return (
      <span className="flex min-h-11 items-center px-3 text-base text-clay-ink tabular-nums" style={style}>
        {text}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`퇴근 시간: ${text.replace(/^\S+ /, "")}. 바꾸기`}
      className="press flex min-h-11 items-center px-3 text-base text-clay-ink tabular-nums"
      style={{ ...style, boxShadow: "inset 0 0 0 1.5px var(--color-clay-apricot)" }}
    >
      {text}
    </button>
  );
}

/**
 * 🥚 — one tap each time you eat some protein (PO, 2026-11-01). Just a count:
 * no grams, no foods. A mis-tap is undone with − on the day's Moments card.
 */
function ProteinChip({ count, name, onClick }: { count: number; name: string; onClick?: () => void }) {
  const style: React.CSSProperties = {
    fontFamily: "var(--font-display)",
    background: count > 0 ? "color-mix(in srgb, var(--color-clay-apricot) 60%, white)" : "var(--color-clay-dawn)",
    borderRadius: "var(--radius-clay-pill)",
  };
  if (!onClick) {
    return (
      <span className="flex min-h-11 items-center px-3 text-base text-clay-ink tabular-nums" style={style} aria-label={`${name} 단백질 ${count}번`}>
        🥚 {count}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`단백질 먹었어요 (오늘 ${count}번). 한 번 더`}
      className="press flex min-h-11 items-center gap-1 px-3 text-base text-clay-ink tabular-nums"
      style={{ ...style, boxShadow: "inset 0 0 0 1.5px var(--color-clay-apricot)" }}
    >
      🥚 {count}
      <span className="text-xs text-clay-ink-soft">＋</span>
    </button>
  );
}

function MoodPicker({ current, onPick }: { current: MoodId | null; onPick: (m: MoodId) => void }) {
  return (
    <ul className="grid grid-cols-3 gap-3 pb-2">
      {MOODS.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onPick(m.id)}
            aria-pressed={current === m.id}
            className="press flex w-full flex-col items-center gap-1 py-3"
            style={{
              background: current === m.id ? "var(--color-clay-blush)" : "var(--color-clay-card)",
              borderRadius: "var(--radius-clay)",
              boxShadow:
                current === m.id ? "inset 0 0 0 2px var(--color-clay-rose), var(--shadow-clay)" : "var(--shadow-clay)",
            }}
          >
            <span className="text-4xl" aria-hidden>
              {m.emoji}
            </span>
            <span className="text-sm text-clay-ink">{m.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ClockPicker({
  me,
  onSave,
  onLeft,
  onUndo,
}: {
  me: TodayCat;
  onSave: (minute: number) => void;
  onLeft: () => void;
  onUndo: () => void;
}) {
  const [minute, setMinute] = useState(me.leaveMinute ?? DEFAULT_LEAVE_MINUTE);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const tens = [0, 10, 20, 30, 40, 50];

  return (
    <div className="flex flex-col items-center gap-5 pb-2">
      <p className="text-sm text-clay-ink-soft">회사에서 나오는 시간</p>
      <div className="flex items-center gap-2">
        <Wheel
          label="시"
          values={hours}
          value={Math.floor(minute / 60)}
          onChange={(h) => setMinute((m) => h * 60 + (m % 60))}
          format={(h) => String(h).padStart(2, "0")}
        />
        <span className="text-2xl text-clay-ink" style={{ fontFamily: "var(--font-display)" }}>
          :
        </span>
        <Wheel
          label="분"
          values={tens}
          value={minute % 60}
          onChange={(mm) => setMinute((m) => Math.floor(m / 60) * 60 + mm)}
          format={(m) => String(m).padStart(2, "0")}
        />
      </div>
      <button
        type="button"
        onClick={() => LEAVE_MINUTES.includes(minute) && onSave(minute)}
        className="press min-h-12 w-full py-3 text-base font-semibold text-white"
        style={{ background: "var(--color-clay-berry)", borderRadius: "var(--radius-clay-pill)", boxShadow: "var(--shadow-clay-lift)" }}
      >
        {clockLabel(minute)}로 저장
      </button>
      {me.leftAt ? (
        <button type="button" onClick={onUndo} className="press min-h-11 px-4 text-sm text-clay-ink-soft underline underline-offset-4">
          아직 안 나왔어요 (되돌리기)
        </button>
      ) : (
        <button
          type="button"
          onClick={onLeft}
          className="press min-h-12 w-full py-3 text-base text-clay-ink"
          style={{ background: "var(--color-clay-dawn)", borderRadius: "var(--radius-clay-pill)", boxShadow: "inset 0 0 0 1.5px var(--color-clay-apricot)" }}
        >
          🏃 회사에서 나왔어요
        </button>
      )}
    </div>
  );
}

function RecordChoice({ emoji, label, onClick }: { emoji: string; label: string; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="press flex min-h-14 w-full items-center gap-4 px-5 py-3 text-left text-base text-clay-ink"
        style={{ background: "var(--color-clay-card)", borderRadius: "var(--radius-clay)", boxShadow: "var(--shadow-clay)" }}
      >
        <span className="text-3xl" aria-hidden>
          {emoji}
        </span>
        <span className="font-semibold">{label}</span>
      </button>
    </li>
  );
}

function MemoForm({ initial, onSave }: { initial: string; onSave: (body: string) => void }) {
  const [body, setBody] = useState(initial);
  return (
    <form
      className="flex flex-col gap-4 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(body);
      }}
    >
      <input
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={80}
        placeholder="오늘을 한 줄로…"
        aria-label="한 줄 메모"
        name="memo"
        autoComplete="off"
        enterKeyHint="done"
        className="field min-h-12 w-full px-4 text-base text-clay-ink outline-none"
        style={{
          fontFamily: "var(--font-letter)",
          fontSize: 20,
          background: "var(--color-clay-card)",
          borderRadius: "var(--radius-clay)",
          boxShadow: "inset 0 0 0 1.5px var(--color-clay-rose)",
        }}
      />
      <button
        type="submit"
        disabled={body.trim() === initial.trim()}
        className="press min-h-12 w-full py-3 text-base font-semibold text-white disabled:opacity-40"
        style={{ background: "var(--color-clay-berry)", borderRadius: "var(--radius-clay-pill)" }}
      >
        저장
      </button>
    </form>
  );
}

function YaongiSheet({ myCat, myName, unlocked }: { myCat: Cat; myName: string; unlocked: string[] }) {
  const have = new Set(unlocked);
  return (
    <div className="flex flex-col gap-6 pb-2">
      <section aria-label="내 고양이 소품" className="flex flex-col items-center gap-3">
        <ImageSlot id={CAT_FACE_ID[myCat]} size={88} cat={myCat} label={`${myName} 고양이`} />
        <p className="text-sm text-clay-ink-soft">운동할 때마다 작은 소품이 생겨요</p>
        <ul className="grid w-full grid-cols-4 gap-2">
          {ITEMS.map((item) => {
            const open = have.has(item.id);
            return (
              <li
                key={item.id}
                className="flex flex-col items-center gap-1 py-2"
                style={{
                  background: open ? "var(--color-clay-card)" : "transparent",
                  borderRadius: "var(--radius-clay-sm)",
                  boxShadow: open ? "var(--shadow-clay)" : "inset 0 0 0 1.5px var(--color-clay-apricot)",
                }}
              >
                <ImageSlot
                  id={imageIdOf(item)}
                  size={40}
                  emoji={open ? item.emoji : "🔒"}
                  label={open ? item.label : "아직 잠겨 있어요"}
                  className={open ? "" : "opacity-50"}
                />
                <span className="text-[11px] text-clay-ink-soft">{open ? item.label : "?"}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="설정" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-clay-ink-soft">설정</h3>
        <p className="text-sm text-clay-ink-soft">
          움직임은 폰의 &lsquo;동작 줄이기&rsquo; 설정을 따라요.
        </p>
        <form action={signOut}>
          <button
            type="submit"
            className="press min-h-11 w-full py-2 text-sm text-clay-ink"
            style={{ background: "var(--color-clay-card)", borderRadius: "var(--radius-clay-pill)", boxShadow: "var(--shadow-clay)" }}
          >
            이 폰에서 로그아웃
          </button>
        </form>
      </section>
    </div>
  );
}
