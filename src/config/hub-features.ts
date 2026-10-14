// The hub's pages and the features on each (hub version 2, item 3), and which of them a
// campaign has switched off.
//
// The names are the ones in docs/design/mockups/source/FeatureToggles.dc.html; a test compares
// them. A default page is always there: only its features can be switched off. An optional
// page can be switched off whole.
//
// What a campaign has switched off is kept in settings.features as { off: [ids] }: an optional
// page's id ('map'), or a feature's id with its page ('combat.map'). It records what is OFF,
// so a campaign with no list keeps everything on, and a feature added here later starts on for
// every campaign. Switching something off only hides it. Its content is kept.
//
// Each page names its feature flag (src/config/flags.ts). The flag decides whether the page
// exists yet for the viewer; the switch decides whether this campaign uses it. A page checks
// both: `await requireFlag('hub_v2_map')` and `hasPage(campaign.settings, 'map')`.
//
// `startsOff` marks what the mockups show switched off in a brand-new campaign. Only new
// campaign setup (item 22) reads it. It never switches anything off for an existing campaign.
//
// Only a type is imported, so scripts and tests can load this file directly.
import type { Flag } from './flags';

type FeatureDef = { id: string; name: string; what?: string; needs?: string; startsOff?: true };
type PageDef = { id: string; name: string; what: string; optional: boolean; flag: Flag; startsOff?: true; features: readonly FeatureDef[] };

export const HUB_PAGES = [
  { id: 'welcome', name: 'Welcome', what: 'the hub home page', optional: false, flag: 'hub_v2_welcome', features: [
    { id: 'banner', name: 'Intro video or banner' }, { id: 'recap', name: 'Session recap' }, { id: 'next', name: 'Next session and RSVP' },
    { id: 'revealed', name: 'Newly revealed' }, { id: 'quests', name: 'Active quests', needs: 'quests' }, { id: 'handouts', name: 'Handouts shelf' },
  ] },
  { id: 'sidebar', name: 'Character sidebar', what: 'on every page', optional: false, flag: 'hub_v2_shell', features: [
    { id: 'attributes', name: 'Attributes' }, { id: 'skills', name: 'Skills' }, { id: 'tap', name: 'Tap to roll' },
    { id: 'log', name: 'Party dice log' }, { id: 'private', name: 'Private rolls', what: 'Roll to the DM only, or just yourself' }, { id: 'conditions', name: 'Conditions' },
  ] },
  { id: 'npcs', name: 'NPCs', what: 'everyone the party meets', optional: false, flag: 'hub_v2_npcs', features: [
    { id: 'portraits', name: 'Portraits' }, { id: 'attitude', name: 'Attitude tags', what: 'Ally, neutral, hostile' }, { id: 'partial', name: 'Partial reveals', what: 'Name only, name and portrait…' },
    { id: 'connections', name: 'Connections', needs: 'relations' }, { id: 'filters', name: 'Filters and search' },
  ] },
  { id: 'lore', name: 'Lore', what: 'the world, by category', optional: false, flag: 'hub_v2_lore', features: [
    { id: 'templates', name: 'Category templates' }, { id: 'import', name: 'Import from a document' }, { id: 'bestiary', name: "Bestiary: what you've learned" }, { id: 'history', name: 'History as a timeline' },
  ] },
  { id: 'combat', name: 'Combat', what: 'fights at the table', optional: false, flag: 'hub_v2_combat', features: [
    { id: 'initiative', name: 'Initiative tracker' }, { id: 'map', name: 'Battle map', what: 'Resizable map with tokens', startsOff: true }, { id: 'autoroll', name: 'Auto-roll NPC initiative' },
    { id: 'health', name: 'Enemy health as a status', what: 'Healthy, Bloodied, Down' }, { id: 'conditions', name: 'Conditions and concentration' }, { id: 'actions', name: 'Target and action buttons' },
  ] },
  { id: 'players', name: 'Players', what: 'each character in full', optional: false, flag: 'hub_v2_players', features: [
    { id: 'sheet', name: 'Full character sheet' }, { id: 'dmnote', name: 'Private note to the DM' }, { id: 'notes', name: 'Personal notes' },
    { id: 'share', name: 'Party can view other sheets', what: 'Only what each player shares' },
  ] },
  { id: 'timeline', name: 'Timeline', what: 'session by session', optional: false, flag: 'hub_v2_timeline', features: [
    { id: 'custom', name: 'Custom events' }, { id: 'planned', name: 'Planned sessions', what: 'DM only' }, { id: 'dates', name: 'In-world dates', what: 'Uses your Calendar lore', startsOff: true },
  ] },
  // "Secrets" in the mockups. The plan calls the page Reveals: Secrets is already a table tool.
  { id: 'reveals', name: 'Reveals', what: 'DM only', optional: false, flag: 'hub_v2_reveals', features: [
    { id: 'schedule', name: 'Reveal schedule' }, { id: 'inbox', name: 'Player messages inbox' }, { id: 'plot', name: 'Plot secrets' },
  ] },
  { id: 'settings', name: 'Campaign settings', what: 'DM and permitted co-DMs', optional: false, flag: 'hub_v2_settings', features: [
    { id: 'discord', name: 'Discord posting' }, { id: 'visibility', name: 'Visibility defaults' }, { id: 'dice', name: 'Dice privacy rules' }, { id: 'archive', name: 'Archive campaign' },
  ] },
  { id: 'people', name: 'People and permissions', what: 'DM and permitted co-DMs', optional: false, flag: 'hub_v2_people', features: [
    { id: 'codms', name: 'Co-DMs' }, { id: 'presets', name: 'Permission presets' }, { id: 'discord', name: 'Invite by Discord username' },
  ] },

  { id: 'map', name: 'Map', what: 'world map with pins', optional: true, flag: 'hub_v2_map', features: [
    { id: 'pins', name: 'Pins that reveal' }, { id: 'fog', name: 'Fog over unexplored areas' }, { id: 'party', name: 'Party location marker' },
  ] },
  { id: 'quests', name: 'Quest log', what: 'objectives and rewards', optional: true, flag: 'hub_v2_quests', features: [
    { id: 'hidden', name: 'Hidden objectives' }, { id: 'rewards', name: 'Rewards' }, { id: 'track', name: 'Track on Welcome page' },
  ] },
  { id: 'loot', name: 'Party loot', what: 'shared treasure', optional: true, flag: 'hub_v2_loot', features: [
    { id: 'coins', name: 'Coin purse' }, { id: 'claim', name: 'Claiming items' }, { id: 'unidentified', name: 'Unidentified items' }, { id: 'history', name: 'Loot history' },
  ] },
  { id: 'relations', name: 'Relationship web', what: 'who knows whom', optional: true, flag: 'hub_v2_relations', startsOff: true, features: [
    { id: 'hidden', name: 'Hidden connections' }, { id: 'center', name: 'Center on a person' },
  ] },
  { id: 'search', name: 'Hub-wide search', what: 'search box in the header', optional: true, flag: 'hub_v2_search', features: [
    { id: 'recaps', name: 'Search recaps' }, { id: 'filter', name: 'Filter by type' },
  ] },
  { id: 'live', name: 'Live session screen', what: 'DM view for running the table', optional: true, flag: 'hub_v2_live', startsOff: true, features: [
    { id: 'party', name: 'Party at a glance' }, { id: 'scene', name: 'Scene notes and read-aloud' }, { id: 'tray', name: 'Reveal and handout tray' }, { id: 'notes', name: 'Session notes to recap' },
  ] },
] as const satisfies readonly PageDef[];

type Page = (typeof HUB_PAGES)[number];
export type HubPageId = Page['id'];
export type HubFeatureId = { [P in Page as P['id']]: `${P['id']}.${P['features'][number]['id']}` }[HubPageId];
export type HubPage = PageDef;
export type HubFeature = FeatureDef;

const PAGES: readonly PageDef[] = HUB_PAGES;
export const hubPage = (id: string): PageDef | undefined => PAGES.find((p) => p.id === id);

// Everything that has a switch: the optional pages and every feature, in the order listed.
export const HUB_SWITCHES: string[] = PAGES.flatMap((p) => [...(p.optional ? [p.id] : []), ...p.features.map((f) => p.id + '.' + f.id)]);

type Settings = { features?: unknown } | null | undefined;

// What this campaign has switched off. Anything that is not a well-formed list counts as
// nothing switched off, so a campaign made before the switches existed keeps everything.
export function switchedOff(settings: Settings): Set<string> {
  const f = settings?.features;
  const off = f && typeof f === 'object' && !Array.isArray(f) ? (f as { off?: unknown }).off : null;
  return new Set(Array.isArray(off) ? off.map(String) : []);
}

// Does this campaign have this page? A default page: always. An optional one: unless it is switched off.
export function hasPage(settings: Settings, id: HubPageId): boolean {
  const p = hubPage(id);
  if (!p) return false;
  return !p.optional || !switchedOff(settings).has(p.id);
}

// Does this campaign have this feature ('combat.map')? Not if it is switched off, not if its
// page is, and not if it shows something from another page that is ('Active quests' needs the
// Quest log). An id that is not on the list is off.
export function hasFeature(settings: Settings, id: HubFeatureId): boolean {
  const [pageId, featureId, more] = String(id).split('.');
  const p = hubPage(pageId), f = p?.features.find((x) => x.id === featureId);
  if (!p || !f || more !== undefined) return false;
  const off = switchedOff(settings);
  if (off.has(p.id + '.' + f.id) || (p.optional && off.has(p.id))) return false;
  const needs = f.needs ? hubPage(f.needs) : null;
  return !(needs && needs.optional && off.has(needs.id));
}

// Makes a list of switches safe to store: only real switches, each once, in the listed order.
// Takes the stored shape ({ off: [...] }) or a bare list.
export function cleanFeatures(input: unknown): { off: string[] } {
  const list = Array.isArray(input) ? input : switchedOff({ features: input });
  const asked = new Set([...list].map(String));
  return { off: HUB_SWITCHES.filter((id) => asked.has(id)) };
}
