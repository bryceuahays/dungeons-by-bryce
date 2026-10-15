/* eslint-disable @typescript-eslint/no-explicit-any */
// Loading game systems on the server. A campaign with settings.system uses that saved system; one
// without uses the ready-made rules of settings.rules, as before.
import { resolve, sheetSystem, type Sys } from './model';

type Supa = { from: (t: string) => any };
const isId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/.test(s);

export async function loadSystem(supabase: Supa, id: unknown): Promise<(Sys & { id: string; ownerId: string }) | null> {
  if (!isId(id)) return null;
  const { data } = await supabase.from('game_systems').select('id, owner_id, name, base, changes').eq('id', id).maybeSingle();
  return data ? { ...resolve(data), id: data.id, ownerId: data.owner_id } : null;
}

// the custom system a campaign plays (null: the ready-made rules)
export function campaignSystem(ctx: { supabase: Supa; campaign: { settings?: any } }) {
  return loadSystem(ctx.supabase, ctx.campaign.settings?.system);
}

export async function mySystems(supabase: Supa, userId: string) {
  const { data } = await supabase.from('game_systems').select('id, name, base, updated_at').eq('owner_id', userId).order('name');
  return (data ?? []) as { id: string; name: string; base: '2014' | '2024'; updated_at: string }[];
}

// What a system is used by, for "what this affects": the campaigns that play it, the characters in
// them, and the classes it offers (the official ones of its rules and the owner's homebrew).
export async function systemUsage(supabase: Supa, userId: string, base: string, id: string | null) {
  const version = base === '2014' ? '5.1' : '5.2';
  const [srd, own, camps] = await Promise.all([
    supabase.from('entities').select('name, data->casting, data->saves').eq('source', 'srd').eq('srd_version', version).eq('type', 'class').order('name'),
    supabase.from('entities').select('name, data->casting, data->saves').eq('owner_id', userId).neq('source', 'srd').eq('type', 'class').order('name'),
    id ? supabase.from('campaigns').select('id, title, slug').eq('owner_id', userId).eq('settings->>system', id) : { data: [] },
  ]);
  const campaigns = ((camps.data ?? []) as any[]).map((c) => ({ id: c.id as string, title: c.title as string }));
  const { data: chars } = campaigns.length ? await supabase.from('characters').select('data->name, campaign_id').in('campaign_id', campaigns.map((c) => c.id)) : { data: [] };
  const cls = (rows: any[], mine: boolean) => rows.map((r) => ({ name: r.name + (mine ? ' (your homebrew)' : ''), cast: String(r.casting?.kind && r.casting.kind !== 'none' ? r.casting.ability ?? '' : ''), saves: Array.isArray(r.saves) ? r.saves.map(String) : [] }));
  return {
    campaigns,
    characters: ((chars ?? []) as any[]).map((c) => String(c.name || 'Unnamed')),
    classes: [...cls(srd.data ?? [], false), ...cls(own.data ?? [], true)],
  };
}
export type SystemUsage = Awaited<ReturnType<typeof systemUsage>>;

// what the sheet and creator need from a campaign's custom system (null: the ready-made rules)
export async function campaignSheetSystem(ctx: { supabase: Supa; campaign: { settings?: any } }) {
  const sys = await campaignSystem(ctx);
  return sys ? sheetSystem(sys) : null;
}

// a character outside any campaign that plays one of its owner's own systems (data.gameSystem)
export async function characterSheetSystem(supabase: Supa, userId: string, gameSystem: unknown) {
  const sys = await loadSystem(supabase, gameSystem);
  return sys && sys.ownerId === userId ? { id: sys.id, name: sys.name, sheet: sheetSystem(sys) } : null;
}
