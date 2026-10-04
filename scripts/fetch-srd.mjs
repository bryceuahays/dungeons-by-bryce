// Downloads the SRD data files (2014 rules = SRD 5.1, 2024 rules = SRD 5.2) into
// seed/srd/full/. See docs/srd-import.md for the source, its licence, and the version.
//
//   node scripts/fetch-srd.mjs            the pinned version below
//   node scripts/fetch-srd.mjs main       the newest (then run the import and the tests)
//
// The data is not kept in the repository: this script fetches it again whenever needed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SRD_SOURCE = { repo: '5e-bits/5e-srd-api', dir: 'packages/5e-database/src', ref: '05c109ea1f6b5445960b645ded48ad9c6a8df7b0' };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ref = process.argv[2] || SRD_SOURCE.ref;
const out = path.join(ROOT, 'seed', 'srd', 'full');

let files = 0, bytes = 0;
for (const year of ['2014', '2024']) {
  const res = await fetch(`https://api.github.com/repos/${SRD_SOURCE.repo}/contents/${SRD_SOURCE.dir}/${year}/en?ref=${ref}`, { headers: { accept: 'application/vnd.github+json' } });
  if (!res.ok) { console.error(`Could not list the ${year} files: ${res.status}`); process.exit(1); }
  const list = (await res.json()).filter((f) => /^5e-SRD-.*\.json$/.test(f.name));
  fs.mkdirSync(path.join(out, year), { recursive: true });
  for (const f of list) {
    const body = await (await fetch(`https://raw.githubusercontent.com/${SRD_SOURCE.repo}/${ref}/${SRD_SOURCE.dir}/${year}/en/${f.name}`)).text();
    JSON.parse(body); // refuse anything that is not JSON
    fs.writeFileSync(path.join(out, year, f.name), body);
    files++; bytes += body.length;
  }
}
fs.writeFileSync(path.join(out, 'SOURCE.json'), JSON.stringify({ ...SRD_SOURCE, ref, fetched: new Date().toISOString() }, null, 2));
console.log(`${files} files, ${(bytes / 1e6).toFixed(1)} MB, from ${SRD_SOURCE.repo} at ${ref.slice(0, 12)}.`);
