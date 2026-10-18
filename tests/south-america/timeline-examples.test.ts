// 06 문서 11-8 검산 예시 1~7을 그대로 자동 검증해요.
import { describe, expect, it } from 'vitest';
import { comparePlans } from '@/lib/south-america/domain/timeline/compare';
import { computeTimeline } from '@/lib/south-america/domain/timeline/compute';
import { at, eta, makeInput, node, station } from './helpers';

describe('예시 1. 순방향, PLAN A, 둘 다 지하철, 운동 후 저녁', () => {
  const tl = computeTimeline(makeInput());

  it('집 도착 → 준비 끝 → 함께 출발 → 함께 시작', () => {
    expect(tl.status).toBe('ok');
    expect(at(tl, 'yangcho', 'home_arrival')).toBe('18:30');
    expect(at(tl, 'tawi', 'home_arrival')).toBe('19:00');
    expect(at(tl, 'yangcho', 'prep_end')).toBe('18:55');
    expect(at(tl, 'tawi', 'prep_end')).toBe('19:25');
    expect(at(tl, 'joint', 'joint_depart')).toBe('19:25');
    expect(at(tl, 'joint', 'joint_start')).toBe('19:40');
  });

  it('양초는 먼저 끝나서 30분 기다린다', () => {
    expect(node(tl, 'yangcho', 'prep_end').waitMinutes).toBe(30);
    expect(node(tl, 'tawi', 'prep_end').waitMinutes).toBeUndefined();
  });

  it('운동 끝 → 샤워 끝 → 귀가 → 저녁 준비 → 저녁 식사', () => {
    expect(at(tl, 'yangcho', 'workout_end')).toBe('20:55');
    expect(at(tl, 'yangcho', 'shower_end')).toBe('21:20');
    expect(at(tl, 'tawi', 'home_return')).toBe('21:35');
    expect(at(tl, 'joint', 'joint_home')).toBe('21:35');
    expect(at(tl, 'joint', 'dinner_prep_start')).toBe('21:35');
    expect(at(tl, 'joint', 'dinner_prep_end')).toBe('22:05');
    expect(at(tl, 'joint', 'meal_start')).toBe('22:05');
    expect(at(tl, 'joint', 'meal_end')).toBe('22:35');
  });

  it('식사 시작이 22:00을 넘으면 사실만 안내한다 (일정은 그대로)', () => {
    expect(tl.notices.map((n) => n.code)).toContain('dinner_late');
    expect(tl.notices.map((n) => n.code)).not.toContain('past_bed_target');
  });

  it('입력은 확정(✅), 계산은 모두 추정(🧮)이다', () => {
    expect(node(tl, 'yangcho', 'station_arrival')).toMatchObject({ confirmed: true, mark: '✅' });
    for (const n of tl.nodes.filter((x) => x.source === 'computed')) {
      expect(n.confirmed).toBe(false);
      expect(n.approx).toBe(true);
      expect(n.mark).toBe('🧮');
    }
  });
});

describe('예시 2. B가 A보다 거의 빠르지 않은 경우', () => {
  const base = makeInput({ eta: { yangcho: [station('18:20')], tawi: [station('18:50'), eta('gym_ready', '19:35')] } });
  const b = computeTimeline({ ...base, plan: 'B', homePerson: 'yangcho' });

  it('집 담당 양초 준비 25분, 헬스장 준비 완료 19:10, 타위 입력 19:35 중 늦은 쪽이 시작', () => {
    expect(at(b, 'yangcho', 'prep_end')).toBe('18:55');
    expect(at(b, 'yangcho', 'depart_home')).toBe('18:55');
    expect(at(b, 'yangcho', 'gym_ready')).toBe('19:10');
    expect(at(b, 'tawi', 'gym_ready')).toBe('19:35');
    expect(at(b, 'joint', 'joint_start')).toBe('19:35');
    expect(node(b, 'yangcho', 'gym_ready').waitMinutes).toBe(25);
  });

  it('A(19:40)와 5분 차이라 추천하지 않는다', () => {
    const cmp = comparePlans(base);
    expect(cmp.candidates.find((c) => c.id === 'A')?.jointStart).toBe(19 * 60 + 40);
    expect(cmp.candidates.find((c) => c.id === 'B_yangcho')?.jointStart).toBe(19 * 60 + 35);
    expect(cmp.note).toBe('no_big_difference');
    expect(cmp.recommended).toBeNull();
    expect(cmp.gapMinutes).toBe(5);
  });
});

describe('예시 3. B가 더 늦은 경우 (B가 항상 빠르지 않다)', () => {
  // 직행하는 쪽이 헬스장에 늦게 도착한다고 직접 입력한 날 (직접 입력이 역 도착+15분 계산보다 우선한다)
  const base = makeInput({ eta: { yangcho: [station('18:20'), eta('gym_ready', '19:40')], tawi: [station('18:30'), eta('gym_ready', '19:40')] } });
  const cmp = comparePlans(base);

  it('A는 19:20, B(양초 집 담당)는 19:40', () => {
    expect(cmp.candidates.find((c) => c.id === 'A')?.jointStart).toBe(19 * 60 + 20);
    expect(cmp.candidates.find((c) => c.id === 'B_yangcho')?.jointStart).toBe(19 * 60 + 40);
  });

  it('20분 차이로 A를 추천한다', () => {
    expect(cmp.recommended).toBe('A');
    expect(cmp.gapMinutes).toBe(20);
    expect(cmp.note).toBe('recommended');
  });
});

describe('예시 4. 자동차 날, 직접 입력한 두 시각으로 비교', () => {
  const base = makeInput({ eta: { yangcho: [station('18:20')], tawi: [eta('home_arrival', '19:00'), eta('gym_ready', '19:15')] } });
  const cmp = comparePlans(base);

  it('A는 19:40', () => {
    const a = cmp.candidates.find((c) => c.id === 'A')!;
    expect(at(a.timeline, 'tawi', 'prep_end')).toBe('19:25');
    expect(a.jointStart).toBe(19 * 60 + 40);
  });

  it('B(양초 집 담당)는 19:15, A보다 25분 빠르다', () => {
    const b = cmp.candidates.find((c) => c.id === 'B_yangcho')!;
    expect(at(b.timeline, 'yangcho', 'gym_ready')).toBe('19:10');
    expect(b.jointStart).toBe(19 * 60 + 15);
  });

  it('B(타위 집 담당)는 헬스장 준비 완료 19:40이고, 양초 직행은 역 도착 18:20 + 15분 = 18:35로 자동 계산한다 [D-160]', () => {
    const b = cmp.candidates.find((c) => c.id === 'B_tawi')!;
    expect(at(b.timeline, 'tawi', 'gym_ready')).toBe('19:40');
    expect(at(b.timeline, 'yangcho', 'gym_ready')).toBe('18:35');
    expect(node(b.timeline, 'yangcho', 'gym_ready')).toMatchObject({ confirmed: false, mark: '🧮' });
    expect(b.available).toBe(true);
    expect(b.jointStart).toBe(19 * 60 + 40);
  });

  it('B(양초 집 담당)를 추천하고 집 담당 기본 제안도 양초다', () => {
    expect(cmp.recommended).toBe('B_yangcho');
    expect(cmp.gapMinutes).toBe(25);
    expect(cmp.suggestedHomePerson).toBe('yangcho');
  });
});

describe('예시 5. 저녁 먼저, PLAN A, 운동 60분', () => {
  const tl = computeTimeline(makeInput({ mealOrder: 'before', workoutMinutes: 60 }));

  it('공동 귀가 → 저녁 준비 → 식사 → 식후 대기', () => {
    expect(at(tl, 'joint', 'joint_home')).toBe('19:00');
    expect(at(tl, 'joint', 'meal_start')).toBe('19:30');
    expect(at(tl, 'joint', 'meal_end')).toBe('20:00');
    expect(at(tl, 'joint', 'post_meal_wait_end')).toBe('20:30');
  });

  it('환복·짐(10분)은 식후 대기 안에 겹쳐서 간식 없이 20:10에 끝난다', () => {
    expect(at(tl, 'yangcho', 'prep_end')).toBe('20:10');
    expect(at(tl, 'tawi', 'prep_end')).toBe('20:10');
    expect(node(tl, 'yangcho', 'prep_end').explain).not.toContain('간식');
  });

  it('출발은 식후 대기가 끝난 20:30, 공동 시작 20:45, 귀가 22:25', () => {
    expect(at(tl, 'joint', 'joint_depart')).toBe('20:30');
    expect(at(tl, 'joint', 'joint_start')).toBe('20:45');
    expect(at(tl, 'yangcho', 'workout_end')).toBe('21:45');
    expect(at(tl, 'yangcho', 'shower_end')).toBe('22:10');
    expect(at(tl, 'yangcho', 'home_return')).toBe('22:25');
    expect(tl.summary.homeReturn).toBe(22 * 60 + 25);
  });
});

describe('예시 6. 역방향, 운동 후 저녁, 희망 22:00', () => {
  const input = makeInput({ desiredMealStart: 22 * 60 });
  const tl = computeTimeline(input);
  const d = tl.desired!;

  it('늦어도 공동 시작 19:35, 늦어도 함께 출발 19:20', () => {
    expect(d.latestStart).toBe(19 * 60 + 35);
    expect(d.latestDepart).toBe(19 * 60 + 20);
  });

  it('늦어도 역 도착 18:45: 양초는 25분 여유, 타위는 5분 늦음 (병목)', () => {
    const y = d.limits.find((l) => l.person === 'yangcho')!;
    const t = d.limits.find((l) => l.person === 'tawi')!;
    expect([y.reference, y.latest, y.slack]).toEqual(['station_arrival', 18 * 60 + 45, 25]);
    expect([t.reference, t.latest, t.slack]).toEqual(['station_arrival', 18 * 60 + 45, -5]);
    expect(d.bottlenecks.map((l) => l.person)).toEqual(['tawi']);
  });

  it('희망 22:00 / 예상 22:05 / 5분 늦어요', () => {
    expect(d).toMatchObject({ desired: 22 * 60, expected: 22 * 60 + 5, diff: 5, status: 'late', lateBy: 5, slack: null });
  });

  it('맞출 수 없어도 일정을 앞당기지 않는다 (희망이 없을 때와 노드가 똑같다)', () => {
    const plain = computeTimeline(makeInput());
    expect(tl.nodes).toEqual(plain.nodes);
    expect(tl.summary).toEqual(plain.summary);
    expect(at(tl, 'joint', 'joint_start')).toBe('19:40');
  });

  it('희망을 22:30으로 바꾸면 늦어도 20:05 시작, 여유 25분이고 예상은 그대로 22:05', () => {
    const ok = computeTimeline(makeInput({ desiredMealStart: 22 * 60 + 30 })).desired!;
    expect(ok.latestStart).toBe(20 * 60 + 5);
    expect(ok).toMatchObject({ expected: 22 * 60 + 5, status: 'ok', slack: 25, lateBy: null });
  });
});

describe('예시 7. 역방향, 저녁 먼저, 운동 60분', () => {
  const run = (desired: number) => computeTimeline(makeInput({ mealOrder: 'before', workoutMinutes: 60, desiredMealStart: desired }));

  it('희망 20:00: 맞출 수 있어요(여유 30분), 두 사람 모두 19:30까지 집 도착, 희망대로면 공동 시작은 빨라야 21:15', () => {
    const d = run(20 * 60).desired!;
    expect(d).toMatchObject({ expected: 19 * 60 + 30, status: 'ok', slack: 30, latestHomeBoth: 19 * 60 + 30, earliestStart: 21 * 60 + 15 });
    expect(d.bottlenecks).toEqual([]);
  });

  it('희망 19:15: 15분 늦어요, 두 사람 모두 18:45까지가 필요한데 타위는 19:00, 식후 대기는 그대로', () => {
    const tl = run(19 * 60 + 15);
    const d = tl.desired!;
    expect(d).toMatchObject({ expected: 19 * 60 + 30, status: 'late', lateBy: 15, latestHomeBoth: 18 * 60 + 45, earliestStart: 20 * 60 + 30 });
    expect(at(tl, 'joint', 'meal_end')).toBe('20:00');
    expect(at(tl, 'joint', 'post_meal_wait_end')).toBe('20:30');
    expect(at(tl, 'joint', 'joint_start')).toBe('20:45');
  });
});
