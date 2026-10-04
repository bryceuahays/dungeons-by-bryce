// The store: starting prices, the subscriber discount, and the official free pack.
// Each product's own price is set when it is published; these are the starting values
// the publish form fills in.
//
// No imports here: scripts and tests load this file directly.

export const STORE = {
  // a campaign product can be sold in two editions
  editions: {
    framework: { cents: 700, name: 'Framework edition', what: 'The structure without the story: the pages and tabs, the theme, the reveal stages, the custom resources and their rules, and labelled empty slots for your own lore, factions, NPCs, beats, maps and encounters.' },
    full: { cents: 2000, name: 'Full edition', what: 'Everything in the framework plus the whole story, ready to run: lore, factions, NPCs, DM secrets, timeline beats, maps with reveal regions, and encounters.' },
  },
  // Pro subscribers, founders and accounts with full access pay this much less for store products
  subscriberDiscount: 0.2,
  // the official free pack of the site owner's original races and classes
  originals: { slug: 'bryces-originals', name: "Bryce's Originals", pitch: 'Original peoples from my own campaigns, free for every table. Add the pack to any campaign and they appear on your players\' sheets beside the SRD.' },
} as const;

export const money = (cents: number) => (cents === 0 ? 'Free' : '$' + (cents / 100).toFixed(cents % 100 ? 2 : 0));
// what a subscriber pays
export const discounted = (cents: number, pro: boolean) => (pro && cents > 0 ? Math.max(0, Math.round(cents * (1 - STORE.subscriberDiscount))) : cents);
