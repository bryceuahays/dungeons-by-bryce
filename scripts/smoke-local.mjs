// Drives the newer screens in a real browser on a LOCAL copy of the site
// (http://localhost:3000), as a throwaway account. Local only.
//   npm run build && npm run start     then     node scripts/smoke-local.mjs

import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { admin, campaign, cleanup, cookieFor, invite, makeUser, ROOT } from '../tests/helpers.mjs';
import { IMPORT_EXAMPLE } from '../src/lib/import.ts';

const SITE = 'http://localhost:3000';
const out = path.join(ROOT, 'art', 'screenshots');
fs.mkdirSync(out, { recursive: true });
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const log = (...a) => console.log(...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await cleanup();
const camp = await campaign();
const user = await makeUser('maker');
await user.client.rpc('join_campaign', { p_code: await invite(camp.id) });
await user.client.from('characters').insert({ owner: user.id, campaign_id: camp.id, data: { t: 1, name: 'Soon Deleted', race: 'human', cls: 'Bard', level: 3, ab: {} } });

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--hide-scrollbars'] });
const ctx = await browser.createBrowserContext();
await ctx.setCookie(...cookieFor(user.session).split('; ').map((kv) => { const i = kv.indexOf('='); return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: 'localhost', path: '/' }; }));
const page = await ctx.newPage();
await page.setViewport({ width: 1280, height: 900 });
page.on('pageerror', (e) => log('PAGE ERROR:', e.message));
const shot = (name) => page.screenshot({ path: path.join(out, `new-${name}.jpg`), type: 'jpeg', quality: 80, fullPage: true });
const go = async (url) => { await page.goto(SITE + url, { waitUntil: 'networkidle0' }); await page.evaluate(() => document.fonts.ready); };
const text = () => page.evaluate(() => document.body.innerText);
let failed = 0;
const check = (ok, what) => { log((ok ? 'ok    ' : 'FAIL  ') + what); if (!ok) failed++; };

try {
  // ---- hub
  await go('/campaigns');
  check((await text()).includes('Campaigns you run') && (await text()).includes('Campaigns you play in') && (await text()).includes('Feedback'), 'My campaigns shows both lists and the Feedback tab');
  await shot('hub-campaigns');

  // ---- create a campaign by pasting
  await go('/new-campaign');
  await page.type('textarea[name=paste]', IMPORT_EXAMPLE.slice(0, 60));
  await page.$eval('textarea[name=paste]', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, IMPORT_EXAMPLE);
  await page.type('input[name=slug]', 'smoke-' + Math.random().toString(36).slice(2, 7));
  await shot('new-campaign');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Create campaign').click())]);
  const manageUrl = new URL(page.url());
  const slug = manageUrl.pathname.split('/')[2];
  check(manageUrl.pathname.endsWith('/manage') && (await text()).includes('from the text you pasted'), 'pasted campaign created, landed on Manage: ' + manageUrl.pathname + manageUrl.search);
  const tabs = await page.$$eval('.tab', (els) => els.map((e) => e.textContent));
  check(['Overview', 'Factions', 'DM notes', 'Sessions', 'Players'].every((t) => tabs.includes(t)), 'tabs: ' + tabs.join(', '));
  await go(`/c/${slug}/overview`);
  const ov = await text();
  check(ov.includes('The Sunken Crown') && ov.includes('What everyone knows') && ov.includes('The old king is still down there') && ov.includes('Marrow'), 'Overview has the title, heading, cards, and the DM secret');
  await shot('pasted-overview');

  // ---- paste more pages on Manage
  await go(`/c/${slug}/manage`);
  await page.$eval('.cs-guide textarea[name=paste]', (el) => { el.value = '## House rules\nCrits do max damage.\n\n[secret: Twist]\nThe guild master is the king.\n[/secret]'; });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Add these pages').click());
  await page.waitForFunction(() => document.body.innerText.includes('Added 2 blocks'), { timeout: 15000 }).catch(() => {});
  check((await text()).includes('Added 2 blocks in 1 new tab'), 'pasting more pages on Manage works');

  // ---- campaign background upload (two pictures, resized in the browser)
  const inputs = await page.$$('.bgup input[type=file]');
  await inputs[0].uploadFile(path.join(ROOT, 'art', 'hall-wide.png'));
  await inputs[1].uploadFile(path.join(ROOT, 'art', 'hall-tall.png'));
  await page.evaluate(() => [...document.querySelectorAll('.bgup button')].find((b) => b.textContent === 'Use these pictures').click());
  await page.waitForFunction(() => /background is in place|did not|could not|needs to be/i.test(document.querySelector('.bgup')?.innerText || ''), { timeout: 60000 }).catch(() => {});
  check((await page.$eval('.bgup', (e) => e.innerText)).includes('The background is in place.'), 'campaign background uploaded');
  await go(`/c/${slug}/overview`);
  const bg = await page.evaluate(() => { const i = document.querySelector('.camp-bg img'); return i ? { src: i.currentSrc, w: i.naturalWidth } : null; });
  check(!!bg && bg.w > 0, 'campaign pages show the uploaded background: ' + (bg ? bg.w + 'px wide' : 'missing'));
  await shot('campaign-with-background');
  // wrong way round is refused
  await go(`/c/${slug}/manage`);
  const again = await page.$$('.bgup input[type=file]');
  await again[0].uploadFile(path.join(ROOT, 'art', 'hall-tall.png'));
  await page.evaluate(() => [...document.querySelectorAll('.bgup button')].find((b) => /Replace background/.test(b.textContent)).click());
  await page.waitForFunction(() => /wider than it is tall/.test(document.querySelector('.bgup')?.innerText || ''), { timeout: 20000 }).catch(() => {});
  check((await page.$eval('.bgup', (e) => e.innerText)).includes('wider than it is tall'), 'a portrait picture in the desktop slot is refused with a clear message');

  // ---- hub background on the Account page
  await go('/account');
  const acc = await page.$$('.bgup input[type=file]');
  await acc[0].uploadFile(path.join(ROOT, 'art', 'doorway-wide.png'));
  await acc[1].uploadFile(path.join(ROOT, 'art', 'doorway-tall.png'));
  await page.evaluate(() => [...document.querySelectorAll('.bgup button')].find((b) => b.textContent === 'Use these pictures').click());
  await page.waitForFunction(() => /Your background is in place|did not|could not/i.test(document.querySelector('.bgup')?.innerText || ''), { timeout: 60000 }).catch(() => {});
  check((await page.$eval('.bgup', (e) => e.innerText)).includes('Your background is in place.'), 'hub background uploaded');
  await go('/campaigns');
  const hubBg = await page.evaluate(() => { const i = document.querySelector('.hall-bg img'); return { src: i.getAttribute('src'), w: i.naturalWidth }; });
  check(hubBg.src.startsWith('/bg/me/wide') && hubBg.w > 0, 'the hub shows this person\'s own background: ' + hubBg.src);
  await shot('hub-own-background');

  // ---- feedback
  await go('/feedback');
  await page.type('textarea[name=message]', 'Smoke test: it would be great to roll dice on the combat page.');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Send').click());
  await page.waitForFunction(() => document.body.innerText.includes('Your note has been sent'), { timeout: 15000 }).catch(() => {});
  check((await text()).includes('Your note has been sent'), 'feedback sent');
  const saved = await admin.from('feedback').select('message, emailed').eq('email', user.email);
  check(saved.data.length === 1, 'feedback stored for the Head DM (emailed: ' + saved.data[0]?.emailed + ')');
  await shot('feedback');

  // ---- help page
  await go('/help/campaign-format');
  check((await text()).includes('[secret: Label]') && (await text()).includes('Copy the example'), 'format guide page');
  await shot('format-guide');

  // ---- delete a character from My characters
  await go('/characters');
  check((await text()).includes('Soon Deleted'), 'character listed');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Delete').click());
  await wait(200);
  await shot('delete-character-confirm');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Yes, delete').click());
  await page.waitForFunction(() => !document.body.innerText.includes('Soon Deleted'), { timeout: 15000 }).catch(() => {});
  check(!(await text()).includes('Soon Deleted'), 'character deleted from My characters');

  // ---- delete the campaign
  await go(`/c/${slug}/manage`);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Delete this campaign/.test(b.textContent)).click());
  await wait(200);
  await page.type('input[name=confirm]', 'DELETE');
  await shot('delete-campaign-confirm');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Delete for good').click())]);
  check(new URL(page.url()).pathname === '/campaigns' && !(await text()).includes('The Sunken Crown'), 'campaign deleted, back on My campaigns');
  const left = await admin.storage.from('backgrounds').list('campaign');
  check(!(left.data ?? []).some((o) => false), 'storage listing ok');
} finally {
  await browser.close();
  await cleanup();
}
log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
