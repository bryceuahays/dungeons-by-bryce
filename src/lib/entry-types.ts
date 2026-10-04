// Shared by the server and the browser: the shape of a table-tool entry and the one
// visibility rule (the same rule the database enforces in entry_open()).

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Entry = {
  id: string; campaign_id: string; kind: string; parent: string | null; owner: string | null; sort: number; title: string; status: string;
  data: Record<string, any>; live: boolean; vis: string; vis_players: string[]; vis_stage: string | null; vis_entry: string | null; created_at: string; updated_at: string;
  secret?: Record<string, any>;   // only ever filled in for the DM
};

export type Viewer = { player: string | null; stage: string; stages: string[] };

export function entryOpen(e: Pick<Entry, 'vis' | 'vis_players' | 'vis_stage' | 'vis_entry'>, v: Viewer, hit: Set<string>): boolean {
  switch (e.vis) {
    case 'all': return true;
    case 'players': return !!v.player && (e.vis_players ?? []).includes(v.player);
    case 'stage': { if (!e.vis_stage) return true; const at = v.stages.indexOf(e.vis_stage), now = v.stages.indexOf(v.stage); return at >= 0 && now >= at; }
    case 'entry': return !!e.vis_entry && hit.has(e.vis_entry);
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
