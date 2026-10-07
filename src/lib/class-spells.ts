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
