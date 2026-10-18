import { useSyncExternalStore } from 'react';

/** 화면 크기 조건(예: 키가 충분한 폰)을 화면에서 쓰기 위한 작은 도구예요. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** 키가 충분한 폰(약 760pt 이상)이면 부가 설명과 하루 줄거리를 펼쳐 보여줘요. */
export const useTall = () => useMedia('(min-height: 760px)');
