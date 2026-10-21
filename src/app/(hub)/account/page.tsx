import { requireViewer } from '@/lib/auth';
import { AccountForm, PasswordForm } from '@/components/HubForms';
import { BackgroundUploader } from '@/components/BackgroundUploader';
import { setHubBackground } from '../actions';
import { signOut } from '../../(auth)/actions';
import { createClient } from '@/lib/supabase/server';
import { ConnectedAIs } from '@/features/connector/ConnectedAIs';
import { DeleteAccount } from '@/features/account-delete/DeleteAccount';
import { createAdminClient } from '@/lib/supabase/admin';

export const metadata = { title: 'Account' };

export default async function Account() {
  const { profile, user, isHead } = await requireViewer();
  const has = !!(profile.hub_bg?.wide && profile.hub_bg?.tall);
  // AI apps connected to this account (Connect your AI); none if the sign-in server is not switched on
  const { data: grants } = await (await createClient()).auth.oauth.listGrants().catch(() => ({ data: null }));
  // what deleting the account would take with it (read for this account only)
  const admin = createAdminClient();
  const [{ data: owned }, { count: characters }, { count: homebrew }, { count: selling }, { data: sub }] = await Promise.all([
    admin.from('campaigns').select('id, title, memberships(role)').eq('owner_id', user.id),
    admin.from('characters').select('id', { count: 'exact', head: true }).eq('owner', user.id),
    admin.from('entities').select('id', { count: 'exact', head: true }).eq('owner_id', user.id),
    admin.from('products').select('id', { count: 'exact', head: true }).eq('seller_id', user.id),
    admin.from('subscriptions').select('status, stripe_subscription').eq('user_id', user.id).maybeSingle(),
  ]);
  const facts = {
    campaigns: ((owned ?? []) as { title: string; memberships: { role: string }[] | null }[]).map((c) => ({ title: c.title, players: (c.memberships ?? []).filter((m) => m.role !== 'dm').length })),
    characters: characters ?? 0, homebrew: homebrew ?? 0, selling: selling ?? 0, head: !!isHead,
    pro: !!sub?.stripe_subscription && ['active', 'trialing', 'past_due', 'incomplete', 'unpaid'].includes(String(sub.status)),
  };
  return (
    <>
      <h1>Account</h1>
      <div className="panel narrow">
        <p className="dim">Signed in as {profile.email}.</p>
        <p className="dim">{isHead ? 'You are the Head DM: you look after the whole site. ' : ''}You are the DM of any campaign you create, and a player in any campaign you join.</p>
      </div>
      <div className="panel narrow"><AccountForm name={profile.display_name} /></div>
      <div className="panel narrow"><PasswordForm /></div>
      <h2>Connected AIs</h2>
      <ConnectedAIs grants={(grants ?? []).map((g) => ({ id: g.client.id, name: g.client.name, since: g.granted_at }))} />

      <h2>Your hub background</h2>
      <div className="panel">
        <p className="dim">This is the picture behind Campaigns, My characters, and the other hub pages. Only you see it. {has ? 'You are using your own picture.' : 'You are using the standard hall.'}</p>
        <BackgroundUploader folder={`user/${user.id}`} has={has} save={setHubBackground} />
      </div>
      <form action={signOut} style={{ marginTop: 24 }}><button className="quiet" type="submit">Sign out</button></form>

      <h2>Delete your account</h2>
      <DeleteAccount facts={facts} />
    </>
  );
}
