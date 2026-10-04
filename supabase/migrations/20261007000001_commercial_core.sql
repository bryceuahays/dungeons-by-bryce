-- Commercial build, phases 0 to 2: rules sources, SRD and homebrew entries, plans and limits.
-- Additive only. Nothing existing is dropped or rewritten.

-- ================================================================ Phase 0: where rules content comes from

-- Every rules row says where it came from. Everything that exists today is 'private':
-- none of it is confirmed SRD text and some of it is converted from other editions.
alter table public.rules add column if not exists source text not null default 'private' check (source in ('srd', 'homebrew', 'private'));

-- Reveal stages (the list in campaigns.phases, in order). Used by every visibility rule.
create or replace function public.stage_index(c uuid, stage text)
returns int language sql stable security definer set search_path = public as $$
  select (select (ord - 1)::int from public.campaigns k, jsonb_array_elements(k.phases) with ordinality as p(v, ord)
          where k.id = c and p.v ->> 'id' = stage limit 1);
$$;
-- true once the campaign's current stage is `stage` or a later one
create or replace function public.stage_reached(c uuid, stage text)
returns boolean language sql stable security definer set search_path = public as $$
  select stage is null or stage = '' or coalesce(public.stage_index(c, public.campaign_phase(c)) >= public.stage_index(c, stage), false);
$$;

-- SRD entries (no owner; ship with the site) and homebrew entries (owned by an account).
create table if not exists public.entities (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references public.profiles on delete cascade default auth.uid(),
  source      text not null default 'homebrew' check (source in ('srd', 'homebrew', 'private')),
  type        text not null check (type in ('race', 'class', 'subclass', 'background', 'feat', 'spell', 'item', 'monster', 'resource')),
  slug        text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,80}$'),
  name        text not null check (char_length(name) between 1 and 120),
  status      text not null default 'draft' check (status in ('draft', 'playtest', 'live')),
  depth       text not null default 'quick' check (depth in ('quick', 'guided', 'advanced')),
  version     int not null default 1,
  change_note text not null default '',
  data        jsonb not null default '{}'::jsonb,
  cloned_from uuid references public.entities on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((source = 'srd') = (owner_id is null))
);
create unique index if not exists entities_key on public.entities (coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), type, slug);
create index if not exists entities_type on public.entities (type, source);
drop trigger if exists entities_touch on public.entities;
create trigger entities_touch before update on public.entities for each row execute function public.touch_updated_at();

create table if not exists public.entity_versions (
  entity_id  uuid not null references public.entities on delete cascade,
  version    int not null,
  note       text not null default '',
  name       text not null default '',
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (entity_id, version)
);

create table if not exists public.packs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles on delete cascade default auth.uid(),
  name        text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  created_at  timestamptz not null default now()
);
create table if not exists public.pack_entities (
  pack_id   uuid not null references public.packs on delete cascade,
  entity_id uuid not null references public.entities on delete cascade,
  primary key (pack_id, entity_id)
);

-- An entry attached to a campaign, with who in that campaign may see it.
create table if not exists public.campaign_entities (
  campaign_id uuid not null references public.campaigns on delete cascade,
  entity_id   uuid not null references public.entities on delete cascade,
  pack_id     uuid references public.packs on delete set null,
  vis         text not null default 'all' check (vis in ('all', 'dm', 'players', 'stage')),
  vis_players uuid[] not null default '{}',
  vis_stage   text,
  primary key (campaign_id, entity_id)
);

-- Table tools (NPCs, story beats, maps, regions, pins, clocks, clues, and so on) share one
-- table. Its rules come in the next migration; it is created here, locked, because the
-- visibility rule below refers to it.
create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns on delete cascade,
  kind        text not null check (kind in ('npc', 'beat', 'note', 'map', 'region', 'pin', 'consequence', 'secret', 'clue', 'clock', 'encounter', 'zero', 'log')),
  parent      uuid references public.entries on delete cascade,
  owner       uuid references public.profiles on delete set null default auth.uid(),
  sort        int not null default 0,
  title       text not null default '' check (char_length(title) <= 200),
  status      text not null default '',
  data        jsonb not null default '{}'::jsonb,
  live        boolean not null default true,
  vis         text not null default 'dm' check (vis in ('all', 'dm', 'players', 'stage', 'entry')),
  vis_players uuid[] not null default '{}',
  vis_stage   text,
  vis_entry   uuid references public.entries on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists entries_lookup on public.entries (campaign_id, kind, sort);
create index if not exists entries_parent on public.entries (parent);
alter table public.entries enable row level security;
revoke all on public.entries from anon;

-- The one visibility rule, used by every new table:
--   all      every member of the campaign
--   dm       nobody but the DM
--   players  the named players
--   stage    every member, once the campaign reaches that stage
--   entry    every member, once the linked entry (a story beat) has happened
create or replace function public.entry_open(c uuid, vis text, players uuid[], stage text, link uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case vis
    when 'all' then true
    when 'players' then auth.uid() = any(players)
    when 'stage' then public.stage_reached(c, stage)
    when 'entry' then exists (select 1 from public.entries b where b.id = link and b.status = 'hit')
    else false end;
$$;

-- ================================================================ Phase 2: plans

alter table public.profiles add column if not exists comp boolean not null default false;
-- every account that exists today keeps full access
update public.profiles set comp = true where created_at < now();

create table if not exists public.subscriptions (
  user_id             uuid primary key references public.profiles on delete cascade,
  stripe_customer     text,
  stripe_subscription text,
  plan                text not null check (plan in ('pro_monthly', 'pro_yearly', 'founder')),
  status              text not null default 'active',
  current_period_end  timestamptz,
  updated_at          timestamptz not null default now()
);
create table if not exists public.purchases (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles on delete set null,
  kind           text not null check (kind in ('founder', 'product', 'subscription')),
  product_id     uuid,
  stripe_session text unique,
  amount_cents   int not null default 0,
  created_at     timestamptz not null default now()
);
-- Stripe events already handled (so a repeated webhook does nothing)
create table if not exists public.billing_events (
  id text primary key, type text not null default '', created_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
alter table public.purchases enable row level security;
alter table public.billing_events enable row level security;
revoke all on public.subscriptions, public.purchases, public.billing_events from anon;
revoke insert, update, delete on public.subscriptions, public.purchases from authenticated;
revoke all on public.billing_events from authenticated;
drop policy if exists subscriptions_own on public.subscriptions;
create policy subscriptions_own on public.subscriptions for select to authenticated using (user_id = auth.uid() or public.is_head());
drop policy if exists purchases_own on public.purchases;
create policy purchases_own on public.purchases for select to authenticated using (user_id = auth.uid() or public.is_head());

-- Limits and the list of Pro-only features. Written from src/config/plans.ts by
-- scripts/sync-config.mjs; a test fails if the two ever differ.
insert into public.app_config (key, value) values ('plans',
  '{"limits":{"campaigns":1,"players":5,"homebrew":3,"maps":1,"stages":2},"pro_features":["homebrew_full","maps_plus","timeline","stages","player_secrets","world","themes","export","no_footer"],"founder":{"cap":100,"on":true}}')
on conflict (key) do nothing;

create or replace function public.plan_cfg()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value::jsonb from public.app_config where key = 'plans'), '{}'::jsonb);
$$;
create or replace function public.free_limit(k text)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((public.plan_cfg() -> 'limits' ->> k)::int, 0);
$$;

-- Pro: the Head DM, an account given full access, a founder, or a subscription in good
-- standing. A failed payment keeps access while Stripe retries (status past_due).
create or replace function public.is_pro(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = u and (role = 'head' or comp))
      or exists (select 1 from public.subscriptions s where s.user_id = u
                 and (s.plan = 'founder' or (s.status in ('active', 'trialing', 'past_due')
                      and (s.current_period_end is null or s.current_period_end > now() - interval '3 days'))));
$$;

-- A campaign can be changed if its owner is Pro, or it is among the owner's first N
-- campaigns (N is the free limit). On a downgrade nothing is deleted: the extra
-- campaigns can still be opened and read by everyone in them.
create or replace function public.campaign_writable(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.is_pro(k.owner_id)
        or (select count(*) from public.campaigns o where o.owner_id = k.owner_id and (o.created_at, o.id) < (k.created_at, k.id)) < public.free_limit('campaigns')
    from public.campaigns k where k.id = c), false);
$$;
create or replace function public.can_edit(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_campaign_dm(c) and public.campaign_writable(c);
$$;
-- does this campaign have a Pro-only feature? (it goes by the campaign owner's plan)
create or replace function public.campaign_feature(c uuid, feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select not (public.plan_cfg() -> 'pro_features') ? feature
      or coalesce((select public.is_pro(owner_id) from public.campaigns where id = c), false);
$$;
-- what a campaign page needs to know, in one call
create or replace function public.campaign_access(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('pro', public.is_pro(k.owner_id), 'writable', public.campaign_writable(k.id))
  from public.campaigns k
  where k.slug = p_slug and (k.owner_id = auth.uid() or public.is_member(k.id) or public.head_sees(k.id));
$$;
create or replace function public.founder_seats_left()
returns int language sql stable security definer set search_path = public as $$
  select case when coalesce((public.plan_cfg() -> 'founder' ->> 'on')::boolean, false)
    then greatest(0, coalesce((public.plan_cfg() -> 'founder' ->> 'cap')::int, 0) - (select count(*)::int from public.subscriptions where plan = 'founder'))
    else 0 end;
$$;
revoke all on function public.plan_cfg(), public.free_limit(text), public.is_pro(uuid), public.campaign_writable(uuid), public.can_edit(uuid), public.campaign_feature(uuid, text), public.campaign_access(text), public.stage_index(uuid, text), public.stage_reached(uuid, text), public.entry_open(uuid, text, uuid[], text, uuid) from public, anon;
grant execute on function public.free_limit(text), public.campaign_writable(uuid), public.can_edit(uuid), public.campaign_feature(uuid, text), public.campaign_access(text), public.stage_reached(uuid, text) to authenticated;
grant execute on function public.founder_seats_left() to anon, authenticated;

-- is the caller Pro? (for pages; never trusts anything sent by the browser)
create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pro', public.is_pro(auth.uid()),
    'comp', coalesce((select role = 'head' or comp from public.profiles where id = auth.uid()), false),
    'plan', (select plan from public.subscriptions where user_id = auth.uid()),
    'status', (select status from public.subscriptions where user_id = auth.uid()),
    'until', (select current_period_end from public.subscriptions where user_id = auth.uid()),
    'campaigns', (select count(*) from public.campaigns where owner_id = auth.uid()),
    'homebrew', (select count(*) from public.entities where owner_id = auth.uid()));
$$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- The Head DM gives (or takes back) full access for an account, for friends.
create or replace function public.set_comp(p_user uuid, on_ boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_head() then raise exception 'not allowed'; end if;
  update public.profiles set comp = on_ where id = p_user;
end $$;
revoke all on function public.set_comp(uuid, boolean) from public, anon;
grant execute on function public.set_comp(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- limits

-- free: one campaign (was a flat 10 for everyone)
create or replace function public.campaign_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null and not public.is_pro(new.owner_id)
     and (select count(*) from public.campaigns where owner_id = new.owner_id) >= public.free_limit('campaigns') then
    raise exception 'upgrade:campaigns limit reached';
  end if;
  return new;
end $$;

-- free: up to five players in a campaign
create or replace function public.join_campaign(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  inv public.invites%rowtype;
  joined int := 0;
  out_slug text;
  owner uuid;
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
  select owner_id, slug into owner, out_slug from public.campaigns where id = inv.campaign_id;
  if owner is distinct from auth.uid() and not public.is_member(inv.campaign_id) then
    if not public.is_pro(owner) and (select count(*) from public.memberships where campaign_id = inv.campaign_id and role = 'player') >= public.free_limit('players') then
      raise exception 'campaign full';
    end if;
    insert into public.memberships (user_id, campaign_id) values (auth.uid(), inv.campaign_id)
      on conflict do nothing;
    get diagnostics joined = row_count;
  end if;
  if joined > 0 and inv.uses_left is not null then
    update public.invites set uses_left = uses_left - 1 where id = inv.id;
  end if;
  return out_slug;
end $$;

-- free: three homebrew entries, Quick mode only. Nothing already made is ever removed
-- or locked; the limit only stops new ones.
create or replace function public.entities_gate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is null or public.is_pro(new.owner_id) then return new; end if;
  if tg_op = 'INSERT' and (select count(*) from public.entities where owner_id = new.owner_id) >= public.free_limit('homebrew') then
    raise exception 'upgrade:homebrew limit reached';
  end if;
  if new.depth <> 'quick' and (tg_op = 'INSERT' or old.depth = 'quick') then
    raise exception 'upgrade:homebrew_full Guided and Advanced modes are part of Pro';
  end if;
  return new;
end $$;
drop trigger if exists entities_gate on public.entities;
create trigger entities_gate before insert or update of depth on public.entities
  for each row execute function public.entities_gate();

-- more than two reveal stages is part of Pro
create or replace function public.campaign_stage_gate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if jsonb_array_length(new.phases) > public.free_limit('stages') and jsonb_array_length(new.phases) > jsonb_array_length(old.phases)
     and not public.is_pro(new.owner_id) then
    raise exception 'upgrade:stages more reveal stages are part of Pro';
  end if;
  return new;
end $$;
drop trigger if exists campaigns_stage_gate on public.campaigns;
create trigger campaigns_stage_gate before update of phases on public.campaigns
  for each row execute function public.campaign_stage_gate();

-- ---------------------------------------------------------------- write policies: DM of the campaign AND the campaign is writable

drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns for update to authenticated
  using (public.can_edit(id)) with check (public.can_edit(id));

drop policy if exists sections_dm on public.sections;
create policy sections_dm on public.sections for all to authenticated
  using (public.can_edit(campaign_id)) with check (public.can_edit(campaign_id));
drop policy if exists content_dm on public.content;
create policy content_dm on public.content for all to authenticated
  using (public.can_edit(campaign_id)) with check (public.can_edit(campaign_id));

-- these three had one policy for reading and writing; reading stays with the DM
drop policy if exists campaign_faces_dm on public.campaign_faces;
drop policy if exists campaign_faces_dm_read on public.campaign_faces;
create policy campaign_faces_dm_read on public.campaign_faces for select to authenticated using (public.is_campaign_dm(campaign_id));
create policy campaign_faces_dm on public.campaign_faces for all to authenticated
  using (public.can_edit(campaign_id)) with check (public.can_edit(campaign_id));
drop policy if exists invites_dm on public.invites;
drop policy if exists invites_dm_read on public.invites;
create policy invites_dm_read on public.invites for select to authenticated using (public.is_campaign_dm(campaign_id));
create policy invites_dm on public.invites for all to authenticated
  using (public.can_edit(campaign_id)) with check (public.can_edit(campaign_id));
drop policy if exists sessions_dm on public.sessions;
drop policy if exists sessions_dm_read on public.sessions;
create policy sessions_dm_read on public.sessions for select to authenticated using (public.is_campaign_dm(campaign_id));
create policy sessions_dm on public.sessions for all to authenticated
  using (public.can_edit(campaign_id)) with check (public.can_edit(campaign_id));

drop policy if exists rules_head on public.rules;
create policy rules_head on public.rules for all to authenticated
  using (public.is_head() and public.can_edit(campaign_id)) with check (public.is_head() and public.can_edit(campaign_id));
drop policy if exists media_head on public.media;
create policy media_head on public.media for all to authenticated
  using (public.is_head() and public.can_edit(campaign_id)) with check (public.is_head() and public.can_edit(campaign_id));

-- Private rules never leave their owner's campaigns: only someone who runs BOTH
-- campaigns can copy a rule set from one to the other.
create or replace function public.copy_campaign_rules(src uuid, dst uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.can_edit(dst) or not public.is_campaign_dm(src) then
    raise exception 'not allowed';
  end if;
  insert into public.rules (campaign_id, kind, key, sort, data, phase, source)
    select dst, r.kind, r.key, r.sort, r.data, r.phase, r.source from public.rules r
    where r.campaign_id = src
    on conflict do nothing;
  get diagnostics n = row_count;
  insert into public.content (campaign_id, section, kind, key, sort, title, body, visibility, phase)
    select dst, t.section, t.kind, t.key, t.sort, t.title, t.body, t.visibility, t.phase from public.content t
    where t.campaign_id = src and t.kind in ('sheet-template', 'sheet-slot')
      and not exists (select 1 from public.content x where x.campaign_id = dst and x.kind = t.kind and x.key = t.key);
  return n;
end $$;

-- ---------------------------------------------------------------- row-level security for the new tables

create or replace function public.entity_mine_or_srd(e uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.entities where id = e and (owner_id = auth.uid() or source = 'srd'));
$$;
-- an entry someone else made reaches me only through a campaign I am in, once it is past draft
create or replace function public.entity_shared(e uuid, st text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.campaign_entities ce
    where ce.entity_id = e
      and (public.reads_all(ce.campaign_id)
           or (st <> 'draft' and public.is_member(ce.campaign_id) and public.entry_open(ce.campaign_id, ce.vis, ce.vis_players, ce.vis_stage, null))));
$$;
revoke all on function public.entity_mine_or_srd(uuid), public.entity_shared(uuid, text) from public, anon;
grant execute on function public.entity_mine_or_srd(uuid), public.entity_shared(uuid, text) to authenticated;

alter table public.entities enable row level security;
alter table public.entity_versions enable row level security;
alter table public.packs enable row level security;
alter table public.pack_entities enable row level security;
alter table public.campaign_entities enable row level security;
revoke all on public.entity_versions, public.packs, public.pack_entities, public.campaign_entities from anon;
revoke all on public.entities from anon;
grant select on public.entities to anon;

drop policy if exists entities_srd_public on public.entities;
create policy entities_srd_public on public.entities for select to anon using (source = 'srd');
drop policy if exists entities_select on public.entities;
create policy entities_select on public.entities for select to authenticated
  using (source = 'srd' or owner_id = auth.uid() or public.entity_shared(id, status));
drop policy if exists entities_insert on public.entities;
create policy entities_insert on public.entities for insert to authenticated
  with check (owner_id = auth.uid() and source in ('homebrew', 'private'));
drop policy if exists entities_update on public.entities;
create policy entities_update on public.entities for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and source in ('homebrew', 'private'));
drop policy if exists entities_delete on public.entities;
create policy entities_delete on public.entities for delete to authenticated using (owner_id = auth.uid());

drop policy if exists entity_versions_select on public.entity_versions;
create policy entity_versions_select on public.entity_versions for select to authenticated
  using (exists (select 1 from public.entities e where e.id = entity_id));
drop policy if exists entity_versions_insert on public.entity_versions;
create policy entity_versions_insert on public.entity_versions for insert to authenticated
  with check (exists (select 1 from public.entities e where e.id = entity_id and e.owner_id = auth.uid()));

drop policy if exists packs_own on public.packs;
create policy packs_own on public.packs for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists pack_entities_own on public.pack_entities;
create policy pack_entities_own on public.pack_entities for all to authenticated
  using (exists (select 1 from public.packs p where p.id = pack_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.packs p where p.id = pack_id and p.owner_id = auth.uid()) and public.entity_mine_or_srd(entity_id));

drop policy if exists campaign_entities_select on public.campaign_entities;
create policy campaign_entities_select on public.campaign_entities for select to authenticated
  using (public.reads_all(campaign_id) or (public.is_member(campaign_id) and public.entry_open(campaign_id, vis, vis_players, vis_stage, null)));
drop policy if exists campaign_entities_write on public.campaign_entities;
create policy campaign_entities_write on public.campaign_entities for all to authenticated
  using (public.can_edit(campaign_id)) with check (public.can_edit(campaign_id) and public.entity_mine_or_srd(entity_id));

notify pgrst, 'reload schema';
