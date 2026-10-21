// Signing in with Google, Discord and the like (src/features/sign-in-with): the way back, which a visitor can
// reach without an account, must never sign anyone in without a real code or send them off the site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SITE, URL_, ANON } from './helpers.mjs';

const back = async (query) => {
  const res = await fetch(SITE + '/auth/callback' + query, { redirect: 'manual' });
  return { status: res.status, to: new URL(res.headers.get('location'), SITE) };
};

test('cancelled at the provider: back to sign-in, saying so, still headed for the same place', async () => {
  const r = await back('?error=access_denied&next=%2Fjoin%2FABC123');
  assert.equal(r.status, 307);
  assert.equal(r.to.pathname, '/sign-in');
  assert.equal(r.to.searchParams.get('next'), '/join/ABC123');
  assert.match(r.to.searchParams.get('error'), /cancelled/);
  const page = await (await fetch(SITE + r.to.pathname + r.to.search)).text();
  assert.match(page, /Signing in was cancelled/);
});

test('a made-up code signs nobody in, and a return address off the site is refused', async () => {
  for (const next of ['//evil.example.com', 'https://evil.example.com', '/\\evil.example.com']) {
    const r = await back('?code=not-a-real-code&next=' + encodeURIComponent(next));
    assert.equal(r.to.origin, new URL(SITE).origin, 'stays on this site');
    assert.equal(r.to.pathname, '/sign-in');
    assert.ok(!(r.to.searchParams.get('next') ?? '').startsWith('//'), next);
  }
});

test('the buttons follow what is switched on in Supabase', async () => {
  const settings = await (await fetch(URL_ + '/auth/v1/settings', { headers: { apikey: ANON } })).json();
  const page = await (await fetch(SITE + '/sign-up')).text();
  for (const [p, name] of [['google', 'Google'], ['discord', 'Discord']]) {
    assert.equal(page.includes('Continue with ' + name), !!settings.external[p], name + (settings.external[p] ? ' is on, so its button shows' : ' is off, so no button'));
  }
  assert.match(page, /Create account/, 'the email form is always there');
});
