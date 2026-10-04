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
8. **Every rule that existed before is `private`,** all 435 rows of "To be a god". None is confirmed SRD wording, and seven of its classes come from other editions.
9. **Private rules can only be copied between two campaigns run by the same person.** Before, a player in "To be a god" could copy its character rules into their own campaign. That is now refused.
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
23. **A new, general fifth edition sheet was built for every campaign except "To be a god".** The old builder and sheet are tied to that campaign's own rules, so they stay with it, untouched. Campaigns without that rule set get the standard sheet: pick race, class, subclass, background and feats, and everything else is worked out.
24. **Structured effects apply to the standard sheet only.** "To be a god" sheets are not changed by homebrew entries.
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
