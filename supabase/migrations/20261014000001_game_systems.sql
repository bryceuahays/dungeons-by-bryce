-- Game systems a DM has customized (src/features/systems). A system is one of the ready-made
-- rule sets (base: the 2014 or 2024 rules) plus the DM's changes on top; everything not changed
-- comes from the base. A campaign uses one through settings.system (its id); settings.rules stays
-- the base, so characters' systems and moves (characters_system) work as before.
-- Additive: nothing existing is dropped or rewritten.

create table if not exists public.game_systems (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  base       text not null check (base in ('2014', '2024')),
  changes    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists game_systems_owner on public.game_systems (owner_id);
alter table public.game_systems enable row level security;
revoke all on public.game_systems from anon;

-- the campaigns that use a system (their DM's, or one they play in)
create or replace function public.game_system_in_my_campaign(s uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.campaigns c
    where c.settings->>'system' = s::text
      and (c.owner_id = auth.uid() or public.is_member(c.id))
  );
$$;
revoke all on function public.game_system_in_my_campaign(uuid) from public, anon;
grant execute on function public.game_system_in_my_campaign(uuid) to authenticated;

-- its owner (and the Head DM) reads it; so does anyone in a campaign that uses it. Only its owner changes it.
drop policy if exists game_systems_select on public.game_systems;
create policy game_systems_select on public.game_systems for select to authenticated
  using (owner_id = auth.uid() or public.is_head() or public.game_system_in_my_campaign(id));
drop policy if exists game_systems_write on public.game_systems;
create policy game_systems_write on public.game_systems for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- a campaign can only use a system its DM owns, and only one built on the campaign's rules
create or replace function public.campaign_system_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare s uuid; b text;
begin
  if auth.uid() is null or coalesce(new.settings->>'system', '') = '' then return new; end if;
  if tg_op = 'UPDATE' and (new.settings->>'system') is not distinct from (old.settings->>'system')
     and (new.settings->>'rules') is not distinct from (old.settings->>'rules') then return new; end if;
  begin s := (new.settings->>'system')::uuid; exception when others then raise exception 'not allowed'; end;
  select base into b from public.game_systems where id = s and owner_id = auth.uid();
  if b is null or b is distinct from coalesce(new.settings->>'rules', '2014') then raise exception 'not allowed'; end if;
  return new;
end $$;
drop trigger if exists campaign_system_guard on public.campaigns;
create trigger campaign_system_guard before insert or update of settings on public.campaigns
  for each row execute function public.campaign_system_guard();

-- Renaming something in a system (Intelligence -> Insanity) offers to change the word in written
-- text too. This counts where each word appears as a whole word: the official entries of the
-- system's rules and the caller's own homebrew, by kind, with a few of their names.
create or replace function public.entity_text_hits(words text[], versions text[])
returns table (word text, type text, n bigint, names text[])
language sql stable security invoker set search_path = public as $$
  select w.word, e.type, count(*), (array_agg(e.name order by e.name))[1:6]
  from (select x as word, regexp_replace(x, '[^A-Za-z0-9 ''-]', '', 'g') as clean from unnest(words) x) w
  join public.entities e on w.clean <> '' and e.data::text ~* ('\m' || w.clean || '\M')
  where (e.source = 'srd' and e.srd_version = any(versions)) or (e.source <> 'srd' and e.owner_id = auth.uid())
  group by w.word, e.type;
$$;
revoke all on function public.entity_text_hits(text[], text[]) from public, anon;
grant execute on function public.entity_text_hits(text[], text[]) to authenticated;

notify pgrst, 'reload schema';
