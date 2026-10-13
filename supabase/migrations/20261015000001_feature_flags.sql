-- Feature flags the Head DM switches from a screen (/admin/flags).
--
-- The list of flags, and what each is for, stays in src/config/flags.ts. This table holds only
-- which of them have been turned on for everyone. A flag with no row here is off.
--   * Everyone, signed in or not, can read the rows that are on: that is how the site knows a
--     feature has been released. Nobody but the Head DM can read the rows that are off.
--   * Only the Head DM can add, change or remove a row.
-- Additive: nothing existing is dropped or rewritten.

create table if not exists public.feature_flags (
  name       text primary key check (name ~ '^[a-z0-9_]{1,60}$'),
  is_on      boolean not null default false,
  changed_at timestamptz not null default now()
);
alter table public.feature_flags enable row level security;

revoke all on public.feature_flags from anon, authenticated;
grant select on public.feature_flags to anon, authenticated;
grant insert, update, delete on public.feature_flags to authenticated;

-- Two policies, not one with "is_on or is_head()": a signed-out visitor may not run is_head(),
-- so it must not be part of the rule that visitor is checked against.
drop policy if exists feature_flags_read_on on public.feature_flags;
create policy feature_flags_read_on on public.feature_flags for select to anon, authenticated
  using (is_on);

drop policy if exists feature_flags_head on public.feature_flags;
create policy feature_flags_head on public.feature_flags for all to authenticated
  using (public.is_head()) with check (public.is_head());
