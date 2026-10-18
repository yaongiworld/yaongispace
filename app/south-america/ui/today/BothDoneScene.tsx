import { bothDone } from '../../fixtures/preview';
import { PEOPLE } from '@/lib/south-america/domain/types';
import { useDev } from '../../devtools/devState';
import { Card, PreviewTag } from '../common/Card';
import { CatMark } from '../common/CatMark';
import { CampScene } from '../CampScene';

/** 오늘 ④ 둘 다 운동 완료: 모닥불이 켜지고 두 캐릭터가 나란히 앉아요 [D-113] */
export function BothDoneScene() {
  const dev = useDev();
  return (
    <>
      <PreviewTag text="둘 다 완료 · 예시 화면" />

      <Card tone="night" className="hero pop">
        <CampScene mode="bonfire" stage={2} decorations={['🚩', '⭐']} gifts={2} backpack />
        <div className="hero__text">
          <p className="hero__title">🔥 모닥불 점화!</p>
          <p className="hero__sub"><CatMark who="yangcho" size="sm" /><CatMark who="tawi" size="sm" /> 나란히 앉았어요</p>
        </div>
      </Card>

      <Card title="오늘의 보상" emoji="🎁" className="rewards">
        <ul className="reward-list">
          {bothDone.rewards.map((r) => (
            <li key={r.who}>
              <span><CatMark who={r.who} size="sm" /> {PEOPLE[r.who].name} · {r.label}</span>
              <b>⭐ +{r.points}P · +{r.km}KM</b>
            </li>
          ))}
          <li className="reward-list__couple">
            <span>💞 함께 · 둘 다 완료</span>
            <b>+{bothDone.couple.points}P · +{bothDone.couple.km}KM</b>
          </li>
        </ul>
        <button
          className="btn btn--primary btn--block"
          onClick={() => {
            dev.setCampMode('bonfire');
            dev.setTab('expedition');
          }}
        >
          ⛺ 캠프 보러 가기
        </button>
      </Card>

      <Card className="next">
        <p className="next__line">
          <span className="next__label">다음 ›</span> {bothDone.next.join(' · ')}
        </p>
      </Card>
    </>
  );
}
