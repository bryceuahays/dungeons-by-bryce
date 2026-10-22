// The Quest log's sums (hub version 2, item 17; Quests.png). Pure, so tests load this file directly.
//
// A quest is an entry (kind 'quest'): status 'active', 'completed' or 'failed'; in `data` whether it
// is the main quest, who gave it and where (an NPC or a lore place by id, or a name typed in), the
// session it started and ended in, a summary, and the reward if players may know it. A reward kept
// back waits in entry_secrets until the quest is completed. Each objective is an entry too (kind
// 'objective', its quest in `parent`, status 'open' or 'done'), with its own visibility.

export type Status = 'active' | 'completed' | 'failed';
export const STATUSES: [Status, string][] = [['active', 'Active'], ['completed', 'Completed'], ['failed', 'Failed']];
export type RewardWhen = 'now' | 'done';
export const REWARD_WHEN: [RewardWhen, string][] = [['now', 'Right away'], ['done', 'When the quest is completed']];

type Row = { id: string; title: string; status: string; sort?: number; created_at?: string; data: Record<string, unknown>; secret?: Record<string, unknown> | null };
export type Objective = Row & { parent: string | null };
export type Named = { id: string; title: string };

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const session = (v: unknown) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, 999) : undefined; };
export const statusOf = (q: { status: string }): Status => (q.status === 'completed' || q.status === 'failed' ? q.status : 'active');

// What the DM typed, as it is saved: the quest's own data (what players may read) and its secret
// (the DM's notes, and a reward held back). A held reward is put on the quest once it is completed.
export type QuestInput = {
  main?: boolean; giver?: string; giverName?: string; place?: string; placeName?: string; since?: unknown; done?: unknown;
  summary?: string; reward?: string; rewardWhen?: RewardWhen; notes?: string; status?: string;
};
export function splitQuest(input: QuestInput): { status: Status; data: Record<string, unknown>; secret: Record<string, unknown> } {
  const status = statusOf({ status: String(input.status ?? '') });
  const data: Record<string, unknown> = {};
  if (input.main) data.main = true;
  if (typeof input.giver === 'string' && UUID.test(input.giver)) data.giver = input.giver;
  else if (str(input.giverName, 80)) data.giverName = str(input.giverName, 80);
  if (typeof input.place === 'string' && UUID.test(input.place)) data.place = input.place;
  else if (str(input.placeName, 80)) data.placeName = str(input.placeName, 80);
  const since = session(input.since), done = session(input.done);
  if (since) data.since = since;
  if (done && status !== 'active') data.done = done;
  if (str(input.summary, 2000)) data.summary = str(input.summary, 2000);
  const secret: Record<string, unknown> = {};
  if (str(input.notes, 5000)) secret.notes = str(input.notes, 5000);
  const reward = str(input.reward, 300);
  if (reward) {
    const when: RewardWhen = input.rewardWhen === 'done' ? 'done' : 'now';
    if (when === 'now' || status === 'completed') data.reward = reward;
    else data.rewardLater = true;
    if (when === 'done') secret.reward = reward;
    secret.rewardWhen = when;
  }
  return { status, data, secret };
}

// The editor's starting values, from a quest as stored (the DM's copy, with its secret).
export function inputOf(q: Partial<Row> | undefined): QuestInput {
  const d = q?.data ?? {}, s = q?.secret ?? {};
  return {
    main: !!d.main, giver: typeof d.giver === 'string' ? d.giver : '', giverName: str(d.giverName, 80), place: typeof d.place === 'string' ? d.place : '', placeName: str(d.placeName, 80),
    since: d.since ?? '', done: d.done ?? '', summary: str(d.summary, 2000), status: q?.status ? statusOf({ status: q.status }) : 'active',
    reward: str(s.reward, 300) || str(d.reward, 300), rewardWhen: s.rewardWhen === 'done' ? 'done' : 'now', notes: str(s.notes, 5000),
  };
}

// "Given by Lady Sable · The Drowned Library · Since Session 1". A giver or place the reader may
// not see is left out, never named.
export function givenLine(q: Row, npcs: Named[], places: Named[]): string {
  const d = q.data;
  const who = typeof d.giver === 'string' ? npcs.find((n) => n.id === d.giver)?.title : str(d.giverName, 80);
  const where = typeof d.place === 'string' ? places.find((n) => n.id === d.place)?.title : str(d.placeName, 80);
  const s = statusOf(q);
  const when = s !== 'active' && session(d.done) ? `${s === 'completed' ? 'Done' : 'Failed'} in Session ${session(d.done)}` : session(d.since) ? `Since Session ${session(d.since)}` : '';
  return [who ? `Given by ${who}` : '', where ?? '', when].filter(Boolean).join(' · ');
}

// A quest's objectives in order, how many are done, and how many the reader cannot see yet.
export function progress(objectives: Objective[], hidden: number): { done: number; total: number; line: string } {
  const done = objectives.filter((o) => o.status === 'done').length;
  const total = objectives.length + Math.max(0, hidden);
  return { done, total, line: total ? `${done} of ${total} objective${total === 1 ? '' : 's'}` : 'No objectives yet' };
}
export const byOrder = <T extends { sort?: number; created_at?: string }>(a: T, b: T) => (Number(a.sort) || 0) - (Number(b.sort) || 0) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));

// The right-hand note on a card: what is still to come.
export function heldNote(q: Row, hidden: number, show: { hidden: boolean; rewards: boolean }): string {
  if (show.hidden && hidden > 0) return `${hidden} objective${hidden === 1 ? '' : 's'} still hidden`;
  if (show.rewards && q.data.rewardLater && statusOf(q) === 'active') return 'Reward revealed on completion';
  return '';
}

// The tabs and their groups: the main quest first, then side quests; finished ones in their tabs.
export function tabsOf<T extends Row>(quests: T[]): Record<Status, { title: string; quests: T[] }[]> {
  const by = (s: Status) => quests.filter((q) => statusOf(q) === s).sort(byOrder);
  const active = by('active');
  return {
    active: [{ title: 'Main quest', quests: active.filter((q) => q.data.main) }, { title: 'Side quests', quests: active.filter((q) => !q.data.main) }].filter((g) => g.quests.length),
    completed: [{ title: 'Completed', quests: by('completed') }].filter((g) => g.quests.length),
    failed: [{ title: 'Failed', quests: by('failed') }].filter((g) => g.quests.length),
  };
}

// The Welcome page's "Active quests": the ones this person tracks, or, if none (or tracking is
// off), the main quests and then the side quests, a few at most.
export function welcomeQuests<T extends Row>(quests: T[], tracked: ReadonlySet<string>, track: boolean, max = 3): T[] {
  const active = quests.filter((q) => statusOf(q) === 'active').sort((a, b) => Number(!!b.data.main) - Number(!!a.data.main) || byOrder(a, b));
  const mine = track ? active.filter((q) => tracked.has(q.id)) : [];
  return (mine.length ? mine : active).slice(0, max);
}
