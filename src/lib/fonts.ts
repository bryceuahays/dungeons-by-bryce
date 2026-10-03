// Font pairings the DM can pick when creating a campaign. The choice is stored in
// campaigns.theme, so each campaign keeps its own.
export const FONT_PAIRS = [
  {
    id: 'fell',
    label: 'IM Fell English and Spectral (old print)',
    display: '"IM Fell English","Iowan Old Style","Palatino Linotype",Georgia,serif',
    body: '"Spectral",Georgia,"Times New Roman",serif',
    href: 'https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=Spectral:ital,wght@0,400;0,600;1,400&display=swap',
  },
  {
    id: 'cinzel',
    label: 'Cinzel and Crimson Pro (carved stone)',
    display: '"Cinzel",Georgia,serif',
    body: '"Crimson Pro",Georgia,serif',
    href: 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap',
  },
  {
    id: 'grenze',
    label: 'Grenze Gotisch and Lora (gothic)',
    display: '"Grenze Gotisch",Georgia,serif',
    body: '"Lora",Georgia,serif',
    href: 'https://fonts.googleapis.com/css2?family=Grenze+Gotisch:wght@400;600&family=Lora:ital,wght@0,400;0,600;1,400&display=swap',
  },
  {
    id: 'space',
    label: 'Space Grotesk and Inter (clean, modern)',
    display: '"Space Grotesk",system-ui,sans-serif',
    body: '"Inter",system-ui,sans-serif',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Space+Grotesk:wght@400;600&display=swap',
  },
  { id: 'system', label: 'Plain serif (no web fonts)', display: 'Georgia,"Times New Roman",serif', body: 'Georgia,"Times New Roman",serif', href: '' },
];

// Only Google Fonts stylesheets are ever linked from a theme.
export const safeFontHref = (href?: string) => (href && href.startsWith('https://fonts.googleapis.com/') ? href : '');
