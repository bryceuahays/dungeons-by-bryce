# Hub redesign: mockups and design system

Version 2 of the campaign hub, drawn in October 2026. Use it as the picture of what each page should become. It is a design, not a spec: where it disagrees with how the app already works, the app's rules win (see "Words in the mockups" below).

- `design-system.md`: colours, type, spacing, components and phone rules. Read it before building any screen.
- `mockups/images/`: one picture per screen. Fonts in the pictures are stand-ins; the real fonts come from the campaign theme.
- `mockups/source/`: the source of each screen. Copy exact text, order and spacing from here. These files need the design canvas to run, so never copy them into `src/`.
- The live, clickable canvas is Bryce's (ask him for the link).

## Decisions behind the design

1. **Default pages are always in a hub:** Welcome, NPCs, Lore, Combat, Players, Secrets, the character sidebar, the timeline, Campaign settings, and People and permissions.
2. **Optional pages are switched on or off by the DM:** Map, Quest log, Party loot, Relationship web, Hub-wide search, Live session screen.
3. **Every feature inside every page can be switched off** (for example the battle map inside Combat). Switching something off hides it and keeps its content.
4. **One visibility system** for everything: who sees it (everyone, DMs only, or named players), when (now, when the DM reveals it, or from a stage), and how much (for NPCs: name, portrait, background, location). It is the existing `VisPicker` and `entry_open()`, extended.
5. **Reveals can go to one player only,** and **dice rolls can be private** (to the DM only, or to yourself).
6. **Lore setup starts with five categories** (World overview, History, Places, Factions, Religions). Ten more can be added, plus the DM's own. Each category has its own fields so entries are formatted for the Lore page.
7. **Fifth edition wording only.** No trademarked game names anywhere.

## Words in the mockups and what they mean in the app

| In the mockups | In the app |
|---|---|
| "Reveals at Session 5", "At the start of Session…" | A reveal **stage** (`campaigns.phases`) or a **story beat** (`vis = 'entry'`). Show the stage or beat name; there is no session-number reveal. |
| "Page editor / View as player" | The existing DM view and "View as player" (`setViewAsPlayer`). |
| "Secrets" page (DM only) | A new DM overview of everything hidden. Not the same as the existing "Secrets and notes" tool, which gives secrets to one player. Bryce to decide the name. |
| "Newly revealed" | The existing Reveal log tool. |
| "Timeline" | The existing Story timeline tool and `TimelineBanner`. |
| "Combat" | The existing Initiative tool, with Maps as its optional battle map. |
| Lore categories | Issue #51, Homebrew: lore organization. |

## Every screen, what exists, and what is new

| Image | Screen | Already in the app | New work |
|---|---|---|---|
| `Setup1Pages` | New campaign 1: basics, pages and features | `src/app/(hub)/new-campaign/` (two steps), `settings.tools` | Four steps; per-feature switches (`settings.features`); tone; Discord (#40) |
| `Setup2Lore` | New campaign 2: world and lore | Worlds, homebrew | Lore categories with templates (#51); import from a document (#41) |
| `Setup3Cast` | New campaign 3: NPCs, encounters, handouts | NPCs tool, Initiative tool | NPC table view; saved encounters (#61); combat settings; handout uploads |
| `Setup4Players` | New campaign 4: players, schedule, timeline | Invite links, Story timeline | Schedule and RSVP (#49); planning reveals by stage |
| `Welcome` / `WelcomeDM` | Hub home, player and DM | Campaign pages (`sections`), sessions, Reveal log | Home layout; recap card; next session and RSVP; recap drafting from notes (AI, #45, later) |
| `NPCs` | NPCs, DM view | NPCs tool | Partial reveal (name, portrait, background); filters; link to relationships |
| `Lore` | Lore, player view | Content pages | Category sections (#51); "what you've learned" for creatures |
| `CombatDM` / `CombatPlayer` | Combat | Initiative tool, Maps tool | Enemy health as a status for players; target and action buttons; auto-rolled NPC initiative |
| `Players` | Players | Party view (`PartyLive`), `Sheet5e` | Player-to-DM private note; what each player shares with the party |
| `Secrets` | DM overview of hidden things | Visibility data, stages | Reveal schedule; inbox of player notes |
| `Map` | Map (optional) | Maps tool, `map-image.ts` (hidden regions painted on the server) | Pin layers; "party is here" marker |
| `Quests` | Quest log (optional) | Nothing | New: quests, objectives (each with its own visibility), rewards |
| `Loot` | Party loot (optional) | Gear is a text box on the sheet (#54) | New: party coins, items, claiming, history |
| `Relations` | Relationship web (optional) | Nothing | New: connections between NPCs, factions and the party, each with its own visibility |
| `Handout` | Live handout arriving | Supabase Realtime (used by `PartyLive`) | New: push a handout to everyone or named players |
| `Mobile` | Phone layout | Phone rule in `CLAUDE.md` | Bottom bar and character drawer |
| `Settings` | Campaign settings | Manage page (`src/app/c/[slug]/manage/`) | Feature switches; visibility and dice defaults; archive |
| `SettingsPeople` | People and permissions | Co-DM membership in the database (`memberships.role = 'dm'`), #62 | New: co-DM screen and per-permission choices |
| `Search` | Hub-wide search (optional) | SRD browser search | New: search across one campaign, filtered on the server |
| `LiveSession` | Live session screen (optional) | Sessions and session notes | New: one screen for running the table |
| `HubTop`, `Sidebar`, `Timeline`, `Visibility`, `FeatureToggles` | Shared pieces | `CampaignChrome`, `VisPicker`, `TimelineBanner` | Header search, Go live and settings buttons; sidebar dice |

## Security notes for the new work

These come from the hard rules in `CLAUDE.md` and apply to every screen above.

- **Hidden content never reaches a player's browser.** Quests, objectives, loot, relationship lines, handouts, search results and partial NPC reveals are all filtered by the database (row-level security), not by the page.
- **Search runs on the server as the viewer,** so a player can never find a hidden thing by searching for it.
- **Dice are rolled on the server.** The browser asks for a roll; the server rolls, stores it with its privacy, and Realtime delivers it only to people allowed to read it.
- **Handouts are pushed through Realtime but read through the database,** so a player who is not named never receives the picture.
- **Co-DM permissions are checked in the database,** not only by hiding buttons. A co-DM without "See hidden content" must not receive it.
- **Enemy hit points shown as a status** are worked out on the server; players never receive the numbers.
