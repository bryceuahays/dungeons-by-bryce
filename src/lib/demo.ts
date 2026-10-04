import 'server-only';
import { cache } from 'react';
import { createPublicClient } from './supabase/public';
import type { CampaignCtx } from './campaign';
import type { Campaign, Section } from './types';

// The public demo: one campaign, flagged in the database, that anyone can browse as a
// player without signing up. It is read with a client that has NO login, so the database
// hands over exactly what it would hand a player and nothing a DM would see. The object
// built here stands in for the usual campaign context, with the visitor as a guest.
const GUEST = '00000000-0000-0000-0000-000000000000';

export const getDemo = cache(async (): Promise<CampaignCtx | null> => {
  const supabase = createPublicClient();
  const { data: row } = await supabase.from('campaigns').select('*, sections(*)').eq('is_demo', true).order('created_at').limit(1).maybeSingle();
  if (!row) return null;
  const { sections: all, ...campaign } = row as Campaign & { sections: Section[] };
  const sections = (all ?? []).filter((s) => s.kind === 'content').sort((a, b) => a.sort - b.sort);
  return {
    supabase, user: { id: GUEST, email: '' }, profile: { id: GUEST, display_name: 'Guest', email: '', role: 'player', hub_bg: {} }, isHead: false,
    campaign, sections, isDm: false, realDm: false, asPlayer: false, headView: false, faces: [], dmTitle: campaign.title,
    access: { pro: true, writable: false }, canEdit: false, viewAs: { player: null, stage: null }, realPhase: campaign.phase,
  } as unknown as CampaignCtx;
});

export const DEMO_TOOLS = [['npcs', 'NPCs'], ['timeline', 'Timeline'], ['maps', 'Maps'], ['world', 'World state'], ['zero', 'Session zero']] as const;
