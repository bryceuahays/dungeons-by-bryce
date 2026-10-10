-- Additive: nothing existing is dropped or rewritten. Two things.
--
--   1. Characters. A character may now have no campaign, and it carries its system (which
--      fifth edition rules it was made for), so its owner can add it to a campaign or move
--      it between campaigns that use the same system.
--   2. Plans. A switch for whether plan limits block anything at all. The limits and the
--      Pro-only list stay exactly as they are; with the switch off, nobody is refused.
--      The switch is "enforce" in app_config.plans, copied there from src/config/plans.ts
--      by `npm run sync-config`.

-- ================================================================ 1. characters

alter table public.characters alter column campaign_id drop not null;
alter table public.characters add column if not exists system text;
alter table public.characters drop constraint if exists characters_system_check;
alter table public.characters add constraint characters_system_check check (system is null or system in ('2014', '2024', 'both'));

-- A campaign's system is its rules setting. One from before the setting existed plays the 2014 rules.
create or replace function public.campaign_system(c uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when settings ->> 'rules' in ('2024', 'both') then settings ->> 'rules' else '2014' end
  from public.campaigns where id = c;
$$;
revoke all on function public.campaign_system(uuid) from public, anon;

update public.characters ch set system = public.campaign_system(ch.campaign_id)
where ch.system is null and ch.campaign_id is not null;

-- A character in a campaign has that campaign's system. Moving one into a campaign is only
-- allowed when the systems match (the app offers only those; this is the backstop).
create or replace function public.characters_system()
returns trigger language plpgsql security definer set search_path = public as $$
declare target text;
begin
  if new.campaign_id is null then
    -- outside any campaign it keeps the system it had (an update leaves the column as it was)
    if new.system is null then new.system := '2024'; end if;
    return new;
  end if;
  target := public.campaign_system(new.campaign_id);
  if tg_op = 'UPDATE' then
    if new.campaign_id is distinct from old.campaign_id and old.system is not null
       and old.system <> target and auth.uid() is not null then
      raise exception 'not allowed: that campaign uses a different system';
    end if;
  end if;
  new.system := target;
  return new;
end $$;
drop trigger if exists characters_system on public.characters;
create trigger characters_system before insert or update on public.characters
  for each row execute function public.characters_system();

-- When a campaign changes its rules, its characters follow.
create or replace function public.campaign_system_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.settings ->> 'rules') is distinct from (old.settings ->> 'rules') then
    update public.characters set system = public.campaign_system(new.id) where campaign_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists campaign_system_changed on public.campaigns;
create trigger campaign_system_changed after update of settings on public.campaigns
  for each row execute function public.campaign_system_changed();

-- The owner may keep a character outside any campaign, and may put it in a campaign they
-- have joined or run. Everything else about who reads and changes characters is unchanged.
drop policy if exists characters_insert on public.characters;
create policy characters_insert on public.characters for insert to authenticated
  with check (owner = auth.uid() and (campaign_id is null or public.is_member(campaign_id) or public.is_campaign_dm(campaign_id)));
drop policy if exists characters_update on public.characters;
create policy characters_update on public.characters for update to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and (campaign_id is null or public.is_member(campaign_id) or public.is_campaign_dm(campaign_id)));

-- ================================================================ 2. the plan switch

-- An account that plan limits always apply to, whatever the switch says. The automated
-- tests use it, so the limits stay tested while they are switched off for everyone else.
alter table public.profiles add column if not exists always_enforce boolean not null default false;

-- Whether this account really has Pro (a subscription, founder, full access, or Pro months).
-- This is what is_pro() was before the switch existed.
create or replace function public.has_pro(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = u and (role = 'head' or comp or pro_until > now()))
      or exists (select 1 from public.subscriptions s where s.user_id = u
                 and (s.plan = 'founder' or (s.status in ('active', 'trialing', 'past_due')
                      and (s.current_period_end is null or s.current_period_end > now() - interval '3 days'))));
$$;
revoke all on function public.has_pro(uuid) from public, anon;

create or replace function public.plans_enforced(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((public.plan_cfg() ->> 'enforce')::boolean, true)
      or coalesce((select always_enforce from public.profiles where id = u), false);
$$;
revoke all on function public.plans_enforced(uuid) from public, anon;

-- Every limit and Pro-only check in the database asks is_pro(). With the switch off it
-- answers yes for everyone, so nothing is refused.
create or replace function public.is_pro(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_pro(u) or not public.plans_enforced(u);
$$;

-- What the pages are told: "pro" is whether anything is held back; "paid" is the account's
-- real plan, for the wording on the Plans page and for subscriber prices.
create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pro', public.is_pro(auth.uid()),
    'paid', public.has_pro(auth.uid()),
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
  select jsonb_build_object('pro', k.purchased or public.is_pro(k.owner_id), 'creator', public.is_pro(k.owner_id),
                            'paid', k.purchased or public.has_pro(k.owner_id), 'writable', public.campaign_writable(k.id))
  from public.campaigns k
  where k.slug = p_slug and (k.owner_id = auth.uid() or public.is_member(k.id) or public.head_sees(k.id));
$$;

notify pgrst, 'reload schema';
