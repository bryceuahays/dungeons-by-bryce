// Takes the three example pictures shown on /custom, from "To be a god" exactly as one
// of its PLAYERS sees it today (a throwaway player account at the campaign's current
// stage), so nothing its players cannot already see ends up in public.
//   npm run build && npm run start     then     node scripts/screenshots-custom.mjs
// Local only. Writes public/custom/example-1.webp, -2 and -3.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import puppeteer from 'puppeteer-core';
import { campaign, cleanup, cookieFor, invite, makeUser, ROOT } from '../tests/helpers.mjs';

const SITE = 'http://localhost:3000';
const out = path.join(ROOT, 'public', 'custom');
fs.mkdirSync(out, { recursive: true });
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

await cleanup();
const C = await campaign();
const player = await makeUser('shots');
await player.client.rpc('join_campaign', { p_code: await invite(C.id) });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--hide-scrollbars'] });
try {
  const shot = async (name, url, viewport, scrollTo = 0) => {
    const ctx = await browser.createBrowserContext();
    await ctx.setCookie(...cookieFor(player.session).split('; ').map((kv) => { const i = kv.indexOf('='); return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: 'localhost', path: '/' }; }));
    const page = await ctx.newPage();
    await page.setViewport(viewport);
    await page.goto(SITE + url, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    if (scrollTo) await page.evaluate((y) => window.scrollTo(0, y), scrollTo);
    await new Promise((r) => setTimeout(r, 600));
    const png = await page.screenshot({ type: 'png' });
    await sharp(png).resize({ width: Math.min(viewport.width * (viewport.deviceScaleFactor ?? 1), 1280) }).webp({ quality: 78 }).toFile(path.join(out, name));
    await ctx.close();
    console.log(name, Math.round(fs.statSync(path.join(out, name)).size / 1024) + ' KB');
  };
  await shot('example-1.webp', `/c/${C.slug}/overview`, { width: 1280, height: 800 });
  await shot('example-2.webp', `/c/${C.slug}/races`, { width: 1280, height: 800 }, 345);
  await shot('example-3.webp', `/c/${C.slug}/races`, { width: 390, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 520);
} finally {
  await browser.close();
  await cleanup();
}
