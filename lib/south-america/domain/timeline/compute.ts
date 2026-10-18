// 자동 타임라인: 순방향 계산 + 재계산 (06 문서 11-3, 11-6).
// 순수 계산이에요. 화면, 저장, 현재 시각을 모르고, 같은 입력은 항상 같은 결과를 만들어요.
// 분 단위 숫자는 모두 입력 설정(settings)에서 읽어요. 이 파일에는 시간 값이 없어요.
//
// 재계산 원칙 (2-3)
// - 완료한 단계는 "실제 시각"으로 고정돼요. ETA·PLAN·운동 시간이 바뀌어도 바꾸지 않아요 [D-037].
// - 아직 안 한 단계만 마지막 완료 시각 뒤로 이어서 계산해요 (남은 단계 시간만 더해요).
// - 건너뛴 단계는 시간에서 빼요.
// - 현재 시각(now)은 "지남" 표시에만 써요. 시계가 흘러도 시각은 저절로 바뀌지 않아요 [P-147].
// - 사용자가 [지금 기준으로 다시 계산]을 눌렀다면(floorAt), 아직 안 한 단계는 그 시각보다 앞설 수 없어요.
import { PEOPLE, otherPerson, type PersonId } from '../types';
import { fmt, formatClock, type Minute } from '../time';
import { TIMELINE_RULES, resolveSharedTimes, validateTimeSettings } from '../../config/timeSettings';
import { describeSteps, prepSteps, type PrepStep } from './rules';
import { evaluateDesired } from './desired';
import { STEPS } from './steps';
import type {
  Blocker,
  EtaInput,
  EtaReference,
  InputBasis,
  InputSource,
  Notice,
  NodeLane,
  NodeMark,
  NodeSource,
  StepId,
  StepInfo,
  StepRecord,
  Timeline,
  TimelineInput,
  TimelineNode,
} from './types';

const PERSONS: readonly PersonId[] = ['yangcho', 'tawi'];
const name = (p: PersonId) => PEOPLE[p].name;

/** 계산 중에 들고 다니는 값: 시각, 가장 약한 입력 출처, 의존한 노드들 */
type Val = { t: Minute; w: InputSource; deps: string[] };

const RANK: Record<InputSource, number> = { self: 0, phone: 1, partner: 2, default: 3 };
const weaker = (a: InputSource, b: InputSource): InputSource => (RANK[a] >= RANK[b] ? a : b);
/** 사람이 직접 넣은 값(✅ 📞)이 계산보다 먼저, 상대 추정(🙋), 기본값(📌) 순 */
const tier = (s: InputSource) => (s === 'self' || s === 'phone' ? 0 : s === 'partner' ? 1 : 2);
const MARK_BY_INPUT: Record<InputSource, NodeMark> = { self: '✅', phone: '📞', partner: '🙋', default: '📌' };
const SOURCE_LABEL: Record<InputSource, string> = { self: '본인 입력', phone: '통화로 확인', partner: '상대 추정', default: '기본값' };
const NODE_SOURCE: Record<InputSource, NodeSource> = {
  self: 'input_self',
  phone: 'input_phone',
  partner: 'input_partner',
  default: 'default',
};
const key = (lane: NodeLane, id: string) => `${lane}.${id}`;
const uniq = (xs: string[]) => [...new Set(xs)];

const addV = (v: Val, minutes: number): Val => ({ t: v.t + minutes, w: v.w, deps: v.deps });
const maxV = (vs: Val[]): Val => ({
  t: Math.max(...vs.map((v) => v.t)),
  // 결과는 모든 입력이 바뀔 수 있는 만큼 의존해요. 가장 약한 출처를 따라가요.
  w: vs.map((v) => v.w).reduce(weaker),
  deps: uniq(vs.flatMap((v) => v.deps)),
});

const REFERENCE_LABEL: Record<EtaReference, string> = {
  station_arrival: '신도림역 도착',
  company_departure: '회사 출발',
  home_arrival: '집 도착',
  gym_ready: '헬스장 운동 가능',
  ready_at_home: '집에서 준비 시작 가능',
};

/* ───────── 집 도착과 직행 시각 후보 ───────── */

/** 입력 시각에서 이어 붙이는 분(offset)이 있으면 derived예요. 실제로 눌러 기록한 시각이 있으면 그 시각에서 이어요. */
type Candidate = { eta: EtaInput; derived: boolean; offset: number; offsetLabel: string };

const rankCandidates = (cs: Candidate[]): Candidate[] =>
  [...cs].sort((a, b) => tier(a.eta.source) - tier(b.eta.source) || Number(a.derived) - Number(b.derived));

/** 한 사람의 집 도착 후보. 직접 입력이 계산보다 먼저예요. 다른 장소의 입력(헬스장 준비 완료 등)은 쓰지 않아요. */
export function homeCandidates(input: Pick<TimelineInput, 'eta' | 'settings'>, p: PersonId): Candidate[] {
  const s = input.settings[p];
  const out: Candidate[] = [];
  for (const eta of input.eta[p]) {
    if (!Number.isFinite(eta.time)) continue;
    if (eta.reference === 'home_arrival' || eta.reference === 'ready_at_home') {
      out.push({ eta, derived: false, offset: 0, offsetLabel: '' });
    } else if (eta.reference === 'station_arrival') {
      out.push({ eta, derived: true, offset: s.stationToHome, offsetLabel: `신도림역→집 ${s.stationToHome}분` });
    } else if (eta.reference === 'company_departure' && s.carCompanyToHome !== null) {
      out.push({ eta, derived: true, offset: s.carCompanyToHome, offsetLabel: `회사→집 ${s.carCompanyToHome}분 (설정값)` });
    }
  }
  return rankCandidates(out);
}

/** 직행하는 사람의 "헬스장 운동 가능" 후보. 이동시간 설정이 없으면 계산하지 않아요 [D-154]. */
function gymCandidates(input: TimelineInput, p: PersonId): Candidate[] {
  const s = input.settings[p];
  const out: Candidate[] = [];
  for (const eta of input.eta[p]) {
    if (!Number.isFinite(eta.time)) continue;
    if (eta.reference === 'gym_ready') {
      out.push({ eta, derived: false, offset: 0, offsetLabel: '' });
    } else if (eta.reference === 'station_arrival' && s.stationToGymDirect !== null) {
      out.push({ eta, derived: true, offset: s.stationToGymDirect, offsetLabel: `역→헬스장 직행 ${s.stationToGymDirect}분 (설정값)` });
    } else if (eta.reference === 'company_departure' && s.carCompanyToGym !== null) {
      out.push({ eta, derived: true, offset: s.carCompanyToGym, offsetLabel: `회사→헬스장 ${s.carCompanyToGym}분 (설정값)` });
    }
  }
  return rankCandidates(out);
}

/** 이 사람이 집에 도착할 시각(분). 계산할 수 없으면 null. 플랜 비교에서 "먼저 집에 도착한 사람"을 정할 때 써요. */
export function resolveHomeArrival(input: Pick<TimelineInput, 'eta' | 'settings'>, p: PersonId): Minute | null {
  const c = homeCandidates(input, p)[0];
  return c ? c.eta.time + c.offset : null;
}

/* ───────── 타임라인 계산 ───────── */

export function computeTimeline(input: TimelineInput): Timeline {
  const nodes: TimelineNode[] = [];
  const blockers: Blocker[] = [];
  const notices: Notice[] = [];
  const inputsUsed: Timeline['inputsUsed'] = { home: {} };
  const homePerson: PersonId | null = input.plan === 'B' ? (input.homePerson ?? null) : null;
  const records = input.actuals?.steps ?? {};
  const now = input.now ?? null;
  const floor = input.floorAt ?? null;
  const usedRecords = new Set<string>();
  let seq = 0;

  const emptySummary = { jointStart: null, workoutEnd: null, homeReturn: null, mealStart: null, mealEnd: null };
  const locked = records[key('joint', 'start_together')]?.status === 'done';
  const early = (b: Blocker): Timeline => ({
    plan: input.plan,
    homePerson,
    mealOrder: input.mealOrder,
    workoutMinutes: input.workoutMinutes,
    status: 'blocked',
    locked,
    overdueCount: 0,
    nodes: [],
    blockers: [b],
    notices: [],
    summary: emptySummary,
    inputsUsed,
  });

  /* 입력 점검: 틀린 입력이면 계산하지 않고 이유를 알려요 */
  const issues = validateTimeSettings(input.settings);
  if (issues.length > 0) {
    return early({ code: 'invalid_settings', message: `시간 설정이 올바르지 않아요: ${issues[0].person}.${issues[0].key}` });
  }
  if (!TIMELINE_RULES.workoutOptions.includes(input.workoutMinutes)) {
    return early({ code: 'invalid_workout_minutes', message: `운동 시간은 ${TIMELINE_RULES.workoutOptions.join('·')}분 중에서 골라요` });
  }
  if (input.plan === 'B') {
    if (!input.homePerson) return early({ code: 'home_person_required', message: 'PLAN B는 집 담당을 정해야 해요' });
    if (input.mealOrder === 'before') {
      return early({ code: 'dinner_first_requires_plan_a', message: '저녁을 먼저 먹는 날은 집에서 함께 출발하는 PLAN A만 가능해요' });
    }
  }

  const s = input.settings;
  const shared = resolveSharedTimes(s);
  const W = input.workoutMinutes;
  const recOf = (lane: NodeLane, step: StepId): StepRecord | undefined => records[key(lane, step)];

  /**
   * 노드 만들기. 만들면서 세 가지를 지켜요.
   * 1) 계산한 시각은 추정(🧮)이고, 사람이 넣거나 눌러서 기록한 시각만 확정이에요 [D-032, P-148]
   * 2) 완료 기록이 있으면 그 실제 시각으로 고정해요. 위쪽 계산이 바뀌어도 바꾸지 않아요 [D-037]
   * 3) 건너뛴 단계는 표시만 하고 시간에서 빼요 (호출하는 쪽에서 처리)
   */
  function emit(
    id: string,
    lane: NodeLane,
    label: string,
    v: Val | null,
    explain: string,
    opt: { input?: InputSource; wait?: number; step?: StepInfo; assumePassed?: boolean } = {},
  ): Val | null {
    const k = key(lane, id);
    const step = opt.step ?? null;
    const rec = step ? recOf(lane, step.id) : undefined;
    if (step) usedRecords.add(key(lane, step.id));
    // 집에 이미 도착했다고 기록했다면 그 앞의 "역 도착·회사 출발"은 지나간 일이라 따로 누르지 않아도 건너뛴 것으로 봐요
    const implicitlyPassed = opt.assumePassed === true && rec === undefined;
    const base = {
      key: k, id, lane, step, seq: seq++, overdue: false, carried: false,
    };

    if (rec?.status === 'done' && rec.time !== null) {
      // 완료한 단계의 "예상"은 누른 순간 계산이 말하던 값이에요. 지금 다시 계산한 값이 아니에요 (이어 붙이는 계산의 중간값이라 달라질 수 있어요)
      const expected = rec.expectedAtDone ?? v?.t ?? null;
      const { hhmm, dayOffset } = formatClock(rec.time);
      const diff = expected === null ? null : rec.time - expected;
      const gap = diff === null || diff === 0 ? '' : ` (예상 ${fmt(expected as number)}보다 ${Math.abs(diff)}분 ${diff > 0 ? '늦게' : '일찍'})`;
      nodes.push({
        ...base, label, time: rec.time, clock: hhmm, dayOffset, state: 'done',
        expected, actual: rec.time, source: 'actual', confirmed: true, approx: false, mark: '✅',
        weakestInput: 'self', dependsOnUnconfirmed: false, dependsOn: [],
        explain: `${fmt(rec.time)}에 완료했어요${gap}`,
      });
      return { t: rec.time, w: 'self', deps: [k] };
    }
    if (v === null) {
      nodes.push({
        ...base, label, time: null, clock: null, dayOffset: null, state: 'blocked',
        expected: null, actual: null, source: 'computed', confirmed: false, approx: false, mark: '🧮',
        weakestInput: null, dependsOnUnconfirmed: false, dependsOn: [], explain,
      });
      return null;
    }
    const inputSource = opt.input;
    const skipped = rec?.status === 'skipped' || implicitlyPassed;
    let t = v.t;
    // 다시 계산한 시각보다 앞설 수 없어요: 직접 넣은 ETA 입력은 그대로 두고, 아직 안 한 계산 단계에만 적용
    if (!skipped && !inputSource && step !== null && floor !== null) t = Math.max(t, floor);
    const confirmed = inputSource === 'self' || inputSource === 'phone';
    const { hhmm, dayOffset } = formatClock(t);
    nodes.push({
      ...base, label, time: t, clock: hhmm, dayOffset, state: skipped ? 'skipped' : 'pending',
      expected: t, actual: null,
      source: inputSource ? NODE_SOURCE[inputSource] : 'computed',
      confirmed,
      approx: inputSource ? inputSource === 'partner' : true,
      mark: inputSource ? MARK_BY_INPUT[inputSource] : '🧮',
      weakestInput: v.w,
      dependsOnUnconfirmed: v.w === 'partner' || v.w === 'default',
      dependsOn: inputSource ? [] : v.deps,
      explain: implicitlyPassed ? `집에 도착해서 지나간 단계로 봐요` : skipped ? `건너뛰었어요 (${label} 시간은 계산에서 뺐어요)` : explain,
      waitMinutes: opt.wait,
    });
    return { t, w: v.w, deps: [k] };
  }
  /** 계산할 수 없는 노드. 하지만 이미 눌러 기록한 단계라면 그 실제 시각을 돌려줘서 뒤쪽 계산을 이어갈 수 있어요 */
  const blockedNode = (id: string, lane: NodeLane, label: string, why: string, step?: StepInfo): Val | null =>
    emit(id, lane, label, null, why, { step });

  /* 입력 노드 + 집 도착 */
  function resolveHome(p: PersonId): Val | null {
    const best = homeCandidates(input, p)[0];
    const homeDone = recOf(p, 'home_arrival')?.status === 'done';
    if (!best && !homeDone) {
      const hasCar = input.eta[p].some((e) => e.reference === 'company_departure');
      if (hasCar && s[p].carCompanyToHome === null) {
        blockers.push({
          code: 'car_travel_time_unset',
          person: p,
          message: `${name(p)}의 자동차 회사→집 시간이 설정에 없어요. 집 도착 예상 시각을 직접 넣거나 설정에 시간을 넣어 주세요`,
          needs: ['home_arrival', 'gym_ready'],
          setting: 'carCompanyToHome',
        });
      } else {
        blockers.push({ code: 'eta_missing', person: p, message: `${name(p)}의 ETA(신도림역 도착 등)가 없어요`, needs: ['station_arrival', 'home_arrival'] });
      }
      blockedNode('home_arrival', p, STEPS.home_arrival.label, '입력이 없어서 계산할 수 없어요', STEPS.home_arrival);
      return null;
    }
    if (!best) {
      // 입력은 없지만 집 도착을 눌러 기록했다면 그 실제 시각으로 계속해요
      return emit('home_arrival', p, STEPS.home_arrival.label, null, '', { step: STEPS.home_arrival });
    }
    const eta = best.eta;
    inputsUsed.home[p] = { reference: eta.reference, time: eta.time, source: eta.source, derived: best.derived, resolved: eta.time + best.offset } satisfies InputBasis;
    const inputExplain = `${name(p)} ${REFERENCE_LABEL[eta.reference]} ${fmt(eta.time)} (${SOURCE_LABEL[eta.source]})`;
    if (!best.derived) {
      const label = eta.reference === 'ready_at_home' ? '집에서 준비 시작 가능' : STEPS.home_arrival.label;
      return emit('home_arrival', p, label, { t: eta.time, w: eta.source, deps: [] }, inputExplain, { input: eta.source, step: STEPS.home_arrival });
    }
    const inputStep = eta.reference === 'company_departure' ? STEPS.company_departure : STEPS.station_arrival;
    const inp = emit(eta.reference, p, REFERENCE_LABEL[eta.reference], { t: eta.time, w: eta.source, deps: [] }, inputExplain, { input: eta.source, step: inputStep, assumePassed: homeDone })!;
    return emit('home_arrival', p, STEPS.home_arrival.label, { t: inp.t + best.offset, w: inp.w, deps: inp.deps }, `${fmt(inp.t)} + ${best.offsetLabel}`, { step: STEPS.home_arrival });
  }

  /* 집 준비: 완료한 단계는 실제 시각, 남은 단계만 마지막 완료 시각 뒤로 이어서 더해요 [P-142] */
  function emitPrepChain(p: PersonId, home: Val, kind: 'a' | 'b_home' | 'post_meal', startLabel: string): Val {
    const steps = prepSteps(s[p], kind);
    const stepIdOf = (st: PrepStep): StepId => (st.id === 'change' ? 'change_clothes' : st.id === 'snack' ? 'snack' : kind === 'b_home' ? 'pack_partner_bag' : 'pack_own_bag');
    const doneVals: Val[] = [];
    for (const st of steps) {
      const r = recOf(p, stepIdOf(st));
      if (r?.status === 'done' && r.time !== null) doneVals.push({ t: r.time, w: 'self', deps: [key(p, stepIdOf(st))] });
    }
    const startV = emit('prep_start', p, startLabel, home, kind === 'post_meal' ? '식사가 끝나면 준비를 시작해요' : '집에 도착하면 준비를 시작해요')!;
    const anchor = doneVals.length > 0 ? maxV([startV, ...doneVals]) : startV;
    let cursor = anchor;
    const remaining: PrepStep[] = [];
    for (const st of steps) {
      const sid = stepIdOf(st);
      const info = STEPS[sid];
      const r = recOf(p, sid);
      if (r?.status === 'done' && r.time !== null) {
        emit(sid, p, info.label, cursor, '', { step: info });
      } else if (r?.status === 'skipped') {
        emit(sid, p, info.label, cursor, '', { step: info });
      } else {
        remaining.push(st);
        cursor = emit(sid, p, info.label, addV(cursor, st.minutes), `${fmt(cursor.t)} + ${info.label} ${st.minutes}분`, { step: info })!;
      }
    }
    const untouched = remaining.length === steps.length;
    const explain = untouched
      ? `${fmt(startV.t)} + ${describeSteps(steps)}`
      : `마지막 완료 ${fmt(anchor.t)} + 남은 단계 ${remaining.length === 0 ? '없음' : describeSteps(remaining)}`;
    return emit('prep_end', p, '운동 준비 끝', cursor, explain)!;
  }

  const setWait = (k: string, wait: number) => {
    const n = nodes.find((x) => x.key === k);
    if (n && wait > 0 && n.state !== 'done') {
      n.waitMinutes = wait;
      n.explain += ` (먼저 끝나서 ${wait}분 기다려요)`;
    }
  };

  /* 운동 끝 이후: 샤워(헬스장) → 귀가. 저녁 순서에 따라 이어져요.
   * 운동 끝은 사람마다 따로예요 [D-167]: 실제 완료 기록이 있으면 그 실제 시각, 없으면 "시작 + 운동 시간"(예상).
   * 예상을 실제 완료로 자동 확정하지 않고, 각자의 샤워·귀가는 각자의 운동 끝에서 이어 계산해요. */
  function appendAfterStart(start: Val | null, dinnerAfter: boolean) {
    if (start === null) {
      for (const p of PERSONS) {
        blockedNode('workout_end', p, STEPS.workout_end.label, '공동 시작을 계산할 수 없어요', STEPS.workout_end);
        blockedNode('shower_end', p, STEPS.shower.label, '공동 시작을 계산할 수 없어요', STEPS.shower);
        blockedNode('home_return', p, STEPS.return_home.label, '공동 시작을 계산할 수 없어요', STEPS.return_home);
      }
      if (dinnerAfter) {
        blockedNode('joint_home', 'joint', '두 사람 귀가 완료', '공동 시작을 계산할 수 없어요');
        blockedNode('dinner_prep_start', 'joint', '저녁 준비 시작', '공동 시작을 계산할 수 없어요');
        blockedNode('dinner_prep_end', 'joint', STEPS.dinner_prep.label, '공동 시작을 계산할 수 없어요', STEPS.dinner_prep);
        blockedNode('meal_start', 'joint', '저녁 식사 시작', '공동 시작을 계산할 수 없어요');
        blockedNode('meal_end', 'joint', STEPS.dinner.label, '공동 시작을 계산할 수 없어요', STEPS.dinner);
      }
      return;
    }
    const home: Partial<Record<PersonId, Val>> = {};
    for (const p of PERSONS) {
      const end = emit('workout_end', p, STEPS.workout_end.label, addV(start, W), `${fmt(start.t)} + 운동 ${W}분 (예상 종료, 실제 완료 기록 전)`, { step: STEPS.workout_end })!;
      const sh = emit('shower_end', p, STEPS.shower.label, addV(end, s[p].shower), `${fmt(end.t)} + 샤워 ${s[p].shower}분 (헬스장)`, { step: STEPS.shower })!;
      home[p] = emit('home_return', p, STEPS.return_home.label, addV(sh, s[p].gymToHome), `${fmt(sh.t)} + 헬스장→집 ${s[p].gymToHome}분`, { step: STEPS.return_home })!;
    }
    if (!dinnerAfter) return;
    const jh = emit('joint_home', 'joint', '두 사람 귀가 완료', maxV([home.yangcho!, home.tawi!]), '두 사람 중 늦게 귀가한 시각')!;
    const dps = emit('dinner_prep_start', 'joint', '저녁 준비 시작', jh, '두 사람이 모두 귀가한 뒤 시작해요')!;
    const dpe = emit('dinner_prep_end', 'joint', STEPS.dinner_prep.label, addV(dps, shared.dinnerPrep), `${fmt(dps.t)} + 저녁 준비 ${shared.dinnerPrep}분`, { step: STEPS.dinner_prep })!;
    const ms = emit('meal_start', 'joint', '저녁 식사 시작', dpe, '저녁 준비가 끝나면 바로 식사해요')!;
    emit('meal_end', 'joint', STEPS.dinner.label, addV(ms, shared.dinnerEat), `${fmt(ms.t)} + 저녁 식사 ${shared.dinnerEat}분`, { step: STEPS.dinner });
  }

  /* ─────────── 계획별 계산 ─────────── */
  const dinnerAfter = input.mealOrder === 'after';

  if (!dinnerAfter) {
    /* 저녁 먼저, PLAN A만 [D-157, P-146] */
    const H = { yangcho: resolveHome('yangcho'), tawi: resolveHome('tawi') };
    if (H.yangcho && H.tawi) {
      const jh = emit('joint_home', 'joint', '두 사람 집 도착', maxV([H.yangcho, H.tawi]), '두 사람 중 늦게 집에 도착한 시각')!;
      const dps = emit('dinner_prep_start', 'joint', '저녁 준비 시작', jh, '두 사람이 모두 집에 도착한 뒤 시작해요')!;
      const dpe = emit('dinner_prep_end', 'joint', STEPS.dinner_prep.label, addV(dps, shared.dinnerPrep), `${fmt(dps.t)} + 저녁 준비 ${shared.dinnerPrep}분`, { step: STEPS.dinner_prep })!;
      const ms = emit('meal_start', 'joint', '저녁 식사 시작', dpe, '저녁 준비가 끝나면 바로 식사해요')!;
      const me = emit('meal_end', 'joint', STEPS.dinner.label, addV(ms, shared.dinnerEat), `${fmt(ms.t)} + 저녁 식사 ${shared.dinnerEat}분`, { step: STEPS.dinner })!;
      const waitEnd = emit('post_meal_wait_end', 'joint', '식후 대기 끝', addV(me, shared.postMealWait), `${fmt(me.t)} + 식후 대기 ${shared.postMealWait}분 (먹고 나서 최소 이만큼 지나야 출발)`)!;
      const pe = {
        yangcho: emitPrepChain('yangcho', me, 'post_meal', '식후 운동 준비 시작'),
        tawi: emitPrepChain('tawi', me, 'post_meal', '식후 운동 준비 시작'),
      };
      const depart = emit('joint_depart', 'joint', STEPS.depart_together.label, maxV([waitEnd, pe.yangcho, pe.tawi]), '식후 대기와 준비 중 늦게 끝나는 쪽 (환복·짐은 식후 대기와 겹쳐요)', { step: STEPS.depart_together })!;
      const gap = Math.max(s.yangcho.homeToGym, s.tawi.homeToGym);
      const readies = PERSONS.map((p) => emit('gym_ready', p, '헬스장 운동 준비 완료', addV(depart, gap), `${fmt(depart.t)} + 집→헬스장 ${gap}분 (두 사람 중 긴 쪽)`)!);
      const start = emit('joint_start', 'joint', STEPS.start_together.label, maxV(readies), '두 사람 중 늦은 운동 준비 완료 시각', { step: STEPS.start_together })!;
      appendAfterStart(start, false);
    } else {
      blockedNode('joint_home', 'joint', '두 사람 집 도착', '집 도착을 계산할 수 없어요');
      appendAfterStart(blockedNode('joint_start', 'joint', STEPS.start_together.label, '집 도착을 계산할 수 없어요', STEPS.start_together), false);
    }
  } else if (input.plan === 'A') {
    /* PLAN A: 집에서 만나 함께 출발 [D-033] */
    const H = { yangcho: resolveHome('yangcho'), tawi: resolveHome('tawi') };
    const pe: Partial<Record<PersonId, Val>> = {};
    for (const p of PERSONS) if (H[p]) pe[p] = emitPrepChain(p, H[p]!, 'a', '운동 준비 시작');
    if (pe.yangcho && pe.tawi) {
      const depart = emit('joint_depart', 'joint', STEPS.depart_together.label, maxV([pe.yangcho, pe.tawi]), '두 사람 중 늦게 준비가 끝난 시각', { step: STEPS.depart_together })!;
      for (const p of PERSONS) setWait(key(p, 'prep_end'), depart.t - pe[p]!.t);
      const gap = Math.max(s.yangcho.homeToGym, s.tawi.homeToGym);
      const readies = PERSONS.map((p) => emit('gym_ready', p, '헬스장 운동 준비 완료', addV(depart, gap), `${fmt(depart.t)} + 집→헬스장 ${gap}분 (두 사람 중 긴 쪽, 락커 포함)`)!);
      const start = emit('joint_start', 'joint', STEPS.start_together.label, maxV(readies), '두 사람 중 늦은 운동 준비 완료 시각', { step: STEPS.start_together })!;
      appendAfterStart(start, true);
    } else {
      blockedNode('joint_depart', 'joint', STEPS.depart_together.label, '준비가 끝나는 시각을 계산할 수 없어요', STEPS.depart_together);
      for (const p of PERSONS) blockedNode('gym_ready', p, '헬스장 운동 준비 완료', '함께 출발을 계산할 수 없어요');
      appendAfterStart(blockedNode('joint_start', 'joint', STEPS.start_together.label, '두 사람 시각이 모두 필요해요', STEPS.start_together), true);
    }
  } else {
    /* PLAN B: 집 담당이 짐을 챙겨 헬스장으로, 다른 사람은 직행 [D-152] */
    const X = homePerson!;
    const Z = otherPerson(X);
    const hX = resolveHome(X);
    let readyX: Val | null = null;
    if (hX) {
      const prepEnd = emitPrepChain(X, hX, 'b_home', '운동 준비 시작');
      const dep = emit('depart_home', X, STEPS.depart_gym.label, prepEnd, '준비가 끝나면 바로 출발해요', { step: STEPS.depart_gym })!;
      readyX = emit('gym_ready', X, STEPS.meet_at_gym.label, addV(dep, s[X].homeToGym), `${fmt(dep.t)} + 집→헬스장 ${s[X].homeToGym}분 (락커 포함)`, { step: STEPS.meet_at_gym });
    } else {
      blockedNode('gym_ready', X, STEPS.meet_at_gym.label, '집 도착을 계산할 수 없어요', STEPS.meet_at_gym);
    }
    /* 직행하는 사람: 직접 입력한 헬스장 운동 가능 시각. 이동·준비가 이미 들어 있어서 더하지 않아요 [D-154] */
    let readyZ: Val | null = null;
    const gc = gymCandidates(input, Z)[0];
    const meetDone = recOf(Z, 'meet_at_gym')?.status === 'done';
    if (gc) {
      inputsUsed.directGym = { person: Z, reference: gc.eta.reference, time: gc.eta.time, source: gc.eta.source, derived: gc.derived, resolved: gc.eta.time + gc.offset };
      const inputExplain = `${name(Z)} ${REFERENCE_LABEL[gc.eta.reference]} ${fmt(gc.eta.time)} (${SOURCE_LABEL[gc.eta.source]})`;
      if (!gc.derived) {
        readyZ = emit('gym_ready', Z, '헬스장 운동 가능', { t: gc.eta.time, w: gc.eta.source, deps: [] }, `${inputExplain}. 이동과 준비가 이미 들어 있는 시각이라 더하지 않아요`, { input: gc.eta.source, step: STEPS.meet_at_gym });
      } else {
        const inputStep = gc.eta.reference === 'company_departure' ? STEPS.company_departure : STEPS.station_arrival;
        const inp = emit(gc.eta.reference, Z, REFERENCE_LABEL[gc.eta.reference], { t: gc.eta.time, w: gc.eta.source, deps: [] }, inputExplain, { input: gc.eta.source, step: inputStep })!;
        const origin = emit('depart_origin', Z, '헬스장으로 직행 출발', inp, '집을 거치지 않고 바로 출발해요')!;
        readyZ = emit('gym_ready', Z, '헬스장 운동 가능', { t: inp.t + gc.offset, w: origin.w, deps: origin.deps }, `${fmt(inp.t)} + ${gc.offsetLabel}`, { step: STEPS.meet_at_gym });
      }
    } else if (meetDone) {
      readyZ = emit('gym_ready', Z, STEPS.meet_at_gym.label, null, '', { step: STEPS.meet_at_gym });
    } else {
      const hasCar = input.eta[Z].some((e) => e.reference === 'company_departure');
      if (hasCar && s[Z].carCompanyToGym === null) {
        blockers.push({
          code: 'car_travel_time_unset',
          person: Z,
          message: `${name(Z)}의 자동차 회사→헬스장 시간이 설정에 없어요. 헬스장 운동 가능 예상 시각을 직접 넣어 주세요`,
          needs: ['gym_ready'],
          setting: 'carCompanyToGym',
        });
      }
      // 어떤 입력을 넣었는지에 따라 이유를 다르게 알려요 (자동차 / 이미 집·집 도착 / 입력 없음)
      const atHome = input.eta[Z].some((e) => e.reference === 'home_arrival' || e.reference === 'ready_at_home');
      const reason = hasCar
        ? `${name(Z)}는 자동차라서 회사→헬스장 시간을 몰라요. 헬스장에서 운동 가능한 예상 시각을 직접 넣어 주세요`
        : atHome
          ? `${name(Z)}는 집(도착)으로 입력돼 있어서 헬스장 직행 시각을 계산할 수 없어요. 헬스장에서 운동 가능한 예상 시각을 직접 넣어 주세요`
          : `${name(Z)}의 신도림역 도착 또는 헬스장 운동 가능 예상 시각이 필요해요`;
      blockers.push({ code: 'direct_gym_ready_needed', person: Z, message: reason, needs: ['gym_ready'] });
      blockedNode('gym_ready', Z, '헬스장 운동 가능', '직행 시각을 모르면 계산하지 않고 직접 입력을 받아요', STEPS.meet_at_gym);
    }
    if (readyX && readyZ) {
      const start = emit('joint_start', 'joint', STEPS.start_together.label, maxV([readyX, readyZ]), '두 사람의 헬스장 운동 준비 완료 시각 중 늦은 쪽', { step: STEPS.start_together })!;
      setWait(key(X, 'gym_ready'), start.t - readyX.t);
      setWait(key(Z, 'gym_ready'), start.t - readyZ.t);
      appendAfterStart(start, true);
    } else {
      appendAfterStart(blockedNode('joint_start', 'joint', STEPS.start_together.label, '두 사람의 시각이 모두 필요해요', STEPS.start_together), true);
    }
  }

  /* 이전 계획에서 이미 완료했지만 지금 계획에는 없는 단계도 기록 그대로 보여줘요 (과거 완료는 유지) [D-037, D-085] */
  for (const [rk, r] of Object.entries(records)) {
    if (r.status !== 'done' || r.time === null || usedRecords.has(rk)) continue;
    // 옛 방식의 공동 종료 기록은 개인별 완료로 읽지 않아요. 원본은 그대로 보존돼 있고 여기서는 보이지 않게만 둬요 [사용자 확정 2026-10-14]
    if (rk === 'joint.workout_end') continue;
    const [lane, sid] = rk.split('.') as [NodeLane, StepId];
    const info = STEPS[sid];
    if (!info) continue;
    const { hhmm, dayOffset } = formatClock(r.time);
    nodes.push({
      key: `${lane}.${sid}.carried`, id: sid, lane, label: r.label || info.label, time: r.time, clock: hhmm, dayOffset,
      state: 'done', step: info, seq: seq++, overdue: false, expected: r.expectedAtDone, actual: r.time, carried: true,
      source: 'actual', confirmed: true, approx: false, mark: '✅', weakestInput: 'self', dependsOnUnconfirmed: false,
      dependsOn: [], explain: `${fmt(r.time)}에 완료했어요 (이전 계획의 단계, 기록은 그대로 유지돼요)`,
    });
  }

  /* 정리: 시각순 정렬(같은 시각은 만든 순서 유지), 지남 표시, 요약, 안내 */
  for (const n of nodes) {
    n.overdue = n.state === 'pending' && n.step !== null && n.time !== null && now !== null && n.time < now;
  }
  nodes.sort((a, b) => {
    if (a.time === null && b.time === null) return a.seq - b.seq;
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time - b.time || a.seq - b.seq;
  });
  const timeOf = (lane: NodeLane, id: string): Minute | null => nodes.find((n) => n.lane === lane && n.id === id && !n.carried)?.time ?? null;
  const returns = PERSONS.map((p) => timeOf(p, 'home_return')).filter((t): t is Minute => t !== null);
  const summary = {
    jointStart: timeOf('joint', 'joint_start'),
    // 두 사람의 운동 끝 중 늦은 쪽 (둘 중 하나라도 계산할 수 없으면 null)
    workoutEnd: (() => {
      const ends = PERSONS.map((p) => timeOf(p, 'workout_end'));
      return ends.every((t): t is Minute => t !== null) ? Math.max(...ends) : null;
    })(),
    homeReturn: dinnerAfter ? timeOf('joint', 'joint_home') : returns.length === 2 ? Math.max(...returns) : null,
    mealStart: timeOf('joint', 'meal_start'),
    mealEnd: timeOf('joint', 'meal_end'),
  };
  const status: Timeline['status'] = summary.jointStart !== null && summary.mealStart !== null ? 'ok' : 'blocked';

  if (summary.mealStart !== null && dinnerAfter && summary.mealStart >= TIMELINE_RULES.lateDinnerNoticeAt) {
    notices.push({ code: 'dinner_late', message: `저녁 식사가 ${fmt(summary.mealStart)}에 시작해요` });
  }
  if (status === 'ok') {
    const last = Math.max(...nodes.filter((n) => n.time !== null).map((n) => n.time as number));
    for (const p of PERSONS) {
      const bed = s[p].bedTarget;
      if (bed !== null && last > bed) notices.push({ code: 'past_bed_target', person: p, message: `${name(p)}의 침대 목표 ${fmt(bed)}보다 마지막 일정이 ${fmt(last)}로 늦어요` });
    }
  }

  const timeline: Timeline = {
    plan: input.plan,
    homePerson,
    mealOrder: input.mealOrder,
    workoutMinutes: input.workoutMinutes,
    status,
    locked,
    overdueCount: nodes.filter((n) => n.overdue).length,
    nodes,
    blockers,
    notices,
    summary,
    inputsUsed,
  };
  if (input.desiredMealStart !== undefined && input.desiredMealStart !== null) {
    timeline.desired = evaluateDesired(input, timeline);
  }
  return timeline;
}
