-- Commercial build, phases 11 to 13: theme presets, commission requests, the store, and
-- the public demo. Additive only.

-- ================================================================ Phase 11: themes

-- Free campaigns use one of the default themes. Any other look (premium presets, custom
-- colours, fonts, a hero image) is part of Pro. A campaign's existing theme is never
-- changed or locked: the check only runs when the theme is being changed.
create or replace function public.campaign_theme_gate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;                       -- the site itself (seeding, delivering a purchase)
  if tg_op = 'UPDATE' and new.theme is not distinct from old.theme then return new; end if;
  if new.theme = '{}'::jsonb or public.is_pro(new.owner_id) or coalesce(new.purchased, false) then return new; end if;
  if exists (select 1 from jsonb_each(coalesce(public.plan_cfg() -> 'free_themes', '{}'::jsonb)) t where t.value = new.theme) then return new; end if;
  raise exception 'upgrade:themes premium themes and the theme editor are part of Pro';
end $$;

-- ================================================================ Phase 12: bought campaigns

-- A campaign delivered by the store. It does not count toward the free limit, stays
-- editable on any plan, and has every feature it was built with. Only the site sets this.
alter table public.campaigns add column if not exists purchased boolean not null default false;
alter table public.campaigns add column if not exists is_demo boolean not null default false;

create or replace function public.campaign_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then new.purchased := false; new.is_demo := false; end if;
  if new.purchased then return new; end if;
  if new.owner_id is not null and not public.is_pro(new.owner_id)
     and (select count(*) from public.campaigns where owner_id = new.owner_id and not purchased) >= public.free_limit('campaigns') then
    raise exception 'upgrade:campaigns limit reached';
  end if;
  return new;
end $$;

create or replace function public.campaign_flags_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (new.purchased is distinct from old.purchased or (new.is_demo is distinct from old.is_demo and not public.is_head())) then
    raise exception 'not allowed';
  end if;
  return new;
end $$;
drop trigger if exists campaigns_flags_guard on public.campaigns;
create trigger campaigns_flags_guard before update of purchased, is_demo on public.campaigns
  for each row execute function public.campaign_flags_guard();

drop trigger if exists campaigns_theme_gate on public.campaigns;
create trigger campaigns_theme_gate before insert or update of theme on public.campaigns
  for each row execute function public.campaign_theme_gate();

create or replace function public.campaign_writable(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select k.purchased or public.is_pro(k.owner_id)
        or (select count(*) from public.campaigns o where o.owner_id = k.owner_id and not o.purchased and (o.created_at, o.id) < (k.created_at, k.id)) < public.free_limit('campaigns')
    from public.campaigns k where k.id = c), false);
$$;
create or replace function public.campaign_feature(c uuid, feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select not (public.plan_cfg() -> 'pro_features') ? feature
      or coalesce((select purchased or public.is_pro(owner_id) from public.campaigns where id = c), false);
$$;
create or replace function public.campaign_access(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('pro', k.purchased or public.is_pro(k.owner_id), 'writable', public.campaign_writable(k.id))
  from public.campaigns k
  where k.slug = p_slug and (k.owner_id = auth.uid() or public.is_member(k.id) or public.head_sees(k.id));
$$;

-- The site itself (no signed-in user: delivering a purchase, seeding the demo) is not
-- held to plan limits. Limits are for accounts.
create or replace function public.entities_gate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or new.owner_id is null or public.is_pro(new.owner_id) then return new; end if;
  if tg_op = 'INSERT' and (select count(*) from public.entities where owner_id = new.owner_id) >= public.free_limit('homebrew') then
    raise exception 'upgrade:homebrew limit reached';
  end if;
  if new.depth <> 'quick' and (tg_op = 'INSERT' or old.depth = 'quick') then
    raise exception 'upgrade:homebrew_full Guided and Advanced modes are part of Pro';
  end if;
  return new;
end $$;

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

-- ================================================================ Phase 11: commission requests and handing a campaign over

create table if not exists public.commissions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles on delete set null,
  name        text not null default '',
  email       text not null,
  tier        text not null default '',
  pitch       text not null default '',
  tone        text not null default '',
  refs        text not null default '',
  players     text not null default '',
  deadline    text not null default '',
  status      text not null default 'new' check (status in ('new', 'talking', 'building', 'delivered', 'declined')),
  notes       text not null default '',
  campaign_id uuid references public.campaigns on delete set null,
  emailed     boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.commissions enable row level security;
revoke all on public.commissions from anon;
revoke insert on public.commissions from authenticated;
drop policy if exists commissions_head on public.commissions;
create policy commissions_head on public.commissions for all to authenticated using (public.is_head()) with check (public.is_head());

-- Hand a campaign to another account (a client). The owner or the Head DM can do it; the
-- new owner must already have an account. Players and everything in the campaign stay.
create or replace function public.transfer_campaign(c uuid, to_email text)
returns text language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if not (public.is_head() or exists (select 1 from public.campaigns where id = c and owner_id = auth.uid())) then
    raise exception 'not allowed';
  end if;
  select id into target from public.profiles where lower(email) = lower(trim(to_email));
  if target is null then raise exception 'no account'; end if;
  delete from public.memberships where campaign_id = c and user_id = target;
  delete from public.head_reveals where campaign_id = c;
  -- a commissioned campaign is delivered like a bought one: it never counts against the client's free limit
  update public.campaigns set owner_id = target, purchased = true where id = c;
  return (select display_name from public.profiles where id = target);
end $$;
revoke all on function public.transfer_campaign(uuid, text) from public, anon;
grant execute on function public.transfer_campaign(uuid, text) to authenticated;
-- transfer_campaign sets `purchased` while a user is signed in, which the guard above refuses: let this one function through
create or replace function public.campaign_flags_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and current_setting('dbb.transfer', true) is distinct from 'on'
     and (new.purchased is distinct from old.purchased or (new.is_demo is distinct from old.is_demo and not public.is_head())) then
    raise exception 'not allowed';
  end if;
  return new;
end $$;
create or replace function public.transfer_campaign(c uuid, to_email text)
returns text language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if not (public.is_head() or exists (select 1 from public.campaigns where id = c and owner_id = auth.uid())) then
    raise exception 'not allowed';
  end if;
  select id into target from public.profiles where lower(email) = lower(trim(to_email));
  if target is null then raise exception 'no account'; end if;
  delete from public.memberships where campaign_id = c and user_id = target;
  delete from public.head_reveals where campaign_id = c;
  perform set_config('dbb.transfer', 'on', true);
  update public.campaigns set owner_id = target, purchased = true where id = c;
  perform set_config('dbb.transfer', 'off', true);
  return (select display_name from public.profiles where id = target);
end $$;

-- ================================================================ Phase 12: the store

create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  seller_id   uuid not null references public.profiles on delete cascade default auth.uid(),
  campaign_id uuid references public.campaigns on delete set null,   -- where it was published from
  title       text not null,
  pitch       text not null default '',
  cover       text not null default '',            -- path in the public "store" bucket
  includes    jsonb not null default '[]'::jsonb,  -- what the buyer gets, one line each
  preview     jsonb not null default '[]'::jsonb,  -- free preview pages: [{title, html}], already made safe
  theme       jsonb not null default '{}'::jsonb,
  price_cents int not null default 0 check (price_cents >= 0),
  status      text not null default 'draft' check (status in ('draft', 'live')),
  site_cut    numeric not null default 0,          -- share the site keeps when someone else is the seller (not used yet)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- The frozen copy of the campaign, DM secrets included. No policies: only the site's own
-- server reads it, to deliver a purchase.
create table if not exists public.product_snapshots (
  product_id uuid primary key references public.products on delete cascade,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;
alter table public.product_snapshots enable row level security;
revoke all on public.product_snapshots from anon, authenticated;
revoke all on public.products from anon;
grant select on public.products to anon;
drop policy if exists products_public on public.products;
create policy products_public on public.products for select to anon using (status = 'live');
drop policy if exists products_read on public.products;
create policy products_read on public.products for select to authenticated using (status = 'live' or seller_id = auth.uid() or public.is_head());
-- publishing is the site admin's alone for now (the table is shaped so sellers can come later)
drop policy if exists products_head on public.products;
create policy products_head on public.products for all to authenticated using (public.is_head()) with check (public.is_head());
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();

-- does a campaign hold anything that may never be sold?
create or replace function public.campaign_private_content(c uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'rules', (select count(*) from public.rules where campaign_id = c and source = 'private'),
    'entries', (select coalesce(jsonb_agg(e.name), '[]'::jsonb) from public.campaign_entities ce join public.entities e on e.id = ce.entity_id where ce.campaign_id = c and e.source = 'private'))
  where public.is_campaign_dm(c) or public.is_head();
$$;
revoke all on function public.campaign_private_content(uuid) from public, anon;
grant execute on function public.campaign_private_content(uuid) to authenticated;

-- product covers: a public bucket, written by the site admin
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store', 'store', true, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists store_write on storage.objects;
create policy store_write on storage.objects for all to authenticated
  using (bucket_id = 'store' and public.is_head()) with check (bucket_id = 'store' and public.is_head());

-- ================================================================ Phase 13: the public demo

-- One campaign can be opened to visitors who are not signed in, as a player would see it.
-- Signed-out visitors get the same rows a player gets (never DM rows), and only of a
-- campaign flagged as the demo.
create or replace function public.is_demo(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.campaigns where id = c and is_demo);
$$;
grant execute on function public.is_demo(uuid) to anon, authenticated;
grant execute on function public.stage_reached(uuid, text) to anon;
grant execute on function public.campaign_phase(uuid) to anon;
grant execute on function public.entry_open(uuid, text, uuid[], text, uuid) to anon;

grant select on public.campaigns, public.sections, public.content, public.entries, public.campaign_entities to anon;
drop policy if exists campaigns_demo on public.campaigns;
create policy campaigns_demo on public.campaigns for select to anon using (is_demo);
drop policy if exists sections_demo on public.sections;
create policy sections_demo on public.sections for select to anon
  using (public.is_demo(campaign_id) and audience in ('all', 'player') and (phase is null or phase = public.campaign_phase(campaign_id)) and public.stage_reached(campaign_id, from_stage));
drop policy if exists content_demo on public.content;
create policy content_demo on public.content for select to anon
  using (public.is_demo(campaign_id) and visibility = 'player' and not hidden and only_players is null
         and (phase is null or phase = public.campaign_phase(campaign_id)) and public.stage_reached(campaign_id, from_stage));
drop policy if exists entries_demo on public.entries;
create policy entries_demo on public.entries for select to anon
  using (public.is_demo(campaign_id) and live and kind in ('npc', 'beat', 'note', 'map', 'pin', 'clock', 'consequence', 'zero')
         and public.entry_open(campaign_id, vis, vis_players, vis_stage, vis_entry));
drop policy if exists campaign_entities_demo on public.campaign_entities;
create policy campaign_entities_demo on public.campaign_entities for select to anon
  using (public.is_demo(campaign_id) and vis = 'all');
drop policy if exists entities_demo on public.entities;
create policy entities_demo on public.entities for select to anon
  using (source = 'homebrew' and status = 'live' and exists (select 1 from public.campaign_entities ce where ce.entity_id = entities.id and public.is_demo(ce.campaign_id) and ce.vis = 'all'));

notify pgrst, 'reload schema';
