-- Ready-made worlds the site provides (the standard SRD world), and each world's game and rules.
-- Additive: nothing existing is dropped or rewritten.

alter table public.worlds add column if not exists official boolean not null default false;  -- made by the site, open to every account
alter table public.worlds add column if not exists key text unique;                           -- a ready-made world's fixed name, for its seed script
alter table public.worlds add column if not exists system text not null default 'dnd5e' check (system in ('dnd5e'));
alter table public.worlds add column if not exists rules text not null default '2024' check (rules in ('2014', '2024', 'both'));
-- a ready-made world belongs to no account
alter table public.worlds alter column owner_id drop not null;
alter table public.worlds drop constraint if exists worlds_owned;
alter table public.worlds add constraint worlds_owned check (official or owner_id is not null);

drop policy if exists worlds_select on public.worlds;
create policy worlds_select on public.worlds for select to authenticated using (official or owner_id = auth.uid() or public.is_head());
-- only the site makes or changes ready-made worlds
drop policy if exists worlds_write on public.worlds;
create policy worlds_write on public.worlds for all to authenticated
  using (owner_id = auth.uid() and not official) with check (owner_id = auth.uid() and not official);

drop policy if exists world_entities_owner on public.world_entities;
create policy world_entities_owner on public.world_entities for all to authenticated
  using (exists (select 1 from public.worlds w where w.id = world_id and (w.official or w.owner_id = auth.uid() or public.is_head())))
  with check (exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = auth.uid() and not w.official) and public.entity_mine_or_srd(entity_id));

-- a campaign can be put in a world its DM owns, or a ready-made one
create or replace function public.campaign_world_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.world_id is not null and auth.uid() is not null
     and (tg_op = 'INSERT' or new.world_id is distinct from old.world_id)
     and not exists (select 1 from public.worlds w where w.id = new.world_id and (w.official or w.owner_id = auth.uid())) then
    raise exception 'not allowed';
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
