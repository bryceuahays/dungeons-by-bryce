/* eslint-disable @typescript-eslint/no-explicit-any */
import { notFound, redirect } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { getSystemEntities } from '@/lib/campaign';
import { CharacterCreator } from '@/components/CharacterCreator';
import { isSystem } from '@/config/systems';

export const metadata = { title: 'Create a character' };

// The step-by-step character creator for a character that is not in a campaign. It offers the
// SRD for the character's system; a campaign's own homebrew comes with the campaign.
export default async function SoloCreate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireViewer();
  const { data: row } = await supabase.from('characters').select('id, campaign_id, system, data').eq('id', id).eq('owner', user.id).maybeSingle();
  if (!row) notFound();
  if (row.campaign_id) {
    const { data: camp } = await supabase.from('campaigns').select('slug').eq('id', row.campaign_id).maybeSingle();
    if (camp) redirect(`/c/${camp.slug}/create?c=${row.id}`);
  }
  const system = isSystem(row.system) ? row.system : '2024';
  const mine = (row.data ?? {}) as any;
  const keep = [mine.raceId, mine.clsId, mine.subId, mine.bgId, ...(mine.feats ?? []), ...(mine.spells ?? [])].filter(Boolean) as string[];
  const [entities, items] = await Promise.all([
    getSystemEntities(supabase, system, ['race', 'class', 'subclass', 'background', 'feat', 'spell', 'resource'], { liteSpells: true, keep }),
    getSystemEntities(supabase, system, ['item']),
  ]);
  // weapons for Weapon Mastery, and what an item is, for the equipment step
  const weapons = (items as any[]).filter((i) => i.data?.kind === 'Weapon' && i.data?.weapon?.mastery).map((i) => ({ name: i.name, mastery: String(i.data.weapon.mastery), cat: String(i.data.weapon.cat ?? '') }));
  const armors = (items as any[]).filter((i) => i.data?.armor?.type && Number(i.data.armor.base)).map((i) => ({ name: i.name, type: String(i.data.armor.type), base: Number(i.data.armor.base), dex: (i.data.armor.dex ?? 'full') as 'full' | 'max2' | 'none' }));
  return (
    <div className="cs-guide">
      <div className="wrap">
        <CharacterCreator slug="" done={`/characters/${row.id}`} character={{ id: row.id, data: row.data }} entities={entities as any} weapons={weapons} armors={armors} />
      </div>
    </div>
  );
}
