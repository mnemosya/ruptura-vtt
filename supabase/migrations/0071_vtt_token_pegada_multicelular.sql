-- =====================================================================
-- 0071 — Pegada hexagonal multicelular pra tokens (Pequeno/Médio = 1
-- hex, Grande = 3 em triângulo, Enorme = 7 = âncora+anel1, Colossal =
-- 12 = as 7 do Enorme + as 5 primeiras células do anel de raio 2).
-- Referência de FORMATO só (Lancer) — nenhuma regra de movimento,
-- alcance ou combate importada.
--
-- Evolução MÍNIMA de schema: `q`/`r` continuam sendo a ÂNCORA (não o
-- centro geométrico — ver `_dominio/pegada.ts`, `origemMecanica`).
-- Presets padrão NÃO são persistidos como offsets — só `tamanho`
-- (já existia) + `orientacao` (novo) bastam pro domínio derivar a
-- pegada. Offsets só são gravados quando a pegada é PERSONALIZADA
-- (`pegada_personalizada`), evitando duplicar no banco uma definição
-- que pertence ao código.
--
-- MIGRAÇÃO DE DADOS ANTIGA→NOVA, sem mudança silenciosa de posição:
--   • `q`/`r` de TODO token existente permanecem EXATAMENTE os mesmos
--     — esta migration nunca escreve nessas colunas;
--   • `orientacao` nasce em 0 pra toda linha existente (é o `default`
--     da coluna nova, populado pelo próprio ADD COLUMN);
--   • `tamanho` de todo token JÁ EXISTENTE volta pra 'medio' — antes
--     desta migration, tamanho era só um multiplicador de raio VISUAL
--     sobre uma única célula (nunca ocupação real), então nenhuma
--     campanha em produção tem um token que dependa de verdade de uma
--     pegada de 3/7/12 células — zerar pra 'medio' evita que uma
--     campanha existente ganhe, da noite pro dia, um token que
--     colide/bloqueia com 3× a área que tinha antes, sem ninguém ter
--     pedido isso. Cenas SEMEADAS DAQUI PRA FRENTE continuam livres
--     pra usar Grande/Enorme/Colossal normalmente — isso é
--     `seed_vtt_tokens` inserindo com o `tamanho` que
--     `_dados/cenaDemo.ts` já declara, sem relação com este backfill
--     (que só toca linhas JÁ GRAVADAS antes desta migration rodar).
--
-- REVERSÃO: aditiva e não-destrutiva — reverter é
--   `alter table vtt_tokens drop column orientacao, drop column pegada_personalizada, drop column origem_personalizada;`
--   mais restaurar os corpos anteriores de `move_vtt_token`/
--   `seed_vtt_tokens` (migration 0069) e remover
--   `vtt_pegada_offsets`/`vtt_pegada_celulas`/`rotacionar_vtt_token`.
--   Nenhuma linha de `q`/`r` precisa reverter — nunca foram tocadas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------

alter table vtt_tokens
  add column if not exists orientacao integer not null default 0 check (orientacao between 0 and 5),
  add column if not exists pegada_personalizada jsonb
    check (pegada_personalizada is null or (jsonb_typeof(pegada_personalizada) = 'array' and jsonb_array_length(pegada_personalizada) > 0)),
  add column if not exists origem_personalizada jsonb
    check (origem_personalizada is null or jsonb_typeof(origem_personalizada) = 'object');

comment on column vtt_tokens.orientacao is 'Rotação em passos de 60°, 0-5. Presets padrão são rotacionados a partir disto — nunca persistidos já rotacionados.';
comment on column vtt_tokens.pegada_personalizada is 'Offsets axiais [{q,r},...] relativos à âncora — só quando a pegada NÃO é o preset da categoria. Null = usa o preset de `tamanho`.';
comment on column vtt_tokens.origem_personalizada is 'Origem mecânica {x,y} fracionária, relativa à âncora — só quando definida explicitamente pelo narrador. Null = centro geométrico calculado da pegada efetiva.';

-- Backfill: tokens já existentes voltam pra Médio (ver nota acima) — posição e orientação nunca mudam.
update vtt_tokens set tamanho = 'medio' where tamanho <> 'medio';

-- ---------------------------------------------------------------------
-- 2. Offsets dos presets padrão — espelham EXATAMENTE
--    `_dominio/pegada.ts` (`PRESETS_POR_CATEGORIA`). O servidor nunca
--    confia numa lista de células que o cliente mande — ele recalcula
--    a pegada sozinho, aqui.
-- ---------------------------------------------------------------------

create or replace function vtt_pegada_offsets_base(p_tamanho text, p_pegada_personalizada jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when p_pegada_personalizada is not null then p_pegada_personalizada
    when p_tamanho = 'grande' then '[{"q":0,"r":0},{"q":1,"r":0},{"q":0,"r":1}]'::jsonb
    when p_tamanho = 'enorme' then '[{"q":0,"r":0},{"q":1,"r":0},{"q":1,"r":-1},{"q":0,"r":-1},{"q":-1,"r":0},{"q":-1,"r":1},{"q":0,"r":1}]'::jsonb
    when p_tamanho = 'colossal' then '[{"q":0,"r":0},{"q":1,"r":0},{"q":1,"r":-1},{"q":0,"r":-1},{"q":-1,"r":0},{"q":-1,"r":1},{"q":0,"r":1},{"q":-2,"r":2},{"q":-1,"r":2},{"q":0,"r":2},{"q":1,"r":1},{"q":2,"r":0}]'::jsonb
    else '[{"q":0,"r":0}]'::jsonb
  end;
$$;

-- ---------------------------------------------------------------------
-- 3. Pegada EFETIVA — offsets base rotacionados `p_orientacao` passos
--    de 60° (mesma fórmula de cubo `(x,y,z) → (-y,-z,-x)` que
--    `_mapa/hex.ts` (`hexRotacionar`) usa no cliente) e projetados na
--    âncora absoluta. Retorna as células ABSOLUTAS ocupadas.
-- ---------------------------------------------------------------------

create or replace function vtt_pegada_celulas(
  p_tamanho text,
  p_orientacao integer,
  p_pegada_personalizada jsonb,
  p_ancora_q integer,
  p_ancora_r integer
) returns table(q integer, r integer)
language plpgsql
immutable
as $$
declare
  v_offsets jsonb;
  v_n integer;
  v_off jsonb;
  v_x integer; v_y integer; v_z integer;
  v_nx integer; v_ny integer; v_nz integer;
  v_passos integer;
begin
  v_offsets := vtt_pegada_offsets_base(p_tamanho, p_pegada_personalizada);
  v_n := jsonb_array_length(v_offsets);
  v_passos := ((p_orientacao % 6) + 6) % 6;
  for i in 0 .. v_n - 1 loop
    v_off := v_offsets -> i;
    v_x := (v_off ->> 'q')::integer;
    v_z := (v_off ->> 'r')::integer;
    v_y := -v_x - v_z;
    for j in 1 .. v_passos loop
      v_nx := -v_y;
      v_ny := -v_z;
      v_nz := -v_x;
      v_x := v_nx; v_y := v_ny; v_z := v_nz;
    end loop;
    q := p_ancora_q + v_x;
    r := p_ancora_r + v_z;
    return next;
  end loop;
end;
$$;

revoke all on function vtt_pegada_offsets_base(text, jsonb) from public;
grant execute on function vtt_pegada_offsets_base(text, jsonb) to authenticated;
revoke all on function vtt_pegada_celulas(text, integer, jsonb, integer, integer) from public;
grant execute on function vtt_pegada_celulas(text, integer, jsonb, integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 4. `move_vtt_token` — cada passo agora valida a PEGADA INTEIRA (não
--    só a âncora): limites do mapa, bloqueio e colisão com a pegada de
--    QUALQUER outro token da cena (checagem de colisão entre tokens
--    que simplesmente não existia antes — a 0069 só validava
--    adjacência entre âncoras, nunca ocupação alheia). Adjacência
--    continua sendo entre ÂNCORAS consecutivas — a pegada não muda de
--    orientação durante o deslocamento.
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

-- ---------------------------------------------------------------------
-- 5. `rotacionar_vtt_token` — nova. Mesma malha de autorização/revisão
--    de `move_vtt_token`; valida a pegada na orientação NOVA (posição
--    da âncora não muda) contra limites/bloqueio/colisão.
-- ---------------------------------------------------------------------

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
