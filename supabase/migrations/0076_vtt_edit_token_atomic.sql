-- =====================================================================
-- 0076 — Edição de token ATÔMICA. Achado de auditoria: o fluxo de
-- edição da UI chamava `update_vtt_token` e, se o tamanho mudasse,
-- `resize_vtt_token` — duas RPCs, duas transações. Uma falha no
-- redimensionar (colisão/borda/bloqueio) deixava o restante da edição
-- (nome/sigla/PV/condições/...) já persistido, mesmo o formulário
-- devolvendo erro.
--
-- `edit_vtt_token` faz tudo numa função só (uma transação, por
-- definição de `plpgsql`): trava a linha, autoriza, checa revisão,
-- revalida a pegada (mesma função `vtt_validar_pegada_em` de sempre —
-- nunca reimplementada) só quando o tamanho de fato muda, contra a
-- ÂNCORA e ORIENTAÇÃO ATUAIS do token (nunca alteradas aqui — edição
-- não move nem gira), um único `update`, uma única `revision + 1`, uma
-- única invalidação. Qualquer `raise exception` no meio (autorização,
-- revisão, pegada) reverte a função inteira — nada fica parcialmente
-- salvo.
--
-- `update_vtt_token`/`resize_vtt_token` permanecem intactas (têm
-- suíte própria de autorização, `check-vtt-gerenciamento-tokens.ts`)
-- — só deixam de ser chamadas pelo fluxo de edição da UI.
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

  -- Só revalida pegada/colisão quando o TAMANHO de fato muda — âncora
  -- (q,r) e orientação são sempre as do token JÁ PERSISTIDO: edição
  -- nunca move nem gira (isso é arrasto no mapa / menu contextual,
  -- fora desta RPC).
  if p_tamanho is distinct from v_token.tamanho then
    perform vtt_validar_pegada_em(v_token.scene_id, p_tamanho, v_token.orientacao, v_token.pegada_personalizada, v_token.q, v_token.r, v_token.id);
  end if;

  update vtt_tokens
  set nome = p_nome, sigla = coalesce(nullif(p_sigla, ''), '??'), lado = p_lado, vertente = coalesce(p_vertente, 'nenhuma'),
      character_id = p_character_id, retrato_url = p_retrato_url,
      pv_atual = p_pv_atual, pv_max = p_pv_max, condicoes = coalesce(p_condicoes, '{}'),
      tamanho = p_tamanho,
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

revoke all on function edit_vtt_token(uuid, text, text, text, text, uuid, text, integer, integer, text[], text, integer) from public;
grant execute on function edit_vtt_token(uuid, text, text, text, text, uuid, text, integer, integer, text[], text, integer) to authenticated;

commit;
