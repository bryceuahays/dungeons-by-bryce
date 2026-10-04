import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC = new Set(['/', '/sign-in', '/sign-up', '/robots.txt', '/sitemap.xml', '/opengraph-image']);
// Public sections of the site. /join sends a signed-out visitor to sign-up itself, keeping the code.
const PUBLIC_PREFIX = ['/legal', '/pricing', '/custom', '/store', '/demo', '/join/', '/api/stripe/webhook'];
const isPublic = (path: string) => PUBLIC.has(path) || PUBLIC_PREFIX.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : p + '/')) || path.endsWith('/opengraph-image');

// Refreshes the Supabase session and requires a login for everything except the
// landing page and the sign-in pages.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // Checked on this server (no network trip); this also refreshes a session that is about to expire.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;
  const path = request.nextUrl.pathname;
  if (!user && !isPublic(path)) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.search = '';
    if (path !== '/campaigns') url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }
  if (user && (path === '/sign-in' || path === '/sign-up')) {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get('next') || '';
    url.pathname = next.startsWith('/') && !next.startsWith('//') ? next : '/campaigns';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
