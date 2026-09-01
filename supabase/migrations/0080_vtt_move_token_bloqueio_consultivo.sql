-- =====================================================================
-- 0080 — Movimento de token vira CONSULTIVO em relação a terreno
-- bloqueado: o servidor para de recusar uma rota só porque ela
-- atravessa uma célula marcada "bloqueada". Habilidades, voo,
-- teleporte e decisão do narrador/jogador podem ignorar uma restrição
-- normal — "não adianta permitir no cliente e a RPC recusar depois".
--
-- Escopo EXATO: só `move_vtt_token` (deslocar um token JÁ existente).
-- `create_vtt_token`/`edit_vtt_token`/`rotacionar_vtt_token` continuam
-- INTOCADOS nesta migration — criação, posicionamento inicial,
-- redimensionamento, rotação e edição de pegada continuam recusando
-- bloqueio normalmente, exatamente como sempre.
--
-- O que NÃO relaxa (continua igual, migration 0069/0073):
--   - limites do mapa;
--   - colisão com a pegada de OUTRO token (em QUALQUER célula da
--     rota, não só o destino final — comportamento pré-existente,
--     este round não pediu relaxar isto, só bloqueio de TERRENO);
--   - adjacência exata entre células consecutivas da rota;
--   - revisão/autorização/token travado — sem mudança nenhuma.
--
-- `edit_vtt_token`/migration 0077 fica como referência de estilo: uma
-- alteração cirúrgica via `create or replace function` com a MESMA
-- assinatura, nunca editando 0073 retroativamente.
-- =====================================================================

begin;

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

    for v_cell in select * from vtt_pegada_celulas(v_token.tamanho, v_token.orientacao, v_token.pegada_personalizada, v_q, v_r) loop
      if v_cell.r < 0 or v_cell.r >= v_scene.altura then
        raise exception 'Rota sai dos limites da cena.' using errcode = 'invalid_parameter_value';
      end if;
      v_q_min := -(v_cell.r / 2);
      if v_cell.q < v_q_min or v_cell.q >= v_q_min + v_scene.largura then
        raise exception 'Rota sai dos limites da cena.' using errcode = 'invalid_parameter_value';
      end if;

      -- Bloqueio de TERRENO deixou de excluir movimento (regra
      -- consultiva, esta migration) — a checagem que existia aqui foi
      -- removida de propósito, não esquecida. Colisão com OUTRO token
      -- continua excluindo normalmente, sem mudança:
      if i > 0 then
        if exists (
          select 1 from vtt_tokens ot
          cross join lateral vtt_pegada_celulas(ot.tamanho, ot.orientacao, ot.pegada_personalizada, ot.q, ot.r) oc
          where ot.scene_id = v_token.scene_id and ot.id <> v_token.id
            and oc.q = v_cell.q and oc.r = v_cell.r
        ) then
          raise exception 'Posição indisponível.' using errcode = 'invalid_parameter_value';
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

commit;
