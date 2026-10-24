-- The Quest log (hub version 2, item 17; issue 96): quests, their objectives, and the quests each
-- person tracks on the Welcome page.
-- Additive: two more kinds of table-tool entry, one small table, and one question the database
-- answers. Nothing existing changes meaning.
--
-- A quest is an ordinary entry (kind 'quest'): its giver, place, summary and session in `data`, its
-- status ('active', 'completed' or 'failed') in `status`, and who sees it is the one visibility rule
-- every entry uses, with reveal triggers. The DM's notes, and a reward players are not told yet,
-- are in entry_secrets.
-- An objective is an entry too (kind 'objective', its quest in `parent`), with its own visibility,
-- so it can stay hidden while the rest of the quest is known. A player reads an objective only if
-- they may read its quest as well: one hidden quest hides everything on it.

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
  check (kind in ('npc', 'beat', 'note', 'map', 'region', 'pin', 'consequence', 'secret', 'clue', 'clock', 'encounter', 'zero', 'log', 'lore', 'quest', 'objective'));

-- ================================================================ an objective goes with its quest

-- may the caller read this quest (the rule an objective adds)?
create or replace function public.quest_open(q uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entries p where p.id = q and p.kind = 'quest'
      and (public.reads_all(p.campaign_id)
           or (public.is_member(p.campaign_id) and p.live and public.entry_open(p.campaign_id, p.vis, p.vis_players, p.vis_stage, p.vis_entry))));
$$;

-- can the caller see this entry? An objective also needs its quest.
create or replace function public.can_see_entry(e uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entries x where x.id = e
      and (public.reads_all(x.campaign_id)
           or (public.is_member(x.campaign_id) and (x.owner = auth.uid() or (x.live and public.entry_open(x.campaign_id, x.vis, x.vis_players, x.vis_stage, x.vis_entry)))))
      and (x.kind <> 'objective' or public.reads_all(x.campaign_id) or public.quest_open(x.parent)));
$$;
revoke all on function public.quest_open(uuid) from public, anon;
grant execute on function public.quest_open(uuid) to authenticated;
revoke all on function public.can_see_entry(uuid) from public, anon;
grant execute on function public.can_see_entry(uuid) to authenticated;

drop policy if exists entries_select on public.entries;
create policy entries_select on public.entries for select to authenticated
  using (
    public.reads_all(campaign_id)
    or (public.is_member(campaign_id) and (owner = auth.uid() or (live and public.entry_open(campaign_id, vis, vis_players, vis_stage, vis_entry)))
        and (kind <> 'objective' or public.quest_open(parent)))
  );

-- An objective is always on a quest of the same campaign.
create or replace function public.objectives_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'objective' and not exists (select 1 from public.entries q where q.id = new.parent and q.kind = 'quest' and q.campaign_id = new.campaign_id) then
    raise exception 'an objective belongs to a quest in the same campaign';
  end if;
  return new;
end $$;
drop trigger if exists entries_objectives_guard on public.entries;
create trigger entries_objectives_guard before insert or update of kind, parent, campaign_id on public.entries
  for each row execute function public.objectives_guard();

-- "1 objective still hidden": for each quest the caller can see, how many of its objectives they
-- cannot (yet). Only the number: never what they say.
create or replace function public.quest_hidden(c uuid)
returns table (quest uuid, hidden int)
language sql stable security definer set search_path = public as $$
  select o.parent, count(*)::int
  from public.entries o
  where o.campaign_id = c and o.kind = 'objective'
    and (public.is_member(c) or public.reads_all(c))
    and public.quest_open(o.parent)
    and not (public.reads_all(c) or o.owner = auth.uid() or (o.live and public.entry_open(c, o.vis, o.vis_players, o.vis_stage, o.vis_entry)))
  group by o.parent;
$$;
revoke all on function public.quest_hidden(uuid) from public, anon;
grant execute on function public.quest_hidden(uuid) to authenticated;

-- ================================================================ the reveal log

-- An objective gets no line in the reveal log of its own (the line would be read by people who
-- may not see its quest yet). A quest gets "A new quest". Otherwise as before.
create or replace function public.entries_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  feed boolean;
  line text;
begin
  if new.kind in ('log', 'encounter', 'note', 'zero', 'objective') then return new; end if;
  if not ((old.vis = 'dm' and new.vis <> 'dm') or (old.status is distinct from new.status and new.status = 'hit') or (not old.live and new.live)) then return new; end if;
  select coalesce((settings ->> 'feed')::boolean, false) into feed from public.campaigns where id = new.campaign_id;
  line := case new.kind
    when 'beat' then 'On the timeline: ' || new.title
    when 'region' then 'A new part of a map is open'
    when 'map' then 'A new map: ' || new.title
    when 'pin' then 'A new pin on a map: ' || new.title
    when 'npc' then 'Someone new to know: ' || new.title
    when 'clock' then 'A faction''s progress is now known: ' || new.title
    when 'quest' then 'A new quest: ' || new.title
    else 'Newly revealed: ' || new.title end;
  insert into public.entries (campaign_id, kind, owner, title, live, vis, vis_players, vis_stage, vis_entry, data)
  values (new.campaign_id, 'log', null, left(line, 200), feed, new.vis, new.vis_players, new.vis_stage, new.vis_entry, jsonb_build_object('entry', new.id, 'kind', new.kind));
  return new;
end $$;

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
  for e in select * from public.entries where campaign_id = new.campaign_id and vis in ('when', 'players_when') and vis_stage = any(keys) and kind not in ('log', 'objective') loop
    insert into public.entries (campaign_id, kind, owner, title, live, vis, vis_players, data)
    values (new.campaign_id, 'log', null, left(case e.kind
        when 'beat' then 'On the timeline: ' || e.title
        when 'region' then 'A new part of a map is open'
        when 'map' then 'A new map: ' || e.title
        when 'pin' then 'A new pin on a map: ' || e.title
        when 'npc' then 'Someone new to know: ' || e.title
        when 'clock' then 'A faction''s progress is now known: ' || e.title
        when 'quest' then 'A new quest: ' || e.title
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

-- ================================================================ tracking a quest

-- The quests a person has chosen to track, shown on their Welcome page. Each person's own: nobody
-- else reads them, not even the DM. Only quests they can see.
create table if not exists public.quest_tracks (
  quest_id    uuid not null references public.entries on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles on delete cascade,
  campaign_id uuid not null references public.campaigns on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (quest_id, user_id)
);
create index if not exists quest_tracks_lookup on public.quest_tracks (campaign_id, user_id);
alter table public.quest_tracks enable row level security;
revoke all on public.quest_tracks from anon;
grant select, insert, delete on public.quest_tracks to authenticated;
drop policy if exists quest_tracks_select on public.quest_tracks;
create policy quest_tracks_select on public.quest_tracks for select to authenticated
  using (user_id = auth.uid());
drop policy if exists quest_tracks_insert on public.quest_tracks;
create policy quest_tracks_insert on public.quest_tracks for insert to authenticated
  with check (
    user_id = auth.uid() and (public.is_member(campaign_id) or public.reads_all(campaign_id))
    and exists (select 1 from public.entries q where q.id = quest_id and q.kind = 'quest' and q.campaign_id = quest_tracks.campaign_id)
    and public.quest_open(quest_id)
  );
drop policy if exists quest_tracks_delete on public.quest_tracks;
create policy quest_tracks_delete on public.quest_tracks for delete to authenticated
  using (user_id = auth.uid());
