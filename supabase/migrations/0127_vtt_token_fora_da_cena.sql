-- =====================================================================
-- 0127 — A borda da cena deixa de limitar ONDE um token pode estar
--
-- Decisão de produto, não conserto de bug: o vazio em volta da grade
-- vira área de trabalho. Fila de reforços, inimigos que ainda não
-- entraram em cena, o grupo esperando a próxima sala, tokens que uma
-- grade encolhida deixou pra trás — tudo isso quer viver FORA do mapa,
-- e movê-los pra lá e de lá precisa ser um gesto comum.
--
-- A 0125 tinha aberto só metade disso (uma exceção de mão única, pra
-- quem já estava fora conseguir voltar). Metade não serve: o token que
-- voltou não podia sair de novo, e não havia como pôr um token na
-- espera de propósito. Aqui a regra some inteira das três funções que
-- a aplicavam — `move_vtt_token`, `move_vtt_tokens` e
-- `rotacionar_vtt_token`.
--
-- O que NÃO muda, e é o que mantém isto seguro:
--
--   • permissão, trava e revisão, token a token;
--   • adjacência hexagonal da rota, e a rota começando na posição
--     atual do token — nada de teletransporte;
--   • colisão com outro token, dentro ou fora da grade;
--   • bloqueio de terreno segue consultivo pra mover (0080) e
--     impeditivo pra girar (0085), exatamente como estavam.
--
-- Fora daqui de propósito: CRIAR token continua exigindo posição
-- dentro da cena (`create_vtt_token`). Nascer fora do mapa é outra
-- decisão, com outra UI (não há onde clicar pra isso hoje), e
-- reservá-la agora seria vocabulário sem regra que o consuma.
--
-- Objetos táticos também continuam confinados à grade: um objeto
-- bloqueia célula, e célula fora do mapa não é atravessada por
-- ninguém — deixá-lo sair seria criar bloqueio que nada consulta.
-- =====================================================================

begin;

-- ── Mover UM token ──────────────────────────────────────────────────
create or replace function public.move_vtt_token(
  p_token_id uuid,
  p_rota jsonb,
  p_expected_revision integer,
  p_offset_q numeric default 0,
  p_offset_r numeric default 0
)
 RETURNS vtt_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_token vtt_tokens;
  v_scene vtt_scenes;
  v_step jsonb;
  v_q integer;
  v_r integer;
  v_dest_q integer;
  v_dest_r integer;
  v_n integer;
  v_prev_q integer;
  v_prev_r integer;
  v_dq integer;
  v_dr integer;
  v_cell record;
begin
  select * into v_token from vtt_tokens where id = p_token_id for update;
  if v_token is null then
    raise exception 'Token não encontrado.' using errcode = 'no_data_found';
  end if;

  if not can_move_vtt_token(p_token_id) then
    raise exception 'Sem permissão para mover este token.' using errcode = 'insufficient_privilege';
  end if;

  if v_token.bloqueado and not is_campaign_owner(v_token.campaign_id) then
    raise exception 'Token travado.' using errcode = 'insufficient_privilege';
  end if;

  if v_token.revision <> p_expected_revision then
    raise exception 'Revisão desatualizada — outra pessoa já moveu este token.' using errcode = 'check_violation';
  end if;

  if not vtt_pegada_personalizada_valida(v_token.pegada_personalizada) then
    raise exception 'Pegada personalizada do token está corrompida.' using errcode = 'data_exception';
  end if;

  select * into v_scene from vtt_scenes where id = v_token.scene_id;
  if v_scene is null then
    raise exception 'Cena do token não existe mais.' using errcode = 'no_data_found';
  end if;

  v_n := jsonb_array_length(p_rota);
  if v_n < 2 then
    raise exception 'Rota precisa de origem e destino.' using errcode = 'invalid_parameter_value';
  end if;

  for i in 0 .. v_n - 1 loop
    v_step := p_rota -> i;
    v_q := (v_step ->> 'q')::integer;
    v_r := (v_step ->> 'r')::integer;

    if i = 0 then
      if v_q <> v_token.q or v_r <> v_token.r then
        raise exception 'A rota precisa começar na posição atual do token (%, %), não em (%, %).',
          v_token.q, v_token.r, v_q, v_r using errcode = 'invalid_parameter_value';
      end if;
    else
      v_dq := v_q - v_prev_q;
      v_dr := v_r - v_prev_r;
      if ((abs(v_dq) + abs(v_dr) + abs(v_dq + v_dr)) / 2) <> 1 then
        raise exception 'Rota não é contínua: (%, %) não é vizinha de (%, %).', v_q, v_r, v_prev_q, v_prev_r
          using errcode = 'invalid_parameter_value';
      end if;
    end if;
    v_prev_q := v_q;
    v_prev_r := v_r;

    -- Sem checagem de borda (0127): a grade não limita onde o token
    -- pode estar. Colisão continua valendo em cada passo, fora dela
    -- inclusive — dois tokens não ocupam a mesma célula em lugar nenhum.
    if i > 0 then
      for v_cell in select * from vtt_pegada_celulas(v_token.tamanho, v_token.orientacao, v_token.pegada_personalizada, v_q, v_r) loop
        if exists (
          select 1 from vtt_tokens ot
          cross join lateral vtt_pegada_celulas(ot.tamanho, ot.orientacao, ot.pegada_personalizada, ot.q, ot.r) oc
          where ot.scene_id = v_token.scene_id and ot.id <> v_token.id
            and oc.q = v_cell.q and oc.r = v_cell.r
        ) then
          raise exception 'Posição indisponível.' using errcode = 'invalid_parameter_value';
        end if;
      end loop;
    end if;

    if i = v_n - 1 then
      v_dest_q := v_q;
      v_dest_r := v_r;
    end if;
  end loop;

  update vtt_tokens
  set q = v_dest_q, r = v_dest_r,
      offset_q = greatest(-1, least(1, coalesce(p_offset_q, 0))),
      offset_r = greatest(-1, least(1, coalesce(p_offset_r, 0))),
      revision = v_token.revision + 1, updated_at = now()
  where id = p_token_id
  returning * into v_token;

  return v_token;
end;
$function$;

-- ── Mover um GRUPO (0126) ───────────────────────────────────────────
create or replace function public.move_vtt_tokens(p_movimentos jsonb)
 returns setof vtt_tokens
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_n            integer;
  v_item         jsonb;
  v_token        vtt_tokens;
  v_scene        vtt_scenes;
  v_scene_id     uuid;
  v_ids          uuid[] := '{}';
  v_rota         jsonb;
  v_passos       integer;
  v_q            integer;
  v_r            integer;
  v_prev_q       integer;
  v_prev_r       integer;
  v_dq           integer;
  v_dr           integer;
  v_cell         record;
  v_celulas_fim  text[] := '{}';
  v_chave        text;
begin
  if p_movimentos is null or jsonb_typeof(p_movimentos) <> 'array' then
    raise exception 'Movimento em grupo precisa de uma lista.' using errcode = 'invalid_parameter_value';
  end if;
  v_n := jsonb_array_length(p_movimentos);
  if v_n = 0 then
    raise exception 'Movimento em grupo sem nenhum token.' using errcode = 'invalid_parameter_value';
  end if;
  if v_n > 50 then
    raise exception 'Movimento em grupo limitado a 50 tokens (recebeu %).', v_n using errcode = 'invalid_parameter_value';
  end if;

  for i in 0 .. v_n - 1 loop
    v_item := p_movimentos -> i;
    if jsonb_typeof(v_item) <> 'object' or not (v_item ? 'token_id') or not (v_item ? 'rota') or not (v_item ? 'expected_revision') then
      raise exception 'Item de movimento malformado.' using errcode = 'invalid_parameter_value';
    end if;

    select * into v_token from vtt_tokens where id = (v_item ->> 'token_id')::uuid for update;
    if v_token is null then
      raise exception 'Token não encontrado.' using errcode = 'no_data_found';
    end if;

    if v_token.id = any(v_ids) then
      raise exception 'O mesmo token aparece duas vezes no movimento em grupo.' using errcode = 'invalid_parameter_value';
    end if;

    if not can_move_vtt_token(v_token.id) then
      raise exception 'Sem permissão para mover este token.' using errcode = 'insufficient_privilege';
    end if;

    if v_token.bloqueado and not is_campaign_owner(v_token.campaign_id) then
      raise exception 'Token travado.' using errcode = 'insufficient_privilege';
    end if;

    if v_token.revision <> (v_item ->> 'expected_revision')::integer then
      raise exception 'Revisão desatualizada — outra pessoa já moveu este token.' using errcode = 'check_violation';
    end if;

    if not vtt_pegada_personalizada_valida(v_token.pegada_personalizada) then
      raise exception 'Pegada personalizada do token está corrompida.' using errcode = 'data_exception';
    end if;

    if v_scene_id is null then
      v_scene_id := v_token.scene_id;
    elsif v_scene_id <> v_token.scene_id then
      raise exception 'Movimento em grupo com tokens de cenas diferentes.' using errcode = 'invalid_parameter_value';
    end if;

    v_ids := v_ids || v_token.id;
  end loop;

  select * into v_scene from vtt_scenes where id = v_scene_id;
  if v_scene is null then
    raise exception 'Cena do token não existe mais.' using errcode = 'no_data_found';
  end if;

  for i in 0 .. v_n - 1 loop
    v_item := p_movimentos -> i;
    select * into v_token from vtt_tokens where id = (v_item ->> 'token_id')::uuid;
    v_rota := v_item -> 'rota';
    if jsonb_typeof(v_rota) <> 'array' then
      raise exception 'Rota malformada.' using errcode = 'invalid_parameter_value';
    end if;
    v_passos := jsonb_array_length(v_rota);
    if v_passos < 2 then
      raise exception 'Rota precisa de origem e destino.' using errcode = 'invalid_parameter_value';
    end if;

    for j in 0 .. v_passos - 1 loop
      v_q := ((v_rota -> j) ->> 'q')::integer;
      v_r := ((v_rota -> j) ->> 'r')::integer;

      if j = 0 then
        if v_q <> v_token.q or v_r <> v_token.r then
          raise exception 'A rota precisa começar na posição atual do token (%, %), não em (%, %).',
            v_token.q, v_token.r, v_q, v_r using errcode = 'invalid_parameter_value';
        end if;
      else
        v_dq := v_q - v_prev_q;
        v_dr := v_r - v_prev_r;
        if ((abs(v_dq) + abs(v_dr) + abs(v_dq + v_dr)) / 2) <> 1 then
          raise exception 'Rota não é contínua: (%, %) não é vizinha de (%, %).', v_q, v_r, v_prev_q, v_prev_r
            using errcode = 'invalid_parameter_value';
        end if;
      end if;
      v_prev_q := v_q;
      v_prev_r := v_r;

      for v_cell in select * from vtt_pegada_celulas(v_token.tamanho, v_token.orientacao, v_token.pegada_personalizada, v_q, v_r) loop
        -- Colisão só contra quem está FORA do lote: os colegas de grupo
        -- saem das próprias células no mesmo instante. Borda não entra
        -- (0127).
        if j > 0 then
          if exists (
            select 1 from vtt_tokens ot
            cross join lateral vtt_pegada_celulas(ot.tamanho, ot.orientacao, ot.pegada_personalizada, ot.q, ot.r) oc
            where ot.scene_id = v_scene_id and not (ot.id = any(v_ids))
              and oc.q = v_cell.q and oc.r = v_cell.r
          ) then
            raise exception 'Posição indisponível.' using errcode = 'invalid_parameter_value';
          end if;
        end if;

        if j = v_passos - 1 then
          v_chave := v_cell.q || ',' || v_cell.r;
          if v_chave = any(v_celulas_fim) then
            raise exception 'Dois tokens do grupo terminariam na mesma célula.' using errcode = 'invalid_parameter_value';
          end if;
          v_celulas_fim := v_celulas_fim || v_chave;
        end if;
      end loop;
    end loop;
  end loop;

  for i in 0 .. v_n - 1 loop
    v_item := p_movimentos -> i;
    v_rota := v_item -> 'rota';
    v_passos := jsonb_array_length(v_rota);
    v_q := ((v_rota -> (v_passos - 1)) ->> 'q')::integer;
    v_r := ((v_rota -> (v_passos - 1)) ->> 'r')::integer;

    update vtt_tokens
    set q = v_q, r = v_r,
        offset_q = greatest(-1, least(1, coalesce((v_item ->> 'offset_q')::numeric, 0))),
        offset_r = greatest(-1, least(1, coalesce((v_item ->> 'offset_r')::numeric, 0))),
        revision = revision + 1, updated_at = now()
    where id = (v_item ->> 'token_id')::uuid
    returning * into v_token;

    return next v_token;
  end loop;
end;
$function$;

revoke all on function move_vtt_tokens(jsonb) from public, anon;
grant execute on function move_vtt_tokens(jsonb) to authenticated;

-- ── Girar um token ──────────────────────────────────────────────────
-- Mesma regra: quem pode estar fora da grade pode girar lá. Bloqueio de
-- terreno e colisão continuam impeditivos, como a 0085 definiu.
create or replace function rotacionar_vtt_token(
  p_token_id uuid,
  p_orientacao integer,
  p_expected_revision integer
) returns vtt_tokens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token vtt_tokens;
  v_scene vtt_scenes;
  v_cell record;
begin
  select * into v_token from vtt_tokens where id = p_token_id for update;
  if v_token is null then
    raise exception 'Token não encontrado.' using errcode = 'no_data_found';
  end if;

  if not can_move_vtt_token(p_token_id) then
    raise exception 'Sem permissão para rotacionar este token.' using errcode = 'insufficient_privilege';
  end if;

  if v_token.bloqueado and not is_campaign_owner(v_token.campaign_id) then
    raise exception 'Token travado.' using errcode = 'insufficient_privilege';
  end if;

  if v_token.revision <> p_expected_revision then
    raise exception 'Revisão desatualizada — outra pessoa já alterou este token.' using errcode = 'check_violation';
  end if;

  if not vtt_pegada_personalizada_valida(v_token.pegada_personalizada) then
    raise exception 'Pegada personalizada do token está corrompida.' using errcode = 'data_exception';
  end if;

  if p_orientacao < 0 or p_orientacao > 5 then
    raise exception 'Orientação inválida.' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_scene from vtt_scenes where id = v_token.scene_id;
  if v_scene is null then
    raise exception 'Cena do token não existe mais.' using errcode = 'no_data_found';
  end if;

  for v_cell in select * from vtt_pegada_celulas(v_token.tamanho, p_orientacao, v_token.pegada_personalizada, v_token.q, v_token.r) loop
    if vtt_celula_bloqueada(v_token.scene_id, v_cell.q, v_cell.r) then
      raise exception 'Posição indisponível.' using errcode = 'invalid_parameter_value';
    end if;
    if exists (
      select 1 from vtt_tokens ot
      cross join lateral vtt_pegada_celulas(ot.tamanho, ot.orientacao, ot.pegada_personalizada, ot.q, ot.r) oc
      where ot.scene_id = v_token.scene_id and ot.id <> v_token.id
        and oc.q = v_cell.q and oc.r = v_cell.r
    ) then
      raise exception 'Posição indisponível.' using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  update vtt_tokens
  set orientacao = p_orientacao, revision = v_token.revision + 1, updated_at = now()
  where id = p_token_id
  returning * into v_token;

  return v_token;
end;
$$;

commit;
