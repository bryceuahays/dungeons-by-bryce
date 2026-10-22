// The timeline strip (hub version 2, item 15; Timeline.png): the campaign session by session.
// Pure, so tests load this file directly.
//
// "The session you are on" (settings.session, set in the Timeline tool) and every session before it
// are played; the one after it is up next; later sessions the DM has planned follow, for the DM only.
// Each session shows what happened in it (story beats, by the session they were marked hit in),
// custom events the DM added to it, and, for the DM only, what is planned for it (key beats aimed at
// it, reveals waiting for it).

export type Beat = { id: string; title: string; status: string; vis: string; data: Record<string, unknown> };
export type PlannedSession = { number: number; title: string; status: string };
export type Reveal = { title: string; session: number };
export type Event = { id: string; label: string; kind: 'story' | 'custom' | 'planned' };
export type Column = { n: number; label: string; sub: string; state: 'done' | 'next' | 'planned'; events: Event[] };

const n = (v: unknown) => { const x = Math.trunc(Number(v)); return Number.isFinite(x) && x > 0 ? Math.min(x, 999) : 0; };

export function buildTimeline(a: { session: number; beats: Beat[]; dm: boolean; planned?: PlannedSession[]; reveals?: Reveal[]; custom?: boolean; showPlanned?: boolean }): Column[] {
  const now = n(a.session);
  const custom = a.custom !== false;
  const cols = new Map<number, Column>();
  const col = (k: number) => {
    if (!cols.has(k)) {
      const state: Column['state'] = k <= now ? 'done' : k === now + 1 ? 'next' : 'planned';
      cols.set(k, { n: k, label: k ? `Session ${k}` : 'Earlier', sub: state === 'done' ? 'Played' : state === 'next' ? 'Up next' : 'Planned · DM only', state, events: [] });
    }
    return cols.get(k)!;
  };
  // every played session has its place, and so does the next one
  for (let k = 1; k <= now; k++) col(k);
  col(now + 1);

  for (const b of a.beats) {
    if (b.status === 'hit') {
      if (b.data.custom && !custom) continue;
      const at = n(b.data.hitSession);
      col(at <= now + 1 ? at : now).events.push({ id: b.id, label: b.title, kind: b.data.custom ? 'custom' : 'story' });
    } else if (b.status === 'planned' && a.dm && a.showPlanned !== false) {
      const at = n(b.data.target);
      if (at > now) col(at).events.push({ id: b.id, label: b.title, kind: 'planned' });
    }
  }
  if (a.dm && a.showPlanned !== false) {
    // the DM's planned sessions get their place, with their title
    for (const s of a.planned ?? []) if (s.number > now && s.status !== 'played') { const c = col(s.number); if (s.title) c.sub = c.state === 'next' ? `Up next · ${s.title}` : `Planned · DM only · ${s.title}`; }
    (a.reveals ?? []).forEach((r, i) => { if (r.session > now) col(r.session).events.push({ id: 'r' + i, label: 'Reveal: ' + r.title, kind: 'planned' }); });
  }
  return [...cols.values()]
    .filter((c) => a.dm || c.state !== 'planned')
    .map((c) => (a.dm ? c : { ...c, events: c.events.filter((e) => e.kind !== 'planned') }))
    .filter((c) => c.n !== 0 || c.events.length)
    .sort((x, y) => x.n - y.n);
}
