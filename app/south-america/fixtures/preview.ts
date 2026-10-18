// 1단계 "화면 미리보기" 전용 예시 데이터예요.
// 실제 계산 결과가 아니라 03/04 문서의 예시 값을 그대로 옮긴 거예요.
// 실제 개인 정보는 들어 있지 않아요.
import type { PersonId } from '@/lib/south-america/domain/types';

export const PREVIEW_HEADER = { date: '10/15 목', dday: 'D-63', theme: '등 데이' } as const;

/* ───────── 오늘 ④ 둘 다 운동 완료 ───────── */
export const bothDone = {
  rewards: [
    { who: 'yangcho' as PersonId, label: '개인 완료', points: 20, km: 6 },
    { who: 'tawi' as PersonId, label: '개인 완료', points: 20, km: 6 },
  ],
  couple: { points: 30, km: 3 },
  next: ['귀가', '저녁'],
};

/* ───────── 운동 탭: 종목 카드 하나 ───────── */
export type SetFixture = { weight: number; reps: number };
export const workout = {
  banner: '❤️ 19:38~ · 32분',
  stretchDone: '스트레칭·고관절 20분',
  exercise: {
    name: '랫풀다운',
    byPerson: {
      yangcho: {
        last: '22.5×12×3 · 🙂',
        recText: '25kg × 10회 × 3세트',
        sets: [
          { weight: 25, reps: 10 },
          { weight: 25, reps: 10 },
          { weight: 25, reps: 10 },
        ] as SetFixture[],
      },
      tawi: {
        last: '30×12×3 · 🙂',
        recText: '32.5kg × 10회 × 3세트',
        sets: [
          { weight: 32.5, reps: 10 },
          { weight: 32.5, reps: 10 },
          { weight: 32.5, reps: 10 },
        ] as SetFixture[],
      },
    },
  },
};

/* ───────── 원정대 탭 ───────── */
export const expedition = {
  campStage: 2,
  decorations: ['🚩', '⭐'],
  gifts: 2,
  characters: [
    { who: 'yangcho' as PersonId, lv: 2, contribution: 750 },
    { who: 'tawi' as PersonId, lv: 2, contribution: 380 },
  ],
  km: 186,
  wallet: { total: 1250, yangcho: 750, tawi: 380, together: 120 },
};
