-- =====================================================================
-- 0077 — Corrige `edit_vtt_token` (migration 0076): quando o TAMANHO
-- muda pelo formulário comum, a pegada precisa virar o preset
-- CANÔNICO da categoria nova — nunca preservar uma `pegada_personalizada`
-- antiga.
--
-- Achado: 0076 revalidava e mantinha `v_token.pegada_personalizada`
-- (a ANTIGA) ao trocar de tamanho. Um token com pegada personalizada
-- 6×1 editado pra "Médio" validava contra a forma 6×1 (não contra o
-- preset de 1 célula de Médio), salvava `tamanho = 'medio'` mas
-- MANTINHA a pegada 6×1 — a UI passava a dizer "ocupa 1 hex" enquanto
-- o token continuava ocupando 6 de verdade.
--
-- Corrigido: ao trocar de tamanho, valida com `pegada_personalizada =
-- null` (o preset da categoria nova, nunca a forma antiga) e o UPDATE
-- zera `pegada_personalizada` junto com `tamanho`. Quando o tamanho
-- NÃO muda, nem revalida nem toca `pegada_personalizada` — uma edição
-- só de nome/PV/condições não pode destruir uma pegada irregular já
-- existente. Âncora/orientação continuam nunca alteradas aqui. Mesma
-- transação única, uma revisão, uma invalidação — `edit_vtt_token`
-- continua sendo a única RPC do fluxo de editar.
-- =====================================================================

begin;

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

  -- Só revalida quando o TAMANHO de fato muda — e sempre contra o
  -- PRESET da categoria nova (`pegada_personalizada = null`), NUNCA
  -- contra a pegada personalizada antiga (ela deixa de existir pro
  -- token a partir daqui). Âncora (q,r) e orientação são sempre as do
  -- token JÁ PERSISTIDO: edição nunca move nem gira (isso é arrasto no
  -- mapa / menu contextual, fora desta RPC).
  if v_tamanho_mudou then
    perform vtt_validar_pegada_em(v_token.scene_id, p_tamanho, v_token.orientacao, null, v_token.q, v_token.r, v_token.id);
  end if;

  update vtt_tokens
  set nome = p_nome, sigla = coalesce(nullif(p_sigla, ''), '??'), lado = p_lado, vertente = coalesce(p_vertente, 'nenhuma'),
      character_id = p_character_id, retrato_url = p_retrato_url,
      pv_atual = p_pv_atual, pv_max = p_pv_max, condicoes = coalesce(p_condicoes, '{}'),
      tamanho = p_tamanho,
      -- Tamanho mudou → limpa a pegada personalizada (o preset da
      -- categoria nova é quem manda). Tamanho igual → preserva o que
      -- já estava lá, seja `null` seja uma forma irregular.
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
