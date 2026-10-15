// Reveal triggers (issue 117): "reveal this automatically when ...". Pure, so the server, the
// browser and the tests share it. The database's twin is reveal_met() in the reveal triggers
// migration; keep the two in step.
//
// A trigger is a short key:
//   session:<n>:started   once session <n> has been marked started (or played)
//   session:<n>:played    once session <n> has been marked played
//   beat:<id>             once that story beat has happened
//   chapter:<id>          once the campaign reaches that chapter (once called a stage)

export type Trigger =
  | { kind: 'session'; n: number; when: 'started' | 'played' }
  | { kind: 'beat'; id: string }
  | { kind: 'chapter'; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseTrigger(key: unknown): Trigger | null {
  if (typeof key !== 'string') return null;
  const [kind, arg = '', what = '', ...rest] = key.split(':');
  if (rest.length) return null;
  if (kind === 'session' && /^[0-9]{1,3}$/.test(arg) && (what === 'started' || what === 'played')) return { kind, n: Number(arg), when: what };
  if (kind === 'beat' && UUID.test(arg) && !what) return { kind, id: arg };
  if (kind === 'chapter' && arg && !what) return { kind, id: arg };
  return null;
}

export function triggerKey(t: Trigger): string {
  if (t.kind === 'session') return `session:${t.n}:${t.when}`;
  return `${t.kind}:${t.id}`;
}

// The keys that have happened in a campaign, from what the server can read: its sessions, the
// story beats that have happened, and the chapters (stages) reached at the stage being looked at.
export function metKeys(a: { sessions: { number: number; status: string }[]; hitBeats: string[]; stages: string[]; stage: string | null }): Set<string> {
  const out = new Set<string>();
  for (const s of a.sessions) {
    if (s.status === 'running' || s.status === 'played') out.add(`session:${s.number}:started`);
    if (s.status === 'played') out.add(`session:${s.number}:played`);
  }
  for (const id of a.hitBeats) out.add(`beat:${id}`);
  const at = a.stage ? a.stages.indexOf(a.stage) : -1;
  a.stages.forEach((id, i) => { if (at >= 0 && i <= at) out.add(`chapter:${id}`); });
  return out;
}

// The trigger in words: "Session 4 is marked played", "the chapter Act two starts".
export function triggerWords(key: unknown, names: { chapters?: { id: string; label: string }[]; beats?: { id: string; label: string }[] } = {}): string {
  const t = parseTrigger(key);
  if (!t) return 'something that cannot happen any more';
  if (t.kind === 'session') return t.when === 'started' ? `Session ${t.n} starts` : `Session ${t.n} is marked played`;
  if (t.kind === 'beat') return `"${names.beats?.find((b) => b.id === t.id)?.label ?? 'a story beat'}" happens`;
  return `the chapter "${names.chapters?.find((c) => c.id === t.id)?.label ?? 'a chapter'}" starts`;
}

// Session statuses, in order. 'running' (under way) is new with triggers.
export const SESSION_STATUSES: [string, string][] = [['unplanned', 'Not planned yet'], ['planned', 'Planned'], ['ready', 'Ready to run'], ['running', 'Under way'], ['played', 'Played']];
