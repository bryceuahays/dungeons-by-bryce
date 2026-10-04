import { redirect } from 'next/navigation';
import { getCampaign } from '@/lib/campaign';
import { AddSectionForm, CampaignForm, InviteForm, SectionRow } from '@/components/DmForms';
import { removeMember, revokeInvite, setPhase, setViewAsPlayer } from '../actions';
import type { Section } from '@/lib/types';

export const metadata = { title: 'Manage' };

export default async function Manage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCampaign(slug);
  if (!ctx.realDm) redirect('/c/' + slug);
  const { supabase, campaign } = ctx;
  const [{ data: invites }, { data: members }, { data: profiles }, { data: allSections }, { data: chars }, { data: faces }] = await Promise.all([
    supabase.from('invites').select('*').eq('campaign_id', campaign.id).order('created_at', { ascending: false }),
    supabase.from('memberships').select('user_id, joined_at').eq('campaign_id', campaign.id).order('joined_at'),
    supabase.from('profiles').select('id, display_name, email'),
    supabase.from('sections').select('*').eq('campaign_id', campaign.id).order('sort'),
    supabase.from('characters').select('owner').eq('campaign_id', campaign.id),
    supabase.from('campaign_faces').select('phase, slug, title, tagline').eq('campaign_id', campaign.id),
  ]);
  const realTitle = (faces ?? []).find((f) => f.phase === '')?.title ?? campaign.title;
  const who = new Map((profiles ?? []).map((p) => [p.id, p]));
  const sections = (allSections ?? []) as Section[];
  const now = Date.now();
  const live = (i: { revoked: boolean; expires_at: string | null; uses_left: number | null }) =>
    !i.revoked && (!i.expires_at || new Date(i.expires_at).getTime() > now) && (i.uses_left == null || i.uses_left > 0);

  return (
    <div className="cs-guide">
      <div className="wrap">
        <h2>Manage {realTitle}</h2>
        <p className="lede">Only you see this page.</p>

        {campaign.phases.length ? (
          <>
            <h2>Phase</h2>
            <div className="plate">
              <p>The phase sets what players can reach: the campaign&apos;s title and web address, which tabs and blocks exist for them, and which race videos and builder text they get. Anything marked for another phase is held back by the database itself, not just hidden on the page.</p>
              <div className="chips">
                {campaign.phases.map((p) => (
                  <form key={p.id} action={setPhase.bind(null, slug, p.id)}>
                    <button className="fchip" aria-pressed={campaign.phase === p.id} type="submit">{p.label}</button>
                  </form>
                ))}
              </div>
              <p className="who">Now: {campaign.phases.find((p) => p.id === campaign.phase)?.label ?? 'not set'}. Players see this campaign as &quot;{campaign.title}&quot; at /c/{campaign.slug}.</p>
            </div>
          </>
        ) : null}

        <h2>Preview</h2>
        <div className="plate">
          <p>See every page exactly as a player receives it. DM-only content is left out on the server, not just hidden.</p>
          <form action={setViewAsPlayer.bind(null, slug, true)}><button className="act" type="submit">View as player</button></form>
        </div>

        <h2>Invite codes</h2>
        <div className="plate">
          <p>A new account sees no campaigns until it enters one of these codes. Send a code to your players; they enter it under My campaigns.</p>
          <InviteForm slug={slug} />
          <div style={{ marginTop: 14 }}>
            {(invites ?? []).length ? (invites ?? []).map((i) => (
              <div className="orow" key={i.id}>
                <span>
                  <code className="code">{i.code}</code>{' '}
                  <small>
                    {live(i) ? 'active' : i.revoked ? 'revoked' : 'used up or expired'}
                    {i.uses_left != null ? `, ${i.uses_left} use${i.uses_left === 1 ? '' : 's'} left` : ', no limit'}
                    {i.expires_at ? `, expires ${new Date(i.expires_at).toLocaleDateString('en-US')}` : ''}
                  </small>
                </span>
                {live(i) ? <form action={revokeInvite.bind(null, slug, i.id)}><button className="act sm" type="submit">Revoke</button></form> : null}
              </div>
            )) : <p className="who">No invite codes yet.</p>}
          </div>
        </div>

        <h2>Members</h2>
        <div className="plate">
          {(members ?? []).length ? (members ?? []).map((m) => {
            const p = who.get(m.user_id);
            const n = (chars ?? []).filter((c) => c.owner === m.user_id).length;
            return (
              <div className="orow" key={m.user_id}>
                <span><b>{p?.display_name || 'Unnamed'}</b> <small>{p?.email} · joined {new Date(m.joined_at).toLocaleDateString('en-US')} · {n} character{n === 1 ? '' : 's'}</small></span>
                <form action={removeMember.bind(null, slug, m.user_id)}><button className="act sm danger" type="submit">Remove</button></form>
              </div>
            );
          }) : <p className="who">Nobody has joined yet.</p>}
          <p className="who" style={{ marginTop: 10 }}>Removing a member takes away their access. Their characters stay on your Players tab until you remove them there.</p>
        </div>

        <h2>Tabs</h2>
        <div className="plate">
          <p>The tabs across the top of this campaign. To change what is on a tab, open it and choose Edit this page.</p>
          {sections.map((s, i) => <SectionRow key={s.id + (s.phase ?? '')} slug={slug} section={s} first={i === 0} last={i === sections.length - 1} phases={campaign.phases} />)}
          <div style={{ marginTop: 14 }}><AddSectionForm slug={slug} /></div>
        </div>

        <h2>Campaign settings</h2>
        <div className="plate"><CampaignForm slug={slug} campaign={campaign} faces={faces ?? []} /></div>
      </div>
    </div>
  );
}
