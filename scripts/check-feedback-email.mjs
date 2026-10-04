// Sends ONE feedback note through the real Feedback page of a site, as a throwaway
// account, and reports whether the site emailed it. The note and the account are removed
// afterwards; the email (if it went out) stays in the site owner's inbox.
//   node scripts/check-feedback-email.mjs https://dungeons-by-bryce.vercel.app

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { admin, cleanup, cookieFor, makeUser } from '../tests/helpers.mjs';

const SITE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const host = new URL(SITE).hostname;
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

const user = await makeUser('mailcheck');
const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
try {
  const ctx = await browser.createBrowserContext();
  await ctx.setCookie(...cookieFor(user.session).split('; ').map((kv) => { const i = kv.indexOf('='); return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: host, path: '/', secure: SITE.startsWith('https') }; }));
  const page = await ctx.newPage();
  await page.goto(SITE + '/feedback', { waitUntil: 'networkidle0' });
  await page.type('textarea[name=message]', 'This is an automated test note to check that feedback email works. Nothing to do; you can delete this email.');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Send').click());
  await page.waitForFunction(() => document.body.innerText.includes('Your note has been sent'), { timeout: 20000 });
  const { data } = await admin.from('feedback').select('emailed, email_error').eq('email', user.email);
  console.log(data?.[0]?.emailed ? 'EMAILED: the mail service accepted the note.' : 'NOT EMAILED: ' + (data?.[0]?.email_error || 'no reason recorded'));
} finally {
  await browser.close();
  await cleanup();
}
