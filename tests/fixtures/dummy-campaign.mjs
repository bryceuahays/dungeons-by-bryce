// The dummy campaign the automated tests run against. It is made up, it is not secret,
// and nobody plays in it. `node scripts/seed-fixture.mjs` loads it into the database.
//
// It exists to exercise the things a real campaign relies on: two reveal stages with a
// different title and address at each, tabs and blocks that belong to one stage, DM-only
// secrets, races and factions with a version per stage, and pictures held back by stage.
//
// If you change the story here, keep three promises the tests check:
//   - every phrase in WORDS.dmOnly appears only in DM-only blocks
//   - every phrase in WORDS.afterOnly appears only in "after" blocks (and DM-only ones)
//   - nothing from this file is ever copied into src/ (a test reads the built bundles)

export const STAGES = [{ id: 'before', label: 'Before the fair' }, { id: 'after', label: 'After the fair' }];

export const FACES = {
  after: { phase: '', slug: 'the-hollow-crown', title: 'The Hollow Crown', tagline: 'The Queen of Reeds has vanished and her seat stands empty. Three peoples must decide who sits in it. (Dummy campaign for the automated tests.)' },
  before: { phase: 'before', slug: 'the-harvest-fair', title: 'The Harvest Fair', tagline: 'Every autumn the Reedwater valley gathers for the fair. This year the Queen of Reeds opens it herself. (Dummy campaign for the automated tests.)' },
};

export const WORDS = {
  // never sent to a player, at any stage
  dmOnly: ['Odrin Vale', 'Brassmother', 'Ideas in reserve'],
  // not sent to a player while the stage is "before"
  afterOnly: ['The Hollow Crown', 'the-hollow-crown', 'Reedwardens', 'Ashen Ledger', 'has vanished', 'crownless'],
  beforeLabel: 'Shown to players only before the fair',
  afterLabel: 'Hidden from players until after the fair',
};

const glyph = (d) => `<path d="${d}"/>`;
const RACES = [
  { id: 'reedfolk', name: 'Reedfolk', color: '#7fbf8a', glyph: glyph('M50 90C50 60 40 40 30 15M50 90C50 55 55 35 68 12M50 90C50 65 62 50 82 38'), size: 'Medium', speed: '30 ft, swim 30 ft',
    line: 'Tall marsh-dwellers who weave their homes from living reeds.', look: 'Long-limbed and green-grey, with hair like dry rushes that rattles when they laugh.',
    life: ['They are born in spring floods and named at the first frost.', 'They live about 70 years.'], culture: ['A promise made standing in water cannot be broken.', 'Every household keeps one boat that is never sold.'],
    traits: [['Marsh-born', 'You can hold your breath for 10 minutes and ignore difficult terrain from mud and shallow water.', ''], ['Reed-weaving', 'You are proficient with weaver\'s tools.', '']], up: 'Once per long rest, walk across still water for 1 minute.',
    before: { keys: ['Trusted ferrymen', 'Keep the valley\'s oaths'], history: 'The Queen of Reeds is one of their own, and they carry her word up and down the river.' },
    after: { keys: ['Trusted ferrymen', 'Keep the valley\'s oaths', 'Blamed for losing the Queen'], history: 'The Queen of Reeds was one of their own, and they carried her word up and down the river.', now: 'Half the valley thinks they hid her. The other half thinks they drowned her.', part: 'They were the last to see her, on the night of the fair.' },
    dm: ['Odrin Vale is a Reedfolk ferryman. He knows exactly where the Queen went.'] },
  { id: 'kilnborn', name: 'Kilnborn', color: '#d98a5a', glyph: glyph('M25 85L25 45C25 25 75 25 75 45L75 85ZM40 85L40 60L60 60L60 85'), size: 'Medium', speed: '25 ft',
    line: 'Stocky potters and smiths with skin like fired clay.', look: 'Broad, warm to the touch, and faintly glazed where the light catches them.',
    life: ['They are shaped, not born, in the great kilns above the valley.', 'They live about 120 years and crack rather than wrinkle.'], culture: ['Nothing is thrown away: broken things are ground down and made again.', 'They sign contracts with a thumbprint in wet clay.'],
    traits: [['Fired skin', 'You have resistance to fire damage.', ''], ['Maker', 'You are proficient with one set of artisan\'s tools of your choice.', '']], up: 'Once per long rest, mend a broken object no larger than a cart wheel with a touch.',
    before: { keys: ['Build the fairground every year', 'Proud of their work'], history: 'They fire the Queen\'s seal into every tile of the Moot Hall and are paid well for it.' },
    after: { keys: ['Build the fairground every year', 'Proud of their work', 'Want the seat for a maker'], history: 'They fired the Queen\'s seal into every tile of the Moot Hall and were paid well for it.', now: 'The kilns have gone cold while the elders argue about a claim.', part: 'Their fairground stage is where she was last seen.' },
    dm: ['The Brassmother, eldest of the Kilnborn, made the crown and can unmake it.'] },
  { id: 'lanternkin', name: 'Lanternkin', color: '#e3c47f', glyph: glyph('M50 12L50 24M35 30L65 30L72 70L28 70ZM40 70L40 86L60 86L60 70') + '<circle class="dot" cx="50" cy="50" r="5"/>', size: 'Small', speed: '30 ft',
    line: 'Small night-wanderers who carry a light inside their chests.', look: 'Knee-high to a Reedfolk, with a soft glow behind the ribs that brightens when they are curious.',
    life: ['They wake at dusk and sleep through the day.', 'Their light dims as they age; they live about 50 years.'], culture: ['It is rude to ask why someone\'s light has changed colour.', 'They trade in stories, and keep careful count of who owes whom.'],
    traits: [['Inner light', 'You shed dim light in a 10-foot radius and can douse or relight it as a bonus action.', ''], ['Night eyes', 'You have darkvision out to 60 feet.', '']],
    before: { keys: ['Run the night market', 'Know everyone\'s business'], history: 'They light the road to the fair and the Queen pays them in lamp oil.' },
    after: { keys: ['Run the night market', 'Know everyone\'s business', 'Selling rumours about the seat'], history: 'They lit the road to the fair and the Queen paid them in lamp oil.', part: 'Their lamps went out, all at once, the moment she disappeared.' } },
];

const FACTIONS = [
  { key: 'the-reedwardens', n: 'The Reedwardens', who: 'River pilots and oath-keepers', want: 'the Queen found and put back', members: 'Mostly Reedfolk, a few Lanternkin scouts', leader: 'Warden Isk, who has not slept since the fair', res: 'Every boat on the river',
    dm: { idle: 'They close the river to anyone they do not trust.', small: ['Search a barge', 'Question a stallholder'], big: 'They blockade the Moot Hall.', resDm: ', and a list of everyone who left the fair early' } },
  { key: 'the-ashen-ledger', n: 'The Ashen Ledger', who: 'Kilnborn elders and the merchants who owe them', want: 'a maker on the seat', members: 'Kilnborn masters and their debtors', leader: 'Master Tollen of the high kiln', res: 'The valley\'s debts, written in fired clay',
    dm: { idle: 'They call in debts until the valley cannot afford to refuse them.', small: ['Buy a vote', 'Foreclose on a stall'], big: 'They crown one of their own in the cold kiln.' } },
];

const row = (section, kind, key, sort, body, { title = key, visibility = 'player', phase = null } = {}) => ({ section, kind, key, sort, title, body, visibility, phase });
let n = 0; const next = () => (n += 10);

export const DUMMY = {
  campaign: { slug: FACES.after.slug, title: FACES.after.title, tagline: FACES.after.tagline, status: 'active', phase: 'before', phases: STAGES, faces: [FACES.after, FACES.before] },
  sections: [
    { slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content', phase: null },
    { slug: 'sheet', title: 'My character', sort: 20, audience: 'player', kind: 'sheet', phase: null },
    { slug: 'combat', title: 'Combat', sort: 30, audience: 'player', kind: 'combat', phase: null },
    { slug: 'peoples', title: 'Peoples', sort: 40, audience: 'all', kind: 'content', phase: null },
    { slug: 'the-seat', title: 'The seat', sort: 50, audience: 'all', kind: 'content', phase: 'after' },
    { slug: 'factions', title: 'Factions', sort: 60, audience: 'all', kind: 'content', phase: 'after' },
    { slug: 'secrets', title: 'Secrets', sort: 70, audience: 'dm', kind: 'content', phase: null },
    { slug: 'sessions', title: 'Sessions', sort: 80, audience: 'dm', kind: 'sessions', phase: null },
    { slug: 'players', title: 'Players', sort: 90, audience: 'dm', kind: 'players', phase: null },
    { slug: 'campaign', title: 'Campaign', sort: 100, audience: 'all', kind: 'content', phase: null },
  ],
  content: [
    // ---- overview
    row('overview', 'hero', 'hero-before', next(), { html: `<h1>${FACES.before.title}</h1><p class="lede">One evening of games, music and gossip, and the Queen of Reeds herself to open it.</p>` }, { phase: 'before' }),
    row('overview', 'hero', 'hero-after', next(), { html: `<h1>${FACES.after.title}</h1><p class="lede">The Queen of Reeds has vanished. Her seat is crownless, and the valley is choosing sides.</p>` }, { phase: 'after' }),
    row('overview', 'heading', 'heading-valley', next(), { text: 'The Reedwater valley', level: 2 }),
    row('overview', 'html', 'valley', next(), { html: '<p>Three peoples share the Reedwater: the Reedfolk on the river, the Kilnborn in the hills, and the Lanternkin wherever it is dark.</p>' }),
    row('overview', 'plate', 'plate-fair', next(), { html: '<h3>The fair</h3><p>For 3 to 5 players. Level 3. One evening in the valley, and a mystery nobody expects.</p>' }, { title: 'The fair', phase: 'before' }),
    row('overview', 'plate', 'plate-empty-seat', next(), { html: '<h3>The empty seat</h3><p>Who holds the valley now? The Reedwardens want her back. The Ashen Ledger want her replaced.</p>' }, { title: 'The empty seat', phase: 'after' }),
    row('overview', 'secret', 'secret-truth', next(), { tag: 'DM only: what really happened', html: '<p>Nobody took the Queen. Odrin Vale rowed her out of the valley at her own request, and the Brassmother melted the crown the same night.</p>' }, { title: 'What really happened', visibility: 'dm' }),
    // ---- peoples
    row('peoples', 'heading', 'heading-peoples', next(), { text: 'Peoples', level: 2 }),
    row('peoples', 'html', 'peoples-intro', next(), { html: '<p class="lede">Pick the people your character comes from.</p>' }),
    row('peoples', 'race-cards', 'race-cards', next(), { grid: 'g3' }),
    row('peoples', 'race-browser', 'race-browser', next(), {}),
    row('peoples', 'upgrade-table', 'upgrade-table', next(), {}),
    ...RACES.flatMap(({ before, after, dm, ...base }) => [
      row('peoples', 'race', base.id, next(), { kind: 'Original', ...base }, { title: base.name }),
      row('peoples', 'race-phase', base.id, next(), before, { title: base.name, phase: 'before' }),
      row('peoples', 'race-phase', base.id, next(), after, { title: base.name, phase: 'after' }),
      ...(dm ? [row('peoples', 'race-dm', base.id, next(), { dm }, { title: base.name, visibility: 'dm' })] : []),
    ]),
    // ---- the seat (a whole tab that appears after the fair)
    row('the-seat', 'heading', 'heading-seat', next(), { text: 'The seat', level: 2 }, { phase: 'after' }),
    row('the-seat', 'html', 'seat', next(), { html: '<p>The Moot Hall has one chair nobody may sit in. Since the fair, people have started measuring it.</p>' }, { phase: 'after' }),
    row('the-seat', 'table', 'claims', next(), { html: '<table><tr><th>Claim</th><th>Backed by</th></tr><tr><td>Find the Queen</td><td>The Reedwardens</td></tr><tr><td>Seat a maker</td><td>The Ashen Ledger</td></tr></table>' }, { phase: 'after' }),
    // ---- factions (another after-only tab)
    row('factions', 'heading', 'heading-factions', next(), { text: 'Factions', level: 2 }, { phase: 'after' }),
    row('factions', 'faction-table', 'faction-table', next(), {}, { phase: 'after' }),
    row('factions', 'faction-cards', 'faction-cards', next(), { grid: 'g2' }, { phase: 'after' }),
    ...FACTIONS.flatMap(({ key, dm, ...f }) => [
      row('factions', 'faction', key, next(), f, { title: f.n, phase: 'after' }),
      row('factions', 'faction-dm', key, next(), dm, { title: f.n, visibility: 'dm' }),
    ]),
    row('factions', 'secret', 'secret-factions', next(), { tag: 'DM only: how the factions connect', html: '<p>Both factions are being fed rumours by the same Lanternkin broker. Ideas in reserve: a third claimant from outside the valley.</p>' }, { title: 'How the factions connect', visibility: 'dm' }),
    // ---- secrets (DM-only tab)
    row('secrets', 'heading', 'heading-secrets', next(), { text: 'Secrets', level: 2 }, { visibility: 'dm' }),
    row('secrets', 'secret', 'secret-queen', next(), { tag: 'The Queen', html: '<p>She is alive, three days downriver, and does not want to be found. Odrin Vale carries her letters.</p>' }, { title: 'The Queen', visibility: 'dm' }),
    row('secrets', 'secret', 'secret-crown', next(), { tag: 'The crown', html: '<p>The Brassmother keeps the melted crown in a kiln nobody else may open.</p>' }, { title: 'The crown', visibility: 'dm' }),
    row('secrets', 'checklist', 'prep', next(), { items: [{ text: 'Print the fair map', done: false }, { text: 'Name three stallholders', done: true }] }, { title: 'Prep', visibility: 'dm' }),
    // ---- campaign
    row('campaign', 'heading', 'heading-campaign', next(), { text: 'Campaign', level: 2 }),
    row('campaign', 'plate', 'plate-opening-night', next(), { html: '<h3>Opening night</h3><p>We start at the fair gates as the lamps are lit.</p>' }, { title: 'Opening night', phase: 'before' }),
    row('campaign', 'plate', 'plate-table-rules', next(), { html: '<h3>Table rules</h3><ul><li>Phones away during scenes.</li><li>Ask before you narrate another character.</li></ul>' }, { title: 'Table rules' }),
    row('campaign', 'plate', 'plate-road-ahead', next(), { html: '<h3>The road ahead</h3><p>Sessions run every other week until the seat is filled.</p>' }, { title: 'The road ahead', phase: 'after' }),
  ],
  sessions: [
    { number: 0, title: 'Session 0: the fair', meta: 'One evening. Level 3.', summary: 'The party arrives at the fair and the Queen does not.', status: 'ready', content: { notes: 'Open on the lamps being lit. Odrin Vale is at the ferry stall all night.' } },
    { number: 1, title: 'Session 1', meta: 'Not planned yet.', summary: 'The morning after.', status: 'unplanned', content: {} },
  ],
  // pictures: one that never changes, and one with a version per stage (same key, two files)
  media: RACES.flatMap((r, i) => [
    { key: `t/${r.id}.jpg`, path: `t/${r.id}.jpg`, phase: null, content_type: 'image/jpeg', color: r.color },
    { key: `v/${r.id}.jpg`, path: `v/${r.id}_before.jpg`, phase: 'before', content_type: 'image/jpeg', color: r.color },
    { key: `v/${r.id}.jpg`, path: `v/${r.id}_after.jpg`, phase: 'after', content_type: 'image/jpeg', color: ['#444444', '#555555', '#666666'][i] },
  ]),
};

export const RACE_IDS = RACES.map((r) => r.id);
export const FACTION_SLUGS = FACTIONS.map((f) => f.key);
