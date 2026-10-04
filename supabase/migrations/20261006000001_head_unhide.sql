-- The Head DM can look inside another DM's campaign, but only after deliberately
-- unhiding it. Until then nothing about it reaches the Head DM: no title, no address,
-- no pages. Unhiding gives read access only; the Head DM still cannot change another
-- DM's campaign (apart from deleting it, as before).
--
-- Also: feedback notes remember why an email did not go out.

create table if not exists public.head_reveals (
  campaign_id uuid primary key references public.campaigns on delete cascade,
  revealed_at timestamptz not null default now()
);
alter table public.head_reveals enable row level security;
revoke all on public.head_reveals from anon;
grant select, insert, delete on public.head_reveals to authenticated;
drop policy if exists head_reveals_head on public.head_reveals;
create policy head_reveals_head on public.head_reveals for all to authenticated
  using (public.is_head()) with check (public.is_head());

create or replace function public.head_sees(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_head() and exists (select 1 from public.head_reveals where campaign_id = c);
$$;

-- "may read everything in this campaign": its DM, or the Head DM once it is unhidden
create or replace function public.reads_all(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_campaign_dm(c) or public.head_sees(c);
$$;
revoke all on function public.head_sees(uuid) from public, anon;
revoke all on function public.reads_all(uuid) from public, anon;
grant execute on function public.head_sees(uuid) to authenticated;
grant execute on function public.reads_all(uuid) to authenticated;

-- ---------------------------------------------------------------- read policies

drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns for select to authenticated
  using (owner_id = auth.uid() or public.is_member(id) or public.head_sees(id));

drop policy if exists campaign_faces_head_read on public.campaign_faces;
create policy campaign_faces_head_read on public.campaign_faces for select to authenticated
  using (public.head_sees(campaign_id));

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.reads_all(campaign_id));

drop policy if exists sections_select on public.sections;
create policy sections_select on public.sections for select to authenticated
  using (
    public.reads_all(campaign_id)
    or (public.is_member(campaign_id) and audience in ('all', 'player') and (phase is null or phase = public.campaign_phase(campaign_id)))
  );

drop policy if exists content_select on public.content;
create policy content_select on public.content for select to authenticated
  using (
    public.reads_all(campaign_id)
    or (public.is_member(campaign_id) and visibility = 'player' and not hidden and (phase is null or phase = public.campaign_phase(campaign_id)))
  );

drop policy if exists rules_select on public.rules;
create policy rules_select on public.rules for select to authenticated
  using (
    public.reads_all(campaign_id)
    or (public.is_member(campaign_id) and (phase is null or phase = public.campaign_phase(campaign_id)))
  );

drop policy if exists media_select on public.media;
create policy media_select on public.media for select to authenticated
  using (
    public.reads_all(campaign_id)
    or (public.is_member(campaign_id) and (phase is null or phase = public.campaign_phase(campaign_id)))
  );

drop policy if exists characters_select on public.characters;
create policy characters_select on public.characters for select to authenticated
  using (owner = auth.uid() or public.reads_all(campaign_id));

drop policy if exists character_private_select on public.character_private;
create policy character_private_select on public.character_private for select to authenticated
  using (
    exists (
      select 1 from public.characters ch
      where ch.id = character_id
        and (public.reads_all(ch.campaign_id) or (ch.owner = auth.uid() and public.private_open(ch.campaign_id)))
    )
  );

drop policy if exists sessions_head_read on public.sessions;
create policy sessions_head_read on public.sessions for select to authenticated
  using (public.head_sees(campaign_id));

-- ---------------------------------------------------------------- functions that read on someone's behalf

create or replace function public.campaign_alias(p_slug text)
returns text language sql stable security definer set search_path = public as $$
  select c.slug
  from public.campaign_faces f
  join public.campaigns c on c.id = f.campaign_id
  where f.slug = p_slug
    and c.slug <> p_slug
    and (public.reads_all(c.id) or (public.is_member(c.id) and f.phase <> ''))
  limit 1;
$$;

create or replace function public.party_cards(c uuid)
returns table (id uuid, owner uuid, name text, race text, cls text, level int, player text)
language sql stable security definer set search_path = public as $$
  select ch.id,
         ch.owner,
         coalesce(ch.data ->> 'name', ''),
         coalesce(ch.data ->> 'race', ''),
         coalesce(ch.data ->> 'cls', ''),
         case when (ch.data ->> 'level') ~ '^[0-9]+$' then (ch.data ->> 'level')::int else 1 end,
         coalesce(nullif(p.display_name, ''), ch.data ->> 'player', '')
  from public.characters ch
  join public.profiles p on p.id = ch.owner
  where ch.campaign_id = c
    and (public.reads_all(c) or public.is_member(c));
$$;

create or replace function public.campaign_members(c uuid)
returns table (user_id uuid, display_name text, joined_at timestamptz, role text)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.display_name, m.joined_at, m.role
  from public.memberships m join public.profiles p on p.id = m.user_id
  where m.campaign_id = c and public.reads_all(c)
  order by m.joined_at;
$$;

create or replace function public.background_allowed(name text, writing boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when split_part(name, '/', 1) = 'user' then split_part(name, '/', 2) = auth.uid()::text
    when split_part(name, '/', 1) = 'campaign'
         and split_part(name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_campaign_dm(split_part(name, '/', 2)::uuid)
           or (not writing and (public.is_member(split_part(name, '/', 2)::uuid) or public.head_sees(split_part(name, '/', 2)::uuid)))
    else false
  end;
$$;

-- The Head DM's list of every campaign. A campaign someone else runs comes back with an
-- empty title and address until it is unhidden.
drop function if exists public.admin_campaigns();
create function public.admin_campaigns()
returns table (id uuid, owner_id uuid, slug text, title text, owner_name text, owner_email text, members bigint, characters bigint, created_at timestamptz, shown boolean, playing boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.owner_id,
         case when v.shown then c.slug else '' end,
         case when v.shown then coalesce(f.title, c.title) else '' end,
         coalesce(p.display_name, ''), coalesce(p.email, ''),
         (select count(*) from public.memberships m where m.campaign_id = c.id),
         (select count(*) from public.characters ch where ch.campaign_id = c.id),
         c.created_at,
         v.shown,
         public.is_member(c.id)
  from public.campaigns c
  cross join lateral (select (c.owner_id = auth.uid() or exists (select 1 from public.head_reveals h where h.campaign_id = c.id)) as shown) v
  left join public.campaign_faces f on f.campaign_id = c.id and f.phase = ''
  left join public.profiles p on p.id = c.owner_id
  where public.is_head()
  order by c.created_at;
$$;
revoke all on function public.admin_campaigns() from public, anon;
grant execute on function public.admin_campaigns() to authenticated;

-- ---------------------------------------------------------------- feedback email

alter table public.feedback add column if not exists email_error text not null default '';

notify pgrst, 'reload schema';
