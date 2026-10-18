// 시간 설정: 타임라인 계산에 쓰는 "모든 숫자"를 모아 둔 한 곳이에요 (D-150, 07 문서 3장 규칙 6).
// 계산 코드에는 분 단위 숫자를 직접 적지 않고 이 파일의 값만 읽어요.
// 모든 값은 설정에서 개인별로 바꿀 수 있어요. (기본값은 양초와 타위가 같아요.)
import type { PersonId } from '../domain/types';

/** 타임라인 규칙에 쓰는 숫자 (사람이 바꾸는 설정이 아니라 규칙 값) */
export const TIMELINE_RULES = {
  /** 하루의 경계: 새벽 4시 [P-130]. 00:00~03:59는 전날 일정에 속해요 */
  dayBoundaryHour: 4,
  /** 운동 시간 선택지 [D-056] */
  workoutOptions: [60, 75, 90] as readonly number[],
  defaultWorkoutMinutes: 75,
  /** 두 플랜 차이가 이 값(분) 미만이면 추천하지 않아요 [P-033] */
  recommendThresholdMinutes: 10,
  /** 저녁 식사 시작이 이 시각(분) 이후면 사실만 안내해요 [D-022, P-036]: 22:00 */
  lateDinnerNoticeAt: 22 * 60,
  /** 희망 저녁 시각과 예상의 차이가 이 값(분) 미만이면 경고 없이 중립으로 알려요 [사용자 확정 2026-10-13] */
  smallDifferenceMinutes: 10,
} as const;

/** 한 사람의 시간 설정. 단위는 모두 분이에요. null은 "아직 미설정"이에요. */
export type PersonTimeSettings = {
  /** 신도림역 → 집 */
  stationToHome: number;
  /** 집 → 헬스장 (이동 + 락커 포함) */
  homeToGym: number;
  /** 헬스장 → 집 */
  gymToHome: number;
  /** 환복 */
  changeClothes: number;
  /** 간식 */
  snack: number;
  /** 짐 챙기기 (PLAN A 각자, 내 짐) */
  packBag: number;
  /** PLAN B 집 담당의 짐 챙기기 "총" 시간. 자기 짐과 상대 짐을 함께 챙기며 packBag과 더하지 않아요 [D-150, P-144] */
  packBagBHome: number;
  /** 샤워 (헬스장에서) */
  shower: number;
  /** 저녁 준비 (공동 활동: 두 사람 값이 다르면 큰 값) [P-145] */
  dinnerPrep: number;
  /** 저녁 식사 (공동 활동) */
  dinnerEat: number;
  /** 식후 대기: 식사 종료 후 헬스장 출발까지 최소 시간 (공동 활동) [D-157] */
  postMealWait: number;
  /** 자동차 회사 → 집. 미정이라 기본은 null이고 임의로 가정하지 않아요 [D-151] */
  carCompanyToHome: number | null;
  /** 자동차 회사 → 헬스장 운동 가능까지. 미정 [D-151] */
  carCompanyToGym: number | null;
  /** 신도림역 → 헬스장 직행 (운동 가능까지). 지하철 PLAN B 직행자의 이동시간이에요 [D-160] */
  stationToGymDirect: number | null;
  /** 침대 목표 시각(분). 안내에만 쓰고 강제하지 않아요 [D-022]. 양초 23:00 */
  bedTarget: number | null;
};

export type TimeSettings = Record<PersonId, PersonTimeSettings>;

/** 기본값 [D-150]. 양초와 타위가 같고, 침대 목표만 양초에게만 있어요. */
const COMMON_DEFAULTS = {
  stationToHome: 10,
  homeToGym: 15,
  gymToHome: 15,
  changeClothes: 5,
  snack: 15,
  packBag: 5,
  packBagBHome: 5,
  shower: 25,
  dinnerPrep: 30,
  dinnerEat: 30,
  postMealWait: 30,
  carCompanyToHome: null,
  carCompanyToGym: null,
  stationToGymDirect: 15,
} as const;

export const DEFAULT_TIME_SETTINGS: Readonly<TimeSettings> = Object.freeze({
  yangcho: Object.freeze({ ...COMMON_DEFAULTS, bedTarget: 23 * 60 }),
  tawi: Object.freeze({ ...COMMON_DEFAULTS, bedTarget: null }),
});

export type TimeSettingKey = keyof PersonTimeSettings;
export type TimeSettingsOverrides = Partial<Record<PersonId, Partial<PersonTimeSettings>>>;

/** 설정 화면(2-4)과 문서가 같은 목록을 쓰도록 이름·단위·구분을 한 곳에 적어 둬요. */
export const TIME_SETTING_META: ReadonlyArray<{
  key: TimeSettingKey;
  label: string;
  group: 'personal' | 'shared' | 'unset';
  optional: boolean;
  docRef: string;
}> = [
  { key: 'stationToHome', label: '신도림역 → 집', group: 'personal', optional: false, docRef: 'D-150' },
  { key: 'homeToGym', label: '집 → 헬스장 (이동+락커)', group: 'personal', optional: false, docRef: 'D-150' },
  { key: 'gymToHome', label: '헬스장 → 집', group: 'personal', optional: false, docRef: 'D-150' },
  { key: 'changeClothes', label: '환복', group: 'personal', optional: false, docRef: 'D-150' },
  { key: 'snack', label: '간식', group: 'personal', optional: false, docRef: 'D-150' },
  { key: 'packBag', label: '짐 챙기기', group: 'personal', optional: false, docRef: 'D-150' },
  { key: 'packBagBHome', label: 'PLAN B 집 담당 짐 챙기기 (내 짐+상대 짐 총 시간)', group: 'personal', optional: false, docRef: 'D-150, P-144' },
  { key: 'shower', label: '샤워', group: 'personal', optional: false, docRef: 'D-150, D-021' },
  { key: 'dinnerPrep', label: '저녁 준비 (공동, 큰 값 사용)', group: 'shared', optional: false, docRef: 'D-156, P-145' },
  { key: 'dinnerEat', label: '저녁 식사 (공동, 큰 값 사용)', group: 'shared', optional: false, docRef: 'D-156, P-145' },
  { key: 'postMealWait', label: '식후 대기 (공동, 큰 값 사용)', group: 'shared', optional: false, docRef: 'D-157, P-145' },
  { key: 'carCompanyToHome', label: '자동차 회사 → 집 (미설정)', group: 'unset', optional: true, docRef: 'D-151' },
  { key: 'carCompanyToGym', label: '자동차 회사 → 헬스장 운동 가능 (미설정)', group: 'unset', optional: true, docRef: 'D-151' },
  { key: 'stationToGymDirect', label: '신도림역 → 헬스장 직행 (PLAN B 직행자, 운동 가능까지)', group: 'personal', optional: true, docRef: 'D-160' },
  { key: 'bedTarget', label: '침대 목표 시각', group: 'personal', optional: true, docRef: 'D-022' },
];

export type SettingsIssue = {
  person: PersonId;
  key: TimeSettingKey;
  problem: 'not_a_number' | 'not_integer' | 'negative' | 'null_not_allowed';
};

const PERSONS: readonly PersonId[] = ['yangcho', 'tawi'];

/** 설정값이 올바른지 확인해요. 0분은 허용(그 단계 없음), 음수는 거부 [06 문서 X-11]. */
export function validateTimeSettings(settings: TimeSettings): SettingsIssue[] {
  const issues: SettingsIssue[] = [];
  for (const person of PERSONS) {
    for (const meta of TIME_SETTING_META) {
      const v = settings[person][meta.key];
      if (v === null) {
        if (!meta.optional) issues.push({ person, key: meta.key, problem: 'null_not_allowed' });
        continue;
      }
      if (typeof v !== 'number' || Number.isNaN(v)) issues.push({ person, key: meta.key, problem: 'not_a_number' });
      else if (!Number.isInteger(v)) issues.push({ person, key: meta.key, problem: 'not_integer' });
      else if (v < 0) issues.push({ person, key: meta.key, problem: 'negative' });
    }
  }
  return issues;
}

/** 기본값 위에 개인별 변경을 얹어 새 설정을 만들어요. 올바르지 않은 값이면 알려 줘요. */
export function createTimeSettings(overrides: TimeSettingsOverrides = {}): TimeSettings {
  const next: TimeSettings = {
    yangcho: { ...DEFAULT_TIME_SETTINGS.yangcho, ...overrides.yangcho },
    tawi: { ...DEFAULT_TIME_SETTINGS.tawi, ...overrides.tawi },
  };
  const issues = validateTimeSettings(next);
  if (issues.length > 0) {
    const first = issues[0];
    throw new RangeError(`시간 설정이 올바르지 않아요: ${first.person}.${first.key} (${first.problem})`);
  }
  return next;
}

/** 공동 활동 값: 두 사람 설정이 다르면 큰 값을 써요 [P-145]. */
export function resolveSharedTimes(settings: TimeSettings) {
  const both = PERSONS.map((p) => settings[p]);
  return {
    dinnerPrep: Math.max(...both.map((s) => s.dinnerPrep)),
    dinnerEat: Math.max(...both.map((s) => s.dinnerEat)),
    postMealWait: Math.max(...both.map((s) => s.postMealWait)),
  };
}

/** 운동 전 준비 합계 (계산값, 입력 아님) [P-142]. PLAN A 기준이에요. */
export function prepTotalMinutes(s: PersonTimeSettings): number {
  return s.changeClothes + s.snack + s.packBag;
}
