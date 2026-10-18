import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

const Ctx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

/** 아직 연결되지 않은 버튼을 눌렀을 때 잠깐 알려 주는 말풍선이에요. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2200);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toast-zone" aria-live="polite">
        {msg && <div className="toast">{msg}</div>}
      </div>
    </Ctx.Provider>
  );
}
