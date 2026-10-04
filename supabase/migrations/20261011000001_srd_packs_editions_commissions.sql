-- Follow-up build: full SRD (both versions), official and paid homebrew packs, two
-- editions of a campaign product, what a bought campaign unlocks, and the commission
-- workflow. Additive: nothing existing is dropped or rewritten.

-- ================================================================ Part 0: SRD versions

alter table public.entities add column if not exists srd_version text check (srd_version in ('5.1', '5.2'));
update public.entities set srd_version = '5.1' where source = 'srd' and srd_version is null;
alter table public.entities drop constraint if exists entities_srd_has_version;
alter table public.entities add constraint entities_srd_has_version check ((source = 'srd') = (srd_version is not null));
-- the same name can exist once per SRD version
drop index if exists public.entities_key;
create unique index entities_key on public.entities (coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), type, slug, coalesce(srd_version, ''));
create index if not exists entities_srd on public.entities (srd_version, type) where source = 'srd';
-- two more kinds of SRD reference entry
alter table public.entities drop constraint if exists entities_type_check;
alter table public.entities add constraint entities_type_check
  check (type in ('race', 'class', 'subclass', 'background', 'feat', 'spell', 'item', 'monster', 'resource', 'condition', 'rule'));
-- only SRD entries can be conditions or rules text (homebrew stays the nine kinds)
alter table public.entities drop constraint if exists entities_reference_is_srd;
alter table public.entities add constraint entities_reference_is_srd check (type not in ('condition', 'rule') or source = 'srd');

-- Which rules a campaign shows: 2014 (SRD 5.1), 2024 (SRD 5.2), or both. Every campaign
-- that exists today keeps what it sees today.
update public.campaigns set settings = settings || '{"rules": "2014"}'::jsonb where not (settings ? 'rules');

-- ================================================================ Parts 1 and 2: official and bought packs

-- 'own': made by the account (counts toward the free limit). 'product': arrived with
-- something bought or handed over (never counts).
alter table public.entities add column if not exists origin text not null default 'own' check (origin in ('own', 'product'));

alter table public.packs add column if not exists official boolean not null default false;  -- published by the site
alter table public.packs add column if not exists free boolean not null default false;      -- official and open to every account
create table if not exists public.pack_owners (
  user_id    uuid not null references public.profiles on delete cascade,
  pack_id    uuid not null references public.packs on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, pack_id)
);
alter table public.pack_owners enable row level security;
revoke all on public.pack_owners from anon;
revoke insert, update, delete on public.pack_owners from authenticated;
drop policy if exists pack_owners_own on public.pack_owners;
create policy pack_owners_own on public.pack_owners for select to authenticated using (user_id = auth.uid() or public.is_head());

-- only the site admin can mark a pack official or free
create or replace function public.packs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_head()
     and (new.official or new.free) and (tg_op = 'INSERT' or new.official is distinct from old.official or new.free is distinct from old.free) then
    raise exception 'not allowed';
  end if;
  return new;
end $$;
drop trigger if exists packs_guard on public.packs;
create trigger packs_guard before insert or update on public.packs for each row execute function public.packs_guard();

-- may the caller use this pack? their own; an official free one; or one they have bought
create or replace function public.pack_usable(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.packs k where k.id = p
    and (k.owner_id = auth.uid() or (k.official and k.free) or exists (select 1 from public.pack_owners o where o.pack_id = p and o.user_id = auth.uid())));
$$;
create or replace function public.entity_in_usable_pack(e uuid, st text)
returns boolean language sql stable security definer set search_path = public as $$
  select st <> 'draft' and exists (select 1 from public.pack_entities pe where pe.entity_id = e and public.pack_usable(pe.pack_id));
$$;
revoke all on function public.pack_usable(uuid), public.entity_in_usable_pack(uuid, text) from public, anon;
grant execute on function public.pack_usable(uuid), public.entity_in_usable_pack(uuid, text) to authenticated;

drop policy if exists entities_select on public.entities;
create policy entities_select on public.entities for select to authenticated
  using (source = 'srd' or owner_id = auth.uid() or public.entity_shared(id, status) or public.entity_in_usable_pack(id, status));
drop policy if exists packs_usable on public.packs;
create policy packs_usable on public.packs for select to authenticated using (public.pack_usable(id));
drop policy if exists pack_entities_usable on public.pack_entities;
create policy pack_entities_usable on public.pack_entities for select to authenticated using (public.pack_usable(pack_id));

-- Attach every entry of a pack the caller may use to a campaign they run. One click.
-- Private entries never travel in a pack.
create or replace function public.attach_pack(p uuid, c uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.can_edit(c) or not public.pack_usable(p) then raise exception 'not allowed'; end if;
  insert into public.campaign_entities (campaign_id, entity_id, pack_id)
    select c, e.id, p from public.pack_entities pe join public.entities e on e.id = pe.entity_id
    where pe.pack_id = p and e.source <> 'private' and e.status <> 'draft'
    on conflict (campaign_id, entity_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.attach_pack(uuid, uuid) from public, anon;
grant execute on function public.attach_pack(uuid, uuid) to authenticated;

-- only entries an account made itself count toward the free limit
create or replace function public.entities_gate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or new.owner_id is null then return new; end if;
  new.origin := case when tg_op = 'UPDATE' then old.origin else 'own' end;   -- an account cannot label its own work as bought
  if public.is_pro(new.owner_id) then return new; end if;
  if tg_op = 'INSERT' and (select count(*) from public.entities where owner_id = new.owner_id and origin = 'own') >= public.free_limit('homebrew') then
    raise exception 'upgrade:homebrew limit reached';
  end if;
  if new.depth <> 'quick' and (tg_op = 'INSERT' or old.depth = 'quick') then
    raise exception 'upgrade:homebrew_full Guided and Advanced modes are part of Pro';
  end if;
  return new;
end $$;
drop trigger if exists entities_gate on public.entities;
create trigger entities_gate before insert or update of depth, origin on public.entities
  for each row execute function public.entities_gate();

-- ================================================================ Part 3: packs and editions as products; spoiler protection

alter table public.products add column if not exists kind text not null default 'campaign' check (kind in ('campaign', 'pack'));
alter table public.products add column if not exists pack_id uuid references public.packs on delete set null;
alter table public.products add column if not exists edition text check (edition in ('full', 'framework'));
alter table public.products add column if not exists full_product uuid references public.products on delete set null;  -- on a framework: its full edition
alter table public.products add column if not exists spoiler_campaign uuid references public.campaigns on delete set null;
alter table public.purchases add column if not exists campaign_id uuid references public.campaigns on delete set null; -- the copy that was delivered
alter table public.purchases drop constraint if exists purchases_kind_check;
alter table public.purchases add constraint purchases_kind_check check (kind in ('founder', 'product', 'subscription', 'commission'));
-- a campaign made from another (a framework, a publishable copy) remembers where it came from
alter table public.campaigns add column if not exists copied_from uuid references public.campaigns on delete set null;

-- A listing is never shown to someone who plays in the campaign it was made from. A
-- signed-out visitor could be anyone, so while that campaign has players the listing is
-- shown to signed-in accounts only.
create or replace function public.product_spoiler_safe(spoiler uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select spoiler is null or not exists (
    select 1 from public.memberships m
    where (m.campaign_id = spoiler or m.campaign_id = (select copied_from from public.campaigns where id = spoiler))
      and (auth.uid() is null or m.user_id = auth.uid()));
$$;
grant execute on function public.product_spoiler_safe(uuid) to anon, authenticated;
drop policy if exists products_public on public.products;
create policy products_public on public.products for select to anon using (status = 'live' and public.product_spoiler_safe(spoiler_campaign));
drop policy if exists products_read on public.products;
create policy products_read on public.products for select to authenticated
  using ((status = 'live' and public.product_spoiler_safe(spoiler_campaign)) or seller_id = auth.uid() or public.is_head());

-- ================================================================ Part 4: what a bought campaign unlocks

-- Using what was delivered works on any plan (campaign_feature). MAKING something new of
-- a Pro-only kind needs Pro, bought campaign or not (campaign_can_create).
create or replace function public.campaign_can_create(c uuid, feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select not (public.plan_cfg() -> 'pro_features') ? feature
      or coalesce((select public.is_pro(owner_id) from public.campaigns where id = c), false);
$$;
revoke all on function public.campaign_can_create(uuid, text) from public, anon;
grant execute on function public.campaign_can_create(uuid, text) to authenticated;

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
    -- notes on a beat, and pins on a map, that players add to things already in the campaign use what is there
    if new.kind in ('note', 'pin') and not public.is_campaign_dm(new.campaign_id) and public.campaign_feature(new.campaign_id, feature) then feature := null; end if;
  else
    if new.kind = 'pin' and new.vis_entry is not null and old.vis_entry is null then feature := 'maps_plus'; end if;
    if new.vis = 'players' and old.vis <> 'players' and new.kind not in ('beat', 'note', 'pin') then feature := 'player_secrets'; end if;
  end if;
  if feature is not null and not public.campaign_can_create(new.campaign_id, feature) then
    raise exception 'upgrade:% is part of Pro', feature;
  end if;
  return new;
end $$;

create or replace function public.content_gate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.only_players is not null and (tg_op = 'INSERT' or old.only_players is null)
     and not public.campaign_can_create(new.campaign_id, 'player_secrets') then
    raise exception 'upgrade:player_secrets blocks for named players are part of Pro';
  end if;
  return new;
end $$;

drop policy if exists player_notes_dm on public.player_notes;
create policy player_notes_dm on public.player_notes for all to authenticated
  using (kind = 'secret' and public.can_edit(campaign_id))
  with check (kind = 'secret' and public.can_edit(campaign_id) and public.campaign_can_create(campaign_id, 'player_secrets')
              and exists (select 1 from public.memberships m where m.campaign_id = player_notes.campaign_id and m.user_id = player_notes.user_id));

-- a bought campaign keeps the theme it came with; changing to a premium or custom look is Pro
create or replace function public.campaign_theme_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare fallback jsonb;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.theme is not distinct from old.theme then return new; end if;
  if new.theme = '{}'::jsonb or public.is_pro(new.owner_id) then return new; end if;
  if exists (select 1 from jsonb_each(coalesce(public.plan_cfg() -> 'free_themes', '{}'::jsonb)) t where t.value = new.theme) then return new; end if;
  if tg_op = 'INSERT' then
    select t.value into fallback from jsonb_each(coalesce(public.plan_cfg() -> 'free_themes', '{}'::jsonb)) t order by (t.key = 'slate') desc limit 1;
    new.theme := coalesce(fallback, '{}'::jsonb);
    return new;
  end if;
  raise exception 'upgrade:themes premium themes and the theme editor are part of Pro';
end $$;

-- ================================================================ Part 6: Pro months, and the commission workflow

alter table public.profiles add column if not exists pro_until timestamptz;   -- Pro months that came with a commission
create or replace function public.is_pro(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = u and (role = 'head' or comp or pro_until > now()))
      or exists (select 1 from public.subscriptions s where s.user_id = u
                 and (s.plan = 'founder' or (s.status in ('active', 'trialing', 'past_due')
                      and (s.current_period_end is null or s.current_period_end > now() - interval '3 days'))));
$$;
create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pro', public.is_pro(auth.uid()),
    'comp', coalesce((select role = 'head' or comp from public.profiles where id = auth.uid()), false),
    'plan', (select plan from public.subscriptions where user_id = auth.uid()),
    'status', (select status from public.subscriptions where user_id = auth.uid()),
    'until', (select current_period_end from public.subscriptions where user_id = auth.uid()),
    'gift_until', (select pro_until from public.profiles where id = auth.uid() and pro_until > now()),
    'campaigns', (select count(*) from public.campaigns where owner_id = auth.uid() and not purchased),
    'homebrew', (select count(*) from public.entities where owner_id = auth.uid() and origin = 'own'));
$$;
create or replace function public.campaign_access(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('pro', k.purchased or public.is_pro(k.owner_id), 'creator', public.is_pro(k.owner_id), 'writable', public.campaign_writable(k.id))
  from public.campaigns k
  where k.slug = p_slug and (k.owner_id = auth.uid() or public.is_member(k.id) or public.head_sees(k.id));
$$;

alter table public.commissions add column if not exists material text not null default '';
alter table public.commissions add column if not exists price_cents int not null default 0;
alter table public.commissions add column if not exists pro_months int not null default 0;
alter table public.commissions add column if not exists revisions_included int not null default 0;
alter table public.commissions add column if not exists revisions_used int not null default 0;
alter table public.commissions add column if not exists pay_url text not null default '';
alter table public.commissions add column if not exists paid_at timestamptz;
alter table public.commissions add column if not exists delivered_at timestamptz;
alter table public.commissions drop constraint if exists commissions_status_check;
update public.commissions set status = case status when 'new' then 'requested' when 'talking' then 'accepted' when 'building' then 'in_progress' else status end;
alter table public.commissions alter column status set default 'requested';
alter table public.commissions add constraint commissions_status_check
  check (status in ('requested', 'accepted', 'declined', 'paid', 'in_progress', 'in_review', 'delivered'));

-- Deliver a commission: the campaign becomes the client's, and the Pro months that came
-- with their tier start now (or are added to what they already have).
create or replace function public.deliver_commission(p_id uuid, c uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  job public.commissions%rowtype;
  target uuid;
begin
  if not public.is_head() then raise exception 'not allowed'; end if;
  select * into job from public.commissions where id = p_id;
  if not found then raise exception 'no request'; end if;
  select id into target from public.profiles where lower(email) = lower(trim(job.email));
  if target is null then raise exception 'no account'; end if;
  delete from public.memberships where campaign_id = c and user_id = target;
  delete from public.head_reveals where campaign_id = c;
  perform set_config('dbb.transfer', 'on', true);
  update public.campaigns set owner_id = target, purchased = true where id = c;
  perform set_config('dbb.transfer', 'off', true);
  if job.pro_months > 0 then
    update public.profiles set pro_until = greatest(now(), coalesce(pro_until, now())) + make_interval(months => job.pro_months) where id = target;
  end if;
  update public.commissions set status = 'delivered', delivered_at = now(), campaign_id = c, user_id = target where id = p_id;
  return (select display_name from public.profiles where id = target);
end $$;
revoke all on function public.deliver_commission(uuid, uuid) from public, anon;
grant execute on function public.deliver_commission(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
