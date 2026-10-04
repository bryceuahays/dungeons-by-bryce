// Takes screenshots of the signed-in hub on a LOCAL copy of the site (http://localhost:3000),
// signed in as the throwaway accounts made by scripts/dev-users.mjs (.env.test.local).
// Local only: it never signs in to the live site.
//
//   npm run build && npm run start      (in one terminal)
//   node scripts/screenshots.mjs        (in another)

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer-core';
import { anonClient, cookieFor, ROOT } from '../tests/helpers.mjs';

const SITE = 'http://localhost:3000';
const env = dotenv.parse(fs.readFileSync(path.join(ROOT, '.env.test.local')));
const out = path.join(ROOT, 'art', 'screenshots');
fs.mkdirSync(out, { recursive: true });

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
if (!chrome) throw new Error('No Chrome or Edge found');

async function session(email, password) {
  const c = anonClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

const SIZES = { desktop: { width: 1440, height: 900, deviceScaleFactor: 1 }, tablet: { width: 820, height: 1180, deviceScaleFactor: 1 }, phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };
const only = process.argv.slice(2);

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--hide-scrollbars'] });
const report = [];
try {
  for (const [who, email, password, pages] of [
    ['player', env.TEST_PLAYER_EMAIL, env.TEST_PLAYER_PASSWORD, [['campaigns', '/campaigns'], ['characters', '/characters'], ['account', '/account']]],
    ['dm', env.TEST_DM_EMAIL, env.TEST_DM_PASSWORD, [['campaigns', '/campaigns'], ['new-campaign', '/new-campaign']]],
  ]) {
    const s = await session(email, password);
    const ctx = await browser.createBrowserContext();
    const cookies = cookieFor(s).split('; ').map((kv) => { const i = kv.indexOf('='); return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: 'localhost', path: '/' }; });
    await ctx.setCookie(...cookies);
    for (const [size, viewport] of Object.entries(SIZES)) {
      if (only.length && !only.includes(size)) continue;
      const page = await ctx.newPage();
      await page.setViewport(viewport);
      for (const [name, url] of pages) {
        await page.goto(SITE + url, { waitUntil: 'networkidle0' });
        await page.evaluate(() => document.fonts.ready);
        await new Promise((r) => setTimeout(r, 400));
        const file = `hub-${who}-${name}-${size}.jpg`;
        await page.screenshot({ path: path.join(out, file), type: 'jpeg', quality: 82 });
        // facts worth checking on every page
        const facts = await page.evaluate(() => {
          const img = document.querySelector('.hall-bg img');
          const fetched = performance.getEntriesByType('resource').filter((r) => /hall-/.test(r.name) && r.initiatorType !== 'link' ? true : /hall-/.test(r.name)).map((r) => r.name.split('/').pop());
          return { image: img ? img.currentSrc.split('/').pop() : null, fetched: [...new Set(fetched)], sideways: document.documentElement.scrollWidth > innerWidth, tall: document.documentElement.scrollHeight > innerHeight, fixed: getComputedStyle(document.querySelector('.hall-bg')).position };
        });
        report.push({ file, ...facts });
        // a second shot scrolled to the bottom when the page is longer than the screen
        if (facts.tall) {
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await new Promise((r) => setTimeout(r, 300));
          await page.screenshot({ path: path.join(out, file.replace('.jpg', '-scrolled.jpg')), type: 'jpeg', quality: 82 });
        }
      }
      await page.close();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.table(report);
