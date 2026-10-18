'use client';

// 동기화 엔진을 만들고 서버와 연결해요: 서버 함수로 보내고 받고, 몇 초마다·앱으로 돌아올 때·연결이 돌아올 때 최신을 받아 와요.
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Snapshot } from '@/lib/south-america/server/wire';
import { fetchSnapshot, sendDay, sendLog } from '../actions';
import { createSyncEngine, type SyncEngine, type SyncView } from './sync';

const Ctx = createContext<SyncEngine | null>(null);

const POLL_MS = 6000;
const PENDING_KEY = 'sa.pending.v1';

const browserPending = {
  get: () => {
    try {
      return window.localStorage.getItem(PENDING_KEY);
    } catch {
      return null;
    }
  },
  set: (v: string) => {
    try {
      window.localStorage.setItem(PENDING_KEY, v);
    } catch {
      /* 저장이 막혀도 이번 접속 동안은 동작해요 */
    }
  },
};

export function SaProvider({ initial, children }: { initial: Snapshot; children: ReactNode }) {
  const [engine] = useState(() =>
    createSyncEngine({ initial, transport: { fetchSnapshot, sendDay, sendLog }, pendingStore: typeof window === 'undefined' ? undefined : browserPending }),
  );

  useEffect(() => {
    void engine.flush(); // 지난 접속에서 못 보낸 명령이 있으면 보내요
    const poll = () => {
      if (document.visibilityState === 'visible') void engine.refresh();
    };
    const id = window.setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', poll);
    window.addEventListener('online', poll);
    window.addEventListener('focus', poll);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', poll);
      window.removeEventListener('online', poll);
      window.removeEventListener('focus', poll);
    };
  }, [engine]);

  return <Ctx.Provider value={engine}>{children}</Ctx.Provider>;
}

export function useEngine(): SyncEngine {
  const v = useContext(Ctx);
  if (!v) throw new Error('SaProvider 안에서만 쓸 수 있어요');
  return v;
}

export function useSyncValue(): SyncView {
  const engine = useEngine();
  return useSyncExternalStore(engine.subscribe, engine.getView, engine.getView);
}
