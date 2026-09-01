-- =====================================================================
-- 0072 — Reparo de inconsistências apontadas ANTES da aprovação da
-- pegada multicelular (0071): remove uma coluna fantasma e fecha um
-- buraco real de validação server-side. Não toca `q`/`r`/`orientacao`
-- de nenhuma linha existente.
--
-- 1) `origem_personalizada` nunca teve consumidor: `TokenVtt` (TS)
--    nunca a declarou, `carregarCenaAtiva` nunca a selecionava, e o
--    domínio (`origemMecanica`) sempre usa o centro geométrico
--    calculado. Um campo com CHECK "é um objeto" mas SEM formato
--    definido (a doc dizia `{x,y}`, o domínio usa `{q,r}`) e SEM
--    caminho de escrita em lugar nenhum é pior que não existir —
--    parece implementado, mas é ignorado. Removida por completo, como
--    a alternativa explicitamente aceita quando não há necessidade
--    funcional na fase atual (nenhum editor de pegada personalizada
--    existe ainda, então não há de onde essa origem viria).
--
-- 2) `pegada_personalizada` só validava "array jsonb não-vazio" — o
--    servidor confiava em qualquer objeto dentro do array, com `q`/`r`
--    de qualquer tipo, possivelmente
--    duplicados, sem a âncora `{0,0}`, ou desconexos (dois grupos de
--    células que não se tocam). Não existe hoje nenhuma RPC que
--    ESCREVA `pegada_personalizada` (sem editor de pegada — fora de
--    escopo, ver 0071), mas a coluna aceita escrita direta (service
--    role, futura RPC) e `move_vtt_token`/`rotacionar_vtt_token` JÁ
--    LEEM e projetam essa coluna via `vtt_pegada_celulas` — um valor
--    malformado ali quebraria essas funções (ou pior, validaria uma
--    posição contra uma pegada sem sentido) sem o banco nunca ter
--    recusado a escrita original.
--
-- REVERSÃO: `alter table vtt_tokens add column origem_personalizada
-- jsonb;` (dado perdido — nunca foi escrito por ninguém, então não há
-- o que restaurar) + `drop function vtt_pegada_personalizada_valida` +
-- restaurar o CHECK fraco anterior de `pegada_personalizada` (migration
-- 0071, linha 48-49).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Remove a coluna fantasma.
-- ---------------------------------------------------------------------

alter table vtt_tokens drop column if exists origem_personalizada;

-- ---------------------------------------------------------------------
-- 2. Validação real de pegada personalizada — espelha as invariantes
--    de `_dominio/pegada.ts` (`pegadaPersonalizadaValida`): lista
--    não-vazia, cada item `{q,r}` com inteiros de verdade (rejeita
--    frações/strings/booleanos), sem offsets duplicados, `{0,0}`
--    presente, conjunto CONECTADO por adjacência hexagonal (mesmo BFS
--    do lado TS, só que iterativo em plpgsql). `null` (sem pegada
--    personalizada — usa o preset da categoria) é válido.
--
--    Limite documentado: no máximo 25 células (mais que o maior preset
--    hoje, Colossal com 12, sem abrir espaço pra formas absurdas) e no
--    máximo 4000 bytes de JSON serializado — os dois contra abuso
--    (payload gigante travando a validação/consulta), não regra de
--    jogo.
-- ---------------------------------------------------------------------

create or replace function vtt_pegada_personalizada_valida(p jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_n integer;
  v_item jsonb;
  v_q integer;
  v_r integer;
  v_key text;
  v_keys text[] := '{}';
  v_qs integer[] := '{}';
  v_rs integer[] := '{}';
  v_visitados boolean[];
  v_pilha integer[] := '{}';
  v_atual integer;
  v_tem_zero boolean := false;
  v_dq integer[] := array[1, 1, 0, -1, -1, 0];
  v_dr integer[] := array[0, -1, -1, 0, 1, 1];
begin
  if p is null then
    return true;
  end if;

  if jsonb_typeof(p) <> 'array' then
    return false;
  end if;

  if length(p::text) > 4000 then
    return false;
  end if;

  v_n := jsonb_array_length(p);
  if v_n < 1 or v_n > 25 then
    return false;
  end if;

  for i in 0 .. v_n - 1 loop
    v_item := p -> i;
    if jsonb_typeof(v_item) <> 'object' then
      return false;
    end if;
    if not (v_item ? 'q') or not (v_item ? 'r') then
      return false;
    end if;
    if jsonb_typeof(v_item -> 'q') <> 'number' or jsonb_typeof(v_item -> 'r') <> 'number' then
      return false;
    end if;
    -- Inteiro exato: o texto do número não pode ter ponto/expoente
    -- (`(v->>'q')::integer` truncaria 1.7 pra 1 em vez de rejeitar).
    if (v_item ->> 'q') !~ '^-?[0-9]+$' or (v_item ->> 'r') !~ '^-?[0-9]+$' then
      return false;
    end if;
    v_q := (v_item ->> 'q')::integer;
    v_r := (v_item ->> 'r')::integer;
    v_key := v_q || ',' || v_r;
    if v_key = any(v_keys) then
      return false;
    end if;
    v_keys := v_keys || v_key;
    v_qs := v_qs || v_q;
    v_rs := v_rs || v_r;
    if v_q = 0 and v_r = 0 then
      v_tem_zero := true;
    end if;
  end loop;

  if not v_tem_zero then
    return false;
  end if;

  -- Conectividade: BFS a partir do offset de índice 1 (arrays plpgsql
  -- são 1-indexados por padrão quando construídos por concatenação).
  v_visitados := array_fill(false, array[v_n]);
  v_visitados[1] := true;
  v_pilha := array[1];
  while array_length(v_pilha, 1) > 0 loop
    v_atual := v_pilha[array_length(v_pilha, 1)];
    v_pilha := v_pilha[1 : array_length(v_pilha, 1) - 1];
    for j in 1 .. v_n loop
      if not v_visitados[j] then
        for k in 1 .. 6 loop
          if v_qs[j] = v_qs[v_atual] + v_dq[k] and v_rs[j] = v_rs[v_atual] + v_dr[k] then
            v_visitados[j] := true;
            v_pilha := v_pilha || j;
            exit;
          end if;
        end loop;
      end if;
    end loop;
  end loop;

  for i in 1 .. v_n loop
    if not v_visitados[i] then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function vtt_pegada_personalizada_valida(jsonb) from public;
grant execute on function vtt_pegada_personalizada_valida(jsonb) to authenticated;

-- Troca o CHECK fraco ("array não-vazio") pelo real.
alter table vtt_tokens drop constraint if exists vtt_tokens_pegada_personalizada_check;
alter table vtt_tokens add constraint vtt_tokens_pegada_personalizada_check
  check (vtt_pegada_personalizada_valida(pegada_personalizada));

comment on column vtt_tokens.pegada_personalizada is 'Offsets axiais [{q,r},...] relativos à âncora — só quando a pegada NÃO é o preset da categoria. Null = usa o preset de `tamanho`. Validado por `vtt_pegada_personalizada_valida` (conectado, {0,0} presente, sem duplicata, máx. 25 células).';

-- ---------------------------------------------------------------------
-- 3. Defesa em profundidade dentro de `move_vtt_token` e
--    `rotacionar_vtt_token` — o CHECK acima já impede uma ESCRITA
--    inválida, mas as duas RPCs LEEM `pegada_personalizada` de uma
--    linha já gravada (nunca confiam no formato por causa da coluna
--    existir). Sem RPC alguma escrevendo esta coluna hoje isto é
--    inatingível em uso normal — é precisamente o ponto: proteger
--    contra uma linha malformada por qualquer via futura (nova RPC,
--    escrita direta por service role, migração de dado) sem repetir
--    o algoritmo de validação, só chamando a mesma função.
-- ---------------------------------------------------------------------

create or replace function move_vtt_token(
  p_token_id uuid,
  p_rota jsonb,
  p_expected_revision integer
) returns vtt_tokens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token vtt_tokens;
  v_scene vtt_scenes;
  v_step jsonb;
  v_q integer;
  v_r integer;
  v_q_min integer;
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

    -- A pegada INTEIRA nesta posição — não só a âncora `(v_q, v_r)`.
    for v_cell in select * from vtt_pegada_celulas(v_token.tamanho, v_token.orientacao, v_token.pegada_personalizada, v_q, v_r) loop
      if v_cell.r < 0 or v_cell.r >= v_scene.altura then
        raise exception 'Rota sai dos limites da cena (linha %).', v_cell.r using errcode = 'invalid_parameter_value';
      end if;
      v_q_min := -(v_cell.r / 2);
      if v_cell.q < v_q_min or v_cell.q >= v_q_min + v_scene.largura then
        raise exception 'Rota sai dos limites da cena (coluna %, linha %).', v_cell.q, v_cell.r using errcode = 'invalid_parameter_value';
      end if;

      if i > 0 then
        if exists (
          select 1 from vtt_terrain t
          where t.scene_id = v_token.scene_id and t.q = v_cell.q and t.r = v_cell.r and t.tipo = 'bloqueado'
        ) then
          raise exception 'Rota atravessa célula bloqueada (%, %).', v_cell.q, v_cell.r using errcode = 'invalid_parameter_value';
        end if;

        if exists (
          select 1 from vtt_tokens ot
          cross join lateral vtt_pegada_celulas(ot.tamanho, ot.orientacao, ot.pegada_personalizada, ot.q, ot.r) oc
          where ot.scene_id = v_token.scene_id and ot.id <> v_token.id
            and oc.q = v_cell.q and oc.r = v_cell.r
        ) then
          raise exception 'Rota colide com outro token em (%, %).', v_cell.q, v_cell.r using errcode = 'invalid_parameter_value';
        end if;
      end if;
    end loop;

    if i = v_n - 1 then
      v_dest_q := v_q;
      v_dest_r := v_r;
    end if;
  end loop;

  update vtt_tokens
  set q = v_dest_q, r = v_dest_r, revision = v_token.revision + 1, updated_at = now()
  where id = p_token_id
  returning * into v_token;

  return v_token;
end;
$$;

revoke all on function move_vtt_token(uuid, jsonb, integer) from public;
grant execute on function move_vtt_token(uuid, jsonb, integer) to authenticated;

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
  v_q_min integer;
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
    if v_cell.r < 0 or v_cell.r >= v_scene.altura then
      raise exception 'Rotação sai dos limites da cena (linha %).', v_cell.r using errcode = 'invalid_parameter_value';
    end if;
    v_q_min := -(v_cell.r / 2);
    if v_cell.q < v_q_min or v_cell.q >= v_q_min + v_scene.largura then
      raise exception 'Rotação sai dos limites da cena (coluna %, linha %).', v_cell.q, v_cell.r using errcode = 'invalid_parameter_value';
    end if;
    if exists (
      select 1 from vtt_terrain t
      where t.scene_id = v_token.scene_id and t.q = v_cell.q and t.r = v_cell.r and t.tipo = 'bloqueado'
    ) then
      raise exception 'Rotação atravessa célula bloqueada (%, %).', v_cell.q, v_cell.r using errcode = 'invalid_parameter_value';
    end if;
    if exists (
      select 1 from vtt_tokens ot
      cross join lateral vtt_pegada_celulas(ot.tamanho, ot.orientacao, ot.pegada_personalizada, ot.q, ot.r) oc
      where ot.scene_id = v_token.scene_id and ot.id <> v_token.id
        and oc.q = v_cell.q and oc.r = v_cell.r
    ) then
      raise exception 'Rotação colide com outro token em (%, %).', v_cell.q, v_cell.r using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  update vtt_tokens
  set orientacao = p_orientacao, revision = v_token.revision + 1, updated_at = now()
  where id = p_token_id
  returning * into v_token;

  return v_token;
end;
$$;

revoke all on function rotacionar_vtt_token(uuid, integer, integer) from public;
grant execute on function rotacionar_vtt_token(uuid, integer, integer) to authenticated;
