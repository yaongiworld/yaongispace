// 요청하신 시나리오 A~H를 하루 상태 동작(ETA 수정, PLAN 변경 등)으로 확인해요.
// 화면에서 같은 버튼을 누르는 것과 같은 함수를 써요.
import { describe, expect, it } from 'vitest';
import {
  completeStep,
  confirmEta,
  createDayState,
  liveDay,
  reviveDayState,
  setDesiredMealStart,
  setEtaField,
  setEtaMode,
  setMealOrder,
  setPersonSetting,
  setPlan,
  setWorkoutMinutes,
  toTimelineInput,
} from '@/lib/south-america/domain/day/day';
import { SCENARIOS, applyScenario } from '@/lib/south-america/domain/day/scenarios';
import { createTimeSettings } from '@/lib/south-america/config/timeSettings';
import { computeTimeline } from '@/lib/south-america/domain/timeline/compute';
import { C, DAY, at, must, newDay, node, tlOf } from './dayHelpers';

describe('[A] 타위 ETA를 20분 늦추면 운동 시작과 저녁 예상이 같이 20분 밀린다', () => {
  it('역 도착 18:50 → 19:10', () => {
    const before = tlOf(newDay());
    const s = setEtaMode(newDay(), 'tawi', 'subway', { station_arrival: C('19:10') }, 'tawi');
    const after = tlOf(s);
    expect(at(before, 'joint', 'joint_start')).toBe('19:40');
    expect(at(after, 'tawi', 'home_arrival')).toBe('19:20');
    expect(at(after, 'tawi', 'prep_end')).toBe('19:45');
    expect(at(after, 'joint', 'joint_start')).toBe('20:00');
    expect(at(after, 'yangcho', 'workout_end')).toBe('21:15');
    expect(at(after, 'joint', 'joint_home')).toBe('21:55');
    expect(at(after, 'joint', 'meal_start')).toBe('22:25');
    expect(at(after, 'joint', 'meal_end')).toBe('22:55');
  });

  it('양초 쪽 시각은 그대로이고 기다리는 시간만 늘어난다 (30분 → 50분)', () => {
    const s = setEtaMode(newDay(), 'tawi', 'subway', { station_arrival: C('19:10') }, 'tawi');
    const tl = tlOf(s);
    expect(at(tl, 'yangcho', 'prep_end')).toBe('18:55');
    expect(node(tl, 'yangcho', 'prep_end').waitMinutes).toBe(50);
  });

  it('상대가 대신 넣은 시각은 🙋 상대 추정이고, 본인이 [맞아]를 누르면 ✅가 된다', () => {
    let s = setEtaMode(newDay(), 'tawi', 'subway', { station_arrival: C('19:10') }, 'yangcho'); // 양초가 타위 ETA를 추정해서 입력
    expect(s.eta.tawi.find((e) => e.reference === 'station_arrival')?.source).toBe('partner');
    expect(node(tlOf(s), 'tawi', 'station_arrival')).toMatchObject({ mark: '🙋', confirmed: false });
    expect(node(tlOf(s), 'joint', 'joint_start').dependsOnUnconfirmed).toBe(true);
    s = confirmEta(s, 'tawi', 'station_arrival', 'yangcho'); // 상대는 대신 확인할 수 없다
    expect(s.eta.tawi[0].source).toBe('partner');
    s = confirmEta(s, 'tawi', 'station_arrival', 'tawi');
    expect(node(tlOf(s), 'tawi', 'station_arrival')).toMatchObject({ mark: '✅', confirmed: true });
  });

  it('기본값(📌)도 [맞아]를 누르면 시각은 그대로 ✅로 바뀐다', () => {
    let s = createDayState(DAY);
    expect(node(tlOf(s), 'yangcho', 'station_arrival').mark).toBe('📌');
    s = confirmEta(s, 'yangcho', 'station_arrival', 'yangcho');
    expect(node(tlOf(s), 'yangcho', 'station_arrival')).toMatchObject({ mark: '✅', time: C('18:20') });
  });
});

describe('[B] 운동 시간을 75분에서 60분으로 줄이면 이후 일정이 15분 앞당겨진다', () => {
  it('시작은 그대로, 운동 끝부터 저녁까지 모두 15분 일찍', () => {
    const base = tlOf(newDay());
    const s = must(setWorkoutMinutes(newDay(), 60));
    const tl = tlOf(s);
    expect(at(tl, 'joint', 'joint_start')).toBe(at(base, 'joint', 'joint_start'));
    const pairs: [string, string][] = [['yangcho', 'workout_end'], ['tawi', 'workout_end'], ['joint', 'joint_home'], ['joint', 'meal_start'], ['joint', 'meal_end']];
    for (const [lane, id] of pairs) expect(node(base, lane, id).time! - node(tl, lane, id).time!).toBe(15);
    expect(at(tl, 'tawi', 'workout_end')).toBe('20:40');
    expect(at(tl, 'joint', 'meal_start')).toBe('21:50');
  });

  it('60·75·90 밖의 값은 거부한다', () => {
    expect(setWorkoutMinutes(newDay(), 45)).toMatchObject({ ok: false, reason: 'invalid_workout_minutes' });
  });
});

describe('[C] 희망 저녁 시작을 입력하면 가능 여부와 차이가 나온다 / [F] 삭제하면 순방향만 남는다', () => {
  it('희망 22:00: 5분 늦어요, 일정은 그대로', () => {
    const base = tlOf(newDay());
    const s = must(setDesiredMealStart(newDay(), C('22:00')));
    const tl = tlOf(s);
    expect(tl.desired).toMatchObject({ desired: C('22:00'), expected: C('22:05'), diff: 5, status: 'late', lateBy: 5, latestStart: C('19:35') });
    expect(tl.nodes).toEqual(base.nodes);
  });

  it('희망 22:30으로 고치면 여유 25분', () => {
    const s = must(setDesiredMealStart(must(setDesiredMealStart(newDay(), C('22:00'))), C('22:30')));
    expect(tlOf(s).desired).toMatchObject({ status: 'ok', slack: 25 });
  });

  it('[F] 삭제하면 희망 블록이 사라지고 시각은 그대로 순방향 결과만 남는다', () => {
    const withDesired = must(setDesiredMealStart(newDay(), C('22:00')));
    const removed = must(setDesiredMealStart(withDesired, null));
    const tl = tlOf(removed);
    expect(tl.desired).toBeUndefined();
    expect(removed.desiredMealStart).toBeNull();
    expect(tl).toEqual(tlOf(newDay()));
  });

  it('❤️ 시작 이후에도 희망 시각은 바꿀 수 있고, 실제 시작을 반영해 평가한다', () => {
    let s = must(completeStep(newDay(), 'joint', 'start_together', C('19:30'), 'yangcho'));
    s = must(setDesiredMealStart(s, C('22:00')));
    expect(tlOf(s).desired).toMatchObject({ expected: C('21:55'), status: 'ok', slack: 5 });
  });
});

describe('[D] PLAN B 집 담당을 양초↔타위로 바꿔도 정확히 계산된다', () => {
  const base = () => {
    let s = newDay();
    s = setEtaField(s, 'yangcho', 'gym_ready', C('19:20'), 'yangcho');
    s = setEtaField(s, 'tawi', 'gym_ready', C('19:15'), 'tawi');
    return s;
  };

  it('양초 집 담당: 양초 19:10, 타위 직행 19:15 → 시작 19:15', () => {
    const tl = tlOf(must(setPlan(base(), 'B', 'yangcho')));
    expect(tl.homePerson).toBe('yangcho');
    expect(at(tl, 'yangcho', 'gym_ready')).toBe('19:10');
    expect(at(tl, 'tawi', 'gym_ready')).toBe('19:15');
    expect(at(tl, 'joint', 'joint_start')).toBe('19:15');
  });

  it('타위 집 담당으로 바꾸면: 타위 19:40, 양초 직행 19:20 → 시작 19:40', () => {
    const tl = tlOf(must(setPlan(base(), 'B', 'tawi')));
    expect(tl.homePerson).toBe('tawi');
    expect(at(tl, 'tawi', 'gym_ready')).toBe('19:40');
    expect(at(tl, 'yangcho', 'gym_ready')).toBe('19:20');
    expect(at(tl, 'joint', 'joint_start')).toBe('19:40');
    expect(tl.nodes.some((n) => n.lane === 'yangcho' && n.id === 'prep_end')).toBe(false); // 직행하는 사람은 집 준비가 없다
  });

  it('다시 양초로 되돌려도 처음 결과와 똑같다', () => {
    const a = must(setPlan(base(), 'B', 'yangcho'));
    const b = must(setPlan(a, 'B', 'tawi'));
    const c = must(setPlan(b, 'B', 'yangcho'));
    expect(tlOf(c)).toEqual(tlOf(a));
  });

  it('플랜 비교도 두 역할을 모두 계산하고 더 빠른 쪽을 추천한다', () => {
    const cmp = liveDay(base(), null).comparison;
    expect(cmp.candidates.map((c) => [c.id, c.jointStart])).toEqual([['A', C('19:40')], ['B_yangcho', C('19:15')], ['B_tawi', C('19:40')]]);
    expect(cmp.recommended).toBe('B_yangcho');
  });
});

describe('[G] 같은 사람의 서로 다른 장소 ETA가 서로를 덮어쓰지 않는다', () => {
  it('헬스장 준비 완료 입력은 집 도착으로 쓰이지 않는다', () => {
    let s = newDay();
    s = setEtaField(s, 'tawi', 'gym_ready', C('19:15'), 'tawi');
    const tl = tlOf(s); // PLAN A
    expect(at(tl, 'tawi', 'home_arrival')).toBe('19:00'); // 역 도착 18:50 + 10, 19:15가 아니다
    expect(at(tl, 'joint', 'joint_start')).toBe('19:40');
    expect(tl.nodes.some((n) => n.lane === 'tawi' && n.id === 'gym_ready' && n.source !== 'computed')).toBe(false);
  });

  it('집 도착 입력을 바꿔도 헬스장 운동 가능 입력은 그대로다', () => {
    let s = setEtaMode(newDay(), 'tawi', 'car', { home_arrival: C('19:00'), gym_ready: C('19:15') }, 'tawi');
    s = setEtaField(s, 'tawi', 'home_arrival', C('19:30'), 'tawi');
    expect(s.eta.tawi.find((e) => e.reference === 'gym_ready')?.time).toBe(C('19:15'));
    expect(s.eta.tawi.find((e) => e.reference === 'home_arrival')?.time).toBe(C('19:30'));
  });

  it('헬스장 운동 가능 입력을 지워도 집 도착 입력은 남는다', () => {
    let s = setEtaMode(newDay(), 'tawi', 'car', { home_arrival: C('19:00'), gym_ready: C('19:15') }, 'tawi');
    s = setEtaField(s, 'tawi', 'gym_ready', null, 'tawi');
    expect(s.eta.tawi.map((e) => e.reference)).toEqual(['home_arrival']);
  });

  it('이동 수단을 바꾸면 이전 수단의 집 도착 계열 입력은 지워지지만 헬스장 운동 가능은 남는다', () => {
    let s = setEtaMode(newDay(), 'tawi', 'car', { home_arrival: C('19:00'), gym_ready: C('19:15') }, 'tawi');
    s = setEtaMode(s, 'tawi', 'subway', { station_arrival: C('18:50') }, 'tawi');
    expect(s.eta.tawi.map((e) => e.reference).sort()).toEqual(['gym_ready', 'station_arrival']);
  });

  it('회사 출발 입력만 있고 이동시간 설정이 없으면, 헬스장 운동 가능 입력을 집 도착으로 대신 쓰지 않는다', () => {
    let s = setEtaMode(newDay(), 'tawi', 'car', { company_departure: C('18:40'), gym_ready: C('19:15') }, 'tawi');
    s = must(setPlan(s, 'A'));
    const tl = tlOf(s);
    expect(tl.blockers.map((b) => b.code)).toContain('car_travel_time_unset');
    expect(node(tl, 'tawi', 'home_arrival').time).toBeNull();
  });

  it('한 사람의 입력을 바꿔도 다른 사람의 입력은 건드리지 않는다', () => {
    const s = setEtaField(newDay(), 'tawi', 'station_arrival', C('19:30'), 'tawi');
    expect(s.eta.yangcho).toEqual(newDay().eta.yangcho);
  });
});

describe('[H] 저녁 먼저 먹는 날 식후 30분 대기 규칙이 눌러 기록할 때도 지켜진다', () => {
  const dinnerFirst = () => must(setWorkoutMinutes(must(setMealOrder(newDay(), 'before')), 60));

  it('식사를 20:10에 마쳤다면 20:40 이전의 "함께 출발"은 기록할 수 없다', () => {
    let s = must(completeStep(dinnerFirst(), 'joint', 'dinner_prep', C('19:35'), 'tawi'));
    s = must(completeStep(s, 'joint', 'dinner', C('20:10'), 'tawi'));
    const tl = tlOf(s);
    expect(at(tl, 'joint', 'post_meal_wait_end')).toBe('20:40');
    expect(at(tl, 'joint', 'joint_depart')).toBe('20:40');
    expect(completeStep(s, 'joint', 'depart_together', C('20:30'), 'yangcho')).toMatchObject({ ok: false, reason: 'post_meal_wait' });
    const ok = must(completeStep(s, 'joint', 'depart_together', C('20:40'), 'yangcho'));
    expect(at(tlOf(ok), 'joint', 'joint_start')).toBe('20:55');
  });

  it('저녁 먼저를 고르면 PLAN B는 쓸 수 없고 PLAN A로 돌아간다', () => {
    const b = must(setPlan(newDay(), 'B', 'tawi'));
    const s = must(setMealOrder(b, 'before'));
    expect(s.plan).toBe('A');
    expect(setPlan(s, 'B', 'tawi')).toMatchObject({ ok: false, reason: 'dinner_first_requires_plan_a' });
  });

  it('식사 시간이 늦어지면(저녁 준비 늦게 끝남) 공동 시작도 그만큼 늦어진다', () => {
    const base = tlOf(dinnerFirst());
    const late = tlOf(must(completeStep(dinnerFirst(), 'joint', 'dinner_prep', C('19:50'), 'tawi')));
    expect(node(late, 'joint', 'joint_start').time! - node(base, 'joint', 'joint_start').time!).toBe(20);
    expect(node(late, 'joint', 'joint_depart').time! - node(late, 'joint', 'meal_end').time!).toBe(30);
  });

  it('희망 저녁 시각을 넣어도 대기 제약은 유지된다', () => {
    const tl = tlOf(must(setDesiredMealStart(dinnerFirst(), C('20:00'))));
    expect(tl.desired).toMatchObject({ status: 'ok', slack: 30, earliestStart: C('21:15') });
  });
});

describe('시간 설정 변경과 저장값 되살리기', () => {
  it('개인 설정을 바꾸면 그 사람의 계산이 바뀐다 (타위 샤워 35분)', () => {
    const s = must(setPersonSetting(newDay(), 'tawi', 'shower', 35));
    expect(at(tlOf(s), 'joint', 'meal_start')).toBe('22:15');
  });

  it('올바르지 않은 설정은 거부하고 상태를 바꾸지 않는다', () => {
    const r = setPersonSetting(newDay(), 'tawi', 'shower', -5);
    expect(r).toMatchObject({ ok: false, reason: 'invalid_setting' });
    expect(r.state).toEqual(newDay());
  });

  it('자동차 이동시간을 설정하면 그 값으로 계산한다', () => {
    let s = setEtaMode(newDay(), 'tawi', 'car', { company_departure: C('18:40') }, 'tawi');
    expect(tlOf(s).status).toBe('blocked');
    s = must(setPersonSetting(s, 'tawi', 'carCompanyToHome', 35));
    expect(at(tlOf(s), 'tawi', 'home_arrival')).toBe('19:15');
    expect(tlOf(s).status).toBe('ok');
  });

  it('같은 날 저장값은 그대로 되살리고, 날이 바뀌면 설정만 이어받아 새로 시작한다', () => {
    let s = must(setPersonSetting(newDay(), 'tawi', 'shower', 30));
    s = must(completeStep(s, 'yangcho', 'snack', C('18:45'), 'yangcho'));
    const same = reviveDayState(JSON.parse(JSON.stringify(s)), DAY);
    expect(same).toEqual(s);
    const nextDay = reviveDayState(JSON.parse(JSON.stringify(s)), '2026-10-16');
    expect(nextDay.settings.tawi.shower).toBe(30);
    expect(nextDay.actuals.steps).toEqual({});
    expect(nextDay.day).toBe('2026-10-16');
  });

  it('망가진 저장값은 새 상태로 대신한다', () => {
    expect(reviveDayState({ version: 99 }, DAY)).toEqual(createDayState(DAY));
    expect(reviveDayState('엉뚱한 값', DAY)).toEqual(createDayState(DAY));
    expect(reviveDayState(null, DAY)).toEqual(createDayState(DAY));
  });

  it('동작은 원래 상태를 바꾸지 않는다 (순수 함수)', () => {
    const s = newDay();
    const frozen = JSON.stringify(s);
    setEtaField(s, 'tawi', 'station_arrival', C('20:00'), 'tawi');
    completeStep(s, 'yangcho', 'snack', C('18:45'), 'yangcho');
    setPlan(s, 'B', 'tawi');
    expect(JSON.stringify(s)).toBe(frozen);
  });

  it('예시 상황(시나리오)이 모두 계산 가능하다', () => {
    for (const sc of SCENARIOS) {
      const s = applyScenario(newDay(), sc.id);
      expect(tlOf(s).status, sc.id).toBe('ok');
    }
    expect(at(tlOf(applyScenario(newDay(), 'tawi_late')), 'joint', 'joint_start')).toBe('20:00');
    expect(at(tlOf(applyScenario(newDay(), 'dinner_first')), 'joint', 'joint_start')).toBe('20:45');
  });

  it('하루 상태에서 만든 입력으로 엔진을 직접 돌려도 같은 결과다', () => {
    const s = newDay();
    expect(computeTimeline(toTimelineInput(s, null))).toEqual(tlOf(s));
    expect(createTimeSettings()).toEqual(s.settings);
  });
});
