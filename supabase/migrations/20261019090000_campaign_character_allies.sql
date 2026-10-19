-- Public group identity only; full character sheets retain their existing RLS.
create or replace function public.list_campaign_character_allies(p_campaign_id uuid)
returns table(id uuid, name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.name
  from public.characters c
  where c.campaign_id = p_campaign_id
    and c.archived_at is null
    and coalesce(c.payload->'metadados'->>'tipo_personagem', 'jogador') = 'jogador'
    and public.is_campaign_member(p_campaign_id, auth.uid())
  order by c.name, c.id;
$$;
revoke all on function public.list_campaign_character_allies(uuid) from public, anon;
grant execute on function public.list_campaign_character_allies(uuid) to authenticated;
