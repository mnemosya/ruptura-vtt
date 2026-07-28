-- =====================================================================
-- Ruptura VTT — limpeza atômica do draft do wizard na conclusão
-- Migration: 0048_creation_draft_cleanup_on_complete
--
-- Complementa a migration 0047 (draft persistente do wizard): a
-- exclusão do draft ao concluir a criação NÃO pode ser deixada só para
-- o client (dentro de `finalizar()`, pós-sucesso) — isso deixaria uma
-- janela (personagem criado, aba fecha/rede cai antes do delete) que
-- gera uma linha de draft órfã e inofensiva, mas persistente.
--
-- `complete_character_creation` (migration 0046) é reescrita — MESMA
-- assinatura, MESMA lógica de validação canônica, sem nenhuma mudança
-- de comportamento existente — só para apagar, DENTRO da mesma
-- transação, a linha de `character_creation_drafts` correspondente a
-- este `(campaign_id, profile_id)`, em TODOS os pontos de retorno
-- (idempotent replay pela chave, idempotent replay pela colisão do
-- índice único, e o caminho de sucesso normal). Como
-- `character_creation_drafts` já tem índice único em
-- `(campaign_id, profile_id)`, o filtro por `creation_request_id` no
-- delete é redundante com o filtro por perfil+campanha (só existe uma
-- linha possível) — mantido mesmo assim como defesa em profundidade
-- explícita, documentando a intenção de só apagar O draft desta
-- tentativa de criação.
--
-- O delete client-side em `finalizar()` (ver storage.ts) continua
-- existindo como reforço best-effort redundante — apagar uma linha que
-- já não existe não é erro.
-- =====================================================================

begin;

create or replace function complete_character_creation(
  p_campaign_id uuid,
  p_profile_id uuid,
  p_character_payload jsonb,
  p_owner_label text default null,
  p_creation_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_profile campaign_profiles%rowtype;
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

  select * into v_profile from campaign_profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Perfil não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_profile.campaign_id is distinct from p_campaign_id then
    raise exception 'Este perfil não pertence a esta campanha.' using errcode = 'insufficient_privilege';
  end if;
  if v_profile.user_id is distinct from v_uid and not is_campaign_owner(p_campaign_id) then
    raise exception 'Você só pode concluir a criação para o PRÓPRIO perfil.' using errcode = 'insufficient_privilege';
  end if;

  -- Idempotência (retry de rede após sucesso) — checada ANTES de
  -- validar conteúdo: um retry de uma criação já bem-sucedida nunca
  -- deve falhar por causa de conteúdo que, por hipótese, já foi
  -- validado e aceito na primeira chamada.
  if p_creation_request_id is not null then
    select * into v_existing
      from characters
      where profile_id = p_profile_id
        and campaign_id = p_campaign_id
        and archived_at is null
        and payload->'metadados'->>'creationRequestId' = p_creation_request_id
      limit 1;
    if found then
      -- Migration 0048: retry de uma criação já concluída — o draft
      -- (se ainda existir) não serve mais para este perfil.
      delete from character_creation_drafts
        where campaign_id = p_campaign_id
          and profile_id = p_profile_id
          and creation_request_id = p_creation_request_id;
      return jsonb_build_object('character', to_jsonb(v_existing), 'idempotentReplay', true);
    end if;
  end if;

  -- ---------------------------------------------------------------
  -- Regras de criação (orçamento de aretz) — mesmo mecanismo de
  -- conteúdo efetivo, nunca hardcoded nem confiado do client.
  -- ---------------------------------------------------------------
  v_regras := resolve_effective_content_payload(p_campaign_id, 'character_rule', 'regras_personagem');
  v_aretz_iniciais := coalesce((v_regras->'criacao_personagem'->'inventario'->>'aretz_iniciais')::numeric, 5000);

  -- ---------------------------------------------------------------
  -- Vertentes: soma <= 3 (PONTOS_VERTENTE_CRIACAO, mesma constante de
  -- src/lib/character/createCharacterValidation.ts — não há campo em
  -- regras_personagem para isso ainda, mesma ressalva já documentada
  -- desde o wizard original); cada vertente com pontos > 0 precisa
  -- corresponder a pelo menos 1 magia efetiva publicada com esse
  -- `vertente` (nunca uma lista hardcoded de vertentes).
  -- ---------------------------------------------------------------
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

  -- ---------------------------------------------------------------
  -- Magias
  -- ---------------------------------------------------------------
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

  -- ---------------------------------------------------------------
  -- Talentos (só nível 1 na criação, mesmo filtro do wizard)
  -- ---------------------------------------------------------------
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

  -- ---------------------------------------------------------------
  -- Itens: raridade permitida, preço/quantidade canônicos, saldo.
  -- ---------------------------------------------------------------
  v_inventario := coalesce(p_character_payload->'inventario', '[]'::jsonb);
  if jsonb_typeof(v_inventario) <> 'array' then
    raise exception 'Inventário com formato inválido.' using errcode = '22023';
  end if;

  -- Primeira passada: detecta se há algum "arco" (arremesso_disparo)
  -- legítimo no inventário — condição para a Aljava grátis abaixo.
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
      -- Primeira Aljava concedida de graça na compra do primeiro arco
      -- (mesma regra de `purchaseItem`/`createAljavaInstance`,
      -- character/inventory.ts) — só uma vez.
      v_aljava_gratis_usada := true;
    elsif v_item_preco_pago <> v_preco_canonico * v_item_quantidade then
      raise exception 'Preço adulterado para o item "%": pago %, canônico % (quantidade %).', v_item_slug, v_item_preco_pago, v_preco_canonico * v_item_quantidade, v_item_quantidade using errcode = 'insufficient_privilege';
    else
      v_gasto_total := v_gasto_total + v_item_preco_pago;
    end if;
  end loop;

  -- Segunda Aljava (ou mais) sem arco correspondente não passa pelo
  -- ramo grátis acima — cai automaticamente na validação de preço
  -- canônico normal (50 × quantidade), como qualquer outro item.

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

  -- ---------------------------------------------------------------
  -- Materialização — só depois de TODAS as validações acima passarem.
  -- ---------------------------------------------------------------
  begin
    insert into characters (name, owner_label, status, payload, campaign_id, profile_id, owner_id)
    values (
      coalesce(nullif(trim(both from (p_character_payload->>'nome')), ''), 'Personagem sem nome'),
      p_owner_label,
      'draft',
      p_character_payload,
      p_campaign_id,
      p_profile_id,
      v_uid
    )
    returning * into v_new;
  exception
    when unique_violation then
      select * into v_existing
        from characters
        where profile_id = p_profile_id and campaign_id = p_campaign_id and archived_at is null
        order by created_at asc
        limit 1;
      if found then
        -- Migration 0048: outra chamada concorrente já materializou o
        -- personagem — o draft desta tentativa não serve mais.
        delete from character_creation_drafts
          where campaign_id = p_campaign_id
            and profile_id = p_profile_id
            and creation_request_id = p_creation_request_id;
        return jsonb_build_object('character', to_jsonb(v_existing), 'idempotentReplay', true);
      end if;
      raise;
  end;

  update campaign_profiles set active_character_id = v_new.id where id = p_profile_id;

  -- Migration 0048: personagem criado com sucesso — o draft do wizard
  -- para este perfil nesta campanha não serve mais. Atômico com o
  -- insert acima (mesma transação): personagem criado e draft removido
  -- acontecem juntos, ou nenhum dos dois (rollback desfaz ambos).
  delete from character_creation_drafts
    where campaign_id = p_campaign_id
      and profile_id = p_profile_id
      and creation_request_id = p_creation_request_id;

  return jsonb_build_object('character', to_jsonb(v_new), 'idempotentReplay', false);
end;
$$;

revoke all on function complete_character_creation(uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function complete_character_creation(uuid, uuid, jsonb, text, text) to authenticated;

commit;
