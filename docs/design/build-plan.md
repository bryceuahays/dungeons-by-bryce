# THE BUILD PLAN

## Ground rules for every item
- One item is one issue, one branch (feature/<issue>-short-name), one pull request. Stop after opening the pull request. Never merge or push to main. Do not deploy.
- Follow every hard rule in CLAUDE.md, above all: hidden content never reaches a player's browser; visibility is decided by the database; DM text is sanitized; fifth edition wording only.
- Build from the mockup images and docs/design/design-system.md. Use theme variables, never raw colours or fonts. Every screen must work at 390px wide and in the light Vellum theme.
- Every new page or feature sits behind its feature flag (item 1) and behind its on/off switch in campaign settings (item 3).
- Every new permission, visibility or privacy rule gets a test that signs in as a player and proves the hidden thing is absent from the page HTML, the database API and the Realtime feed.
- Extend what exists before adding anything new: VisPicker and entry_open()/entryOpen() for visibility, the entries table for table-tool content, getCampaign() for reading, the Manage page for settings, PartyLive's Realtime pattern for live updates.
- In the mockups "Session N" in a reveal means a reveal stage or a story beat. Use the app's stages and beats.
- "Draft recap from notes" in the mockups uses AI. Leave it out (it belongs to #45).
- A database migration: announce it on the issue, make sure no other migration is open, write it additively, do not apply it, and say in the pull request that Bryce must apply it.
- Run `npm run build && npm run test:local` before opening each pull request. Never run tests while someone else's migration is open.
- Finish each item by updating docs/decisions.md and docs/handoff.md.

## Groundwork
1. Feature flags (existing issue #1). Per-page flags named hub_v2_<page>, off for everyone except Bryce's account and test accounts until he turns them on. Every later item checks its flag.
2. Design tokens. Add the new variables from docs/design/design-system.md ("New tokens") to src/styles/campaign.css, and a `secret` colour to each theme in src/config/themes.ts (darker on Vellum). Add the shared look for "hidden from players": a dashed border, a tinted background and a text label. Shared files, so this is its own small pull request.
3. Page and feature switches. Today settings.tools turns whole tools on or off. Add settings.features so every feature inside a page can be switched off too, with a config list of each page's features in src/config/ (see FeatureToggles.png for the list). Add a helper next to hasTool. Default pages (Welcome, NPCs, Lore, Combat, Players, the DM overview, the character sidebar, the timeline, Campaign settings, People and permissions) cannot be switched off but their features can. Optional pages (Map, Quest log, Party loot, Relationship web, Hub-wide search, Live session screen) can be switched off. A campaign with no list keeps everything on. Switching something off hides it and keeps its content.

## Foundations
4. Visibility upgrades. One visibility system for everything. Extend VisPicker and entry_open()/entryOpen() (kept in step) so that every kind of content offers: everyone, DMs only, named players, from a stage, once a beat happens. Add partial reveals for NPCs: players can be given the name only, name and portrait, or everything, chosen per NPC. Finish #58 (named-player visibility for attached homebrew and map regions). The look follows Visibility.png. Needs a migration.
5. Dice rolling, public and private between players and the DM. Full spec in the "Dice" section below. Needs a migration.
6. Co-DM screen and permissions (existing issue #62). Full spec in the "Co-DMs" section below. Needs a migration.
7. Campaign settings page. Reorganize the Manage page to match Settings.png: Pages and features (item 3), Visibility defaults, Dice rules (item 5), People and permissions (item 6), Discord (placeholder until #40), Archive or delete. Keep every existing Manage setting.

## The hub shell
8. Header, page tabs, character sidebar and phone layout. Match HubTop.png, Sidebar.png and Mobile.png. Header: campaign name, next session, search box (shown only when item 21 is on), "Push handout" (item 20), "Go live" (item 23, only when on), settings, and the existing DM view / View as player switch. The sidebar shows the player's own sheet read from the rules engine, with tap-to-roll on attributes and skills (item 5) and the party roll log. On phones the sidebar becomes a bottom drawer and the tabs become a bottom bar (Home, two pages the DM picks, Character, More). CampaignChrome is a shared file.

## The pages, one pull request each
9. Welcome (Welcome.png, WelcomeDM.png). Banner and pitch, last session recap written by the DM, next session, newly revealed (from the Reveal log), active quests (only if item 17 is on), handouts shelf. The DM version has an edit button on each part and the list of reveals scheduled for the next stage.
10. NPCs (NPCs.png). Cards with portrait, attitude, role, what the players know, when met, and connections (only if item 19 is on). Filters and search. Uses item 4's partial reveals.
11. Lore (Lore.png) and lore categories (existing issue #51). Category sections that each look different: history as a timeline, places nested in regions, factions with leader and standing, religions with domains, a bestiary that lists only what the party has learned. Five starting categories (World overview, History, Places, Factions, Religions); ten more can be added (Peoples and cultures, Creatures and bestiary, Magic and the arcane, Items and artifacts, Languages and scripts, Calendar and holidays, Myths and legends, Rulers and politics, Trade and economy, Planes and cosmology), plus the DM's own. Each category has its own fields (Setup2Lore.png lists them).
12. Combat (CombatDM.png, CombatPlayer.png). Builds on the Initiative tool. Players see enemy health only as Healthy, Wounded, Bloodied or Down, worked out on the server; they never receive the numbers. NPC initiative is rolled automatically as a hidden DM roll. Targets and action buttons for the player whose turn it is post to the roll log. The battle map (the Maps tool) is an optional feature of this page.
13. Players (Players.png). Each character in full for its own player; other players see only what that player chooses to share. A private note to the DM and personal notes.
14. The DM overview of hidden things (Secrets.png). DM only. Everything hidden across the hub grouped by the stage it reveals at, with "Reveal now", plus the inbox of private notes from players. Call it "Reveals" (the name "Secrets" already belongs to a table tool); Bryce may rename it.
15. Timeline (Timeline.png). Restyle the Story timeline and TimelineBanner to the mockup. Planned beats are DM only.

## Optional pages, one pull request each
16. Map (Map.png). Builds on the Maps tool: pin layers, a "party is here" marker, and links from a pin to its lore entry, NPCs and quests. Hidden regions stay painted on the server by src/lib/map-image.ts.
17. Quest log (Quests.png). New: quests with a giver, place, summary, reward and objectives. Each quest and each objective has its own visibility (item 4), so a quest can show "1 objective still hidden". Tracked quests show on Welcome.
18. Party loot (Loot.png). New: party coins, items with who holds them, claiming, unidentified items, and a loot history. Coordinate with #54 (items on the sheet).
19. Relationship web (Relations.png). New: connections between NPCs, factions and the party, each with a type and its own visibility. Players see only revealed lines.
20. Handouts. Upload handouts during setup or any time; "Push handout" shows one on everyone's screen, or only named players' screens, live (Handout.png). The Realtime message carries only an id; the picture is fetched through the database, so a player who is not named never receives it.
21. Hub-wide search (Search.png). Searches one campaign's content on the server as the viewer, so a player can never find something hidden by searching for it. Results grouped by kind with the match highlighted. DMs see hidden results marked as hidden.

## Setup and the rest
22. New campaign setup in four steps (Setup1Pages.png to Setup4Players.png). Extends src/app/(hub)/new-campaign/: (1) basics, tone, and pages and features (item 3); (2) world and lore with the five starting categories (item 11); (3) NPCs, encounters, handouts and combat settings; (4) players, schedule and timeline. Everything chosen here can be changed later in Campaign settings. Discord and RSVP are placeholders until #40 and #49.
23. Live session screen (LiveSession.png). Only if Bryce confirms he wants it. Create the issue with priority Could and status Backlog.

## DICE

### Rolling
- Dice are rolled on the server, never in the browser. The browser sends what to roll; a server action rolls it with a secure random number generator and stores the result. The browser never sends a result.
- Rolls are written as dice notation: several dice and a modifier (2d6+3), several terms (1d8+1d6+2), advantage and disadvantage (2d20 keep highest or lowest). At most 100 dice and 1000 sides per roll, and at most 30 rolls a minute per person. The parser is pure code with its own tests.
- Tapping an attribute, saving throw, skill, attack or spell on the sidebar or sheet rolls it with the modifier from the rules engine.
- Each roll stores: campaign, who rolled, character, a label ("Perception"), the notation, every die, the modifier, the total, its privacy, who it is shown to, who asked for it, and when.

### Who sees a roll
A player chooses before rolling (the "Who sees my next roll" switch):
- Everyone: the whole table.
- DM only: the player and the campaign's DMs (co-DMs only with the "See private rolls" permission).
- Just me: only the player.

A DM chooses:
- Everyone.
- DMs only: a hidden roll (the DMs and permitted co-DMs).
- One or more named players: the DM and those players only (for example, a roll only that player should know about).

The DM can also ask a player for a roll ("Ask for a roll"): the DM picks the check and the privacy, and can make it a blind roll, where the player rolls but only the DM sees the result. The request appears on the player's screen with one button to roll it.

### Rules
- Privacy is enforced by row-level security on the rolls table. Realtime delivers a new roll only to people allowed to read it (use the PartyLive pattern: set the viewer's token before subscribing).
- The campaign's dice settings (Settings.png): players may roll to the DM only; players may roll just for themselves; DM rolls are hidden by default; show the dice and modifier, not only the total; checks that are always private (for example Insight).
- The roll log on the sidebar shows the latest rolls each viewer may see. Private rolls carry the hidden look and say who can see them.
- The Initiative tool rolls NPC initiative as a hidden DM roll.
- The roll log and private rolls are features that can be switched off (item 3).

### Tests (each must pass)
- Player A's "DM only" roll: player B cannot see it in the page HTML, through the database API, or on the Realtime feed. The DM can.
- A "Just me" roll: nobody but the roller can see it, the DM included.
- A blind roll: the roller cannot see its result; the DM can.
- A DM roll to one named player: other players cannot see it.
- A co-DM without "See private rolls" cannot see private rolls.
- The browser cannot store a roll with a total it chose itself.
- The rate limit refuses the 31st roll in a minute.

## CO-DMs
- The database already lets a membership be a co-DM (memberships.role = 'dm'). Add a screen to invite and remove co-DMs and choose what each may do (SettingsPeople.png).
- Permissions: See hidden content; Edit pages and content; Reveal and schedule reveals (including to one player); Run combat; Push handouts; See private rolls; Read player messages; Write session recaps; Manage players and invites; Change campaign settings.
- Presets: Full co-DM (everything, the same as a co-DM today, so existing co-DMs keep their access), Combat helper, Lore editor, and Custom.
- Permissions are checked in the database, not only by hiding buttons. A co-DM without "See hidden content" reads the campaign as a player does. Keep is_campaign_dm(campaign_id) per campaign; never add a site-wide check.
- The campaign owner always has every permission. Only the owner can delete the campaign or add or remove co-DMs.
- Tests: a co-DM without "See hidden content" cannot read hidden NPCs, lore, pins or rolls; a co-DM without "Edit pages and content" is refused when saving; removing a co-DM removes their access at once.
