// 타임라인 계산이 함께 쓰는 작은 규칙들. 분 단위 숫자는 모두 설정(timeSettings)에서 읽어요.
import type { PersonTimeSettings } from '../../config/timeSettings';

export type PrepStep = { id: 'change' | 'snack' | 'pack'; label: string; minutes: number };

/**
 * 운동 전 준비 단계 목록 [P-142]
 * - 'a'        : PLAN A (또는 운동 후 저녁의 일반 준비). 환복 + 간식 + 짐 챙기기
 * - 'b_home'   : PLAN B 집 담당. 짐 챙기기는 내 짐과 상대 짐을 합쳐 총 시간 하나 (5분+5분으로 더하지 않아요)
 * - 'post_meal': 저녁 먼저 날의 식후 준비. 간식은 이미 먹었으니 뺍니다
 */
export function prepSteps(s: PersonTimeSettings, kind: 'a' | 'b_home' | 'post_meal'): PrepStep[] {
  const change: PrepStep = { id: 'change', label: '환복', minutes: s.changeClothes };
  const snack: PrepStep = { id: 'snack', label: '간식', minutes: s.snack };
  switch (kind) {
    case 'a':
      return [change, snack, { id: 'pack', label: '짐 챙기기', minutes: s.packBag }];
    case 'b_home':
      return [change, snack, { id: 'pack', label: '내 짐·상대 짐 챙기기', minutes: s.packBagBHome }];
    case 'post_meal':
      return [change, { id: 'pack', label: '짐 챙기기', minutes: s.packBag }];
  }
}

export const sumMinutes = (steps: PrepStep[]): number => steps.reduce((acc, x) => acc + x.minutes, 0);

export const describeSteps = (steps: PrepStep[]): string =>
  `${steps.map((x) => `${x.label} ${x.minutes}분`).join(' + ')} = ${sumMinutes(steps)}분`;
