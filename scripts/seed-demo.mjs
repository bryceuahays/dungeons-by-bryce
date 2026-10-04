// Builds the public demo campaign, "The Lantern Beneath": an original short campaign
// written for this site (no content from any published book; rules references are SRD).
// It belongs to the Head DM's account and is flagged as the demo, which lets signed-out
// visitors browse it at /demo exactly as a player would see it.
//
//   npm run seed-demo            create it if it is not there
//   npm run seed-demo -- --reset delete and rebuild it
//
// It is also a good first product for the store: it contains nothing private.

import sharp from 'sharp';
import { admin } from '../tests/helpers.mjs';
import { THEMES } from '../src/config/themes.ts';

const SLUG = 'the-lantern-beneath';
const reset = process.argv.includes('--reset');

const { data: head } = await admin.from('profiles').select('id').eq('role', 'head').order('created_at').limit(1).maybeSingle();
if (!head) { console.error('There is no Head DM account yet.'); process.exit(1); }
const { data: existing } = await admin.from('campaign_faces').select('campaign_id').eq('slug', SLUG).maybeSingle();
if (existing && !reset) { console.log('The demo campaign already exists. Use --reset to rebuild it.'); process.exit(0); }
if (existing) {
  const { data: old } = await admin.storage.from('campaign-files').list(`${existing.campaign_id}/maps`);
  if (old?.length) await admin.storage.from('campaign-files').remove(old.map((o) => `${existing.campaign_id}/maps/${o.name}`));
  await admin.from('campaigns').delete().eq('id', existing.campaign_id);
  await admin.from('entities').delete().eq('owner_id', head.id).eq('slug', 'tidewalker-demo');
}

const stages = [{ id: 'before', label: 'Before the lantern is lit' }, { id: 'after', label: 'After the lantern is lit' }];
const theme = THEMES.find((t) => t.id === 'grove').theme;
const made = await admin.from('campaigns').insert({ owner_id: head.id, slug: SLUG, title: 'The Lantern Beneath', tagline: 'A light burns under the river. Someone has to go down and see who lit it.', theme, phases: stages, phase: 'before', is_demo: true, settings: { session: 3, feed: true } }).select('id').single();
if (made.error) { console.error(made.error.message); process.exit(1); }
const C = made.data.id;
const must = async (q) => { const r = await q; if (r.error) { console.error(r.error.message); process.exit(1); } return r.data; };

await must(admin.from('sections').insert([
  { campaign_id: C, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' },
  { campaign_id: C, slug: 'saltmere', title: 'Saltmere', sort: 20, audience: 'all', kind: 'content' },
  { campaign_id: C, slug: 'rumours', title: 'Rumours', sort: 30, audience: 'all', kind: 'content' },
  { campaign_id: C, slug: 'the-drowned-quarter', title: 'The Drowned Quarter', sort: 40, audience: 'all', kind: 'content', from_stage: 'after' },
  { campaign_id: C, slug: 'secrets', title: 'Secrets', sort: 800, audience: 'dm', kind: 'content' },
  { campaign_id: C, slug: 'sheet', title: 'My character', sort: 900, audience: 'player', kind: 'sheet' },
  { campaign_id: C, slug: 'combat', title: 'Combat', sort: 910, audience: 'player', kind: 'combat' },
  { campaign_id: C, slug: 'sessions', title: 'Sessions', sort: 920, audience: 'dm', kind: 'sessions' },
  { campaign_id: C, slug: 'players', title: 'Players', sort: 930, audience: 'dm', kind: 'players' },
]));

let n = 0;
const row = (section, kind, title, body, extra = {}) => ({ campaign_id: C, section, kind, key: `${kind}-${++n}`, sort: n * 10, title, body, visibility: 'player', ...extra });
await must(admin.from('content').insert([
  row('overview', 'hero', 'The Lantern Beneath', { html: '<h1>The Lantern Beneath</h1><p class="premise">Saltmere lost a third of itself to the river forty years ago. Now, every night, a lantern burns under the water where the old streets used to be. The Ferry Guild will pay well to learn who lit it.</p>' }),
  row('overview', 'heading', 'How this campaign runs', { text: 'How this campaign runs', level: 2 }),
  row('overview', 'html', 'How', { html: '<p>A short campaign for three to five characters, levels 1 to 4, using the fifth edition SRD. It is a mystery first and a dungeon second: the party spends its first sessions in town, asking questions, before anyone gets wet.</p><p>This page, and everything else you can open here, is what a <b>player</b> at this table sees today. The DM has a Secrets tab, hidden NPCs, planned story beats and a covered part of the map that are not sent to your browser at all.</p>' }),
  row('overview', 'plate', 'What you know', { html: '<h3>What you know</h3><ul><li>The river took the eastern third of town in one night, forty years ago.</li><li>Nobody rebuilt. The survivors call it the Drowned Quarter and do not row over it.</li><li>Nine nights ago a light appeared down there. It has burned every night since.</li></ul>', grid: 'g2', group: 'o1' }),
  row('overview', 'plate', 'What you want', { html: '<h3>Why you are here</h3><ul><li>The Ferry Guild is offering 200 gold pieces for the truth about the light.</li><li>Two of their divers went down. One came back, and has not spoken since.</li><li>Each of you has a reason of your own. Your DM will tell you yours, privately.</li></ul>', grid: 'g2', group: 'o1' }),
  row('overview', 'html', 'After', { html: '<h2>The lantern is lit</h2><p>You have seen it with your own eyes now: a brass lantern, chained to the bell tower of a church that is forty feet under the river. The flame does not flicker. The Drowned Quarter tab is open to you, and the map shows more than it did.</p>' }, { from_stage: 'after' }),

  row('saltmere', 'heading', 'Saltmere', { text: 'Saltmere', level: 2 }),
  row('saltmere', 'html', 'Town', { html: '<p class="lede">A ferry town of about eight hundred people on a slow brown river. It smells of tar, eels and woodsmoke.</p><p>Everything here turns on the ferry. The Guild runs the only safe crossing for thirty miles, and the Guild decides who works.</p>' }),
  row('saltmere', 'plate', 'The Ferry Guild', { html: '<h3>The Ferry Guild</h3><p class="kv"><b>Leader:</b> Guildmistress Oda Venn</p><p>Owns the boats, the ropes and most of the debt in town. Your employer.</p>', grid: 'g3', group: 's1' }),
  row('saltmere', 'plate', 'The Eel and Anchor', { html: '<h3>The Eel and Anchor</h3><p class="kv"><b>Keeper:</b> Tam Hollis</p><p>The only inn. Warm, loud, and the best place to hear what people will not say sober.</p>', grid: 'g3', group: 's1' }),
  row('saltmere', 'plate', 'The Chapel of the Tide', { html: '<h3>The Chapel of the Tide</h3><p class="kv"><b>Keeper:</b> Sister Maren</p><p>A small stone chapel on the high ground. Its bell is cracked. The old bell went under with the old church.</p>', grid: 'g3', group: 's1' }),

  row('rumours', 'heading', 'Rumours', { text: 'What people are saying', level: 2 }),
  row('rumours', 'table', 'Rumours', { html: '<table><tr><th>Who says it</th><th>What they say</th></tr><tr><td>The ferrymen</td><td>The light moves. It was nearer the bank last night than the night before.</td></tr><tr><td>Tam Hollis</td><td>The diver who came back drinks water by the jug and will not go near a window.</td></tr><tr><td>The children</td><td>If you put your ear to the river at midnight you can hear a bell.</td></tr><tr><td>Sister Maren</td><td>Nothing. She changes the subject, every time.</td></tr></table>' }),
  row('rumours', 'checklist', 'Leads', { items: [{ text: 'Talk to the diver who came back', done: true }, { text: 'Find out who owned the lantern', done: false }, { text: 'Ask Sister Maren about the old church', done: false }] }),

  row('the-drowned-quarter', 'heading', 'The Drowned Quarter', { text: 'The Drowned Quarter', level: 2 }),
  row('the-drowned-quarter', 'html', 'Below', { html: '<p class="lede">Forty feet down, the streets are still there.</p><p>The water is clear near the lantern and black everywhere else. Doors are shut. Shutters are latched from the inside. Whatever happened here, people had time to lock up first.</p>' }),

  row('secrets', 'secret', 'The truth', { tag: 'DM only', html: '<p>Sister Maren lit the lantern. Her brother was the bell-ringer of the old church, and she has heard his bell every night for forty years. The light is a promise that she is coming down to bring him home.</p><p>The diver did not meet a monster. He met the congregation, still in their pews.</p>' }, { visibility: 'dm' }),
  row('secrets', 'checklist', 'Prep', { items: [{ text: 'Stat the congregation (use the SRD ghoul, slowed)', done: true }, { text: 'Decide what the bell does when rung', done: false }] }, { visibility: 'dm' }),
]));

// ---- the map: drawn here, so it is original and belongs to the site
const mapSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
<rect width="1600" height="1000" fill="#d9c9a3"/>
<path d="M0 620 C 300 560 520 700 800 640 S 1300 520 1600 600 L1600 1000 L0 1000 Z" fill="#6f8f94"/>
<path d="M0 620 C 300 560 520 700 800 640 S 1300 520 1600 600" fill="none" stroke="#4d6a70" stroke-width="6"/>
<g fill="#b8a377" stroke="#6b5a3a" stroke-width="3">
<rect x="180" y="300" width="90" height="70"/><rect x="300" y="260" width="120" height="90"/><rect x="450" y="320" width="80" height="80"/><rect x="230" y="420" width="110" height="70"/><rect x="380" y="430" width="90" height="90"/><rect x="560" y="380" width="130" height="80"/><rect x="620" y="250" width="90" height="90"/>
</g>
<g fill="#8fa3a0" stroke="#4d6a70" stroke-width="3" opacity="0.9">
<rect x="1000" y="640" width="110" height="80"/><rect x="1140" y="610" width="90" height="90"/><rect x="1260" y="660" width="130" height="90"/><rect x="1060" y="760" width="100" height="80"/><rect x="1210" y="790" width="120" height="80"/>
<path d="M1400 600 l40 -90 l40 90 z M1420 600 h40 v110 h-40 z"/>
</g>
<g fill="#5f7a4a"><circle cx="1250" cy="200" r="70"/><circle cx="1350" cy="250" r="80"/><circle cx="1180" cy="280" r="60"/><circle cx="1440" cy="180" r="60"/></g>
<path d="M700 520 L960 640" stroke="#6b5a3a" stroke-width="10" stroke-dasharray="18 12"/>
<g font-family="Georgia, serif" fill="#3a2f1c">
<text x="300" y="230" font-size="44" font-style="italic">Saltmere</text>
<text x="1190" y="130" font-size="34" font-style="italic">Alder Wood</text>
<text x="160" y="860" font-size="46" font-style="italic" fill="#e8f0ee">The Brown River</text>
<text x="1040" y="940" font-size="34" font-style="italic" fill="#e8f0ee">The Drowned Quarter</text>
<text x="720" y="500" font-size="26">Ferry</text>
</g>
<g transform="translate(1480 880)" fill="none" stroke="#3a2f1c" stroke-width="4"><circle r="46"/><path d="M0 -60 L12 0 L0 60 L-12 0 Z" fill="#3a2f1c"/><text x="-10" y="-70" font-size="26" fill="#3a2f1c" stroke="none" font-family="Georgia, serif">N</text></g>
</svg>`;
const png = await sharp(Buffer.from(mapSvg)).webp({ quality: 88 }).toBuffer();
const mapPath = `${C}/maps/saltmere.webp`;
await must(admin.storage.from('campaign-files').upload(mapPath, png, { contentType: 'image/webp', upsert: true }));

const entry = async (r, secret) => { const [e] = await must(admin.from('entries').insert({ campaign_id: C, owner: head.id, live: true, vis: 'all', ...r }).select('id')); if (secret) await must(admin.from('entry_secrets').insert({ entry_id: e.id, campaign_id: C, data: secret })); return e.id; };

// story beats: three have happened, the rest are planned (and so are not sent to players)
const b1 = await entry({ kind: 'beat', title: 'Hired by the Ferry Guild', status: 'hit', sort: 10, data: { note: 'Oda Venn offers 200 gold pieces for the truth about the light.', hitSession: 1, hitAt: '2026-09-06', location: 'The Guildhall' } });
const b2 = await entry({ kind: 'beat', title: 'The diver who came back', status: 'hit', sort: 20, data: { note: 'He will not speak, but he drew a row of benches in the dust.', hitSession: 2, hitAt: '2026-09-13', location: 'The Eel and Anchor' } });
const b3 = await entry({ kind: 'beat', title: 'A bell under the river', status: 'hit', sort: 30, data: { note: 'At midnight, from the ferry, you all heard it.', hitSession: 3, hitAt: '2026-09-20', location: 'The ferry crossing', key: true } });
const b4 = await entry({ kind: 'beat', title: 'Sister Maren admits she lit the lantern', status: 'planned', live: false, sort: 40, data: { key: true, target: 4 } });
await entry({ kind: 'beat', title: 'The party dives to the old church', status: 'planned', live: false, sort: 50, data: { key: true, target: 5, stage: 'after' } });
await entry({ kind: 'note', parent: b2, title: 'Benches. A church? Ask at the chapel.', vis: 'all' });

await entry({ kind: 'npc', title: 'Guildmistress Oda Venn', status: 'allied', data: { location: 'The Guildhall', faction: 'Ferry Guild', known: 'Your employer. Brisk, fair, and clearly frightened of something she will not name.' } }, { wants: 'The light gone before the autumn fair, whatever it costs.', secret: 'Her mother was the one who ordered the sluice opened, forty years ago.' });
await entry({ kind: 'npc', title: 'Tam Hollis', status: 'alive', data: { location: 'The Eel and Anchor', faction: '', known: 'Innkeeper. Knows everyone. Gave you the diver\'s name for the price of a meal.' } }, { wants: 'A quiet life.', relations: 'Brother-in-law of the surviving diver.' });
await entry({ kind: 'npc', title: 'Sister Maren', status: 'alive', data: { location: 'The Chapel of the Tide', faction: 'The chapel', known: 'Keeper of the chapel. Kind, tired, and very careful about what she says.' } }, { wants: 'To bring her brother home.', secret: 'She lit the lantern.' });
await entry({ kind: 'npc', title: 'Corin, the diver', status: 'alive', data: { location: 'The Eel and Anchor', faction: 'Ferry Guild', known: 'Came back from the river alone. Has not spoken since. Draws benches.' } });
await entry({ kind: 'npc', title: 'Brother Aldous', status: 'missing', vis: 'stage', vis_stage: 'after', data: { location: 'The old church', faction: 'The chapel', known: 'The bell-ringer of the old church. He is still ringing.' } }, { secret: 'He can be laid to rest only by someone who forgives the town.' });
await entry({ kind: 'npc', title: 'The Sluice-Warden', status: 'hostile', vis: 'dm', data: { location: 'The Drowned Quarter', known: '' } }, { wants: 'To keep the gate shut.', secret: 'The thing the town drowned its own streets to bury.' });

const mapId = await entry({ kind: 'map', title: 'Saltmere and the river', sort: 10, data: { file: mapPath, w: 1600, h: 1000 } });
await entry({ kind: 'region', parent: mapId, title: 'The Drowned Quarter', vis: 'stage', vis_stage: 'after', data: { pts: [[0.6, 0.58], [1, 0.52], [1, 1], [0.6, 1]] } });
await entry({ kind: 'pin', parent: mapId, title: 'The Guildhall', data: { x: 0.22, y: 0.32, note: 'Where you were hired.', beat: b1 }, vis: 'entry', vis_entry: b1 });
await entry({ kind: 'pin', parent: mapId, title: 'The Eel and Anchor', data: { x: 0.39, y: 0.47, note: 'Your rooms, and the diver.' } });
await entry({ kind: 'pin', parent: mapId, title: 'Where you heard the bell', data: { x: 0.52, y: 0.6, note: '', beat: b3 }, vis: 'entry', vis_entry: b3 });
await entry({ kind: 'pin', parent: mapId, title: 'Maren\'s boat', data: { x: 0.56, y: 0.44, note: 'She rows out alone at dusk.', beat: b4 }, vis: 'entry', vis_entry: b4 });
await entry({ kind: 'pin', parent: mapId, title: 'The sluice gate', data: { x: 0.9, y: 0.78 }, vis: 'dm' });

await entry({ kind: 'clock', title: 'The Ferry Guild', data: { goal: 'Seal the eastern bank before the autumn fair', segments: '6', filled: 2 } }, { onFill: 'They hire sell-swords to stop anyone diving, the party included.' });
await entry({ kind: 'clock', title: 'The congregation', vis: 'dm', data: { goal: 'Reach the bank', segments: '8', filled: 3 } }, { onFill: 'They come ashore.' });
await entry({ kind: 'consequence', title: 'You paid for the diver\'s room, and Tam Hollis now trusts you with what he hears.', data: { session: 3, tags: ['Tam Hollis', 'The Eel and Anchor'] } });
await entry({ kind: 'consequence', title: 'You asked about the old church in front of the whole taproom. Sister Maren has heard.', data: { session: 3, tags: ['Sister Maren'] } });
await entry({ kind: 'consequence', title: 'Oda Venn has had the party followed since the ferry.', vis: 'dm', data: { session: 3, tags: ['Guildmistress Oda Venn', 'Ferry Guild'] } });
const sec = await entry({ kind: 'secret', title: 'Sister Maren lit the lantern', vis: 'dm', data: {} }, { detail: 'She rows out at dusk and dives without a line.' });
for (const [t, where] of [['Lamp oil on her sleeves', 'The chapel'], ['A boat missing from the chapel landing at dusk', 'The riverbank'], ['The lantern bears the chapel\'s mark', 'The Drowned Quarter']]) await entry({ kind: 'clue', parent: sec, title: t, vis: 'dm', data: { where } });
await entry({ kind: 'zero', title: 'Session zero', data: { tone: 'A slow, sad mystery with one frightening dive at the end. More dread than gore.', lines: 'Harm to children. Torture.', veils: 'Drowning is described from the outside, never from the inside.', table: 'Phones away during scenes. We stop at ten.', house: 'Holding your breath: Constitution modifier plus one minutes, as in the SRD. Swimming in the river is difficult terrain.' } });

// one piece of homebrew, attached, so the compendium and sheets have something of the campaign's own
const [race] = await must(admin.from('entities').insert({ owner_id: head.id, source: 'homebrew', type: 'race', slug: 'tidewalker-demo', name: 'Tidewalker', status: 'live', depth: 'advanced', data: { size: 'Medium', speed: 30, languages: 'Common and one more of your choice', desc: 'River folk of Saltmere, born on the boats. They are at home in water that would kill anyone else.', effects: [{ t: 'ability', ab: 'con', n: 2 }, { t: 'ability', ab: 'wis', n: 1 }, { t: 'speed', mode: 'swim', n: 30 }, { t: 'resist', v: 'cold' }], features: [{ level: 1, name: 'Deep Lungs', text: 'You can hold your breath for up to 15 minutes.' }, { level: 1, name: 'River Sense', text: 'You always know the direction of the nearest large body of water.' }] } }).select('id'));
await must(admin.from('campaign_entities').insert({ campaign_id: C, entity_id: race.id }));

console.log(`The demo campaign is ready: /demo (and /c/${SLUG} for its DM).`);
