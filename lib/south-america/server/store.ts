// 하루 문서와 유산소 기록을 Postgres에 읽고 쓰는 곳. 모든 읽기·쓰기는 로그인한 사람의 권한(RLS)으로 실행돼요.
//
// - 하루는 날짜마다 한 줄이에요(sa_day). 명령을 적용할 때 그 줄을 잠그고(FOR UPDATE) 최신 상태 위에서 규칙 코드를 돌려서,
//   두 사람이 동시에 눌러도 차례대로 적용돼요. 지난 날 줄은 지우지 않아요.
// - 적용된 변화는 sa_change에 순서대로 남아요 (지우거나 고치는 권한이 앱에 없어요).
import type { PoolClient } from 'pg';
import { asPerson } from '@/lib/as-person';
import { createDayState, type ActionResult } from '../domain/day/day';
import { parseDayState } from '../domain/day/daybook';
import { applyDayCommand, parseDayCommand, targetDay, type DayCommand } from './commands';
import { cancelCardio, editCardio, recordCardio, restoreCardio } from '../domain/exercise/logs';
import { emptyLogBook, type StoredLog } from '../domain/exercise/types';
import { planDayOf } from '../domain/time';
import type { PersonId } from '../domain/types';
import type { CommandMeta, DayCommandOutcome, DayRow, LogCommand, LogCommandOutcome, Snapshot } from './wire';

export type { CommandMeta, DayCommandOutcome, DayRow, LogCommand, LogCommandOutcome, Snapshot } from './wire';

/** 로그인한 사람의 역할. 남미 앱 멤버가 아니면 null (RLS 때문에 sa_member가 보이지 않아요) */
async function personaIn(client: PoolClient): Promise<PersonId | null> {
  const { rows } = await client.query<{ persona: PersonId }>('select persona from sa_member where person_id = current_person_id()');
  return rows[0]?.persona ?? null;
}

export async function personaOf(personId: string): Promise<PersonId | null> {
  return asPerson(personId, personaIn);
}

/** 오늘 줄이 없으면 만들어요. 새 하루는 가장 최근 날의 설정만 이어받아요 (ETA·완료 기록은 새로) */
async function ensureToday(client: PoolClient, personId: string, today: string): Promise<void> {
  const { rows } = await client.query<{ state: unknown }>('select state from sa_day where day < $1 order by day desc limit 1', [today]);
  const prev = rows[0] ? parseDayState(rows[0].state) : null;
  const fresh = createDayState(today, prev?.settings);
  await client.query('insert into sa_day (day, state, updated_by) values ($1, $2, $3) on conflict (day) do nothing', [today, JSON.stringify(fresh), personId]);
}

export async function getSnapshot(personId: string, now: Date = new Date()): Promise<Snapshot | null> {
  const today = planDayOf(now);
  return asPerson(personId, async (client) => {
    const persona = await personaIn(client);
    if (!persona) return null;
    await ensureToday(client, personId, today);
    const days = await client.query<{ day: string; state: unknown; version: number }>('select day, state, version from sa_day order by day desc');
    const logs = await client.query<{ doc: StoredLog }>('select doc from sa_log order by created_at, log_id');
    const rows: DayRow[] = [];
    for (const r of days.rows) {
      const state = parseDayState(r.state);
      // 읽을 수 없는 날은 숨기되 줄은 그대로 남아요 (지우지 않아요)
      if (state) rows.push({ day: r.day, state, version: r.version });
    }
    return { persona, today, serverNow: now.toISOString(), days: rows, logs: logs.rows.map((r) => r.doc) };
  });
}

/**
 * 폰이 보낸 "누른 순간"은 믿되 범위를 지켜요: 서버의 지금보다 미래일 수 없고, 이틀보다 오래되면 서버 시각을 써요.
 * (오프라인으로 눌렀다가 나중에 전송돼도 눌렀던 순간이 기록되도록)
 */
export function effectiveAt(now: Date, clientAt?: string): Date {
  if (!clientAt) return now;
  const t = new Date(clientAt);
  if (Number.isNaN(t.getTime()) || t.getTime() > now.getTime() || now.getTime() - t.getTime() > 2 * 86_400_000) return now;
  return t;
}

export async function runDayCommand(personId: string, raw: unknown, now: Date = new Date(), meta: CommandMeta = {}): Promise<DayCommandOutcome> {
  const cmd = parseDayCommand(raw);
  if (!cmd) return { ok: false, reason: 'bad_command' };
  const today = planDayOf(now);
  const at = effectiveAt(now, meta.clientAt);
  return asPerson(personId, async (client) => {
    const persona = await personaIn(client);
    if (!persona) return { ok: false, reason: 'not_member' } as const;
    await ensureToday(client, personId, today);
    const day = targetDay(cmd, today);
    const locked = await client.query<{ state: unknown; version: number }>('select state, version from sa_day where day = $1 for update', [day]);
    const row = locked.rows[0];
    if (!row) return { ok: false, reason: 'no_session' } as const;

    // 이미 반영된 명령의 재시도 (응답만 놓친 경우): 다시 적용하지 않아요. 줄을 잠근 뒤에 확인하니 동시에 온 재시도도 걸러져요
    if (meta.cid) {
      const seen = await client.query('select 1 from sa_change where cmd_id = $1', [meta.cid]);
      if (seen.rowCount) return { ok: true, changed: false, version: row.version, day } as const;
    }
    const state = parseDayState(row.state);
    if (!state) return { ok: false, reason: 'unreadable_day' } as const;

    const result: ActionResult = applyDayCommand(state, cmd, { by: persona, at: at.toISOString() });
    if (!result.ok) return { ok: false, reason: result.reason } as const;
    if (!result.changed) return { ok: true, changed: false, version: row.version, day } as const;

    const version = row.version + 1;
    await client.query('update sa_day set state = $2, version = $3, updated_at = now(), updated_by = $4 where day = $1', [day, JSON.stringify(result.state), version, personId]);
    await recordChange(client, personId, persona, `day:${day}`, cmd, version, meta.cid);
    return { ok: true, changed: true, version, day } as const;
  });
}

export async function runLogCommand(personId: string, cmd: LogCommand, now: Date = new Date(), meta: CommandMeta = {}): Promise<LogCommandOutcome> {
  if (typeof cmd !== 'object' || cmd === null) return { ok: false, reason: 'bad_command' };
  const at = effectiveAt(now, meta.clientAt).toISOString();
  return asPerson(personId, async (client) => {
    const persona = await personaIn(client);
    if (!persona) return { ok: false, reason: 'not_member' } as const;

    const logId = cmd.kind === 'log.record' ? cmd.input?.logId : cmd.logId;
    if (typeof logId !== 'string' || logId.trim() === '') return { ok: false, reason: 'invalid_log_id' } as const;

    // 같은 logId는 한 건: 이미 있으면 줄을 잠그고 그 위에서 적용하고, 없으면 아래 insert가 한 번만 성공해요
    const found = await client.query<{ doc: StoredLog; version: number }>('select doc, version from sa_log where log_id = $1 for update', [logId]);
    const existing = found.rows[0];
    const book = existing ? { ...emptyLogBook(), logs: [existing.doc] } : emptyLogBook();
    const actor = { by: persona, at };

    let result;
    switch (cmd.kind) {
      case 'log.record':
        result = recordCardio(book, { ...cmd.input, enteredBy: persona, recordedAt: at });
        break;
      case 'log.edit':
        result = editCardio(book, logId, cmd.patch, actor);
        break;
      case 'log.cancel':
        result = cancelCardio(book, logId, actor);
        break;
      case 'log.restore':
        result = restoreCardio(book, logId, actor);
        break;
      default:
        return { ok: false, reason: 'bad_command' } as const;
    }
    if (!result.ok) return { ok: false, reason: result.reason } as const;
    if (!result.changed) return { ok: true, changed: false, version: existing?.version ?? 1, logId } as const;

    const doc = JSON.stringify(result.log);
    let version = 1;
    if (existing) {
      version = existing.version + 1;
      await client.query('update sa_log set doc = $2, version = $3, updated_at = now(), updated_by = $4 where log_id = $1', [logId, doc, version, personId]);
    } else {
      const ins = await client.query('insert into sa_log (log_id, kind, doc, updated_by) values ($1, $2, $3, $4) on conflict (log_id) do nothing', [logId, result.log.kind, doc, personId]);
      if (ins.rowCount === 0) {
        // 동시에 같은 logId를 처음 저장한 두 요청 중 늦은 쪽이에요. 먼저 들어간 기록과 내용이 같으면 한 건이고, 다르면 거부해요.
        const again = await client.query<{ doc: StoredLog; version: number }>('select doc, version from sa_log where log_id = $1', [logId]);
        const winner = again.rows[0];
        const retry = winner && cmd.kind === 'log.record' ? recordCardio({ ...emptyLogBook(), logs: [winner.doc] }, { ...cmd.input, enteredBy: persona, recordedAt: at }) : null;
        if (retry && retry.ok) return { ok: true, changed: false, version: winner.version, logId } as const;
        return { ok: false, reason: retry && !retry.ok ? retry.reason : 'duplicate_log_id' } as const;
      }
    }
    await recordChange(client, personId, persona, `log:${logId}`, cmd, version);
    return { ok: true, changed: true, version, logId } as const;
  });
}

async function recordChange(client: PoolClient, personId: string, persona: PersonId, target: string, command: DayCommand | LogCommand, version: number, cmdId?: string): Promise<void> {
  await client.query('insert into sa_change (person_id, persona, target, command, version, cmd_id) values ($1, $2, $3, $4, $5, $6)', [personId, persona, target, JSON.stringify(command), version, cmdId ?? null]);
}
