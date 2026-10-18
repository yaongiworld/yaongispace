// 5-A 유산소: 거리 입력은 0.1km 단위, 정수 미터 저장, 소수점 둘째 자리는 반올림 없이 거부, 환산 없는 1:1 합산.
import { describe, expect, it } from 'vitest';
import { formatKm, isValidDistanceM, kmToMeters } from '@/lib/south-america/domain/exercise/distance';

describe('거리 입력 (km → 정수 미터)', () => {
  it('소수점 첫째 자리까지 허용한다', () => {
    expect(kmToMeters('3')).toEqual({ ok: true, meters: 3000 });
    expect(kmToMeters('3.0')).toEqual({ ok: true, meters: 3000 });
    expect(kmToMeters('5.5')).toEqual({ ok: true, meters: 5500 });
    expect(kmToMeters('8.2')).toEqual({ ok: true, meters: 8200 });
    expect(kmToMeters('0.1')).toEqual({ ok: true, meters: 100 });
    expect(kmToMeters('  12.3 ')).toEqual({ ok: true, meters: 12300 });
    expect(kmToMeters(8.2)).toEqual({ ok: true, meters: 8200 });
    expect(kmToMeters(3)).toEqual({ ok: true, meters: 3000 });
  });

  it('소수점 둘째 자리는 반올림하지 않고 거부한다 (후행 0도 거부)', () => {
    for (const v of ['2.75', '2.50', '3.00', '5.55', '0.05', '8.21', 2.75, 0.1 + 0.2]) {
      expect(kmToMeters(v)).toEqual({ ok: false, reason: 'distance_precision' });
    }
  });

  it('0, 음수, 숫자가 아닌 값, 지수 표기, 빈 값은 거부한다', () => {
    for (const v of ['0', '0.0', '-1', '-0.1', '', ' ', 'abc', '3km', '3,5', '.5', '3.', '1e3', 'Infinity', 0, -2, Number.NaN, Number.POSITIVE_INFINITY, 1e-7]) {
      expect(kmToMeters(v)).toMatchObject({ ok: false });
    }
  });

  it('저장해도 되는 거리는 0보다 큰 정수 미터이고 100의 배수다', () => {
    expect([100, 3000, 8200, 42195_00].every(isValidDistanceM)).toBe(true);
    for (const v of [0, -100, 150, 2750, 3000.5, Number.NaN, '3000', null, undefined, Number.MAX_SAFE_INTEGER + 1]) expect(isValidDistanceM(v)).toBe(false);
  });
});

describe('거리 표시와 1:1 합산', () => {
  it('정수 미터를 소수점 첫째 자리로 보여 준다', () => {
    expect(formatKm(3000)).toBe('3.0');
    expect(formatKm(8200)).toBe('8.2');
    expect(formatKm(11200)).toBe('11.2');
    expect(formatKm(100)).toBe('0.1');
    expect(formatKm(35000)).toBe('35.0');
    expect(formatKm(123400)).toBe('123.4');
  });

  it('러닝 3.0km + 사이클 8.2km = 11.2km (환산 없음)', () => {
    const a = kmToMeters('3.0');
    const b = kmToMeters('8.2');
    if (!a.ok || !b.ok) throw new Error('거리 변환 실패');
    expect(formatKm(a.meters + b.meters)).toBe('11.2');
  });

  it('0.1km 입력 1000건을 더해도 오차가 없다 (정수 미터 덧셈)', () => {
    const one = kmToMeters('0.1');
    if (!one.ok) throw new Error('거리 변환 실패');
    let sum = 0;
    for (let i = 0; i < 1000; i++) sum += one.meters;
    expect(sum).toBe(100_000);
    expect(formatKm(sum)).toBe('100.0');
    // 부동소수로 더하면 어긋나는 예: 0.1을 10번 더해도 1이 아님 — 우리는 정수라 정확하다
    expect([...Array(10)].reduce((s: number) => s + 0.1, 0)).not.toBe(1);
    expect(formatKm(10 * one.meters)).toBe('1.0');
  });
});
