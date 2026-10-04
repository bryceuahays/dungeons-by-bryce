// Screenshots of campaign pages on a LOCAL copy of the site (http://localhost:3000), as a
// throwaway player and a throwaway DM (.env.test.local, made by scripts/dev-users.mjs).
// Local only: it never signs in to the live site.

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer-core';
import { anonClient, campaign, cookieFor, ROOT } from '../tests/helpers.mjs';

const SITE = 'http://localhost:3000';
const env = dotenv.parse(fs.readFileSync(path.join(ROOT, '.env.test.local')));
const out = path.join(ROOT, 'art', 'screenshots');
fs.mkdirSync(out, { recursive: true });
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const S = (await campaign()).slug;
const tag = process.argv[2] || 'before';

async function session(email, password) {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--hide-scrollbars'] });
try {
  for (const [who, email, password, pages] of [
    ['player', env.TEST_PLAYER_EMAIL, env.TEST_PLAYER_PASSWORD, [['overview', `/c/${S}/overview`], ['races', `/c/${S}/races?race=dragonborn`], ['campaign', `/c/${S}/campaign`], ['sheet', `/c/${S}/sheet`], ['hub', '/campaigns']]],
    ['dm', env.TEST_DM_EMAIL, env.TEST_DM_PASSWORD, [['overview', `/c/${S}/overview`], ['races', `/c/${S}/races?race=dragonborn`], ['manage', `/c/${S}/manage`], ['hub', '/campaigns']]],
  ]) {
    const ctx = await browser.createBrowserContext();
    const s = await session(email, password);
    await ctx.setCookie(...cookieFor(s).split('; ').map((kv) => { const i = kv.indexOf('='); return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: 'localhost', path: '/' }; }));
    const page = await ctx.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    for (const [name, url] of pages) {
      await page.goto(SITE + url, { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 500));
      await page.screenshot({ path: path.join(out, `phase-${tag}-${who}-${name}.jpg`), type: 'jpeg', quality: 80, fullPage: true });
      console.log(`phase-${tag}-${who}-${name}.jpg`, await page.title());
    }
    await ctx.close();
  }
} finally { await browser.close(); }
