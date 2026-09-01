-- =====================================================================
-- 0078 — Nome opcional na criação/edição de token: campo vazio (ou só
-- espaços) gera automaticamente "#1", "#2", "#3"... no SERVIDOR, nunca
-- no cliente (o número real depende do estado da cena no instante
-- exato da criação — um palpite do cliente sempre arriscaria colidir).
--
-- Regra exata:
--   - normaliza espaços (`trim`) antes de decidir se está vazio;
--   - "vazio" inclui string vazia e string só de espaços;
--   - o menor inteiro positivo tal que "#N" NÃO bate, via igualdade
--     exata, com nenhum nome já usado NESTA CENA (não na campanha
--     inteira) — "Goblin #1" nunca conta como ocupação de "#1", só um
--     nome EXATAMENTE igual a "#1" conta;
--   - concorrência: `pg_advisory_xact_lock` derivado do `scene_id`
--     serializa a ALOCAÇÃO entre criações simultâneas na mesma cena —
--     nunca "consultar no cliente e depois criar" (não existe consulta
--     nenhuma do lado do cliente); o lock é TRANSACIONAL (libera
--     sozinho no fim da transação, sucesso ou falha) — uma criação
--     recusada depois (ex.: pegada não cabe) nunca "queima" um número,
--     porque a `insert`/`update` inteira é revertida junto com o lock;
--   - sigla: só é derivada do número quando o SIGLA TAMBÉM está vazio
--     (uma sigla explícita do usuário, mesmo com nome vazio, nunca é
--     sobrescrita) — nunca persiste "??" quando o servidor já sabe o
--     nome automático.
--
-- Extraído num helper (`vtt_alocar_nome_automatico`) reaproveitado por
-- `create_vtt_token` E `edit_vtt_token` — mesma regra nos dois, uma
-- verdade só (pedido explícito: "aplicar a mesma regra também à
-- edição, para manter consistência").
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Helper: menor "#N" livre nesta cena, sob trava transacional.
-- `p_excluir_token_id`: só usado pela EDIÇÃO — o próprio token sendo
-- editado ainda carrega seu nome ANTIGO (`#N` antigo, se tinha) no
-- instante desta consulta (o `update` ainda não rodou); sem excluir a
-- si mesmo da checagem de "já ocupado", um token que já era "#3"
-- nunca conseguiria reclamar "#3" de volta ao ter o nome limpo de
-- novo — sempre pularia pra outro número à toa.
-- ---------------------------------------------------------------------
create or replace function vtt_alocar_nome_automatico(p_scene_id uuid, p_excluir_token_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_numero integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_scene_id::text, 0));
  select coalesce(min(n), 1) into v_numero
  from generate_series(1, (
    select count(*) + 1 from vtt_tokens
    where scene_id = p_scene_id and nome ~ '^#[0-9]+$'
      and (p_excluir_token_id is null or id <> p_excluir_token_id)
  )) as n
  where not exists (
    select 1 from vtt_tokens
    where scene_id = p_scene_id and nome = '#' || n::text
      and (p_excluir_token_id is null or id <> p_excluir_token_id)
  );
  return '#' || v_numero::text;
end;
$$;

revoke all on function vtt_alocar_nome_automatico(uuid, uuid) from public;
grant execute on function vtt_alocar_nome_automatico(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- create_vtt_token — mesma assinatura de sempre; nome/sigla vazios
-- (ou só espaços) viram automáticos ANTES de validar a pegada (se a
-- validação falhar depois, a transação inteira — incluindo a trava —
-- reverte, sem número perdido).
-- ---------------------------------------------------------------------
create or replace function create_vtt_token(
  p_scene_id uuid,
  p_campaign_id uuid,
  p_nome text,
  p_sigla text,
  p_lado text,
  p_vertente text,
  p_tamanho text,
  p_orientacao integer,
  p_pegada_personalizada jsonb,
  p_q integer,
  p_r integer,
  p_character_id uuid,
  p_visivel boolean,
  p_bloqueado boolean,
  p_retrato_url text,
  p_pv_atual integer,
  p_pv_max integer,
  p_condicoes text[]
) returns vtt_tokens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token vtt_tokens;
  v_nome text;
  v_sigla text;
begin
  if not is_campaign_owner(p_campaign_id) then
    raise exception 'Só o narrador cria tokens.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from vtt_scenes where id = p_scene_id and campaign_id = p_campaign_id) then
    raise exception 'Cena não encontrada para esta campanha.' using errcode = 'no_data_found';
  end if;

  v_nome := trim(coalesce(p_nome, ''));
  v_sigla := trim(coalesce(p_sigla, ''));
  if v_nome = '' then
    v_nome := vtt_alocar_nome_automatico(p_scene_id, null);
    if v_sigla = '' then v_sigla := substring(v_nome from 2); end if; -- "#7" → "7"
  end if;

  perform vtt_validar_pegada_em(p_scene_id, p_tamanho, p_orientacao, p_pegada_personalizada, p_q, p_r, null);

  insert into vtt_tokens (
    scene_id, campaign_id, character_id, nome, sigla, lado, vertente,
    q, r, tamanho, orientacao, pegada_personalizada,
    visivel, bloqueado, retrato_url, pv_atual, pv_max, condicoes
  ) values (
    p_scene_id, p_campaign_id, p_character_id, v_nome, coalesce(nullif(v_sigla, ''), '??'), p_lado, coalesce(p_vertente, 'nenhuma'),
    p_q, p_r, p_tamanho, coalesce(p_orientacao, 0), p_pegada_personalizada,
    coalesce(p_visivel, true), coalesce(p_bloqueado, false), p_retrato_url, p_pv_atual, p_pv_max, coalesce(p_condicoes, '{}')
  )
  returning * into v_token;

  perform realtime.send(
    jsonb_build_object('v', 1, 'campaignId', p_campaign_id::text, 'sceneId', p_scene_id::text, 'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint),
    'tokens_changed', 'campaign:' || p_campaign_id::text || ':scene:' || p_scene_id::text || ':vtt:tokens-changed', true
  );

  return v_token;
end;
$$;

-- ---------------------------------------------------------------------
-- edit_vtt_token — mesma regra, mesma assinatura (migration 0077).
-- Exclui o PRÓPRIO token da checagem de "#N ocupado" (ver comentário
-- do helper acima).
-- ---------------------------------------------------------------------
create or replace function edit_vtt_token(
  p_token_id uuid,
  p_nome text,
  p_sigla text,
  p_lado text,
  p_vertente text,
  p_character_id uuid,
  p_retrato_url text,
  p_pv_atual integer,
  p_pv_max integer,
  p_condicoes text[],
  p_tamanho text,
  p_expected_revision integer
) returns vtt_tokens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token vtt_tokens;
  v_tamanho_mudou boolean;
  v_nome text;
  v_sigla text;
begin
  select * into v_token from vtt_tokens where id = p_token_id for update;
  if v_token is null then
    raise exception 'Token não encontrado.' using errcode = 'no_data_found';
  end if;
  if not is_campaign_owner(v_token.campaign_id) then
    raise exception 'Só o narrador edita tokens.' using errcode = 'insufficient_privilege';
  end if;
  if v_token.revision <> p_expected_revision then
    raise exception 'Revisão desatualizada — outra pessoa já alterou este token.' using errcode = 'check_violation';
  end if;

  v_tamanho_mudou := p_tamanho is distinct from v_token.tamanho;

  v_nome := trim(coalesce(p_nome, ''));
  v_sigla := trim(coalesce(p_sigla, ''));
  if v_nome = '' then
    v_nome := vtt_alocar_nome_automatico(v_token.scene_id, v_token.id);
    if v_sigla = '' then v_sigla := substring(v_nome from 2); end if;
  end if;

  if v_tamanho_mudou then
    perform vtt_validar_pegada_em(v_token.scene_id, p_tamanho, v_token.orientacao, null, v_token.q, v_token.r, v_token.id);
  end if;

  update vtt_tokens
  set nome = v_nome, sigla = coalesce(nullif(v_sigla, ''), '??'), lado = p_lado, vertente = coalesce(p_vertente, 'nenhuma'),
      character_id = p_character_id, retrato_url = p_retrato_url,
      pv_atual = p_pv_atual, pv_max = p_pv_max, condicoes = coalesce(p_condicoes, '{}'),
      tamanho = p_tamanho,
      pegada_personalizada = case when v_tamanho_mudou then null else v_token.pegada_personalizada end,
      revision = v_token.revision + 1, updated_at = now()
  where id = p_token_id
  returning * into v_token;

  perform realtime.send(
    jsonb_build_object('v', 1, 'campaignId', v_token.campaign_id::text, 'sceneId', v_token.scene_id::text, 'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint),
    'tokens_changed', 'campaign:' || v_token.campaign_id::text || ':scene:' || v_token.scene_id::text || ':vtt:tokens-changed', true
  );

  return v_token;
end;
$$;

commit;
