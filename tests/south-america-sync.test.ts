import { describe, expect, it } from "vitest";
import { createSyncEngine, type Transport } from "@/app/south-america/store/sync";
import { createDayState } from "@/lib/south-america/domain/day/day";
import { applyDayCommand } from "@/lib/south-america/server/commands";
import type { DayCommandOutcome, LogCommandOutcome, Snapshot } from "@/lib/south-america/server/wire";

/**
 * The phone-side engine, against a fake server.
 *
 * What matters is what the phone does when the network or the other person
 * gets in the way: it shows the press at once, keeps what it could not send,
 * says so plainly when the server refuses, and never sends the same press as
 * two different ones.
 */

const TODAY = "2036-01-02";
const base = (): Snapshot => ({
  persona: "yangcho",
  today: TODAY,
  serverNow: "2036-01-02T09:30:00.000Z",
  days: [{ day: TODAY, state: createDayState(TODAY), version: 1 }],
  logs: [],
});
const at = new Date("2036-01-02T09:30:00.000Z");

/** A server that applies commands for real, one at a time, and can be told to fail */
function fakeServer(initial: Snapshot) {
  let snap = initial;
  const sent: string[] = [];
  const control = { down: false, signedOut: false, delivered: [] as string[] };
  const transport: Transport = {
    fetchSnapshot: async () => {
      if (control.down) throw new Error("offline");
      if (control.signedOut) return { ok: false, reason: "signed_out" };
      return snap;
    },
    sendDay: async (env): Promise<DayCommandOutcome | { ok: false; reason: "signed_out" }> => {
      sent.push(env.cid);
      if (control.down) throw new Error("offline");
      if (control.signedOut) return { ok: false, reason: "signed_out" };
      if (control.delivered.includes(env.cid)) return { ok: true, changed: false, version: 0, day: TODAY };
      const row = snap.days[0];
      const r = applyDayCommand(row.state, env.cmd, { by: snap.persona, at: env.at });
      if (!r.ok) return { ok: false, reason: r.reason };
      control.delivered.push(env.cid);
      snap = { ...snap, days: [{ ...row, state: r.state, version: row.version + 1 }] };
      return { ok: true, changed: r.changed, version: row.version + 1, day: TODAY };
    },
    sendLog: async (): Promise<LogCommandOutcome> => ({ ok: true, changed: true, version: 1, logId: "x" }),
  };
  return { transport, sent, control, serverState: () => snap.days[0].state, setSnap: (s: Snapshot) => (snap = s) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("the phone-side sync engine", () => {
  it("shows a press at once and the server ends up with the same thing", async () => {
    const server = fakeServer(base());
    const engine = createSyncEngine({ initial: base(), transport: server.transport });
    const r = engine.day({ kind: "heart", now: 1150 }, at);
    expect(r.ok).toBe(true);
    // before any round trip, the screen already shows it
    expect(engine.getView().snapshot.days[0].state.actuals.steps).not.toEqual({});
    expect(engine.getView().pending).toBe(1);
    await engine.flush();
    expect(engine.getView().pending).toBe(0);
    expect(Object.keys(server.serverState().actuals.steps).length).toBeGreaterThan(0);
  });

  it("a press that breaks a rule is refused on the spot and never queued", () => {
    const server = fakeServer(base());
    const engine = createSyncEngine({ initial: base(), transport: server.transport });
    engine.day({ kind: "heart", now: 1150 }, at);
    const r = engine.day({ kind: "plan.set", plan: "B", homePerson: "tawi" }, at);
    expect(r).toMatchObject({ ok: false, reason: "locked" });
    expect(engine.getView().pending).toBe(1); // only the heart
  });

  it("when the other phone got there first, the server's refusal becomes a plain notice", async () => {
    const server = fakeServer(base());
    const engine = createSyncEngine({ initial: base(), transport: server.transport });
    // meanwhile, the other person pressed ❤️ — the server already holds it, this phone does not know yet
    const other = applyDayCommand(createDayState(TODAY), { kind: "heart", now: 1100 }, { by: "tawi", at: "2036-01-02T09:00:00.000Z" });
    if (!other.ok) throw new Error("setup");
    server.setSnap({ ...base(), days: [{ day: TODAY, state: other.state, version: 2 }] });

    expect(engine.day({ kind: "plan.set", plan: "B", homePerson: "tawi" }, at).ok).toBe(true); // this phone still thinks it is open
    await engine.flush();
    const view = engine.getView();
    expect(view.pending).toBe(0);
    expect(view.notices[0].message).toContain("잠겼");
    // and the screen now shows the server's truth, not the press
    expect(view.snapshot.days[0].state.plan).toBe("A");
  });

  it("offline: keeps the press, keeps showing it, and sends it when the connection returns", async () => {
    const server = fakeServer(base());
    server.control.down = true;
    const engine = createSyncEngine({ initial: base(), transport: server.transport });
    engine.day({ kind: "desired.set", minute: 1320 }, at);
    await engine.flush();
    expect(engine.getView()).toMatchObject({ pending: 1, offline: true });
    expect(engine.getView().snapshot.days[0].state.desiredMealStart).toBe(1320);

    server.control.down = false;
    await engine.flush();
    expect(engine.getView()).toMatchObject({ pending: 0, offline: false });
    expect(server.serverState().desiredMealStart).toBe(1320);
  });

  it("a press whose reply was lost is sent again with the same id, and lands once", async () => {
    const server = fakeServer(base());
    const engine = createSyncEngine({ initial: base(), transport: server.transport });
    engine.day({ kind: "eta.field", person: "yangcho", reference: "home_arrival", time: 1150 }, at);
    await engine.flush();
    // pretend the phone never heard back and retries the same envelope
    const cid = server.sent[0];
    const again = await server.transport.sendDay({ cid, at: at.toISOString(), cmd: { kind: "eta.field", person: "yangcho", reference: "home_arrival", time: 1150 } });
    expect(again).toMatchObject({ ok: true, changed: false });
    expect(server.serverState().eta.yangcho.filter((e) => e.reference === "home_arrival")).toHaveLength(1);
  });

  it("unsent presses survive a reload and go out in order", async () => {
    const stored: { v: string | null } = { v: null };
    const pendingStore = { get: () => stored.v, set: (v: string) => (stored.v = v) };
    const server = fakeServer(base());
    server.control.down = true;
    const first = createSyncEngine({ initial: base(), transport: server.transport, pendingStore });
    first.day({ kind: "desired.set", minute: 1300 }, at);
    first.day({ kind: "desired.set", minute: 1310 }, at);
    await first.flush();

    server.control.down = false;
    const second = createSyncEngine({ initial: base(), transport: server.transport, pendingStore });
    expect(second.getView().pending).toBe(2);
    await second.flush();
    await tick();
    expect(server.serverState().desiredMealStart).toBe(1310);
  });

  it("a signed-out phone keeps its queue and says so", async () => {
    const server = fakeServer(base());
    server.control.signedOut = true;
    const engine = createSyncEngine({ initial: base(), transport: server.transport });
    engine.day({ kind: "desired.set", minute: 1320 }, at);
    await engine.flush();
    expect(engine.getView()).toMatchObject({ signedOut: true, pending: 1 });
  });
});
