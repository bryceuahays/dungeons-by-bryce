-- The Players page (hub version 2, item 13; issue 92) and players' messages to the DM (issue 120).
-- Additive: one column on characters, one more kind of player note with a "read" time, and the
-- rules for them. Nothing existing changes meaning.

-- ================================================================ what a player shares with the party

-- A character's sheet stays its player's (and the DM's) alone. What the player chooses to share with
-- the rest of the party (about them, what they carry, their connections) is kept here, and other
-- players read only this, through party_shared() below: never the row itself.
alter table public.characters add column if not exists shared jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'characters_shared_small') then
    alter table public.characters add constraint characters_shared_small check (pg_column_size(shared) <= 20000);
  end if;
end $$;

-- The party as everyone in the campaign may see it: each character's card and what its player shares.
create or replace function public.party_shared(c uuid)
returns table (id uuid, owner uuid, name text, race text, cls text, level int, player text, shared jsonb)
language sql stable security definer set search_path = public as $$
  select ch.id, ch.owner,
         coalesce(ch.data ->> 'name', ''),
         coalesce(ch.data ->> 'race', ''),
         coalesce(ch.data ->> 'cls', ''),
         case when (ch.data ->> 'level') ~ '^[0-9]+$' then (ch.data ->> 'level')::int else 1 end,
         coalesce(nullif(p.display_name, ''), ch.data ->> 'player', ''),
         coalesce(ch.shared, '{}'::jsonb)
  from public.characters ch
  join public.profiles p on p.id = ch.owner
  where ch.campaign_id = c
    and (public.reads_all(c) or public.is_member(c))
  order by ch.created_at;
$$;
revoke all on function public.party_shared(uuid) from public, anon;
grant execute on function public.party_shared(uuid) to authenticated;

-- ================================================================ a private message to the DM

-- kind 'to_dm': written by a player for the campaign's DMs. Only its author, the campaign's owner
-- and a co-DM allowed to "Read player messages" can read it.
-- kind 'from_dm': the DM's reply, for that one player (user_id is the player it is for). Only that
-- player and those DMs can read it. Not a Pro feature, unlike per-player secrets.
-- read_at is when a DM first saw a message (the inbox's "new").
do $$
declare r record;
begin
  for r in
    select con.conname from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'c' and array_length(con.conkey, 1) = 1 and a.attname = 'kind' and con.conrelid = 'public.player_notes'::regclass
  loop
    execute format('alter table public.player_notes drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.player_notes add constraint player_notes_kind_check check (kind in ('secret', 'note', 'to_dm', 'from_dm'));
alter table public.player_notes add column if not exists read_at timestamptz;

drop policy if exists player_notes_to_dm_read on public.player_notes;
create policy player_notes_to_dm_read on public.player_notes for select to authenticated
  using (kind in ('to_dm', 'from_dm') and public.co_dm_can(campaign_id, 'messages'));

drop policy if exists player_notes_to_dm_write on public.player_notes;
create policy player_notes_to_dm_write on public.player_notes for insert to authenticated
  with check (kind = 'to_dm' and user_id = auth.uid() and public.is_member(campaign_id) and read_at is null and public.campaign_writable(campaign_id));

drop policy if exists player_notes_from_dm_write on public.player_notes;
create policy player_notes_from_dm_write on public.player_notes for insert to authenticated
  with check (kind = 'from_dm' and public.co_dm_can(campaign_id, 'messages') and public.campaign_writable(campaign_id)
              and exists (select 1 from public.memberships m where m.campaign_id = player_notes.campaign_id and m.user_id = player_notes.user_id));
drop policy if exists player_notes_from_dm_delete on public.player_notes;
create policy player_notes_from_dm_delete on public.player_notes for delete to authenticated
  using (kind = 'from_dm' and public.co_dm_can(campaign_id, 'messages'));

drop policy if exists player_notes_to_dm_delete on public.player_notes;
create policy player_notes_to_dm_delete on public.player_notes for delete to authenticated
  using (kind = 'to_dm' and user_id = auth.uid());

-- A DM marks the campaign's messages as seen (nobody else, and nothing else about them changes).
create or replace function public.mark_messages_read(c uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.co_dm_can(c, 'messages') then raise exception 'not allowed'; end if;
  update public.player_notes set read_at = now() where campaign_id = c and kind = 'to_dm' and read_at is null;
end $$;
revoke all on function public.mark_messages_read(uuid) from public, anon;
grant execute on function public.mark_messages_read(uuid) to authenticated;

-- At most 20 messages an hour from one player in one campaign.
create or replace function public.player_notes_to_dm_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'to_dm' and (select count(*) from public.player_notes where user_id = new.user_id and campaign_id = new.campaign_id and kind = 'to_dm' and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate: 20 messages an hour';
  end if;
  return new;
end $$;
drop trigger if exists player_notes_to_dm_rate on public.player_notes;
create trigger player_notes_to_dm_rate before insert on public.player_notes
  for each row execute function public.player_notes_to_dm_rate();
