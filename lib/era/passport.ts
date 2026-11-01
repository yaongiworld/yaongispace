// 하이킹 패스포트 진행 계산 [6-A]. 옛 프로토타입 src/domain/passport/progress.ts에서 그대로 가져왔어요(2026-11-01, 브리프 충돌 7 수정).
// 바뀐 것은 설정을 읽는 위치(./eras)뿐이에요. 누적 거리는 lib/era/store.ts가 DB의 유산소 기록에서 더해요.
// 저장하지 않고 "실제 유산소 누적 거리(미터)"에서 매번 계산해요.
// 기록을 수정·취소·복구하면 누적이 바뀌고, 진행 상태는 저절로 다시 계산돼요. 보상 지급·회수는 여기에 없어요(6-C).
//
// 번호 규칙 (헷갈리지 않게 고정):
//  - 트레일 완주 "순번" index는 0부터: index 0 = 1회차 1번 트레일, index 4 = 1회차 5번 트레일(회차의 마지막), index 5 = 2회차 1번 트레일.
//  - ordinal은 index + 1 ("n번째 완주", 1부터). lap(회차)과 trailNumber(트레일 번호)도 1부터 세요.
//  - 전체 완주 index도 0부터: index 0 = 1회차 전체 완주. 전체 완주 횟수 = floor(누적 ÷ 36,500).
import { LAP_M, LAP_THRESHOLDS_M, PASSPORT_TRAILS, TRAILS_PER_LAP, type PassportTrail } from './eras';

/** 트레일 한 개 완주 이벤트 */
export type TrailEvent = {
  /** 완주 순번 (0부터) */
  index: number;
  /** n번째 완주 (1부터) */
  ordinal: number;
  /** 회차 (1부터) */
  lap: number;
  /** 회차 안의 위치 (0부터) */
  trailIndex: number;
  /** 트레일 번호 (1부터) */
  trailNumber: number;
  trail: PassportTrail;
};

/** 한 회차 전체(36.5km) 완주 이벤트 */
export type LapEvent = {
  /** 전체 완주 순번 (0부터) */
  index: number;
  /** 회차 (1부터) = index + 1 */
  lap: number;
};

const assertMeters = (m: number) => {
  if (!Number.isSafeInteger(m) || m < 0) throw new RangeError(`거리는 0 이상의 정수 미터여야 해요: ${m}`);
};

/** 완주 순번 → 이벤트 */
export function trailEventAt(index: number): TrailEvent {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError(`완주 순번은 0 이상의 정수예요: ${index}`);
  const trailIndex = index % TRAILS_PER_LAP;
  return { index, ordinal: index + 1, lap: Math.floor(index / TRAILS_PER_LAP) + 1, trailIndex, trailNumber: trailIndex + 1, trail: PASSPORT_TRAILS[trailIndex] };
}

export const lapEventAt = (index: number): LapEvent => {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError(`전체 완주 순번은 0 이상의 정수예요: ${index}`);
  return { index, lap: index + 1 };
};

/** 지금까지 완주한 트레일 수 (모든 회차 합). 누적 거리가 늘면 절대 줄지 않아요 */
export function completedTrailCount(totalM: number): number {
  assertMeters(totalM);
  const laps = Math.floor(totalM / LAP_M);
  const inLap = totalM - laps * LAP_M;
  return laps * TRAILS_PER_LAP + LAP_THRESHOLDS_M.filter((t) => t <= inLap).length;
}

/** 지금까지 36.5km 전체를 완주한 횟수 */
export function completedLapCount(totalM: number): number {
  assertMeters(totalM);
  return Math.floor(totalM / LAP_M);
}

export type TrailStatus = 'done' | 'current' | 'next';

export type PassportProgress = {
  /** 전체 누적 거리(미터). 초기화하지 않아요 */
  totalM: number;
  /** 지금까지 완주한 트레일 수 / 전체 완주 횟수 */
  completedTrails: number;
  completedLaps: number;
  /** 지금 진행 중인 회차 (1부터) */
  lap: number;
  /** 이번 회차에서 지금까지 간 거리(미터) */
  lapM: number;
  /** 지금 진행 중인 트레일 (0부터 위치 / 1부터 번호) */
  trailIndex: number;
  trailNumber: number;
  trail: PassportTrail;
  /** 이 트레일에서 간 거리 / 이 트레일의 목표 거리 / 남은 거리(미터) */
  trailDoneM: number;
  trailTotalM: number;
  trailLeftM: number;
  /** 이번 회차 트레일 5개의 상태 */
  trails: TrailStatus[];
  /** 달성률(전체 누적 ÷ 36.5km × 100)을 1/10 % 단위로 (정수 계산, 반올림 없이 버림). 100% 넘을 수 있어요 */
  percentTenths: number;
};

/** 누적 거리(미터)로 지금 어디쯤인지 계산해요 */
export function passportProgress(totalM: number): PassportProgress {
  assertMeters(totalM);
  const completedLaps = Math.floor(totalM / LAP_M);
  const lapM = totalM - completedLaps * LAP_M;
  const passed = LAP_THRESHOLDS_M.filter((t) => t <= lapM).length; // lapM < 36,500 이라 마지막 기준선은 포함되지 않아요
  const trailIndex = passed; // 0..4
  const base = passed === 0 ? 0 : LAP_THRESHOLDS_M[passed - 1];
  const trail = PASSPORT_TRAILS[trailIndex];
  const trailDoneM = lapM - base;
  return {
    totalM,
    completedTrails: completedLaps * TRAILS_PER_LAP + passed,
    completedLaps,
    lap: completedLaps + 1,
    lapM,
    trailIndex,
    trailNumber: trailIndex + 1,
    trail,
    trailDoneM,
    trailTotalM: trail.distanceM,
    trailLeftM: trail.distanceM - trailDoneM,
    trails: PASSPORT_TRAILS.map((_, i): TrailStatus => (i < trailIndex ? 'done' : i === trailIndex ? 'current' : 'next')),
    percentTenths: Math.floor((totalM * 1000) / LAP_M),
  };
}

/** 1/10 % 정수를 "200.0" 모양으로 */
export const formatPercent = (tenths: number): string => `${Math.floor(tenths / 10)}.${tenths % 10}`;

export type CompletionChange = {
  /** 새로 인정된 트레일 완주 (순번 오름차순) */
  trailsGained: TrailEvent[];
  /** 새로 인정된 36.5km 전체 완주 */
  lapsGained: LapEvent[];
  /** 누적이 줄어서 사라진 트레일 완주 (순번 내림차순이 아니라 오름차순) */
  trailsLost: TrailEvent[];
  lapsLost: LapEvent[];
};

const range = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);

/**
 * 누적 거리가 prevM → nextM 으로 바뀔 때 새로 인정되거나 사라지는 완주를 모두 알려줘요.
 * 한 기록이 여러 트레일이나 여러 회차를 한꺼번에 지나도 하나도 빠뜨리지 않아요(완주 수의 차이만큼 순번을 이어서 만들어요).
 * 지급·회수는 하지 않아요. 6-C가 이 결과를 쓸 수 있도록 순수하게 계산만 해요.
 */
export function completionChange(prevM: number, nextM: number): CompletionChange {
  const t0 = completedTrailCount(prevM);
  const t1 = completedTrailCount(nextM);
  const l0 = completedLapCount(prevM);
  const l1 = completedLapCount(nextM);
  return {
    trailsGained: range(t0, t1).map(trailEventAt),
    lapsGained: range(l0, l1).map(lapEventAt),
    trailsLost: range(t1, t0).map(trailEventAt),
    lapsLost: range(l1, l0).map(lapEventAt),
  };
}
