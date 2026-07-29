-- =====================================================================
-- Ruptura VTT — Fase 6 (correção de usabilidade/integridade curta)
-- Migration: 0060_display_names_tipo_personagem_protection
--
-- Três correções independentes, todas server-side:
--
-- 1) get_campaign_participant_info(campaign_id): expõe nome de exibição
--    (com fallback humano, nunca UUID) e e-mail de contas ligadas a uma
--    campanha, SÓ para quem é narrador (is_campaign_owner) daquela
--    campanha. Não é um sistema de perfil público — é uma leitura
--    pontual, restrita por campanha, sem consultar auth.users
--    diretamente do frontend e sem service role no cliente. Se o
--    chamador não for o narrador da campanha, devolve zero linhas
--    (nunca vaza dado de outra campanha nem de quem não é narrador).
--
-- 2) update_character_sheet_payload: passa a preservar o valor
--    administrativo existente de payload.metadados.tipo_personagem
--    quando quem chama NÃO é o narrador da campanha (ou seja, é o
--    jogador controlador, único outro caminho autorizado a chamar esta
--    RPC). O jogador continua podendo alterar todo o resto do payload
--    livremente; só esse campo é reescrito no servidor de volta ao
--    valor anterior, mesmo que o cliente tenha enviado outro valor ou
--    removido o campo — não é validação condicional que pode ter
--    lacuna, é reescrita incondicional após a checagem de papel.
--
-- 3) complete_character_creation: deixa de conceder controle automático
--    ao narrador quando ele mesmo cria um personagem na própria
--    campanha pelo assistente — o narrador já tem acesso administrativo
--    total via is_campaign_owner; uma linha redundante em
--    character_controllers só polui os filtros de "Jogadores" da
--    página Personagens. Jogadores continuam recebendo controle
--    automático normalmente (aditivo §11.2).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Nomes/e-mails de participantes — só para o narrador da campanha
-- ---------------------------------------------------------------------
create or replace function get_campaign_participant_info(p_campaign_id uuid)
returns table(user_id uuid, display_name text, email text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    u.id as user_id,
    coalesce(
      nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(u.email, '@', 1), ''),
      'Conta sem nome'
    ) as display_name,
    u.email as email
  from auth.users u
  where is_campaign_owner(p_campaign_id, auth.uid())
    and u.id in (
      select cm.user_id from campaign_members cm where cm.campaign_id = p_campaign_id
      union
      select cc.user_id from character_controllers cc where cc.campaign_id = p_campaign_id
    );
$$;

revoke all on function get_campaign_participant_info(uuid) from public;
revoke all on function get_campaign_participant_info(uuid) from anon;
grant execute on function get_campaign_participant_info(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2) update_character_sheet_payload — preserva tipo_personagem quando
--    quem grava não é o narrador
-- ---------------------------------------------------------------------
create or replace function update_character_sheet_payload(
  p_character_id uuid,
  p_payload jsonb
) returns characters
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
  v_result characters;
  v_existing_tipo jsonb;
  v_final_payload jsonb;
begin
  select campaign_id into v_campaign_id from characters where id = p_character_id;
  if v_campaign_id is null then
    raise exception 'character has no campaign; use narrator update path' using errcode = 'check_violation';
  end if;
  if not is_character_controller_for(p_character_id, v_campaign_id, auth.uid()) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  v_final_payload := p_payload;

  if not is_campaign_owner(v_campaign_id, auth.uid()) then
    -- Quem chama é o jogador controlador (única outra possibilidade
    -- autorizada acima): tipo_personagem é metadado administrativo do
    -- narrador, não pode ser criado, alterado ou removido por um
    -- payload completo enviado pelo jogador — reescrito de volta ao
    -- valor já persistido, incondicionalmente.
    select payload->'metadados'->'tipo_personagem' into v_existing_tipo
      from characters where id = p_character_id;

    -- jsonb_set com caminho aninhado ("{metadados,tipo_personagem}") NÃO
    -- cria o objeto intermediário "metadados" quando ele está ausente do
    -- payload enviado (ex.: jogador manda um payload completo novo, sem
    -- metadados nenhum) — só cria o último nível do caminho. Por isso o
    -- objeto "metadados" é garantido primeiro, incondicionalmente, antes
    -- de qualquer set/delete aninhado abaixo.
    v_final_payload := jsonb_set(
      v_final_payload,
      '{metadados}',
      coalesce(v_final_payload->'metadados', '{}'::jsonb)
    );

    if v_existing_tipo is null then
      v_final_payload := jsonb_set(
        v_final_payload,
        '{metadados}',
        (v_final_payload->'metadados') - 'tipo_personagem'
      );
    else
      v_final_payload := jsonb_set(
        v_final_payload,
        '{metadados,tipo_personagem}',
        v_existing_tipo,
        true
      );
    end if;
  end if;

  update characters
     set payload = v_final_payload,
         updated_at = now()
   where id = p_character_id
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function update_character_sheet_payload(uuid, jsonb) from public;
revoke all on function update_character_sheet_payload(uuid, jsonb) from anon;
grant execute on function update_character_sheet_payload(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3) complete_character_creation — não concede controle redundante ao
--    narrador quando ele mesmo cria o personagem pelo assistente.
--    Corpo idêntico ao da migration 0054, só o bloco final de INSERT em
--    character_controllers passa a ser condicional a
--    "not is_campaign_owner(...)".
-- ---------------------------------------------------------------------
create or replace function complete_character_creation(
  p_campaign_id uuid,
  p_character_payload jsonb,
  p_owner_label text default null,
  p_creation_request_id text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_existing characters%rowtype;
  v_new characters%rowtype;

  v_regras jsonb;
  v_aretz_iniciais numeric;

  v_niveis_vertente jsonb;
  v_vertente text;
  v_nivel_vertente numeric;
  v_vertentes_pontos numeric := 0;

  v_magias jsonb;
  v_magia jsonb;
  v_magia_payload jsonb;
  v_spell_slugs text[] := '{}';
  v_spell_vertente text;
  v_spell_nivel numeric;

  v_talentos jsonb;
  v_talento jsonb;
  v_talento_payload jsonb;
  v_talento_ids text[] := '{}';
  v_nivel_obj jsonb;
  v_nivel_encontrado boolean;

  v_inventario jsonb;
  v_item jsonb;
  v_item_payload jsonb;
  v_item_slug text;
  v_item_quantidade numeric;
  v_item_preco_pago numeric;
  v_item_raridade text;
  v_preco_canonico numeric;
  v_gasto_total numeric := 0;
  v_aljava_gratis_usada boolean := false;
  v_tem_arco boolean := false;
  v_carteira jsonb;
begin
  if v_uid is null then
    raise exception 'É necessário estar autenticado para concluir a criação do personagem.' using errcode = 'insufficient_privilege';
  end if;

  if not is_campaign_member(p_campaign_id, v_uid) then
    raise exception 'Você não é participante ativo desta campanha.' using errcode = 'insufficient_privilege';
  end if;

  if p_creation_request_id is not null then
    select * into v_existing
      from characters
      where campaign_id = p_campaign_id
        and owner_id = v_uid
        and archived_at is null
        and payload->'metadados'->>'creationRequestId' = p_creation_request_id
      limit 1;
    if found then
      delete from character_creation_drafts
        where campaign_id = p_campaign_id
          and owner_id = v_uid;
      return jsonb_build_object('character', to_jsonb(v_existing), 'idempotentReplay', true);
    end if;
  end if;

  v_regras := resolve_effective_content_payload(p_campaign_id, 'character_rule', 'regras_personagem');
  v_aretz_iniciais := coalesce((v_regras->'criacao_personagem'->'inventario'->>'aretz_iniciais')::numeric, 5000);

  v_niveis_vertente := coalesce(p_character_payload->'niveis_vertente', '{}'::jsonb);
  if jsonb_typeof(v_niveis_vertente) <> 'object' then
    raise exception 'Vertentes com formato inválido.' using errcode = '22023';
  end if;
  for v_vertente, v_nivel_vertente in select key, value::numeric from jsonb_each_text(v_niveis_vertente) loop
    if v_nivel_vertente < 0 or v_nivel_vertente <> trunc(v_nivel_vertente) then
      raise exception 'Nível de vertente inválido: "%".', v_vertente using errcode = '22023';
    end if;
    v_vertentes_pontos := v_vertentes_pontos + v_nivel_vertente;
    if v_nivel_vertente > 0 and not exists (
      select 1 from jsonb_array_elements_text(
        coalesce((select jsonb_agg(cd.payload->>'vertente') from content_documents cd where cd.content_type = 'spell' and cd.status = 'published'), '[]'::jsonb)
        || coalesce((select jsonb_agg(ccd.payload->>'vertente') from campaign_content_documents ccd where ccd.campaign_id = p_campaign_id and ccd.content_type = 'spell' and ccd.status = 'published'), '[]'::jsonb)
      ) as vert(v)
      where vert.v = v_vertente
    ) then
      raise exception 'Vertente inexistente: "%".', v_vertente using errcode = 'no_data_found';
    end if;
  end loop;
  if v_vertentes_pontos > 3 then
    raise exception 'Pontos de vertente acima do orçamento de criação (máximo 3, recebido %).', v_vertentes_pontos using errcode = '22023';
  end if;

  v_magias := coalesce(p_character_payload->'magias_aprendidas', '[]'::jsonb);
  if jsonb_typeof(v_magias) <> 'array' then
    raise exception 'Magias com formato inválido.' using errcode = '22023';
  end if;
  for v_magia in select * from jsonb_array_elements(v_magias) loop
    if v_magia->>'spellSlug' is null then
      raise exception 'Magia sem referência.' using errcode = '22023';
    end if;
    if v_magia->>'spellSlug' = any(v_spell_slugs) then
      raise exception 'Magia duplicada: "%".', v_magia->>'spellSlug' using errcode = '22023';
    end if;
    v_spell_slugs := array_append(v_spell_slugs, v_magia->>'spellSlug');

    v_magia_payload := resolve_effective_content_payload(p_campaign_id, 'spell', v_magia->>'spellSlug');
    if v_magia_payload is null then
      raise exception 'Magia inexistente, arquivada, em rascunho ou de outra campanha: "%".', v_magia->>'spellSlug' using errcode = 'no_data_found';
    end if;

    v_spell_vertente := v_magia_payload->>'vertente';
    v_spell_nivel := coalesce((v_magia_payload->'estatisticas'->>'nivel')::numeric, 0);
    if coalesce((v_niveis_vertente->>v_spell_vertente)::numeric, 0) <= 0 then
      raise exception 'Magia "%" pertence à vertente "%", que o personagem não investiu.', v_magia->>'spellSlug', v_spell_vertente using errcode = 'insufficient_privilege';
    end if;
    if v_spell_nivel > (v_niveis_vertente->>v_spell_vertente)::numeric then
      raise exception 'Magia "%" (nível %) acima do nível investido na vertente "%".', v_magia->>'spellSlug', v_spell_nivel, v_spell_vertente using errcode = 'insufficient_privilege';
    end if;
  end loop;

  v_talentos := coalesce(p_character_payload->'talentos_adquiridos', '[]'::jsonb);
  if jsonb_typeof(v_talentos) <> 'array' then
    raise exception 'Talentos com formato inválido.' using errcode = '22023';
  end if;
  for v_talento in select * from jsonb_array_elements(v_talentos) loop
    if v_talento->>'talentoId' is null or v_talento->>'nivelId' is null then
      raise exception 'Talento sem referência.' using errcode = '22023';
    end if;
    if v_talento->>'nivelId' = any(v_talento_ids) then
      raise exception 'Talento duplicado: "%".', v_talento->>'nivelId' using errcode = '22023';
    end if;
    v_talento_ids := array_append(v_talento_ids, v_talento->>'nivelId');

    v_talento_payload := resolve_effective_content_payload(p_campaign_id, 'talent', v_talento->>'talentoId');
    if v_talento_payload is null then
      raise exception 'Talento inexistente, arquivado, em rascunho ou de outra campanha: "%".', v_talento->>'talentoId' using errcode = 'no_data_found';
    end if;

    select elem into v_nivel_obj
      from jsonb_array_elements(coalesce(v_talento_payload->'niveis', '[]'::jsonb)) elem
      where elem->>'id' = v_talento->>'nivelId'
      limit 1;
    v_nivel_encontrado := v_nivel_obj is not null;
    if not v_nivel_encontrado then
      raise exception 'Nível de talento inexistente: "%".', v_talento->>'nivelId' using errcode = 'no_data_found';
    end if;
    if coalesce((v_nivel_obj->>'nivel')::numeric, 0) <> 1 then
      raise exception 'Talento "%" não é de nível 1 — só nível 1 é permitido na criação.', v_talento->>'nivelId' using errcode = 'insufficient_privilege';
    end if;
  end loop;

  v_inventario := coalesce(p_character_payload->'inventario', '[]'::jsonb);
  if jsonb_typeof(v_inventario) <> 'array' then
    raise exception 'Inventário com formato inválido.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(v_inventario) loop
    v_item_slug := v_item->>'itemSlug';
    if v_item_slug is not null and v_item_slug <> 'aljava' then
      v_item_payload := resolve_effective_content_payload(p_campaign_id, 'item', v_item_slug);
      if v_item_payload is not null and (v_item_payload->'estatisticas'->>'subtipo') = 'arremesso_disparo' then
        v_tem_arco := true;
      end if;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(v_inventario) loop
    v_item_slug := v_item->>'itemSlug';
    if v_item_slug is null then
      raise exception 'Item sem referência no inventário.' using errcode = '22023';
    end if;

    v_item_quantidade := coalesce((v_item->>'quantidade')::numeric, 0);
    if v_item_quantidade <= 0 or v_item_quantidade <> trunc(v_item_quantidade) then
      raise exception 'Quantidade inválida para o item "%": %.', v_item_slug, v_item_quantidade using errcode = '22023';
    end if;

    v_item_payload := resolve_effective_content_payload(p_campaign_id, 'item', v_item_slug);
    if v_item_payload is null then
      raise exception 'Item inexistente, arquivado, em rascunho ou de outra campanha: "%".', v_item_slug using errcode = 'no_data_found';
    end if;

    v_item_raridade := v_item_payload->>'raridade';
    if v_item_raridade is null or v_item_raridade not in ('muito_comum', 'comum', 'incomum') then
      raise exception 'Item "%" tem raridade "%", não permitida na criação (até incomum).', v_item_slug, coalesce(v_item_raridade, '(nenhuma)') using errcode = 'insufficient_privilege';
    end if;

    v_preco_canonico := coalesce((v_item_payload->>'preco')::numeric, 0);
    v_item_preco_pago := coalesce((v_item->>'precoPago')::numeric, -1);

    if v_item_slug = 'aljava' and v_item_preco_pago = 0 and v_tem_arco and not v_aljava_gratis_usada then
      v_aljava_gratis_usada := true;
    elsif v_item_preco_pago <> v_preco_canonico * v_item_quantidade then
      raise exception 'Preço adulterado para o item "%": pago %, canônico % (quantidade %).', v_item_slug, v_item_preco_pago, v_preco_canonico * v_item_quantidade, v_item_quantidade using errcode = 'insufficient_privilege';
    else
      v_gasto_total := v_gasto_total + v_item_preco_pago;
    end if;
  end loop;

  if v_gasto_total > v_aretz_iniciais then
    raise exception 'Saldo insuficiente: gasto total % excede o orçamento inicial %.', v_gasto_total, v_aretz_iniciais using errcode = 'insufficient_privilege';
  end if;

  v_carteira := coalesce(p_character_payload->'carteira', '{}'::jsonb);
  if coalesce((v_carteira->>'aretz_informal')::numeric, -1) <> (v_aretz_iniciais - v_gasto_total) then
    raise exception 'Carteira final inconsistente: esperado % (inicial % − gasto %), recebido %.',
      (v_aretz_iniciais - v_gasto_total), v_aretz_iniciais, v_gasto_total, v_carteira->>'aretz_informal' using errcode = 'insufficient_privilege';
  end if;
  if coalesce((v_carteira->>'cdi')::numeric, 0) <> 0 or coalesce((v_carteira->>'cdi_craqueada')::numeric, 0) <> 0 then
    raise exception 'A criação não movimenta CDI/CDI craqueada — valores precisam ser 0.' using errcode = 'insufficient_privilege';
  end if;

  insert into characters (name, owner_label, status, payload, campaign_id, owner_id)
  values (
    coalesce(nullif(trim(both from (p_character_payload->>'nome')), ''), 'Personagem sem nome'),
    p_owner_label,
    'draft',
    p_character_payload,
    p_campaign_id,
    v_uid
  )
  returning * into v_new;

  -- A conta que criou o personagem recebe controle automaticamente
  -- (aditivo §11.2: "jogador recebe controle automaticamente") — MAS só
  -- quando quem criou não é o narrador da própria campanha. O narrador
  -- já tem acesso administrativo total via is_campaign_owner; uma linha
  -- redundante em character_controllers só faria esse personagem contar
  -- indevidamente no filtro "Jogadores" da página Personagens (correção
  -- desta revisão).
  if not is_campaign_owner(p_campaign_id, v_uid) then
    insert into character_controllers (character_id, campaign_id, user_id, granted_by)
    values (v_new.id, p_campaign_id, v_uid, v_uid)
    on conflict (character_id, user_id) do nothing;
  end if;

  delete from character_creation_drafts
    where campaign_id = p_campaign_id
      and owner_id = v_uid;

  return jsonb_build_object('character', to_jsonb(v_new), 'idempotentReplay', false);
end;
$function$;
revoke all on function complete_character_creation(uuid, jsonb, text, text) from public;
revoke all on function complete_character_creation(uuid, jsonb, text, text) from anon;
grant execute on function complete_character_creation(uuid, jsonb, text, text) to authenticated;

commit;
