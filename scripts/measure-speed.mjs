// Times signed-in page loads the way a tab click fetches them, using a throwaway account.
//   TEST_SITE_URL=https://dungeons-by-bryce.vercel.app node scripts/measure-speed.mjs

import { campaign, cleanup, invite, makeUser, cookieFor, SITE } from '../tests/helpers.mjs';

const c = await campaign();
const p = await makeUser('perf');
await p.client.rpc('join_campaign', { p_code: await invite(c.id) });
const cookie = cookieFor(p.session);
const paths = ['/campaigns', '/characters', '/account', `/c/${c.slug}/overview`, `/c/${c.slug}/races`];
const all = {};
let where = '';
for (let round = 0; round < 4; round++) {
  for (const path of paths) {
    const t = performance.now();
    const res = await fetch(SITE + path, { headers: { cookie, RSC: '1' }, redirect: 'manual' });
    await res.text();
    const ms = Math.round(performance.now() - t);
    where = (res.headers.get('x-vercel-id') || '').split('::').slice(0, 2).join(' -> ');
    if (round > 0) (all[path] ||= []).push(ms); // the first round warms things up
  }
}
console.table(Object.entries(all).map(([path, v]) => ({ path: path.replace(c.slug, '<campaign>'), 'fastest ms': Math.min(...v), 'slowest ms': Math.max(...v), 'average ms': Math.round(v.reduce((a, b) => a + b, 0) / v.length) })));
console.log('edge -> server region:', where);
await cleanup();
