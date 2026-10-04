'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type AuthState = { error?: string; note?: string } | null;

const safeNext = (v: FormDataEntryValue | null) => {
  const s = String(v || '');
  return s.startsWith('/') && !s.startsWith('//') ? s : '/campaigns';
};

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get('email') || '').trim(),
    password: String(form.get('password') || ''),
  });
  if (error) return { error: 'That email and password did not match an account.' };
  redirect(safeNext(form.get('next')));
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  const display_name = String(form.get('display_name') || '').trim().slice(0, 60);
  if (!display_name) return { error: 'Tell us what to call you.' };
  if (password.length < 8) return { error: 'Use a password of at least 8 characters.' };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name } } });
  if (error) return { error: /registered|exists/i.test(error.message) ? 'There is already an account for that email. Sign in instead.' : error.message };
  if (!data.session) return { note: 'Check your email for a confirmation link, then sign in.' };
  redirect(safeNext(form.get('next')));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
