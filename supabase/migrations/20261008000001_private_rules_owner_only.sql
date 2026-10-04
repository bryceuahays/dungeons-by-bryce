-- Private rules can be copied only by the person who OWNS both campaigns (a co-DM of
-- someone else's campaign cannot take its rules with them).
create or replace function public.copy_campaign_rules(src uuid, dst uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.can_edit(dst)
     or not exists (select 1 from public.campaigns where id = src and owner_id = auth.uid())
     or not exists (select 1 from public.campaigns where id = dst and owner_id = auth.uid()) then
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
