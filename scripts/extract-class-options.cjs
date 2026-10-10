// Usage (needs pdftotext):
//   curl -L -o srd.pdf https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf
//   pdftotext srd.pdf srd.txt
//   node scripts/extract-class-options.cjs srd.txt seed/srd/class-options-5.2.json
// One-time: read the Metamagic and Eldritch Invocation options out of the official SRD 5.2.1 PDF text
// (pdftotext, no layout) into seed/srd/class-options-5.2.json for import-srd.mjs.
const fs = require('fs');
const [src, out] = process.argv.slice(2);
const all = fs.readFileSync(src, 'utf8').split(/\r?\n/);
const section = (start, end) => {
  const i = all.findIndex((l, k) => l.trim() === start && /alphabetical order/.test(all[k + 1] ?? ''));
  const j = all.findIndex((l, k) => k > i && l.trim() === end);
  if (i < 0 || j < 0) throw new Error('section ' + start);
  // drop the intro line, page numbers, running heads, and blank lines; then rejoin paragraphs a page break split
  const lines = all.slice(i + 2, j).map((l) => l.trim()).filter((l) => l && !/^\d+$/.test(l) && l !== 'System Reference Document 5.2.1');
  const paras = [];
  for (const l of lines) {
    const prev = paras[paras.length - 1];
    if (prev && !/[.:!?)]$/.test(prev) && /^[a-z]/.test(l)) paras[paras.length - 1] = prev + ' ' + l;
    else paras.push(l);
  }
  return paras;
};
const SMALL = new Set(['of', 'the', 'or', 'with', 'and', 'to', 'a']);
const isTitle = (l) => l.length < 45 && !/[.,:]/.test(l) && l.split(' ').every((w, i) => /^[A-Z][A-Za-z']*$/.test(w) || (i > 0 && SMALL.has(w)));

function parse(paras, res) {
  const opts = [];
  for (const p of paras) {
    if (isTitle(p)) { opts.push({ name: p, text: [] }); continue; }
    const o = opts[opts.length - 1];
    if (!o) throw new Error('text before first option: ' + p);
    const cost = p.match(/^Cost: (\d+) (.+)$/);
    if (cost) { o.cost = Number(cost[1]); o.res = res; continue; }
    const pre = p.match(/^Prerequisite: (.+)$/);
    if (pre) {
      for (const part of pre[1].split(/,\s*/)) {
        const lv = part.match(/^Level (\d+)\+ \w+$/);
        const inv = part.match(/^(.+) Invocation$/);
        if (lv) o.minLevel = Number(lv[1]);
        else if (inv) o.requires = inv[1];
        else o.other = (o.other ? o.other + ', ' : '') + part.toLowerCase().replace('warlock', 'Warlock');
      }
      continue;
    }
    if (/^Repeatable\./.test(p)) o.repeatable = true;
    o.text.push(p);
  }
  return opts.map((o) => ({ ...o, text: o.text.join('\n') }));
}

const metamagic = parse(section('Metamagic Options', 'Sorcerer Spell List'), 'r:sorcery points');
const invocations = parse(section('Eldritch Invocation Options', 'Warlock Spell List'), null);
fs.writeFileSync(out, JSON.stringify({
  source: 'System Reference Document 5.2.1 (Wizards of the Coast, CC-BY-4.0), Sorcerer "Metamagic Options" and Warlock "Eldritch Invocation Options"',
  Metamagic: metamagic, 'Eldritch Invocations': invocations,
}, null, 1) + '\n');
console.log(metamagic.length, 'metamagic;', invocations.length, 'invocations');
for (const o of [...metamagic, ...invocations]) console.log(' ', o.name, '|', [o.cost && `cost ${o.cost}`, o.minLevel && `L${o.minLevel}+`, o.requires && `needs ${o.requires}`, o.other && `other: ${o.other}`, o.repeatable && 'repeatable'].filter(Boolean).join('; '), '|', o.text.length, 'chars');
