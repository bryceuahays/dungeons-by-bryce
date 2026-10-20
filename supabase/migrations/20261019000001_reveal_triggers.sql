-- Reveal rework (issue 117): one way to say "reveal this automatically when ...", for table-tool
-- entries, homebrew attached to a campaign, and page blocks.
-- Additive: nothing existing is dropped, and everything stored today keeps its meaning.
--
-- A trigger is written as a short key:
--   session:<n>:started   once session number <n> has been marked started (or played)
--   session:<n>:played    once session number <n> has been marked played
--   beat:<uuid>           once that story beat has happened
--   chapter:<stage id>    once the campaign reaches that chapter (what the app used to call a stage)
-- reveal_met(campaign, key) answers whether it has happened. A key it does not understand, or
-- one that points at another campaign, never happens: the thing stays hidden.
--
-- Sessions gain a status, 'running' ("under way"), between ready and played.

-- ================================================================ the trigger rule

create or replace function public.reveal_met(c uuid, k text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  kind text := split_part(coalesce(k, ''), ':', 1);
  arg text := split_part(coalesce(k, ''), ':', 2);
  what text := split_part(coalesce(k, ''), ':', 3);
begin
  if kind = 'session' and arg ~ '^[0-9]{1,3}$' and what in ('started', 'played') then
    return exists (select 1 from public.sessions s where s.campaign_id = c and s.number = arg::int
                   and (s.status = 'played' or (what = 'started' and s.status = 'running')));
  elsif kind = 'beat' and arg ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return exists (select 1 from public.entries b where b.id = arg::uuid and b.campaign_id = c and b.kind = 'beat' and b.status = 'hit');
  elsif kind = 'chapter' and arg <> '' then
    return public.stage_reached(c, arg);
  end if;
  return false;
end $$;
revoke all on function public.reveal_met(uuid, text) from public;
grant execute on function public.reveal_met(uuid, text) to authenticated, anon;

-- ================================================================ entries and attached homebrew

-- Two more values. The trigger key goes where the stage goes today (vis_stage), so every rule
-- that already passes the stage along needs no change of its own.
--   when          everyone in the campaign, once the trigger has happened
--   players_when  the named players, once the trigger has happened
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
  check (vis in ('all', 'dm', 'players', 'stage', 'entry', 'players_stage', 'players_entry', 'when', 'players_when'));
alter table public.campaign_entities add constraint campaign_entities_vis_check
  check (vis in ('all', 'dm', 'players', 'stage', 'entry', 'players_stage', 'players_entry', 'when', 'players_when'));

-- The one visibility rule (the same rule is entryOpen() in src/lib/entry-types.ts; keep them in step).
-- As before, plus:
--   when          every member, once reveal_met(campaign, the key in `stage`)
--   players_when  the named players, once reveal_met(campaign, the key in `stage`)
create or replace function public.entry_open(c uuid, vis text, players uuid[], stage text, link uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case vis
    when 'all' then true
    when 'players' then auth.uid() = any(players)
    when 'stage' then public.stage_reached(c, stage)
    when 'entry' then exists (select 1 from public.entries b where b.id = link and b.status = 'hit')
    when 'players_stage' then auth.uid() = any(players) and public.stage_reached(c, stage)
    when 'players_entry' then auth.uid() = any(players) and exists (select 1 from public.entries b where b.id = link and b.status = 'hit')
    when 'when' then public.reveal_met(c, stage)
    when 'players_when' then auth.uid() = any(players) and public.reveal_met(c, stage)
    else false end;
$$;

-- The plan gate counts players_when as naming players, as it does the other named values.
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
    if feature is null and new.vis in ('players', 'players_stage', 'players_entry', 'players_when') then feature := 'player_secrets'; end if;
    if new.kind in ('note', 'pin') and not public.is_campaign_dm(new.campaign_id) and public.campaign_feature(new.campaign_id, feature) then feature := null; end if;
  else
    if new.kind = 'pin' and new.vis_entry is not null and old.vis_entry is null then feature := 'maps_plus'; end if;
    if new.vis in ('players', 'players_stage', 'players_entry', 'players_when') and old.vis not in ('players', 'players_stage', 'players_entry', 'players_when')
       and new.kind not in ('beat', 'note', 'pin') then feature := 'player_secrets'; end if;
  end if;
  if feature is not null and not public.campaign_can_create(new.campaign_id, feature) then
    raise exception 'upgrade:% is part of Pro', feature;
  end if;
  return new;
end $$;

-- ================================================================ page blocks

-- A hidden block can say when it reveals itself. It shows once the trigger has happened, as if
-- the DM had shown it, and every other rule on the block still applies (DM only stays DM only).
alter table public.content add column if not exists reveal_when text check (reveal_when is null or char_length(reveal_when) <= 80);

drop policy if exists content_select on public.content;
create policy content_select on public.content for select to authenticated
  using (
    public.reads_all(campaign_id)
    or (public.is_member(campaign_id) and visibility = 'player'
        and (not hidden or (reveal_when is not null and public.reveal_met(campaign_id, reveal_when)))
        and (phase is null or phase = public.campaign_phase(campaign_id))
        and public.stage_reached(campaign_id, from_stage)
        and (only_players is null or auth.uid() = any(only_players)))
  );

-- ================================================================ sessions

-- Marking a session started or played reveals what was waiting for it. Each thing revealed gets
-- its line in the reveal log, for the same people as the thing itself, as when a DM reveals by hand.
create or replace function public.sessions_reveal_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  feed boolean;
  keys text[];
  e record;
  b record;
begin
  if new.status is not distinct from old.status or new.status not in ('running', 'played') then return new; end if;
  keys := case when new.status = 'running' then array['session:' || new.number || ':started']
               when old.status = 'running' then array['session:' || new.number || ':played']
               else array['session:' || new.number || ':started', 'session:' || new.number || ':played'] end;
  select coalesce((settings ->> 'feed')::boolean, false) into feed from public.campaigns where id = new.campaign_id;
  for e in select * from public.entries where campaign_id = new.campaign_id and vis in ('when', 'players_when') and vis_stage = any(keys) and kind <> 'log' loop
    insert into public.entries (campaign_id, kind, owner, title, live, vis, vis_players, data)
    values (new.campaign_id, 'log', null, left(case e.kind
        when 'beat' then 'On the timeline: ' || e.title
        when 'region' then 'A new part of a map is open'
        when 'map' then 'A new map: ' || e.title
        when 'pin' then 'A new pin on a map: ' || e.title
        when 'npc' then 'Someone new to know: ' || e.title
        when 'clock' then 'A faction''s progress is now known: ' || e.title
        else 'Newly revealed: ' || e.title end, 200),
      feed, case when e.vis = 'when' then 'all' else 'players' end, case when e.vis = 'when' then '{}'::uuid[] else e.vis_players end,
      jsonb_build_object('entry', e.id, 'kind', e.kind));
  end loop;
  for b in select distinct c.section, c.only_players, s.title from public.content c
           left join public.sections s on s.campaign_id = c.campaign_id and s.slug = c.section
           where c.campaign_id = new.campaign_id and c.hidden and c.visibility = 'player' and c.reveal_when = any(keys) loop
    insert into public.entries (campaign_id, kind, owner, title, live, vis, vis_players, data)
    values (new.campaign_id, 'log', null, left('New on the ' || coalesce(b.title, b.section) || ' page', 200), feed,
            case when b.only_players is null then 'all' else 'players' end, coalesce(b.only_players, '{}'::uuid[]),
            jsonb_build_object('kind', 'block', 'section', b.section));
  end loop;
  return new;
end $$;
drop trigger if exists sessions_reveal_log on public.sessions;
create trigger sessions_reveal_log after update of status on public.sessions
  for each row execute function public.sessions_reveal_log();

-- A story beat happening reveals the blocks waiting for it, with their line in the log. (Entries
-- waiting for a beat already get one: the beat's own line on the timeline.)
create or replace function public.beats_block_reveal_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  feed boolean;
  b record;
begin
  if new.kind <> 'beat' or new.status is distinct from 'hit' or old.status is not distinct from new.status then return new; end if;
  select coalesce((settings ->> 'feed')::boolean, false) into feed from public.campaigns where id = new.campaign_id;
  for b in select distinct c.section, c.only_players, s.title from public.content c
           left join public.sections s on s.campaign_id = c.campaign_id and s.slug = c.section
           where c.campaign_id = new.campaign_id and c.hidden and c.visibility = 'player' and c.reveal_when = 'beat:' || new.id loop
    insert into public.entries (campaign_id, kind, owner, title, live, vis, vis_players, data)
    values (new.campaign_id, 'log', null, left('New on the ' || coalesce(b.title, b.section) || ' page', 200), feed,
            case when b.only_players is null then 'all' else 'players' end, coalesce(b.only_players, '{}'::uuid[]),
            jsonb_build_object('kind', 'block', 'section', b.section));
  end loop;
  return new;
end $$;
drop trigger if exists entries_block_reveal_log on public.entries;
create trigger entries_block_reveal_log after update of status on public.entries
  for each row execute function public.beats_block_reveal_log();
