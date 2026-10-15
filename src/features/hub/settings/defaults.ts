// A campaign's visibility defaults (Campaign settings > Visibility defaults), kept in its
// settings as settings.visibility. Pure, so tests load this file directly.
//
// A campaign with none behaves exactly as campaigns always have: new content starts hidden,
// a new NPC shows players everything about them once revealed, and reveals to only some
// players are offered.

export type NewVis = 'dm' | 'all';
export type NpcReveal = 'all' | 'portrait' | 'name';
export type VisDefaults = {
  newVis: NewVis;          // new content starts as: hidden until I reveal it, or visible to every player
  npcReveal: NpcReveal;    // when a new NPC is revealed, players see: everything, name and portrait, or name only
  named: boolean;          // allow reveals to only some players
  discord: boolean;        // post scheduled reveals to Discord (kept for when Discord exists, issue 40)
};
export const VIS_DEFAULTS: VisDefaults = { newVis: 'dm', npcReveal: 'all', named: true, discord: false };

export const NEW_VIS: [NewVis, string][] = [['dm', 'Hidden until I reveal it'], ['all', 'Visible to every player']];
export const NPC_REVEAL: [NpcReveal, string][] = [['portrait', 'Name and portrait'], ['all', 'Everything'], ['name', 'Name only']];

export function visDefaults(settings: { visibility?: unknown } | null | undefined): VisDefaults {
  const v = (settings?.visibility && typeof settings.visibility === 'object' && !Array.isArray(settings.visibility) ? settings.visibility : {}) as Record<string, unknown>;
  return {
    newVis: v.newVis === 'all' ? 'all' : 'dm',
    npcReveal: v.npcReveal === 'portrait' || v.npcReveal === 'name' ? v.npcReveal : 'all',
    named: typeof v.named === 'boolean' ? v.named : true,
    discord: v.discord === true,
  };
}
// Makes a choice safe to store. Discord stays off until it exists.
export const cleanVisDefaults = (input: unknown): VisDefaults => ({ ...visDefaults({ visibility: input }), discord: false });
