-- =====================================================================
-- 0126 — Mover um GRUPO de tokens: `move_vtt_tokens`
--
-- Arrastar N tokens selecionados virava N chamadas de `move_vtt_token`,
-- e isso não podia funcionar: cada chamada valida colisão contra a
-- posição PERSISTIDA de todos os outros — inclusive a dos colegas de
-- grupo, que ainda não saíram do lugar. Numa formação que anda na
-- própria direção (A em (0,0), B atrás em (-1,0), grupo indo pra
-- direita) a rota de B atravessa a célula onde A ainda está, e o
-- servidor recusa com "Posição indisponível". Na tela: um token vai, o
-- outro começa a ir e é puxado de volta.
--
-- Ordenar as chamadas não resolve — uma trilha pode dobrar por cima de
-- si mesma, e uma troca de posições entre dois membros não tem ordem
-- boa nenhuma. O que resolve é o grupo ser UMA operação: aqui, dentro
-- de uma transação só, os membros do lote não são obstáculo uns pros
-- outros DURANTE o percurso — todos saem das próprias células no mesmo
-- instante. O que continua valendo integralmente:
--
--   • permissão, trava e revisão, token a token;
--   • adjacência hexagonal de cada rota, e a rota começando na posição
--     atual daquele token;
--   • limites da cena, com a mesma exceção "volta pra grade" da 0125;
--   • colisão com qualquer token de FORA do lote, em cada passo;
--   • e, no fim, as posições FINAIS dos membros não podem se sobrepor
--     entre si — o grupo pode se cruzar no caminho, nunca terminar
--     empilhado.
--
-- Tudo ou nada: qualquer recusa aborta a transação inteira e nenhum
-- token se move. É o que faz o gesto ser honesto — metade de um
-- movimento em grupo não é um movimento em grupo.
-- =====================================================================

begin;

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
  v_q_min        integer;
  v_prev_q       integer;
  v_prev_r       integer;
  v_dq           integer;
  v_dr           integer;
  v_cell         record;
  v_origem_fora  boolean;
  v_entrou       boolean;
  v_passo_fora   boolean;
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
  -- Teto defensivo: o gesto real tem dezenas de tokens no máximo, e
  -- sem limite uma chamada malformada varreria a cena inteira sob
  -- `for update`.
  if v_n > 50 then
    raise exception 'Movimento em grupo limitado a 50 tokens (recebeu %).', v_n using errcode = 'invalid_parameter_value';
  end if;

  -- ── Passo 1 — travar e autorizar CADA token ─────────────────────
  -- Antes de qualquer validação de geometria: nenhuma rota deste lote
  -- pode ser avaliada contra um estado que outra sessão ainda possa
  -- mudar no meio do caminho.
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

    -- Uma cena só: um "grupo" espalhado por cenas diferentes não é um
    -- grupo, e a validação de limites abaixo pressupõe UMA grade.
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

  -- ── Passo 2 — geometria de cada rota ────────────────────────────
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

    -- Volta pra grade (0125): a posição ATUAL deste token já está fora?
    v_origem_fora := false;
    v_entrou := false;
    for v_cell in select * from vtt_pegada_celulas(v_token.tamanho, v_token.orientacao, v_token.pegada_personalizada, v_token.q, v_token.r) loop
      if v_cell.r < 0 or v_cell.r >= v_scene.altura then
        v_origem_fora := true;
      else
        v_q_min := -(v_cell.r / 2);
        if v_cell.q < v_q_min or v_cell.q >= v_q_min + v_scene.largura then
          v_origem_fora := true;
        end if;
      end if;
    end loop;

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

      v_passo_fora := false;

      for v_cell in select * from vtt_pegada_celulas(v_token.tamanho, v_token.orientacao, v_token.pegada_personalizada, v_q, v_r) loop
        if v_cell.r < 0 or v_cell.r >= v_scene.altura then
          v_passo_fora := true;
        else
          v_q_min := -(v_cell.r / 2);
          if v_cell.q < v_q_min or v_cell.q >= v_q_min + v_scene.largura then
            v_passo_fora := true;
          end if;
        end if;

        -- Colisão só contra quem está FORA do lote: os colegas de
        -- grupo saem das próprias células no mesmo instante, e tratá-los
        -- como obstáculo é exatamente o que impedia o grupo de andar.
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

        -- Células da posição FINAL entram na lista que o passo 3 usa
        -- pra garantir que o grupo não termine empilhado.
        if j = v_passos - 1 then
          v_chave := v_cell.q || ',' || v_cell.r;
          if v_chave = any(v_celulas_fim) then
            raise exception 'Dois tokens do grupo terminariam na mesma célula.' using errcode = 'invalid_parameter_value';
          end if;
          v_celulas_fim := v_celulas_fim || v_chave;
        end if;
      end loop;

      if v_passo_fora then
        if not v_origem_fora or v_entrou then
          raise exception 'Rota sai dos limites da cena.' using errcode = 'invalid_parameter_value';
        end if;
        if j = v_passos - 1 then
          raise exception 'O movimento precisa terminar dentro da cena.' using errcode = 'invalid_parameter_value';
        end if;
      else
        v_entrou := true;
      end if;
    end loop;
  end loop;

  -- ── Passo 3 — aplicar ───────────────────────────────────────────
  -- Só aqui alguma coisa muda. Como tudo acontece na mesma transação,
  -- uma recusa em qualquer ponto acima deixa a cena exatamente como
  -- estava.
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

commit;
