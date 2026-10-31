// 옛 프로토타입 tests/passport.test.ts에서 가져온 시험이에요 (2026-11-01, 브리프 충돌 7 수정).
// 순수 계산 부분(설정·진행·완주 순번·한 번에 여러 완주)만 그대로 옮겼어요.
// 옛 "기록 묶음(LogBook)" 시험은 DB 기록으로 바뀌어서 tests/couple-app.test.ts의 Era 합계 시험이 대신해요.
import { describe, expect, it } from "vitest";
import { LAP_M, LAP_THRESHOLDS_M, PASSPORT_TRAILS, TRAILS_PER_LAP } from "../lib/era/eras";
import {
  completedLapCount,
  completedTrailCount,
  completionChange,
  formatPercent,
  passportProgress,
  trailEventAt,
} from "../lib/era/passport";

describe('설정: 공식 5개 트레일', () => {
  it('이름·순서·거리·합계·기준선', () => {
    expect(PASSPORT_TRAILS.map((t) => t.name)).toEqual(['Machu Picchu', 'Mirador Base Torres', 'Laguna Capri', 'Chorrillo del Salto', 'Perito Moreno Glacier Minitrekking']);
    expect(PASSPORT_TRAILS.map((t) => t.shortName)).toEqual(['Machu Picchu', 'Base Torres', 'Laguna Capri', 'Chorrillo', 'Perito Moreno']);
    expect(PASSPORT_TRAILS.map((t) => t.distanceM)).toEqual([1500, 20000, 8000, 3000, 4000]);
    expect(TRAILS_PER_LAP).toBe(5);
    expect(LAP_M).toBe(36500);
    expect(LAP_THRESHOLDS_M).toEqual([1500, 21500, 29500, 32500, 36500]);
    expect(PASSPORT_TRAILS.every((t) => t.distanceM % 100 === 0)).toBe(true); // 저장된 정수 미터(100m 단위)와 호환
  });
});

describe('진행 계산: 0km 시작과 경계', () => {
  it('0km: 1회차 Machu Picchu 0/1.5km, 완주 없음, 0.0%', () => {
    const p = passportProgress(0);
    expect(p).toMatchObject({ lap: 1, trailNumber: 1, trailDoneM: 0, trailTotalM: 1500, trailLeftM: 1500, completedTrails: 0, completedLaps: 0, percentTenths: 0 });
    expect(p.trail.name).toBe('Machu Picchu');
    expect(p.trails).toEqual(['current', 'next', 'next', 'next', 'next']);
    expect(formatPercent(p.percentTenths)).toBe('0.0');
  });

  it('기준선 바로 전·바로 그 순간·바로 다음', () => {
    expect(passportProgress(1400)).toMatchObject({ trailNumber: 1, trailDoneM: 1400, completedTrails: 0 });
    const at = passportProgress(1500); // 정확히 1.5km: 1번 완주, 2번 트레일 0/20km
    expect(at).toMatchObject({ trailNumber: 2, trailDoneM: 0, trailTotalM: 20000, completedTrails: 1, lap: 1 });
    expect(at.trails).toEqual(['done', 'current', 'next', 'next', 'next']);
    expect(passportProgress(21500)).toMatchObject({ trailNumber: 3, trailDoneM: 0, completedTrails: 2 });
    expect(passportProgress(29500)).toMatchObject({ trailNumber: 4, trailDoneM: 0, completedTrails: 3 });
    expect(passportProgress(32500)).toMatchObject({ trailNumber: 5, trailDoneM: 0, trailTotalM: 4000, completedTrails: 4 });
    expect(passportProgress(36400)).toMatchObject({ lap: 1, trailNumber: 5, trailLeftM: 100, completedTrails: 4, completedLaps: 0 });
  });

  it('정확히 36.5km: 1회차 완주 인정, 2회차 Machu Picchu 0/1.5km, 100.0%', () => {
    const p = passportProgress(36500);
    expect(p).toMatchObject({ lap: 2, trailNumber: 1, trailDoneM: 0, trailTotalM: 1500, completedTrails: 5, completedLaps: 1, totalM: 36500 });
    expect(p.trails).toEqual(['current', 'next', 'next', 'next', 'next']);
    expect(formatPercent(p.percentTenths)).toBe('100.0');
  });

  it('37.5km: 2회차 Machu Picchu 1/1.5km (초과분은 다음 회차로, 누적은 그대로)', () => {
    const p = passportProgress(37500);
    expect(p).toMatchObject({ lap: 2, trailNumber: 1, trailDoneM: 1000, trailLeftM: 500, completedTrails: 5, completedLaps: 1, totalM: 37500 });
    expect(formatPercent(p.percentTenths)).toBe('102.7');
  });

  it('73km = 200.0%, 80km = 3회차 첫 트레일 완주(11번째 완주)', () => {
    const p73 = passportProgress(73000);
    expect(p73).toMatchObject({ lap: 3, trailNumber: 1, trailDoneM: 0, completedTrails: 10, completedLaps: 2 });
    expect(formatPercent(p73.percentTenths)).toBe('200.0');
    const p80 = passportProgress(80000); // 80,000 − 73,000 = 7,000 → 1번 완주(1,500), 2번 트레일 5,500/20,000
    expect(p80).toMatchObject({ lap: 3, trailNumber: 2, trailDoneM: 5500, completedTrails: 11, completedLaps: 2 });
    expect(trailEventAt(10)).toMatchObject({ ordinal: 11, lap: 3, trailNumber: 1 });
    expect(p80.trails).toEqual(['done', 'current', 'next', 'next', 'next']);
  });

  it('300% 이상도 초기화 없이 커져요', () => {
    expect(formatPercent(passportProgress(109500).percentTenths)).toBe('300.0');
    expect(passportProgress(109500).lap).toBe(4);
  });

  it('잘못된 거리는 거부해요', () => {
    expect(() => passportProgress(-1)).toThrow();
    expect(() => passportProgress(1.5)).toThrow();
    expect(() => passportProgress(Number.NaN)).toThrow();
    expect(() => completedTrailCount(-100)).toThrow();
    expect(() => trailEventAt(-1)).toThrow();
  });
});

describe('완주 순번: 0부터/1부터를 분명히', () => {
  it('index는 0부터, ordinal·lap·trailNumber는 1부터', () => {
    expect(trailEventAt(0)).toMatchObject({ index: 0, ordinal: 1, lap: 1, trailIndex: 0, trailNumber: 1 });
    expect(trailEventAt(4)).toMatchObject({ index: 4, ordinal: 5, lap: 1, trailIndex: 4, trailNumber: 5 }); // 5번째 완주 = 1회차 마지막
    expect(trailEventAt(4).trail.name).toBe('Perito Moreno Glacier Minitrekking');
    expect(trailEventAt(5)).toMatchObject({ index: 5, ordinal: 6, lap: 2, trailIndex: 0, trailNumber: 1 }); // 6번째 완주 = 2회차 첫 번째
    expect(trailEventAt(5).trail.name).toBe('Machu Picchu');
    expect(trailEventAt(9)).toMatchObject({ lap: 2, trailNumber: 5 });
  });

  it('완주 수는 누적 거리가 늘면 절대 줄지 않아요 (100m 단위로 전 구간 확인)', () => {
    let prevT = 0;
    let prevL = 0;
    for (let m = 0; m <= 200000; m += 100) {
      const t = completedTrailCount(m);
      const l = completedLapCount(m);
      expect(t).toBeGreaterThanOrEqual(prevT);
      expect(l).toBeGreaterThanOrEqual(prevL);
      expect(t - prevT).toBeLessThanOrEqual(1); // 100m 한 칸에 2개 이상 넘는 일은 없음
      expect(l).toBe(Math.floor(t / 5)); // 전체 완주 = 5의 배수 번째 트레일 완주와 항상 같이
      prevT = t;
      prevL = l;
    }
  });
});

describe('여러 트레일·여러 회차를 한 번에 지날 때', () => {
  it('1.0km → 22.0km: 1번·2번 트레일 모두 인정', () => {
    const c = completionChange(1000, 22000);
    expect(c.trailsGained.map((e) => [e.lap, e.trailNumber])).toEqual([[1, 1], [1, 2]]);
    expect(c.lapsGained).toEqual([]);
    expect(c.trailsLost).toEqual([]);
    expect(passportProgress(22000)).toMatchObject({ trailNumber: 3, trailDoneM: 500 });
  });

  it('0 → 36.5km: 5개 모두 + 1회차 전체 완주', () => {
    const c = completionChange(0, 36500);
    expect(c.trailsGained.map((e) => e.ordinal)).toEqual([1, 2, 3, 4, 5]);
    expect(c.lapsGained.map((e) => e.lap)).toEqual([1]);
  });

  it('36.0km → 37.0km: 5번 트레일과 1회차 전체 완주(회차 경계에서 빠뜨리지 않음)', () => {
    const c = completionChange(36000, 37000);
    expect(c.trailsGained.map((e) => [e.lap, e.trailNumber])).toEqual([[1, 5]]);
    expect(c.lapsGained.map((e) => e.lap)).toEqual([1]);
  });

  it('35.0km → 38.0km: 5번 완주와 전체 완주, 2회차 1번 트레일 완주까지', () => {
    const c = completionChange(35000, 38000);
    expect(c.trailsGained.map((e) => [e.lap, e.trailNumber])).toEqual([[1, 5], [2, 1]]);
    expect(c.lapsGained.map((e) => e.lap)).toEqual([1]);
  });

  it('0 → 80km: 11개 트레일(1·2회차 전부 + 3회차 1번), 전체 완주 2회', () => {
    const c = completionChange(0, 80000);
    expect(c.trailsGained).toHaveLength(11);
    expect(c.trailsGained.map((e) => e.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(c.trailsGained[10]).toMatchObject({ lap: 3, trailNumber: 1 });
    expect(c.lapsGained.map((e) => e.lap)).toEqual([1, 2]);
  });

  it('변화가 없으면 아무것도 없어요', () => {
    const c = completionChange(5000, 5000);
    expect(c).toEqual({ trailsGained: [], lapsGained: [], trailsLost: [], lapsLost: [] });
  });

  it('줄어들면 사라지는 완주를 알려주고, 다시 늘면 같은 완주가 돌아와요 (지급·회수는 하지 않음)', () => {
    const down = completionChange(22000, 21000);
    expect(down.trailsLost.map((e) => [e.lap, e.trailNumber])).toEqual([[1, 2]]);
    expect(down.trailsGained).toEqual([]);
    const up = completionChange(21000, 22000);
    expect(up.trailsGained).toEqual(down.trailsLost);
    const lapDown = completionChange(37500, 36000);
    expect(lapDown.lapsLost.map((e) => e.lap)).toEqual([1]);
    expect(lapDown.trailsLost.map((e) => [e.lap, e.trailNumber])).toEqual([[1, 5]]);
  });
});
