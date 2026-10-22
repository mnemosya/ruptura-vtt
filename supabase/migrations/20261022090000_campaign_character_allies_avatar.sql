-- Aliados da campanha passam a trazer o avatar da ficha (id do asset).
-- A imagem continua só sendo entregue por URL assinada no servidor, pela
-- mesma regra do mapa (`vtt_asset_assinavel_para`); aqui sai só o id.
-- O tipo de retorno mudou, então a função é recriada.
drop function if exists public.list_campaign_character_allies(uuid);

create function public.list_campaign_character_allies(p_campaign_id uuid)
returns table(id uuid, name text, avatar_image_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.name, c.avatar_image_id
  from public.characters c
  where c.campaign_id = p_campaign_id
    and c.archived_at is null
    and coalesce(c.payload->'metadados'->>'tipo_personagem', 'jogador') = 'jogador'
    and public.is_campaign_member(p_campaign_id, auth.uid())
  order by c.name, c.id;
$$;
revoke all on function public.list_campaign_character_allies(uuid) from public, anon;
grant execute on function public.list_campaign_character_allies(uuid) to authenticated;
