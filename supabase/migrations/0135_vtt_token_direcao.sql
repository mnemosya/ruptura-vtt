-- =====================================================================
-- 0135 — a DIREÇÃO do token, separada da forma que ele ocupa
--
-- Até aqui `orientacao` fazia dois trabalhos numa coluna só:
--
--   1. girar a PEGADA — quais células o token ocupa. É evento de
--      REGRA: muda o que ele bloqueia, pode colidir com outro token ou
--      com terreno, e por isso pode (e deve) ser RECUSADO;
--   2. dizer PARA ONDE ELE OLHA. É ficção: nunca move ninguém, nunca
--      deveria ser recusado.
--
-- Com uma alavanca só, a ficção herdava o preço da regra: virar a
-- criatura pro barulho respondia "posição indisponível". E o inverso
-- também doía — quem só queria olhar pro outro lado arriscava empurrar
-- um bicho de 3 células pra fora do corredor.
--
-- Agora são duas. `orientacao` continua sendo a PEGADA, com a mesma
-- validação de sempre (`rotacionar_vtt_token`, hoje acessível pela ação
-- "Girar a forma"). `direcao` é o olhar: 0–5, livre, sem colisão —
-- `apontar_vtt_token`.
--
-- E o COLOSSAL vira simétrico. Ele era o "enorme" mais as 5 primeiras
-- células do anel 2, um caroço torto que mudava de forma a cada giro.
-- Anéis de hexágono têm 1, 7 e 19 células — não existe arranjo de 12
-- com simetria de 6 lados —, então a forma passa a ser a ESTRELA de 13:
-- o enorme mais as 6 PONTAS do anel 2. Uma célula a mais, simetria
-- perfeita, e nenhum tamanho além do Grande continua tendo pegada que
-- muda ao girar.
--
--        ()  ()
--         ()()
--      ()()[]()()
--         ()()
--        ()  ()
-- =====================================================================

begin;

-- ── 1. A coluna ──────────────────────────────────────────────────────
alter table public.vtt_tokens
  add column if not exists direcao smallint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vtt_tokens_direcao_valida'
  ) then
    alter table public.vtt_tokens
      add constraint vtt_tokens_direcao_valida check (direcao between 0 and 5);
  end if;
end $$;

comment on column public.vtt_tokens.direcao is
  'Para onde o token OLHA: 0–5 (0 = leste, sentido horário). Não afeta as células ocupadas — quem manda nisso é `orientacao`.';

-- Herança: quem já existe passa a olhar para onde a pegada apontava.
update public.vtt_tokens set direcao = orientacao where direcao = 0 and orientacao <> 0;

-- ── 2. O COLOSSAL simétrico ──────────────────────────────────────────
-- Espelha EXATAMENTE `_dominio/pegada.ts` — o servidor nunca confia na
-- lista que o cliente manda, recalcula aqui.
create or replace function public.vtt_pegada_offsets_base(p_tamanho text, p_pegada_personalizada jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when p_pegada_personalizada is not null then p_pegada_personalizada
    when p_tamanho = 'grande' then '[{"q":0,"r":0},{"q":1,"r":0},{"q":0,"r":1}]'::jsonb
    when p_tamanho = 'enorme' then '[{"q":0,"r":0},{"q":1,"r":0},{"q":1,"r":-1},{"q":0,"r":-1},{"q":-1,"r":0},{"q":-1,"r":1},{"q":0,"r":1}]'::jsonb
    -- ESTRELA de 13: âncora + anel 1 + as 6 pontas do anel 2.
    when p_tamanho = 'colossal' then '[{"q":0,"r":0},{"q":-1,"r":1},{"q":0,"r":1},{"q":1,"r":0},{"q":1,"r":-1},{"q":0,"r":-1},{"q":-1,"r":0},{"q":-2,"r":2},{"q":0,"r":2},{"q":2,"r":0},{"q":2,"r":-2},{"q":0,"r":-2},{"q":-2,"r":0}]'::jsonb
    else '[{"q":0,"r":0}]'::jsonb
  end;
$$;

-- ── 3. apontar_vtt_token — o olhar ───────────────────────────────────
-- SEM checagem de colisão, de propósito: mudar de direção não move
-- célula nenhuma. A autorização é a mesma de mover (quem controla o
-- token, e travado só o narrador) — olhar é gesto do dono da peça.
create or replace function public.apontar_vtt_token(
  p_token_id uuid,
  p_direcao integer,
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
  if not can_move_vtt_token(p_token_id) then
    raise exception 'Sem permissão para virar este token.' using errcode = 'insufficient_privilege';
  end if;
  if v_token.bloqueado and not is_campaign_owner(v_token.campaign_id) then
    raise exception 'Token travado.' using errcode = 'insufficient_privilege';
  end if;
  if v_token.revision <> p_expected_revision then
    raise exception 'Revisão desatualizada — outra pessoa já alterou este token.' using errcode = 'check_violation';
  end if;
  if p_direcao < 0 or p_direcao > 5 then
    raise exception 'Direção inválida.' using errcode = 'invalid_parameter_value';
  end if;

  update vtt_tokens
     set direcao = p_direcao, revision = revision + 1, updated_at = now()
   where id = p_token_id
  returning * into v_token;

  perform realtime.send(
    jsonb_build_object('v', 1, 'campaignId', v_token.campaign_id::text, 'sceneId', v_token.scene_id::text, 'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint),
    'tokens_changed', 'campaign:' || v_token.campaign_id::text || ':scene:' || v_token.scene_id::text || ':vtt:tokens-changed', true
  );

  return v_token;
end;
$$;

revoke all on function public.apontar_vtt_token(uuid, integer, integer) from public, anon;
grant execute on function public.apontar_vtt_token(uuid, integer, integer) to authenticated;

-- ── 4. create_vtt_token recebe a direção ─────────────────────────────
-- DROP ANTES DE CREATE: parâmetro novo cria SOBRECARGA, e o PostgREST
-- recusa por ambiguidade. Lição 0094/0096.
drop function if exists public.create_vtt_token(
  uuid, uuid, text, text, text, text, text, integer, jsonb, integer, integer,
  uuid, boolean, boolean, text, integer, integer, integer, integer, integer, integer, text[]
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
  p_direcao integer,
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
  if coalesce(p_direcao, 0) < 0 or coalesce(p_direcao, 0) > 5 then
    raise exception 'Direção inválida.' using errcode = 'invalid_parameter_value';
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
    q, r, tamanho, orientacao, direcao, pegada_personalizada,
    visivel, bloqueado, retrato_url,
    pv_atual, pv_max, pe_atual, pe_max, mana_atual, mana_max, condicoes
  ) values (
    p_scene_id, p_campaign_id, p_character_id, v_nome, coalesce(nullif(v_sigla, ''), '??'), p_lado, coalesce(p_vertente, 'nenhuma'),
    p_q, p_r, p_tamanho, coalesce(p_orientacao, 0), coalesce(p_direcao, 0), p_pegada_personalizada,
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
  uuid, uuid, text, text, text, text, text, integer, integer, jsonb, integer, integer,
  uuid, boolean, boolean, text, integer, integer, integer, integer, integer, integer, text[]
) from public, anon;
grant execute on function public.create_vtt_token(
  uuid, uuid, text, text, text, text, text, integer, integer, jsonb, integer, integer,
  uuid, boolean, boolean, text, integer, integer, integer, integer, integer, integer, text[]
) to authenticated;

commit;
