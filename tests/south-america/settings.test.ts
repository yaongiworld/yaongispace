import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIME_SETTINGS,
  TIME_SETTING_META,
  createTimeSettings,
  prepTotalMinutes,
  resolveSharedTimes,
  validateTimeSettings,
  type PersonTimeSettings,
} from '@/lib/south-america/config/timeSettings';

describe('2-1 시간 설정: 기본값 [D-150]', () => {
  it('양초와 타위의 기본값이 같다 (침대 목표만 양초에게 있다)', () => {
    const { bedTarget: yBed, ...y } = DEFAULT_TIME_SETTINGS.yangcho;
    const { bedTarget: tBed, ...t } = DEFAULT_TIME_SETTINGS.tawi;
    expect(y).toEqual(t);
    expect(yBed).toBe(23 * 60);
    expect(tBed).toBeNull();
  });

  it('요청한 기본 숫자와 정확히 같다', () => {
    const s = DEFAULT_TIME_SETTINGS.yangcho;
    expect(s).toMatchObject({
      stationToHome: 10,
      homeToGym: 15,
      gymToHome: 15,
      changeClothes: 5,
      snack: 15,
      packBag: 5,
      shower: 25,
      dinnerPrep: 30,
      dinnerEat: 30,
      postMealWait: 30,
    });
  });

  it('운동 전 준비 합계는 각자 25분이다 (환복 5 + 간식 15 + 짐 5, 계산값)', () => {
    expect(prepTotalMinutes(DEFAULT_TIME_SETTINGS.yangcho)).toBe(25);
    expect(prepTotalMinutes(DEFAULT_TIME_SETTINGS.tawi)).toBe(25);
  });

  it('PLAN B 집 담당의 짐 챙기기 총 시간은 5분이다 (5+5=10으로 합산하지 않는다)', () => {
    expect(DEFAULT_TIME_SETTINGS.yangcho.packBagBHome).toBe(5);
    expect(DEFAULT_TIME_SETTINGS.tawi.packBagBHome).toBe(5);
  });
});

describe('2-1 시간 설정: 미설정 이동시간 [D-151, D-154]', () => {
  it('자동차 회사→집, 회사→헬스장은 기본이 미설정(null)이고 임의 값이 없다', () => {
    for (const p of ['yangcho', 'tawi'] as const) {
      expect(DEFAULT_TIME_SETTINGS[p].carCompanyToHome).toBeNull();
      expect(DEFAULT_TIME_SETTINGS[p].carCompanyToGym).toBeNull();
    }
  });

  it('지하철 PLAN B 직행(역→헬스장 운동 가능)은 기본 15분이다 [D-160, 사용자 확정]', () => {
    for (const p of ['yangcho', 'tawi'] as const) expect(DEFAULT_TIME_SETTINGS[p].stationToGymDirect).toBe(15);
  });

  it('미설정(null)은 올바른 설정으로 인정되고, 넣으면 그 값이 쓰인다', () => {
    expect(validateTimeSettings(createTimeSettings())).toEqual([]);
    const s = createTimeSettings({ tawi: { carCompanyToHome: 35 } });
    expect(s.tawi.carCompanyToHome).toBe(35);
    expect(s.yangcho.carCompanyToHome).toBeNull();
  });
});

describe('2-1 시간 설정: 개인별 변경과 공동 값', () => {
  it('한 사람의 값만 바꿔도 다른 사람과 기본값은 그대로다', () => {
    const s = createTimeSettings({ yangcho: { shower: 20 } });
    expect(s.yangcho.shower).toBe(20);
    expect(s.tawi.shower).toBe(25);
    expect(DEFAULT_TIME_SETTINGS.yangcho.shower).toBe(25);
  });

  it('샤워 20~25분 범위는 모두 올바른 값이다', () => {
    for (const m of [20, 21, 22, 23, 24, 25]) expect(() => createTimeSettings({ yangcho: { shower: m } })).not.toThrow();
  });

  it('공동 활동(저녁 준비·식사·식후 대기)은 두 사람 값이 다르면 큰 값을 쓴다 [P-145]', () => {
    const s = createTimeSettings({ yangcho: { dinnerPrep: 20, postMealWait: 45 }, tawi: { dinnerPrep: 40, dinnerEat: 25 } });
    expect(resolveSharedTimes(s)).toEqual({ dinnerPrep: 40, dinnerEat: 30, postMealWait: 45 });
  });

  it('기본값은 바꿀 수 없게 얼려 있다', () => {
    expect(Object.isFrozen(DEFAULT_TIME_SETTINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_TIME_SETTINGS.yangcho)).toBe(true);
  });
});

describe('2-1 시간 설정: 값 검사', () => {
  it('0분은 허용하고(그 단계 없음) 음수는 거부한다', () => {
    expect(() => createTimeSettings({ tawi: { snack: 0 } })).not.toThrow();
    expect(() => createTimeSettings({ tawi: { snack: -5 } })).toThrow(RangeError);
  });

  it('소수와 숫자가 아닌 값은 거부한다', () => {
    expect(() => createTimeSettings({ yangcho: { shower: 12.5 } })).toThrow(RangeError);
    expect(() => createTimeSettings({ yangcho: { shower: Number.NaN } })).toThrow(RangeError);
  });

  it('필수 항목을 비울 수는 없다 (null은 선택 항목만)', () => {
    const bad = { ...DEFAULT_TIME_SETTINGS, yangcho: { ...DEFAULT_TIME_SETTINGS.yangcho, shower: null as unknown as number } };
    expect(validateTimeSettings(bad).map((i) => i.problem)).toContain('null_not_allowed');
  });
});

describe('2-1 설정값 중앙 관리', () => {
  it('설정 목록(TIME_SETTING_META)이 모든 설정 항목을 한 번씩 빠짐없이 담고 있다', () => {
    const keys = Object.keys(DEFAULT_TIME_SETTINGS.yangcho) as (keyof PersonTimeSettings)[];
    expect(TIME_SETTING_META.map((m) => m.key).sort()).toEqual([...keys].sort());
  });

  it('계산 코드(compute, desired, compare, rules)에는 10 이상의 분 숫자가 직접 적혀 있지 않다', () => {
    const dir = join(import.meta.dirname, '..', '..', 'lib', 'south-america', 'domain', 'timeline');
    const files: Record<string, string> = {};
    for (const name of ['compute', 'desired', 'compare', 'rules']) files[name] = readFileSync(join(dir, `${name}.ts`), 'utf8');
    expect(Object.keys(files).length).toBe(4);
    for (const [path, src] of Object.entries(files)) {
      const code = src
        .split('\n')
        .map((l) => l.replace(/\/\/.*$/, ''))
        .join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""');
      const literals = code.match(/(?<![\w.])\d{2,}(?![\w])/g) ?? [];
      expect({ path, literals }).toEqual({ path, literals: [] });
    }
  });
});
