import { useEffect, useRef } from 'react';
import { useDev } from '../devtools/devState';
import { useDay } from '../store/dayStore';
import { Header } from './Header';
import { TabBar } from './TabBar';
import { TodayTab } from './today/TodayTab';
import { WorkoutTab } from './workout/WorkoutTab';
import { ExpeditionTab } from './expedition/ExpeditionTab';

/** 연결 상태 한 줄: 못 보낸 변경이 있거나 연결이 없을 때만 보여요 */
function SyncBanner() {
  const { sync } = useDay();
  const last = sync.notices[sync.notices.length - 1];
  if (sync.signedOut) {
    return (
      <p className="storage-banner" role="alert" data-testid="sync-banner">
        로그인이 풀렸어요. <a href="/sign-in">다시 로그인</a>하면 보내지 못한 {sync.pending}건이 이어서 전송돼요.
      </p>
    );
  }
  if (last) {
    return (
      <p className="storage-banner" role="status" data-testid="sync-banner">
        {last.message} <button className="btn btn--text" onClick={() => sync.dismiss(last.id)}>확인</button>
      </p>
    );
  }
  if (sync.offline || sync.pending > 0) {
    return (
      <p className="storage-banner" role="status" data-testid="sync-banner">
        {sync.offline ? '연결이 없어요. ' : ''}아직 보내지 않은 변경 {sync.pending}건 — 연결되면 자동으로 보내요.
      </p>
    );
  }
  return null;
}

export default function App() {
  const dev = useDev();
  const screen = useRef<HTMLElement>(null);

  // 탭이 바뀌면 맨 위에서 시작해요.
  useEffect(() => {
    screen.current?.scrollTo({ top: 0 });
  }, [dev.tab]);

  return (
    <div className="app">
      <Header />
      <SyncBanner />
      <main className="screen" ref={screen}>
        {/* 탭을 옮겨도 입력한 내용이 사라지지 않게, 숨기기만 해요. */}
        <div className="tabpane" hidden={dev.tab !== 'today'}><TodayTab /></div>
        <div className="tabpane" hidden={dev.tab !== 'workout'}><WorkoutTab /></div>
        <div className="tabpane" hidden={dev.tab !== 'expedition'}><ExpeditionTab /></div>
      </main>
      <TabBar tab={dev.tab} onTab={dev.setTab} />
    </div>
  );
}
