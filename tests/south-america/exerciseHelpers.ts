import { emptyLogBook, type LogBook } from '@/lib/south-america/domain/exercise/types';
import { recordCardio, type LogResult, type RecordInput } from '@/lib/south-america/domain/exercise/logs';
import type { KeyValueStore } from '@/lib/south-america/domain/day/persist';

/** 한국 시간 "날짜 시:분"의 실제 순간 (ISO) */
export const KST = (date: string, hhmm: string): string => new Date(`${date}T${hhmm}:00+09:00`).toISOString();

export function must(r: LogResult): LogBook {
  if (!r.ok) throw new Error(`동작이 거부됐어요: ${r.reason}`);
  return r.book;
}

let seq = 0;
/** 기본값이 채워진 기록 입력 (필요한 것만 덮어써요) */
export const input = (over: Partial<RecordInput> = {}): RecordInput => ({
  logId: `log-${++seq}`,
  person: 'yangcho',
  enteredBy: 'yangcho',
  recordedAt: KST('2026-10-18', '10:00'),
  exerciseId: 'treadmill_run',
  minutes: 30,
  distanceM: 3000,
  ...over,
});

export const add = (book: LogBook, over: Partial<RecordInput> = {}): LogBook => must(recordCardio(book, input(over)));

export const book0 = (): LogBook => emptyLogBook();

/** 실패·조용한 실패를 흉내 낼 수 있는 가짜 저장소 */
export class MemStore implements KeyValueStore {
  data = new Map<string, string>();
  failSet = new Set<string>(); // 이 이름에 쓰면 오류 (용량 초과 등)
  silentSet = new Set<string>(); // 이 이름에 쓰면 조용히 아무것도 안 됨
  throwGet = false;
  sets: string[] = [];
  getItem(k: string) {
    if (this.throwGet) throw new Error('저장소 사용 불가');
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.sets.push(k);
    if (this.failSet.has(k)) throw new Error('용량 초과');
    if (this.silentSet.has(k)) return;
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  snapshot() {
    return JSON.stringify([...this.data.entries()].sort());
  }
}
