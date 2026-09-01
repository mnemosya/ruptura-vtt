-- =====================================================================
-- 0069 — Fecha o teleporte por chamada direta + liga a semente a
-- personagens reais + grants explícitos das RPCs da 0068
--
-- Auditoria pós-0068 (veredito: "furo crítico" confirmado, não
-- hipotético): `move_vtt_token` validava cada célula da rota
-- ISOLADAMENTE (limites do mapa, bloqueio) mas nunca confirmava (a)
-- que a rota começa onde o token JÁ ESTÁ, nem (b) que cada par de
-- células consecutivas é hexagonalmente ADJACENTE. Uma chamada direta
-- à RPC (fora da UI, que só produz rotas contínuas via `hexLinha`)
-- podia mandar `[{q:4,r:4},{q:20,r:10}]` — ambas dentro do mapa, sem
-- bloqueio isolado — e teleportar. Exatamente a classe de bypass que a
-- 0066 (revogar `UPDATE` genérico, mover pra RPC) pretendia fechar.
--
-- Corrigido: a validação por célula GANHA duas checagens novas, na
-- MESMA malha de erros de negócio já existente (`invalid_parameter_value`,
-- sem semântica de retry — mesmo cuidado da 0067):
--   (a) `i = 0` exige `v_q = v_token.q and v_r = v_token.r` — a origem
--       da rota é a posição ATUAL do token, nunca uma alegada pelo
--       cliente;
--   (b) `i > 0` exige distância hexagonal 1 entre a célula atual e a
--       anterior — fórmula de distância em coordenadas cubo
--       (`x=q, z=r, y=-x-z`, distância = soma dos módulos / 2), a
--       MESMA que `hex.ts` usa no cliente, só que agora também no
--       servidor, que é o lado que não pode ser contornado.
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
  v_prev_q integer;
  v_prev_r integer;
  v_dq integer;
  v_dr integer;
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

    if v_r < 0 or v_r >= v_scene.altura then
      raise exception 'Rota sai dos limites da cena (linha %).' , v_r using errcode = 'invalid_parameter_value';
    end if;
    v_q_min := -(v_r / 2);
    if v_q < v_q_min or v_q >= v_q_min + v_scene.largura then
      raise exception 'Rota sai dos limites da cena (coluna %, linha %).' , v_q, v_r using errcode = 'invalid_parameter_value';
    end if;

    if i = 0 then
      -- A origem da rota é a posição ATUAL do token — nunca uma
      -- alegada pelo cliente. Sem isto, uma chamada direta podia
      -- declarar qualquer origem e pular o trecho real do percurso.
      if v_q <> v_token.q or v_r <> v_token.r then
        raise exception 'A rota precisa começar na posição atual do token (%, %), não em (%, %).',
          v_token.q, v_token.r, v_q, v_r using errcode = 'invalid_parameter_value';
      end if;
    else
      -- Adjacência hexagonal: distância cubo entre a célula atual e a
      -- anterior tem que ser exatamente 1. Sem isto, células NÃO
      -- vizinhas nunca eram comparadas entre si — só cada uma
      -- isoladamente contra limites/bloqueio — permitindo teleporte
      -- entre duas células válidas e distantes.
      v_dq := v_q - v_prev_q;
      v_dr := v_r - v_prev_r;
      if ((abs(v_dq) + abs(v_dr) + abs(v_dq + v_dr)) / 2) <> 1 then
        raise exception 'Rota não é contínua: (%, %) não é vizinha de (%, %).', v_q, v_r, v_prev_q, v_prev_r
          using errcode = 'invalid_parameter_value';
      end if;
    end if;
    v_prev_q := v_q;
    v_prev_r := v_r;

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

-- =====================================================================
-- FK composta character↔campaign: `on delete set null` sem lista de
-- colunas tenta zerar AMBAS as colunas da FK, incluindo `campaign_id`
-- — que é `not null` em `vtt_tokens`. Isso faria apagar/arquivar um
-- personagem vinculado FALHAR com violação de not-null, em vez de só
-- soltar o vínculo do token. Postgres 15+ (este projeto roda 17.6)
-- suporta `on delete set null (coluna)` pra zerar só a coluna listada.
-- Precisa DROP+ADD — não existe ALTER pra trocar a ação de uma FK.
-- =====================================================================

alter table vtt_tokens drop constraint vtt_tokens_character_campaign_fk;

alter table vtt_tokens
  add constraint vtt_tokens_character_campaign_fk
  foreign key (character_id, campaign_id) references characters (id, campaign_id)
  on delete set null (character_id);

-- =====================================================================
-- Grants explícitos das RPCs da 0068 — não ficaram implícitos: por
-- padrão o Postgres concede `EXECUTE` de uma função nova a `PUBLIC`
-- (inclusive `anon`, se a role tiver `USAGE` no schema `public`, que
-- tem por padrão neste projeto). A checagem `is_campaign_owner` no
-- CORPO da função já barra quem não é narrador — mas travar também
-- a permissão de CHAMAR é a mesma defesa em profundidade que toda
-- RPC de escrita desta feature já segue (`move_vtt_token`,
-- `set_vtt_token_flags`), e a 0068 saiu sem essa linha por descuido.
-- =====================================================================

revoke all on function seed_vtt_scene(uuid, text, text, text, integer, integer) from public;
grant execute on function seed_vtt_scene(uuid, text, text, text, integer, integer) to authenticated;

revoke all on function seed_vtt_tokens(uuid, uuid, jsonb) from public;
grant execute on function seed_vtt_tokens(uuid, uuid, jsonb) to authenticated;

-- =====================================================================
-- `seed_vtt_tokens` reescrita: dois problemas reais, não hipotéticos.
--
-- (1) Nenhuma validação de limites — a 0068 confiava que o elenco fixo
--     de `CENA_DEMO` sempre cabe no tamanho de cena que ela mesma
--     declara, o que é verdade HOJE mas não é uma garantia do banco;
--     ganhou o MESMO cálculo de limites que `move_vtt_token` já usa.
--
-- (2) TODO token nascia com `character_id = null` — pela regra de
--     autorização (`can_move_vtt_token`), token sem personagem só o
--     narrador move. A cena semeada aparecia normalmente, mas NENHUM
--     jogador conseguia mover NENHUM token — o MVP de "jogador move
--     token que controla" nunca era alcançável a partir da semente
--     real. Corrigido: tokens do lado `pj` são vinculados, em ordem,
--     aos personagens da campanha que JÁ têm um controlador
--     (`character_controllers`) e não estão arquivados — o elenco de
--     nomes da demonstração (Mara, Siv, Oto…) continua sendo só
--     rótulo/aparência; a IDENTIDADE de quem pode mover vem do
--     personagem real vinculado. Sobrando mais tokens `pj` que
--     personagens controlados, os excedentes ficam `character_id
--     null` (narrador-only) — não é erro, é o caso "cena tem mais
--     figurantes que jogadores conectados".
-- =====================================================================

create or replace function seed_vtt_tokens(
  p_scene_id uuid,
  p_campaign_id uuid,
  p_tokens jsonb
) returns setof vtt_tokens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ja_existe boolean;
  v_scene vtt_scenes;
  v_n integer;
  v_step jsonb;
  v_q integer;
  v_r integer;
  v_q_min integer;
begin
  if not is_campaign_owner(p_campaign_id, auth.uid()) then
    raise exception 'Só o narrador pode semear tokens.' using errcode = 'insufficient_privilege';
  end if;

  select exists(select 1 from vtt_tokens where scene_id = p_scene_id) into v_ja_existe;
  if v_ja_existe then
    return query select * from vtt_tokens where scene_id = p_scene_id;
    return;
  end if;

  select * into v_scene from vtt_scenes where id = p_scene_id and campaign_id = p_campaign_id;
  if v_scene is null then
    raise exception 'Cena não encontrada para esta campanha.' using errcode = 'no_data_found';
  end if;

  v_n := jsonb_array_length(p_tokens);
  for i in 0 .. v_n - 1 loop
    v_step := p_tokens -> i;
    v_q := (v_step ->> 'q')::integer;
    v_r := (v_step ->> 'r')::integer;
    if v_r < 0 or v_r >= v_scene.altura then
      raise exception 'Token de semente fora dos limites da cena (linha %).', v_r using errcode = 'invalid_parameter_value';
    end if;
    v_q_min := -(v_r / 2);
    if v_q < v_q_min or v_q >= v_q_min + v_scene.largura then
      raise exception 'Token de semente fora dos limites da cena (coluna %, linha %).', v_q, v_r using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  return query
  with entrada as (
    select
      row_number() over () as ord,
      t ->> 'nome' as nome, t ->> 'sigla' as sigla, t ->> 'lado' as lado, t ->> 'vertente' as vertente,
      (t ->> 'q')::integer as q, (t ->> 'r')::integer as r, t ->> 'tamanho' as tamanho
    from jsonb_array_elements(p_tokens) as t
  ),
  entrada_pj as (
    select ord, row_number() over (order by ord) as ordem_pj
    from entrada
    where lado = 'pj'
  ),
  elenco_controlado as (
    -- Personagens da campanha com controlador ativo e não arquivados —
    -- ordem estável (created_at) pra semeadura determinística.
    select c.id, row_number() over (order by c.created_at) as ordem_char
    from characters c
    where c.campaign_id = p_campaign_id
      and c.status <> 'archived'
      and c.id in (select cc.character_id from character_controllers cc where cc.campaign_id = p_campaign_id)
  )
  insert into vtt_tokens (scene_id, campaign_id, character_id, nome, sigla, lado, vertente, q, r, tamanho)
  select
    p_scene_id, p_campaign_id, ec.id,
    e.nome, e.sigla, e.lado, e.vertente, e.q, e.r, e.tamanho
  from entrada e
  left join entrada_pj ep on ep.ord = e.ord
  left join elenco_controlado ec on ec.ordem_char = ep.ordem_pj
  order by e.ord
  returning *;
end;
$$;
