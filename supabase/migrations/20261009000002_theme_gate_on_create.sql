-- Creating a campaign never fails over its look. If a free account creates a campaign
-- with a theme that is not one of the defaults, it is given the first default theme
-- instead. Changing an existing campaign to a premium or custom theme is still refused.
create or replace function public.campaign_theme_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare fallback jsonb;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.theme is not distinct from old.theme then return new; end if;
  if new.theme = '{}'::jsonb or public.is_pro(new.owner_id) or coalesce(new.purchased, false) then return new; end if;
  if exists (select 1 from jsonb_each(coalesce(public.plan_cfg() -> 'free_themes', '{}'::jsonb)) t where t.value = new.theme) then return new; end if;
  if tg_op = 'INSERT' then
    select t.value into fallback from jsonb_each(coalesce(public.plan_cfg() -> 'free_themes', '{}'::jsonb)) t order by (t.key = 'slate') desc limit 1;
    new.theme := coalesce(fallback, '{}'::jsonb);
    return new;
  end if;
  raise exception 'upgrade:themes premium themes and the theme editor are part of Pro';
end $$;
