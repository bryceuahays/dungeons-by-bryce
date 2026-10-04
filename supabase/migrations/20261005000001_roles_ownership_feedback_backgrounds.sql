-- Roles, per-campaign DMs, feedback, and uploaded backgrounds.
--
-- Until now there was one DM for the whole site. From here on:
--   * every account can create campaigns and is the DM of the campaigns it owns
--   * the same account is a player in campaigns it joins with an invite code
--   * one account is the Head DM (the site owner): it receives feedback, can list and
--     delete any campaign, and is the only one who can write character-builder rules
--     (those rules contain small formulas that run in players' browsers, so they are not
--     something every DM may author; other DMs copy an existing rule set instead)
--   * the Head DM is NOT automatically the DM of other people's campaigns, so they can
--     join a friend's campaign as a player without seeing its secrets
--
-- Every policy that used to ask "is this the DM?" now asks "is this the DM of THIS campaign?".

-- ---------------------------------------------------------------- roles and ownership

alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'head' where role = 'dm';
alter table public.profiles add constraint profiles_role_check check (role in ('head', 'player'));
alter table public.profiles add column if not exists hub_bg jsonb not null default '{}'::jsonb;
grant update (display_name, hub_bg) on public.profiles to authenticated;

alter table public.campaigns add column if not exists owner_id uuid references public.profiles on delete cascade default auth.uid();
alter table public.campaigns add column if not exists background jsonb not null default '{}'::jsonb;
update public.campaigns set owner_id = (select id from public.profiles where role = 'head' order by created_at limit 1) where owner_id is null;
create index if not exists campaigns_owner on public.campaigns (owner_id);

-- a membership can also make someone a co-DM of a campaign (no screen for this yet)
alter table public.memberships add column if not exists role text not null default 'player' check (role in ('player', 'dm'));

create or replace function public.is_head()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'head');
$$;

create or replace function public.is_campaign_dm(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.campaigns where id = c and owner_id = auth.uid())
      or exists (select 1 from public.memberships where campaign_id = c and user_id = auth.uid() and role = 'dm');
$$;
grant execute on function public.is_head() to authenticated;
grant execute on function public.is_campaign_dm(uuid) to authenticated;

-- New account: the configured email becomes the Head DM and takes over any campaign that has no owner yet.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  head_email text;
  shown text;
  is_head_account boolean;
begin
  select lower(value) into head_email from public.app_config where key = 'dm_email';
  shown := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, ''), '@', 1));
  is_head_account := head_email is not null and lower(coalesce(new.email, '')) = head_email;
  insert into public.profiles (id, display_name, email, role)
  values (new.id, left(shown, 60), coalesce(new.email, ''), case when is_head_account then 'head' else 'player' end)
  on conflict (id) do nothing;
  if is_head_account then
    update public.campaigns set owner_id = new.id where owner_id is null;
  end if;
  return new;
end $$;

-- nobody but the Head DM may own more than 10 campaigns
create or replace function public.campaign_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null and not exists (select 1 from public.profiles where id = new.owner_id and role = 'head')
     and (select count(*) from public.campaigns where owner_id = new.owner_id) >= 10 then
    raise exception 'campaign limit reached';
  end if;
  return new;
end $$;
drop trigger if exists campaigns_limit on public.campaigns;
create trigger campaigns_limit before insert on public.campaigns
  for each row execute function public.campaign_limit();

-- ---------------------------------------------------------------- helper functions that asked "is this the DM?"

create or replace function public.private_open(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_campaign_dm(c) or exists (
    select 1 from public.rules r
    where r.campaign_id = c and r.kind = 'sheet-private' and r.key = 'fields'
      and (r.phase is null or r.phase = public.campaign_phase(c)));
$$;

create or replace function public.campaign_alias(p_slug text)
returns text language sql stable security definer set search_path = public as $$
  select c.slug
  from public.campaign_faces f
  join public.campaigns c on c.id = f.campaign_id
  where f.slug = p_slug
    and c.slug <> p_slug
    and (public.is_campaign_dm(c.id) or (public.is_member(c.id) and f.phase <> ''))
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
    and (public.is_campaign_dm(c) or public.is_member(c));
$$;

-- the owner of a campaign does not need an invite to their own campaign
create or replace function public.join_campaign(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  inv public.invites%rowtype;
  joined int := 0;
  out_slug text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select * into inv from public.invites
    where code = upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'))
    for update;
  if not found or inv.revoked
     or (inv.expires_at is not null and inv.expires_at < now())
     or (inv.uses_left is not null and inv.uses_left <= 0) then
    raise exception 'invalid invite code';
  end if;
  if not exists (select 1 from public.campaigns where id = inv.campaign_id and owner_id = auth.uid()) then
    insert into public.memberships (user_id, campaign_id) values (auth.uid(), inv.campaign_id)
      on conflict do nothing;
    get diagnostics joined = row_count;
  end if;
  if joined > 0 and inv.uses_left is not null then
    update public.invites set uses_left = uses_left - 1 where id = inv.id;
  end if;
  select slug into out_slug from public.campaigns where id = inv.campaign_id;
  return out_slug;
end $$;

-- A campaign's DM sees who has joined (names only; emails stay private to each account and the Head DM).
create or replace function public.campaign_members(c uuid)
returns table (user_id uuid, display_name text, joined_at timestamptz, role text)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.display_name, m.joined_at, m.role
  from public.memberships m join public.profiles p on p.id = m.user_id
  where m.campaign_id = c and public.is_campaign_dm(c)
  order by m.joined_at;
$$;
revoke all on function public.campaign_members(uuid) from public, anon;
grant execute on function public.campaign_members(uuid) to authenticated;

-- Delete a campaign and everything in it. Its owner can; so can the Head DM.
create or replace function public.delete_campaign(c uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_head() or exists (select 1 from public.campaigns where id = c and owner_id = auth.uid())) then
    raise exception 'not allowed';
  end if;
  delete from public.character_private where character_id in (select id from public.characters where campaign_id = c);
  delete from public.campaigns where id = c;
end $$;
revoke all on function public.delete_campaign(uuid) from public, anon;
grant execute on function public.delete_campaign(uuid) to authenticated;

-- Start a campaign from another campaign's character rules and sheet. The caller must be
-- the DM of the new campaign, and the DM or a member of the one copied from. A member
-- only gets the rows a member can read anyway (no phase-specific rows).
create or replace function public.copy_campaign_rules(src uuid, dst uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  whole boolean := public.is_campaign_dm(src);
  n int;
begin
  if not public.is_campaign_dm(dst) or not (whole or public.is_member(src)) then
    raise exception 'not allowed';
  end if;
  insert into public.rules (campaign_id, kind, key, sort, data, phase)
    select dst, r.kind, r.key, r.sort, r.data, r.phase from public.rules r
    where r.campaign_id = src and (whole or r.phase is null)
    on conflict do nothing;
  get diagnostics n = row_count;
  insert into public.content (campaign_id, section, kind, key, sort, title, body, visibility, phase)
    select dst, t.section, t.kind, t.key, t.sort, t.title, t.body, t.visibility, t.phase from public.content t
    where t.campaign_id = src and t.kind in ('sheet-template', 'sheet-slot') and (whole or t.phase is null)
      and not exists (select 1 from public.content x where x.campaign_id = dst and x.kind = t.kind and x.key = t.key);
  return n;
end $$;
revoke all on function public.copy_campaign_rules(uuid, uuid) from public, anon;
grant execute on function public.copy_campaign_rules(uuid, uuid) to authenticated;

-- The Head DM's list of every campaign on the site (no content, just what is needed to manage them).
create or replace function public.admin_campaigns()
returns table (id uuid, owner_id uuid, slug text, title text, owner_name text, owner_email text, members bigint, characters bigint, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.owner_id, c.slug, coalesce(f.title, c.title), coalesce(p.display_name, ''), coalesce(p.email, ''),
         (select count(*) from public.memberships m where m.campaign_id = c.id),
         (select count(*) from public.characters ch where ch.campaign_id = c.id),
         c.created_at
  from public.campaigns c
  left join public.campaign_faces f on f.campaign_id = c.id and f.phase = ''
  left join public.profiles p on p.id = c.owner_id
  where public.is_head()
  order by c.created_at;
$$;
revoke all on function public.admin_campaigns() from public, anon;
grant execute on function public.admin_campaigns() to authenticated;

-- ---------------------------------------------------------------- feedback

create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles on delete set null,
  name       text not null default '',
  email      text not null default '',
  message    text not null check (char_length(message) between 1 and 4000),
  emailed    boolean not null default false,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon;
revoke insert on public.feedback from authenticated;
drop policy if exists feedback_head on public.feedback;
create policy feedback_head on public.feedback for all to authenticated
  using (public.is_head()) with check (public.is_head());

-- Anyone signed in can send a note; at most 5 an hour each.
create or replace function public.submit_feedback(p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me public.profiles%rowtype;
  new_id uuid;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then raise exception 'not signed in'; end if;
  if (select count(*) from public.feedback where user_id = me.id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too many';
  end if;
  insert into public.feedback (user_id, name, email, message)
  values (me.id, me.display_name, me.email, left(trim(p_message), 4000))
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.submit_feedback(text) from public, anon;
grant execute on function public.submit_feedback(text) to authenticated;

-- ---------------------------------------------------------------- policies, per campaign

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_head());

drop policy if exists campaigns_select on public.campaigns;
drop policy if exists campaigns_dm on public.campaigns;
create policy campaigns_select on public.campaigns for select to authenticated
  using (owner_id = auth.uid() or public.is_member(id));
create policy campaigns_insert on public.campaigns for insert to authenticated
  with check (owner_id = auth.uid());
create policy campaigns_update on public.campaigns for update to authenticated
  using (public.is_campaign_dm(id)) with check (public.is_campaign_dm(id));
create policy campaigns_delete on public.campaigns for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists campaign_faces_dm on public.campaign_faces;
create policy campaign_faces_dm on public.campaign_faces for all to authenticated
  using (public.is_campaign_dm(campaign_id)) with check (public.is_campaign_dm(campaign_id));

drop policy if exists memberships_select on public.memberships;
drop policy if exists memberships_dm_delete on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_campaign_dm(campaign_id));
create policy memberships_delete on public.memberships for delete to authenticated
  using (user_id = auth.uid() or public.is_campaign_dm(campaign_id));

drop policy if exists invites_dm on public.invites;
create policy invites_dm on public.invites for all to authenticated
  using (public.is_campaign_dm(campaign_id)) with check (public.is_campaign_dm(campaign_id));

drop policy if exists sections_select on public.sections;
drop policy if exists sections_dm on public.sections;
create policy sections_select on public.sections for select to authenticated
  using (
    public.is_campaign_dm(campaign_id)
    or (public.is_member(campaign_id) and audience in ('all', 'player') and (phase is null or phase = public.campaign_phase(campaign_id)))
  );
create policy sections_dm on public.sections for all to authenticated
  using (public.is_campaign_dm(campaign_id)) with check (public.is_campaign_dm(campaign_id));

drop policy if exists content_select on public.content;
drop policy if exists content_dm on public.content;
create policy content_select on public.content for select to authenticated
  using (
    public.is_campaign_dm(campaign_id)
    or (public.is_member(campaign_id) and visibility = 'player' and not hidden and (phase is null or phase = public.campaign_phase(campaign_id)))
  );
create policy content_dm on public.content for all to authenticated
  using (public.is_campaign_dm(campaign_id)) with check (public.is_campaign_dm(campaign_id));

-- rules and campaign media: readable like content; written only by the Head DM, in campaigns they run
drop policy if exists rules_select on public.rules;
drop policy if exists rules_dm on public.rules;
create policy rules_select on public.rules for select to authenticated
  using (
    public.is_campaign_dm(campaign_id)
    or (public.is_member(campaign_id) and (phase is null or phase = public.campaign_phase(campaign_id)))
  );
create policy rules_head on public.rules for all to authenticated
  using (public.is_head() and public.is_campaign_dm(campaign_id)) with check (public.is_head() and public.is_campaign_dm(campaign_id));

drop policy if exists media_select on public.media;
drop policy if exists media_dm on public.media;
create policy media_select on public.media for select to authenticated
  using (
    public.is_campaign_dm(campaign_id)
    or (public.is_member(campaign_id) and (phase is null or phase = public.campaign_phase(campaign_id)))
  );
create policy media_head on public.media for all to authenticated
  using (public.is_head() and public.is_campaign_dm(campaign_id)) with check (public.is_head() and public.is_campaign_dm(campaign_id));

drop policy if exists characters_select on public.characters;
drop policy if exists characters_insert on public.characters;
drop policy if exists characters_update on public.characters;
drop policy if exists characters_delete on public.characters;
drop policy if exists characters_dm on public.characters;
create policy characters_select on public.characters for select to authenticated
  using (owner = auth.uid() or public.is_campaign_dm(campaign_id));
create policy characters_insert on public.characters for insert to authenticated
  with check (owner = auth.uid() and (public.is_member(campaign_id) or public.is_campaign_dm(campaign_id)));
create policy characters_update on public.characters for update to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and (public.is_member(campaign_id) or public.is_campaign_dm(campaign_id)));
create policy characters_delete on public.characters for delete to authenticated
  using (owner = auth.uid());
create policy characters_dm on public.characters for all to authenticated
  using (public.is_campaign_dm(campaign_id)) with check (public.is_campaign_dm(campaign_id));

drop policy if exists character_private_select on public.character_private;
create policy character_private_select on public.character_private for select to authenticated
  using (
    exists (
      select 1 from public.characters ch
      where ch.id = character_id
        and (public.is_campaign_dm(ch.campaign_id) or (ch.owner = auth.uid() and public.private_open(ch.campaign_id)))
    )
  );

drop policy if exists sessions_dm on public.sessions;
create policy sessions_dm on public.sessions for all to authenticated
  using (public.is_campaign_dm(campaign_id)) with check (public.is_campaign_dm(campaign_id));

-- the old site-wide check is gone; nothing may use it any more
drop function if exists public.is_dm();

-- ---------------------------------------------------------------- uploaded backgrounds

-- A private bucket. Objects are named user/<account id>/<wide|tall> for a person's own
-- hub background and campaign/<campaign id>/<wide|tall> for a campaign's.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backgrounds', 'backgrounds', false, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types, public = false;

create or replace function public.background_allowed(name text, writing boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when split_part(name, '/', 1) = 'user' then split_part(name, '/', 2) = auth.uid()::text
    when split_part(name, '/', 1) = 'campaign'
         and split_part(name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_campaign_dm(split_part(name, '/', 2)::uuid)
           or (not writing and public.is_member(split_part(name, '/', 2)::uuid))
    else false
  end;
$$;

drop policy if exists backgrounds_read on storage.objects;
drop policy if exists backgrounds_insert on storage.objects;
drop policy if exists backgrounds_update on storage.objects;
drop policy if exists backgrounds_delete on storage.objects;
create policy backgrounds_read on storage.objects for select to authenticated
  using (bucket_id = 'backgrounds' and public.background_allowed(name, false));
create policy backgrounds_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'backgrounds' and public.background_allowed(name, true));
create policy backgrounds_update on storage.objects for update to authenticated
  using (bucket_id = 'backgrounds' and public.background_allowed(name, true))
  with check (bucket_id = 'backgrounds' and public.background_allowed(name, true));
create policy backgrounds_delete on storage.objects for delete to authenticated
  using (bucket_id = 'backgrounds' and public.background_allowed(name, true));
