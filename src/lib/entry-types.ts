// Shared by the server and the browser: the shape of a table-tool entry and the one
// visibility rule (the same rule the database enforces in entry_open()).

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Entry = {
  id: string; campaign_id: string; kind: string; parent: string | null; owner: string | null; sort: number; title: string; status: string;
  data: Record<string, any>; live: boolean; vis: string; vis_players: string[]; vis_stage: string | null; vis_entry: string | null; created_at: string; updated_at: string;
  secret?: Record<string, any>;   // only ever filled in for the DM
};

// `met` is the reveal triggers that have happened (src/features/hub/reveals/triggers.ts); without
// it, nothing that waits for a trigger is open.
export type Viewer = { player: string | null; stage: string; stages: string[]; met?: ReadonlySet<string> };

// `hit` is the ids of the story beats that have happened.
//   all            every member            players        the named players
//   stage          from that stage on      entry          once that beat has happened
//   players_stage  the named players, from that stage on
//   players_entry  the named players, once that beat has happened
//   when           everyone, once the trigger in vis_stage has happened (sessions, beats, chapters)
//   players_when   the named players, once that trigger has happened
//   anything else (dm)  nobody but the DM
export function entryOpen(e: Pick<Entry, 'vis' | 'vis_players' | 'vis_stage' | 'vis_entry'>, v: Viewer, hit: Set<string>): boolean {
  const named = () => !!v.player && (e.vis_players ?? []).includes(v.player);
  const reached = () => { if (!e.vis_stage) return true; const at = v.stages.indexOf(e.vis_stage), now = v.stages.indexOf(v.stage); return at >= 0 && now >= at; };
  const happened = () => !!e.vis_entry && hit.has(e.vis_entry);
  const triggered = () => !!e.vis_stage && !!v.met && v.met.has(e.vis_stage);
  switch (e.vis) {
    case 'all': return true;
    case 'players': return named();
    case 'stage': return reached();
    case 'entry': return happened();
    case 'players_stage': return named() && reached();
    case 'players_entry': return named() && happened();
    case 'when': return triggered();
    case 'players_when': return named() && triggered();
    default: return false;
  }
}

// What every table tool is handed.
export type ToolProps = {
  campaignId: string; slug: string; userId: string;
  base?: string;      // where this campaign's pages live (default /c/<slug>)
  dm: boolean;        // may edit as the DM (not while previewing, not the Head DM's read-only view)
  canWrite: boolean;  // the campaign is not read-only
  stages: { id: string; label: string }[];
  members: { user_id: string; display_name: string }[];
  can: Record<string, boolean>;   // plan features this campaign can USE
  make: Record<string, boolean>;  // plan features it can make NEW things of (a bought campaign on the free plan: use yes, make no)
  session: number;    // the campaign's current session number
};

export const SRD_CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious', 'Exhaustion'];
