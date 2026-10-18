// 개발용 예시 상황 (프로토타입 확인용). 시간 설정은 그대로 두고 ETA·계획·완료 기록만 새로 만들어요.
import { createDayState, setEtaMode, type DayState } from './day';
import { C } from './scenarioTime';

export type ScenarioId = 'normal' | 'tawi_late' | 'car_day' | 'dinner_first';

export const SCENARIOS: ReadonlyArray<{ id: ScenarioId; label: string; hint: string }> = [
  { id: 'normal', label: '평범한 날', hint: '둘 다 지하철 (기본값 📌)' },
  { id: 'tawi_late', label: '타위가 늦는 날', hint: '타위 역 도착 19:10을 직접 입력' },
  { id: 'car_day', label: '타위 자동차 날', hint: '집 19:00, 헬스장 운동 가능 19:15 직접 입력' },
  { id: 'dinner_first', label: '저녁 먼저 먹는 날', hint: '식후 대기 30분, 운동 60분' },
];

export function applyScenario(state: DayState, id: ScenarioId): DayState {
  let s = createDayState(state.day, state.settings);
  if (id === 'tawi_late') s = setEtaMode(s, 'tawi', 'subway', { station_arrival: C('19:10') }, 'tawi');
  if (id === 'car_day') s = setEtaMode(s, 'tawi', 'car', { home_arrival: C('19:00'), gym_ready: C('19:15') }, 'tawi');
  if (id === 'dinner_first') s = { ...s, mealOrder: 'before', workoutMinutes: 60 };
  return s;
}
