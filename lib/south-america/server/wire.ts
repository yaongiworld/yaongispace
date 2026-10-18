// 폰과 서버가 주고받는 모양. 타입만 있어서 폰 쪽 코드가 안심하고 가져다 써요 (서버 코드를 끌고 오지 않아요).
import type { ActionError, DayState } from '../domain/day/day';
import type { EditPatch, LogError, RecordInput } from '../domain/exercise/logs';
import type { StoredLog } from '../domain/exercise/types';
import type { PersonId } from '../domain/types';
import type { DayCommand } from './commands';

export type DayRow = { day: string; state: DayState; version: number };

export type Snapshot = {
  persona: PersonId;
  /** 서버가 정한 오늘 (04:00 Asia/Seoul 경계) */
  today: string;
  /** 서버의 현재 순간 (ISO) */
  serverNow: string;
  /** 모든 날, 최근 날짜부터. 오늘 줄이 항상 들어 있어요 */
  days: DayRow[];
  logs: StoredLog[];
};

export type DayCommandOutcome =
  | { ok: true; changed: boolean; version: number; day: string }
  | { ok: false; reason: ActionError | 'not_member' | 'bad_command' | 'unreadable_day' };

export type LogCommand =
  | { kind: 'log.record'; input: Omit<RecordInput, 'enteredBy' | 'recordedAt'> }
  | { kind: 'log.edit'; logId: string; patch: EditPatch }
  | { kind: 'log.cancel'; logId: string }
  | { kind: 'log.restore'; logId: string };

export type LogCommandOutcome = { ok: true; changed: boolean; version: number; logId: string } | { ok: false; reason: LogError | 'not_member' | 'bad_command' };

/** 폰이 명령에 붙여 보내는 값. cid는 재시도를 알아보는 표시이고, clientAt은 누른 순간이에요 */
export type CommandMeta = { cid?: string; clientAt?: string };

export type DayEnvelope = { cid: string; at: string; cmd: DayCommand };
export type LogEnvelope = { cid: string; at: string; cmd: LogCommand };

/** 로그아웃됐거나 이 앱의 멤버가 아닐 때 서버 함수가 돌려주는 값 */
export type Refusal = { ok: false; reason: 'signed_out' | 'not_member' };
