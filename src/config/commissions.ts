// The "Custom campaign site" offer: the tiers shown on /custom and in the intake form.
// Change a name, price or description here and the page follows.
//
// No imports here.

export const COMMISSION_TIERS: { id: string; name: string; price: string; what: string; placeholder?: boolean }[] = [
  { id: 'starter', name: 'Starter', price: '$70', what: 'I set up your campaign for you, with a theme customised from your own material: your colours, your fonts, your pages in place.' },
  { id: 'custom', name: 'Fully custom theme', price: 'Price to be set', what: 'A look designed from scratch for your world: palette, type, layout and hero art direction.', placeholder: true },
  { id: 'trailer', name: 'Custom theme with a campaign trailer', price: 'Price to be set', what: 'Everything in the custom theme, plus a short trailer video for your campaign home.', placeholder: true },
];

export const COMMISSION_STATUS: [string, string][] = [['new', 'New'], ['talking', 'In conversation'], ['building', 'Being built'], ['delivered', 'Delivered'], ['declined', 'Declined']];
