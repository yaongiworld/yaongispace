// 요청하신 추가 확인: 서로 다른 ETA, 양방향 역할, 자동차 미설정, 희망 시각(못 맞춤/여유),
// 저녁 먼저 식후 대기, 개인 설정 변경, 자정 이후, 원칙(앞당기지 않음·중복 가산 금지·미확정 표시).
import { describe, expect, it } from 'vitest';
import { createTimeSettings } from '@/lib/south-america/config/timeSettings';
import { comparePlans } from '@/lib/south-america/domain/timeline/compare';
import { computeTimeline } from '@/lib/south-america/domain/timeline/compute';
import { at, C, eta, makeInput, node, station } from './helpers';

describe('두 사람이 서로 다른 ETA를 입력한 경우', () => {
  const tl = computeTimeline(makeInput({ eta: { yangcho: [station('17:50')], tawi: [station('19:30')] } }));

  it('먼저 끝난 양초가 오래 기다리고, 시작은 늦은 타위가 정한다', () => {
    expect(at(tl, 'yangcho', 'prep_end')).toBe('18:25');
    expect(at(tl, 'tawi', 'prep_end')).toBe('20:05');
    expect(node(tl, 'yangcho', 'prep_end').waitMinutes).toBe(100);
    expect(at(tl, 'joint', 'joint_start')).toBe('20:20');
  });

  it('저녁이 밤늦게 이어져 식사 22:45, 양초 침대 목표 23:00도 넘는다고 안내만 한다', () => {
    expect(at(tl, 'joint', 'meal_start')).toBe('22:45');
    expect(at(tl, 'joint', 'meal_end')).toBe('23:15');
    const codes = tl.notices.map((n) => `${n.code}:${n.person ?? ''}`);
    expect(codes).toContain('dinner_late:');
    expect(codes).toContain('past_bed_target:yangcho');
    expect(codes).not.toContain('past_bed_target:tawi');
  });
});

describe('PLAN B 양방향 역할 교체', () => {
  it('집 담당이 바뀌어도 같은 규칙이다 (양초 직행, 타위 집 담당)', () => {
    const base = makeInput({ eta: { yangcho: [station('18:50'), eta('gym_ready', '19:35')], tawi: [station('18:20')] } });
    const tl = computeTimeline({ ...base, plan: 'B', homePerson: 'tawi' });
    expect(tl.homePerson).toBe('tawi');
    expect(at(tl, 'tawi', 'prep_end')).toBe('18:55');
    expect(at(tl, 'tawi', 'depart_home')).toBe('18:55');
    expect(at(tl, 'tawi', 'gym_ready')).toBe('19:10');
    expect(at(tl, 'yangcho', 'gym_ready')).toBe('19:35');
    expect(at(tl, 'joint', 'joint_start')).toBe('19:35');
  });

  it('두 역할의 결과를 한 번에 비교하고, 더 빠른 쪽을 추천한다', () => {
    const base = makeInput({
      eta: { yangcho: [station('18:20'), eta('gym_ready', '19:20')], tawi: [station('18:50'), eta('gym_ready', '19:15')] },
    });
    const cmp = comparePlans(base);
    const by = cmp.candidates.find((c) => c.id === 'B_yangcho')!;
    const bt = cmp.candidates.find((c) => c.id === 'B_tawi')!;
    expect(by.jointStart).toBe(C('19:15')); // 양초 집 담당: 양초 준비 완료 19:10, 타위 19:15
    expect(bt.jointStart).toBe(C('19:40')); // 타위 집 담당: 타위 준비 완료 19:40, 양초 19:20
    expect(cmp.recommended).toBe('B_yangcho');
    expect(cmp.suggestedHomePerson).toBe('yangcho');
  });

  it('두 역할 차이가 10분 미만이면 먼저 집에 도착한 사람을 집 담당으로 제안한다 [P-143]', () => {
    const mk = (y: string, t: string) =>
      comparePlans(makeInput({ eta: { yangcho: [station(y), eta('gym_ready', '19:30')], tawi: [station(t), eta('gym_ready', '19:30')] } })).suggestedHomePerson;
    expect(mk('18:20', '18:25')).toBe('yangcho');
    expect(mk('18:25', '18:20')).toBe('tawi');
  });

  it('PLAN B인데 집 담당이 없으면 계산하지 않는다', () => {
    const tl = computeTimeline({ ...makeInput(), plan: 'B' });
    expect(tl.status).toBe('blocked');
    expect(tl.blockers[0].code).toBe('home_person_required');
  });

  it('저녁 먼저 날에는 PLAN B를 쓸 수 없다 [P-146]', () => {
    const tl = computeTimeline({ ...makeInput({ mealOrder: 'before' }), plan: 'B', homePerson: 'yangcho' });
    expect(tl.status).toBe('blocked');
    expect(tl.blockers[0].code).toBe('dinner_first_requires_plan_a');
    const cmp = comparePlans(makeInput({ mealOrder: 'before' }));
    expect(cmp.candidates.filter((c) => c.plan === 'B').every((c) => !c.available)).toBe(true);
    expect(cmp.suggestedHomePerson).toBeNull();
  });
});

describe('자동차 이동시간 미설정 [D-151, D-154]', () => {
  const carDay = makeInput({ eta: { yangcho: [station('18:20')], tawi: [eta('company_departure', '18:40')] } });

  it('설정이 없으면 계산하지 않고 이유와 필요한 입력을 알려 준다 (임의로 가정하지 않는다)', () => {
    const tl = computeTimeline(carDay);
    expect(tl.status).toBe('blocked');
    const b = tl.blockers.find((x) => x.code === 'car_travel_time_unset')!;
    expect(b).toMatchObject({ person: 'tawi', setting: 'carCompanyToHome' });
    expect(b.needs).toEqual(['home_arrival', 'gym_ready']);
    expect(node(tl, 'tawi', 'home_arrival').time).toBeNull();
    expect(node(tl, 'tawi', 'home_arrival').state).toBe('blocked');
    expect(node(tl, 'joint', 'joint_start').time).toBeNull();
    expect(at(tl, 'yangcho', 'prep_end')).toBe('18:55'); // 계산할 수 있는 양초 쪽은 그대로
  });

  it('회사 출발만 있고 직행 시간이 없으면 PLAN B도 직접 입력을 요구한다', () => {
    const tl = computeTimeline({ ...carDay, plan: 'B', homePerson: 'yangcho' });
    expect(tl.status).toBe('blocked');
    const codes = tl.blockers.map((x) => x.code);
    expect(codes).toContain('car_travel_time_unset');
    expect(codes).toContain('direct_gym_ready_needed');
    expect(tl.blockers.find((x) => x.code === 'car_travel_time_unset')?.setting).toBe('carCompanyToGym');
  });

  it('설정에 회사→집 35분을 넣으면 그 값으로 계산하고 설정값임을 표시한다', () => {
    const tl = computeTimeline({ ...carDay, settings: createTimeSettings({ tawi: { carCompanyToHome: 35 } }) });
    expect(tl.status).toBe('ok');
    expect(at(tl, 'tawi', 'home_arrival')).toBe('19:15');
    expect(node(tl, 'tawi', 'home_arrival').explain).toContain('설정값');
    expect(node(tl, 'tawi', 'home_arrival').confirmed).toBe(false);
  });

  it('설정에 회사→헬스장 40분을 넣으면 직행 시각을 계산하고, 그 값도 추정이다', () => {
    const tl = computeTimeline({ ...carDay, plan: 'B', homePerson: 'yangcho', settings: createTimeSettings({ tawi: { carCompanyToGym: 40 } }) });
    expect(tl.status).toBe('ok');
    expect(at(tl, 'tawi', 'company_departure')).toBe('18:40');
    expect(at(tl, 'tawi', 'depart_origin')).toBe('18:40');
    expect(at(tl, 'tawi', 'gym_ready')).toBe('19:20');
    expect(node(tl, 'tawi', 'gym_ready')).toMatchObject({ confirmed: false, mark: '🧮' });
  });

  it('직접 입력한 집 도착이 계산값보다 우선한다', () => {
    const tl = computeTimeline({
      ...carDay,
      eta: { yangcho: [station('18:20')], tawi: [eta('company_departure', '18:40'), eta('home_arrival', '19:05')] },
      settings: createTimeSettings({ tawi: { carCompanyToHome: 35 } }),
    });
    expect(at(tl, 'tawi', 'home_arrival')).toBe('19:05');
  });

  it('ETA가 아예 없는 사람은 "입력 필요"로 막힌다', () => {
    const tl = computeTimeline(makeInput({ eta: { yangcho: [station('18:20')], tawi: [] } }));
    expect(tl.blockers.map((b) => b.code)).toContain('eta_missing');
    expect(at(tl, 'joint', 'joint_start')).toBe('null');
  });
});

describe('희망 저녁 시각', () => {
  it('희망을 넣지 않으면 순방향 계산만 한다 [원칙 3]', () => {
    expect(computeTimeline(makeInput()).desired).toBeUndefined();
    expect(computeTimeline(makeInput({ desiredMealStart: null })).desired).toBeUndefined();
  });

  it('못 맞추는 경우: 희망·예상·차이만 알려 주고 실제 ETA와 시각을 앞당기지 않는다 [원칙 4]', () => {
    const input = makeInput({ desiredMealStart: C('21:00') });
    const before = JSON.stringify(input);
    const tl = computeTimeline(input);
    expect(JSON.stringify(input)).toBe(before); // 입력(ETA)을 바꾸지 않는다
    expect(tl.desired).toMatchObject({ desired: C('21:00'), expected: C('22:05'), diff: 65, status: 'late', lateBy: 65 });
    expect(at(tl, 'tawi', 'station_arrival')).toBe('18:50');
    expect(node(tl, 'tawi', 'station_arrival')).toMatchObject({ confirmed: true, mark: '✅' });
    expect(tl.nodes).toEqual(computeTimeline(makeInput()).nodes);
  });

  it('여유가 있는 경우: 가장 이른 가능 시각을 그대로 보여주고 여유만 알린다', () => {
    const tl = computeTimeline(makeInput({ desiredMealStart: C('23:00') }));
    expect(tl.desired).toMatchObject({ status: 'ok', slack: 55, diff: -55, latestStart: C('20:35') }); // 23:00 − 30 − 40 − 75
    expect(at(tl, 'joint', 'meal_start')).toBe('22:05');
    expect(tl.desired!.bottlenecks).toEqual([]);
  });

  it('정확히 맞는 경우(여유 0)는 ok다', () => {
    const tl = computeTimeline(makeInput({ desiredMealStart: C('22:05') }));
    expect(tl.desired).toMatchObject({ status: 'ok', slack: 0, lateBy: null });
  });

  it('PLAN B도 역산한다 (집 담당과 직행 시각 기준)', () => {
    const base = makeInput({ eta: { yangcho: [station('18:20')], tawi: [eta('gym_ready', '19:35')] }, desiredMealStart: C('22:00') });
    const tl = computeTimeline({ ...base, plan: 'B', homePerson: 'yangcho' });
    const d = tl.desired!;
    expect(d.latestStart).toBe(C('19:35'));
    expect(d.latestDepart).toBe(C('19:20'));
    expect(d).toMatchObject({ expected: C('22:00'), status: 'ok', slack: 0 });
    const home = d.limits.find((l) => l.person === 'yangcho')!;
    const direct = d.limits.find((l) => l.person === 'tawi')!;
    expect([home.reference, home.latest, home.slack]).toEqual(['station_arrival', C('18:45'), 25]);
    expect([direct.reference, direct.latest, direct.actual, direct.slack]).toEqual(['gym_ready', C('19:35'), C('19:35'), 0]);
  });

  it('ETA가 모자라 계산할 수 없어도 역산 한도는 알려 주고 상태는 unknown이다', () => {
    const tl = computeTimeline(makeInput({ eta: { yangcho: [station('18:20')], tawi: [] }, desiredMealStart: C('22:00') }));
    expect(tl.desired).toMatchObject({ status: 'unknown', expected: null, diff: null, latestStart: C('19:35') });
  });

  it('저녁 먼저 날에도 희망 시각이 입력되고 평가된다', () => {
    const tl = computeTimeline(makeInput({ mealOrder: 'before', workoutMinutes: 60, desiredMealStart: C('19:30') }));
    expect(tl.desired).toMatchObject({ status: 'ok', slack: 0, latestHomeBoth: C('19:00') });
  });
});

describe('저녁 먼저 먹는 날 식후 대기 30분 [D-157]', () => {
  const run = (overrides = {}) => computeTimeline(makeInput({ mealOrder: 'before', workoutMinutes: 60, overrides }));

  it('식사가 끝나고 30분이 지나기 전에는 출발하지 않는다', () => {
    const tl = run();
    expect(node(tl, 'joint', 'joint_depart').time! - node(tl, 'joint', 'meal_end').time!).toBe(30);
  });

  it('식후 대기를 설정에서 45분으로 바꾸면 출발이 15분 늦어진다', () => {
    expect(at(run({ tawi: { postMealWait: 45 } }), 'joint', 'joint_depart')).toBe('20:45');
  });

  it('두 사람 설정이 다르면 큰 값을 쓴다 (양초 20분, 타위 40분이면 40분)', () => {
    const tl = run({ yangcho: { postMealWait: 20 }, tawi: { postMealWait: 40 } });
    expect(at(tl, 'joint', 'joint_depart')).toBe('20:40');
  });

  it('준비가 식후 대기보다 길면(환복 20 + 짐 15 = 35분) 준비가 끝난 시각에 출발한다', () => {
    const tl = run({ tawi: { changeClothes: 20, packBag: 15 } });
    expect(at(tl, 'tawi', 'prep_end')).toBe('20:35');
    expect(at(tl, 'joint', 'joint_depart')).toBe('20:35');
  });

  it('식후 대기를 0분으로 두면 식사가 끝나자마자 (준비가 끝나면) 출발할 수 있다', () => {
    const tl = run({ yangcho: { postMealWait: 0 }, tawi: { postMealWait: 0 } });
    expect(at(tl, 'joint', 'joint_depart')).toBe('20:10');
  });
});

describe('개인 설정 시간이 바뀌면 계산 결과가 바뀐다', () => {
  const base = computeTimeline(makeInput());

  it('양초의 샤워 20분·귀가 10분: 양초만 일찍 귀가하고, 공동 귀가는 타위가 정한다', () => {
    const tl = computeTimeline(makeInput({ overrides: { yangcho: { shower: 20, gymToHome: 10 } } }));
    expect(at(tl, 'yangcho', 'shower_end')).toBe('21:15');
    expect(at(tl, 'yangcho', 'home_return')).toBe('21:25');
    expect(at(tl, 'tawi', 'home_return')).toBe('21:35');
    expect(at(tl, 'joint', 'joint_home')).toBe('21:35');
    expect(at(tl, 'joint', 'meal_start')).toBe(at(base, 'joint', 'meal_start'));
  });

  it('타위의 샤워를 35분으로 늘리면 공동 귀가와 저녁이 10분 늦어진다', () => {
    const tl = computeTimeline(makeInput({ overrides: { tawi: { shower: 35 } } }));
    expect(at(tl, 'joint', 'joint_home')).toBe('21:45');
    expect(at(tl, 'joint', 'meal_start')).toBe('22:15');
  });

  it('타위가 간식을 빼면(0분) 준비가 15분 줄어 함께 시작이 앞당겨진다', () => {
    const tl = computeTimeline(makeInput({ overrides: { tawi: { snack: 0 } } }));
    expect(at(tl, 'tawi', 'prep_end')).toBe('19:10');
    expect(at(tl, 'joint', 'joint_start')).toBe('19:25');
  });

  it('집→헬스장은 두 사람이 같이 가므로 긴 쪽(타위 20분)을 따른다', () => {
    const tl = computeTimeline(makeInput({ overrides: { tawi: { homeToGym: 20 } } }));
    expect(at(tl, 'joint', 'joint_start')).toBe('19:45');
    expect(at(tl, 'yangcho', 'gym_ready')).toBe('19:45');
  });

  it('신도림역→집 시간을 15분으로 바꾸면 그 사람의 집 도착이 늦어진다', () => {
    const tl = computeTimeline(makeInput({ overrides: { tawi: { stationToHome: 15 } } }));
    expect(at(tl, 'tawi', 'home_arrival')).toBe('19:05');
    expect(at(tl, 'joint', 'joint_start')).toBe('19:45');
  });

  it('저녁 준비·식사 시간을 바꾸면 반영된다 (타위 준비 40분, 식사 20분 → 공동은 큰 값)', () => {
    const tl = computeTimeline(makeInput({ overrides: { tawi: { dinnerPrep: 40, dinnerEat: 20 } } }));
    // 준비는 큰 값 40분, 식사는 양초 30분과 타위 20분 중 큰 값 30분을 쓴다 [P-145]
    expect(at(tl, 'joint', 'meal_start')).toBe('22:15');
    expect(at(tl, 'joint', 'meal_end')).toBe('22:45');
  });

  it('설정이 바뀌어도 희망 저녁의 역산이 함께 바뀐다 (샤워 35분이면 늦어도 시작이 10분 빨라짐)', () => {
    const tl = computeTimeline(makeInput({ overrides: { tawi: { shower: 35 } }, desiredMealStart: C('22:00') }));
    expect(tl.desired!.latestStart).toBe(C('19:25'));
  });
});

describe('PLAN B 짐 챙기기는 총 5분이고 합산하지 않는다 [원칙 5, D-150]', () => {
  const base = makeInput({ eta: { yangcho: [station('18:20')], tawi: [eta('gym_ready', '19:35')] } });
  const b = (overrides = {}) => computeTimeline({ ...base, plan: 'B', homePerson: 'yangcho', settings: createTimeSettings(overrides) });

  it('집 담당의 준비는 A와 같은 25분이다 (30분이 아니다)', () => {
    const tl = b();
    expect(node(tl, 'yangcho', 'prep_end').time! - node(tl, 'yangcho', 'prep_start').time!).toBe(25);
    expect(node(tl, 'yangcho', 'prep_end').explain).toContain('내 짐·상대 짐 챙기기 5분');
  });

  it('더 걸리면 설정에서 12분으로 늘린 값이 그대로 반영된다 (5+12로 더하지 않는다)', () => {
    const tl = b({ yangcho: { packBagBHome: 12 } });
    expect(node(tl, 'yangcho', 'prep_end').time! - node(tl, 'yangcho', 'prep_start').time!).toBe(5 + 15 + 12);
  });

  it('PLAN A의 짐 챙기기 설정은 PLAN B 집 담당에 영향을 주지 않는다', () => {
    const tl = b({ yangcho: { packBag: 9 } });
    expect(node(tl, 'yangcho', 'prep_end').time! - node(tl, 'yangcho', 'prep_start').time!).toBe(25);
    const a = computeTimeline(makeInput({ overrides: { yangcho: { packBag: 9 } } }));
    expect(node(a, 'yangcho', 'prep_end').time! - node(a, 'yangcho', 'prep_start').time!).toBe(29);
  });
});

describe('직행하는 사람의 시각에 이동·준비를 더하지 않는다 [원칙 6, D-154]', () => {
  it('입력한 헬스장 운동 가능 시각이 그대로 헬스장 준비 완료 시각이다 (1분 바꾸면 1분만 바뀐다)', () => {
    const run = (hhmm: string) =>
      computeTimeline({ ...makeInput({ eta: { yangcho: [station('18:20')], tawi: [eta('gym_ready', hhmm)] } }), plan: 'B', homePerson: 'yangcho' });
    expect(at(run('19:15'), 'tawi', 'gym_ready')).toBe('19:15');
    expect(at(run('19:15'), 'joint', 'joint_start')).toBe('19:15');
    expect(at(run('19:16'), 'joint', 'joint_start')).toBe('19:16');
    expect(node(run('19:15'), 'tawi', 'gym_ready').explain).toContain('더하지 않아요');
  });

  it('직행하는 사람에게 환복·샤워 앞 단계(준비 노드)를 만들지 않는다', () => {
    const tl = computeTimeline({ ...makeInput({ eta: { yangcho: [station('18:20')], tawi: [eta('gym_ready', '19:15')] } }), plan: 'B', homePerson: 'yangcho' });
    expect(tl.nodes.filter((n) => n.lane === 'tawi' && (n.id === 'prep_start' || n.id === 'prep_end' || n.id === 'home_arrival'))).toEqual([]);
  });
});

describe('추정값과 확인값 구분 [원칙 7]', () => {
  it('상대 추정(🙋)·기본값(📌) 입력은 확정이 아니고, 그에 의존하는 계산은 "미확정에 의존" 표시가 붙는다', () => {
    const tl = computeTimeline(makeInput({ eta: { yangcho: [station('18:20')], tawi: [station('18:50', 'default')] } }));
    expect(node(tl, 'tawi', 'station_arrival')).toMatchObject({ confirmed: false, mark: '📌', source: 'default' });
    expect(node(tl, 'yangcho', 'station_arrival')).toMatchObject({ confirmed: true, mark: '✅' });
    expect(node(tl, 'tawi', 'home_arrival')).toMatchObject({ confirmed: false, weakestInput: 'default', dependsOnUnconfirmed: true });
    expect(node(tl, 'joint', 'joint_start')).toMatchObject({ confirmed: false, approx: true, weakestInput: 'default', dependsOnUnconfirmed: true });
    expect(node(tl, 'joint', 'meal_start')).toMatchObject({ confirmed: false, dependsOnUnconfirmed: true });
    // 양초 혼자 계산한 구간은 확정 입력에만 의존한다
    expect(node(tl, 'yangcho', 'prep_end')).toMatchObject({ confirmed: false, weakestInput: 'self', dependsOnUnconfirmed: false });
  });

  it('상대 추정(🙋)은 ~로 표시할 시각이다', () => {
    const tl = computeTimeline(makeInput({ eta: { yangcho: [station('18:20')], tawi: [station('18:50', 'partner')] } }));
    expect(node(tl, 'tawi', 'station_arrival')).toMatchObject({ confirmed: false, approx: true, mark: '🙋' });
    expect(node(tl, 'joint', 'joint_start').weakestInput).toBe('partner');
  });

  it('통화로 확인한 입력(📞)은 확정이다', () => {
    const tl = computeTimeline(makeInput({ eta: { yangcho: [station('18:20', 'phone')], tawi: [station('18:50')] } }));
    expect(node(tl, 'yangcho', 'station_arrival')).toMatchObject({ confirmed: true, mark: '📞' });
  });

  it('모든 입력이 확정(✅)이어도 계산한 시각은 확정이 아니다', () => {
    const tl = computeTimeline(makeInput());
    expect(node(tl, 'joint', 'joint_start').confirmed).toBe(false);
    expect(node(tl, 'joint', 'joint_start').dependsOnUnconfirmed).toBe(false);
  });

  it('직행 시각을 상대가 추정해 넣으면 🙋이고, 함께 시작도 그 추정에 의존한다', () => {
    const tl = computeTimeline({ ...makeInput({ eta: { yangcho: [station('18:20')], tawi: [eta('gym_ready', '19:35', 'partner')] } }), plan: 'B', homePerson: 'yangcho' });
    expect(node(tl, 'tawi', 'gym_ready')).toMatchObject({ mark: '🙋', confirmed: false, approx: true });
    expect(node(tl, 'joint', 'joint_start')).toMatchObject({ weakestInput: 'partner', dependsOnUnconfirmed: true });
  });

  it('사람이 직접 넣은 값(✅)이 상대 추정(🙋)이나 기본값(📌)보다 먼저 쓰인다', () => {
    const tl = computeTimeline(makeInput({ eta: { yangcho: [station('18:20')], tawi: [station('18:40', 'default'), station('18:50', 'self')] } }));
    expect(at(tl, 'tawi', 'station_arrival')).toBe('18:50');
  });
});

describe('자정 이후 일정과 새벽 04:00 날짜 경계 [P-130]', () => {
  it('늦은 퇴근: 운동과 저녁이 자정을 넘기면 +1로 표시한다', () => {
    const tl = computeTimeline(makeInput({ eta: { yangcho: [station('22:30')], tawi: [station('22:40')] } }));
    expect(at(tl, 'joint', 'joint_start')).toBe('23:30');
    expect(at(tl, 'yangcho', 'workout_end')).toBe('00:45+1');
    expect(at(tl, 'joint', 'meal_start')).toBe('01:55+1');
    expect(node(tl, 'yangcho', 'workout_end')).toMatchObject({ clock: '00:45', dayOffset: 1 });
    expect(node(tl, 'joint', 'joint_start')).toMatchObject({ clock: '23:30', dayOffset: 0 });
    expect(tl.nodes.map((n) => n.time!)).toEqual([...tl.nodes.map((n) => n.time!)].sort((a, b) => a - b));
  });

  it('00:30처럼 자정 이후로 입력한 ETA는 전날 일정의 연장으로 계산한다', () => {
    const tl = computeTimeline(makeInput({ eta: { yangcho: [station('00:30')], tawi: [station('00:30')] } }));
    expect(node(tl, 'yangcho', 'station_arrival')).toMatchObject({ clock: '00:30', dayOffset: 1 });
    expect(at(tl, 'yangcho', 'home_arrival')).toBe('00:40+1');
    expect(at(tl, 'joint', 'joint_start')).toBe('01:20+1'); // 00:40 + 25 + 15
  });

  it('희망 저녁 시각이 자정을 넘겨도 같은 규칙으로 역산한다', () => {
    const tl = computeTimeline(makeInput({ eta: { yangcho: [station('22:30')], tawi: [station('22:40')] }, desiredMealStart: C('01:30') }));
    expect(tl.desired).toMatchObject({ desired: 1440 + 90, expected: C('01:55'), status: 'late', lateBy: 25 });
    expect(tl.desired!.latestStart).toBe(C('23:05'));
  });

  it('새벽 03:59와 04:00은 다른 날로 갈린다', () => {
    expect(C('03:59')).toBe(1440 + 239);
    expect(C('04:00')).toBe(240);
  });
});

describe('잘못된 입력과 불변 규칙', () => {
  it('운동 시간은 60·75·90만 받는다', () => {
    for (const m of [60, 75, 90]) expect(computeTimeline(makeInput({ workoutMinutes: m })).status).toBe('ok');
    const bad = computeTimeline(makeInput({ workoutMinutes: 70 }));
    expect(bad.status).toBe('blocked');
    expect(bad.blockers[0].code).toBe('invalid_workout_minutes');
  });

  it('올바르지 않은 설정이 직접 들어와도 계산하지 않는다', () => {
    const settings = createTimeSettings();
    const broken = { ...settings, tawi: { ...settings.tawi, shower: -1 } };
    const tl = computeTimeline(makeInput({ settings: broken }));
    expect(tl.status).toBe('blocked');
    expect(tl.blockers[0].code).toBe('invalid_settings');
  });

  it('같은 입력은 항상 같은 결과를 낸다', () => {
    expect(computeTimeline(makeInput({ desiredMealStart: C('22:00') }))).toEqual(computeTimeline(makeInput({ desiredMealStart: C('22:00') })));
  });

  it('계산이 입력(ETA)이나 설정을 바꾸지 않는다', () => {
    const input = makeInput({ desiredMealStart: C('21:00') });
    const snapshot = JSON.stringify(input);
    computeTimeline(input);
    comparePlans(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('노드는 시각 순으로 정렬되어 나오고, 블록된 노드는 맨 뒤에 모인다', () => {
    const tl = computeTimeline(makeInput({ eta: { yangcho: [station('18:20')], tawi: [] } }));
    const times = tl.nodes.map((n) => n.time);
    const firstNull = times.indexOf(null);
    expect(firstNull).toBeGreaterThan(0);
    expect(times.slice(firstNull).every((t) => t === null)).toBe(true);
  });

  it('비교할 후보가 하나뿐이면 추천하지 않는다 / 모두 계산 불가면 그렇게 알린다', () => {
    expect(comparePlans(makeInput({ mealOrder: 'before' })).note).toBe('single_candidate');
    expect(comparePlans(makeInput({ mealOrder: 'before' })).recommended).toBeNull();
    expect(comparePlans(makeInput({ eta: { yangcho: [], tawi: [] } })).note).toBe('none_available');
  });
});
