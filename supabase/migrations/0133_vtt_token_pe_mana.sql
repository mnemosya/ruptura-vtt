-- =====================================================================
-- 0133 — PE e MANA no token solto
--
-- Até aqui, um token SEM ficha vinculada só tinha PV próprio: as
-- colunas `pv_atual`/`pv_max` (0073) e, no HUD, o ramo que projeta
-- esses dois quando não há personagem (0084). PE e Mana existiam
-- apenas como FLAGS de visibilidade (`pe_publico`, `mana_publica`) —
-- que governam o que a ficha vinculada expõe, e portanto nunca valiam
-- para um monstro criado à mão.
--
-- O resultado prático: o narrador desenhava um inimigo com PV no mapa e
-- não tinha onde guardar a energia nem a mana dele, apesar de os três
-- recursos aparecerem lado a lado no cartão do token. Esta migration
-- fecha esse buraco — as mesmas três barras, para os dois tipos de
-- token.
--
-- O QUE MUDA
--   1. quatro colunas novas em `vtt_tokens`;
--   2. `create_vtt_token` e `edit_vtt_token` passam a receber os quatro
--      valores — e por isso mudam de ASSINATURA;
--   3. `read_vtt_token_hud` projeta PE e Mana do token solto, com as
--      mesmas regras de visibilidade que o PV já seguia;
--   4. `mutate_unlinked_vtt_token_hud` aceita `pe` e `mana` nos ±1 e na
--      edição direta do número.
--
-- DROP ANTES DE CREATE nas duas RPCs de token: acrescentar parâmetro a
-- uma função existente cria uma SOBRECARGA, e o PostgREST recusa a
-- chamada por ambiguidade ("Could not choose the best candidate
-- function"). Lição 0094/0096, que este projeto já pagou duas vezes.
-- =====================================================================

begin;

-- ── 1. As colunas ────────────────────────────────────────────────────
alter table public.vtt_tokens
  add column if not exists pe_atual    integer,
  add column if not exists pe_max      integer,
  add column if not exists mana_atual  integer,
  add column if not exists mana_max    integer;

comment on column public.vtt_tokens.pe_atual is 'PE atual do token SEM ficha vinculada. Com ficha, o recurso é o da ficha e estas colunas ficam nulas.';
comment on column public.vtt_tokens.pe_max is 'PE máximo do token sem ficha. Nulo = o token não tem PE, e a barra não aparece.';
comment on column public.vtt_tokens.mana_atual is 'Mana atual do token SEM ficha vinculada.';
comment on column public.vtt_tokens.mana_max is 'Mana máxima do token sem ficha. Nula = o token não tem Mana.';

-- ── 2. create_vtt_token ──────────────────────────────────────────────
drop function if exists public.create_vtt_token(
  uuid, uuid, text, text, text, text, text, integer, jsonb, integer, integer,
  uuid, boolean, boolean, text, integer, integer, text[]
);

create function public.create_vtt_token(
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
  p_pe_atual integer,
  p_pe_max integer,
  p_mana_atual integer,
  p_mana_max integer,
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
    visivel, bloqueado, retrato_url,
    pv_atual, pv_max, pe_atual, pe_max, mana_atual, mana_max, condicoes
  ) values (
    p_scene_id, p_campaign_id, p_character_id, v_nome, coalesce(nullif(v_sigla, ''), '??'), p_lado, coalesce(p_vertente, 'nenhuma'),
    p_q, p_r, p_tamanho, coalesce(p_orientacao, 0), p_pegada_personalizada,
    coalesce(p_visivel, true), coalesce(p_bloqueado, false), p_retrato_url,
    p_pv_atual, p_pv_max, p_pe_atual, p_pe_max, p_mana_atual, p_mana_max, coalesce(p_condicoes, '{}')
  )
  returning * into v_token;

  perform realtime.send(
    jsonb_build_object('v', 1, 'campaignId', p_campaign_id::text, 'sceneId', p_scene_id::text, 'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint),
    'tokens_changed', 'campaign:' || p_campaign_id::text || ':scene:' || p_scene_id::text || ':vtt:tokens-changed', true
  );

  return v_token;
end;
$$;

revoke all on function public.create_vtt_token(
  uuid, uuid, text, text, text, text, text, integer, jsonb, integer, integer,
  uuid, boolean, boolean, text, integer, integer, integer, integer, integer, integer, text[]
) from public, anon;
grant execute on function public.create_vtt_token(
  uuid, uuid, text, text, text, text, text, integer, jsonb, integer, integer,
  uuid, boolean, boolean, text, integer, integer, integer, integer, integer, integer, text[]
) to authenticated;

-- ── 3. edit_vtt_token ────────────────────────────────────────────────
drop function if exists public.edit_vtt_token(
  uuid, text, text, text, text, uuid, text, integer, integer, text[], text, integer
);

create function public.edit_vtt_token(
  p_token_id uuid,
  p_nome text,
  p_sigla text,
  p_lado text,
  p_vertente text,
  p_character_id uuid,
  p_retrato_url text,
  p_pv_atual integer,
  p_pv_max integer,
  p_pe_atual integer,
  p_pe_max integer,
  p_mana_atual integer,
  p_mana_max integer,
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
      pv_atual = p_pv_atual, pv_max = p_pv_max,
      pe_atual = p_pe_atual, pe_max = p_pe_max,
      mana_atual = p_mana_atual, mana_max = p_mana_max,
      condicoes = coalesce(p_condicoes, '{}'),
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

revoke all on function public.edit_vtt_token(
  uuid, text, text, text, text, uuid, text, integer, integer, integer, integer, integer, integer, text[], text, integer
) from public, anon;
grant execute on function public.edit_vtt_token(
  uuid, text, text, text, text, uuid, text, integer, integer, integer, integer, integer, integer, text[], text, integer
) to authenticated;

-- ── 4. A projeção do HUD ─────────────────────────────────────────────
-- Só o ramo do token SEM ficha muda. Com ficha, os três recursos
-- continuam vindo da ficha canônica — as colunas novas ficam nulas e
-- não têm voto: um token vinculado não pode ter dois PVs.
--
-- A regra de visibilidade é a MESMA do PV: quem controla vê sempre;
-- quem só assiste vê se a flag daquele recurso estiver ligada.
create or replace function public.read_vtt_token_hud(p_token_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_token public.vtt_tokens;
  v_character public.characters;
  v_rules jsonb;
  v_control boolean;
  v_resources jsonb := '{}'::jsonb;
  v_max integer;
  v_current integer;
begin
  select * into v_token from public.vtt_tokens where id = p_token_id;
  if v_token is null
     or not public.is_campaign_member(v_token.campaign_id)
     or (not v_token.visivel and not public.is_campaign_owner(v_token.campaign_id)) then
    return null;
  end if;
  if not exists (select 1 from public.vtt_scenes s where s.id = v_token.scene_id and s.campaign_id = v_token.campaign_id and s.ativa) then
    return null;
  end if;

  v_control := public.can_move_vtt_token(v_token.id);
  select payload into v_rules from public.content_documents
  where content_type = 'character_rule' and slug = 'regras_personagem' and status = 'published'
  limit 1;
  if v_token.character_id is not null then
    select * into v_character from public.characters
    where id = v_token.character_id and campaign_id = v_token.campaign_id and archived_at is null;
  end if;

  if v_character.id is not null then
    if v_control or v_token.pv_publico then
      v_max := public.vtt_hud_derived(v_character.payload, coalesce(v_rules, '{}'::jsonb), 'pv_max');
      v_current := coalesce((v_character.payload -> 'recursos_atuais' ->> 'pv')::integer, v_max);
      v_resources := v_resources || jsonb_build_object('pv', jsonb_build_object('atual', v_current, 'max', v_max));
    end if;
    if v_control or v_token.pe_publico then
      v_max := public.vtt_hud_derived(v_character.payload, coalesce(v_rules, '{}'::jsonb), 'pe_max');
      v_current := coalesce((v_character.payload -> 'recursos_atuais' ->> 'pe')::integer, v_max);
      v_resources := v_resources || jsonb_build_object('pe', jsonb_build_object('atual', v_current, 'max', v_max));
    end if;
    if v_control or v_token.mana_publica then
      v_max := public.vtt_hud_derived(v_character.payload, coalesce(v_rules, '{}'::jsonb), 'mana_max');
      v_current := coalesce((v_character.payload -> 'recursos_atuais' ->> 'mana')::integer, v_max);
      v_resources := v_resources || jsonb_build_object('mana', jsonb_build_object('atual', v_current, 'max', v_max));
    end if;
  elsif v_token.character_id is null then
    if (v_control or v_token.pv_publico) and v_token.pv_atual is not null and v_token.pv_max is not null then
      v_resources := v_resources || jsonb_build_object('pv', jsonb_build_object('atual', v_token.pv_atual, 'max', v_token.pv_max));
    end if;
    if (v_control or v_token.pe_publico) and v_token.pe_atual is not null and v_token.pe_max is not null then
      v_resources := v_resources || jsonb_build_object('pe', jsonb_build_object('atual', v_token.pe_atual, 'max', v_token.pe_max));
    end if;
    if (v_control or v_token.mana_publica) and v_token.mana_atual is not null and v_token.mana_max is not null then
      v_resources := v_resources || jsonb_build_object('mana', jsonb_build_object('atual', v_token.mana_atual, 'max', v_token.mana_max));
    end if;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'tokenId', v_token.id,
    'sceneId', v_token.scene_id,
    'campaignId', v_token.campaign_id,
    'name', v_token.nome,
    'initials', v_token.sigla,
    'imageUrl', v_token.retrato_url,
    'canControl', v_control,
    'characterId', case when v_control then v_token.character_id else null end,
    'character', case when v_control and v_character.id is not null then v_character.payload else null end,
    'characterUpdatedAt', case when v_control and v_character.id is not null then v_character.updated_at else null end,
    'resources', v_resources,
    'visibility', case when v_control then jsonb_build_object(
      'pv', v_token.pv_publico,
      'pe', v_token.pe_publico,
      'mana', v_token.mana_publica
    ) else null end,
    'tokenConditions', case when v_control and v_token.character_id is null then to_jsonb(v_token.condicoes) else null end,
    'tokenRevision', v_token.revision
  ));
end;
$$;

-- ── 5. A escrita do ±1 e do número digitado ──────────────────────────
-- Mesma função, mesma assinatura: o que muda é que `p_kind` passa a
-- aceitar 'pe' e 'mana'. Cada um só é aceito se o token TIVER aquele
-- recurso — um máximo nulo continua significando "este token não tem
-- isso", e inventar o recurso pela porta da edição seria criar dado
-- que a criação não criou.
create or replace function public.mutate_unlinked_vtt_token_hud(
  p_token_id uuid,
  p_kind text,
  p_value jsonb,
  p_expected_revision integer
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token public.vtt_tokens;
  v_number integer;
  v_condition text;
begin
  select * into v_token from public.vtt_tokens where id = p_token_id for update;
  if v_token is null then raise exception 'Token não encontrado.' using errcode = 'no_data_found'; end if;
  if not exists (select 1 from public.vtt_scenes s where s.id = v_token.scene_id and s.campaign_id = v_token.campaign_id and s.ativa) then
    raise exception 'Token fora da cena ativa.' using errcode = 'insufficient_privilege';
  end if;
  if v_token.character_id is not null then raise exception 'Token vinculado usa a ficha canônica.' using errcode = 'check_violation'; end if;
  if not public.can_move_vtt_token(p_token_id) then raise exception 'Sem permissão para alterar este token.' using errcode = 'insufficient_privilege'; end if;
  if v_token.revision <> p_expected_revision then raise exception 'Revisão desatualizada.' using errcode = 'serialization_failure'; end if;

  if p_kind = 'pv' then
    if v_token.pv_max is null then raise exception 'Este token não possui PV.' using errcode = 'check_violation'; end if;
    v_number := greatest(0, least(v_token.pv_max, (p_value #>> '{}')::integer));
    update public.vtt_tokens set pv_atual = v_number, revision = revision + 1, updated_at = now() where id = p_token_id;
  elsif p_kind = 'pe' then
    if v_token.pe_max is null then raise exception 'Este token não possui PE.' using errcode = 'check_violation'; end if;
    v_number := greatest(0, least(v_token.pe_max, (p_value #>> '{}')::integer));
    update public.vtt_tokens set pe_atual = v_number, revision = revision + 1, updated_at = now() where id = p_token_id;
  elsif p_kind = 'mana' then
    if v_token.mana_max is null then raise exception 'Este token não possui Mana.' using errcode = 'check_violation'; end if;
    v_number := greatest(0, least(v_token.mana_max, (p_value #>> '{}')::integer));
    update public.vtt_tokens set mana_atual = v_number, revision = revision + 1, updated_at = now() where id = p_token_id;
  elsif p_kind = 'condition_add' then
    v_condition := p_value #>> '{}';
    if not (v_condition = any(array[
      'atordoado','caido','cego','surdo','lento','sangrando','queimando','envenenado',
      'saturado','insaturado','imobilizado','agarrado','ofuscado','contundido','sufocando','inconsciente'
    ]::text[])) then raise exception 'Condição inválida.' using errcode = 'invalid_parameter_value'; end if;
    update public.vtt_tokens set condicoes = case when v_condition = any(condicoes) then condicoes else array_append(condicoes, v_condition) end,
      revision = revision + 1, updated_at = now() where id = p_token_id;
  elsif p_kind = 'condition_remove' then
    v_condition := p_value #>> '{}';
    update public.vtt_tokens set condicoes = array_remove(condicoes, v_condition),
      revision = revision + 1, updated_at = now() where id = p_token_id;
  else
    raise exception 'Operação não suportada para token sem ficha.' using errcode = 'invalid_parameter_value';
  end if;

  select revision into v_number from public.vtt_tokens where id = p_token_id;
  return v_number;
end;
$$;

commit;
