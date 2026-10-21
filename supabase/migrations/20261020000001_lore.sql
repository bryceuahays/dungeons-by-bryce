-- Lore (hub version 2, item 11; issue 51): lore entries, one per place, faction, deity, era and
-- so on, grouped by category on the campaign's Lore page.
-- Additive: one more kind of table-tool entry. Nothing existing changes.
--
-- A lore entry is an ordinary entry (kind 'lore'): its category and fields are in `data`, the
-- DM's notes and anything held back (a creature's facts the party has not learned yet) are in
-- entry_secrets, and who sees it is the one visibility rule every entry uses (entry_open()),
-- with reveal triggers. Lore is not a Pro feature: the plan gate is unchanged, so only naming
-- players (Pro) is gated, as for every other kind.

do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'c' and array_length(con.conkey, 1) = 1 and a.attname = 'kind'
      and con.conrelid = 'public.entries'::regclass
  loop
    execute format('alter table public.entries drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.entries add constraint entries_kind_check
  check (kind in ('npc', 'beat', 'note', 'map', 'region', 'pin', 'consequence', 'secret', 'clue', 'clock', 'encounter', 'zero', 'log', 'lore'));
