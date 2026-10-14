import { getCampaign } from '@/lib/campaign';
import { flag } from '@/lib/flags';
import { PERMS, NOT_YET, permSet, presetOf, type PermSet } from '@/config/co-dm';
import { PeopleForm } from './PeopleForm';

type Member = { user_id: string; display_name: string; joined_at: string; role: string };

// "People and permissions" on the Manage page (SettingsPeople.png): everyone in the campaign,
// and for each co-DM exactly what they may do. Only the campaign's owner gets it, and only
// behind its flag (hub_v2_people); for anyone else it renders nothing and sends nothing.
export async function People({ slug, campaignId, isOwner, members }: { slug: string; campaignId: string; isOwner: boolean; members: Member[] }) {
  if (!isOwner || !(await flag('hub_v2_people'))) return null;
  const ctx = await getCampaign(slug);
  const { data } = await ctx.supabase.rpc('co_dm_list', { c: campaignId });
  const stored = new Map(((data ?? []) as { user_id: string; perms: unknown }[]).map((r) => [r.user_id, r.perms]));
  const people = members.filter((m) => m.user_id !== ctx.user.id).map((m) => ({
    id: m.user_id, name: m.display_name || 'Unnamed', joined: new Date(m.joined_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    coDm: m.role === 'dm', preset: m.role === 'dm' ? presetOf(stored.get(m.user_id)) : null, perms: m.role === 'dm' ? permSet(stored.get(m.user_id)) : null,
  }));
  const coDms = people.filter((p) => p.coDm).length, players = people.length - coDms;
  return (
    <>
      <h2 id="people">People and permissions</h2>
      <div className="plate">
        <p>Make someone a co-DM and choose exactly what they can do. You always have every permission, and only you can choose co-DMs or delete the campaign.</p>
        <p className="who">1 DM · {coDms} co-DM{coDms === 1 ? '' : 's'} · {players} player{players === 1 ? '' : 's'}. To add a new co-DM, invite them as a player first, then make them a co-DM here.</p>
        <PeopleForm slug={slug} people={people} />
      </div>
    </>
  );
}

// For a co-DM looking at Manage: what the owner has let them do.
export function YourPermissions({ perms }: { perms: PermSet }) {
  const mine = PERMS.filter((p) => perms[p.id]);
  return (
    <p className="who">
      {mine.length === PERMS.length ? 'The owner has given you every permission.' : mine.length ? <>The owner lets you: {mine.map((p) => p.name.toLowerCase() + (NOT_YET.includes(p.id) ? ' (when that is built)' : '')).join(', ')}.</> : 'The owner has not given you any DM permissions yet.'}
      {' '}Anything else on this page will not save for you.
    </p>
  );
}
