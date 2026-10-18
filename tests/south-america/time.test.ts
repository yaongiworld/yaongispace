import { describe, expect, it } from 'vitest';
import { clockToPlanMinutes, fmt, formatClock, planDayOf } from '@/lib/south-america/domain/time';

describe('시간 도우미: 자정 이후와 새벽 04:00 경계 [P-130]', () => {
  it('저녁 시각은 그대로, 00:00~03:59는 전날 일정의 연장이다', () => {
    expect(clockToPlanMinutes('19:40')).toBe(19 * 60 + 40);
    expect(clockToPlanMinutes('00:30')).toBe(1440 + 30);
    expect(clockToPlanMinutes('03:59')).toBe(1440 + 3 * 60 + 59);
  });

  it('04:00은 새 하루의 시작이라 연장되지 않는다', () => {
    expect(clockToPlanMinutes('04:00')).toBe(4 * 60);
    expect(clockToPlanMinutes('23:59')).toBe(23 * 60 + 59);
  });

  it('자정을 넘기면 +1로 표시한다', () => {
    expect(formatClock(clockToPlanMinutes('00:45'))).toEqual({ hhmm: '00:45', dayOffset: 1 });
    expect(fmt(clockToPlanMinutes('00:45'))).toBe('00:45+1');
    expect(fmt(clockToPlanMinutes('22:05'))).toBe('22:05');
  });

  it('잘못된 시각 형식은 알려 준다', () => {
    expect(() => clockToPlanMinutes('25:00')).toThrow(RangeError);
    expect(() => clockToPlanMinutes('7pm')).toThrow(RangeError);
    expect(() => clockToPlanMinutes('19:60')).toThrow(RangeError);
  });

  it('새벽 4시 전에 한 기록은 전날 일정에 속한다 (한국 시간)', () => {
    expect(planDayOf('2026-10-16T00:30:00+09:00')).toBe('2026-10-15');
    expect(planDayOf('2026-10-16T03:59:00+09:00')).toBe('2026-10-15');
    expect(planDayOf('2026-10-16T04:00:00+09:00')).toBe('2026-10-16');
    expect(planDayOf('2026-10-15T23:59:00+09:00')).toBe('2026-10-15');
  });

  it('다른 시간대로 적힌 같은 순간도 한국 시간으로 판단한다', () => {
    // 2026-10-15 15:30 UTC = 한국 10/16 00:30 → 10/15 일정
    expect(planDayOf('2026-10-15T15:30:00Z')).toBe('2026-10-15');
    // 2026-10-15 19:00 UTC = 한국 10/16 04:00 → 10/16 일정
    expect(planDayOf('2026-10-15T19:00:00Z')).toBe('2026-10-16');
  });
});

import { addDays, instantOfPlanMinute, isPlanDay, planDayStart, planMinuteOfInstant, planMinutesOf } from '@/lib/south-america/domain/time';

describe('날짜와 실제 순간의 변환 (04:00 경계와 자정 이후 운동)', () => {
  it('날짜 형식과 날짜 더하기', () => {
    expect(isPlanDay('2026-10-15')).toBe(true);
    expect(isPlanDay('2026-02-30')).toBe(false);
    expect(isPlanDay('10/15')).toBe(false);
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(() => addDays('내일', 1)).toThrow(RangeError);
  });

  it('계획 하루 00:00은 한국 시간 자정이다', () => {
    expect(planDayStart('2026-10-15').toISOString()).toBe('2026-10-14T15:00:00.000Z');
  });

  it('자정 이후 운동(00:30)은 그 전날 계획 하루에 속하고 실제 순간은 다음 달력 날짜 새벽이다', () => {
    const t = instantOfPlanMinute('2026-10-15', clockToPlanMinutes('00:30')); // 1470분
    expect(t.toISOString()).toBe('2026-10-15T15:30:00.000Z'); // 한국 10/16 00:30
    expect(planDayOf(t)).toBe('2026-10-15'); // 04:00 전이라 여전히 10/15 일정
    expect(planMinutesOf(t)).toBe(1470);
    expect(planMinuteOfInstant('2026-10-15', t)).toBe(1470);
  });

  it('03:59는 같은 계획 하루, 04:00은 다음 계획 하루의 시작(0분 근처)이다', () => {
    const last = instantOfPlanMinute('2026-10-15', 1440 + 3 * 60 + 59);
    const first = new Date(last.getTime() + 60_000);
    expect(planDayOf(last)).toBe('2026-10-15');
    expect(planDayOf(first)).toBe('2026-10-16');
    expect(planMinuteOfInstant('2026-10-16', first)).toBe(4 * 60);
    expect(planMinuteOfInstant('2026-10-15', first)).toBe(1440 + 4 * 60);
  });

  it('실제 순간 ↔ 분 변환은 왕복해도 같고, 하루 시작 전은 음수다', () => {
    for (const m of [0, 1, 599, 1200, 1440, 1679, 1680]) {
      expect(planMinuteOfInstant('2026-10-15', instantOfPlanMinute('2026-10-15', m))).toBe(m);
    }
    expect(planMinuteOfInstant('2026-10-15', '2026-10-14T14:59:00.000Z')).toBe(-1);
    expect(() => planMinuteOfInstant('2026-10-15', 'abc')).toThrow(RangeError);
  });
});
