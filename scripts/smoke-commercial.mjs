// Drives the commercial-build screens in a real browser on a LOCAL copy of the site
// (http://localhost:3000), with throwaway accounts, and saves screenshots to
// art/screenshots/commercial-*.jpg. Local only.
//   npm run build && npm run start     then     node scripts/smoke-commercial.mjs

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import puppeteer from 'puppeteer-core';
import { admin, cleanup, cookieFor, makeUser, ROOT } from '../tests/helpers.mjs';

const SITE = 'http://localhost:3000';
const out = path.join(ROOT, 'art', 'screenshots');
fs.mkdirSync(out, { recursive: true });
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, what) => { console.log((ok ? 'ok    ' : 'FAIL  ') + what); if (!ok) failed++; };

await cleanup();
const dm = await makeUser('smokedm');
const player = await makeUser('smokeplayer', { free: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--hide-scrollbars'] });

async function session(user, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.createBrowserContext();
  if (user) await ctx.setCookie(...cookieFor(user.session).split('; ').map((kv) => { const i = kv.indexOf('='); return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: 'localhost', path: '/' }; }));
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return {
    page, errors,
    go: async (url) => { await page.goto(SITE + url, { waitUntil: 'networkidle0' }); await page.evaluate(() => document.fonts.ready); },
    text: () => page.evaluate(() => document.body.innerText),
    shot: (name, full = true) => page.screenshot({ path: path.join(out, `commercial-${name}.jpg`), type: 'jpeg', quality: 78, fullPage: full }),
    click: (label, sel = 'button') => page.evaluate((label, sel) => { const el = [...document.querySelectorAll(sel)].find((b) => b.textContent.trim() === label || b.textContent.trim().startsWith(label)); if (!el) return false; el.click(); return true; }, label, sel),
    until: (needle, ms = 15000) => page.waitForFunction((n) => document.body.innerText.includes(n), { timeout: ms }, needle).then(() => true).catch(() => false),
  };
}

try {
  // ---- public pages, desktop and phone
  const pub = await session(null);
  await pub.go('/'); await pub.shot('landing');
  check((await pub.text()).includes('Secrets that stay secret'), 'landing page');
  await pub.go('/pricing'); await pub.shot('pricing');
  await pub.go('/demo/overview'); await pub.shot('demo-overview');
  await pub.go('/demo/tools/maps'); await wait(1500); await pub.shot('demo-map');
  await pub.go('/demo/tools/timeline'); await pub.shot('demo-timeline');
  await pub.go('/custom'); await pub.shot('custom');
  check(pub.errors.length === 0, 'no browser errors on public pages: ' + pub.errors.slice(0, 3).join(' | '));
  const phone = await session(null, { width: 390, height: 844, isMobile: true, hasTouch: true });
  await phone.go('/'); await phone.shot('phone-landing');
  await phone.go('/demo/tools/maps'); await wait(1500); await phone.shot('phone-demo-map', false);
  check(await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'the demo map page fits a phone without sideways scrolling');
  await phone.go('/pricing');
  check(await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pricing fits a phone');

  // ---- the homebrew builder
  const d = await session(dm);
  await d.go('/homebrew/new?type=race');
  await d.page.type('input[maxlength="120"]', 'Emberkin');
  await d.page.type('textarea', 'People of the cinder fields.');
  await d.click('Guided'); await wait(200);
  await d.click('Next'); await wait(150); await d.click('Next'); await wait(150);
  await d.click('Add a trait or feature'); await wait(150);
  await d.click('Next'); await wait(150);
  await d.page.select('.fx .inline select', 'resist'); await d.click('Add'); await wait(200);
  check((await d.text()).includes('Resistance to fire damage'), 'an effect shows up in the live preview');
  await d.shot('homebrew-guided');
  await d.click('Create');
  check(await d.until('Use it in a campaign'), 'the entry is saved and can be attached to a campaign');
  await d.click('Advanced'); await wait(200); await d.shot('homebrew-advanced');
  await d.go('/homebrew/convert');
  await d.page.type('.brew-form input', 'Cave Stalker');
  check((await d.text()).includes('Every change that was made'), 'the edition converter opens');
  await d.shot('converter');

  // ---- a campaign: create, stages, tools
  await d.go('/new-campaign');
  await d.page.type('input[name=title]', 'Smoke Realm');
  await d.page.type('input[name=slug]', 'smoke-realm-' + Date.now().toString(36));
  await d.click('Create campaign');
  { const ok = await d.until('Manage Smoke Realm', 30000); check(ok, 'campaign created'); if (!ok) console.log('      page says: ' + (await d.text()).replace(/s+/g, ' ').slice(-400)); }
  const slug = new URL(d.page.url()).pathname.split('/')[2];
  await d.page.type('textarea[name=stages]', 'Before the storm\nAfter the storm');
  await d.click('Save stages');
  check(await d.until('Advance to the next stage'), 'two reveal stages saved');
  await d.shot('manage');
  const { data: camp } = await admin.from('campaigns').select('id').eq('slug', slug).single();
  await admin.from('invites').insert({ campaign_id: camp.id, code: 'TESTSMOKE' + Date.now().toString(36).toUpperCase() });
  await admin.from('memberships').insert({ user_id: player.id, campaign_id: camp.id });

  await d.go(`/c/${slug}/tools/npcs`);
  await d.click('Add an NPC'); await wait(200);
  await d.page.type('.tform input', 'Captain Reyes');
  await d.click('Save');
  check(await d.until('Captain Reyes'), 'NPC added');
  await d.shot('npcs');

  await d.go(`/c/${slug}/tools/timeline`);
  await d.click('Plan a beat'); await wait(200);
  await d.page.type('.tform input', 'The storm breaks');
  await d.click('Plan it');
  check(await d.until('It happened'), 'beat planned');
  await d.click('It happened');
  check(await d.until('Seen by:'), 'beat marked as hit with one click');
  await d.shot('timeline');

  await d.go(`/c/${slug}/tools/maps`);
  const mapFile = path.join(out, 'smoke-map.tmp.png');
  await sharp({ create: { width: 900, height: 600, channels: 3, background: '#c9b98f' } }).png().toFile(mapFile);
  await (await d.page.$('input[type=file]')).uploadFile(mapFile);
  check(await d.until('Look around', 30000), 'map uploaded');
  await wait(1200);
  await d.click('Draw a hidden area'); await wait(200);
  await d.page.evaluate(() => document.querySelector('.mapbox').scrollIntoView({ block: 'center' })); await wait(300);
  const box = await (await d.page.$('.mapbox')).boundingBox();
  for (const [x, y] of [[0.1, 0.1], [0.5, 0.1], [0.5, 0.9], [0.1, 0.9]]) { await d.page.mouse.click(box.x + box.width * x, box.y + box.height * y); await wait(120); }
  await d.click('Finish area');
  check(await d.until('Reveal it now'), 'a hidden region drawn by clicking the map');
  await d.click('Add a pin'); await wait(150);
  await d.page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.5);
  check(await d.until('Pin name'), 'a pin placed by clicking the map');
  await d.shot('maps-dm');
  fs.unlinkSync(mapFile);

  await d.go(`/c/${slug}/tools/initiative`);
  await d.page.type('input[placeholder=Name]', 'Bandit captain');
  await d.page.evaluate(() => [...document.querySelectorAll('.tbar button')].filter((b) => b.textContent.trim() === 'Add').at(-1).click());
  await wait(300);
  await d.click('Roll initiative for everyone');
  check(await d.until('Acting now: Bandit captain'), 'initiative rolled; the active combatant is shown');
  await wait(900);
  await d.shot('initiative');
  check(d.errors.length === 0, 'no browser errors for the DM: ' + d.errors.slice(0, 3).join(' | '));

  // ---- the player: phone-sized
  const p = await session(player, { width: 390, height: 844, isMobile: true, hasTouch: true });
  await p.go(`/c/${slug}/tools/maps`); await wait(1500);
  check(!(await p.text()).includes('Hidden area'), 'the player is not shown the hidden region');
  await p.shot('phone-player-map', false);
  await p.go(`/c/${slug}/tools/initiative`);
  check(await p.until('Bandit captain'), 'the player sees the turn order');
  await p.go(`/c/${slug}/sheet`);
  await p.click('Create a character');
  check(await p.until('Character name'), 'standard sheet created');
  const selects = await p.page.$$('.s5 select');
  const pick = async (i, name) => { const v = await selects[i].evaluate((el, name) => [...el.options].find((o) => o.textContent.startsWith(name))?.value, name); await selects[i].select(v); await wait(200); };
  await pick(0, 'Dwarf'); await pick(1, 'Fighter');
  check((await p.text()).includes('Second Wind') && (await p.text()).includes('Darkvision'), 'race and class effects apply to the sheet by themselves');
  await wait(1200);
  await p.shot('phone-sheet');
  check(await p.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'the sheet fits a phone');
  await p.go(`/c/${slug}/overview`);
  check((await p.text()).includes('Story so far'), 'the timeline banner is on the player\'s campaign page');
  check(p.errors.length === 0, 'no browser errors for the player: ' + p.errors.slice(0, 3).join(' | '));
} catch (e) {
  console.log('FAIL  ' + e.message);
  failed++;
} finally {
  await browser.close();
  await cleanup();
}
console.log(failed ? `${failed} check(s) failed.` : 'All checks passed.');
process.exit(failed ? 1 : 0);
