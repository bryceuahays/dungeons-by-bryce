/* eslint-disable @typescript-eslint/no-explicit-any */
// The spells a class editor can put on a class's spell list: every SRD 5.2 spell, plus the
// viewer's own homebrew spells. Only what the list needs; the full text is fetched on demand.

export type SpellOption = { id: string; name: string; level: number; school: string; mine: boolean; classes: string[] };

const classNames = (v: unknown) => (Array.isArray(v) ? v : String(v ?? '').replace(/[[\]"]/g, '').split(',')).map((x) => String(x).trim()).filter(Boolean);

export async function loadSpellOptions(supabase: any, userId: string): Promise<SpellOption[]> {
  const cols = 'id, name, owner_id, level:data->level, school:data->>school, classes:data->classes';
  const [srd, mine] = await Promise.all([
    supabase.from('entities').select(cols).eq('source', 'srd').eq('srd_version', '5.2').eq('type', 'spell').order('name').limit(1000),
    supabase.from('entities').select(cols).eq('owner_id', userId).eq('type', 'spell').order('name').limit(1000),
  ]);
  return [...(mine.data ?? []), ...(srd.data ?? [])].map((s: any) => ({
    id: s.id, name: s.name, level: Number(s.level) || 0, school: s.school ?? '', mine: s.owner_id === userId, classes: classNames(s.classes),
  }));
}

// The SRD's own list for a class, by class name: where a class from the picker starts.
export const srdListFor = (spells: SpellOption[], className: string) =>
  spells.filter((s) => !s.mine && s.classes.some((c) => c.toLowerCase() === className.toLowerCase())).map((s) => s.id);

// The SRD 5.2 feats, for features where the player chooses one (Fighting Style, Epic Boon, ...).
export async function loadFeatOptions(supabase: any): Promise<{ name: string; category: string; desc: string }[]> {
  const { data } = await supabase.from('entities').select('name, category:data->>category, desc:data->>desc').eq('source', 'srd').eq('srd_version', '5.2').eq('type', 'feat').order('name');
  return (data ?? []).map((f: any) => ({ name: f.name, category: f.category ?? '', desc: f.desc ?? '' }));
}

// Subclasses for the class editor's Subclasses tab: the SRD 5.2 ones and your own.
export async function loadSubclassOptions(supabase: any, userId: string) {
  const [srd, mine] = await Promise.all([
    supabase.from('entities').select('id, name, owner_id, data, cloned_from').eq('source', 'srd').eq('srd_version', '5.2').eq('type', 'subclass').order('name'),
    supabase.from('entities').select('id, name, owner_id, data, cloned_from').eq('owner_id', userId).eq('type', 'subclass').order('name'),
  ]);
  return [...(mine.data ?? []), ...(srd.data ?? [])].map((s: any) => ({ id: s.id as string, name: s.name as string, mine: s.owner_id === userId, data: s.data ?? {}, cloned_from: s.cloned_from ?? null }));
}

// The classes a subclass can belong to (its own page's "Belongs to class"): your own, then the SRD's 2024 ones.
export async function loadClassOptions(supabase: any, userId: string) {
  const [srd, mine] = await Promise.all([
    supabase.from('entities').select('id, name, owner_id, data').eq('source', 'srd').eq('srd_version', '5.2').eq('type', 'class').order('name'),
    supabase.from('entities').select('id, name, owner_id, data').eq('owner_id', userId).eq('type', 'class').order('name'),
  ]);
  return [...(mine.data ?? []), ...(srd.data ?? [])].map((c: any) => ({ id: c.id as string, name: c.name as string, mine: c.owner_id === userId, data: c.data ?? {} }));
}

// Item names for a class's starting equipment (SRD 2024 weapons, armor and gear; not magic items).
export async function loadItemNames(supabase: any): Promise<string[]> {
  const { data } = await supabase.from('entities').select('name').eq('source', 'srd').eq('srd_version', '5.2').eq('type', 'item').neq('data->>kind', 'Magic item').order('name');
  return [...new Set<string>((data ?? []).map((i: any) => i.name))];
}
