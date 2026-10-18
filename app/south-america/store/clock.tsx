'use client';

// 시계. 실제 한국 시간만 써요 (개발용으로 시각을 고정하는 기능은 없어요).
// 시각은 그날(새벽 4시 경계) 00:00부터 지난 분이에요. 시계가 흘러도 일정이 저절로 바뀌지는 않아요.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { planDayOf, planMinutesOf, type Minute } from '@/lib/south-america/domain/time';

type ClockApi = {
  now: Minute;
  today: string;
  instant: Date;
  instantNow: () => Date;
};

const Ctx = createContext<ClockApi | null>(null);

export function ClockProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const api = useMemo<ClockApi>(() => {
    void tick;
    const real = new Date();
    return { now: planMinutesOf(real), today: planDayOf(real), instant: real, instantNow: () => new Date() };
  }, [tick]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useClock(): ClockApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('ClockProvider 안에서만 쓸 수 있어요');
  return v;
}
