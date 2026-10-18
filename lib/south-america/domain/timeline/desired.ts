// 희망 저녁 시작 시각: 역방향 계산과 평가 (06 문서 11-3b, D-159).
// 희망 시각은 "목표"예요. 타임라인의 시각을 앞당기거나 바꾸지 않고, 희망·예상·차이만 알려 줘요.
import { resolveSharedTimes } from '../../config/timeSettings';
import type { PersonId } from '../types';
import { prepSteps, sumMinutes } from './rules';
import type { DesiredEvaluation, EtaReference, Limit, Timeline, TimelineInput } from './types';

const PERSONS: readonly PersonId[] = ['yangcho', 'tawi'];

export function evaluateDesired(input: TimelineInput, tl: Timeline): DesiredEvaluation {
  const d = input.desiredMealStart as number;
  const s = input.settings;
  const shared = resolveSharedTimes(s);
  const W = input.workoutMinutes;
  const maxH2G = Math.max(s.yangcho.homeToGym, s.tawi.homeToGym);
  const limits: Limit[] = [];

  /** 집 도착이 늦어도 latestHome까지여야 할 때, 그 사람이 쓴 입력 종류에 맞춰 한도를 만들어요 */
  const homeLimit = (p: PersonId, latestHome: number) => {
    // 이미 집에 도착했다고 기록했다면 "늦어도 언제까지" 한도는 의미가 없어요
    if (tl.nodes.some((n) => n.lane === p && n.id === 'home_arrival' && n.state === 'done')) return;
    const basis = tl.inputsUsed.home[p];
    let reference: EtaReference = 'home_arrival';
    let latest = latestHome;
    if (basis?.reference === 'station_arrival') {
      reference = 'station_arrival';
      latest = latestHome - s[p].stationToHome;
    } else if (basis?.reference === 'company_departure' && s[p].carCompanyToHome !== null) {
      reference = 'company_departure';
      latest = latestHome - s[p].carCompanyToHome;
    } else if (basis?.reference === 'ready_at_home') {
      reference = 'ready_at_home';
    }
    const actual = basis ? (basis.derived ? basis.time : basis.resolved) : null;
    limits.push({ person: p, reference, latest, actual, slack: actual === null ? null : latest - actual });
  };

  const out: DesiredEvaluation = {
    desired: d,
    expected: tl.summary.mealStart,
    diff: null,
    status: 'unknown',
    slack: null,
    lateBy: null,
    limits,
    bottlenecks: [],
  };

  if (input.mealOrder === 'after') {
    /* 운동 후 저녁: 늦어도 이 시각에 시작하면 희망을 맞춰요 */
    const tail = Math.max(...PERSONS.map((p) => s[p].shower + s[p].gymToHome));
    const latestStart = d - shared.dinnerPrep - tail - W;
    out.latestStart = latestStart;
    if (input.plan === 'A') {
      const latestDepart = latestStart - maxH2G;
      out.latestDepart = latestDepart;
      for (const p of PERSONS) homeLimit(p, latestDepart - sumMinutes(prepSteps(s[p], 'a')));
    } else if (tl.homePerson) {
      const X = tl.homePerson;
      const Z: PersonId = X === 'yangcho' ? 'tawi' : 'yangcho';
      const latestDepart = latestStart - s[X].homeToGym;
      out.latestDepart = latestDepart;
      homeLimit(X, latestDepart - sumMinutes(prepSteps(s[X], 'b_home')));
      const directDone = tl.nodes.some((n) => n.lane === Z && n.id === 'gym_ready' && n.state === 'done');
      const db = directDone ? undefined : tl.inputsUsed.directGym;
      let reference: EtaReference = 'gym_ready';
      let latest = latestStart;
      if (db?.reference === 'station_arrival' && s[Z].stationToGymDirect !== null) {
        reference = 'station_arrival';
        latest = latestStart - s[Z].stationToGymDirect;
      } else if (db?.reference === 'company_departure' && s[Z].carCompanyToGym !== null) {
        reference = 'company_departure';
        latest = latestStart - s[Z].carCompanyToGym;
      }
      const actual = db ? (db.derived ? db.time : db.resolved) : null;
      if (!directDone) limits.push({ person: Z, reference, latest, actual, slack: actual === null ? null : latest - actual });
    }
  } else {
    /* 저녁 먼저: 두 사람이 (희망 − 저녁 준비)까지 집에 도착해야 하고, 식후 대기 제약을 지켜요 */
    const latestHomeBoth = d - shared.dinnerPrep;
    out.latestHomeBoth = latestHomeBoth;
    for (const p of PERSONS) homeLimit(p, latestHomeBoth);
    const mealEnd = d + shared.dinnerEat;
    const prepLongest = Math.max(...PERSONS.map((p) => sumMinutes(prepSteps(s[p], 'post_meal'))));
    out.earliestStart = Math.max(mealEnd + shared.postMealWait, mealEnd + prepLongest) + maxH2G;
  }

  out.bottlenecks = limits.filter((l) => l.slack !== null && l.slack < 0);

  if (out.expected !== null) {
    out.diff = out.expected - d;
    if (out.diff > 0) {
      out.status = 'late';
      out.lateBy = out.diff;
    } else {
      out.status = 'ok';
      out.slack = 0 - out.diff; // 0 - 0 = 0 (부호 있는 -0이 되지 않게)
    }
  }
  return out;
}
