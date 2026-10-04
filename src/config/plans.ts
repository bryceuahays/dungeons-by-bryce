// Plans, prices and limits. This file is the one place they are set.
//
// The database keeps a copy of the limits and of the Pro-only feature list (so it can
// refuse things itself). After changing anything here, run:  npm run sync-config
// A test fails if the database copy and this file differ.
//
// No imports here: scripts and tests load this file directly.

export const PRICES = {
  pro_monthly: { cents: 700, label: '$7 a month', interval: 'month' },
  pro_yearly: { cents: 5000, label: '$50 a year', interval: 'year' },
  founder: { cents: 15000, label: '$150 once', interval: null },
} as const;

// What a free DM gets before a limit is reached.
export const FREE_LIMITS = { campaigns: 1, players: 5, homebrew: 3, maps: 1, stages: 2 } as const;

// Founder lifetime: same as Pro, for good. Excludes any future usage-priced add-ons.
export const FOUNDER = { cap: 100, on: true } as const;

// Every gated feature. `pro: true` means a free campaign does not have it.
// `what` is the sentence shown in an upgrade prompt.
export const FEATURES = {
  homebrew_full: { pro: true, name: 'The full homebrew builder', what: 'Unlimited entries, the Guided and Advanced modes, effect building blocks, packs, versions, and the edition converter.' },
  maps_plus: { pro: true, name: 'Maps without limits', what: 'As many maps as you like, hidden regions that are revealed as the story moves, pins that appear when a story beat happens, and pins your players add.' },
  timeline: { pro: true, name: 'The story timeline', what: 'A banner on every page with the beats of your story: the ones you plan, the ones that must happen, and the ones your players have reached.' },
  stages: { pro: true, name: 'Full reveal stages', what: 'As many named stages as your story needs. Pages, tabs and titles can change at each one.' },
  player_secrets: { pro: true, name: 'Per-player secrets', what: 'Blocks, NPC knowledge and notes that only the players you name can see.' },
  world: { pro: true, name: 'World state tools', what: 'The consequence log, the clue tracker, and faction clocks.' },
  themes: { pro: true, name: 'Premium themes and the theme editor', what: 'More looks to choose from, and your own colours, fonts and hero image.' },
  export: { pro: true, name: 'Export', what: 'Download a whole campaign as a file you can keep.' },
  no_footer: { pro: true, name: 'No footer', what: 'Removes the small "Made with Dungeons by Bryce" line from your campaign.' },
} as const;

export type Feature = keyof typeof FEATURES;
export type PlanId = 'free' | 'pro' | 'founder';

// What each plan lists on the pricing page.
export const PLAN_COPY: Record<PlanId, { name: string; price: string; pitch: string; points: string[] }> = {
  free: {
    name: 'Free',
    price: '$0',
    pitch: 'Run one campaign for your table. Players never pay.',
    points: [
      `${FREE_LIMITS.campaigns} campaign, up to ${FREE_LIMITS.players} players`,
      'All fifth edition SRD content, character sheets, and DM access to every sheet',
      'NPC tracker and a live initiative tracker',
      'A two-state reveal toggle, DM-only blocks, and "view as player"',
      'Session zero page and video embeds',
      `${FREE_LIMITS.homebrew} homebrew entries in Quick mode`,
      `${FREE_LIMITS.maps} map with your own pins`,
      'Default themes, with a small "Made with Dungeons by Bryce" footer',
    ],
  },
  pro: {
    name: 'Pro',
    price: `${PRICES.pro_monthly.label} or ${PRICES.pro_yearly.label}`,
    pitch: 'Everything, for as many campaigns and players as you run.',
    points: [
      'Unlimited campaigns and players',
      FEATURES.homebrew_full.name + ': unlimited entries, Guided and Advanced modes, effects, packs, versions, edition converter',
      'Unlimited maps with hidden regions, automatic reveals, beat-linked pins, and player pins',
      'The story timeline',
      'Full reveal stages and per-player secrets',
      'Consequence log, clue tracker, and faction clocks',
      'Premium themes and the theme editor',
      'Export, and no footer',
    ],
  },
  founder: {
    name: 'Founder lifetime',
    price: PRICES.founder.label,
    pitch: 'Everything in Pro, for good, for the first DMs through the door.',
    points: ['Everything in Pro, with no renewal', 'A limited number of seats', 'Does not include any future add-ons that are priced by usage'],
  },
};

// The copy the database keeps.
export const dbPlanConfig = () => ({
  limits: { ...FREE_LIMITS },
  pro_features: (Object.keys(FEATURES) as Feature[]).filter((f) => FEATURES[f].pro),
  founder: { ...FOUNDER },
});
