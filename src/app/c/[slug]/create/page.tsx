/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from 'next/navigation';
import { getCampaign, getSheetEntities, usesLegacySheet } from '@/lib/campaign';
import { CharacterCreator } from '@/components/CharacterCreator';

export const metadata = { title: 'Create a character' };

// The step-by-step character creator (class, background, species, abilities, equipment, spells,
// details). It offers what the DM left ticked under Players → What's available (settings.hidden).
export default async function Create({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string }> }) {
  const { slug } = await params;
  const { c } = await searchParams;
  const ctx = await getCampaign(slug);
  if (await usesLegacySheet(ctx.campaign.id)) redirect(`/c/${slug}/builder${c ? '?c=' + c : ''}`);
  if (!c || !/^[0-9a-f-]{36}$/.test(c)) redirect(`/c/${slug}/sheet`);
  const { data: row } = await ctx.supabase.from('characters').select('id, data').eq('id', c).eq('owner', ctx.user.id).eq('campaign_id', ctx.campaign.id).maybeSingle();
  if (!row) redirect(`/c/${slug}/sheet`);

  const [all, items] = await Promise.all([
    getSheetEntities(ctx, ['race', 'class', 'subclass', 'background', 'feat', 'spell', 'resource'], { liteSpells: true }),
    getSheetEntities(ctx, ['item']),
  ]);
  const hidden = new Set<string>(Array.isArray(ctx.campaign.settings?.hidden) ? ctx.campaign.settings!.hidden : []);
  const mine = row.data ?? {};
  const keep = new Set([mine.raceId, mine.clsId, mine.subId, mine.bgId, ...(mine.feats ?? []), ...(mine.spells ?? [])].filter(Boolean));
  const entities = all.filter((e: any) => !hidden.has(e.id) || keep.has(e.id));
  // weapons for Weapon Mastery, and what an item is, for the equipment step
  const weapons = (items as any[]).filter((i) => !hidden.has(i.id) && i.data?.kind === 'Weapon' && i.data?.weapon?.mastery).map((i) => ({ name: i.name, mastery: String(i.data.weapon.mastery), cat: String(i.data.weapon.cat ?? '') }));
  return (
    <div className="cs-guide">
      <div className="wrap">
        <CharacterCreator slug={slug} character={{ id: row.id, data: row.data }} entities={entities as any} weapons={weapons} />
      </div>
    </div>
  );
}
