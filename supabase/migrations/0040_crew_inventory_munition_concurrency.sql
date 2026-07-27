-- =====================================================================
-- Ruptura VTT — concorrência do depósito de munição no bando
-- Migration: 0040_crew_inventory_munition_concurrency
--
-- Achado da rodada de fechamento (Fase 5 — concorrência do bando):
-- `upsertCrewInventoryItem` (src/lib/table/crewInventory.ts), no ramo
-- `categoria === "municao"`, fazia SELECT (busca stack existente) e
-- depois UPDATE separados, sem lock nem versão — clássico
-- read-modify-write. Duas chamadas concorrentes depositando na MESMA
-- stack liam a mesma quantidade antiga e a segunda UPDATE sobrescrevia
-- o resultado da primeira: um dos dois depósitos era perdido em
-- silêncio (lost update), sem erro nenhum.
--
-- Correção: uma RPC SECURITY DEFINER que faz busca+merge+update (ou
-- insert, se não houver stack) dentro da MESMA transação, com
-- `for update` travando a linha candidata — mesmo padrão de
-- `end_own_turn`/`narrator_set_turn_track` (migration 0037). Para o
-- caso "nenhuma stack existe ainda e duas chamadas tentam criar ao
-- mesmo tempo", um índice único parcial em (campaign_id, item_slug)
-- restrito a categoria=municao vira a segunda gravação num
-- unique_violation controlado (nunca duas linhas para o mesmo slug de
-- munição na mesma mesa) — o chamador decide como reagir (novo retry
-- de merge), nunca perde a quantidade.
-- =====================================================================

begin;

-- Não bloqueia itens não-munição (múltiplas linhas do mesmo slug são
-- esperadas para outras categorias — cada instância é única).
create unique index if not exists campaign_inventory_items_municao_stack_uidx
  on campaign_inventory_items (campaign_id, item_slug)
  where (payload->>'categoria') = 'municao';

create or replace function upsert_crew_inventory_munition(
  p_campaign_id uuid,
  p_item_slug text,
  p_instance jsonb
)
returns campaign_inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing campaign_inventory_items%rowtype;
  v_merged jsonb;
  v_delta_qtd numeric;
  v_delta_preco numeric;
begin
  if not is_campaign_member(p_campaign_id) then
    raise exception 'not_campaign_member' using errcode = '42501';
  end if;

  if coalesce(p_instance->>'categoria', '') <> 'municao' then
    raise exception 'not_municao_instance' using errcode = '22023';
  end if;

  v_delta_qtd := coalesce((p_instance->>'quantidade')::numeric, 0);
  v_delta_preco := coalesce((p_instance->>'precoPago')::numeric, 0);

  select * into v_existing
    from campaign_inventory_items
    where campaign_id = p_campaign_id
      and item_slug = p_item_slug
      and (payload->>'categoria') = 'municao'
    limit 1
    for update;

  if found then
    v_merged := v_existing.payload
      || jsonb_build_object(
           'quantidade', coalesce((v_existing.payload->>'quantidade')::numeric, 0) + v_delta_qtd,
           'precoPago', coalesce((v_existing.payload->>'precoPago')::numeric, 0) + v_delta_preco
         );
    update campaign_inventory_items
      set payload = v_merged,
          quantity = (v_merged->>'quantidade')::numeric
      where id = v_existing.id
      returning * into v_existing;
    return v_existing;
  end if;

  insert into campaign_inventory_items (campaign_id, item_instance_id, item_name, item_slug, quantity, payload)
    values (
      p_campaign_id,
      coalesce(p_instance->>'id', gen_random_uuid()::text),
      p_instance->>'itemNome',
      p_item_slug,
      v_delta_qtd,
      p_instance
    )
    returning * into v_existing;
  return v_existing;
exception
  when unique_violation then
    -- Segunda chamada concorrente criando a MESMA stack nova ao mesmo
    -- tempo (nenhuma linha existia para nenhuma das duas no início da
    -- transação): re-tenta uma vez, agora a stack já existe e o merge
    -- acima é atingido pelo caminho normal.
    select * into v_existing
      from campaign_inventory_items
      where campaign_id = p_campaign_id
        and item_slug = p_item_slug
        and (payload->>'categoria') = 'municao'
      limit 1
      for update;
    v_merged := v_existing.payload
      || jsonb_build_object(
           'quantidade', coalesce((v_existing.payload->>'quantidade')::numeric, 0) + v_delta_qtd,
           'precoPago', coalesce((v_existing.payload->>'precoPago')::numeric, 0) + v_delta_preco
         );
    update campaign_inventory_items
      set payload = v_merged,
          quantity = (v_merged->>'quantidade')::numeric
      where id = v_existing.id
      returning * into v_existing;
    return v_existing;
end;
$$;

revoke all on function upsert_crew_inventory_munition(uuid, text, jsonb) from public, anon;
grant execute on function upsert_crew_inventory_munition(uuid, text, jsonb) to authenticated;

commit;
