-- Commercial build, phases 4 to 9: reveal stages on blocks and tabs, per-player
-- visibility, the rules for the shared `entries` table, player notes, and session zero.
-- Additive only.

-- ================================================================ blocks and tabs

-- from_stage: shown from that stage onward (phase stays "only in that stage").
-- only_players: when set, only these players (and the DM) get the block.
alter table public.content add column if not exists from_stage text;
alter table public.content add column if not exists only_players uuid[];
alter table public.sections add column if not exists from_stage text;
-- settings every member may read (never secrets): feed on/off, current session, featured video
alter table public.campaigns add column if not exists settings jsonb not null default '{}'::jsonb;

drop policy if exists sections_select on public.sections;
create policy sections_select on public.sections for select to authenticated
  using (
    public.reads_all(campaign_id)
    or (public.is_member(campaign_id) and audience in ('all', 'player')
        and (phase is null or phase = public.campaign_phase(campaign_id))
        and public.stage_reached(campaign_id, from_stage))
  );

drop policy if exists content_select on public.content;
create policy content_select on public.content for select to authenticated
  using (
    public.reads_all(campaign_id)
    or (public.is_member(campaign_id) and visibility = 'player' and not hidden
        and (phase is null or phase = public.campaign_phase(campaign_id))
        and public.stage_reached(campaign_id, from_stage)
        and (only_players is null or auth.uid() = any(only_players)))
  );

-- blocks for named players are part of Pro
create or replace function public.content_gate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.only_players is not null and (tg_op = 'INSERT' or old.only_players is null)
     and not public.campaign_feature(new.campaign_id, 'player_secrets') then
    raise exception 'upgrade:player_secrets blocks for named players are part of Pro';
  end if;
  return new;
end $$;
drop trigger if exists content_gate on public.content;
create trigger content_gate before insert or update of only_players on public.content
  for each row execute function public.content_gate();

-- ================================================================ entries

create table if not exists public.entry_secrets (
  entry_id    uuid primary key references public.entries on delete cascade,
  campaign_id uuid not null references public.campaigns on delete cascade,
  data        jsonb not null default '{}'::jsonb
);
alter table public.entry_secrets enable row level security;
revoke all on public.entry_secrets from anon;
grant select, insert, update, delete on public.entries, public.entry_secrets to authenticated;
drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before update on public.entries for each row execute function public.touch_updated_at();

-- can the caller see this entry? (used where a policy must look at another entry)
create or replace function public.can_see_entry(e uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entries x where x.id = e
      and (public.reads_all(x.campaign_id)
           or (public.is_member(x.campaign_id) and (x.owner = auth.uid() or (x.live and public.entry_open(x.campaign_id, x.vis, x.vis_players, x.vis_stage, x.vis_entry))))));
$$;
revoke all on function public.can_see_entry(uuid) from public, anon;
grant execute on function public.can_see_entry(uuid) to authenticated;

drop policy if exists entries_select on public.entries;
create policy entries_select on public.entries for select to authenticated
  using (
    public.reads_all(campaign_id)
    or (public.is_member(campaign_id) and (owner = auth.uid() or (live and public.entry_open(campaign_id, vis, vis_players, vis_stage, vis_entry))))
  );
drop policy if exists entries_dm on public.entries;
create policy entries_dm on public.entries for all to authenticated
  using (public.can_edit(campaign_id)) with check (public.can_edit(campaign_id));

-- Players add their own story beats, notes on beats, and map pins: visible to the table,
-- or private to themselves. Nothing else, and only under something they can see.
drop policy if exists entries_member_insert on public.entries;
create policy entries_member_insert on public.entries for insert to authenticated
  with check (
    public.is_member(campaign_id) and public.campaign_writable(campaign_id)
    and owner = auth.uid() and kind in ('beat', 'note', 'pin') and live and vis_entry is null
    and (vis = 'all' or (vis = 'players' and vis_players = array[auth.uid()]))
    and (kind <> 'beat' or status = 'hit')
    and (parent is null or public.can_see_entry(parent))
    and (kind = 'beat' or parent is not null)
  );
drop policy if exists entries_member_update on public.entries;
create policy entries_member_update on public.entries for update to authenticated
  using (public.is_member(campaign_id) and owner = auth.uid() and kind in ('beat', 'note', 'pin'))
  with check (
    public.is_member(campaign_id) and owner = auth.uid() and kind in ('beat', 'note', 'pin') and live and vis_entry is null
    and (vis = 'all' or (vis = 'players' and vis_players = array[auth.uid()]))
    and (kind <> 'beat' or status = 'hit')
  );
drop policy if exists entries_member_delete on public.entries;
create policy entries_member_delete on public.entries for delete to authenticated
  using (public.is_member(campaign_id) and owner = auth.uid() and kind in ('beat', 'note', 'pin'));

drop policy if exists entry_secrets_select on public.entry_secrets;
create policy entry_secrets_select on public.entry_secrets for select to authenticated using (public.reads_all(campaign_id));
drop policy if exists entry_secrets_dm on public.entry_secrets;
create policy entry_secrets_dm on public.entry_secrets for all to authenticated
  using (public.can_edit(campaign_id)) with check (public.can_edit(campaign_id));

-- an entry and anything hanging off it stay in one campaign; nobody moves an entry
create or replace function public.entries_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.campaign_id <> old.campaign_id or new.kind <> old.kind or new.owner is distinct from old.owner) then
    raise exception 'an entry cannot be moved';
  end if;
  if new.parent is not null and not exists (select 1 from public.entries p where p.id = new.parent and p.campaign_id = new.campaign_id) then
    raise exception 'parent is in another campaign';
  end if;
  if new.vis_entry is not null and not exists (select 1 from public.entries p where p.id = new.vis_entry and p.campaign_id = new.campaign_id) then
    raise exception 'linked entry is in another campaign';
  end if;
  return new;
end $$;
drop trigger if exists entries_guard on public.entries;
create trigger entries_guard before insert or update on public.entries
  for each row execute function public.entries_guard();

-- which plan feature a new entry needs
create or replace function public.entries_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare feature text;
begin
  if new.kind = 'log' then return new; end if;
  if tg_op = 'INSERT' then
    feature := case new.kind
      when 'beat' then 'timeline' when 'note' then 'timeline'
      when 'consequence' then 'world' when 'secret' then 'world' when 'clue' then 'world' when 'clock' then 'world'
      when 'region' then 'maps_plus' else null end;
    if new.kind = 'pin' and (new.vis_entry is not null or new.data ? 'beat' or not public.is_campaign_dm(new.campaign_id)) then feature := 'maps_plus'; end if;
    if new.kind = 'map' and (select count(*) from public.entries where campaign_id = new.campaign_id and kind = 'map') >= public.free_limit('maps') then feature := 'maps_plus'; end if;
    if feature is null and new.vis = 'players' then feature := 'player_secrets'; end if;
  else
    if new.kind = 'pin' and new.vis_entry is not null and old.vis_entry is null then feature := 'maps_plus'; end if;
    if new.vis = 'players' and old.vis <> 'players' and new.kind not in ('beat', 'note', 'pin') then feature := 'player_secrets'; end if;
  end if;
  if feature is not null and not public.campaign_feature(new.campaign_id, feature) then
    raise exception 'upgrade:% is part of Pro', feature;
  end if;
  return new;
end $$;
drop trigger if exists entries_gate on public.entries;
create trigger entries_gate before insert or update on public.entries
  for each row execute function public.entries_gate();

-- The reveal log. A line is written when something becomes visible: it is shown to the
-- DM always, and to the players who can see the thing itself when the campaign's
-- "newly revealed" feed is on.
create or replace function public.entries_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  feed boolean;
  line text;
begin
  if new.kind in ('log', 'encounter', 'note', 'zero') then return new; end if;
  if not ((old.vis = 'dm' and new.vis <> 'dm') or (old.status is distinct from new.status and new.status = 'hit') or (not old.live and new.live)) then return new; end if;
  select coalesce((settings ->> 'feed')::boolean, false) into feed from public.campaigns where id = new.campaign_id;
  line := case new.kind
    when 'beat' then 'On the timeline: ' || new.title
    when 'region' then 'A new part of a map is open'
    when 'map' then 'A new map: ' || new.title
    when 'pin' then 'A new pin on a map: ' || new.title
    when 'npc' then 'Someone new to know: ' || new.title
    when 'clock' then 'A faction''s progress is now known: ' || new.title
    else 'Newly revealed: ' || new.title end;
  insert into public.entries (campaign_id, kind, owner, title, live, vis, vis_players, vis_stage, vis_entry, data)
  values (new.campaign_id, 'log', null, left(line, 200), feed, new.vis, new.vis_players, new.vis_stage, new.vis_entry, jsonb_build_object('entry', new.id, 'kind', new.kind));
  return new;
end $$;
drop trigger if exists entries_log on public.entries;
create trigger entries_log after update on public.entries
  for each row execute function public.entries_log();

-- When the stage changes: story beats tied to a stage that has now been reached are
-- marked as having happened, and the change goes in the reveal log.
create or replace function public.campaign_stage_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  label text;
  log_id uuid;
begin
  if new.phase is not distinct from old.phase then return new; end if;
  update public.entries set status = 'hit', live = true,
         data = data || jsonb_build_object('hitAt', to_char(now(), 'YYYY-MM-DD'), 'hitSession', coalesce(new.settings -> 'session', 'null'::jsonb))
  where campaign_id = new.id and kind = 'beat' and status = 'planned'
    and coalesce(data ->> 'stage', '') <> '' and public.stage_reached(new.id, data ->> 'stage');
  select p ->> 'label' into label from jsonb_array_elements(new.phases) p where p ->> 'id' = new.phase;
  insert into public.entries (campaign_id, kind, owner, title, live, vis, data)
  values (new.id, 'log', null, 'The story has moved on. New things are open to you.', coalesce((new.settings ->> 'feed')::boolean, false), 'all', jsonb_build_object('kind', 'stage'))
  returning id into log_id;
  insert into public.entry_secrets (entry_id, campaign_id, data)
  values (log_id, new.id, jsonb_build_object('stage', coalesce(label, new.phase), 'from', old.phase));
  return new;
end $$;
drop trigger if exists campaigns_stage_changed on public.campaigns;
create trigger campaigns_stage_changed after update of phase on public.campaigns
  for each row execute function public.campaign_stage_changed();

alter publication supabase_realtime add table public.entries;

-- ================================================================ per-player secrets and private notes

-- kind 'secret': written by the DM for one player (the player and the DM read it).
-- kind 'note':   the player's own notes (only that player reads them, not even the DM).
create table if not exists public.player_notes (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  kind        text not null check (kind in ('secret', 'note')),
  title       text not null default '' check (char_length(title) <= 200),
  body        text not null default '' check (char_length(body) <= 20000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists player_notes_lookup on public.player_notes (campaign_id, user_id);
alter table public.player_notes enable row level security;
revoke all on public.player_notes from anon;
drop trigger if exists player_notes_touch on public.player_notes;
create trigger player_notes_touch before update on public.player_notes for each row execute function public.touch_updated_at();
drop policy if exists player_notes_select on public.player_notes;
create policy player_notes_select on public.player_notes for select to authenticated
  using ((user_id = auth.uid() and public.is_member(campaign_id)) or (kind = 'secret' and public.reads_all(campaign_id)));
drop policy if exists player_notes_own on public.player_notes;
create policy player_notes_own on public.player_notes for all to authenticated
  using (kind = 'note' and user_id = auth.uid() and public.is_member(campaign_id))
  with check (kind = 'note' and user_id = auth.uid() and public.is_member(campaign_id));
drop policy if exists player_notes_dm on public.player_notes;
create policy player_notes_dm on public.player_notes for all to authenticated
  using (kind = 'secret' and public.can_edit(campaign_id))
  with check (kind = 'secret' and public.can_edit(campaign_id) and public.campaign_feature(campaign_id, 'player_secrets')
              and exists (select 1 from public.memberships m where m.campaign_id = player_notes.campaign_id and m.user_id = player_notes.user_id));

-- ================================================================ session zero: anonymous input

-- What a player would rather not have at the table. No account id, no time: nothing
-- that ties a line to a person. The DM reads the combined list.
create table if not exists public.safety_inputs (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns on delete cascade,
  kind        text not null check (kind in ('line', 'veil', 'note')),
  body        text not null check (char_length(body) between 1 and 300)
);
-- how many each member has sent (to cap it), kept apart from the lines themselves
create table if not exists public.safety_counts (
  campaign_id uuid not null references public.campaigns on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  n           int not null default 0,
  primary key (campaign_id, user_id)
);
alter table public.safety_inputs enable row level security;
alter table public.safety_counts enable row level security;
revoke all on public.safety_inputs, public.safety_counts from anon, authenticated;
grant select, delete on public.safety_inputs to authenticated;
drop policy if exists safety_inputs_dm on public.safety_inputs;
create policy safety_inputs_dm on public.safety_inputs for select to authenticated using (public.is_campaign_dm(campaign_id));
drop policy if exists safety_inputs_dm_delete on public.safety_inputs;
create policy safety_inputs_dm_delete on public.safety_inputs for delete to authenticated using (public.can_edit(campaign_id));

create or replace function public.submit_safety(c uuid, p_kind text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare sent int;
begin
  if not public.is_member(c) then raise exception 'not allowed'; end if;
  insert into public.safety_counts (campaign_id, user_id, n) values (c, auth.uid(), 1)
    on conflict (campaign_id, user_id) do update set n = public.safety_counts.n + 1
    returning n into sent;
  if sent > 20 then raise exception 'too many'; end if;
  insert into public.safety_inputs (campaign_id, kind, body) values (c, p_kind, left(trim(p_body), 300));
end $$;
revoke all on function public.submit_safety(uuid, text, text) from public, anon;
grant execute on function public.submit_safety(uuid, text, text) to authenticated;

-- ================================================================ files for table tools

-- Portraits and map pictures. Nobody reads this bucket directly except the campaign's
-- DM; the site hands files to players after checking what they may see (and, for maps,
-- after painting out hidden regions).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campaign-files', 'campaign-files', false, 8388608, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types, public = false;

create or replace function public.campaign_file_allowed(name text, writing boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then case when writing then public.can_edit(split_part(name, '/', 1)::uuid) else public.reads_all(split_part(name, '/', 1)::uuid) end
    else false end;
$$;
drop policy if exists campaign_files_read on storage.objects;
drop policy if exists campaign_files_insert on storage.objects;
drop policy if exists campaign_files_update on storage.objects;
drop policy if exists campaign_files_delete on storage.objects;
create policy campaign_files_read on storage.objects for select to authenticated
  using (bucket_id = 'campaign-files' and public.campaign_file_allowed(name, false));
create policy campaign_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'campaign-files' and public.campaign_file_allowed(name, true));
create policy campaign_files_update on storage.objects for update to authenticated
  using (bucket_id = 'campaign-files' and public.campaign_file_allowed(name, true))
  with check (bucket_id = 'campaign-files' and public.campaign_file_allowed(name, true));
create policy campaign_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'campaign-files' and public.campaign_file_allowed(name, true));

notify pgrst, 'reload schema';
