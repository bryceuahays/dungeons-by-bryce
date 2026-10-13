// Feature flags: how unfinished work is merged to main without anyone seeing it.
//
// A flag that is off hides its page or feature from everyone except:
//   * the Head DM (the site owner), so he can try it on the live site, and
//   * the automated tests' throwaway accounts, so the feature is tested while it is hidden.
//     (They carry a mark only the server can set. Nobody can give themselves one, for
//     example by signing up with an address that looks like a test account's.)
// Setting `on: true` (with the date in `released`) turns it on for everyone. That is the
// whole switch: change it here, merge, deploy.
//
// There is one flag per item of the hub version 2 build plan (docs/design/build-plan.md),
// named hub_v2_<page>. They are all listed here from the start so that building an item
// never means editing this file, only checking its flag. When an item is finished and
// released, its flag and the checks for it are removed in a small pull request of their own.
//
// No imports: pages, server code, scripts and tests all load this file directly.

export type FlagDef = { what: string; issue: number; on: boolean; released?: string };

export const FLAGS = {
  hub_v2_switches: { what: 'Page and feature switches', issue: 84, on: false },
  hub_v2_visibility: { what: 'Visibility upgrades and partial NPC reveals', issue: 85, on: false },
  hub_v2_dice: { what: 'Dice rolling, public and private', issue: 86, on: false },
  hub_v2_people: { what: 'Co-DM screen and permissions', issue: 62, on: false },
  hub_v2_settings: { what: 'Campaign settings page', issue: 87, on: false },
  hub_v2_shell: { what: 'Header, page tabs, character sidebar and phone layout', issue: 88, on: false },
  hub_v2_welcome: { what: 'Welcome page', issue: 89, on: false },
  hub_v2_npcs: { what: 'NPCs page', issue: 90, on: false },
  hub_v2_lore: { what: 'Lore page and lore categories', issue: 51, on: false },
  hub_v2_combat: { what: 'Combat page', issue: 91, on: false },
  hub_v2_players: { what: 'Players page', issue: 92, on: false },
  hub_v2_reveals: { what: 'Reveals: the DM overview of hidden things', issue: 93, on: false },
  hub_v2_timeline: { what: 'Timeline restyle', issue: 94, on: false },
  hub_v2_map: { what: 'Map page: pin layers and "party is here"', issue: 95, on: false },
  hub_v2_quests: { what: 'Quest log', issue: 96, on: false },
  hub_v2_loot: { what: 'Party loot', issue: 97, on: false },
  hub_v2_relations: { what: 'Relationship web', issue: 98, on: false },
  hub_v2_handouts: { what: 'Handouts and "Push handout"', issue: 99, on: false },
  hub_v2_search: { what: 'Hub-wide search', issue: 100, on: false },
  hub_v2_setup: { what: 'New campaign setup in four steps', issue: 101, on: false },
  hub_v2_live: { what: 'Live session screen', issue: 102, on: false },
} satisfies Record<string, FlagDef>;

export type Flag = keyof typeof FLAGS;
export const FLAG_NAMES = Object.keys(FLAGS) as Flag[];

// Who is asking. `test` is the mark on the automated tests' accounts (src/lib/flags.ts reads it
// from the database). A test that wants an ordinary account makes one without the mark:
// makeUser(label, { unblocked: true }) in tests/helpers.mjs.
export type FlagViewer = { role?: string | null; test?: boolean | null } | null | undefined;

// Is this flag on for this person? Pure: no database, no request. `table` is only passed by tests.
export function flagOn(name: Flag, viewer: FlagViewer, table: Record<string, FlagDef> = FLAGS): boolean {
  const def = table[name];
  if (!def) return false;                       // a flag that is not listed is off
  if (def.on) return true;                      // released: on for everyone
  if (!viewer) return false;                    // signed out
  if (viewer.role === 'head') return true;      // the site owner
  return viewer.test === true;                  // an automated test's account
}

// Every flag at once for one person, for handing to a client component as plain data.
export const flagsFor = (viewer: FlagViewer, table: Record<string, FlagDef> = FLAGS) =>
  Object.fromEntries(Object.keys(table).map((name) => [name, flagOn(name as Flag, viewer, table)])) as Record<Flag, boolean>;
