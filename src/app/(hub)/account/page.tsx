import { requireViewer } from '@/lib/auth';
import { AccountForm, PasswordForm } from '@/components/HubForms';
import { signOut } from '../../(auth)/actions';

export const metadata = { title: 'Account' };

export default async function Account() {
  const { profile } = await requireViewer();
  return (
    <>
      <h1>Account</h1>
      <div className="panel narrow"><p className="dim">Signed in as {profile.email}{profile.role === 'dm' ? '. You are the DM.' : '.'}</p></div>
      <div className="panel narrow"><AccountForm name={profile.display_name} /></div>
      <div className="panel narrow"><PasswordForm /></div>
      <form action={signOut}><button className="quiet" type="submit">Sign out</button></form>
    </>
  );
}
