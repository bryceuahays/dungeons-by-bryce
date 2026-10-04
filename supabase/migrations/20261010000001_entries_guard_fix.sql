-- The check that keeps an entry's parent and linked entry inside the same campaign now
-- runs only when one of those links is being set. Before, it also ran when the database
-- itself cleared a link while deleting a campaign (a pin linked to a story beat, say),
-- found the other entry already gone, and stopped the whole delete.
create or replace function public.entries_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.campaign_id <> old.campaign_id or new.kind <> old.kind or new.owner is distinct from old.owner) then
    -- the owner link is cleared by the database when an account is deleted; nothing else may change it
    if not (new.campaign_id = old.campaign_id and new.kind = old.kind and new.owner is null) then
      raise exception 'an entry cannot be moved';
    end if;
  end if;
  if new.parent is not null and (tg_op = 'INSERT' or new.parent is distinct from old.parent)
     and not exists (select 1 from public.entries p where p.id = new.parent and p.campaign_id = new.campaign_id) then
    raise exception 'parent is in another campaign';
  end if;
  if new.vis_entry is not null and (tg_op = 'INSERT' or new.vis_entry is distinct from old.vis_entry)
     and not exists (select 1 from public.entries p where p.id = new.vis_entry and p.campaign_id = new.campaign_id) then
    raise exception 'linked entry is in another campaign';
  end if;
  return new;
end $$;
