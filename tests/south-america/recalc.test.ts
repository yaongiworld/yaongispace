// 2-3 재계산: 완료한 행동의 실제 시각 고정, 건너뛰기, 지남 표시, 다시 계산, 이전 계획의 완료 기록 유지.
import { describe, expect, it } from 'vitest';
import {
  completeStep,
  createDayState,
  pressHeart,
  recalcFromNow,
  setEtaField,
  setEtaMode,
  setMealOrder,
  setPlan,
  skipStep,
  undoStep,
} from '@/lib/south-america/domain/day/day';
import { nextStepFor } from '@/lib/south-america/domain/timeline/steps';
import { C, DAY, at, must, newDay, node, tlOf } from './dayHelpers';

describe('완료한 행동은 실제 시각으로 고정된다 [D-037, D-085]', () => {
  it('집 도착을 18:34에 눌렀다면 예상 18:30과 실제 18:34가 따로 기록된다', () => {
    const s = must(completeStep(newDay(), 'yangcho', 'home_arrival', C('18:34'), 'yangcho'));
    const n = node(tlOf(s), 'yangcho', 'home_arrival');
    expect(n).toMatchObject({ state: 'done', actual: C('18:34'), expected: C('18:30'), source: 'actual', confirmed: true });
    expect(n.explain).toContain('4분 늦게');
    expect(s.actuals.steps['yangcho.home_arrival']).toMatchObject({ status: 'done', time: C('18:34'), expectedAtDone: C('18:30'), by: 'yangcho' });
  });

  it('완료 이후 이어지는 준비는 실제 시각부터 이어서 계산한다 (남은 단계 시간만 더함)', () => {
    let s = must(completeStep(newDay(), 'yangcho', 'home_arrival', C('18:34'), 'yangcho'));
    s = must(completeStep(s, 'yangcho', 'change_clothes', C('18:41'), 'yangcho'));
    const tl = tlOf(s);
    expect(at(tl, 'yangcho', 'change_clothes')).toBe('18:41');
    expect(at(tl, 'yangcho', 'snack')).toBe('18:56'); // 18:41 + 간식 15
    expect(at(tl, 'yangcho', 'pack_own_bag')).toBe('19:01'); // + 짐 5
    expect(at(tl, 'yangcho', 'prep_end')).toBe('19:01');
    expect(node(tl, 'yangcho', 'prep_end').explain).toContain('남은 단계');
  });

  it('[시나리오 E] 이후 ETA가 바뀌어도 완료한 시각과 기록은 그대로다', () => {
    let s = must(completeStep(newDay(), 'yangcho', 'home_arrival', C('18:34'), 'yangcho'));
    s = must(completeStep(s, 'yangcho', 'change_clothes', C('18:41'), 'yangcho'));
    const recordsBefore = JSON.stringify(s.actuals);
    // 타위 ETA도, 양초 본인의 역 도착 ETA도 늦춰 본다
    s = setEtaMode(s, 'tawi', 'subway', { station_arrival: C('19:10') }, 'tawi');
    s = setEtaMode(s, 'yangcho', 'subway', { station_arrival: C('19:00') }, 'yangcho');
    const tl = tlOf(s);
    expect(JSON.stringify(s.actuals)).toBe(recordsBefore); // 기록(실제 시각, 보상 키)이 한 글자도 안 바뀐다
    expect(at(tl, 'yangcho', 'home_arrival')).toBe('18:34');
    expect(at(tl, 'yangcho', 'change_clothes')).toBe('18:41');
    expect(node(tl, 'yangcho', 'home_arrival').state).toBe('done');
    // 바뀐 ETA는 아직 안 한 일정(타위, 공동 시작)에만 영향을 준다
    expect(at(tl, 'joint', 'joint_start')).toBe('20:00');
    expect(at(tl, 'tawi', 'home_arrival')).toBe('19:20');
  });

  it('PLAN·운동 시간을 바꿔도 완료 기록은 유지된다', () => {
    let s = must(completeStep(newDay(), 'yangcho', 'snack', C('18:45'), 'yangcho'));
    const before = JSON.stringify(s.actuals);
    s = must(setPlan(s, 'B', 'yangcho'));
    s = must(setPlan(s, 'A'));
    expect(JSON.stringify(s.actuals)).toBe(before);
    expect(at(tlOf(s), 'yangcho', 'snack')).toBe('18:45');
  });

  it('보상 중복 방지 키는 사람+날짜+행동으로 정해지고 바뀌지 않는다 (보상 장부는 아직 없음)', () => {
    const s = must(completeStep(newDay(), 'yangcho', 'snack', C('18:45'), 'yangcho'));
    expect(s.actuals.steps['yangcho.snack'].rewardKey).toBe(`baby:yangcho:${DAY}:snack`);
    const j = must(completeStep(s, 'joint', 'dinner_prep', C('21:40'), 'tawi'));
    expect(j.actuals.steps['joint.dinner_prep'].rewardKey).toBe(`joint:${DAY}:dinner_prep`);
  });

  it('같은 단계를 또 눌러도 한 번만 기록된다 (처음 시각 유지)', () => {
    const s1 = must(completeStep(newDay(), 'yangcho', 'snack', C('18:45'), 'yangcho'));
    const r2 = completeStep(s1, 'yangcho', 'snack', C('19:30'), 'yangcho');
    expect(r2.ok && r2.changed).toBe(false);
    expect(r2.state.actuals.steps['yangcho.snack'].time).toBe(C('18:45'));
  });

  it('각자 단계는 본인만 누를 수 있다 [O-081 잠정안]', () => {
    const r = completeStep(newDay(), 'yangcho', 'snack', C('18:45'), 'tawi');
    expect(r).toMatchObject({ ok: false, reason: 'not_your_step' });
  });

  it('함께 단계(함께 출발·저녁 준비 등)는 한 명이 눌러도 둘 다에 해당한다', () => {
    const s = must(completeStep(newDay(), 'joint', 'depart_together', C('19:27'), 'tawi'));
    const tl = tlOf(s);
    expect(node(tl, 'joint', 'joint_depart')).toMatchObject({ state: 'done', actual: C('19:27') });
    expect(at(tl, 'yangcho', 'gym_ready')).toBe('19:42');
    expect(at(tl, 'joint', 'joint_start')).toBe('19:42');
  });
});

describe('취소(↩️)와 건너뛰기', () => {
  it('실행 취소하면 기록이 사라지고 다시 예정 시각으로 돌아간다', () => {
    const s0 = newDay();
    const s1 = must(completeStep(s0, 'yangcho', 'home_arrival', C('18:50'), 'yangcho'));
    expect(at(tlOf(s1), 'yangcho', 'prep_end')).toBe('19:15');
    const s2 = must(undoStep(s1, 'yangcho', 'home_arrival'));
    expect(s2.actuals.steps['yangcho.home_arrival']).toBeUndefined();
    expect(at(tlOf(s2), 'yangcho', 'home_arrival')).toBe('18:30');
    expect(at(tlOf(s2), 'yangcho', 'prep_end')).toBe('18:55');
    expect(tlOf(s2)).toEqual(tlOf(s0));
  });

  it('하지 않은 단계는 취소할 수 없다', () => {
    expect(undoStep(newDay(), 'yangcho', 'snack')).toMatchObject({ ok: false, reason: 'not_done' });
  });

  it('간식을 건너뛰면 그 시간(15분)은 계산에서 빠지고 단계는 건너뜀으로 남는다', () => {
    const s = must(skipStep(newDay(), 'yangcho', 'snack', 'yangcho', null));
    const tl = tlOf(s);
    expect(node(tl, 'yangcho', 'snack')).toMatchObject({ state: 'skipped' });
    expect(at(tl, 'yangcho', 'prep_end')).toBe('18:40'); // 18:30 + 환복 5 + 짐 5
    expect(at(tl, 'joint', 'joint_start')).toBe('19:40'); // 타위가 더 늦어서 공동 시작은 그대로
  });

  it('건너뜀도 취소하면 다시 예정이 된다', () => {
    const s = must(undoStep(must(skipStep(newDay(), 'yangcho', 'snack', 'yangcho', null)), 'yangcho', 'snack'));
    expect(at(tlOf(s), 'yangcho', 'prep_end')).toBe('18:55');
  });

  it('건너뛴 단계는 "다음 할 일"에서 빠진다', () => {
    let s = must(completeStep(newDay(), 'yangcho', 'home_arrival', C('18:30'), 'yangcho'));
    s = must(skipStep(s, 'yangcho', 'change_clothes', 'yangcho', null));
    expect(nextStepFor(tlOf(s), 'yangcho')?.step?.id).toBe('snack');
  });

  it('순서를 바꿔 뒷단계를 먼저 눌러도 계산은 이어진다 (앞 단계는 계속 다음 할 일로 남는다)', () => {
    let s = must(completeStep(newDay(), 'yangcho', 'home_arrival', C('18:30'), 'yangcho'));
    s = must(completeStep(s, 'yangcho', 'pack_own_bag', C('18:40'), 'yangcho'));
    const tl = tlOf(s);
    expect(nextStepFor(tl, 'yangcho')?.step?.id).toBe('change_clothes');
    expect(at(tl, 'yangcho', 'prep_end')).toBe('19:00'); // 마지막 완료 18:40 + 환복 5 + 간식 15
  });
});

describe('지난 예정 단계와 현재 진행 상태 [P-147]', () => {
  it('시각이 지난 미완료 단계에는 "지남"만 표시하고 시각은 바꾸지 않는다', () => {
    const base = tlOf(newDay());
    const tl = tlOf(newDay(), C('18:50'));
    expect(node(tl, 'yangcho', 'change_clothes')).toMatchObject({ overdue: true, state: 'pending' });
    expect(node(tl, 'yangcho', 'prep_end').time).toBe(node(base, 'yangcho', 'prep_end').time); // 시계가 흘러도 안 변함
    expect(tl.nodes.map((n) => n.time)).toEqual(base.nodes.map((n) => n.time));
    expect(tl.overdueCount).toBeGreaterThan(0);
    expect(node(tl, 'yangcho', 'pack_own_bag').overdue).toBe(false); // 18:55는 아직 안 지남
  });

  it('완료한 단계는 지남으로 표시되지 않는다', () => {
    const s = must(completeStep(newDay(), 'yangcho', 'home_arrival', C('18:30'), 'yangcho'));
    expect(node(tlOf(s, C('19:00')), 'yangcho', 'home_arrival').overdue).toBe(false);
  });

  it('[지금 기준으로 다시 계산]: 안 한 단계는 지금 이후로 옮기고, 완료한 시각은 그대로다', () => {
    let s = must(completeStep(newDay(), 'yangcho', 'home_arrival', C('18:30'), 'yangcho'));
    s = recalcFromNow(s, C('18:50'));
    const tl = tlOf(s, C('18:50'));
    expect(at(tl, 'yangcho', 'home_arrival')).toBe('18:30'); // 완료는 그대로
    expect(at(tl, 'yangcho', 'change_clothes')).toBe('18:50'); // 18:35 → 지금 이후
    expect(at(tl, 'yangcho', 'snack')).toBe('19:05');
    expect(at(tl, 'yangcho', 'pack_own_bag')).toBe('19:10');
    expect(at(tl, 'yangcho', 'prep_end')).toBe('19:10');
    expect(at(tl, 'joint', 'joint_start')).toBe('19:40'); // 타위가 여전히 더 늦음
    expect(tl.overdueCount).toBe(0);
  });

  it('다시 계산해도 직접 넣은 ETA 입력 자체는 바꾸지 않는다', () => {
    const s = recalcFromNow(newDay(), C('18:50'));
    expect(at(tlOf(s, C('18:50')), 'yangcho', 'station_arrival')).toBe('18:20');
    expect(s.eta.yangcho).toEqual(newDay().eta.yangcho);
  });
});

describe('❤️ 함께 운동 시작 [D-041, D-051]', () => {
  const started = () => must(pressHeart(newDay(), C('19:38'), 'tawi'));

  it('누른 시각이 공동 시작의 실제 시각이 되고 운동 끝 이후가 거기서 이어진다', () => {
    const tl = tlOf(started());
    expect(node(tl, 'joint', 'joint_start')).toMatchObject({ state: 'done', actual: C('19:38'), expected: C('19:40') });
    expect(at(tl, 'yangcho', 'workout_end')).toBe('20:53');
    expect(at(tl, 'joint', 'meal_start')).toBe('22:03');
    expect(tl.locked).toBe(true);
  });

  it('시작 이후에는 PLAN, 저녁 순서, 운동 시간을 바꿀 수 없다', () => {
    const s = started();
    expect(setPlan(s, 'B', 'yangcho')).toMatchObject({ ok: false, reason: 'locked' });
    expect(setMealOrder(s, 'before')).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('시작 이후 ETA를 고쳐도 공동 시작 실제 시각은 그대로다', () => {
    const s = setEtaMode(started(), 'tawi', 'subway', { station_arrival: C('20:30') }, 'tawi');
    expect(at(tlOf(s), 'joint', 'joint_start')).toBe('19:38');
  });

  it('❤️는 한 번만 기록되고, 정정 정책이 없어서 되돌리기는 막는다', () => {
    const s = started();
    const again = pressHeart(s, C('20:00'), 'yangcho');
    expect(again.ok && again.changed).toBe(false);
    expect(again.state.actuals.steps['joint.start_together'].time).toBe(C('19:38'));
    expect(undoStep(s, 'joint', 'start_together')).toMatchObject({ ok: false, reason: 'start_correction_not_supported' });
  });

  it('ETA가 모자라 계산이 안 되는 상태에서도 ❤️는 기록되고 이후가 이어진다', () => {
    let s = createDayState(DAY);
    s = setEtaField(s, 'yangcho', 'station_arrival', null, 'yangcho');
    s = setEtaField(s, 'tawi', 'station_arrival', null, 'tawi');
    expect(tlOf(s).status).toBe('blocked');
    const h = must(pressHeart(s, C('19:30'), 'yangcho'));
    expect(at(tlOf(h), 'yangcho', 'workout_end')).toBe('20:45');
  });
});

describe('이전 계획에서 완료한 단계도 기록은 유지된다', () => {
  it('A에서 완료한 "내 짐 챙기기"는 PLAN B에서 단계가 달라져도 완료 기록으로 남는다', () => {
    let s = newDay();
    s = setEtaField(s, 'tawi', 'gym_ready', C('19:35'), 'tawi');
    for (const [id, t] of [['home_arrival', '18:30'], ['change_clothes', '18:36'], ['snack', '18:52'], ['pack_own_bag', '18:57']] as const) {
      s = must(completeStep(s, 'yangcho', id, C(t), 'yangcho'));
    }
    s = must(setPlan(s, 'B', 'yangcho'));
    const tl = tlOf(s);
    const carried = tl.nodes.find((n) => n.key === 'yangcho.pack_own_bag.carried');
    expect(carried).toMatchObject({ state: 'done', carried: true, actual: C('18:57') });
    expect(at(tl, 'yangcho', 'change_clothes')).toBe('18:36'); // 이어지는 단계는 그대로 완료
    expect(node(tl, 'yangcho', 'pack_partner_bag').state).toBe('pending'); // 새 단계는 새로 해야 함
    expect(s.actuals.steps['yangcho.pack_own_bag'].status).toBe('done');
  });
});
