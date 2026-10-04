import { requireViewer } from '@/lib/auth';
import { AccountForm, PasswordForm } from '@/components/HubForms';
import { BackgroundUploader } from '@/components/BackgroundUploader';
import { setHubBackground } from '../actions';
import { signOut } from '../../(auth)/actions';

export const metadata = { title: 'Account' };

export default async function Account() {
  const { profile, user, isHead } = await requireViewer();
  const has = !!(profile.hub_bg?.wide && profile.hub_bg?.tall);
  return (
    <>
      <h1>Account</h1>
      <div className="panel narrow">
        <p className="dim">Signed in as {profile.email}.</p>
        <p className="dim">{isHead ? 'You are the Head DM: you look after the whole site. ' : ''}You are the DM of any campaign you create, and a player in any campaign you join.</p>
      </div>
      <div className="panel narrow"><AccountForm name={profile.display_name} /></div>
      <div className="panel narrow"><PasswordForm /></div>
      <h2>Your hub background</h2>
      <div className="panel">
        <p className="dim">This is the picture behind My campaigns, My characters, and the other hub pages. Only you see it. {has ? 'You are using your own picture.' : 'You are using the standard hall.'}</p>
        <BackgroundUploader folder={`user/${user.id}`} has={has} save={setHubBackground} />
      </div>
      <form action={signOut} style={{ marginTop: 24 }}><button className="quiet" type="submit">Sign out</button></form>
    </>
  );
}
