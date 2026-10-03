'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { signIn, signUp, type AuthState } from './actions';

export function AuthForm({ mode, next }: { mode: 'in' | 'up'; next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === 'in' ? signIn : signUp, null);
  return (
    <main className="hub landing">
      <div className="box" style={{ textAlign: 'left', width: '100%', maxWidth: 400 }}>
        <p><Link className="hub-name" href="/">Dungeons by Bryce</Link></p>
        <h1 style={{ fontSize: '1.5rem' }}>{mode === 'in' ? 'Sign in' : 'Create an account'}</h1>
        <form action={action} className="panel">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          {mode === 'up' ? <label>Your name<input name="display_name" autoComplete="name" required maxLength={60} /></label> : null}
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required minLength={mode === 'up' ? 8 : undefined} /></label>
          {state?.error ? <p className="bad" role="alert">{state.error}</p> : null}
          {state?.note ? <p className="good" role="status">{state.note}</p> : null}
          <button type="submit" disabled={pending}>{pending ? 'One moment' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        </form>
        <p className="dim">
          {mode === 'in' ? <>New here? <Link href="/sign-up">Create an account</Link>.</> : <>Already have an account? <Link href="/sign-in">Sign in</Link>.</>}
        </p>
        {mode === 'up' ? <p className="dim">After you sign up, enter the invite code your DM gave you to join a campaign.</p> : null}
      </div>
    </main>
  );
}
