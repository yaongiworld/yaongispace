// 게임 수치를 모아 두는 "한 곳"이에요 (07 문서 3장 규칙 6).
// 이 파일의 숫자는 [D]로 표시한 것 말고는 모두 [P] 잠정값이에요.
// 사용하면서 조정하는 값이라, 화면 코드에 숫자를 흩어 놓지 않아요.

/** [D-003] 출발일 */
export const DEPARTURE_DATE = '2026-12-17';

/** [P-111, 05 문서 8-1] 캐릭터 레벨 기준: 개인 누적 기여 포인트 */
export const LEVELS = [
  { lv: 1, min: 0, title: '신도림 새내기' },
  { lv: 2, min: 300, title: '길 찾는 트레커', titleByPerson: { yangcho: '길 찾는 트레커', tawi: '짐꾼 탐험가' } },
  { lv: 3, min: 800, title: '계단 정복자' },
  { lv: 4, min: 1600, title: '안데스 도전자' },
  { lv: 5, min: 2800, title: '원정대 리더' },
] as const;

/** [P, 05 문서 7장] 시즌 1 여정 지도 (게임 속 가상 거리예요) */
export const JOURNEY_STOPS = [
  { km: 0, name: '신도림', emoji: '🏠' },
  { km: 100, name: '태평양 횡단', emoji: '🌊' },
  { km: 220, name: '리마', emoji: '🏙' },
  { km: 330, name: '쿠스코', emoji: '🦙' },
  { km: 430, name: '마추픽추', emoji: '🏛' },
  { km: 500, name: '파타고니아', emoji: '🏔' },
  { km: 550, name: 'SOUTH AMERICA READY', emoji: '🎒' },
] as const;

/** [P, 05 문서 8-2] 캠프 단계 */
export const CAMP_STAGES = [
  { stage: 1, needMilestones: 0, name: '작은 텐트' },
  { stage: 2, needMilestones: 2, name: '텐트 두 동' },
  { stage: 3, needMilestones: 4, name: '캠프 사이트' },
  { stage: 4, needMilestones: 7, name: '산장' },
  { stage: 5, needMilestones: 10, name: '원정대 베이스캠프' },
] as const;
