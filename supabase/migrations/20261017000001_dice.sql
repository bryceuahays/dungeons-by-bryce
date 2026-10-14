-- Hub version 2, item 5: dice rolled on the server, public and private.
-- Additive: three new tables, one new column, new functions. Nothing existing is changed.
--
-- A roll is two rows:
--   rolls         what happened: who rolled, what for, the total, and who may see it
--   roll_details  the dice and the modifier behind the total
-- They are apart because a campaign can show players only the total ("show the roll and
-- modifier" switched off). Then the details of someone else's roll are not theirs to read.
--
-- Nobody writes these tables from a browser. The server rolls (a secure random number
-- generator), and stores the result with the service role. Signed-in people may only read,
-- under the rules below. That is what makes "the browser cannot store a roll with a total it
-- chose" true.

-- ================================================================ co-DM permissions (the first one)

-- What a co-DM may do in a campaign. Empty means everything, which is what a co-DM has had
-- until now, so nobody loses anything. Item 6 builds the screen and the other permissions on
-- this column. Nobody but the server can change a membership (insert and update are revoked).
alter table public.memberships add column if not exists perms jsonb;

-- May the caller use this DM permission in this campaign? The owner: always. A co-DM: if
-- their permissions are empty (everything) or say yes to it.
create or replace function public.co_dm_can(c uuid, perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.campaigns k where k.id = c and k.owner_id = auth.uid())
      or exists (select 1 from public.memberships m
                 where m.campaign_id = c and m.user_id = auth.uid() and m.role = 'dm'
                   and (m.perms is null or m.perms -> perm = 'true'::jsonb));
$$;
revoke all on function public.co_dm_can(uuid, text) from public, anon;
grant execute on function public.co_dm_can(uuid, text) to authenticated;

-- ================================================================ the tables

create table if not exists public.rolls (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns on delete cascade,
  user_id      uuid not null references public.profiles on delete cascade,     -- who rolled
  character_id uuid references public.characters on delete set null,
  who          text not null default '' check (char_length(who) <= 80),        -- the name shown: a character, or "DM"
  by_dm        boolean not null default false,                                 -- rolled as the DM
  label        text not null default '' check (char_length(label) <= 80),      -- "Perception"
  total        int not null,
  privacy      text not null default 'all' check (privacy in ('all', 'dm', 'self', 'players')),
  shown_to     uuid[] not null default '{}' check (cardinality(shown_to) <= 20),  -- for 'players': the named players
  blind        boolean not null default false,                                 -- the roller does not see the result
  asked_by     uuid references public.profiles on delete set null,
  request_id   uuid,
  created_at   timestamptz not null default now(),
  constraint rolls_blind_is_dm_only check (not blind or privacy = 'dm')
);
create index if not exists rolls_campaign on public.rolls (campaign_id, created_at desc);
create index if not exists rolls_user on public.rolls (user_id, created_at desc);

create table if not exists public.roll_details (
  roll_id     uuid primary key references public.rolls on delete cascade,
  campaign_id uuid not null references public.campaigns on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  notation    text not null check (char_length(notation) <= 120),              -- "2d6+3"
  dice        jsonb not null default '[]'::jsonb,                              -- every die that was rolled
  modifier    int not null default 0
);

create table if not exists public.roll_requests (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns on delete cascade,
  asked_by    uuid not null references public.profiles on delete cascade,
  to_user     uuid not null references public.profiles on delete cascade,
  label       text not null default '' check (char_length(label) <= 80),
  what        jsonb not null default '{}'::jsonb,                              -- a check ({"skill":"Insight"}) or a notation ({"notation":"1d20"})
  privacy     text not null default 'all' check (privacy in ('all', 'dm')),
  blind       boolean not null default false,
  status      text not null default 'open' check (status in ('open', 'done', 'gone')),
  roll_id     uuid references public.rolls on delete set null,
  created_at  timestamptz not null default now(),
  constraint roll_requests_blind_is_dm_only check (not blind or privacy = 'dm')
);
create index if not exists roll_requests_open on public.roll_requests (campaign_id, to_user, status);

alter table public.rolls enable row level security;
alter table public.roll_details enable row level security;
alter table public.roll_requests enable row level security;
revoke all on public.rolls, public.roll_details, public.roll_requests from anon, authenticated;
grant select on public.rolls, public.roll_details, public.roll_requests to authenticated;

-- ================================================================ who may read a roll

-- The DM's side of private rolls: the campaign's owner, a co-DM with "See private rolls",
-- and the Head DM while looking into a campaign they have unhidden.
create or replace function public.rolls_dm_reader(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.co_dm_can(c, 'private_rolls') or public.head_sees(c);
$$;
revoke all on function public.rolls_dm_reader(uuid) from public, anon;
grant execute on function public.rolls_dm_reader(uuid) to authenticated;

-- Does this campaign show the dice and the modifier of a roll, or only its total?
create or replace function public.dice_shown(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select k.settings #> '{dice,showDice}' is distinct from 'false'::jsonb from public.campaigns k where k.id = c), true);
$$;
revoke all on function public.dice_shown(uuid) from public, anon;
grant execute on function public.dice_shown(uuid) to authenticated;

-- The rule (the same rule is rollOpen() in src/features/dice/model.ts; keep them in step):
--   self     nobody but the roller, the DM included
--   all      everyone in the campaign
--   dm       the roller (unless it was a blind roll) and the DM's side
--   players  the roller, the DM's side, and the named players
drop policy if exists rolls_select on public.rolls;
create policy rolls_select on public.rolls for select to authenticated
  using (
    case when privacy = 'self' then user_id = auth.uid()
    else public.rolls_dm_reader(campaign_id)
      or ((public.is_member(campaign_id) or public.is_campaign_dm(campaign_id))
          and ((user_id = auth.uid() and not blind)
               or privacy = 'all'
               or (privacy = 'players' and auth.uid() = any(shown_to))))
    end
  );

-- The dice behind a roll: only for someone who may read the roll itself, and then only the
-- roller, the DM's side, or everyone when the campaign shows dice.
drop policy if exists roll_details_select on public.roll_details;
create policy roll_details_select on public.roll_details for select to authenticated
  using (
    exists (select 1 from public.rolls r where r.id = roll_id)
    and (user_id = auth.uid() or public.rolls_dm_reader(campaign_id) or public.dice_shown(campaign_id))
  );

-- A request for a roll: the DM who asked, the DM's side, and the player it is for.
drop policy if exists roll_requests_select on public.roll_requests;
create policy roll_requests_select on public.roll_requests for select to authenticated
  using (asked_by = auth.uid() or to_user = auth.uid() or public.rolls_dm_reader(campaign_id));

-- ================================================================ the limit

-- At most 30 rolls a minute per person, whoever is storing them.
create or replace function public.rolls_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.rolls r where r.user_id = new.user_id and r.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'rate: at most 30 rolls a minute';
  end if;
  return new;
end $$;
drop trigger if exists rolls_rate on public.rolls;
create trigger rolls_rate before insert on public.rolls
  for each row execute function public.rolls_rate();

-- ================================================================ live updates

-- Realtime checks the same read rules before it delivers a row to anyone.
do $$
begin
  begin alter publication supabase_realtime add table public.rolls; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.roll_requests; exception when duplicate_object then null; end;
end $$;
