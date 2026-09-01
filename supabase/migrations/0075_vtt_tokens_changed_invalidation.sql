-- =====================================================================
-- 0075 — Invalidação sanitizada de tokens (sincroniza ocultar/revelar
-- e todo o CRUD sem depender de `postgres_changes` sobre uma linha que
-- a RLS pode ter ocultado do destinatário).
--
-- Achado de auditoria: quando o narrador oculta um token
-- (`visivel: true → false`), a linha nova pra `vtt_tokens` deixa de
-- satisfazer a policy de select do jogador (`vtt_tokens_select`,
-- migration 0065: `visivel or is_campaign_owner`). Realtime avalia RLS
-- contra a linha NOVA na hora de decidir se entrega o evento — uma
-- linha que passa a falhar essa checagem simplesmente NUNCA chega ao
-- assinante, sem substituto (não vira um DELETE sintético). Na
-- prática, o jogador nunca soube que o token sumiu; ficava preso no
-- estado local até um reload manual.
--
-- Correção: cada operação de CRUD/flags publica um evento SEM DADO
-- NENHUM do token — só "a lista autorizada de tokens desta cena
-- mudou". Quem recebe relê a cena pela MESMA leitura sujeita à RLS
-- (`lerCenaAtiva`, client-side) e reconcilia. Isso funciona nos dois
-- sentidos (ocultar E revelar) e cobre criar/editar/redimensionar/
-- duplicar/remover igual, sem inventar um mecanismo por operação.
--
-- Canal isolado por CENA, mesmo padrão de segurança da 0074: só SELECT
-- pra membro (nunca INSERT — só a RPC publica, via `realtime.send()`
-- dentro de função `security definer`).
-- =====================================================================

begin;

create or replace function vtt_tokens_changed_channel_autorizado(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from vtt_scenes s
    where s.id = (regexp_match(p_topic, '^campaign:([0-9a-fA-F-]{36}):scene:([0-9a-fA-F-]{36}):vtt:tokens-changed$'))[2]::uuid
      and s.campaign_id = (regexp_match(p_topic, '^campaign:([0-9a-fA-F-]{36}):scene:([0-9a-fA-F-]{36}):vtt:tokens-changed$'))[1]::uuid
      and is_campaign_member(s.campaign_id)
  );
$$;

revoke all on function vtt_tokens_changed_channel_autorizado(text) from public;
grant execute on function vtt_tokens_changed_channel_autorizado(text) to authenticated;

create policy "campaign_members_receive_tokens_changed_channel"
on "realtime"."messages"
for select
to authenticated
using (
  vtt_tokens_changed_channel_autorizado(realtime.topic())
);

-- ---------------------------------------------------------------------
-- As 6 RPCs abaixo são IDÊNTICAS às da migration 0073 — nenhuma
-- validação/regra de negócio muda. O único acréscimo, em cada uma, é
-- a publicação da invalidação logo antes do `return`.
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
begin
  if not is_campaign_owner(p_campaign_id) then
    raise exception 'Só o narrador cria tokens.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from vtt_scenes where id = p_scene_id and campaign_id = p_campaign_id) then
    raise exception 'Cena não encontrada para esta campanha.' using errcode = 'no_data_found';
  end if;

  perform vtt_validar_pegada_em(p_scene_id, p_tamanho, p_orientacao, p_pegada_personalizada, p_q, p_r, null);

  insert into vtt_tokens (
    scene_id, campaign_id, character_id, nome, sigla, lado, vertente,
    q, r, tamanho, orientacao, pegada_personalizada,
    visivel, bloqueado, retrato_url, pv_atual, pv_max, condicoes
  ) values (
    p_scene_id, p_campaign_id, p_character_id, p_nome, coalesce(nullif(p_sigla, ''), '??'), p_lado, coalesce(p_vertente, 'nenhuma'),
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

create or replace function update_vtt_token(
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

  update vtt_tokens
  set nome = p_nome, sigla = coalesce(nullif(p_sigla, ''), '??'), lado = p_lado, vertente = coalesce(p_vertente, 'nenhuma'),
      character_id = p_character_id, retrato_url = p_retrato_url,
      pv_atual = p_pv_atual, pv_max = p_pv_max, condicoes = coalesce(p_condicoes, '{}'),
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

create or replace function resize_vtt_token(
  p_token_id uuid,
  p_tamanho text,
  p_orientacao integer,
  p_pegada_personalizada jsonb,
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
    raise exception 'Só o narrador altera tamanho/pegada de token.' using errcode = 'insufficient_privilege';
  end if;
  if v_token.revision <> p_expected_revision then
    raise exception 'Revisão desatualizada — outra pessoa já alterou este token.' using errcode = 'check_violation';
  end if;

  perform vtt_validar_pegada_em(v_token.scene_id, p_tamanho, p_orientacao, p_pegada_personalizada, v_token.q, v_token.r, v_token.id);

  update vtt_tokens
  set tamanho = p_tamanho, orientacao = p_orientacao, pegada_personalizada = p_pegada_personalizada,
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

create or replace function duplicate_vtt_token(
  p_token_id uuid,
  p_q integer,
  p_r integer
) returns vtt_tokens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_origem vtt_tokens;
  v_novo vtt_tokens;
begin
  select * into v_origem from vtt_tokens where id = p_token_id;
  if v_origem is null then
    raise exception 'Token não encontrado.' using errcode = 'no_data_found';
  end if;
  if not is_campaign_owner(v_origem.campaign_id) then
    raise exception 'Só o narrador duplica tokens.' using errcode = 'insufficient_privilege';
  end if;

  perform vtt_validar_pegada_em(v_origem.scene_id, v_origem.tamanho, v_origem.orientacao, v_origem.pegada_personalizada, p_q, p_r, null);

  insert into vtt_tokens (
    scene_id, campaign_id, character_id, nome, sigla, lado, vertente,
    q, r, tamanho, orientacao, pegada_personalizada,
    visivel, bloqueado, retrato_url, pv_atual, pv_max, condicoes
  ) values (
    v_origem.scene_id, v_origem.campaign_id, null, v_origem.nome, v_origem.sigla, v_origem.lado, v_origem.vertente,
    p_q, p_r, v_origem.tamanho, v_origem.orientacao, v_origem.pegada_personalizada,
    v_origem.visivel, false, v_origem.retrato_url, v_origem.pv_atual, v_origem.pv_max, v_origem.condicoes
  )
  returning * into v_novo;

  perform realtime.send(
    jsonb_build_object('v', 1, 'campaignId', v_novo.campaign_id::text, 'sceneId', v_novo.scene_id::text, 'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint),
    'tokens_changed', 'campaign:' || v_novo.campaign_id::text || ':scene:' || v_novo.scene_id::text || ':vtt:tokens-changed', true
  );

  return v_novo;
end;
$$;

create or replace function delete_vtt_token(p_token_id uuid) returns void
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
    raise exception 'Só o narrador remove tokens.' using errcode = 'insufficient_privilege';
  end if;

  delete from vtt_tokens where id = p_token_id;

  perform realtime.send(
    jsonb_build_object('v', 1, 'campaignId', v_token.campaign_id::text, 'sceneId', v_token.scene_id::text, 'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint),
    'tokens_changed', 'campaign:' || v_token.campaign_id::text || ':scene:' || v_token.scene_id::text || ':vtt:tokens-changed', true
  );
end;
$$;

create or replace function set_vtt_token_flags(
  p_token_id uuid,
  p_bloqueado boolean,
  p_visivel boolean
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
    raise exception 'Só o narrador altera trava/visibilidade de token.' using errcode = 'insufficient_privilege';
  end if;

  update vtt_tokens
  set bloqueado = p_bloqueado, visivel = p_visivel, revision = v_token.revision + 1, updated_at = now()
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
