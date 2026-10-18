// 전체 일정을 "의미 있는 묶음"으로 보여 주기 위한 표시용 묶음 (표시 계층만).
// 계산 엔진의 세부 노드와 규칙은 그대로고, 여기서는 이미 계산된 노드를 묶어 주기만 해요.
// 모든 노드는 정확히 한 묶음에 들어가요. 완료·취소 기록은 노드(세부 단계) 단위로 그대로 남아요.
// 두 사람이 같은 시각이라도 서로 다른 행동이나 완료 상태면 합치지 않아요 (시각·상태·단계가 모두 같을 때만 합쳐요).
import type { PersonTimeSettings, TimeSettings } from '../../config/timeSettings';
import type { PersonId } from '../types';
import type { Minute } from '../time';
import type { Timeline, TimelineNode } from './types';

export type GroupKind = 'commute' | 'direct' | 'prep' | 'to_gym' | 'together_move' | 'workout' | 'after' | 'dinner' | 'post_meal_wait' | 'other';
export type GroupLane = PersonId | 'joint' | 'both';
/**
 * done: 세부 단계를 모두 실제로 기록 / skipped: 모두 건너뜀 / resolved: 기록과 건너뜀이 섞여 모두 정리됨 /
 * partial: 일부만 정리됨 / pending: 아직 없음 / blocked: 시각을 계산할 수 없음
 */
export type GroupState = 'done' | 'resolved' | 'partial' | 'pending' | 'skipped' | 'blocked';
/** 묶음 시각이 실제 기록인지 예상인지 (색이 아니라 글자로 구분하려고 따로 알려 줘요) */
export type TimeBasis = 'actual' | 'mixed' | 'estimate';

export type GroupRow = {
  node: TimelineNode;
  /** 환복·간식·짐 챙기기처럼 걸리는 시간(분). 설정에서 읽어요. 없으면 null */
  minutes: number | null;
};

export type TimelineGroup = {
  key: string;
  kind: GroupKind;
  lane: GroupLane;
  label: string;
  emoji: string;
  /** 보조 설명 (예: 운동 75분) */
  note: string | null;
  start: Minute | null;
  end: Minute | null;
  /** 아직 안 한 노드 중 추정(~)이 있는지 */
  approx: boolean;
  state: GroupState;
  timeBasis: TimeBasis;
  /** 눌러서 기록하는 세부 단계 수, 그중 실제로 기록한 수, 건너뛴 수 (건너뜀은 완료로 세지 않아요) */
  stepCount: number;
  doneCount: number;
  skippedCount: number;
  /** 예정 시각이 지났는데 실제로는 기록하지 않은 단계가 있는지 ("예상 시각 지남 · 실제 미확인") */
  overdue: boolean;
  /** 직접 기록이 꼭 필요한 단계(❤️ 시작, 운동 끝)가 아직 남아 있는지 */
  needsRecord: boolean;
  /** 먼저 준비돼서 기다리는 분 (가장 큰 값) */
  wait: number | null;
  /** 이 묶음에 속한 모든 노드 (표시하지 않는 구분점 포함) */
  nodes: TimelineNode[];
  /** 펼쳤을 때 보여 줄 세부 행 */
  rows: GroupRow[];
};

const PERSONS: readonly PersonId[] = ['yangcho', 'tawi'];

/** 단계 ID로 남은 이전 계획의 완료 기록(carried)도 같은 묶음에 넣기 위해 노드 ID로 맞춰요 */
const CANON: Record<string, string> = {
  depart_gym: 'depart_home',
  meet_at_gym: 'gym_ready',
  return_home: 'home_return',
  shower: 'shower_end',
  dinner_prep: 'dinner_prep_end',
  dinner: 'meal_end',
  start_together: 'joint_start',
  depart_together: 'joint_depart',
};

/** 눌러서 기록하지 않는 구분점: 묶음의 시작·끝만 알려 주고 펼친 목록에는 따로 보이지 않아요 */
const MARKERS = new Set(['prep_start', 'prep_end', 'depart_origin', 'joint_home', 'dinner_prep_start', 'meal_start']);

const PREP_MINUTES: Record<string, (s: PersonTimeSettings) => number> = {
  change_clothes: (s) => s.changeClothes,
  snack: (s) => s.snack,
  pack_own_bag: (s) => s.packBag,
  pack_partner_bag: (s) => s.packBagBHome,
};

const canon = (n: TimelineNode): string => CANON[n.id] ?? n.id;

function kindOf(n: TimelineNode, ctx: { jointDepart: boolean; direct: Record<PersonId, boolean> }): GroupKind {
  const id = canon(n);
  if (n.lane === 'joint') {
    if (id === 'joint_depart') return 'together_move';
    if (id === 'joint_start' || id === 'workout_end') return 'workout';
    if (id === 'post_meal_wait_end') return 'post_meal_wait';
    if (['joint_home', 'dinner_prep_start', 'dinner_prep_end', 'meal_start', 'meal_end'].includes(id)) return 'dinner';
    return 'other';
  }
  const p = n.lane as PersonId;
  switch (id) {
    case 'station_arrival':
    case 'company_departure':
      return ctx.direct[p] ? 'direct' : 'commute';
    case 'home_arrival':
      return 'commute';
    case 'prep_start':
    case 'change_clothes':
    case 'snack':
    case 'pack_own_bag':
    case 'pack_partner_bag':
    case 'prep_end':
      return 'prep';
    case 'depart_home':
      return 'to_gym';
    case 'depart_origin':
      return 'direct';
    case 'gym_ready':
      return ctx.jointDepart ? 'together_move' : ctx.direct[p] ? 'direct' : 'to_gym';
    case 'workout_end':
      return 'workout'; // 사람별 운동 끝도 "함께 운동" 묶음의 세부 행으로 보여요
    case 'shower_end':
    case 'home_return':
      return 'after';
    default:
      return 'other';
  }
}

const laneOfGroup = (kind: GroupKind, n: TimelineNode): GroupLane => (kind === 'together_move' || kind === 'workout' || kind === 'dinner' || kind === 'post_meal_wait' ? 'joint' : (n.lane as GroupLane));

const byTime = (a: TimelineNode, b: TimelineNode) => {
  if (a.time === null && b.time === null) return a.seq - b.seq;
  if (a.time === null) return 1;
  if (b.time === null) return -1;
  return a.time - b.time || a.seq - b.seq;
};

const signature = (nodes: TimelineNode[]) =>
  nodes.map((n) => [n.id, n.time, n.state, n.step?.id ?? '', n.carried ? 1 : 0, n.overdue ? 1 : 0, n.waitMinutes ?? 0, n.actual ?? '', n.expected ?? ''].join('|')).join(';');

export function groupTimeline(tl: Timeline, settings: TimeSettings): TimelineGroup[] {
  const ctx = {
    jointDepart: tl.nodes.some((n) => n.lane === 'joint' && canon(n) === 'joint_depart'),
    direct: { yangcho: false, tawi: false } as Record<PersonId, boolean>,
  };
  for (const p of PERSONS) {
    const mine = tl.nodes.filter((n) => n.lane === p);
    ctx.direct[p] = mine.some((n) => canon(n) === 'gym_ready') && !mine.some((n) => canon(n) === 'prep_end') && !ctx.jointDepart;
  }

  /* 1) 사람별/공동 묶음으로 나누기 */
  const buckets = new Map<string, { kind: GroupKind; lane: GroupLane; nodes: TimelineNode[] }>();
  for (const n of tl.nodes) {
    const kind = kindOf(n, ctx);
    const lane = laneOfGroup(kind, n);
    const k = `${lane}:${kind}`;
    const b = buckets.get(k) ?? { kind, lane, nodes: [] };
    b.nodes.push(n);
    buckets.set(k, b);
  }

  /* 2) 두 사람의 같은 종류 묶음이 시각·상태·단계가 모두 같을 때만 합치기 */
  const merged = new Map<string, { kind: GroupKind; lane: GroupLane; nodes: TimelineNode[] }>();
  const done = new Set<string>();
  for (const [k, b] of buckets) {
    if (done.has(k)) continue;
    if (b.lane === 'yangcho' || b.lane === 'tawi') {
      const otherLane: PersonId = b.lane === 'yangcho' ? 'tawi' : 'yangcho';
      const ok = `${otherLane}:${b.kind}`;
      const other = buckets.get(ok);
      if (other && !done.has(ok)) {
        const mine = [...b.nodes].sort(byTime);
        const theirs = [...other.nodes].sort(byTime);
        if (signature(mine) === signature(theirs)) {
          done.add(k);
          done.add(ok);
          merged.set(`both:${b.kind}`, { kind: b.kind, lane: 'both', nodes: [...b.nodes, ...other.nodes] });
          continue;
        }
      }
    }
    done.add(k);
    merged.set(k, b);
  }

  /* 3) 묶음 정보 만들기 */
  // 샤워·귀가 묶음의 시작은 그 사람(들)의 운동 끝이에요. 사람별로 다를 수 있어서 이 묶음에 속한 사람의 운동 끝 중 가장 이른 것을 써요.
  const endOf = (p: string): Minute | null => tl.nodes.find((n) => n.lane === p && n.id === 'workout_end' && !n.carried)?.time ?? null;
  const groups: TimelineGroup[] = [];
  for (const [key, b] of merged) {
    const nodes = [...b.nodes].sort(byTime);
    const times = nodes.map((n) => n.time).filter((t): t is Minute => t !== null);
    let start = times.length > 0 ? Math.min(...times) : null;
    const end = times.length > 0 ? Math.max(...times) : null;
    if (b.kind === 'after') {
      const owners = b.lane === 'both' ? ['yangcho', 'tawi'] : [b.lane as string];
      const ends = owners.map(endOf).filter((t): t is Minute => t !== null);
      if (ends.length > 0) {
        const e = Math.min(...ends);
        if (start === null || e < start) start = e;
      }
    }
    const steps = nodes.filter((n) => n.step !== null);
    const doneN = steps.filter((n) => n.state === 'done').length;
    const skippedN = steps.filter((n) => n.state === 'skipped').length;
    let state: GroupState;
    if (times.length === 0) state = 'blocked';
    else if (steps.length > 0 && doneN + skippedN === steps.length) state = skippedN === 0 ? 'done' : doneN === 0 ? 'skipped' : 'resolved';
    else if (doneN + skippedN > 0) state = 'partial';
    else state = 'pending';
    const timeBasis: TimeBasis = steps.length > 0 && doneN === steps.length ? 'actual' : doneN > 0 ? 'mixed' : 'estimate';
    const waits = nodes.map((n) => n.waitMinutes ?? 0);
    const rows: GroupRow[] = nodes
      .filter((n) => !MARKERS.has(canon(n)))
      .map((n) => ({
        node: n,
        minutes: n.lane !== 'joint' && PREP_MINUTES[canon(n)] ? PREP_MINUTES[canon(n)](settings[n.lane as PersonId]) : null,
      }));
    const { label, emoji, note } = describeGroup(b.kind, nodes, tl);
    groups.push({
      key,
      kind: b.kind,
      lane: b.lane,
      label,
      emoji,
      note,
      start,
      end,
      approx: nodes.some((n) => n.state !== 'done' && n.approx),
      state,
      timeBasis,
      stepCount: steps.length,
      doneCount: doneN,
      skippedCount: skippedN,
      overdue: nodes.some((n) => n.overdue),
      needsRecord: steps.some((n) => n.step!.required && n.state === 'pending'),
      wait: Math.max(...waits) > 0 ? Math.max(...waits) : null,
      nodes,
      rows,
    });
  }
  groups.sort((a, b) => {
    if (a.start === null && b.start === null) return a.nodes[0].seq - b.nodes[0].seq;
    if (a.start === null) return 1;
    if (b.start === null) return -1;
    return a.start - b.start || a.nodes[0].seq - b.nodes[0].seq;
  });
  return groups;
}

function describeGroup(kind: GroupKind, nodes: TimelineNode[], tl: Timeline): { label: string; emoji: string; note: string | null } {
  switch (kind) {
    case 'commute': {
      const hasCar = nodes.some((n) => canon(n) === 'company_departure');
      const hasOrigin = nodes.some((n) => canon(n) === 'station_arrival' || canon(n) === 'company_departure');
      return { label: hasOrigin ? '퇴근 → 집 도착' : '집 도착', emoji: hasCar ? '🚗' : hasOrigin ? '🚇' : '🏠', note: null };
    }
    case 'direct':
      return { label: '헬스장으로 직행', emoji: '🚇', note: null };
    case 'prep': {
      const post = nodes.some((n) => canon(n) === 'prep_start' && n.label.includes('식후'));
      return { label: post ? '식후 운동 준비' : '운동 준비', emoji: '🏠', note: null };
    }
    case 'to_gym':
      return { label: '헬스장으로 이동', emoji: '🚶', note: null };
    case 'together_move':
      return { label: '함께 헬스장으로', emoji: '🚶', note: null };
    case 'workout':
      return { label: '함께 운동', emoji: '❤️', note: `${tl.workoutMinutes}분` };
    case 'after':
      return { label: '샤워 · 귀가', emoji: '🚿', note: null };
    case 'dinner':
      return { label: '저녁 준비 · 식사', emoji: '🍽', note: null };
    case 'post_meal_wait':
      return { label: '식후 대기', emoji: '⏳', note: null };
    default:
      return { label: '기타', emoji: '•', note: null };
  }
}

