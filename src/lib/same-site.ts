import 'server-only';

// The store's two form routes are plain POSTs. The login cookie is not sent with a form
// posted from another site, and this check refuses one anyway.
export function sameSite(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // non-browser callers (tests) send none; they still need a valid login
  try { return new URL(origin).host === (request.headers.get('x-forwarded-host') || request.headers.get('host')); } catch { return false; }
}
