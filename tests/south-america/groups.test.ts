// 타임라인 묶음(표시 계층): 모든 노드가 정확히 한 묶음에 들어가고, 계획에 필요한 단계만 보이며, 잘못 합치지 않는다.
import { describe, expect, it } from 'vitest';
import { createTimeSettings } from '@/lib/south-america/config/timeSettings';
import { completeStep, setMealOrder, setPlan } from '@/lib/south-america/domain/day/day';
import { computeTimeline, groupTimeline } from '@/lib/south-america/domain/timeline';
import type { Timeline } from '@/lib/south-america/domain/timeline/types';
import { C, must, newDay, tlOf } from './dayHelpers';
import { fmt, makeInput } from './helpers';

const settings = createTimeSettings();
const gs = (tl: Timeline) => groupTimeline(tl, settings);
const range = (g: { start: number | null; end: number | null }) => `${g.start === null ? '--' : fmt(g.start)}~${g.end === null ? '--' : fmt(g.end)}`;
const brief = (tl: Timeline) => gs(tl).map((g) => `${g.key} ${range(g)}`);

function coversEveryNodeOnce(tl: Timeline) {
  const groups = gs(tl);
  const seen = groups.flatMap((g) => g.nodes.map((n) => n.key + (n.carried ? '.c' : '')));
  expect(new Set(seen).size).toBe(seen.length);
  expect(seen.length).toBe(tl.nodes.length);
}

describe('타임라인 묶음: 모든 노드는 정확히 한 묶음', () => {
  it('PLAN A / PLAN B 양쪽 / 저녁 먼저 / 일부 완료 / 이전 계획 완료 기록', () => {
    const base = tlOf(newDay());
    coversEveryNodeOnce(base);
    coversEveryNodeOnce(tlOf(must(setPlan(newDay(), 'B', 'yangcho'))));
    coversEveryNodeOnce(tlOf(must(setPlan(newDay(), 'B', 'tawi'))));
    coversEveryNodeOnce(tlOf(must(setMealOrder(newDay(), 'before'))));
    let s = newDay();
    s = must(completeStep(s, 'yangcho', 'station_arrival', C('18:25'), 'yangcho'));
    s = must(completeStep(s, 'yangcho', 'home_arrival', C('18:35'), 'yangcho'));
    s = must(completeStep(s, 'yangcho', 'change_clothes', C('18:40'), 'yangcho'));
    coversEveryNodeOnce(tlOf(s, C('18:41')));
    // PLAN A에서 환복까지 완료한 뒤 PLAN B(집 담당 타위)로 바꿔도 기록이 어딘가에 남는다
    const swapped = tlOf(must(setPlan(s, 'B', 'tawi')), C('18:41'));
    coversEveryNodeOnce(swapped);
    expect(swapped.nodes.some((n) => n.carried)).toBe(true);
  });
});

describe('타임라인 묶음: PLAN A 운동 후 저녁', () => {
  const tl = tlOf(newDay());
  it('29줄이 의미 있는 묶음으로 줄어든다', () => {
    expect(tl.nodes.length).toBe(29); // 운동 끝이 사람별 2줄이 됨
    expect(brief(tl)).toEqual([
      'yangcho:commute 18:20~18:30',
      'yangcho:prep 18:30~18:55',
      'tawi:commute 18:50~19:00',
      'tawi:prep 19:00~19:25',
      'joint:together_move 19:25~19:40',
      'joint:workout 19:40~20:55',
      'both:after 20:55~21:35',
      'joint:dinner 21:35~22:35',
    ]);
  });

  it('운동 준비를 펼치면 환복 5분·간식 15분·짐 챙기기 5분이 나오고, 구분점은 목록에 나오지 않는다', () => {
    const prep = gs(tl).find((g) => g.key === 'yangcho:prep')!;
    expect(prep.rows.map((r) => [r.node.label, r.minutes])).toEqual([['환복', 5], ['간식', 15], ['짐 챙기기', 5]]);
    expect(prep.nodes.map((n) => n.id)).toEqual(['prep_start', 'change_clothes', 'snack', 'pack_own_bag', 'prep_end']);
    expect(prep.stepCount).toBe(3);
    expect(prep.wait).toBe(30); // 양초는 18:55에 끝나고 함께 출발 19:25까지 30분 기다림
  });

  it('집 담당·직행자·함께 라벨 구분: 같은 시각이라도 사람별 줄은 사람별 묶음', () => {
    const lanes = gs(tl).map((g) => g.lane);
    expect(lanes).toEqual(['yangcho', 'yangcho', 'tawi', 'tawi', 'joint', 'joint', 'both', 'joint']);
  });

  it('샤워·귀가는 두 사람의 시각·상태·단계가 모두 같을 때만 합치고, 세부 행은 사람별로 모두 남는다', () => {
    const after = gs(tl).find((g) => g.key === 'both:after')!;
    expect(after.rows.map((r) => `${r.node.lane}.${r.node.label}`)).toEqual(['yangcho.샤워 끝', 'tawi.샤워 끝', 'yangcho.귀가', 'tawi.귀가']);
  });

  it('한 사람만 샤워를 끝냈다면 시각이 같아도 합치지 않는다', () => {
    let s = newDay();
    s = must(completeStep(s, 'yangcho', 'station_arrival', C('18:20'), 'yangcho'));
    s = must(completeStep(s, 'yangcho', 'shower', C('21:20'), 'yangcho'));
    const groups = gs(tlOf(s, C('21:20')));
    expect(groups.some((g) => g.key === 'both:after')).toBe(false);
    expect(groups.find((g) => g.key === 'yangcho:after')?.state).toBe('partial');
    expect(groups.find((g) => g.key === 'tawi:after')?.state).toBe('pending');
  });

  it('일부만 완료하면 진행 상태가 partial이고 2/3처럼 센다', () => {
    let s = newDay();
    s = must(completeStep(s, 'yangcho', 'home_arrival', C('18:30'), 'yangcho'));
    s = must(completeStep(s, 'yangcho', 'change_clothes', C('18:35'), 'yangcho'));
    s = must(completeStep(s, 'yangcho', 'snack', C('18:50'), 'yangcho'));
    const prep = gs(tlOf(s, C('18:51'))).find((g) => g.key === 'yangcho:prep')!;
    expect([prep.state, prep.doneCount, prep.stepCount]).toEqual(['partial', 2, 3]);
    const commute = gs(tlOf(s, C('18:51'))).find((g) => g.key === 'yangcho:commute')!;
    // 집 도착을 기록했으면 역 도착은 지나간 일(건너뜀)로 볼 뿐, 실제 완료로 기록하지는 않는다
    const station = commute.rows.find((r) => r.node.id === 'station_arrival')!.node;
    expect(station.state).toBe('skipped');
    expect(station.actual).toBeNull();
    expect(commute.state).toBe('resolved'); // 기록 1 + 건너뜀 1: 완료(done)가 아니다
    expect([commute.doneCount, commute.skippedCount, commute.timeBasis]).toEqual([1, 1, 'mixed']);
  });
});

describe('타임라인 묶음: 선택한 계획에 필요한 단계만', () => {
  it('PLAN B (양초 집 담당): 타위는 직행 묶음, 양초는 준비 + 헬스장 이동, 함께 이동 묶음은 없다', () => {
    const tl = tlOf(must(setPlan(newDay(), 'B', 'yangcho')));
    const keys = gs(tl).map((g) => g.key);
    expect(keys).toContain('tawi:direct');
    expect(keys).toContain('yangcho:prep');
    expect(keys).toContain('yangcho:to_gym');
    expect(keys).not.toContain('joint:together_move');
    expect(keys.filter((k) => k.startsWith('tawi:prep'))).toEqual([]);
    const direct = gs(tl).find((g) => g.key === 'tawi:direct')!;
    expect(range(direct)).toBe('18:50~19:05');
    const prep = gs(tl).find((g) => g.key === 'yangcho:prep')!;
    expect(prep.rows.map((r) => [r.node.label, r.minutes])).toEqual([['환복', 5], ['간식', 15], ['내 짐·상대 짐 챙기기', 5]]);
  });

  it('PLAN B (타위 집 담당)도 대칭이다', () => {
    const keys = gs(tlOf(must(setPlan(newDay(), 'B', 'tawi')))).map((g) => g.key);
    expect(keys).toContain('yangcho:direct');
    expect(keys).toContain('tawi:prep');
    expect(keys).toContain('tawi:to_gym');
  });

  it('저녁 먼저: 저녁 → 식후 대기와 식후 운동 준비 → 함께 이동 → 운동 → 샤워·귀가, 운동 후 저녁 묶음은 없다', () => {
    const tl = tlOf(must(setMealOrder(newDay(), 'before')));
    const g = gs(tl);
    expect(g.map((x) => x.kind)).toEqual(expect.arrayContaining(['dinner', 'post_meal_wait', 'prep', 'together_move', 'workout', 'after']));
    expect(g.filter((x) => x.kind === 'dinner')).toHaveLength(1);
    expect(g.find((x) => x.kind === 'prep')!.label).toBe('식후 운동 준비');
    const order = g.map((x) => x.kind);
    expect(order.indexOf('dinner')).toBeLessThan(order.indexOf('workout'));
    expect(order.indexOf('workout')).toBeLessThan(order.indexOf('after'));
  });

  it('계산할 수 없는 노드(시각 없음)만 있는 묶음은 blocked로 표시하고 맨 뒤에 둔다', () => {
    const tl = computeTimeline(makeInput({ eta: { yangcho: [], tawi: [] } }));
    const g = gs(tl);
    expect(g.length).toBeGreaterThan(0);
    expect(g.every((x) => x.state === 'blocked')).toBe(true);
  });
});
