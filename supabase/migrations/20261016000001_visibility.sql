-- Hub version 2, item 4: one visibility system for everything, and partial reveals for NPCs.
-- Additive: nothing existing is dropped, and nothing stored today changes meaning.
--
--   1. Two more visibility values, so "who" and "when" can be combined:
--        players_stage   the named players, once the campaign reaches that stage
--        players_entry   the named players, once the linked story beat has happened
--      They are new names, not a new reading of old rows: an entry that is 'players' or 'stage'
--      today keeps exactly the answer it had.
--   2. Homebrew attached to a campaign gains "once a story beat happens" (vis_entry), so it
--      offers the same choices as everything else.
--   3. NPC partial reveals. An NPC can be shown to players as its name only, or its name and
--      portrait. The details held back are kept with the DM-only secrets (entry_secrets), and
--      the database refuses an NPC row that still carries them, so they can never sit in a
--      row a player is able to read.

-- ================================================================ 1. the values

-- The check on `vis` is replaced by a wider one. It is found by what it checks, not by name.
do $$
declare r record;
begin
  for r in
    select con.conrelid::regclass as tbl, con.conname
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'c' and array_length(con.conkey, 1) = 1 and a.attname = 'vis'
      and con.conrelid in ('public.entries'::regclass, 'public.campaign_entities'::regclass)
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;
alter table public.entries add constraint entries_vis_check
  check (vis in ('all', 'dm', 'players', 'stage', 'entry', 'players_stage', 'players_entry'));

alter table public.campaign_entities add column if not exists vis_entry uuid references public.entries on delete set null;
alter table public.campaign_entities add constraint campaign_entities_vis_check
  check (vis in ('all', 'dm', 'players', 'stage', 'entry', 'players_stage', 'players_entry'));

-- The one visibility rule (the same rule is entryOpen() in src/lib/entry-types.ts; keep them in step):
--   all            every member of the campaign
--   dm             nobody but the DM
--   players        the named players
--   stage          every member, once the campaign reaches that stage
--   entry          every member, once the linked entry (a story beat) has happened
--   players_stage  the named players, once the campaign reaches that stage
--   players_entry  the named players, once the linked story beat has happened
create or replace function public.entry_open(c uuid, vis text, players uuid[], stage text, link uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case vis
    when 'all' then true
    when 'players' then auth.uid() = any(players)
    when 'stage' then public.stage_reached(c, stage)
    when 'entry' then exists (select 1 from public.entries b where b.id = link and b.status = 'hit')
    when 'players_stage' then auth.uid() = any(players) and public.stage_reached(c, stage)
    when 'players_entry' then auth.uid() = any(players) and exists (select 1 from public.entries b where b.id = link and b.status = 'hit')
    else false end;
$$;

-- ================================================================ 2. attached homebrew

-- an entry someone else made reaches me only through a campaign I am in, once it is past draft
create or replace function public.entity_shared(e uuid, st text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.campaign_entities ce
    where ce.entity_id = e
      and (public.reads_all(ce.campaign_id)
           or (st <> 'draft' and public.is_member(ce.campaign_id) and public.entry_open(ce.campaign_id, ce.vis, ce.vis_players, ce.vis_stage, ce.vis_entry))));
$$;

drop policy if exists campaign_entities_select on public.campaign_entities;
create policy campaign_entities_select on public.campaign_entities for select to authenticated
  using (public.reads_all(campaign_id) or (public.is_member(campaign_id) and public.entry_open(campaign_id, vis, vis_players, vis_stage, vis_entry)));

-- the beat an attached entry waits for is one of that campaign's own
create or replace function public.campaign_entities_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.vis_entry is not null and not exists (select 1 from public.entries b where b.id = new.vis_entry and b.campaign_id = new.campaign_id) then
    raise exception 'linked entry is in another campaign';
  end if;
  return new;
end $$;
drop trigger if exists campaign_entities_guard on public.campaign_entities;
create trigger campaign_entities_guard before insert or update on public.campaign_entities
  for each row execute function public.campaign_entities_guard();

-- ================================================================ plan gate

-- Which plan feature a new entry needs. As it was (20261011000001), except that the two new
-- values count as naming players, exactly as 'players' does.
create or replace function public.entries_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare feature text;
begin
  if new.kind = 'log' or auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    feature := case new.kind
      when 'beat' then 'timeline' when 'note' then 'timeline'
      when 'consequence' then 'world' when 'secret' then 'world' when 'clue' then 'world' when 'clock' then 'world'
      when 'region' then 'maps_plus' else null end;
    if new.kind = 'pin' and (new.vis_entry is not null or new.data ? 'beat' or not public.is_campaign_dm(new.campaign_id)) then feature := 'maps_plus'; end if;
    if new.kind = 'map' and (select count(*) from public.entries where campaign_id = new.campaign_id and kind = 'map') >= public.free_limit('maps') then feature := 'maps_plus'; end if;
    if feature is null and new.vis in ('players', 'players_stage', 'players_entry') then feature := 'player_secrets'; end if;
    -- notes on a beat, and pins on a map, that players add to things already in the campaign use what is there
    if new.kind in ('note', 'pin') and not public.is_campaign_dm(new.campaign_id) and public.campaign_feature(new.campaign_id, feature) then feature := null; end if;
  else
    if new.kind = 'pin' and new.vis_entry is not null and old.vis_entry is null then feature := 'maps_plus'; end if;
    if new.vis in ('players', 'players_stage', 'players_entry') and old.vis not in ('players', 'players_stage', 'players_entry')
       and new.kind not in ('beat', 'note', 'pin') then feature := 'player_secrets'; end if;
  end if;
  if feature is not null and not public.campaign_can_create(new.campaign_id, feature) then
    raise exception 'upgrade:% is part of Pro', feature;
  end if;
  return new;
end $$;

-- ================================================================ 3. NPC partial reveals

-- data.reveal on an NPC says how much of them players are given:
--   (not set) or 'all'   everything on the row, as before
--   'portrait'           the name and the portrait
--   'name'               the name only
-- Whoever may see the NPC at all is still decided by `vis`. At 'portrait' and 'name' the rest
-- (status, where they are, their faction, what the players know, and at 'name' the portrait)
-- is kept in entry_secrets, which only the DM reads. This guard makes that certain: a partly
-- shown NPC may carry nothing on its own row but its name and, at 'portrait', its picture.
create or replace function public.entries_reveal_guard()
returns trigger language plpgsql set search_path = public as $$
declare lvl text;
begin
  if new.kind <> 'npc' then return new; end if;
  lvl := coalesce(new.data ->> 'reveal', 'all');
  if lvl not in ('all', 'portrait', 'name') then raise exception 'not allowed: reveal must be all, portrait or name'; end if;
  if lvl = 'all' then return new; end if;
  if new.status <> '' or exists (
       select 1 from jsonb_object_keys(new.data) k
       where k <> 'reveal' and not (lvl = 'portrait' and k = 'file')) then
    raise exception 'not allowed: details held back from players cannot be kept on the NPC itself';
  end if;
  return new;
end $$;
drop trigger if exists entries_reveal_guard on public.entries;
create trigger entries_reveal_guard before insert or update on public.entries
  for each row execute function public.entries_reveal_guard();
