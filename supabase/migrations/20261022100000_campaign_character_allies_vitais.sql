-- Aliados da campanha passam a trazer os "vitais": o mínimo para a tela
-- da Âncora mostrar PV e PE (atuais e máximos) e as condições ativas.
-- Não é a ficha: só atributos, PV/PE atuais, as fórmulas de derivado da
-- progressão, as marcas de Ruptura (só o id) e o bônus de Mana, que é o
-- que `computeDerivedStats` lê; e o nome das condições ativas.
drop function if exists public.list_campaign_character_allies(uuid);

create function public.list_campaign_character_allies(p_campaign_id uuid)
returns table(id uuid, name text, avatar_image_id uuid, vitais jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.name,
    c.avatar_image_id,
    jsonb_build_object(
      'atributos', c.payload->'atributos',
      'recursos_atuais', jsonb_build_object('pv', c.payload->'recursos_atuais'->'pv', 'pe', c.payload->'recursos_atuais'->'pe'),
      'progressao', jsonb_build_object('formulas_derivados', c.payload->'progressao'->'formulas_derivados'),
      'historico_ruptura', (
        select coalesce(jsonb_agg(jsonb_build_object('marcaId', e->'marcaId')), '[]'::jsonb)
        from jsonb_array_elements(case when jsonb_typeof(c.payload->'historico_ruptura') = 'array' then c.payload->'historico_ruptura' else '[]'::jsonb end) e
      ),
      'mana_bonus_ruptura', c.payload->'mana_bonus_ruptura',
      'condicoes', (
        select coalesce(jsonb_agg(cond->'nome'), '[]'::jsonb)
        from jsonb_array_elements(case when jsonb_typeof(c.payload->'condicoes_ativas') = 'array' then c.payload->'condicoes_ativas' else '[]'::jsonb end) cond
        where coalesce((cond->>'ativa')::boolean, false)
      )
    )
  from public.characters c
  where c.campaign_id = p_campaign_id
    and c.archived_at is null
    and coalesce(c.payload->'metadados'->>'tipo_personagem', 'jogador') = 'jogador'
    and public.is_campaign_member(p_campaign_id, auth.uid())
  order by c.name, c.id;
$$;
revoke all on function public.list_campaign_character_allies(uuid) from public, anon;
grant execute on function public.list_campaign_character_allies(uuid) to authenticated;
