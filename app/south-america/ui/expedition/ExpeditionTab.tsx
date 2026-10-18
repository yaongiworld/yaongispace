import { PEOPLE } from '@/lib/south-america/domain/types';
import type { CampMode } from '@/lib/south-america/domain/types';
import { CAMP_STAGES, JOURNEY_STOPS, LEVELS } from '@/lib/south-america/config/gameConfig';
import { expedition } from '../../fixtures/preview';
import { useDev } from '../../devtools/devState';
import { Card, PreviewTag } from '../common/Card';
import { CatMark } from '../common/CatMark';
import { useToast } from '../common/Toast';
import { CampScene } from '../CampScene';

const MODES: { id: CampMode; label: string }[] = [
  { id: 'calm', label: '☀️ 평소' },
  { id: 'ready', label: '🎒 출발 준비' },
  { id: 'bonfire', label: '🔥 둘 다 완료' },
];

export function ExpeditionTab() {
  const dev = useDev();
  const toast = useToast();
  const e = expedition;
  const stage = CAMP_STAGES.find((s) => s.stage === e.campStage);

  // 다음 이정표(지도 위 위치)
  const nextStop = JOURNEY_STOPS.find((s) => s.km > e.km) ?? JOURNEY_STOPS[JOURNEY_STOPS.length - 1];
  const prevStop = [...JOURNEY_STOPS].reverse().find((s) => s.km <= e.km) ?? JOURNEY_STOPS[0];
  const total = JOURNEY_STOPS[JOURNEY_STOPS.length - 1].km;

  return (
    <>
      <PreviewTag text="원정대 · 예시 화면" />
      <h1 className="slogan">TWO HIKES, ONE EXPEDITION</h1>

      <Card tone={dev.campMode === 'bonfire' ? 'night' : 'plain'} className="camp-hero">
        <div className="camp-hero__top">
          <span className="camp-hero__name">⛺ 우리 베이스캠프</span>
          <span className="chip chip--plan">{e.campStage}단계 · {stage?.name}</span>
        </div>
        <CampScene mode={dev.campMode} stage={e.campStage} decorations={e.decorations} gifts={e.gifts} backpack={dev.campMode !== 'calm'} footprints={false} />
        <div className="seg seg--preview" role="group" aria-label="미리보기 연출 고르기">
          {MODES.map((m) => (
            <button key={m.id} className={`seg__btn ${dev.campMode === m.id ? 'seg__btn--on' : ''}`} onClick={() => dev.setCampMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="tiny camp-hero__hint">
          {dev.campMode === 'bonfire' ? '둘 다 운동을 끝내면 🔥가 켜지고 나란히 앉아요. 이 연출은 그날만 보여요.' : '연출 버튼은 미리보기용이에요. 🎁·🚩·⭐ 장식은 한 번 얻으면 계속 남아요.'}
        </p>
      </Card>

      <Card title="우리 원정대" emoji="🎒">
        <ul className="chars">
          {e.characters.map((c) => {
            const lv = LEVELS.find((l) => l.lv === c.lv)!;
            const next = LEVELS.find((l) => l.lv === c.lv + 1);
            const pct = next ? Math.min(100, Math.round(((c.contribution - lv.min) / (next.min - lv.min)) * 100)) : 100;
            const title = 'titleByPerson' in lv ? lv.titleByPerson[c.who] : lv.title;
            return (
              <li key={c.who} className="char">
                <span className="char__face" aria-hidden><CatMark who={c.who} size="lg" /></span>
                <div className="char__main">
                  <p className="char__name">{PEOPLE[c.who].name} <span className="chip chip--plan">Lv.{c.lv}</span> {title}</p>
                  <div className="bar" role="img" aria-label={`다음 레벨까지 ${pct}퍼센트`}><i style={{ width: `${pct}%` }} /></div>
                  <p className="tiny">{c.contribution}P{next ? ` / Lv.${next.lv}까지 ${next.min}P` : ''}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Adventure" emoji="🗺">
        <p className="km"><strong>{e.km}</strong> KM</p>
        <div className="track" aria-label={`${prevStop.name}에서 ${nextStop.name}으로 가는 중`}>
          <div className="track__line"><i style={{ width: `${(e.km / total) * 100}%` }} /></div>
          <span className="track__me" style={{ left: `${(e.km / total) * 100}%` }} aria-hidden><CatMark who="yangcho" size="sm" /><CatMark who="tawi" size="sm" /></span>
          <ul className="track__stops">
            {JOURNEY_STOPS.filter((s) => s.km === 0 || ['리마', '쿠스코', '마추픽추', '파타고니아'].includes(s.name)).map((s) => (
              <li key={s.name} style={{ left: `${(s.km / total) * 100}%` }}><span aria-hidden>{s.emoji}</span><small>{s.name}</small></li>
            ))}
          </ul>
        </div>
        <p className="tiny">{prevStop.name}을 지나 {nextStop.name}으로 가는 중 · 게임 속 가상 거리예요</p>
      </Card>

      <Card title="공동 지갑" emoji="💰">
        <p className="wallet__total">{e.wallet.total.toLocaleString()}P</p>
        <p className="wallet__split">양초 {e.wallet.yangcho} · 타위 {e.wallet.tawi} · ❤️ {e.wallet.together}</p>
        <p className="tiny">누적 기여예요. 써도 줄어들지 않아요.</p>
        <button className="btn btn--primary btn--block" onClick={() => toast('경험 해금은 다음 단계에서 만들어요 🎁')}>경험 해금하기 ›</button>
      </Card>

      <div className="linkrow">
        <button className="btn btn--ghost" onClick={() => toast('스티커북은 다음 단계에서 만들어요 📖')}>📖 스티커북 ›</button>
        <button className="btn btn--ghost" onClick={() => toast('회원권은 다음 단계에서 만들어요 🎫')}>🎫 회원권 ›</button>
      </div>
    </>
  );
}
