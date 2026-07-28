-- =====================================================================
-- Ruptura VTT — validação canônica de conteúdo na conclusão do wizard
-- Migration: 0046_canonical_creation_content_validation
--
-- Bloqueador desta rodada: `complete_character_creation` (migration
-- 0044) já era atômica e idempotente, mas nunca validava se
-- magias/talentos/itens REFERENCIADOS no payload realmente existem no
-- conteúdo publicado — um chamador hostil (direto na RPC, sem passar
-- pela Server Action/wizard) podia gravar um personagem com magia
-- inexistente, talento arquivado, item de outra campanha, preço
-- adulterado, saldo fabricado, etc. Confirmado AO VIVO na rodada
-- anterior (CHECKPOINT_FECHAMENTO_CONVITES_LOGS_ATOMICIDADE.md, item 6).
--
-- `resolve_effective_content_payload` replica — NUNCA duplica com
-- lógica divergente — a MESMA precedência já usada por
-- `resolveEffectiveOne` (TypeScript, `src/lib/campaignContent/
-- resolveEffectiveContent.ts`): um registro publicado da CAMPANHA
-- (`campaign_content_documents`, cobre tanto "override" de oficial
-- quanto "homebrew" — a constraint `campaign_content_documents_unique`
-- já garante no máximo 1 linha por campanha+tipo+slug, então não há
-- ambiguidade de qual vence) tem prioridade sobre o OFICIAL
-- (`content_documents`, também só published). Nunca considera
-- `content_drafts` (rascunho nunca sai dessa tabela) nem linhas
-- `status='archived'` de nenhuma das duas fontes — refletido pelo
-- filtro `status = 'published'` em ambas as subconsultas.
--
-- `complete_character_creation` é reescrita para, DENTRO da mesma
-- transação (nunca a Server Action sozinha — chamar a RPC direto,
-- pulando a Server Action, continuaria vulnerável se a validação
-- vivesse só em TypeScript):
--   1. resolver cada vertente/magia/talento/item pelo slug, usando
--      APENAS o resolvedor efetivo acima (nunca nome/nível/vertente/
--      preço/raridade enviados pelo client);
--   2. rejeitar (rollback integral, nenhuma linha gravada) referência
--      inexistente, arquivada, em draft ou de outra campanha — todas
--      colapsam no mesmo caso "resolvedor retornou null", porque é
--      exatamente isso que ausência/arquivamento/draft/campanha errada
--      significam para o resolvedor real;
--   3. validar magia: vertente investida (`niveis_vertente`) cobre o
--      nível da magia; vertente da magia precisa ter pelo menos 1
--      ponto investido; sem duplicata de `spellSlug`;
--   4. validar talento: nível 1 (único permitido na criação, mesmo
--      filtro já aplicado pelo wizard, `CreateCharacterWizardClient.tsx`
--      `talentoOptions`); sem duplicata;
--   5. validar item: raridade em `{muito_comum, comum, incomum}` (MESMO
--      conjunto do wizard, `RARIDADES_PERMITIDAS_NA_CRIACAO`,
--      `personagens/novo/page.tsx`); preço PAGO precisa bater com
--      `preco_canonico × quantidade` (Aljava tem uma exceção
--      documentada abaixo); quantidade inteira positiva;
--   6. calcular o gasto total a partir dos preços CANÔNICOS (nunca do
--      que o client alega ter pago) e validar saldo: carteira final
--      de `aretz_informal` = inicial (`regras_personagem.criacao_personagem.
--      inventario.aretz_iniciais`, resolvido pelo MESMO mecanismo de
--      conteúdo efetivo, nunca hardcoded nem enviado pelo client) menos
--      o gasto canônico; `cdi`/`cdi_craqueada` precisam ser 0 (o wizard
--      nunca oferece gastar essas carteiras na criação);
--   7. só então materializar (mesmo INSERT único de sempre) e
--      continuar com o vínculo de perfil idempotente já existente.
--
-- Vertentes não são `content_type` próprio (documentado desde a
-- criação do wizard) — o conjunto de vertentes "existentes" é derivado
-- dinamicamente das magias efetivas publicadas da campanha (mesmo
-- critério do wizard, `vertentesDisponiveis` em
-- `CreateCharacterWizardClient.tsx`, nunca uma lista hardcoded).
--
-- Especialização: não existe como conceito na criação atual (nem
-- textual) — nenhuma chave correspondente em `Character`/no wizard.
-- Nada a validar; não inventado nesta rodada.
--
-- Aljava: `aljava` É um item publicado real (preço 50, raridade
-- "comum") — resolvido e validado como qualquer outro item quando
-- comprado diretamente. A ÚNICA exceção documentada: o wizard concede
-- a PRIMEIRA Aljava de graça (`precoPago: 0`) na compra do primeiro
-- arco (`item.subtipo = 'arremesso_disparo'`, mesmo campo que
-- `deriveModoMunicao` usa em `character/inventory.ts`) — a validação
-- aceita `precoPago = 0` para uma (e só uma) instância de `aljava` SE
-- e somente se o inventário contém pelo menos um item cujo conteúdo
-- efetivo tem `subtipo = 'arremesso_disparo'`; qualquer Aljava
-- adicional além dessa precisa ter sido paga pelo preço canônico.
--
-- Pré-requisito de talento: o próprio wizard (`talentoOptions`) já
-- filtra só níveis `nivel === 1` sem checar `requisitos` — os dados
-- reais de nível 1 sempre têm `requisitos: []` (auditado em
-- `content/db_talentos_normalizado_v1_3.json`). Esta migration valida
-- nível 1 + existência; não inventa um motor de checagem de
-- pré-requisito que o próprio wizard nunca teve — se um talento nível
-- 1 futuro publicar `requisitos` não-vazio, a criação continuará
-- aceitando (mesma lacuna do produto real, não desta migration).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Resolvedor efetivo canônico (réplica fiel de resolveEffectiveOne)
-- ---------------------------------------------------------------------

create or replace function resolve_effective_content_payload(
  p_campaign_id uuid,
  p_content_type content_type,
  p_slug text
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    (
      select payload from campaign_content_documents
      where campaign_id = p_campaign_id
        and content_type = p_content_type
        and slug = p_slug
        and status = 'published'
      limit 1
    ),
    (
      select payload from content_documents
      where content_type = p_content_type
        and slug = p_slug
        and status = 'published'
      limit 1
    )
  );
$$;

revoke all on function resolve_effective_content_payload(uuid, content_type, text) from public, anon;
grant execute on function resolve_effective_content_payload(uuid, content_type, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. complete_character_creation — validação canônica dentro da MESMA
--    transação, antes de qualquer INSERT.
-- ---------------------------------------------------------------------

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
        return jsonb_build_object('character', to_jsonb(v_existing), 'idempotentReplay', true);
      end if;
      raise;
  end;

  update campaign_profiles set active_character_id = v_new.id where id = p_profile_id;

  return jsonb_build_object('character', to_jsonb(v_new), 'idempotentReplay', false);
end;
$$;

revoke all on function complete_character_creation(uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function complete_character_creation(uuid, uuid, jsonb, text, text) to authenticated;

commit;
