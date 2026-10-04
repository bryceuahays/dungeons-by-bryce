-- Phase gating: a campaign can show players different things in different phases, and
-- everything hidden is hidden in the database, not just on the page.
--
--   1. sections (tabs) get a phase, enforced by row-level security
--   2. a campaign can have a different title, web address, and tagline per phase
--      ("faces"); players can only ever read the face for the current phase
--   3. chosen character-sheet fields can be kept from their owner until a phase opens them

-- ---------------------------------------------------------------- 1. tabs

alter table public.sections add column if not exists phase text;

drop policy if exists sections_select on public.sections;
create policy sections_select on public.sections for select to authenticated
  using (
    public.is_dm()
    or (
      public.is_member(campaign_id)
      and audience in ('all', 'player')
      and (phase is null or phase = public.campaign_phase(campaign_id))
    )
  );

-- ---------------------------------------------------------------- 2. faces

-- phase '' is the campaign's real face. Any other row replaces it while the campaign is
-- in that phase. Only the DM can read this table. campaigns.slug, title and tagline are
-- kept equal to the face for the current phase, so that is all a player can ever see.
create table if not exists public.campaign_faces (
  campaign_id uuid not null references public.campaigns on delete cascade,
  phase       text not null default '',
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  title       text not null,
  tagline     text not null default '',
  primary key (campaign_id, phase)
);
alter table public.campaign_faces enable row level security;
revoke all on public.campaign_faces from anon;
drop policy if exists campaign_faces_dm on public.campaign_faces;
create policy campaign_faces_dm on public.campaign_faces for all to authenticated
  using (public.is_dm()) with check (public.is_dm());

create or replace function public.sync_campaign_face(c uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  f public.campaign_faces%rowtype;
begin
  select cf.* into f
  from public.campaign_faces cf
  where cf.campaign_id = c
    and cf.phase in ('', (select k.phase from public.campaigns k where k.id = c))
  order by (cf.phase = '')   -- the face for the current phase wins over the real one
  limit 1;
  if found then
    update public.campaigns k set slug = f.slug, title = f.title, tagline = f.tagline
    where k.id = c and (k.slug, k.title, k.tagline) is distinct from (f.slug, f.title, f.tagline);
  end if;
end $$;

create or replace function public.campaigns_face_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.campaign_faces (campaign_id, phase, slug, title, tagline)
    values (new.id, '', new.slug, new.title, new.tagline)
    on conflict do nothing;
  else
    perform public.sync_campaign_face(new.id);
  end if;
  return null;
end $$;

create or replace function public.faces_sync_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_campaign_face(coalesce(new.campaign_id, old.campaign_id));
  return null;
end $$;

drop trigger if exists campaigns_face_insert on public.campaigns;
create trigger campaigns_face_insert after insert on public.campaigns
  for each row execute function public.campaigns_face_trigger();
drop trigger if exists campaigns_face_phase on public.campaigns;
create trigger campaigns_face_phase after update of phase on public.campaigns
  for each row execute function public.campaigns_face_trigger();
drop trigger if exists faces_sync on public.campaign_faces;
create trigger faces_sync after insert or update or delete on public.campaign_faces
  for each row execute function public.faces_sync_trigger();

-- existing campaigns: their current title, address and tagline are their real face
insert into public.campaign_faces (campaign_id, phase, slug, title, tagline)
select id, '', slug, title, tagline from public.campaigns
on conflict do nothing;

-- An old address. For a player it only answers for a face that belonged to another
-- phase (so the address of a later phase never confirms itself early). Returns the
-- address to send them to, or null.
create or replace function public.campaign_alias(p_slug text)
returns text language sql stable security definer set search_path = public as $$
  select c.slug
  from public.campaign_faces f
  join public.campaigns c on c.id = f.campaign_id
  where f.slug = p_slug
    and c.slug <> p_slug
    and (public.is_dm() or (public.is_member(c.id) and f.phase <> ''))
  limit 1;
$$;
revoke all on function public.campaign_alias(text) from public, anon;
grant execute on function public.campaign_alias(text) to authenticated;

-- ---------------------------------------------------------------- 3. private sheet fields

-- A campaign lists the sheet fields to hold back in a rules row (kind 'sheet-private',
-- key 'fields'). Those fields are stored here instead of in characters.data. The owner
-- can read them only while that rules row is visible to players (its phase is the
-- current phase, or it has none). The DM can always read them.
create table if not exists public.character_private (
  character_id uuid primary key,
  data         jsonb not null default '{}'::jsonb
);
alter table public.character_private enable row level security;
revoke all on public.character_private from anon;
revoke insert, update, delete on public.character_private from authenticated;

create or replace function public.private_fields(c uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(
    (select array(select jsonb_array_elements_text(r.data -> 'v'))
     from public.rules r where r.campaign_id = c and r.kind = 'sheet-private' and r.key = 'fields' limit 1),
    '{}'::text[]);
$$;

create or replace function public.private_open(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_dm() or exists (
    select 1 from public.rules r
    where r.campaign_id = c and r.kind = 'sheet-private' and r.key = 'fields'
      and (r.phase is null or r.phase = public.campaign_phase(c)));
$$;

drop policy if exists character_private_select on public.character_private;
create policy character_private_select on public.character_private for select to authenticated
  using (
    public.is_dm()
    or exists (
      select 1 from public.characters ch
      where ch.id = character_id and ch.owner = auth.uid() and public.private_open(ch.campaign_id)
    )
  );

-- Whenever a sheet is saved, the private fields are lifted out of it. They are stored
-- only if the writer is allowed to see them right now; otherwise they are dropped and
-- whatever was stored before is kept.
create or replace function public.split_character_private()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  keys text[];
  k text;
  priv jsonb := '{}'::jsonb;
  d jsonb := coalesce(new.data, '{}'::jsonb);
begin
  keys := public.private_fields(new.campaign_id);
  if keys is null or coalesce(array_length(keys, 1), 0) = 0 then
    return new;
  end if;
  foreach k in array keys loop
    if d ? k then
      priv := priv || jsonb_build_object(k, d -> k);
      d := d - k;
    end if;
  end loop;
  new.data := d;
  if priv <> '{}'::jsonb and public.private_open(new.campaign_id) then
    insert into public.character_private (character_id, data) values (new.id, priv)
    on conflict (character_id) do update set data = public.character_private.data || excluded.data;
  end if;
  return new;
end $$;

drop trigger if exists characters_split_private on public.characters;
create trigger characters_split_private before insert or update of data on public.characters
  for each row execute function public.split_character_private();

create or replace function public.drop_character_private()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.character_private where character_id = old.id;
  return old;
end $$;

drop trigger if exists characters_drop_private on public.characters;
create trigger characters_drop_private after delete on public.characters
  for each row execute function public.drop_character_private();
