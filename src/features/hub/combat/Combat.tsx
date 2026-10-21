/* eslint-disable @typescript-eslint/no-explicit-any */
import { notFound } from 'next/navigation';
import { getCampaign, getSheetEntities } from '@/lib/campaign';
import { getEntries } from '@/lib/entries';
import { hasFeature, hasPage } from '@/config/hub-features';
import { blankV2, derive, type CharacterV2, type Entity } from '@/lib/rules/engine';
import { campaignSheetSystem } from '@/features/systems/data';
import { CombatDM } from './CombatDM';
import { CombatPlayer, type MyCharacter } from './CombatPlayer';
import { EMPTY, cleanState, type PublicFight } from './model';
import '@/features/hub/ui/hidden.css';
import './combat.css';

// The Combat page (hub version 2, item 12). A DM (or a co-DM who may run combat) gets the whole
// fight; everyone else gets only the entry players may read, which the server works out
// (src/features/hub/combat/actions.ts). A DM previewing as a player gets the players' page.
export async function Combat({ slug }: { slug: string }) {
  const ctx = await getCampaign(slug);
  const settings = ctx.campaign.settings;
  if (!hasPage(settings, 'combat')) notFound();
  const features = {
    initiative: hasFeature(settings, 'combat.initiative'), map: hasFeature(settings, 'combat.map'), autoroll: hasFeature(settings, 'combat.autoroll'),
    health: hasFeature(settings, 'combat.health'), conditions: hasFeature(settings, 'combat.conditions'), actions: hasFeature(settings, 'combat.actions'),
  };
  const runs = !ctx.asPlayer && (ctx.isOwner || (ctx.coDm && (ctx.perms.combat || ctx.perms.edit)));
  if (!features.initiative) return <div className="cs-guide"><div className="wrap cb"><h1>Combat</h1><p className="cb-sub">The initiative tracker is switched off in this campaign.</p></div></div>;
  const [fight, maps, system] = await Promise.all([getEntries(ctx, ['encounter'], { secrets: true, dm: runs }), features.map ? getEntries(ctx, ['map']) : [], campaignSheetSystem(ctx)]);
  const row = fight[0] ?? null;

  if (runs) {
    const [chars, monsters] = await Promise.all([
      ctx.supabase.from('characters').select('id, owner, data').eq('campaign_id', ctx.campaign.id),
      getSheetEntities(ctx, ['monster']),
    ]);
    return (
      <div className="cs-guide">
        <CombatDM slug={ctx.campaign.slug} campaignId={ctx.campaign.id} canWrite={ctx.access.writable} initial={cleanState(row?.secret ?? EMPTY)} system={system}
          characters={(chars.data ?? []) as any[]} monsters={monsters as Entity[]} maps={maps.map((m) => ({ id: m.id, title: m.title }))} features={features} />
      </div>
    );
  }

  // the viewer's own characters here, with what they can attack with (worked out by the rules engine)
  const me = ctx.asPlayer ? ctx.viewAs.player : ctx.user.id;
  let mine: MyCharacter[] = [];
  if (me) {
    const { data: chars } = await ctx.supabase.from('characters').select('id, owner, data').eq('campaign_id', ctx.campaign.id).eq('owner', me);
    if (chars?.length) {
      const entities = await getSheetEntities(ctx, undefined, { liteSpells: true });
      mine = chars.map((ch) => {
        const d = derive({ ...blankV2(), ...((ch.data ?? {}) as object), v: 2 } as CharacterV2, entities as any, system?.rules);
        return { id: ch.id as string, name: String((ch.data as any)?.name || 'Unnamed'), speed: Number(d.speed.walk) || 30, weapons: d.weapons.map((w) => w.name).slice(0, 4), caster: !!d.casting };
      });
    }
  }
  const pub = (row?.data && Array.isArray((row.data as any).order) ? row.data : null) as PublicFight | null;
  return (
    <div className="cs-guide">
      <CombatPlayer slug={ctx.campaign.slug} campaignId={ctx.campaign.id} initial={pub} mine={mine} actions={features.actions} mapOn={features.map} canAct={!ctx.asPlayer && ctx.access.writable} />
    </div>
  );
}
