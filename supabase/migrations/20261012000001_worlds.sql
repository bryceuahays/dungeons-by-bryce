-- Worlds: a setting above campaigns. A DM's world holds their campaigns and the homebrew
-- that belongs to the setting; a campaign in a world gets the world's homebrew attached.
-- Additive: nothing existing is dropped or rewritten.

create table if not exists public.worlds (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  tagline    text not null default '' check (char_length(tagline) <= 300),
  data       jsonb not null default '{}'::jsonb,   -- { desc, banner: { path, pos } }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists worlds_owner on public.worlds (owner_id);
alter table public.worlds enable row level security;
revoke all on public.worlds from anon;
drop policy if exists worlds_select on public.worlds;
create policy worlds_select on public.worlds for select to authenticated using (owner_id = auth.uid() or public.is_head());
drop policy if exists worlds_write on public.worlds;
create policy worlds_write on public.worlds for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- the homebrew that belongs to a world (its own entries, or SRD ones)
create table if not exists public.world_entities (
  world_id   uuid not null references public.worlds on delete cascade,
  entity_id  uuid not null references public.entities on delete cascade,
  created_at timestamptz not null default now(),
  primary key (world_id, entity_id)
);
alter table public.world_entities enable row level security;
revoke all on public.world_entities from anon;
drop policy if exists world_entities_owner on public.world_entities;
create policy world_entities_owner on public.world_entities for all to authenticated
  using (exists (select 1 from public.worlds w where w.id = world_id and (w.owner_id = auth.uid() or public.is_head())))
  with check (exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = auth.uid()) and public.entity_mine_or_srd(entity_id));

-- which world a campaign is in (none: a campaign of its own)
alter table public.campaigns add column if not exists world_id uuid references public.worlds on delete set null;
create index if not exists campaigns_world on public.campaigns (world_id) where world_id is not null;

-- a campaign can only be put in a world its DM owns
create or replace function public.campaign_world_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.world_id is not null and auth.uid() is not null
     and (tg_op = 'INSERT' or new.world_id is distinct from old.world_id)
     and not exists (select 1 from public.worlds w where w.id = new.world_id and w.owner_id = auth.uid()) then
    raise exception 'not allowed';
  end if;
  return new;
end $$;
drop trigger if exists campaign_world_guard on public.campaigns;
create trigger campaign_world_guard before insert or update of world_id on public.campaigns
  for each row execute function public.campaign_world_guard();

notify pgrst, 'reload schema';
