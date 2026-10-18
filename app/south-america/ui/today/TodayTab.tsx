import { useDev } from '../../devtools/devState';
import { BothDoneScene } from './BothDoneScene';
import { LiveToday } from './LiveToday';

export function TodayTab() {
  const { preview, replay } = useDev();
  // 둘 다 완료 장면은 운동 완료 기록이 연결되기 전이라 개발 도구에서만 미리 볼 수 있어요.
  return preview === 'both-done' ? <BothDoneScene key={replay} /> : <LiveToday />;
}
