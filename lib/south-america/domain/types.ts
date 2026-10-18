// 화면과 규칙이 함께 쓰는 "말"을 모아 둔 파일이에요.
// 1단계(화면 미리보기)에서는 화면 쪽에서만 쓰고, 2단계에서 규칙 코드가 같은 타입을 써요.

export type PersonId = 'yangcho' | 'tawi';

// 양초와 타위는 둘 다 야옹이월드의 고양이예요. 정식 캐릭터 디자인 전까지는 같은 🐱 임시 표기를 쓰고,
// 이름과 색(양초=빙하 블루, 타위=테라코타/코랄)으로 구분해요. 색은 화면의 CatMark가 입혀요.
export const PEOPLE: Record<PersonId, { emoji: string; name: string }> = {
  yangcho: { emoji: '🐱', name: '양초' },
  tawi: { emoji: '🐱', name: '타위' },
};

export const otherPerson = (id: PersonId): PersonId => (id === 'yangcho' ? 'tawi' : 'yangcho');

/** ETA 출처 5종 [P-030]: 본인 입력 / 계산 추정 / 기본값 / 상대 추정 / 통화 기록 */
export type EtaSource = 'self' | 'computed' | 'default' | 'partner' | 'phone';

export type TabId = 'today' | 'workout' | 'expedition';

/** 캠프 연출 상태: 평소 / 출발 준비(오늘만) / 모닥불(오늘만, 둘 다 완료) */
export type CampMode = 'calm' | 'ready' | 'bonfire';
