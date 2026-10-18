// NEXT A: 예상/실제 표시 정확성, 지하철 PLAN B 자동 계산(양방향), PLAN 비교 확장, 희망 저녁 문구와 가장 빠르게 먹기.
import { describe, expect, it } from 'vitest';
import { createTimeSettings } from '@/lib/south-america/config/timeSettings';
import { completeStep, eatEarliest, setDesiredMealStart, setEtaField, setPlan, undoStep } from '@/lib/south-america/domain/day/day';
import { comparePlans, computeTimeline, describeDinnerLine } from '@/lib/south-america/domain/timeline';
import { C, DAY, at, must, newDay, node, tlOf } from './dayHelpers';
import { makeInput, station } from './helpers';

describe('예상/실제 완료 시각 비교 정확성 (Golden Flow 버그)', () => {
  it('제때 누른 환복·간식·짐 챙기기는 "예상대로"이고, 저장된 예상 시각을 그대로 보여 준다', () => {
    let s = newDay();
    s = must(completeStep(s, 'yangcho', 'station_arrival', C('18:20'), 'yangcho'));
    s = must(completeStep(s, 'yangcho', 'home_arrival', C('18:30'), 'yangcho'));
    s = must(completeStep(s, 'yangcho', 'change_clothes', C('18:35'), 'yangcho'));
    s = must(completeStep(s, 'yangcho', 'snack', C('18:50'), 'yangcho'));
    s = must(completeStep(s, 'yangcho', 'pack_own_bag', C('18:55'), 'yangcho'));
    const tl = tlOf(s, C('18:55'));
    for (const id of ['change_clothes', 'snack', 'pack_own_bag']) {
      const n = node(tl, 'yangcho', id);
      expect(n.state).toBe('done');
      expect(n.expected).toBe(n.actual);
      expect(n.explain).not.toContain('예상');
    }
  });

  it('늦게 누르면 누른 순간의 예상과 비교한다 (나중에 ETA가 바뀌어도 예상은 그때 값 그대로)', () => {
    let s = newDay();
    s = must(completeStep(s, 'yangcho', 'station_arrival', C('18:25'), 'yangcho'));
    s = must(completeStep(s, 'yangcho', 'home_arrival', C('18:35'), 'yangcho'));
    s = must(completeStep(s, 'yangcho', 'change_clothes', C('18:45'), 'yangcho')); // 예상 18:40, 5분 늦음
    s = setEtaField(s, 'tawi', 'station_arrival', C('19:30'), 'tawi'); // 이후 다른 ETA가 바뀜
    const n = node(tlOf(s, C('18:45')), 'yangcho', 'change_clothes');
    expect(n.expected).toBe(C('18:40'));
    expect(n.actual).toBe(C('18:45'));
    expect(n.explain).toContain('예상 18:40보다 5분 늦게');
  });

  it('취소 후 다시 완료하면 그때의 예상으로 다시 기록된다', () => {
    let s = newDay();
    s = must(completeStep(s, 'yangcho', 'station_arrival', C('18:20'), 'yangcho'));
    s = must(completeStep(s, 'yangcho', 'home_arrival', C('18:30'), 'yangcho'));
    s = must(completeStep(s, 'yangcho', 'change_clothes', C('18:35'), 'yangcho'));
    s = must(undoStep(s, 'yangcho', 'change_clothes'));
    s = must(completeStep(s, 'yangcho', 'change_clothes', C('18:50'), 'yangcho'));
    const n = node(tlOf(s, C('18:50')), 'yangcho', 'change_clothes');
    expect([n.expected, n.actual]).toEqual([C('18:35'), C('18:50')]);
  });
});

describe('지하철 PLAN B: 직행자는 신도림역 도착 + 15분 [D-160]', () => {
  const base = makeInput(); // 양초 역 18:20, 타위 역 18:50

  it('양초 집 담당: 타위는 18:50 + 15분 = 19:05에 헬스장, 양초는 집 준비 후 19:10 → 공동 시작 19:10', () => {
    const tl = computeTimeline({ ...base, plan: 'B', homePerson: 'yangcho' });
    expect(tl.status).toBe('ok');
    expect(at(tl, 'tawi', 'gym_ready')).toBe('19:05');
    expect(node(tl, 'tawi', 'gym_ready')).toMatchObject({ confirmed: false, mark: '🧮', approx: true });
    expect(node(tl, 'tawi', 'gym_ready').explain).toContain('설정값');
    expect(at(tl, 'yangcho', 'gym_ready')).toBe('19:10'); // 18:30 + 25 + 15
    expect(at(tl, 'joint', 'joint_start')).toBe('19:10');
  });

  it('타위 집 담당: 양초는 18:20 + 15분 = 18:35에 헬스장, 타위는 19:00 + 25 + 15 = 19:40 → 공동 시작 19:40', () => {
    const tl = computeTimeline({ ...base, plan: 'B', homePerson: 'tawi' });
    expect(tl.status).toBe('ok');
    expect(at(tl, 'yangcho', 'gym_ready')).toBe('18:35');
    expect(at(tl, 'tawi', 'gym_ready')).toBe('19:40');
    expect(at(tl, 'joint', 'joint_start')).toBe('19:40');
    expect(node(tl, 'yangcho', 'gym_ready').waitMinutes).toBe(65);
  });

  it('직접 입력한 헬스장 운동 가능 시각은 계산값보다 우선한다', () => {
    const input = makeInput({ eta: { yangcho: [station('18:20')], tawi: [station('18:50'), { reference: 'gym_ready', time: C('19:30'), source: 'self' }] } });
    const tl = computeTimeline({ ...input, plan: 'B', homePerson: 'yangcho' });
    expect(at(tl, 'tawi', 'gym_ready')).toBe('19:30');
    expect(node(tl, 'tawi', 'gym_ready').confirmed).toBe(true);
  });

  it('설정에서 직행 시간을 바꾸면 그 값으로 계산한다 (개인별)', () => {
    const tl = computeTimeline({ ...base, settings: createTimeSettings({ tawi: { stationToGymDirect: 25 } }), plan: 'B', homePerson: 'yangcho' });
    expect(at(tl, 'tawi', 'gym_ready')).toBe('19:15');
  });

  it('기본값(📌)이나 상대 추정(🙋) 역 도착에서 나온 직행 시각은 확정이 아니라고 표시한다', () => {
    const input = makeInput({ eta: { yangcho: [station('18:20', 'default')], tawi: [station('18:50', 'partner')] } });
    const tl = computeTimeline({ ...input, plan: 'B', homePerson: 'yangcho' });
    expect(node(tl, 'tawi', 'gym_ready')).toMatchObject({ confirmed: false, dependsOnUnconfirmed: true });
  });

  it('PLAN 비교는 세 후보를 모두 계산하고, 더 이른 PLAN B를 추천한다', () => {
    const cmp = comparePlans(base);
    expect(cmp.candidates.map((c) => [c.id, c.available])).toEqual([['A', true], ['B_yangcho', true], ['B_tawi', true]]);
    expect(cmp.candidates.map((c) => c.jointStart)).toEqual([C('19:40'), C('19:10'), C('19:40')]);
    expect(cmp.recommended).toBe('B_yangcho');
    expect(cmp.gapMinutes).toBe(30);
  });

  it('PLAN별 운동 끝·귀가·저녁 시각을 비교할 수 있다 (각 후보의 요약)', () => {
    const cmp = comparePlans(base);
    const sum = (id: string) => cmp.candidates.find((c) => c.id === id)!.timeline.summary;
    expect(sum('A')).toMatchObject({ jointStart: C('19:40'), workoutEnd: C('20:55'), homeReturn: C('21:35'), mealStart: C('22:05') });
    expect(sum('B_yangcho')).toMatchObject({ jointStart: C('19:10'), workoutEnd: C('20:25'), homeReturn: C('21:05'), mealStart: C('21:35') });
  });

  it('자동차 날은 여전히 임의로 가정하지 않는다 (회사→헬스장 설정이 없으면 직접 입력 요구)', () => {
    const input = makeInput({ eta: { yangcho: [station('18:20')], tawi: [{ reference: 'company_departure', time: C('18:40'), source: 'self' }] } });
    const tl = computeTimeline({ ...input, plan: 'B', homePerson: 'yangcho' });
    expect(tl.blockers.map((b) => b.code)).toContain('direct_gym_ready_needed');
  });

  it('PLAN B를 고른 뒤 ❤️ 전에는 집 담당을 바꿔도 완료 기록이 유지된다', () => {
    let s = newDay();
    s = must(completeStep(s, 'tawi', 'station_arrival', C('18:50'), 'tawi'));
    s = must(setPlan(s, 'B', 'yangcho'));
    s = must(setPlan(s, 'B', 'tawi'));
    expect(node(tlOf(s, C('18:50')), 'tawi', 'station_arrival').state).toBe('done');
  });
});

describe('가장 빠르게 먹기 / 희망 저녁시간', () => {
  it('희망이 없으면 평가도 없다 (임의 목표를 적용하지 않는다)', () => {
    expect(tlOf(newDay()).desired).toBeUndefined();
  });

  it('희망이 예상보다 늦으면 [가장 빠르게 먹기]로 희망을 예상 시각으로 맞춘다 (일정은 바뀌지 않는다)', () => {
    let s = must(setDesiredMealStart(newDay(), C('23:00')));
    const before = tlOf(s);
    expect(before.desired).toMatchObject({ status: 'ok', slack: 55 });
    s = must(eatEarliest(s, C('19:00')));
    const after = tlOf(s);
    expect(s.desiredMealStart).toBe(C('22:05'));
    expect(after.desired).toMatchObject({ status: 'ok', slack: 0 });
    // 일정 자체는 그대로
    expect(after.nodes.map((n) => [n.key, n.time])).toEqual(before.nodes.map((n) => [n.key, n.time]));
  });

  it('희망 시각을 바꾸거나 지워도 완료 기록과 ❤️ 시작 시각은 건드리지 않는다', () => {
    let s = newDay();
    s = must(completeStep(s, 'yangcho', 'station_arrival', C('18:25'), 'yangcho'));
    s = must(setDesiredMealStart(s, C('21:00')));
    s = must(setDesiredMealStart(s, null));
    expect(s.actuals.steps['yangcho.station_arrival']?.time).toBe(C('18:25'));
    expect(s.desiredMealStart).toBeNull();
  });

  it('식사 시작을 계산할 수 없으면 가장 빠르게 먹기를 거부한다', () => {
    const s = setEtaField(setEtaField(newDay(), 'yangcho', 'station_arrival', null, 'yangcho'), 'tawi', 'station_arrival', null, 'tawi');
    const r = eatEarliest(s, C('18:00'));
    expect(r.ok).toBe(false);
  });

  it('날짜 상수 확인용: 테스트 하루는 고정 날짜다', () => {
    expect(DAY).toBe('2026-10-15');
  });
});

describe('저녁 안내 문구 (부호 대신 의미를 쓴다)', () => {
  const E = C('22:05');
  it('희망이 없으면 가장 빠른 가능 시각만 보여 준다', () => {
    expect(describeDinnerLine(E, null)).toEqual({ headline: '저녁 22:05부터 가능', detail: null, tone: 'none', canEatEarlier: false });
  });
  it('5분 늦음은 경고 없는 중립, 10분 이상은 은은한 강조', () => {
    expect(describeDinnerLine(E, C('22:00'))).toMatchObject({ detail: '희망 22:00 · 5분 늦음', tone: 'neutral' });
    expect(describeDinnerLine(E, C('21:55'))).toMatchObject({ detail: '희망 21:55 · 10분 늦음', tone: 'late' });
    expect(describeDinnerLine(E, C('21:30'))).toMatchObject({ detail: '희망 21:30 · 35분 늦음', tone: 'late' });
  });
  it('같으면 "희망 시각과 같음"', () => {
    expect(describeDinnerLine(E, E)).toMatchObject({ detail: '희망 시각과 같음', tone: 'same', canEatEarlier: false });
  });
  it('일찍 먹을 수 있으면 가능 시각과 희망을 모두 보여 주고 [가장 빠르게 먹기]를 제안한다', () => {
    expect(describeDinnerLine(C('20:30'), C('21:00'))).toEqual({ headline: '20:30부터 식사 가능', detail: '희망 21:00 · 30분 일찍 가능', tone: 'early', canEatEarlier: true });
  });
  it('계산할 수 없으면 그렇게 알린다', () => {
    expect(describeDinnerLine(null, C('22:00')).tone).toBe('none');
  });
  it('+, − 부호만 쓰지 않는다', () => {
    for (const d of ['20:00', '22:05', '22:30']) {
      const t = describeDinnerLine(E, C(d)).detail ?? '';
      expect(t).not.toMatch(/\(\s*[+-]/);
    }
  });
});
