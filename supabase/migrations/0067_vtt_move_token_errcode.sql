-- =====================================================================
-- 0067 — Corrige o errcode da exceção de conflito de revisão
--
-- Achado ao verificar a suíte de autorização (`check-vtt-autorizacao.ts`,
-- critério 7): a chamada de `move_vtt_token` com revisão desatualizada
-- reproduzia consistentemente "upstream request timeout" em vez de
-- devolver a exceção quase instantaneamente — não em toda execução do
-- script inteiro (que faz várias chamadas), mas isolado numa ÚNICA
-- chamada, com um usuário autenticado real, sempre no mesmo caminho.
--
-- Causa: a 0066 usava `errcode = 'serialization_failure'` (SQLSTATE
-- 40001) pra sinalizar "outra pessoa já moveu este token" — uma
-- convenção de erro de APLICAÇÃO copiada displicentemente do nome que
-- soava certo. Só que 40001 é a classe que o protocolo Postgres reserva
-- pra falha de SERIALIZABLE de verdade, e é exatamente a classe que
-- poolers de conexão (PgBouncer/Supavisor) e alguns pontos do pipeline
-- do PostgREST tratam como "vale a pena tentar de novo automaticamente"
-- — histórico conhecido de bibliotecas cliente Postgres. Um conflito de
-- revisão em `vtt_tokens` não é uma falha de serialização de
-- transação: é uma condição de NEGÓCIO ("chegou tarde"), e devolvida
-- como se fosse a outra coisa, o pipeline tentava de nudo até estourar
-- o timeout do gateway em vez de devolver o erro na hora.
--
-- Troca pra `check_violation` (23514) — mesma classe já usada nas
-- outras validações de negócio desta função ("rota sai dos limites",
-- "atravessa bloqueio"), que não carrega semântica de retry.
--
-- Isto é `create or replace function`: reaplicar não perde a proteção
-- nenhuma, só troca QUAL código de erro acompanha a mesma mensagem.
-- =====================================================================

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
    -- `check_violation` (23514), NÃO `serialization_failure` (40001) —
    -- ver comentário da migration no topo do arquivo.
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

    if v_r < 0 or v_r >= v_scene.altura then
      raise exception 'Rota sai dos limites da cena (linha %).' , v_r using errcode = 'invalid_parameter_value';
    end if;
    v_q_min := -(v_r / 2);
    if v_q < v_q_min or v_q >= v_q_min + v_scene.largura then
      raise exception 'Rota sai dos limites da cena (coluna %, linha %).' , v_q, v_r using errcode = 'invalid_parameter_value';
    end if;

    if i > 0 and exists (
      select 1 from vtt_terrain t
      where t.scene_id = v_token.scene_id and t.q = v_q and t.r = v_r and t.tipo = 'bloqueado'
    ) then
      raise exception 'Rota atravessa célula bloqueada (%, %).', v_q, v_r using errcode = 'invalid_parameter_value';
    end if;

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
