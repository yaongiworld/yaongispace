// 유산소 기록 화면이 쓰는 모양. 저장은 sync 엔진(서버)이 하고, 여기서는 화면이 기대하는 이름만 맞춰 줘요.
import type { Actor, EditPatch, LogResult, RecordInput } from '@/lib/south-america/domain/exercise/logs';
import type { LogBook } from '@/lib/south-america/domain/exercise/types';

/** 브라우저 저장소 시절의 오류 이름. 서버 저장에서는 나오지 않지만 오류 문구 표가 이 이름을 키로 써요 */
export type LogsStorageError = 'storage_failed' | 'storage_blocked' | 'storage_changed';
export type LogsActionResult = LogResult | { ok: false; reason: LogsStorageError };

export type LogsController = {
  record: (input: RecordInput) => LogsActionResult;
  edit: (logId: string, patch: EditPatch, actor: Actor) => LogsActionResult;
  cancel: (logId: string, actor: Actor) => LogsActionResult;
  restore: (logId: string, actor: Actor) => LogsActionResult;
  liveBook: () => LogBook;
  /** 서버에서 최신 기록을 다시 받아 와요 */
  reload: () => void;
};
