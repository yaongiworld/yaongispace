'use client';

// 유산소 기록 스토어(React 연결). 같은 이름(useLogs)을 유지해서 화면 코드를 그대로 써요.
import { useMemo } from 'react';
import { useSyncValue } from './SaProvider';
import type { LogsController } from './logsController';
import type { LogBook } from '@/lib/south-america/domain/exercise/types';
import { useEngine } from './SaProvider';

export function useLogs(): { book: LogBook; blocked: boolean; frozen: boolean; notices: { code: string; message: string }[]; controller: LogsController } {
  const engine = useEngine();
  const view = useSyncValue();
  const controller = useMemo<LogsController>(
    () => ({
      record: (input) => {
        const { enteredBy: _e, recordedAt, ...rest } = input;
        void _e;
        return engine.log({ kind: 'log.record', input: rest }, new Date(recordedAt));
      },
      edit: (logId, patch, actor) => engine.log({ kind: 'log.edit', logId, patch }, new Date(actor.at)),
      cancel: (logId, actor) => engine.log({ kind: 'log.cancel', logId }, new Date(actor.at)),
      restore: (logId, actor) => engine.log({ kind: 'log.restore', logId }, new Date(actor.at)),
      liveBook: () => engine.viewBook(),
      reload: () => void engine.refresh(),
    }),
    [engine],
  );
  // view가 바뀔 때마다 새 묶음을 읽어요 (대기 중인 기록 포함)
  const book = useMemo(() => engine.viewBook(), [engine, view]);
  return { book, blocked: false, frozen: false, notices: [], controller };
}
