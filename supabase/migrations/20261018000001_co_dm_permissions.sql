-- Hub version 2, item 6: what a co-DM may do, chosen by the campaign's owner.
--
-- A co-DM's permissions are memberships.perms (added with the dice): empty means everything,
-- which is what every co-DM has had until now. co_dm_can(campaign, permission) answers yes for
-- the owner always, and for a co-DM whose permissions are empty or say yes to it.
--
-- So for an owner, and for every co-DM that exists today, every function and rule below
-- answers exactly as it did before. Only a co-DM who has been given a shorter list is affected.
--
-- The permissions (src/config/co-dm.ts lists them for the app):
--   see_hidden     read everything a DM reads
--   edit           add and change pages and content            (needs see_hidden)
--   reveal         change who sees something, and the stage    (needs see_hidden)
--   settings       change the campaign's settings              (needs see_hidden)
--   combat         run the fight (the Initiative tool)
--   players        invite and remove players
--   private_rolls  see private rolls (the dice migration)
--   handouts, messages, recaps: kept and shown; the features they govern are not built yet.
--
-- Why edit, reveal and settings need see_hidden: a DM's "change" rules also let that DM read
-- the rows they cover, and a page cannot be safely changed by someone who cannot see its
-- hidden half. A co-DM without see_hidden reads the campaign as a player does.
--
-- is_campaign_dm(c) keeps its meaning: the owner or any co-DM of that one campaign.

-- ================================================================ the helpers

create or replace function public.is_campaign_owner(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.campaigns k where k.id = c and k.owner_id = auth.uid());
$$;
revoke all on function public.is_campaign_owner(uuid) from public, anon;
grant execute on function public.is_campaign_owner(uuid) to authenticated;

-- A DM permission that works on hidden things: the caller must also see them.
create or replace function public.dm_may(c uuid, perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.co_dm_can(c, 'see_hidden') and public.co_dm_can(c, perm);
$$;
revoke all on function public.dm_may(uuid, text) from public, anon;
grant execute on function public.dm_may(uuid, text) to authenticated;

-- May the caller read everything in this campaign? (Was: any DM of it, or the Head DM looking in.)
create or replace function public.reads_all(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.co_dm_can(c, 'see_hidden') or public.head_sees(c);
$$;

-- May the caller change this campaign's pages and content? (Was: any DM of it, if it is not read-only.)
create or replace function public.can_edit(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.dm_may(c, 'edit') and public.campaign_writable(c);
$$;

-- ================================================================ rules that asked "is this a DM?" directly

-- every title and address the campaign has had, the real one included
drop policy if exists campaign_faces_dm_read on public.campaign_faces;
create policy campaign_faces_dm_read on public.campaign_faces for select to authenticated
  using (public.co_dm_can(campaign_id, 'see_hidden'));
drop policy if exists campaign_faces_dm on public.campaign_faces;
create policy campaign_faces_dm on public.campaign_faces for all to authenticated
  using (public.dm_may(campaign_id, 'settings') and public.campaign_writable(campaign_id))
  with check (public.dm_may(campaign_id, 'settings') and public.campaign_writable(campaign_id));

-- session run sheets, and what players said anonymously at session zero
drop policy if exists sessions_dm_read on public.sessions;
create policy sessions_dm_read on public.sessions for select to authenticated
  using (public.co_dm_can(campaign_id, 'see_hidden'));
drop policy if exists safety_inputs_dm on public.safety_inputs;
create policy safety_inputs_dm on public.safety_inputs for select to authenticated
  using (public.co_dm_can(campaign_id, 'see_hidden'));

-- invites: "Manage players and invites"
drop policy if exists invites_dm_read on public.invites;
create policy invites_dm_read on public.invites for select to authenticated
  using (public.co_dm_can(campaign_id, 'players'));
drop policy if exists invites_dm on public.invites;
create policy invites_dm on public.invites for all to authenticated
  using (public.co_dm_can(campaign_id, 'players') and public.campaign_writable(campaign_id))
  with check (public.co_dm_can(campaign_id, 'players') and public.campaign_writable(campaign_id));

-- Leaving, and removing people. Anyone may leave. Removing a player is "manage players".
-- Removing a co-DM is the owner's alone.
drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using (user_id = auth.uid() or public.is_campaign_owner(campaign_id) or (role = 'player' and public.co_dm_can(campaign_id, 'players')));

-- the DM's hand on players' characters (the Players tab)
drop policy if exists characters_dm on public.characters;
create policy characters_dm on public.characters for all to authenticated
  using (public.dm_may(campaign_id, 'edit') or public.dm_may(campaign_id, 'players'))
  with check (public.dm_may(campaign_id, 'edit') or public.dm_may(campaign_id, 'players'));

-- the campaign's member list: for whoever reads everything, and for whoever manages players
create or replace function public.campaign_members(c uuid)
returns table (user_id uuid, display_name text, joined_at timestamptz, role text)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.display_name, m.joined_at, m.role
  from public.memberships m join public.profiles p on p.id = m.user_id
  where m.campaign_id = c and (public.reads_all(c) or public.co_dm_can(c, 'players'))
  order by m.joined_at;
$$;

-- what in a campaign is private to its owner (shown before publishing it)
create or replace function public.campaign_private_content(c uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'rules', (select count(*) from public.rules where campaign_id = c and source = 'private'),
    'entries', (select coalesce(jsonb_agg(e.name), '[]'::jsonb) from public.campaign_entities ce join public.entities e on e.id = ce.entity_id where ce.campaign_id = c and e.source = 'private'))
  where public.co_dm_can(c, 'see_hidden') or public.is_head();
$$;

-- a campaign's background picture: changing it is a campaign setting; everyone in it may see it
create or replace function public.background_allowed(name text, writing boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when split_part(name, '/', 1) = 'user' then split_part(name, '/', 2) = auth.uid()::text
    when split_part(name, '/', 1) = 'campaign'
         and split_part(name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then case when writing then public.dm_may(split_part(name, '/', 2)::uuid, 'settings')
           else public.is_campaign_dm(split_part(name, '/', 2)::uuid) or public.is_member(split_part(name, '/', 2)::uuid) or public.head_sees(split_part(name, '/', 2)::uuid) end
    else false
  end;
$$;

-- ================================================================ the campaign itself

-- Changing the campaign row: its settings, or its stage. Which of the two a co-DM may do is
-- checked column by column in campaigns_perms below.
drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns for update to authenticated
  using (public.campaign_writable(id) and (public.dm_may(id, 'settings') or public.dm_may(id, 'reveal')))
  with check (public.campaign_writable(id) and (public.dm_may(id, 'settings') or public.dm_may(id, 'reveal')));

create or replace function public.campaigns_perms()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- the site itself
  -- Who owns a campaign is changed only by its owner, or by the site's own hand-over functions
  -- (transfer_campaign and deliver_commission, which mark the change as theirs).
  -- Before this, any co-DM could write their own id here.
  if new.owner_id is distinct from old.owner_id and old.owner_id is distinct from auth.uid()
     and coalesce(current_setting('dbb.transfer', true), '') <> 'on' then
    raise exception 'not allowed: only the owner hands a campaign to someone else';
  end if;
  -- changes other triggers make (a stage change copies that stage's title onto the campaign)
  if pg_trigger_depth() > 1 or old.owner_id = auth.uid() then return new; end if;
  if new.phase is distinct from old.phase and not public.dm_may(new.id, 'reveal') then
    raise exception 'not allowed: changing the stage needs the reveal permission';
  end if;
  if new.phases is distinct from old.phases and not (public.dm_may(new.id, 'reveal') or public.dm_may(new.id, 'settings')) then
    raise exception 'not allowed: changing the stages needs the reveal or settings permission';
  end if;
  if (to_jsonb(new) - 'phase' - 'phases' - 'updated_at') is distinct from (to_jsonb(old) - 'phase' - 'phases' - 'updated_at')
     and not public.dm_may(new.id, 'settings') then
    raise exception 'not allowed: changing the campaign needs the settings permission';
  end if;
  return new;
end $$;
drop trigger if exists campaigns_perms on public.campaigns;
create trigger campaigns_perms before update on public.campaigns
  for each row execute function public.campaigns_perms();

-- ================================================================ table-tool entries

-- Changing who sees an entry without the edit permission: "Reveal and schedule reveals".
drop policy if exists entries_reveal on public.entries;
create policy entries_reveal on public.entries for update to authenticated
  using (public.dm_may(campaign_id, 'reveal') and public.campaign_writable(campaign_id))
  with check (public.dm_may(campaign_id, 'reveal') and public.campaign_writable(campaign_id));

-- Running the fight: the encounter, both the part players see and the DM's half of it.
drop policy if exists entries_combat on public.entries;
create policy entries_combat on public.entries for all to authenticated
  using (kind = 'encounter' and public.co_dm_can(campaign_id, 'combat') and public.campaign_writable(campaign_id))
  with check (kind = 'encounter' and public.co_dm_can(campaign_id, 'combat') and public.campaign_writable(campaign_id));
drop policy if exists entry_secrets_combat on public.entry_secrets;
create policy entry_secrets_combat on public.entry_secrets for all to authenticated
  using (public.co_dm_can(campaign_id, 'combat') and public.campaign_writable(campaign_id)
         and exists (select 1 from public.entries e where e.id = entry_id and e.kind = 'encounter'))
  with check (public.co_dm_can(campaign_id, 'combat') and public.campaign_writable(campaign_id)
              and exists (select 1 from public.entries e where e.id = entry_id and e.kind = 'encounter'));

-- A co-DM with a shorter list: what they change on an entry must match what they may do.
-- (The owner, players and co-DMs with everything are not looked at here; the rules above
-- already decide for them, as they always have.)
create or replace function public.entries_perms()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c uuid;
  k text;
  who uuid;
  limited boolean;
  revealing boolean := false;
  editing boolean := true;
begin
  if tg_op = 'DELETE' then c := old.campaign_id; k := old.kind; who := old.owner;
  else c := new.campaign_id; k := new.kind; who := new.owner; end if;
  -- not the site itself, and not a change another trigger makes (the reveal log, a stage change)
  if auth.uid() is not null and pg_trigger_depth() <= 1 then
    select true into limited from public.memberships m
     where m.campaign_id = c and m.user_id = auth.uid() and m.role = 'dm' and m.perms is not null
       and not exists (select 1 from public.campaigns x where x.id = c and x.owner_id = auth.uid());
    if limited is true then
      if k = 'encounter' then
        -- the fight belongs to whoever may run combat (or edit)
        if not (public.co_dm_can(c, 'combat') or public.dm_may(c, 'edit')) then
          raise exception 'not allowed: running the fight needs the combat permission';
        end if;
      elsif who = auth.uid() and k in ('beat', 'note', 'pin') then
        null;   -- their own beats, notes and pins: what any player in the campaign may do
      else
        if tg_op = 'UPDATE' then
          revealing := (new.vis, new.vis_players, new.vis_stage, new.vis_entry, new.live) is distinct from (old.vis, old.vis_players, old.vis_stage, old.vis_entry, old.live)
                       or (k = 'beat' and new.status is distinct from old.status);
          editing := (new.title, new.data, new.sort, new.parent) is distinct from (old.title, old.data, old.sort, old.parent)
                     or (k <> 'beat' and new.status is distinct from old.status);
        end if;
        if revealing and not public.dm_may(c, 'reveal') then
          raise exception 'not allowed: changing who sees this needs the reveal permission';
        end if;
        if editing and not public.dm_may(c, 'edit') then
          raise exception 'not allowed: changing this needs the edit permission';
        end if;
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists entries_perms on public.entries;
create trigger entries_perms before insert or update or delete on public.entries
  for each row execute function public.entries_perms();

-- ================================================================ the owner's control

-- Make a member a co-DM (with permissions), change a co-DM's permissions, or make them a
-- player again. Only the campaign's owner. `p_perms` null means everything.
create or replace function public.set_co_dm(c uuid, u uuid, make boolean, p_perms jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  known text[] := array['see_hidden', 'edit', 'reveal', 'combat', 'handouts', 'private_rolls', 'messages', 'recaps', 'players', 'settings'];
  clean jsonb;
begin
  if not public.is_campaign_owner(c) then raise exception 'not allowed: only the owner chooses co-DMs'; end if;
  if u = auth.uid() then raise exception 'not allowed: the owner already has every permission'; end if;
  if not exists (select 1 from public.memberships m where m.campaign_id = c and m.user_id = u) then
    raise exception 'not allowed: that person is not in this campaign';
  end if;
  if not make then
    update public.memberships set role = 'player', perms = null where campaign_id = c and user_id = u;
    return;
  end if;
  if p_perms is not null then
    if jsonb_typeof(p_perms) <> 'object' then raise exception 'not allowed: permissions must be a list of yes and no'; end if;
    -- only the known permissions, each a plain yes or no
    select coalesce(jsonb_object_agg(k, coalesce(p_perms -> k = 'true'::jsonb, false)), '{}'::jsonb) into clean from unnest(known) k;
    -- edit, reveal and settings work on hidden things, so they need see_hidden
    if clean -> 'see_hidden' <> 'true'::jsonb then
      clean := clean || '{"edit": false, "reveal": false, "settings": false}'::jsonb;
    end if;
  end if;
  update public.memberships set role = 'dm', perms = clean where campaign_id = c and user_id = u;
end $$;
revoke all on function public.set_co_dm(uuid, uuid, boolean, jsonb) from public, anon;
grant execute on function public.set_co_dm(uuid, uuid, boolean, jsonb) to authenticated;

-- A co-DM's own permissions, for the app (a member reads their own membership row already;
-- this is the owner's list of everyone's).
create or replace function public.co_dm_list(c uuid)
returns table (user_id uuid, perms jsonb)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.perms from public.memberships m
  where m.campaign_id = c and m.role = 'dm' and public.is_campaign_owner(c);
$$;
revoke all on function public.co_dm_list(uuid) from public, anon;
grant execute on function public.co_dm_list(uuid) to authenticated;
