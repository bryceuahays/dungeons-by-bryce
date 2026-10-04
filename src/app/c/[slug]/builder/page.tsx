/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from 'next/navigation';
import { getCampaign, getRules, usesLegacySheet } from '@/lib/campaign';
import { BuilderIsland } from '@/components/Islands';

export const metadata = { title: 'Build your character' };

export default async function Builder({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string }> }) {
  const { slug } = await params;
  const { c } = await searchParams;
  const ctx = await getCampaign(slug);
  if (!(await usesLegacySheet(ctx.campaign.id))) redirect(`/c/${slug}/sheet${c ? '?c=' + c : ''}`);
  const by = await getRules(ctx);
  const v = (kind: string) => (by[kind] ?? []).map((r) => r.data.v);
  const misc = (key: string) => (by.misc ?? []).find((r) => r.key === key)?.data.v;

  // Race rows for the current phase: the line and any "after" trait text are merged in
  // here on the server. Rows for the other phase never leave the database for a player.
  const phaseRows = by['race-phase'] ?? [];
  const RACES = (by.race ?? []).map((r) => {
    const extra = phaseRows.find((p) => p.key === r.key)?.data ?? {};
    const race = { ...r.data, ...(extra.line ? { line: extra.line } : {}) };
    if (extra.after) race.traits = race.traits.map((t: any[]) => (extra.after[t[0]] ? [t[0], t[1], { ...(t[2] || {}), after: extra.after[t[0]] }] : t));
    return race;
  });
  const rules = {
    RACES,
    CLASSES: (by.class ?? []).map((r) => r.data),
    SPELLS: (by.spell ?? []).map((r) => r.data),
    BGS: v('background'), ARMOR: v('armor'), WEAPONS: v('weapon'),
    FULL: misc('FULL') ?? [], PACT: misc('PACT') ?? [], ORD: misc('ORD') ?? [], ANCESTRY: misc('ANCESTRY') ?? [],
    TIME: misc('TIME') ?? {}, COST: misc('COST') ?? {}, ARRAY: misc('ARRAY') ?? [],
  };
  const phaseConfig = (by['phase-config'] ?? [])[0]?.data ?? {};

  let character = null;
  if (c) {
    const { data } = await ctx.supabase.from('characters').select('id, data, builder').eq('id', c).eq('owner', ctx.user.id).eq('campaign_id', ctx.campaign.id).maybeSingle();
    character = data;
  }
  if (!RACES.length || !rules.CLASSES.length) {
    return <div className="cs-guide"><div className="wrap"><h2>Build your character</h2><p className="lede">This campaign has no character rules set up yet.</p></div></div>;
  }
  return (
    <div className="cs-builder">
      <BuilderIsland
        campaignId={ctx.campaign.id}
        userId={ctx.user.id}
        playerName={ctx.profile.display_name}
        slug={slug}
        phase={ctx.campaign.phase}
        phaseConfig={phaseConfig}
        rules={rules}
        character={character}
      />
    </div>
  );
}
