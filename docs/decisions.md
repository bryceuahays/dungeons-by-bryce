# Decisions: commercial build

Choices made without asking, in the order they came up. The earlier log is `DECISIONS.md` in the repo root (items 1 to 89).

## Before Phase 0

1. **Database changes go to the live database as each phase is built.** There is one Supabase project. Every change is additive (new tables and columns), so the live site keeps working on today's code. Nothing is dropped or wiped.
2. **The code stays on the `commercial` branch and is not put live.** The live site changes only when you say to merge.
3. **Tests run against a local copy of the site** talking to the real database, with throwaway accounts that are deleted afterwards. They never use your account.
4. **The SRD content is a hand-written core set, not a download.** Downloading a file needs your explicit say-so, and the brief said not to stop and ask. `scripts/import-srd.mjs` loads the full SRD from a data folder once you approve fetching it.
5. **SRD 5.1 is the edition used.** It is the one the core set was written against. Both 5.1 and 5.2 are CC-BY-4.0.
6. **"Site admin flag" is the existing Head DM role.** No second flag was added.

## Phases 0 to 2

7. **Phases 0, 1 and 2 are one commit.** They share one database change (sources, limits and plans all touch the same rules), so they were built and tested together.
8. **Every rule that existed before is `private`,** all 435 rows of Bryce's first campaign. None is confirmed SRD wording, and seven of its classes come from other editions.
9. **Private rules can only be copied between two campaigns run by the same person.** Before, a player in Bryce's first campaign could copy its character rules into their own campaign. That is now refused.
10. **New campaigns start with the standard fifth edition sheet** (SRD plus the DM's homebrew) instead of "no character builder".
11. **"Grandfathered" means: every account that existed when this was built gets full access, and you can give full access to any account from the Head DM page.** Your friends had not made accounts yet, so there was nobody to mark. When they sign up, open Head DM, find them under Accounts, and choose "Give full access".
12. **Players in a campaign get whatever that campaign's DM has.** A feature is on or off per campaign, by the plan of the DM who owns it.
13. **On a downgrade, the DM's oldest campaign stays editable and the rest become read-only.** Everyone can still open and read them, and nothing is deleted. They unlock again on Pro.
14. **A failed payment does not cut access straight away.** The account stays on Pro while Stripe retries the card, and drops to free when Stripe gives up and cancels.
15. **Free limits are enforced by the database,** not only by the pages, so they cannot be skipped.
16. **Stripe needs no products set up in its dashboard.** Prices come from `src/config/plans.ts` and are sent with each checkout. Changing a price is a one-line change.
17. **The code refuses a live Stripe key and ignores live-mode events.** Going live is a deliberate code change, described in the handoff.
18. **Founder seats are checked when checkout starts.** If the last seats are bought at the same moment, a buyer who has already paid is still given founder access, so the count can end a seat or two over the cap rather than refusing someone who paid.
19. **Buying founder while on a Pro subscription cancels the subscription.**
20. **Invite links are `/join/CODE`.** A signed-out visitor is sent to sign up and then lands in the campaign. The old code box still works.
21. **The limit of ten campaigns per account is gone.** Free accounts get one, Pro has no limit.

## Phase 3: homebrew builder

22. **The builder is at Homebrew in the hub bar,** not inside one campaign. An entry belongs to the DM who made it and can be attached to any campaign they run.
23. **A new, general fifth edition sheet was built for every campaign except Bryce's first campaign.** The old builder and sheet are tied to that campaign's own rules, so they stay with it, untouched. Campaigns without that rule set get the standard sheet: pick race, class, subclass, background and feats, and everything else is worked out.
24. **Structured effects apply to the standard sheet only.** Bryce's first campaign sheets are not changed by homebrew entries.
25. **Quick, Guided and Advanced edit the same data,** so switching never loses anything. Quick shows the name and description. Guided walks through steps with defaults filled in. Advanced shows every field and the raw data.
26. **The balance hint compares with the SRD entries that ship with the site.** Races, feats, backgrounds and subclasses by a points total of their effects; classes by hit die, saves, spellcasting and number of features; spells by damage against SRD spells of the same level; monsters by hit points, armor class and attack bonus against SRD creatures near the same challenge; items by bonus against rarity. It always says why, and it never blocks anything.
27. **A new version is made only when you write a change note.** A plain Save updates the current version. Players whose character uses an entry see "X was updated" with your note until they tap Got it.
28. **Attaching a pack attaches the entries that are in it at that moment.** Entries added to the pack later need attaching again.
29. **A custom resource attached to a campaign appears on every character's sheet in it** as a pool with a tracker. Classes and items can also grant a resource of their own through an effect.
30. **The converter's result starts marked Private.** The brief says to save it as a normal homebrew entry, and it is one: same table, same editor, every field editable. But it is derived from a published book, so it starts with the Private box ticked, which keeps it out of anything published to the store. Untick the box to change that.
31. **Edition names in the converter avoid the trademark:** "Original and Basic rules", "Advanced rules, 1st and 2nd edition", "3rd edition and 3.5", "4th edition".
32. **Named-player visibility on attached homebrew needs Pro,** like other per-player secrets. Everyone, DM only and from-a-stage are on every plan.
33. **Pack export is a file download made in the browser** (JSON). Import is paste-the-file. Imported entries arrive as drafts.
34. **The SRD browser shows the core set.** With the full SRD loaded later, it will need search; that is noted in TODO-LATER.md.

## Phases 4 to 10: reveals, table tools, timeline, maps, world state, session zero, video

35. **Phases 4 to 10 are one commit.** NPCs, beats, maps, regions, pins, clocks, clues, consequences, the initiative tracker and the session zero page all live in one table with one visibility rule, so they were built and tested as one piece.
36. **Reveal stages are the old "phases", renamed and opened to every campaign.** Bryce's first campaign keeps its two stages and every tag it had. A block or tab can be "only in this stage" (what existed before) or "from this stage onward" (new).
37. **A stage keeps everything tagged with it when you rename or reorder it.** If you remove a stage, blocks still tagged for it are hidden from players until you retag them. Nothing is deleted.
38. **"View as" previews any player at any stage, without editing.** A player's own private notes are the one thing it cannot show, because the DM cannot read them at all.
39. **The "newly revealed" feed is off until the DM turns it on.** The DM's reveal log always records. A stage change is announced to players as "The story has moved on", never by the stage's name, because stage names can be spoilers.
40. **Table tools sit behind one "Table tools" link in the campaign's top strip.** No tabs were added to existing campaigns, so Bryce's first campaign keeps exactly the tabs it had.
41. **The timeline banner appears only once a campaign has a beat the viewer may see.** A campaign that does not use the timeline looks as it did.
42. **"It happened" is one click.** The beat becomes visible to whoever it was planned for (the table, or one player), with the date and the session number you are on. A "who sees it" control appears on the beat straight away to change that.
43. **Players can add beats that have happened, and notes on beats they can see: for the table, or private to themselves and the DM.** They cannot plan beats, address a beat to another player, or change anyone else's.
44. **An NPC has a public part and a DM part.** Name, portrait, location, faction, status and "what the players know" are public to whoever may see that NPC. Wants, relationships, secrets and the attached stat block are stored apart and never sent to players.
45. **One fight at a time per campaign.** Players always see player characters' hit points; enemy hit points only if the DM ticks "show". When a hidden creature is acting, players are told only that "something you cannot see is acting".
46. **The DM can open either kind of sheet** (the standard one, or Bryce's first campaign's own) read-only, with a switch to edit.
47. **Hidden map regions are painted over on the server.** The player's browser never receives the covered part of the picture. Each painted copy is kept so it is made once. Pictures are shrunk to 4,096 pixels on the long side when uploaded.
48. **A pin for a story beat is a pin set to "once a story beat happens".** Place it when you plan the beat; it appears for players when you mark the beat as hit.
49. **Clues and secrets in the clue tracker are always DM-only.** What players learn is revealed through NPCs, blocks, beats and pins.
50. **Anonymous means stored without identity.** A session zero line is saved with no account id and no time. A separate counter caps each member at 20 lines per campaign without linking them to what they wrote. The form asks players not to include health or medical details.
51. **Videos play through YouTube's no-cookie player or Vimeo's player.** Nothing else can be embedded. The featured video sits above the first tab.
52. **Free campaigns get:** two stages, DM-only blocks, "view as", NPCs, initiative, session zero, video, the compendium, one map with the DM's own pins, and private player notes. **Pro adds:** more stages, anything for named players, the timeline, hidden map regions, more maps, beat-linked and player pins, and world state.
53. **The Head DM's read-only view of an unhidden campaign extends to its table tools.**

## Phases 11 to 13: themes, custom sites, the store, the public face

54. **The first theme is named "Midnight and gold", not Bryce's first campaign.** It is that campaign's look, token for token (a test checks they match). But theme names are sent to every browser, and that campaign's real title is a secret from its own players until its reveal, so the preset is named for how it looks. The campaign keeps its own stored theme and looks exactly as before.
55. **Four default themes on every plan** (Slate and sea-glass, Ember and ash, Deep grove, Vellum) and three premium ones (Midnight and gold, Abyssal, Frostbound). The theme editor adds your own colours, fonts, corner style, page width, starfield and a hero image.
56. **A free account that creates a campaign with a custom look gets the default theme instead of an error.** Changing an existing campaign to a premium or custom theme on the free plan is refused. A campaign's current theme is never changed or locked by a downgrade.
57. **The raw theme box on the Manage page is gone.** The theme editor replaces it.
58. **Custom-site requests are saved and emailed to you** through the same mail service as feedback. The form has a hidden field that only scripts fill in, and a daily cap (3 per email address, 60 in all).
59. **Handing a campaign to a client makes them its owner and removes your access.** The client needs an account first (free is fine). A handed-over campaign does not count toward their free plan's one campaign and stays editable on any plan, like a bought one.
60. **A product is a frozen copy.** It is taken when you publish. Later changes to your campaign do not reach buyers until you publish again under the same store address.
61. **Publishing resets play state.** Beats marked as hit go back to planned, the session counter goes back to zero, and players' own additions (their beats, notes and pins) are left out. The reveal log, the initiative tracker and the consequence log are not part of a product.
62. **Blocks and entries that were for named players are delivered as DM-only,** because the buyer's players are different people.
63. **A bought campaign does not count toward the free plan's one campaign, is editable on any plan, and has every tool it was built with** (timeline, hidden map regions, and so on), even for a buyer on the free plan. Otherwise a free buyer could not run what they bought.
64. **Buyers get their own copies of the campaign's homebrew,** attached to their copy and fully editable. Private entries can never be in a product, because a campaign with private content cannot be published.
65. **A product priced at $0 is delivered straight away** with no payment step. Paid products go through Stripe Checkout (test mode) and are delivered when Stripe confirms the payment, once.
66. **Only the site admin can publish.** The products table has a seller and a "site cut" column so other creators can sell later. Nothing on the creator side is built.
67. **The demo is a real campaign in your account, flagged as the demo.** Signed-out visitors read it through the database's own rules for a guest: exactly the rows a player gets, of that one campaign, and nothing else. It appears in "Campaigns you run" so you can edit it like any other.
68. **The demo is an original short campaign, "The Lantern Beneath",** written for this site with a map drawn in code. It contains nothing private, so it can also be your first store product.
69. **The demo's tabs include the table tools** (NPCs, Timeline, Maps, World state, Session zero) so a visitor finds them without hunting. They are read-only.
70. **Search engines may index the public pages only:** landing, demo, pricing, store, custom sites, legal. Everything signed-in stays unindexed.
71. **The share image is drawn in code** (a glowing doorway and the tagline), so no artwork is borrowed.
72. **The landing page's second button is "See the demo"** and the third is "Sign in". "Join a campaign" is gone from it, because invite links now carry new players straight in.

## Things found and fixed along the way

73. **Deleting a campaign that had map pins linked to story beats was being blocked** by a check added in this build. Fixed, with a test. The test clean-up now fails loudly if it ever leaves a test account behind.
74. **Two form fields had a pattern that newer browsers reject** (the campaign address box). Fixed.
75. **A new character on the standard sheet started at 0 hit points.** It now starts at full.

# Follow-up build: full SRD, packs, editions, commissions

## Part 0: the full SRD

76. **The brief's instruction to import the SRD from an open dataset was taken as the go-ahead to download it.** The handoff had asked for exactly that say-so.
77. **Source: the `5e-bits/5e-srd-api` project, pinned to one commit.** It is the maintained home of the best-known structured SRD dataset, it holds only SRD content, and it has both the 2014 and the 2024 rules. Details and the licence check are in `docs/srd-import.md`. The data files are downloaded by a script and not stored in the repository.
78. **The dataset supplies the official wording; the import works out what each entry does to a sheet.** For the 2014 races and classes, the hand-written core set is used as the guide for those mechanics, so sheets behave as before with the official text.
79. **Subraces are folded into their race** (hill dwarf into Dwarf, and so on), and the 2024 lineages, legacies and ancestries are listed as traits to choose from. The sheet has no separate subrace choice.
80. **New campaigns start on the 2024 rules; every existing campaign is set to the 2014 rules**, which is what it showed before. The DM can switch to 2014, 2024 or both on the Manage page at any time. Characters keep what they chose.
81. **Conditions and rules text are two new kinds of SRD entry.** They can be read and searched but not cloned, because the homebrew builder has nine kinds and these are reference text.
82. **The 2024 data has no rules chapters yet.** The 2014 chapters are imported; for 2024 the reference text is the short entries (skills, damage types, weapon properties and mastery, languages, alignments, schools, ability scores) and conditions.
83. **The sheet no longer receives the long text of every spell.** With 300-odd spells per version that was too much for a phone. A spell's text is fetched when it is opened.
84. **The hand-written core set was replaced by the official entries:** 213 replaced in place (same ids, so nothing that used them broke), 20 removed because the official data names them differently (for example "Path of the Berserker" is "Berserker" in SRD 5.1, and "Chain mail armor" is "Chain Mail"). The lists are in `docs/srd-import-report.md`.
85. **The SRD browser is now a searchable list by version and category** that opens one entry at a time, instead of printing every entry in full.

## Parts 1 and 2: packs

86. **What counts as "my own creation" was decided by the campaign's own labels.** A race the campaign marks "Original" is in the pack. Inside it, a single trait is left out when its own note says it was adapted from a published book (for example "3e damage reduction, rescaled"). Every class is left out: twelve are from the published fifth edition rules, one is from a fifth edition book outside the SRD, six are conversions from other editions. The full list, with reasons, is in `docs/originals-report.md`.
87. **The pack uses only what a player of that campaign can already read.** Nothing held back for a later stage is in it.
88. **Each race in the pack gives +2 and +1 to abilities of the player's choice,** as the campaign does.
89. **Official packs are attached by reference, not copied.** The entries stay yours; a DM who adds the pack sees your updates. That is why they never count toward the DM's limit. A clone is the DM's own entry and does count.
90. **"Never counts" is enforced by the database:** each entry records whether the account made it or it arrived with a purchase, and an account cannot set that label itself.
91. **A paid pack is readable only by accounts that own it** (and by players of a campaign it is attached to). The listing shows the names of everything inside and one whole entry as the preview.
92. **A pack with a private entry, or with a draft entry, cannot be published.**
93. **A free pack needs no "purchase".** Every account can use it straight away; the store button simply adds it to a campaign.

## Parts 3 and 4: editions, and what a bought campaign unlocks

94. **Parts 1 to 4 share one commit,** because packs, editions and purchase rules all live in the same store code and database rules.
95. **A framework is generated as a real campaign in your account,** for you to read and edit before publishing. The generator never publishes. Each run of same-kind blocks becomes one labelled slot; table headers are kept and the rows emptied; tabs, stage tags and DM-only flags are kept; faction entries become one blank faction; race entries and the old character sheet are dropped.
96. **Tab names and per-stage titles are yours to check.** The generator keeps tab names (they are the layout) and drops per-stage titles from a framework. If a tab name gives the story away, rename it in the copy.
97. **"Make a publishable copy" was added beside the generator.** A campaign that holds private content cannot go live. The copy is the whole campaign minus the old rule set, the old character sheet, and race entries that come from published material. This is what makes a full edition of Bryce's first campaign possible at all.
98. **The campaign's own extra rules become homebrew of your own** when a copy is generated from Bryce's first campaign: a resource and one entry per tier, attached to the copy as DM only. The resource's size is a placeholder for you to set.
99. **A draft listing can exist for a campaign that cannot be published yet.** That is how the Bryce's first campaign drafts were made: the listing rows exist (framework at $7, full at $20, linked), nothing is frozen, and nothing is for sale.
100. **An upgrade goes into the copy the buyer already has.** A slot they left as it came is filled. Anything they changed is kept, and the full edition's version is added beside it, marked DM only, for them to merge. Unused placeholder NPCs, beats and clocks are removed; the real ones arrive.
101. **The upgrade price is the full edition's price minus the framework's,** worked out on the server at checkout. The subscriber discount applies on top.
102. **The subscriber discount applies to Pro, founder and full-access accounts.**
103. **Spoiler protection has two halves.** A signed-in player of the source campaign never sees the listing, the preview or the buy button (the database hides the product from them). A signed-out visitor could be one of those players, so while the source campaign has any players its listings are hidden from signed-out visitors too. Listings made from a framework or a publishable copy are protected by the campaign they were copied from.
104. **A bought campaign now follows the rule in the brief exactly:** everything delivered works on any plan and can be edited; making new things of a Pro-only kind needs Pro. Before this, a bought campaign had been treated as fully Pro.
105. **Players in a bought campaign can still add notes and pins to what is there,** since that uses what was delivered. New story beats need the DM to be on Pro.
106. **A bought campaign keeps its theme; changing to a premium or custom theme needs Pro.**

## Parts 5 and 6: the custom campaign service

107. **Why the page could not be found:** it was at `/custom`, linked from the navigation of the public pages and from one button at the very bottom of the landing page. Signed in, the landing page sends you straight to My campaigns, whose navigation had no link, so a signed-in person had no way to reach it. And none of it is on the live site yet.
108. **The service is called "Have Bryce build it" everywhere,** and the label is one config value.
109. **Reference images are collected as links,** not uploads. An open upload box on a public page invites abuse; a pasted link to a picture or a board does the same job.
110. **The example pictures are Bryce's first campaign as its players see it today** (a throwaway player account, the current stage), captioned "From one of my own campaigns" without naming it. One picture is cropped to stop above trait notes that cite published books.
111. **The price, revision rounds and Pro months are fixed on the request when it is made,** so changing the config later does not change a request already in.
112. **The payment link is for you to send.** The site can only email your own address until it has a sending domain, so "Make a payment link" shows the link with a copy button. When the client pays, the request is marked paid by itself. You can also mark it paid by hand.
113. **Delivery is one step:** it moves the campaign to the client's account and starts their Pro months that day (added to any they already have). The client needs an account first.
114. **Pro months from a commission are a date on the account,** separate from a subscription. The Plans page says when they end.
115. **"Not taking requests" hides the form and the Request buttons** and says so at the top. The tiers stay visible.

## Project board setup

116. **The commercial build went live before the board was made.** You asked for that. `main` now holds everything, so "Done" on the board means built, tested and live, and partners branch from the real site.
117. **Status was judged from the code and the tests,** not from the docs. A feature is "Done" only if every part of its line in your list is built. Where one part is missing it is "Partly done", even when the missing part is small or is yours to decide (the invite link lands on the campaign rather than the character page; faction clocks do not advance by themselves; no class is in the free originals pack).
118. **The field is called "Work type", not "Type".** GitHub reserves the name "Type" on project boards and refused it.
119. **The "showed a player something hidden" question on the bug form is a required Yes / No / Not sure choice,** not a required tick-box. A required tick-box on a GitHub form must be ticked before the form can be sent, which would mark every bug as a leak.
120. **Issues call it "Bryce's first campaign", not by its title.** The real title is hidden from that campaign's players, and partners who play in it will read the board. The repository itself still names it throughout (and holds its DM secrets), which is a separate thing for you to decide before giving a player access.
121. **Groundwork is six issues.** Feature flags, the homebrew shared core, and four folder splits (table tools, server actions, store, character sheet), one per area where features share files today. Nothing was refactored.
122. **The homebrew builder is split into four next pieces:** lore organization, race building, class building, and items on the sheet. They are not on your list, so I gave them priority Should for you to re-sort. All four wait for the shared core.
123. **"Lore organization" is my reading of what you meant:** world lore (places, factions, gods, history, people) as a new kind of homebrew entry that can be linked, attached to a campaign and revealed in stages. Correct the issue before anyone starts it.
124. **A feature that waits on groundwork is in Backlog even when part of it exists,** following your rule that blocked work stays in Backlog until the groundwork merges.
125. **Thirteen issues come from `TODO-LATER.md`,** each with priority Could. Items in that file that are already done are ticked, not removed.
126. **Business tasks that are Must start in "Ready",** the Should one in "Backlog".
127. **Full campaign export is listed as not started, and the site currently advertises it.** The plan config marks export as a Pro feature and the pricing page lists "Export" under Pro, but there is no export yet, and your list says it should be on every plan. No code was changed in this run, so the pricing page still says it.
128. **The scripts that created the board are not in the repository.** Only the templates, `CLAUDE.md` and the docs were allowed to change.
129. **New code is proposed to live in `src/features/<area>/<feature>/`.** That folder does not exist yet; the groundwork issues create it.

## Removing Bryce's first campaign

130. **The campaign is gone from the site and the code, on your instruction.** Everything in it was first copied into a private archive on your computer, outside the repository, and checked against the database.
131. **Your five original races were not touched.** They were already homebrew entries of your own, in the free originals pack, separate from the campaign.
132. **The sheet, character builder and session run sheet that only that campaign used were removed.** Every campaign now uses the standard sheet. A session is its details and your planning notes.
133. **The old database tables stay, empty** (`rules`, `character_private`). Dropping a table is not something to do in passing; nothing in the app reads them.
134. **The tests run against a made-up dummy campaign** ("The Harvest Fair", which becomes "The Hollow Crown" at its second stage). It is in your account, it is not secret, and it is in the repository in full (`tests/fixtures/dummy-campaign.mjs`). You will see it in your campaign list.
135. **Race entries on a lore page use general headings now:** "History", "Now" and "Their part in the story", and an "Upgrade" line only when one is written.
136. **The example pictures on the custom-site page come from the public demo campaign.**
137. **The original build notes (`BRIEF.md`, `DECISIONS.md`, `REPORT.md`, `PHASE-REPORT.md`) were moved to your private archive,** because they are mostly about that campaign. The remaining documents call it "Bryce's first campaign".
138. **The option to copy another campaign's character rules when creating a campaign was removed,** since there are no such rules left to copy.
139. **The script that built the free originals pack from the campaign is gone.** The pack stays as it is and is edited by hand under Homebrew.
140. **Old versions on GitHub still contain the campaign.** You chose not to rewrite the history. Anyone who already has a copy of the repository still has it.

## Worlds, the two-step new campaign, character moves, and the plan switch (10 October 2026)

141. **A campaign's system is its rules setting.** The three choices are the 2014 rules, the 2024 rules, or both. Nothing new is stored: it is the same setting the Manage page already had.
142. **A new campaign must be in a world; existing ones without a world are left as they are.** The form requires it. The database does not, because the demo, the test campaign and older campaigns have none.
143. **The ready-made world stays in the world dropdown,** marked "(ready-made)", so its "Start a campaign in this world" button keeps working.
144. **The two steps are one page with a Next and a Back button,** not two addresses, so nothing typed on the first is lost on the second.
145. **Step one has name, description, web address, world, system and genres. Step two has the tools, the look, homebrew packs and paste-your-campaign,** which you asked to keep.
146. **A world no longer sets its campaigns' rules.** Each campaign has its own system. Putting a campaign in a world, or saving the world, no longer changes the campaign's rules.
147. **Tools are a list on the campaign.** A campaign made before this has no list and keeps all nine. The DM can change the list under Manage, Table tools. A tool that is switched off is hidden, not deleted.
148. **A character carries its system.** In a campaign it has that campaign's system; outside one it keeps the system it had. The Characters page offers only campaigns you are in or run that use the same system, and the database refuses anything else.
149. **"No campaign" is one of the choices when moving a character,** which is how a character comes to have none.
150. **Deleting a campaign still deletes its characters,** as before. I did not change that.
151. **Plan limits are switched off with one setting,** `ENFORCE_PLANS` in `src/config/plans.ts`. The limits, the Pro-only list and every plan text are untouched. With it off the database answers "yes" to every limit check, so nothing is refused, on any page, including Homebrew and the store, without those pages being edited.
152. **What the switch does not change:** the Plans page still says which plan an account is really on, the subscriber discount in the store still needs a real subscription, and the "Made with Dungeons by Bryce" footer still shows on campaigns whose DM is not really on Pro.
153. **Upgrade prompts no longer appear,** because they only ever appeared in place of something that was blocked.
154. **Test accounts always have limits applied** (a flag on the account), so the limits stay tested while they are off for everyone else.
155. **No "Pro" tags on the tool choices in the new form,** since nothing is held back right now.
156. **A character can be created outside any campaign,** from My characters: choose its system and the step-by-step creator opens. Its creator and sheet live at their own address, wear the default campaign look, and only its owner can open them.
157. **Outside a campaign a character is offered the SRD for its system and its owner's own homebrew** (every entry they have made, drafts included, since it is their own). Homebrew that belongs to someone else's campaign comes with that campaign.
158. **A character that uses your homebrew keeps the choice when it is added to a campaign,** but the campaign's sheet only knows the homebrew attached to that campaign. If the entry is not attached there, the sheet shows that choice as missing until the DM adds it.

## Hub redesign: mockups and design system (13 October 2026)

159. **The version 2 hub mockups live in `docs/design/`,** as pictures and as source, with a design system that maps every mockup colour onto the existing theme variables. Nothing in the app changed.
160. **The mockups' colours stand for theme tokens.** New screens use the campaign theme's variables (or the hub's `--h-*` variables outside a campaign) so they work in every theme, including Vellum.
161. **A new `--secret` colour marks things hidden from players** (dashed border plus a text label). It is to be added to `src/styles/campaign.css` in its own small pull request.
162. **"Reveals at Session N" in the mockups means a reveal stage or a story beat.** The app's existing reveal model is kept; there is no session-number reveal.
163. **The mockup's game system menu said a trademarked name.** It was changed to the fifth edition rule choices the app already has.

## Hub version 2: the planning session (13 October 2026)

164. **The build plan is saved word for word as `docs/design/build-plan.md`.** The only additions are Markdown heading marks (`#`, `##`, `###`) on its section titles so it reads properly on GitHub. No words were changed.
165. **Twenty new issues, #83 to #102, one per item.** Items 1, 6 and 11 use the issues that already existed (#1, #62, #51): the plan's details were added to each as a comment, and nothing in the original text was changed.
166. **Each issue's title starts "Hub v2 item N"** so the build order is visible on the board.
167. **Priorities are a first guess for you to re-sort:** items 1 to 8 (groundwork, foundations and the shell) are Must, the default pages 9 to 15 are Should, the optional pages and setup 16 to 22 are Could. Item 23 is Could and Backlog, as the plan says.
168. **Status:** items 1, 2 and 3 are Ready, because nothing has to merge before them. Everything else is Backlog with a "Waits for" list.
169. **"Waits for" was worked out from the plan's own cross-references,** plus one rule: a page waits for the shell (item 8), and anything with hidden content waits for visibility (item 4). Items 4, 5 and 6 are chained because only one migration may be open at a time.
170. **Feature flag names follow `hub_v2_<page>`,** one per item, listed in each issue. Item 2 (design tokens) has no flag: it changes shared styles and must leave existing pages looking the same.
171. **New hub code is planned under `src/features/hub/<page>/`,** with dice in `src/features/dice/`, following the folder rule in `CLAUDE.md`.
172. **Related issues got a comment, not a duplicate:** #61 (saved fights), #49 (scheduling), #40 (Discord) and #58 (named-player visibility, which item 4 finishes).
173. **The "Draft recap from notes" button in the mockups is left out,** as the plan says. It belongs to #45.
174. **#51 was "Homebrew: lore organization" and is now also the Lore page (item 11).** Its older text describes lore as a kind of homebrew entry; the plan describes lore as campaign content in categories. The plan is the newer one, and whoever builds item 11 should settle the wording first.
175. **Alec's game systems are not in the mockups.** The sidebar and sheet in the design show the six standard abilities. Item 8 reads the sheet from the rules engine, so a campaign on a custom system should show its own abilities and trackers; the issue says so.

## Hub version 2, item 1: feature flags (13 October 2026)

176. **A flag is a line in a config file,** `src/config/flags.ts`, not a setting in the database. The plan says item 1 needs no database change, and a file means a flag cannot be flipped by accident on the live site. To turn one on for everyone, you ask for it: `on: true` and the date are set, and it is merged and deployed.
177. **All 21 flags are listed now,** one per item 3 to 23. Items 1 (the flags themselves) and 2 (design tokens) have none. Listing them up front means no later item has to edit the flags file, which several people would otherwise change at once.
178. **"Bryce's account" means the Head DM account.** A flag that is off is on for the Head DM everywhere, including the live site, so you can try an unfinished page there.
179. **"Test accounts" are recognised by a mark only the server can set,** not by their email address. Sign-up needs no email confirmation, so anyone could have signed up with an address that looks like a test account's. The mark is the same one the plan-limits switch already uses (`profiles.always_enforce`), which an account cannot change on itself. A test proves that.
180. **A test that needs an ordinary person** makes the account with `makeUser(label, { unblocked: true })`, the option that already existed for standing in for a real free account.
181. **Flags are also all on in `npm run dev` and on Vercel preview deployments,** so a partner sees what they are building on their own machine, and you see it on a preview. The built site that the tests and the live site run goes by the account.
182. **A flagged-off page answers "not found",** and the check happens on the server. A test fails if a client component imports the flag rule, so the decision cannot drift into the browser.
183. **No page uses a flag yet,** so the server helpers (`flag`, `requireFlag`, `myFlags`) are not exercised by a page test in this item. The rule they apply is fully tested, and item 3 is the first to put a real page behind one.
184. **Not built at first: a screen for you to flip flags yourself.** You asked for it the same day; see the next section.

## Hub version 2, item 1, second part: flags you switch yourself (13 October 2026)

185. **Which flags are on is now kept in the database,** in a small new table, `feature_flags`. This replaces decision 176: you asked to flip them from a screen, and a screen cannot change a file. The list of flags (names, what each is for, its issue) stays in `src/config/flags.ts`.
186. **The screen is Head DM > Feature flags** (`/admin/flags`). Each flag shows what it is, a link to its issue, and whether it is hidden or on for everyone. Turning one on asks "Everyone will see this. Turn it on?" first; hiding it again does not ask.
187. **A switch takes effect at once.** No merge and no deploy. Hiding a flag again takes the piece away from everyone but you and keeps whatever people made with it.
188. **Everyone can read which flags are on; only you can read the ones that are off, and only you can change any.** The database enforces this, not the screen. A test signs in as an ordinary account, as a test account and as a signed-out visitor and proves each can read only the "on" rows and can change nothing.
189. **The screen cannot tell you whether a piece has been built yet.** A switch for a piece that is not built and live has nothing to show. The issue link is where to check. I chose this over adding a "built" mark to the list, because every later item would then have to edit the shared list file.
190. **If the table cannot be read, nothing counts as switched on.** An unfinished piece stays hidden rather than showing. This also means the code can go live before the migration is applied: the screen then says the switches cannot be saved yet.
191. **`on: true` in the config file still works** and fixes a flag on whatever the screen says. It is kept only as the last step before a finished flag is removed.
192. **Tests never flip a real flag.** They add rows named `zz_test_…`, which are not on the list, so nothing on the live site changes while they run.
193. **The table is not sent over Realtime.** Pages read it on each request, which is quick enough for a switch that changes a few times a year.
194. **The Head DM page gained one link** ("Feature flags", next to "Store and custom site requests"). Nothing else on it changed.

## Hub version 2, item 2: design tokens and the hidden look (13 October 2026)

195. **The `secret` colour sits beside each theme, not inside its colours.** The plan says to add it "to each theme". A campaign stores its own copy of its theme, and the database compares that copy to the default themes exactly to decide what a free campaign may use. A new colour inside the theme would have stopped every existing campaign matching its theme and would have needed the database's copy changed too. Beside the theme, nothing stored changes.
196. **The hidden colour is purple, with three exceptions.** Vellum gets a darker purple (it is a light theme). Abyssal gets amber, because its own accent is already purple and "hidden" would have looked like "selected". Frostbound gets a slightly pinker purple, to stand apart from its pale blue links. Say if you would rather have different colours; each is one value.
197. **A custom theme (the Pro theme editor) gets a hidden colour worked out for it,** by mixing purple with the theme's text colour. That is light on a dark theme and dark on a light one, so it stays readable. It cannot promise to differ from a custom accent, which is one reason the look always has its dashes and its words.
198. **The five other new colours are worked out from each theme's own colours,** exactly as the design system wrote them, so there is nothing to choose per theme and custom themes get them too.
199. **The hidden look is two pieces:** a dashed, tinted box with its label, and the label on its own for a card that already has a frame. The label defaults to "Hidden from players" and cannot be left empty.
200. **Not built here: the purple "Reveal now" button and the editing banner** from the mockups. They belong to the pages that use them (items 4 and 14).
201. **A Head DM only "Design samples" page was added** (Head DM > Design samples). The issue did not ask for it. No campaign page uses the new look yet, so without it there was nothing to look at and no way to check all seven themes. It shows made-up words only.
202. **Two files outside the issue's list were changed, both announced on the issue:** `src/lib/theme-style.ts` (two lines, so the colour reaches the page) and the Head DM page (one link).
203. **Existing pages look the same.** The change only adds variables and new class names that nothing used before. The demo campaign page was compared with the live site, wide and at phone width, and matched pixel for pixel.
204. **A test works out every new colour from the real stylesheet and checks it can be read** (contrast of at least 4.5 to 1 for text) in all seven themes, and again for each as if it were a custom theme.

## Hub version 2, item 3: page and feature switches (13 October 2026)

205. **The campaign stores what is switched off, not what is on:** `settings.features = { off: [...] }`. The table tools store what is on, but with that shape a feature added later would start switched off in every campaign that had ever saved. Storing what is off gives the plan's rule ("a campaign with no list keeps everything on") and means a new feature starts on everywhere.
206. **The list has the mockup's names, in its order,** taken from `FeatureToggles.dc.html`. A test reads that file and fails if the list drifts from it. The one difference: the page the mockup calls "Secrets" is "Reveals", as the plan says, because Secrets is already a table tool.
207. **Existing campaigns have everything on,** including the two features and two pages the mockup draws switched off (Battle map, In-world dates, Relationship web, Live session screen). The mockup shows a new campaign; the plan's rule covers existing ones. The list marks those four as "starts off" for new campaign setup (item 22) to use.
208. **A feature that shows something from another page goes with that page.** With the Quest log switched off, "Active quests" on Welcome is off too; with the Relationship web off, "Connections" on NPCs is off. The form says so.
209. **Switching an optional page off keeps its own feature choices,** so switching it back on restores them as they were.
210. **The switches do nothing visible yet.** None of the sixteen pages is built. This item is the list, where the choices are kept, the form, and the two helpers (`hasPage`, `hasFeature`) every later page calls.
211. **A DM is only shown the switches of pages whose own flag is on for them.** Once you release this form, other DMs will see a page's switches when you release that page, not sixteen switches for pages that do not exist yet. You see all sixteen, and the form tells you why.
212. **Page switches and table tool switches are separate for now.** Switching the Map page off does not switch off the Maps tool, and the other way round. Each hub page that replaces a tool (NPCs, Combat, Timeline, Map) decides how to join them when it is built, and item 7 puts both under one Campaign settings page.
213. **Some features in the mockup's list are odd to switch off** ("Initiative tracker" on Combat, "Archive campaign" on Campaign settings). They are in the list as drawn. Say if any should not have a switch.
214. **The save action lives in the feature's own folder,** so the shared campaign actions file named in the issue was not changed. The shared files that did change: one line in `src/config/tools.ts` and two lines in the Manage page.
215. **The tick boxes are drawn from the theme** rather than left to the browser, because the browser's empty box is dark on the light Vellum theme and looked ticked.
216. **Saving is one button for the whole form,** like the table tools, not a save on every click.

## Hub version 2, item 4: visibility and NPC partial reveals (13 October 2026)

217. **Most of the five choices already existed.** Everyone, DM only, named players, from a stage and once a beat happens were all in the database and the picker. What was missing: each tool offered a different few of them, "who" and "when" could not be combined, an NPC was all or nothing, hidden map areas could not be opened for named players, and homebrew attached to a campaign had no "once a beat happens".
218. **Combining who and when is two new stored values, not a new reading of old ones:** `players_stage` and `players_entry`. The mockup shows "Only one player, starting Session 5", which needs both at once. Reading the old values differently could have hidden things players see today, because old rows can carry a leftover stage or player list from an earlier choice. New names leave every existing answer exactly as it was.
219. **"Session N" in the mockup is a stage or a story beat,** as the plan says. The dialog offers "From a stage onward" and "Once a story beat happens".
220. **"When I reveal it" is stored as DM only, keeping the names.** Nobody gets it until you change the answer. If players were named, the dialog remembers them, so revealing later is one step (and item 14's "Reveal now" can use it). "Every player, when I reveal it" is the same thing as "Only DMs", and reopens that way.
221. **The dialog will not save an answer with a hole in it.** "Only some players" with nobody ticked, or "from a stage" with no stage chosen, says what is missing and keeps Apply switched off.
222. **NPC partial reveals are three levels, per NPC, as the plan says:** everything, name and portrait, name only. The mockup's four tick boxes (name, portrait, background, where they are) would allow combinations the plan does not ask for. The level applies to whichever players can see the NPC at all; who that is stays the ordinary "who sees it" choice.
223. **What is held back is moved off the NPC's own row,** into the DM-only notes. A player's login can read every field of a row it is allowed to see, so hiding fields on the page would not have been enough. With "name only" the row a player can read holds the name and nothing else.
224. **The database enforces it.** A partly shown NPC may carry only its name and, at "name and portrait", its picture; the database refuses anything else on that row. Any field added to NPCs later is held back by default.
225. **Status counts as a detail.** "Hostile" or "dead" gives things away, so with name only or name and portrait players do not get it.
226. **A held-back portrait is still served to the DM,** and to nobody else: the picture route looks in the DM-only notes when the NPC's own row has no picture, and the database gives those notes to the DM alone.
227. **The new dialog is behind its flag; the database change is not.** The two new values, the NPC guard and "once a beat happens" for attached homebrew apply to everyone as soon as the migration runs, but nothing uses them until a DM has the new dialog. The "view as player" fix is not behind the flag: it corrects a preview that was wrong.
228. **An NPC keeps its reveal level if the flag is later turned off.** The NPC tool always puts held-back details back together for the DM and always splits them again on save, whether or not the new choice is offered.
229. **Pickers a DM uses get every choice; the few that are not a DM's do not.** A beat being logged as it happens offers no "DM only", so it keeps its short list.
230. **The dialog is drawn at the end of the themed page,** not where the button is, because the button often sits inside a paragraph, where a dialog is not allowed. It still wears the campaign's theme.
231. **Page blocks are not part of this.** They store visibility differently (DM only, hidden, a stage, named players) and have their own controls. The new hub pages are built on entries, which is what this item covers. Say if you want blocks to get "once a beat happens" too; it would need its own database change.
232. **A copy of a campaign made for the store** treats the two new values like named players: the buyer has none of your players, so those things become DM only. Attached homebrew that waits for a beat also becomes DM only in a copy, because the copy does not carry which beat.
233. **Outside a campaign there is no "hidden" colour,** so the dialog on the homebrew page uses the standard purple with the hub's own colours for everything else.
234. **Files changed beyond the issue's list,** each announced on the issue: the tool page (tells the picker the flag is on and which beats exist), the picture route, the store copy, and three homebrew files so attached homebrew gets the same dialog.
235. **This finishes #58** (named players for attached homebrew and map regions). Attaching homebrew already offered named players; the map region and the preview were the missing parts.

## Hub version 2, item 5: dice (13 October 2026)

236. **The dice live on their own page for now,** Table tools > Dice. The plan puts them on the sidebar, which is item 8. The page is built from the pieces the sidebar will reuse.
237. **Rolling goes through a server route, not a server action.** The plan says "a server action rolls it". A route does the same job on the server, and the automated tests can call it exactly as the page does, which they cannot do with an action. A request from another website is refused.
238. **A browser can read rolls and can write none.** The server rolls with a secure random number generator and stores the result with the service role. Whatever a browser sends as a total, dice, name or owner is ignored.
239. **A roll is stored as two rows,** the roll (who, label, total, who sees it) and its details (the dice and modifier). The setting "show the roll and modifier, not just the total" then really holds: with it off, another person's dice are not theirs to read, by page or by API. The roller and the DM always see them.
240. **"Just me" means just the roller.** The DM cannot read it, and neither can the Head DM.
241. **A blind roll is stored as DM only with a mark that the roller may not read it.** The player is told the roll happened and nothing else.
242. **Tap to roll takes its modifier from the rules engine on the server.** The page hands the browser each check sealed with a signature; the browser can ask for that check to be rolled but cannot change the number, use another player's, or make one up. A sealed check lasts 12 hours, so a change to the sheet shows after the page is reloaded.
243. **Tap to roll covers attributes, saving throws, skills and initiative.** Attacks and spells are left for the sheet (item 8): the rules engine does not work out attack bonuses yet.
244. **The Initiative tool is not changed here.** Rolling NPC initiative as a hidden DM roll is left for the Combat page (item 12), which builds on that tool. The server side it needs (a DM's hidden roll) is in place.
245. **The limit of 30 rolls a minute is held by the database,** so it applies however a roll is stored.
246. **Co-DM permissions start here, one item early.** The dice spec needs "a co-DM without See private rolls cannot see private rolls" to be true, so this item adds where permissions are kept (empty means everything, so every co-DM today keeps full access) and uses one of them. There is no screen for it yet; that is item 6.
247. **An always-private check is matched by its label.** A player's roll labelled "Insight" goes to the DM only when Insight is on the campaign's list, whether it was tapped or typed.
248. **The DM's choices are Everyone, DMs only and named players,** as the plan lists them. A player cannot address a roll to another player.
249. **"Private rolls" switched off (item 3) applies to players.** They then roll in the open. The DM can still roll hidden.
250. **With the roll log switched off, no rolls are sent to the page at all,** not just hidden. A player still sees the result of their own roll as they make it.
251. **The dice rules sit at the bottom of the Dice page for now.** Item 7 moves them into Campaign settings.
252. **Rolls are never deleted by the site.** There is no "clear the log" yet; the log shows the latest 40.

## Hub version 2, item 6: co-DMs and permissions (13 October 2026)

253. **Nearly every access rule in the database goes through two helpers,** "may read everything" and "may change things". Those two now ask about a permission (see hidden content; edit pages and content). That is why ten permissions did not mean rewriting eighty rules: thirteen rules and five functions were re-pointed, and two checks were added.
254. **For an owner, and for every co-DM that exists today, nothing changes.** A co-DM with no list stored has everything. The new rules only bite on a co-DM you have given a shorter list.
255. **Edit, reveal and settings need "See hidden content".** A DM's "change" rules in the database also let that DM read the rows they cover, so someone allowed to edit a page could otherwise read its hidden half that way. It also makes sense at the table: you cannot safely edit a page whose hidden parts you cannot see. The screen ticks "See hidden content" for you when you tick one of the three, and the database drops them if it is missing.
256. **Run combat and manage players do not need it.** A combat helper gets the fight, including its hidden half (hidden creatures, enemy hit points), and nothing else hidden. Someone who manages players gets invites, the member list and removing a player.
257. **A co-DM without "See hidden content" is treated as a player by every page.** The database gives them a player's rows; the pages give them a player's view, with the Initiative tool's DM side added for a combat helper.
258. **The presets:** Full co-DM is everything. Combat helper is run combat and see private rolls. Lore editor is see hidden content, edit, and write session recaps. The mockup shows a "Combat helper, customized" with more ticked; these are my reading of the plain versions. Say if you want them different; each is one line.
259. **Full co-DM stores nothing rather than ten yeses,** so it also covers permissions added later.
260. **Editing and revealing are told apart column by column.** Changing who sees an entry (or whether a story beat has happened) is revealing; changing its words is editing. Changing the campaign's stage is revealing; changing anything else about the campaign is a setting.
261. **Three permissions are stored and shown but govern nothing yet:** push handouts (item 20), read player messages (item 14) and write session recaps (item 9). The screen says so next to each.
262. **Only the owner chooses co-DMs,** through one database function. A co-DM can remove a player if they manage players, and can never remove another co-DM. This is a change for existing co-DMs, who could remove anyone.
263. **A hole is closed.** Any co-DM could have written their own id into the campaign's "owner" field through the database and taken the campaign. No screen offered it, but the database allowed it. Now only the owner, or the site's own transfer and delivery functions, can change who owns a campaign.
264. **A new co-DM is invited as a player first, then made a co-DM.** The plan says "invite and remove co-DMs" and the mockup has "Invite a co-DM" and "Invite by Discord username". A co-DM invite code would need invites to carry a role and the join step to honour it; that is left out here to keep the database change to permissions. Say if you want it.
265. **The screen is on the Manage page for now,** for the owner only. Item 7 moves it into Campaign settings.
266. **The mockup's table has columns for You, the co-DM and Players.** The screen is a list of tick boxes per co-DM instead: your column is always all yes and the players' column always all no.
267. **A combat helper cannot add the party to a fight from a list,** because they cannot read other players' sheets. They can add combatants by name. The Combat page (item 12) is the place to improve this.
268. **A co-DM who sees hidden content but cannot edit still sees the DM's edit controls in the table tools;** saving is refused with "You are not allowed to change that." The page editor and the Manage page say what they may do. Hiding every control is left for the pages that replace those tools.

## New campaign: a world is optional (14 October 2026)

269. **A new campaign no longer has to be in a world.** This reverses decision 142. You asked for it: a one-off campaign should not need a world made first. The form offers "No world" first; a campaign without one stands alone and gets no world homebrew, and can be put in a world later from that world's page. Choosing a world works as before. The database never required a world, so nothing there changes.
270. **A campaign made without a world opens itself when it is made** (or its Manage page, if text was pasted in). One made in a world still goes back to that world, where it now appears in the list.

## Hub version 2, item 7: Campaign settings (14 October 2026)

271. **Every part of the old Manage page is written once and placed in both layouts.** With the flag, the parts are grouped as Campaign settings; without it, they are drawn in the old order. A test checks every old heading is in both, and that the old layout keeps its order.
272. **Where the old parts went.** The mockup's General section is the campaign's own details, so it holds the title and tagline, rules, theme, background picture, featured video, tabs, paste pages, table tools and preview. Reveal stages went under Visibility defaults, because a stage is when things become visible. Invite codes and members went under People and permissions. Deleting went under Archive or delete.
273. **Visibility defaults work, not just show.** "New content starts as" sets how a new NPC (and anything else made with an empty choice) starts. "When an NPC is revealed, players see" sets a new NPC's reveal level. "Allow reveals to only some players" switched off takes "Only some players" out of the pickers; anything already set that way keeps it. Each new hub page that makes content should start from these too.
274. **A campaign with no visibility defaults behaves as campaigns always have:** new content hidden, a new NPC showing everything once revealed, and reveals to only some players offered. The mockup shows "Name and portrait" chosen; I kept today's behaviour as the starting point so nothing changes until you choose.
275. **"Post scheduled reveals to Discord" is shown switched off and cannot be turned on** until Discord exists (#40). The Discord section says it is not built.
276. **Archiving is not built.** There is no archived state for a campaign yet, so the section says so and keeps Delete. Say if you want archiving; it needs its own change.
277. **The parts that draw their own heading** (Pages and features, People and permissions, the dice rules) leave it out inside a section, so a heading is not shown twice.
278. **The store test that opens a bought campaign's Manage page** now accepts either layout, because the test account it uses has the flag.

## Hub version 2, item 8: the hub frame (15 October 2026)

279. **The new frame replaces the old header only behind its flag.** The campaign layout draws either the new frame or the old header, never both, so turning the flag off puts every campaign back exactly as it was.
280. **The tabs are the campaign's own tabs for now,** plus Table tools and Dice. The mockup's tabs (Welcome, NPCs, Lore and so on) are pages that are not built yet; each takes its place in the row when it is.
281. **The header keeps the words the old one had** ("Edit this page", "View as player", "Manage", "Hide DM secrets"). The mockup says "Page editor"; keeping the old words means nothing a DM knows moves, and the existing tests that check them still mean what they meant.
282. **Left out until their pieces exist:** the search box (item 21), Push handout (item 20), Go live (item 23) and Message DM (item 14). "Next up" shows the campaign's current session number; the DM's name is left out because players cannot read the owner's profile.
283. **The sidebar fetches its own data after the page has loaded,** from a new server route. Working out a character needs the rules (the whole SRD), and doing that before every page would slow every page. It holds only what the viewer may read: a player's own characters, a DM's whole campaign, and the rolls the database lets them see.
284. **Tap to roll is on the sidebar, not the full sheet.** The sheet (`Sheet5e.tsx`) is not changed. Attacks and spells are left out because the rules engine does not work out attack bonuses yet, and conditions because the sheet does not keep them yet (the "Conditions" switch governs nothing for now).
285. **A DM rolling from a player's sheet rolls as the DM,** with that character's modifier, and the roll follows the DM's choices (everyone or DMs only).
286. **On screens up to 960px wide the tabs become the bottom bar and the sidebar a drawer** (the mockup shows a phone; small tablets get the same so nothing is squeezed). Every tab, Table tools, Dice, Manage and the way back to all campaigns are under More.
287. **The phone bar's two pages are a new campaign setting,** chosen on Manage ("Phone bar"). A campaign with none gets its second and third tabs. A player who cannot see a chosen tab (a DM-only one) gets the next tab instead.
288. **The Head DM looking into someone else's campaign gets the frame without the sidebar,** since they have no character there and do not roll.
289. **Reveals can wait for a session (issue 117), replacing decision 162.** Bryce found stages confusing for small reveals. A trigger is a short key (`session:4:started`, `session:4:played`, `beat:<id>`, `chapter:<id>`) checked by one database function, `reveal_met()`, with its twin in code. Entries store it as two new values, `when` and `players_when`, with the key where the stage goes (`vis_stage`), so every rule that already passes the stage along needed no change. Page blocks get a column of their own, `reveal_when`.
290. **"Started" means under way or played.** Sessions gain the status "Under way" (`running`). A session marked played without ever being started still reveals what waited for its start.
291. **The rule is live, not one-shot.** Moving a session back hides again what it revealed, as rolling back a chapter does. Nothing is rewritten when a trigger happens; only the reveal log line is written.
292. **Stages are called chapters on screen.** Nothing stored is renamed. Chapters are for the big turning points; smaller reveals use a trigger on the thing itself.
293. **A page block has one switch: "players can see this".** Turning it on reveals the block now and clears whatever it was waiting for; turning it off hides it and leaves nothing waiting. When it is off, "Reveal it automatically?" offers a session starting or being played, a story beat, or a chapter. A block shown only during one chapter (the old "Only: X") keeps its old control.
294. **"Start session" and "Mark played" are one step each,** on the session page, and say first how many things they will reveal. Fight-end and other in-session triggers are issue 118.
295. **The Reveals page is called Reveals** (Bryce, item 14). "Secrets" stays the table tool's name.
296. **The "From your players" inbox waits for player messages,** its own item (issue 120): players have no way to message the DM yet. The page's switch for it is kept, so nothing changes for campaigns when it arrives.
297. **"Hidden" on the Reveals page** means some player who may one day see it cannot see it yet: DM only, waiting for a session, chapter or story beat, kept out of the feed, or a hidden page block. Already out for the players it names is not hidden. DM-only page blocks are the DM's notes, not secrets, and are left out, as are story beats (the timeline's), fights, the log and players' notes.
298. **Groups go sessions first, then chapters, then story beats, then Unscheduled.** A chapter, beat or trigger that can no longer happen (deleted, or a key nobody understands) puts the thing under Unscheduled, since only the DM can bring it out.
299. **"Reveal now" keeps the players it names:** something held for Mira goes to Mira, not everyone. Revealing writes the reveal log line, as revealing by hand always has.
300. **"Change session" became "Change when",** the same "Who sees this?" dialog (for entries and homebrew) or the block switch (for page blocks), since things can wait for a chapter or a beat as well as a session. Each session group also has Start session / Mark played.

## Hub version 2, item 9: the Welcome page (15 October 2026)

301. **Every hub version 2 page lives under `/c/<campaign>/hub/`.** A page at `/c/<campaign>/welcome` would hide any campaign tab called "welcome". One reserved word, `hub`, avoids that for every page to come. Making a tab called "hub" (or "tools", "map" and the app's other page names, which had the same problem already) is now refused with "That name is used by the app".
302. **The published recap and the next session are kept in the campaign's settings,** which everyone in the campaign can already read, so no database change was needed. Only published things go there. A recap's draft is kept on the DM's own record of that session (the Sessions tab), which players cannot read; if there is no record for that session yet, one is made.
303. **Writing a recap is plain writing.** The mockup's "Draft recap from notes" uses AI and belongs to #45, as the plan says. "Will also update" (the NPCs and quests a recap mentions) depends on it too, and is left out.
304. **Publishing a recap and setting the next session need "Change campaign settings".** They are changes to the campaign's settings, and the database asks for that permission. "Write session recaps" on its own would need a database change to mean something; it still governs nothing.
305. **"Newly revealed" is the reveal log.** It follows the campaign's existing "newly revealed" feed switch: with the feed off, players see nothing there, as in the Reveal log tool today. The DM is told so on the page.
306. **"Goes live at <stage>" lists the table-tool entries waiting for the next stage,** each with "Reveal now". "Reveal now" shows it at once to whoever it was for, and writes its line in the reveal log (the database only writes one itself when something goes from hidden-from-everyone to shown). Tabs and blocks waiting for a stage are not listed; the full overview of hidden things is item 14.
307. **"Next session" is the session after the campaign's current session number,** and the recap writer starts at the current one (the session just played). The DM can change the number.
308. **Left out until they exist:** RSVP and attendance (#49), Discord (#40), active quests (item 17), the handouts shelf (item 20), and Message DM (items 13 and 14). The banner image is the campaign's existing intro video link; an uploaded banner picture is not built.
309. **With Welcome as Home, the campaign's own first tab can be on the phone bar.** The Welcome page takes the Home button, so the bar fills from the campaign's first tab instead of its second.
