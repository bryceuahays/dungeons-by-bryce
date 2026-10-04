import 'server-only';

// Feedback notes are emailed through Resend. The key is an environment variable; its
// name is matched without regard to capitals (RESEND_API_KEY, Resend_API_Key, ...),
// because the name is typed by hand in the Vercel dashboard.
const env = (name: string) => Object.entries(process.env).find(([k]) => k.toUpperCase() === name)?.[1]?.trim() || '';

export const emailIsOn = () => !!env('RESEND_API_KEY');

// A plain email to the site owner (commission requests). Returns '' when it went out.
export async function mailOwner(to: string, subject: string, text: string, replyTo?: string): Promise<string> {
  const key = env('RESEND_API_KEY');
  if (!key) return 'Email is not switched on (no RESEND_API_KEY).';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env('FEEDBACK_FROM') || 'Dungeons by Bryce <onboarding@resend.dev>', to: [to], subject: subject.slice(0, 200), text, reply_to: replyTo && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(replyTo) && !replyTo.endsWith('.invalid') ? replyTo : undefined }),
    });
    if (res.ok) return '';
    const body = await res.json().catch(() => null) as { message?: string } | null;
    return `The mail service refused it (${res.status}): ${String(body?.message ?? 'no reason given').slice(0, 300)}`;
  } catch { return 'The mail service could not be reached.'; }
}

// Sends one note. Returns '' when it went out, or a short reason when it did not
// (never the key itself).
export async function emailFeedback(to: string, from: { name: string; email: string }, message: string): Promise<string> {
  const key = env('RESEND_API_KEY');
  if (!key) return 'Email is not switched on (no RESEND_API_KEY).';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env('FEEDBACK_FROM') || 'Dungeons by Bryce <onboarding@resend.dev>',
        to: [to],
        reply_to: /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(from.email) && !from.email.endsWith('.invalid') ? from.email : undefined,
        subject: `Dungeons by Bryce feedback from ${from.name || 'a player'}`,
        text: `${message}\n\nFrom: ${from.name || 'unnamed'} <${from.email}>\nSent from the Feedback tab on Dungeons by Bryce.`,
      }),
    });
    if (res.ok) return '';
    const body = await res.json().catch(() => null) as { message?: string } | null;
    return `The mail service refused it (${res.status}): ${String(body?.message ?? 'no reason given').slice(0, 300)}`;
  } catch {
    return 'The mail service could not be reached.';
  }
}
