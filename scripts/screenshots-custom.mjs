// Takes the three example pictures shown on /custom, from the public demo campaign as any
// visitor sees it (no account needed).
//   npm run build && npm run start     then     node scripts/screenshots-custom.mjs
// Local only. Writes public/custom/example-1.webp, -2 and -3.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'http://localhost:3000';
const out = path.join(ROOT, 'public', 'custom');
fs.mkdirSync(out, { recursive: true });
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--hide-scrollbars'] });
try {
  const shot = async (name, url, viewport, scrollTo = 0) => {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.goto(SITE + url, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    if (scrollTo) await page.evaluate((y) => window.scrollTo(0, y), scrollTo);
    await new Promise((r) => setTimeout(r, 600));
    const png = await page.screenshot({ type: 'png' });
    await sharp(png).resize({ width: Math.min(viewport.width * (viewport.deviceScaleFactor ?? 1), 1280) }).webp({ quality: 78 }).toFile(path.join(out, name));
    await page.close();
    console.log(name, Math.round(fs.statSync(path.join(out, name)).size / 1024) + ' KB');
  };
  await shot('example-1.webp', '/demo/overview', { width: 1280, height: 800 });
  await shot('example-2.webp', '/demo/saltmere', { width: 1280, height: 800 });
  await shot('example-3.webp', '/demo/overview', { width: 390, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
} finally {
  await browser.close();
}
