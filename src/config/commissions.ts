// The custom campaign service ("Have Bryce build it"): the three tiers shown on /custom,
// whether requests are open, and the optional wait-time line. Change anything here and
// the page, the intake form and the admin view follow.
//
// No imports here: tests load this file directly.

export const COMMISSIONS = {
  open: true,          // false: the page says "not taking requests right now" and the form is switched off
  waitTime: '',        // optional, for example "Current wait: about three weeks". Empty shows nothing.
  label: 'Have Bryce build it',
};

export type Tier = {
  id: string; name: string; cents: number; proMonths: number; revisions: number; summary: string;
  theme: string; material: string; homebrew: string; maps: string; stages: string; timeline: string; trailer: string;
};

export const COMMISSION_TIERS: Tier[] = [
  {
    id: 'starter', name: 'Starter', cents: 5000, proMonths: 0, revisions: 1,
    summary: 'I set up your campaign on the site, in your colours, with your material in place.',
    theme: 'A default theme customised with your colours, fonts and hero image', material: 'Up to 10 pages of your existing material entered',
    homebrew: '', maps: '', stages: '', timeline: '', trailer: '',
  },
  {
    id: 'full', name: 'Full Build', cents: 12500, proMonths: 3, revisions: 2,
    summary: 'A look designed for your campaign, and your whole world entered and organised.',
    theme: 'A custom theme designed for your campaign', material: 'All your lore, factions and NPCs entered and organised',
    homebrew: 'Up to 10 homebrew entries built in the homebrew builder', maps: 'One map with hidden regions', stages: 'Reveal stages configured', timeline: '', trailer: '',
  },
  {
    id: 'premium', name: 'Premium', cents: 20000, proMonths: 12, revisions: 3,
    summary: 'Everything in Full Build, with more homebrew, more maps, your story timeline, and a trailer.',
    theme: 'A custom theme designed for your campaign', material: 'All your lore, factions and NPCs entered and organised',
    homebrew: 'Up to 30 homebrew entries', maps: 'Up to 3 maps with hidden regions', stages: 'Reveal stages configured', timeline: 'A timeline of your key story beats', trailer: 'A 60 to 90 second campaign trailer video for your campaign home page',
  },
];

// the rows of the comparison, in order
export const TIER_ROWS: [keyof Tier, string][] = [['theme', 'Theme'], ['material', 'Your material'], ['homebrew', 'Homebrew'], ['maps', 'Maps'], ['stages', 'Reveal stages'], ['timeline', 'Story timeline'], ['trailer', 'Trailer']];
export const tierPrice = (t: Tier) => '$' + (t.cents / 100).toFixed(t.cents % 100 ? 2 : 0);
export const revisionsText = (n: number) => `${['No', 'One', 'Two', 'Three', 'Four', 'Five'][n] ?? n} round${n === 1 ? '' : 's'} of revisions`;

export const COMMISSION_STATUS: [string, string][] = [['requested', 'Requested'], ['accepted', 'Accepted'], ['paid', 'Paid'], ['in_progress', 'In progress'], ['in_review', 'In review'], ['delivered', 'Delivered'], ['declined', 'Declined']];
