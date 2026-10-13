# Design system for the campaign hub

The rules every new hub page follows so that it matches the mockups in `docs/design/mockups/` and still works with every campaign theme. Read this before building or changing a screen.

## The one rule that matters most

**Never write a colour or font straight into a component.** Campaign pages wear the DM's chosen theme (`src/config/themes.ts`), and the theme's tokens become CSS variables on the `.campaign` wrapper (`src/app/c/[slug]/layout.tsx`). The mockups were drawn in one dark gold theme, but every hex value in them stands for one of those variables. Use the variable, and the page works in all seven themes, including the light Vellum theme.

Screens outside a campaign (the new-campaign steps, account pages) use the hub tokens in `src/app/globals.css` (`--h-*`) instead. The table below gives both.

## Colour tokens

The mockup column is what you see in the images. Build with the token column.

| Role | Mockup | Inside a campaign | Outside a campaign (hub) |
|---|---|---|---|
| Page background | `#121419` | `--void` | `--h-bg` |
| Header bar, tab strip | `#16181F` | `--deep` | `--h-panel` |
| Card or panel | `#1B1E26` | `--plate` | `--h-panel` |
| Raised row inside a card, secondary button | `#20232C`, `#232733` | `--plate2` | `--h-panel-2` |
| Text field background | `#16181F` | `--field` | `--h-field` |
| Border | `#2E3341` | `--line` | `--h-line` |
| Control border (inputs, secondary buttons) | `#3A4050` | `--line-strong` (new, derived) | `--h-line` |
| Main text | `#EDE7DA` | `--vellum` | `--h-text` |
| Secondary text | `#CFC8B8` | `--vellum-soft` (new, derived) | `--h-text` |
| Muted text, labels | `#A9A396` | `--dim` | `--h-dim` |
| Accent: primary buttons, current tab, "now" | `#E0AE52` | `--gold` | `--h-accent` |
| Text on the accent | `#1A1408` | `--on-gold` | `--h-bg` |
| Accent tint (selected row, "up now" banner) | `#2A2618` | `--gold-tint` (new, derived) | derive from `--h-accent` the same way |
| Good, ally, player, healthy | `#6CC4B3` | `--verd` | `--h-ok` |
| Danger, hostile, enemy, damage | `#E8957D` | `--ember` | `--h-bad` |
| Danger tint and its text | `#3A231C`, `#F5C2B3` | `--ember-tint`, `--ember-text` (new, derived) | derive from `--h-bad` |
| Ally NPC, information | `#9DB8E8` | `--star` | `--h-blue` |
| **Hidden from players (DM only)** | `#B39DDB` | `--secret` (new, see below) | not used outside campaigns |

### New tokens

These were added by hub version 2 item 2 (issue 83). They are set on `.campaign` in `src/styles/campaign.css`, each worked out from the theme's own colours, so every theme has them, a DM's custom theme included:

| Token | What it is for |
|---|---|
| `--line-strong` | Border of inputs and secondary buttons |
| `--vellum-soft` | Secondary text |
| `--gold-tint` | Background of a selected row or an "up now" banner |
| `--ember-tint`, `--ember-text` | Background and text of a danger notice |
| `--secret` | The "hidden from players" colour |
| `--secret-bg`, `--secret-line`, `--secret-text` | Background, dashed border and label text of the hidden look |

**Where `--secret` comes from.** Each of the seven themes has a `secret` colour in `src/config/themes.ts`, and `themeStyle()` puts it on the page. It is purple (`#b39ddb`), darker on the light Vellum theme (`#6b4fa0`), a little pinker on Frostbound, and amber on Abyssal, whose own accent is already purple. A custom theme has none of its own; the stylesheet then mixes purple with the theme's text colour, which comes out light on a dark theme and dark on a light one.

**The `secret` colour sits beside each theme, not inside its `colors`.** A campaign stores its own copy of its theme and the database compares that copy to the default themes exactly. Never add a colour inside `colors` without planning for every stored copy.

`tests/tokens.test.mjs` works the colours out from the real stylesheet and fails if any of them is hard to read in any theme.

## The hidden-from-players look

Anything a player cannot see yet, shown to a DM, looks the same everywhere:

- **Dashed** border in `--secret-line`, background `--secret-bg`.
- A small text label saying who can see it: "Hidden from players", "Only [player name]", or "Reveals at [stage name]". Never rely on the colour or the dashes alone.
- Planned timeline events, hidden map pins, hidden NPCs, hidden lore, hidden relationship lines and private dice rolls all use this look.

Build it with `HiddenBox` and `HiddenTag` from `src/features/hub/ui/Hidden.tsx`. Do not restyle it per page. To see it in every theme, open **Head DM > Design samples** (`/admin/design`); when a new shared piece is added to `src/features/hub/ui/`, add it to `Samples.tsx` too.

This is only a look. Whether a player receives the content is decided on the server (see `CLAUDE.md`, Hard rules, Visibility). A player's page never contains hidden content styled to be invisible.

## Type

| Use | Font | Size | Weight |
|---|---|---|---|
| Campaign name on Welcome | `var(--display)` | 46px (32px on phones) | 600 |
| Page title | `var(--display)` | 36px (28px on phones) | 600 |
| Section title | `var(--display)` | 22 to 26px | 600 |
| Card or item title | `var(--display)` | 18 to 20px | 600 |
| Body | `var(--body)` | 15px, line height 1.5 | 400 |
| Buttons, form text | `var(--body)` | 14 to 15px | 500, primary 600 |
| Meta (dates, counts) | `var(--body)` | 13px, `--dim` | 400 |
| Eyebrow label | `var(--body)` | 12 to 13px, capitals, letter spacing 0.06em, `--dim` | 600 |
| Chip | `var(--body)` | 11 to 13px | 600 |

The mockups use Spectral for display and IBM Plex Sans for body text. In the app, the theme's own font pair replaces them.

## Spacing, corners and size

- Spacing steps: 4, 6, 8, 10, 12, 16, 20, 24, 28, 32px. Gaps between cards are 20px; page side padding is 28px (16px on phones).
- Corners: pills 999px; panels 14px; cards inside panels 12px; rows and large buttons 10px; inputs and buttons 8px. If the theme sets `layout.radius`, follow it.
- **Every button, link and control is at least 44px tall**; main actions are 48px.
- Content column: sidebar 280 to 300px plus a flexible main column. Settings and setup pages cap at 1200px wide and centre.

## Components

Build each of these once, in a shared place, and reuse it.

| Component | Mockup example | Notes |
|---|---|---|
| Panel | every card on Welcome | `--plate`, 1px `--line` border, 14px corners, 18 to 24px padding |
| Raised row | "Newly revealed" items | `--plate2`, 10px corners |
| Primary button | "Publish recap" | `--gold` background, `--on-gold` text, weight 600, 48px tall |
| Secondary button | "Edit welcome section" | `--plate2`, `--line-strong` border |
| Danger button | "Delete campaign" | outline in the ember colour; only for things that cannot be undone |
| Tabs | the hub page strip | underline in `--gold` on the current page, `aria-current="page"` |
| Segmented switch | "Page editor / View as player", "Who sees my next roll" | real buttons with `aria-pressed` |
| Chips | attitude, conditions, "DM only" | small pills with a text label, never colour alone |
| Stat tile | AC, Speed, attributes | `--plate2`, label above value |
| HP bar | sidebar, initiative | 6 to 8px tall, `--verd` when healthy, `--ember` below half |
| Visibility control | `Visibility.png` | **extend the existing `VisPicker`**, do not build a second one |
| Feature switches | `FeatureToggles.png` | page row with "Customize" that opens its feature list |
| Dice roll row | sidebar "Party rolls" | private rolls use the hidden look plus "Only the DM sees this" |
| Timeline node | `Timeline.png` | filled = played, ring = next, dashed = planned (DM only) |
| Locked teaser | end of the player Lore page | dashed `--line` border, "More of this world is waiting to be discovered." |
| Modal | `Handout.png` | real dialog with `aria-modal`, a Close button, focus moved into it |

## Phones

Every page must work at 390px wide.

- The character sidebar becomes a bottom drawer (`Mobile.png`).
- The page tabs become a bottom bar with five slots: Home, two pages the DM picks, Character, and More.
- Side-by-side columns stack. Wide tables scroll inside their own box. The battle map fills the width.

## Accessibility

- Text contrast at least 4.5 to 1 (3 to 1 for text 24px and up). Check the Vellum theme, which is light.
- Real `<button>`, `<a href>`, `<label>` and `<input>` elements; icon-only buttons get `aria-label`.
- Visible focus ring: 2px `--gold` outline, 2px offset.
- Nothing is told apart by colour alone: ally, hostile, hidden and private all carry words.
