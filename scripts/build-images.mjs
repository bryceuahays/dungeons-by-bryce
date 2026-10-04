// Converts the artwork in art/ (originals, never deployed) into WebP files under public/
// (landing/ for the doorway, hub/ for the hall), each under 400 KB, and reports the colours the page design uses.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT = 400 * 1024;
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

for (const [name, maxWidth, dir] of [['doorway-wide', 2400, 'landing'], ['doorway-tall', 1200, 'landing'], ['hall-wide', 2400, 'hub'], ['hall-tall', 1200, 'hub']]) {
  const src = path.join(ROOT, 'art', name + '.png');
  const meta = await sharp(src).metadata();
  const width = Math.min(meta.width, maxWidth);
  let out, quality = 94;
  for (; quality >= 40; quality -= 4) {
    out = await sharp(src).resize({ width }).webp({ quality, effort: 6 }).toBuffer();
    if (out.length < LIMIT) break;
  }
  if (out.length >= LIMIT) throw new Error(name + ' could not be brought under 400 KB');
  fs.mkdirSync(path.join(ROOT, 'public', dir), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'public', dir, name + '.webp'), out);
  const o = await sharp(out).metadata();

  // colours: the outer frame (what the page background has to match) and mid stone
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { const i = (y * info.width + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  const avg = (pick) => { const s = [0, 0, 0]; let n = 0; for (let y = 0; y < info.height; y += 3) for (let x = 0; x < info.width; x += 3) if (pick(x, y)) { const p = px(x, y); s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; n++; } return s.map((v) => v / n); };
  const b = Math.round(info.width * 0.02);
  const frame = avg((x, y) => x < b || y < b || x >= info.width - b || y >= info.height - b);
  const lum = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
  // stone: pixels of middling brightness that are not the teal glow (low saturation)
  const stone = avg((x, y) => { const p = px(x, y), l = lum(p); return l > 28 && l < 70 && Math.max(...p) - Math.min(...p) < 22; });
  const lit = avg((x, y) => { const p = px(x, y); return p[1] > 150 && p[2] > 150 && p[0] < 120; });
  console.log(`${name}: ${meta.width}x${meta.height} png -> ${o.width}x${o.height} webp, quality ${quality}, ${(out.length / 1024).toFixed(0)} KB`);
  console.log(`   frame (page background) ${hex(frame)}   stone ${hex(stone)}   rune glow ${hex(lit)}`);
}
