import { fmt } from '@/lib/south-america/domain/time';
import { PEOPLE, otherPerson, type PersonId } from '@/lib/south-america/domain/types';
import type { InputSource, TimelineNode } from '@/lib/south-america/domain/timeline/types';
import { Card } from '../common/Card';
import { CatMark } from '../common/CatMark';
import { EtaTime } from '../common/EtaTime';
import { useDay } from '../../store/dayStore';
import { useTall } from '../common/useMedia';
import { DinnerBlock } from './DinnerBlock';
import { deltaText, findNode, homeReturnInfo, laterRecord, nodeTime, primaryEtaNode } from './format';

const SOURCE_OF_NODE: Record<string, InputSource> = { input_self: 'self', input_phone: 'phone', input_partner: 'partner', default: 'default' };

/** 입력한 시각이 "어느 장소 기준인지" 글자로 보여 줘요 */
function placeOf(n: TimelineNode): string {
  switch (n.id) {
    case 'station_arrival':
      return '신도림역';
    case 'company_departure':
      return '회사 출발';
    case 'gym_ready':
      return '헬스장 준비';
    default:
      return n.label === '집에서 준비 시작 가능' ? '집 준비 가능' : '집 도착';
  }
}
const DONE_WORD: Record<string, string> = { station_arrival: '도착', company_departure: '출발', home_arrival: '도착', gym_ready: '도착' };

/**
 * 오늘 퇴근 일정: 각자 어느 장소 기준으로 몇 시를 넣었는지, 그 출처(기본값·직접 입력·상대 추정·실제 도착)와
 * 거기서 계산한 집 도착·헬스장 준비 예상을 보여 줘요. 기본값은 확인된 시각처럼 보이지 않게 흐리게 표시해요.
 */
export function EtaCard({ onEdit, onCollapse }: { onEdit: (p: PersonId) => void; onCollapse?: () => void }) {
  const { live, viewer, confirmEta } = useDay();
  const tl = live.timeline;
  const tall = useTall();
  return (
    <Card className="eta-card">
      {tall && (
        <h2 className="card__title">
          <span className="card__emoji" aria-hidden>🕗</span>오늘 퇴근 일정
        </h2>
      )}
      {(['yangcho', 'tawi'] as const).map((p) => {
        const node = primaryEtaNode(tl.nodes, p);
        const home = findNode(tl, p, 'home_arrival');
        const gym = findNode(tl, p, 'gym_ready');
        const src = node ? SOURCE_OF_NODE[node.source] : undefined;
        const canConfirm = viewer === p && node && (node.source === 'default' || node.source === 'input_partner') && node.state === 'pending' && node.id !== 'gym_ready';
        const isDone = node?.state === 'done' && node.time !== null;
        const later = laterRecord(tl.nodes, p, node);
        const subParts: string[] = [];
        const homeShown = home && home.id === 'home_arrival' && !(node && node.id === 'home_arrival');
        const roomy = tall && !canConfirm; // [맞아요] 버튼이 없을 때만 긴 문구 (좁은 줄바꿈 방지)
        if (homeShown) subParts.push(home.state === 'done' ? `집 도착 ${nodeTime(home)}` : roomy ? `집 도착 예상 ${nodeTime(home)}` : `집 ${nodeTime(home)}`);
        if (gym && !(node && node.id === 'gym_ready')) subParts.push(roomy ? `헬스장 준비 ${nodeTime(gym)}` : `헬스장 ${nodeTime(gym)}`);
        return (
          <div className="erow erow--two" key={p}>
            <button className="erow__tap" onClick={() => onEdit(p)} aria-label={`${PEOPLE[p].name} ETA 수정`}>
              <span className="erow__who" role="img" aria-label={PEOPLE[p].name}><CatMark who={p} size="lg" /></span>
              <span className="erow__main">
                {node && node.time !== null ? (
                  isDone ? (
                    <>
                      <span className="eta">
                        <span className="eta__name">{PEOPLE[p].name}</span>
                        <span className="eta__sep" aria-hidden>·</span>
                        <span className="eta__place">{placeOf(node)}</span>
                        <span className="eta__time">✓{fmt(node.time)} {DONE_WORD[node.id] ?? '완료'}</span>
                      </span>
                      <span className="eta__src eta__src--done">✓ 실제 기록{node.expected !== null ? ` · ${deltaText(node.expected, node.time)}` : ''}</span>
                    </>
                  ) : (
                    <>
                      <EtaTime name={PEOPLE[p].name} place={placeOf(node)} time={fmt(node.time)} source={src ?? 'self'} who={PEOPLE[otherPerson(p)].name} late={node.overdue} />
                    </>
                  )
                ) : (
                  <span className="eta">
                    <span className="eta__name">{PEOPLE[p].name}</span>
                    <span className="eta__sep" aria-hidden>·</span>
                    <span className="erow__miss">입력 필요 ✏️</span>
                  </span>
                )}
                {later && <span className="erow__sub2 erow__later">이후 단계 기록: {later.label} ✓{fmt(later.time as number)}</span>}
                {subParts.length > 0 && <span className="erow__sub2">{subParts.join(' · ')}</span>}
              </span>
            </button>
            {canConfirm && node && (
              <button className="btn btn--small btn--primary" onClick={() => confirmEta(p, node.id as 'station_arrival')} aria-label={`${PEOPLE[p].name} ${placeOf(node)} 시각이 맞아요`}>
                맞아요
              </button>
            )}
          </div>
        );
      })}
      {onCollapse && (
        <button className="btn btn--text eta-fold" onClick={onCollapse} data-testid="eta-fold">접기 ▴</button>
      )}
    </Card>
  );
}

/** ❤️ 이후에는 퇴근 일정(ETA)이 지난 일이라 한 줄로 접어요. 누르면 기존 상세를 그대로 펼쳐요 [G-2]. */
export function EtaCollapsed({ onOpen }: { onOpen: () => void }) {
  const { live } = useDay();
  const tl = live.timeline;
  const part = (p: PersonId) => {
    const n = primaryEtaNode(tl.nodes, p);
    return `${PEOPLE[p].name} ${n && n.time !== null ? (n.state === 'done' ? `✓${fmt(n.time)}` : fmt(n.time)) : '입력 필요'}`;
  };
  return (
    <button className="card eta-collapsed" onClick={onOpen} aria-expanded={false} aria-label="퇴근 일정 자세히 보기" data-testid="eta-collapsed">
      <span><span aria-hidden>🕗</span> 퇴근 · {part('yangcho')} · {part('tawi')}</span>
      <span className="eta-collapsed__more" aria-hidden>▾</span>
    </button>
  );
}

const Cell = ({ label, node, value, confirmed }: { label: string; node?: TimelineNode; value?: string; confirmed?: boolean }) => (
  <div className="k__cell">
    <small>{label}</small>
    <b className={confirmed || (node && (node.state === 'done' || node.confirmed)) ? '' : 'est'}>{value ?? nodeTime(node)}</b>
  </div>
);

/** 오늘의 핵심 시각: PLAN, 함께 시작, 귀가, 저녁(가능 시각과 희망 차이). 누르면 전체 일정이 열려요. */
export function SummaryCard({ onPlan, onTimeline, onDesired }: { onPlan: () => void; onTimeline: () => void; onDesired: () => void }) {
  const { live } = useDay();
  const tl = live.timeline;
  const tall = useTall();
  const start = findNode(tl, 'joint', 'joint_start');
  const meal = findNode(tl, 'joint', 'meal_start');
  const ret = homeReturnInfo(tl);
  const homeVal = ret === null ? '입력 필요' : ret.text;
  const planLabel = tl.plan === 'A' ? 'PLAN A' : `PLAN B · ${PEOPLE[tl.homePerson!].name} 집 담당`;
  const blocker = tl.blockers[0];
  const before = tl.mealOrder === 'before';
  const bedNotice = tl.notices.find((n) => n.code === 'past_bed_target');

  const cellsSmall = before
    ? [<Cell key="m" label="🍽 저녁" node={meal} />, <Cell key="s" label="❤️ 시작" node={start} />, <Cell key="h" label="🏠 귀가" value={homeVal} confirmed={ret?.actual === true} />]
    : [<Cell key="s" label="❤️ 시작" node={start} />, <Cell key="h" label="🏠 귀가" value={homeVal} confirmed={ret?.actual === true} />, <Cell key="m" label="🍽 저녁" node={meal} />];
  return (
    <Card tone="glacier" className="plan plan--compact summary">
      <div className="plan__row">
        <span className="chip chip--plan">{planLabel}</span>
        {tl.mealOrder === 'before' && <span className="chip chip--dim">저녁 먼저</span>}
        <button className="btn btn--small btn--ghost plan__cmp" onClick={onPlan} data-testid="open-plan">
          비교·변경 ›
        </button>
      </div>
      {blocker && tl.status === 'blocked' && start?.state !== 'done' && (
        <p className="summary__blocker" data-testid="blocker">{blocker.message}</p>
      )}
      <button className="k k--tap" onClick={onTimeline} aria-label="전체 일정 열기" data-testid="open-timeline">
        {cellsSmall}
        <span className="k__more" aria-hidden>▾</span>
      </button>
      {tl.status === 'ok' && <DinnerBlock onEdit={onDesired} />}
      {tall && bedNotice && <p className="tiny">🛏 {bedNotice.message}</p>}
      {tall && tl.locked && <p className="tiny">❤️ 시작 후에는 PLAN·저녁 순서·운동 시간을 바꿀 수 없어요.</p>}
    </Card>
  );
}
