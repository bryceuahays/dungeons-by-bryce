-- Dungeons by Bryce: schema, row-level security, and helper functions.
-- Every table has RLS on. A player's own token can only ever reach player rows.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

-- Private settings (for example the DM's email). No policies: only the
-- service role and security-definer functions can read it.
create table public.app_config (
  key   text primary key,
  value text not null
);

create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  email        text not null default '',
  role         text not null default 'player' check (role in ('dm', 'player')),
  created_at   timestamptz not null default now()
);

create table public.campaigns (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  title      text not null,
  tagline    text not null default '',
  status     text not null default 'active',
  phase      text not null default '',
  phases     jsonb not null default '[]'::jsonb,  -- [{id, label}] the DM can switch between
  theme      jsonb not null default '{}'::jsonb,  -- design tokens, applied as CSS variables
  created_at timestamptz not null default now()
);

create table public.memberships (
  user_id     uuid not null references public.profiles on delete cascade,
  campaign_id uuid not null references public.campaigns on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (user_id, campaign_id)
);

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns on delete cascade,
  code        text not null unique,
  uses_left   int,                 -- null means unlimited
  expires_at  timestamptz,         -- null means never
  revoked     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- The tabs inside a campaign. kind 'content' renders content rows; the other
-- kinds are built-in features placed in the tab bar.
create table public.sections (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns on delete cascade,
  slug        text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,40}$'),
  title       text not null,
  sort        int not null default 0,
  audience    text not null default 'all' check (audience in ('all', 'dm', 'player')),
  kind        text not null default 'content' check (kind in ('content', 'sheet', 'combat', 'sessions', 'players')),
  unique (campaign_id, slug)
);

-- One row per card, list, or block.
-- visibility 'player': players and the DM see it. 'dm': only the DM.
-- When a 'dm' row and a 'player' row share (section, key), the DM gets the
-- 'dm' wording and players get the 'player' wording.
create table public.content (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns on delete cascade,
  section     text not null,
  kind        text not null,
  key         text not null,
  sort        int not null default 0,
  title       text not null default '',
  body        jsonb not null default '{}'::jsonb,
  visibility  text not null default 'dm' check (visibility in ('player', 'dm')),
  phase       text,
  hidden      boolean not null default false,
  updated_at  timestamptz not null default now()
);
create index content_lookup on public.content (campaign_id, section, sort);

-- Rules data for the character builder, scoped to a campaign.
-- kind: race, race-phase, class, spell, background, armor, weapon, divine, misc, phase-config
create table public.rules (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns on delete cascade,
  kind        text not null,
  key         text not null,
  sort        int not null default 0,
  data        jsonb not null default '{}'::jsonb,
  phase       text
);
create unique index rules_key on public.rules (campaign_id, kind, key, coalesce(phase, ''));

create table public.characters (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references public.profiles on delete cascade,
  campaign_id uuid not null references public.campaigns on delete cascade,
  data        jsonb not null default '{}'::jsonb,  -- the character sheet (shape of blank() in the player guide)
  builder     jsonb,                               -- the builder's working state, so a build can be resumed
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index characters_campaign on public.characters (campaign_id);
create index characters_owner on public.characters (owner);

create table public.sessions (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns on delete cascade,
  number      int not null,
  title       text not null,
  summary     text not null default '',
  meta        text not null default '',
  status      text not null default 'planned',
  content     jsonb not null default '{}'::jsonb,  -- the run sheet
  state       jsonb not null default '{}'::jsonb,  -- live trackers
  updated_at  timestamptz not null default now(),
  unique (campaign_id, number)
);

create table public.media (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns on delete cascade,
  key          text not null,   -- phase-neutral name, e.g. v/aarakocra.mp4
  path         text not null,   -- object path in the private bucket
  phase        text,
  content_type text not null default ''
);
create unique index media_key on public.media (campaign_id, key, coalesce(phase, ''));

-- ---------------------------------------------------------------- helpers

create or replace function public.is_dm()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'dm');
$$;

create or replace function public.is_member(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where user_id = auth.uid() and campaign_id = c);
$$;

create or replace function public.campaign_phase(c uuid)
returns text language sql stable security definer set search_path = public as $$
  select phase from public.campaigns where id = c;
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger characters_touch before update on public.characters
  for each row execute function public.touch_updated_at();
create trigger content_touch before update on public.content
  for each row execute function public.touch_updated_at();
create trigger sessions_touch before update on public.sessions
  for each row execute function public.touch_updated_at();

-- New account: create its profile. The DM role goes to the configured email only.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  dm_email text;
  shown text;
begin
  select lower(value) into dm_email from public.app_config where key = 'dm_email';
  shown := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, ''), '@', 1));
  insert into public.profiles (id, display_name, email, role)
  values (
    new.id,
    left(shown, 60),
    coalesce(new.email, ''),
    case when dm_email is not null and lower(coalesce(new.email, '')) = dm_email then 'dm' else 'player' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Join a campaign with an invite code the DM generated.
create or replace function public.join_campaign(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  inv public.invites%rowtype;
  joined int;
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
  insert into public.memberships (user_id, campaign_id) values (auth.uid(), inv.campaign_id)
    on conflict do nothing;
  get diagnostics joined = row_count;
  if joined > 0 and inv.uses_left is not null then
    update public.invites set uses_left = uses_left - 1 where id = inv.id;
  end if;
  select slug into out_slug from public.campaigns where id = inv.campaign_id;
  return out_slug;
end $$;

-- The only thing a player may learn about other characters in their campaign.
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
    and (public.is_dm() or public.is_member(c));
$$;

revoke all on function public.join_campaign(text) from public, anon;
revoke all on function public.party_cards(uuid) from public, anon;
grant execute on function public.join_campaign(text) to authenticated;
grant execute on function public.party_cards(uuid) to authenticated;

-- ---------------------------------------------------------------- row-level security

alter table public.app_config  enable row level security;
alter table public.profiles    enable row level security;
alter table public.campaigns   enable row level security;
alter table public.memberships enable row level security;
alter table public.invites     enable row level security;
alter table public.sections    enable row level security;
alter table public.content     enable row level security;
alter table public.rules       enable row level security;
alter table public.characters  enable row level security;
alter table public.sessions    enable row level security;
alter table public.media       enable row level security;

-- Nothing is public: signed-out visitors get no table access at all.
revoke all on all tables in schema public from anon;

-- profiles: your own row, or every row for the DM. Players may only change their display name.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_dm());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- campaigns
create policy campaigns_select on public.campaigns for select to authenticated
  using (public.is_dm() or public.is_member(id));
create policy campaigns_dm on public.campaigns for all to authenticated
  using (public.is_dm()) with check (public.is_dm());

-- memberships: created only through join_campaign(). The DM can remove members.
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_dm());
create policy memberships_dm_delete on public.memberships for delete to authenticated
  using (public.is_dm());
revoke insert, update on public.memberships from authenticated;

-- invites: DM only
create policy invites_dm on public.invites for all to authenticated
  using (public.is_dm()) with check (public.is_dm());

-- sections
create policy sections_select on public.sections for select to authenticated
  using (public.is_dm() or (public.is_member(campaign_id) and audience in ('all', 'player')));
create policy sections_dm on public.sections for all to authenticated
  using (public.is_dm()) with check (public.is_dm());

-- content: players get player rows of their campaigns, for the current phase, not hidden
create policy content_select on public.content for select to authenticated
  using (
    public.is_dm()
    or (
      public.is_member(campaign_id)
      and visibility = 'player'
      and not hidden
      and (phase is null or phase = public.campaign_phase(campaign_id))
    )
  );
create policy content_dm on public.content for all to authenticated
  using (public.is_dm()) with check (public.is_dm());

-- rules
create policy rules_select on public.rules for select to authenticated
  using (
    public.is_dm()
    or (public.is_member(campaign_id) and (phase is null or phase = public.campaign_phase(campaign_id)))
  );
create policy rules_dm on public.rules for all to authenticated
  using (public.is_dm()) with check (public.is_dm());

-- characters: the owner and the DM. Other players use party_cards().
create policy characters_select on public.characters for select to authenticated
  using (owner = auth.uid() or public.is_dm());
create policy characters_insert on public.characters for insert to authenticated
  with check (owner = auth.uid() and public.is_member(campaign_id));
create policy characters_update on public.characters for update to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and public.is_member(campaign_id));
create policy characters_delete on public.characters for delete to authenticated
  using (owner = auth.uid());
create policy characters_dm on public.characters for all to authenticated
  using (public.is_dm()) with check (public.is_dm());

-- sessions: DM only
create policy sessions_dm on public.sessions for all to authenticated
  using (public.is_dm()) with check (public.is_dm());

-- media: rows for the current phase only
create policy media_select on public.media for select to authenticated
  using (
    public.is_dm()
    or (public.is_member(campaign_id) and (phase is null or phase = public.campaign_phase(campaign_id)))
  );
create policy media_dm on public.media for all to authenticated
  using (public.is_dm()) with check (public.is_dm());

-- ---------------------------------------------------------------- realtime and storage

-- The DM's Players tab listens for character changes.
alter publication supabase_realtime add table public.characters;

-- Private bucket. There are deliberately no storage policies for signed-in
-- users: only the server (service role) can read objects or sign URLs.
insert into storage.buckets (id, name, public)
values ('campaign-media', 'campaign-media', false)
on conflict (id) do nothing;
