'use client';

// 프로토타입의 개발용 상태 자리. 실제 앱에서는 "누구인지"가 로그인에서 오고, 탭만 화면 상태예요.
// DEV 전환·예시 장면은 없어요 (preview는 항상 live).
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { CampMode, PersonId, TabId } from '@/lib/south-america/domain/types';

type DevApi = {
  user: PersonId;
  tab: TabId;
  preview: 'live' | 'both-done';
  replay: number;
  campMode: CampMode;
  setUser: (u: PersonId) => void;
  setTab: (t: TabId) => void;
  setPreview: (p: 'live' | 'both-done') => void;
  setCampMode: (m: CampMode) => void;
  resetAll: () => void;
};

const Ctx = createContext<DevApi | null>(null);

export function DevProvider({ persona, children }: { persona: PersonId; children: ReactNode }) {
  const [tab, setTab] = useState<TabId>('today');
  const [campMode, setCampMode] = useState<CampMode>('calm');
  const api = useMemo<DevApi>(
    () => ({
      user: persona,
      tab,
      preview: 'live',
      replay: 0,
      campMode,
      setUser: () => {},
      setTab,
      setPreview: () => {},
      setCampMode,
      resetAll: () => {},
    }),
    [persona, tab, campMode],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useDev(): DevApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('DevProvider 안에서만 쓸 수 있어요');
  return v;
}
