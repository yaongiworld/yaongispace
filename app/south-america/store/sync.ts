// 폰 쪽 동기화 엔진 (React를 몰라요). 서버가 진짜 기록이고, 폰은 그 사본을 들고 있어요.
//
// - 누르면 같은 규칙 코드(domain)로 바로 계산해서 화면에 보여 주고(낙관적 반영), 명령을 대기열에 넣어 서버로 보내요.
// - 서버가 받아 주면 대기열에서 빼고, 규칙에 어긋나면(상대가 먼저 ❤️를 눌러 잠긴 경우 등) 빼면서 이유를 알려요.
// - 연결이 없으면 대기열에 그대로 두고 다시 보내요. 명령마다 붙은 cid로 서버가 같은 명령을 두 번 적용하지 않아요.
// - 서버 사본은 주기적으로·돌아올 때 다시 받아 오고, 아직 못 보낸 명령은 그 위에 다시 적용해서 보여 줘요.
import { applyDayCommand, targetDay, type DayCommand } from '@/lib/south-america/server/commands';
import type { DayCommandOutcome, DayEnvelope, LogCommand, LogCommandOutcome, LogEnvelope, Refusal, Snapshot } from '@/lib/south-america/server/wire';
import type { ActionResult } from '@/lib/south-america/domain/day/day';
import { cancelCardio, editCardio, recordCardio, restoreCardio, type LogResult } from '@/lib/south-america/domain/exercise/logs';
import type { LogBook } from '@/lib/south-america/domain/exercise/types';
import { emptyLogBook } from '@/lib/south-america/domain/exercise/types';

export type SyncNotice = { id: number; message: string };

export type Transport = {
  fetchSnapshot: () => Promise<Snapshot | Refusal>;
  sendDay: (env: DayEnvelope) => Promise<DayCommandOutcome | Refusal>;
  sendLog: (env: LogEnvelope) => Promise<LogCommandOutcome | Refusal>;
};

export type PendingStore = { get: () => string | null; set: (v: string) => void };

export type SyncView = {
  snapshot: Snapshot;
  /** 아직 서버에 못 보낸 명령 수 */
  pending: number;
  /** 마지막 전송이 연결 문제로 실패했어요 */
  offline: boolean;
  /** 로그인이 풀렸어요 */
  signedOut: boolean;
  notices: SyncNotice[];
};

type Pending = { kind: 'day'; env: DayEnvelope } | { kind: 'log'; env: LogEnvelope };

const REASON_TEXT: Record<string, string> = {
  locked: '상대가 먼저 ❤️를 눌러서 일정이 잠겼어요. 방금 한 변경은 반영되지 않았어요',
  not_your_step: '내 단계가 아니어서 반영되지 않았어요',
  duplicate_log_id: '같은 기록이 이미 있어요',
};
const reasonText = (reason: string) => REASON_TEXT[reason] ?? `상대의 최신 기록과 맞지 않아서 방금 한 변경이 반영되지 않았어요 (${reason})`;

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

export type SyncEngine = {
  getView: () => SyncView;
  subscribe: (l: () => void) => () => void;
  /** 하루 명령. 규칙에 맞으면 바로 반영하고 대기열에 넣어요 */
  day: (cmd: DayCommand, at?: Date) => ActionResult;
  /** 유산소 기록 명령 */
  log: (cmd: LogCommand, at?: Date) => LogResult;
  /** 서버에서 최신을 받아 와요 */
  refresh: () => Promise<void>;
  /** 대기열을 서버로 보내요 */
  flush: () => Promise<void>;
  dismissNotice: (id: number) => void;
  /** 화면에 보이는 로그 묶음 (대기 중인 기록 포함) */
  viewBook: () => LogBook;
};

export function createSyncEngine(opts: { initial: Snapshot; transport: Transport; pendingStore?: PendingStore; now?: () => Date }): SyncEngine {
  const now = opts.now ?? (() => new Date());
  let server = opts.initial;
  let pending: Pending[] = loadPending(opts.pendingStore, opts.initial.persona);
  let offline = false;
  let signedOut = false;
  let notices: SyncNotice[] = [];
  let noticeSeq = 0;
  let flushing: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  function loadPending(store: PendingStore | undefined, persona: string): Pending[] {
    try {
      const raw = store?.get();
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { persona?: string; items?: Pending[] };
      return parsed.persona === persona && Array.isArray(parsed.items) ? parsed.items : [];
    } catch {
      return [];
    }
  }
  const persist = () => {
    try {
      opts.pendingStore?.set(JSON.stringify({ persona: server.persona, items: pending }));
    } catch {
      /* 저장이 막혀도 이번 접속 동안은 동작해요 */
    }
  };

  /** 서버 사본 위에 대기 중인 명령을 차례로 다시 적용한 모습 */
  function compute(): { snapshot: Snapshot; book: LogBook } {
    let days = server.days;
    let book: LogBook = { ...emptyLogBook(), logs: [...server.logs] };
    for (const p of pending) {
      if (p.kind === 'day') {
        const day = targetDay(p.env.cmd, server.today);
        const row = days.find((d) => d.day === day);
        if (!row) continue;
        const r = applyDayCommand(row.state, p.env.cmd, { by: server.persona, at: p.env.at });
        if (r.ok && r.changed) days = days.map((d) => (d.day === day ? { ...d, state: r.state } : d));
      } else {
        const r = runLog(book, p.env.cmd, server.persona, p.env.at);
        if (r.ok && r.changed) book = r.book;
      }
    }
    return { snapshot: { ...server, days, logs: book.logs }, book };
  }
  let cache = compute();
  let view: SyncView;
  const rebuild = () => {
    cache = compute();
    view = { snapshot: cache.snapshot, pending: pending.length, offline, signedOut, notices };
    listeners.forEach((l) => l());
  };
  view = { snapshot: cache.snapshot, pending: pending.length, offline, signedOut, notices };

  const notify = (message: string) => {
    notices = [...notices.slice(-4), { id: ++noticeSeq, message }];
  };

  async function pump(): Promise<void> {
    while (pending.length > 0) {
      const head = pending[0];
      let outcome: DayCommandOutcome | LogCommandOutcome | Refusal;
      try {
        outcome = head.kind === 'day' ? await opts.transport.sendDay(head.env) : await opts.transport.sendLog(head.env);
      } catch {
        offline = true;
        rebuild();
        return; // 연결이 돌아오면 같은 명령부터 다시 보내요
      }
      offline = false;
      if (!outcome.ok && (outcome.reason === 'signed_out' || outcome.reason === 'not_member')) {
        signedOut = true;
        rebuild();
        return;
      }
      pending = pending.slice(1);
      persist();
      if (!outcome.ok) notify(reasonText(outcome.reason));
      // 서버가 받은 직후의 진짜 모습을 받아 와서 낙관적 반영을 바로잡아요
      await pullSnapshot();
    }
    rebuild();
  }

  async function pullSnapshot(): Promise<void> {
    try {
      const s = await opts.transport.fetchSnapshot();
      if ('ok' in s) {
        signedOut = true;
      } else {
        server = s;
        signedOut = false;
        offline = false;
      }
    } catch {
      offline = true;
    }
    rebuild();
  }

  function enqueue(item: Pending): void {
    pending = [...pending, item];
    persist();
    rebuild();
    void flush();
  }

  async function flush(): Promise<void> {
    if (flushing) return flushing;
    flushing = pump().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  return {
    getView: () => view,
    subscribe: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    day: (cmd, at = now()) => {
      const day = targetDay(cmd, cache.snapshot.today);
      const row = cache.snapshot.days.find((d) => d.day === day);
      if (!row) return { ok: false, reason: 'no_session', state: cache.snapshot.days[0].state };
      const iso = at.toISOString();
      const r = applyDayCommand(row.state, cmd, { by: server.persona, at: iso });
      if (r.ok && r.changed) enqueue({ kind: 'day', env: { cid: newId(), at: iso, cmd } });
      return r;
    },
    log: (cmd, at = now()) => {
      const iso = at.toISOString();
      const r = runLog(cache.book, cmd, server.persona, iso);
      if (r.ok && r.changed) enqueue({ kind: 'log', env: { cid: newId(), at: iso, cmd } });
      return r;
    },
    refresh: async () => {
      if (pending.length > 0) await flush();
      else await pullSnapshot();
    },
    flush,
    dismissNotice: (id) => {
      notices = notices.filter((n) => n.id !== id);
      rebuild();
    },
    viewBook: () => cache.book,
  };
}

function runLog(book: LogBook, cmd: LogCommand, by: 'yangcho' | 'tawi', at: string): LogResult {
  switch (cmd.kind) {
    case 'log.record':
      return recordCardio(book, { ...cmd.input, enteredBy: by, recordedAt: at });
    case 'log.edit':
      return editCardio(book, cmd.logId, cmd.patch, { by, at });
    case 'log.cancel':
      return cancelCardio(book, cmd.logId, { by, at });
    case 'log.restore':
      return restoreCardio(book, cmd.logId, { by, at });
  }
}

