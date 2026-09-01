-- =====================================================================
-- 0066 — Reforço da autorização do VTT (auditoria pós-0065)
--
-- A 0065 já foi aplicada em produção — não editada, corrigida aqui, na
-- ordem certa de migration. Quatro defeitos reais encontrados em
-- auditoria, todos exploráveis por chamada direta ao banco (fora da
-- UI), que é justamente o que o RLS existe pra impedir:
--
-- 1. `grant select, update on vtt_tokens to authenticated` concedia
--    UPDATE da linha INTEIRA. A policy `vtt_tokens_update` checava
--    `can_move_vtt_token`, mas não limitava QUAIS colunas mudavam — um
--    jogador com permissão de mover um token podia, na mesma chamada,
--    trocar `character_id`, `visivel`, `bloqueado`, `lado`, `nome` etc.
--    Corrigido: revoga o UPDATE genérico e move toda escrita de token
--    pra duas RPCs estreitas (`move_vtt_token`, só posição;
--    `set_vtt_token_flags`, só narrador, só bloqueado/visível).
--
-- 2. `moverToken()` em `sceneStorage.ts` só validava limites do mapa e
--    bloqueio no CLIENTE (`_dominio/movimento.ts`). Uma chamada direta
--    ao banco podia mover um token pra fora da grade ou atravessar
--    célula bloqueada. Corrigido: `move_vtt_token` revalida a ROTA
--    inteira (não só o destino) contra limites e bloqueio, no servidor.
--
-- 3. Sem FK composta `(scene_id, campaign_id)`, era estruturalmente
--    possível gravar um token/terreno/marca com `scene_id` de uma
--    campanha e `campaign_id` de outra — os dois campos existem
--    justamente pra escopar policy e canal Realtime, e podiam divergir
--    em silêncio. Corrigido com FK composta contra
--    `vtt_scenes(id, campaign_id)` (já `unique` desde a 0065).
--
-- 4. `vtt_tokens.character_id` não garantia que o personagem pertence à
--    MESMA campanha do token — `can_move_vtt_token` checa controle do
--    personagem só pelo `character_id`, então um token podia apontar
--    pra personagem de outra campanha e ainda passar na checagem.
--    Corrigido com FK composta contra `characters(id, campaign_id)`
--    (índice único já existe desde a 0051 — `characters_id_campaign_id_uidx`).
--    FK composta com coluna nula (`character_id`) não bloqueia token
--    sem personagem: MATCH SIMPLE (padrão do Postgres) libera a
--    checagem quando qualquer coluna do par é null.
--
-- Achado adicional, fora da lista mas do mesmo gênero: `criarMarca()`
-- recebia `autorId` como PARÂMETRO — o comentário do arquivo já
-- prometia "vem de auth.uid(), não é parâmetro", mas o código não
-- cumpria a promessa. A policy `vtt_marks_insert` (`autor_id =
-- auth.uid()`) já impedia EXPLORAÇÃO (um autor forjado só faz a
-- inserção falhar), mas o contrato ficava mentindo sobre a própria
-- garantia. Corrigido no lado da aplicação (`sceneStorage.ts`), não
-- exige mudança de schema.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. FK compostas — integridade cena↔campanha e personagem↔campanha
-- ---------------------------------------------------------------------
alter table vtt_tokens
  add constraint vtt_tokens_scene_campaign_fk
  foreign key (scene_id, campaign_id) references vtt_scenes (id, campaign_id) on delete cascade;

alter table vtt_tokens
  add constraint vtt_tokens_character_campaign_fk
  foreign key (character_id, campaign_id) references characters (id, campaign_id) on delete set null;

alter table vtt_terrain
  add constraint vtt_terrain_scene_campaign_fk
  foreign key (scene_id, campaign_id) references vtt_scenes (id, campaign_id) on delete cascade;

alter table vtt_marks
  add constraint vtt_marks_scene_campaign_fk
  foreign key (scene_id, campaign_id) references vtt_scenes (id, campaign_id) on delete cascade;

-- ---------------------------------------------------------------------
-- 2. Revoga UPDATE genérico de vtt_tokens — toda escrita passa por RPC
-- ---------------------------------------------------------------------
drop policy if exists vtt_tokens_update on vtt_tokens;
revoke update on vtt_tokens from authenticated;
-- SELECT continua liberado (leitura da cena não muda).

-- ---------------------------------------------------------------------
-- 3. move_vtt_token — única forma de mudar a posição de um token
--
-- Recebe a ROTA inteira (array de {q,r}, incluindo a origem) — não só
-- o destino — porque validar apenas o destino deixaria passar uma
-- chamada que "salta" através de uma célula bloqueada no meio do
-- caminho. O cliente já monta essa rota (`_dominio/movimento.ts`,
-- `montarRota`); esta função reexecuta a MESMA validação de limites e
-- bloqueio, com a mesma fórmula de bounds hexagonal
-- (`_mapa/hex.ts::dentroDoMapa`), do lado que não pode ser contornado.
--
-- Não reimplementa custo de terreno difícil aqui: nesta fase não há
-- orçamento de PA persistido no token (é um valor do personagem, fora
-- deste domínio), então "quanto custa" segue sendo decisão de UI:
-- interface e regra concordam sobre metros e custo, mas o servidor
-- só garante o que É universalmente inegociável — dentro do mapa,
-- fora de bloqueio, revisão em dia, permissão sobre o token.
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
    raise exception 'Revisão desatualizada — outra pessoa já moveu este token.' using errcode = 'serialization_failure';
  end if;

  select * into v_scene from vtt_scenes where id = v_token.scene_id;
  if v_scene is null then
    raise exception 'Cena do token não existe mais.' using errcode = 'no_data_found';
  end if;

  v_n := jsonb_array_length(p_rota);
  if v_n < 2 then
    raise exception 'Rota precisa de origem e destino.' using errcode = 'invalid_parameter_value';
  end if;

  -- Cada célula da rota (a partir da 2ª — a 1ª é a origem, ninguém
  -- "entra" nela) precisa estar dentro do mapa e fora de bloqueio.
  -- Mesma fórmula de `dentroDoMapa` em hex.ts: fileira r começa em
  -- q = -(r div 2) e tem `largura` células.
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

-- ---------------------------------------------------------------------
-- 4. set_vtt_token_flags — bloquear/desbloquear e mostrar/ocultar,
-- SÓ narrador. Nenhuma UI desta fase ainda chama isto (travamento e
-- visibilidade não têm controle exposto ainda), mas o caminho de
-- escrita precisa existir com o mesmo rigor — não faz sentido destravar
-- a UI antes e deixar a única porta de escrita ser genérica.
-- ---------------------------------------------------------------------
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

  return v_token;
end;
$$;

revoke all on function set_vtt_token_flags(uuid, boolean, boolean) from public;
grant execute on function set_vtt_token_flags(uuid, boolean, boolean) to authenticated;
