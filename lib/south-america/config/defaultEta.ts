// 프로토타입용 기본 ETA (📌 기본값). 실제 "주간 기본 일정"(요일별 평소 시각)은 아직 없어서
// 임시로 문서의 예시값을 써요. 사람이 [맞아]나 직접 입력으로 확인하기 전까지는 확정으로 보이지 않아요.
import type { PersonId } from '../domain/types';

/** 평소 신도림역 도착 예정 (분). 양초 18:20, 타위 18:50 (예시값, 03 문서 3-A) */
export const PROTOTYPE_DEFAULT_STATION_ARRIVAL: Record<PersonId, number> = {
  yangcho: 18 * 60 + 20,
  tawi: 18 * 60 + 50,
};
