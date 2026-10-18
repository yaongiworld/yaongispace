// 거리 입력·표시 [사용자 승인 2026-10-18]: 0.1km 단위, 내부는 정수 미터, 반올림 없음.
// 문자열을 소수로 바꿔 계산하지 않고 글자 그대로 나눠서 미터로 바꿔요 (부동소수 오차가 끼어들 틈이 없어요).

export type DistanceError = 'invalid_distance' | 'distance_precision';
export type DistanceResult = { ok: true; meters: number } | { ok: false; reason: DistanceError };

/**
 * 입력한 km를 정수 미터로 바꿔요.
 * - 허용: "3", "3.0", "5.5", "8.2" (소수점 첫째 자리까지, 0보다 커야 함)
 * - 거부: 소수점 둘째 자리 이상 ("2.75", "2.50" 모두 — 반올림하지 않아요), 0, 음수, 숫자가 아닌 값, 지수 표기
 * 숫자(number)로 들어오면 글자로 바꿔서 같은 규칙을 적용해요 (0.1+0.2 같은 값은 거부돼요).
 */
export function kmToMeters(input: string | number): DistanceResult {
  const text = typeof input === 'number' ? (Number.isFinite(input) ? String(input) : '') : input.trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) return { ok: false, reason: 'invalid_distance' };
  const frac = m[2] ?? '';
  if (frac.length > 1) return { ok: false, reason: 'distance_precision' };
  const meters = Number(m[1]) * 1000 + (frac === '' ? 0 : Number(frac) * 100);
  if (!Number.isSafeInteger(meters) || meters <= 0) return { ok: false, reason: 'invalid_distance' };
  return { ok: true, meters };
}

/** 저장해도 되는 거리인지: 0보다 큰 정수 미터이고 100의 배수 */
export const isValidDistanceM = (m: unknown): m is number => typeof m === 'number' && Number.isSafeInteger(m) && m > 0 && m % 100 === 0;

/** 정수 미터를 "11.2" 모양(소수점 첫째 자리)으로. 정수 계산만 써요 */
export function formatKm(meters: number): string {
  const tenths = Math.floor(meters / 100);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}
