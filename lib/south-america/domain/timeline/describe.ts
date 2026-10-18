// 타임라인을 사람이 읽는 줄로 바꿔 줘요 (보고와 검토용). 계산에는 쓰지 않아요.
import { TIMELINE_RULES } from '../../config/timeSettings';
import { fmt, type Minute } from '../time';
import { PEOPLE } from '../types';
import type { DesiredEvaluation, EtaInput, EtaReference, Timeline } from './types';
import type { PersonId } from '../types';

const REF_LABEL: Record<EtaReference, string> = {
  station_arrival: '신도림역 도착',
  company_departure: '회사 출발',
  home_arrival: '집 도착',
  gym_ready: '헬스장 운동 가능',
  ready_at_home: '집에서 준비 시작 가능',
};

const who = (lane: string) => (lane === 'joint' ? '함께' : PEOPLE[lane as 'yangcho' | 'tawi'].name);

export function describeTimeline(tl: Timeline): string[] {
  if (tl.nodes.length === 0) return tl.blockers.map((b) => `⛔ ${b.message}`);
  return tl.nodes.map((n) => {
    const t = n.time === null ? '  --:--' : `${n.approx || n.source === 'computed' ? '~' : ' '}${fmt(n.time).padEnd(6)}`;
    const mark = n.time === null ? '⛔' : n.mark;
    return `${t} ${mark} ${who(n.lane).padEnd(2)}  ${n.label}  ← ${n.explain}`;
  });
}

export function describeDesired(d: DesiredEvaluation): string[] {
  const lines: string[] = [];
  lines.push(`희망 ${fmt(d.desired)} · 예상 ${d.expected === null ? '계산 불가' : `~${fmt(d.expected)}`}`);
  if (d.status === 'late') lines.push(`→ ${d.lateBy}분 늦어요 (일정은 앞당기지 않아요)`);
  else if (d.status === 'ok') lines.push(`→ 맞출 수 있어요 · 여유 ${d.slack}분`);
  if (d.latestStart !== undefined) lines.push(`늦어도 공동 시작 ${fmt(d.latestStart)}`);
  if (d.latestDepart !== undefined) lines.push(`늦어도 함께 출발 ${fmt(d.latestDepart)}`);
  if (d.latestHomeBoth !== undefined) lines.push(`두 사람 모두 늦어도 집 도착 ${fmt(d.latestHomeBoth)}`);
  if (d.earliestStart !== undefined) lines.push(`희망대로 먹으면 공동 시작은 빨라야 ${fmt(d.earliestStart)}`);
  for (const l of d.limits) {
    const note = l.slack === null ? '입력 없음' : l.slack < 0 ? `${-l.slack}분 늦음` : `${l.slack}분 여유`;
    lines.push(`  ${PEOPLE[l.person].name} 늦어도 ${REF_LABEL[l.reference]} ${fmt(l.latest)} (${l.actual === null ? '현재 입력 없음' : `현재 ${fmt(l.actual)}`}, ${note})`);
  }
  return lines;
}

/* ───────── 저녁 안내 한 줄 (화면용) ───────── */

export type DinnerTone = 'none' | 'same' | 'neutral' | 'late' | 'early';

export type DinnerLine = {
  /** 예: "저녁 22:05부터 가능" */
  headline: string;
  /** 예: "희망 22:00 · 5분 늦음" (희망이 없으면 null) */
  detail: string | null;
  tone: DinnerTone;
  /** 희망보다 일찍 먹을 수 있어서 [가장 빠르게 먹기]를 보여 줄지 */
  canEatEarlier: boolean;
};

/**
 * 희망 저녁 시각과 예상(가능한 가장 빠른 시각)을 의미가 분명한 말로 한 줄에 정리해요.
 * 부호(+5분) 대신 "5분 늦음", "20분 일찍 가능", "희망 시각과 같음"으로 써요.
 * 차이가 작으면(설정값 미만) 경고 없이 중립(neutral)으로 알려요.
 */
export function describeDinnerLine(expected: Minute | null, desired: Minute | null): DinnerLine {
  if (expected === null) {
    return { headline: '저녁 시각을 아직 계산할 수 없어요', detail: desired === null ? null : `희망 ${fmt(desired)}`, tone: 'none', canEatEarlier: false };
  }
  const head = `저녁 ${fmt(expected)}부터 가능`;
  if (desired === null) return { headline: head, detail: null, tone: 'none', canEatEarlier: false };
  const diff = expected - desired;
  if (diff === 0) return { headline: head, detail: '희망 시각과 같음', tone: 'same', canEatEarlier: false };
  if (diff > 0) {
    return { headline: head, detail: `희망 ${fmt(desired)} · ${diff}분 늦음`, tone: diff < TIMELINE_RULES.smallDifferenceMinutes ? 'neutral' : 'late', canEatEarlier: false };
  }
  return {
    headline: `${fmt(expected)}부터 식사 가능`,
    detail: `희망 ${fmt(desired)} · ${-diff}분 일찍 가능`,
    tone: 'early',
    canEatEarlier: true,
  };
}

/* ───────── PLAN B 직행자 설명 (입력 조건에 맞춰요) ───────── */

export type DirectGymNote = { ok: boolean; text: string };

/**
 * PLAN B에서 집 담당이 아닌 사람(직행자)의 헬스장 시각이 어떻게 정해졌는지 말해 줘요.
 * 직접 입력 / 지하철(역 도착+설정) / 자동차 / 이미 집 / 입력 없음 중 실제 조건에 맞는 설명만 써요.
 */
export function describeDirectGym(tl: Timeline, eta: Record<PersonId, EtaInput[]>): DirectGymNote | null {
  if (tl.plan !== 'B' || !tl.homePerson) return null;
  const z: PersonId = tl.homePerson === 'yangcho' ? 'tawi' : 'yangcho';
  const nm = PEOPLE[z].name;
  const used = tl.inputsUsed.directGym;
  if (used) {
    const t = `${fmt(used.resolved)}`;
    if (!used.derived) return { ok: true, text: `${nm}는 헬스장에서 운동 가능한 시각을 직접 넣어서(${t}) 그 시각을 써요. 이동·준비가 이미 들어 있어서 더하지 않아요.` };
    const off = used.resolved - used.time;
    return {
      ok: true,
      text: used.reference === 'station_arrival'
        ? `${nm}는 집을 거치지 않고 신도림역 ${fmt(used.time)} + 헬스장 이동 ${off}분 = ${t}에 헬스장에서 운동할 수 있다고 계산해요 (설정값).`
        : `${nm}는 회사 출발 ${fmt(used.time)} + 헬스장 이동 ${off}분 = ${t}로 계산해요 (설정값).`,
    };
  }
  const list = eta[z];
  if (list.some((e) => e.reference === 'company_departure')) return { ok: false, text: `${nm}는 자동차라서 회사→헬스장 시간을 몰라요. 헬스장 운동 가능 시각을 직접 넣어야 PLAN B를 계산할 수 있어요.` };
  if (list.some((e) => e.reference === 'home_arrival' || e.reference === 'ready_at_home')) return { ok: false, text: `${nm}는 집(도착)으로 입력돼 있어서 직행 시각을 계산할 수 없어요. 헬스장 운동 가능 시각을 직접 넣어야 해요.` };
  return { ok: false, text: `${nm}의 신도림역 도착 또는 헬스장 운동 가능 시각을 넣으면 PLAN B를 계산해요.` };
}
