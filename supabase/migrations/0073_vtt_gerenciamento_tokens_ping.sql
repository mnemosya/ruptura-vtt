-- =====================================================================
-- 0073 — Gerenciamento completo de tokens, ping efêmero e infraestrutura
-- de camadas (a camada de camadas em si é só client-side/localStorage,
-- sem schema).
--
-- ---------------------------------------------------------------------
-- 1. Campos mínimos de apresentação/combate — NÃO é a ficha do
--    personagem duplicada. Um token vinculado a `character_id` NÃO
--    sincroniza estes campos automaticamente com a ficha (isso exigiria
--    um pipeline de derivação da ficha que não existe nesta fase,
--    documentado como limitação conhecida) — são o estado PRÓPRIO da
--    presença deste token NESTA cena, que o narrador ajusta pela UI de
--    gerenciamento. Mana/PE/integridade/PA/reações/reflexos/ações
--    (tudo que `_dados/cenaDemo.ts` também carregava) ficam DE FORA de
--    propósito: são mecânica de personagem/monstro que este projeto
--    ainda não modela fora da ficha real — replicá-las aqui seria
--    exatamente o "copiar cegamente" que o pedido pede pra evitar.
-- ---------------------------------------------------------------------

alter table vtt_tokens
  add column if not exists retrato_url text,
  add column if not exists pv_atual integer check (pv_atual is null or pv_atual >= 0),
  add column if not exists pv_max integer check (pv_max is null or pv_max >= 0),
  add column if not exists condicoes text[] not null default '{}';

alter table vtt_tokens
  add constraint vtt_tokens_pv_atual_max_ck
  check (pv_atual is null or pv_max is null or pv_atual <= pv_max);

alter table vtt_tokens
  add constraint vtt_tokens_condicoes_ck
  check (condicoes <@ array[
    'atordoado','caido','cego','surdo','lento','sangrando','queimando',
    'envenenado','saturado','insaturado','imobilizado','agarrado',
    'ofuscado','contundido','sufocando','inconsciente'
  ]::text[]);

comment on column vtt_tokens.retrato_url is 'URL de imagem opcional — presentation-only, sem storage próprio nesta fase (o narrador cola uma URL já hospedada em outro lugar).';
comment on column vtt_tokens.pv_atual is 'PV exibido no token NESTA cena — não sincroniza com a ficha do personagem vinculado.';
comment on column vtt_tokens.pv_max is 'Ver pv_atual.';
comment on column vtt_tokens.condicoes is 'Slugs de condição (CondicaoSlug, _dados/cenaDemo.ts) aplicadas a este token nesta cena — estado de combate, não da ficha.';

-- ---------------------------------------------------------------------
-- 2. Mensagens de colisão GENÉRICAS em move/rotacionar — um jogador
--    tentando mover sobre um token OCULTO não pode aprender, pela
--    mensagem de erro, que ali existe algo (ver exigência "não deve
--    revelar identidade, nome ou detalhes do token oculto"). Aplicado
--    uniformemente (não só quando o bloqueio é de um token oculto) —
--    mais simples e igualmente correto: "algo impede" nunca vaza mais
--    que isso, esteja o bloqueio visível ou não.
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

    for v_cell in select * from vtt_pegada_celulas(v_token.tamanho, v_token.orientacao, v_token.pegada_personalizada, v_q, v_r) loop
      if v_cell.r < 0 or v_cell.r >= v_scene.altura then
        raise exception 'Rota sai dos limites da cena.' using errcode = 'invalid_parameter_value';
      end if;
      v_q_min := -(v_cell.r / 2);
      if v_cell.q < v_q_min or v_cell.q >= v_q_min + v_scene.largura then
        raise exception 'Rota sai dos limites da cena.' using errcode = 'invalid_parameter_value';
      end if;

      if i > 0 then
        if exists (
          select 1 from vtt_terrain t
          where t.scene_id = v_token.scene_id and t.q = v_cell.q and t.r = v_cell.r and t.tipo = 'bloqueado'
        ) then
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
      raise exception 'Rotação sai dos limites da cena.' using errcode = 'invalid_parameter_value';
    end if;
    v_q_min := -(v_cell.r / 2);
    if v_cell.q < v_q_min or v_cell.q >= v_q_min + v_scene.largura then
      raise exception 'Rotação sai dos limites da cena.' using errcode = 'invalid_parameter_value';
    end if;
    if exists (
      select 1 from vtt_terrain t
      where t.scene_id = v_token.scene_id and t.q = v_cell.q and t.r = v_cell.r and t.tipo = 'bloqueado'
    ) then
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

revoke all on function rotacionar_vtt_token(uuid, integer, integer) from public;
grant execute on function rotacionar_vtt_token(uuid, integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Validação de footprint compartilhada — usada por create/resize/
--    duplicate. Levanta exceção descritiva na PRIMEIRA falha (bounds,
--    depois bloqueio, depois colisão) — narrador-only, então a mensagem
--    detalhada não vaza nada que ele já não veja.
-- ---------------------------------------------------------------------

create or replace function vtt_validar_pegada_em(
  p_scene_id uuid,
  p_tamanho text,
  p_orientacao integer,
  p_pegada_personalizada jsonb,
  p_q integer,
  p_r integer,
  p_ignorar_token_id uuid
) returns void
language plpgsql
as $$
declare
  v_scene vtt_scenes;
  v_q_min integer;
  v_cell record;
begin
  select * into v_scene from vtt_scenes where id = p_scene_id;
  if v_scene is null then
    raise exception 'Cena não encontrada.' using errcode = 'no_data_found';
  end if;

  if not vtt_pegada_personalizada_valida(p_pegada_personalizada) then
    raise exception 'Pegada personalizada inválida.' using errcode = 'invalid_parameter_value';
  end if;
  if p_orientacao < 0 or p_orientacao > 5 then
    raise exception 'Orientação inválida.' using errcode = 'invalid_parameter_value';
  end if;

  for v_cell in select * from vtt_pegada_celulas(p_tamanho, p_orientacao, p_pegada_personalizada, p_q, p_r) loop
    if v_cell.r < 0 or v_cell.r >= v_scene.altura then
      raise exception 'A pegada sai dos limites do mapa (célula %, %).', v_cell.q, v_cell.r using errcode = 'invalid_parameter_value';
    end if;
    v_q_min := -(v_cell.r / 2);
    if v_cell.q < v_q_min or v_cell.q >= v_q_min + v_scene.largura then
      raise exception 'A pegada sai dos limites do mapa (célula %, %).', v_cell.q, v_cell.r using errcode = 'invalid_parameter_value';
    end if;
    if exists (
      select 1 from vtt_terrain t
      where t.scene_id = p_scene_id and t.q = v_cell.q and t.r = v_cell.r and t.tipo = 'bloqueado'
    ) then
      raise exception 'A pegada toca terreno bloqueado (célula %, %).', v_cell.q, v_cell.r using errcode = 'invalid_parameter_value';
    end if;
    if exists (
      select 1 from vtt_tokens ot
      cross join lateral vtt_pegada_celulas(ot.tamanho, ot.orientacao, ot.pegada_personalizada, ot.q, ot.r) oc
      where ot.scene_id = p_scene_id
        and (p_ignorar_token_id is null or ot.id <> p_ignorar_token_id)
        and oc.q = v_cell.q and oc.r = v_cell.r
    ) then
      raise exception 'A pegada sobrepõe outro token (célula %, %).', v_cell.q, v_cell.r using errcode = 'invalid_parameter_value';
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. CRUD de tokens — narrador-only, cada RPC estreita numa
--    responsabilidade (mesmo padrão de move/rotacionar/set_flags).
-- ---------------------------------------------------------------------

create or replace function create_vtt_token(
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
  p_condicoes text[]
) returns vtt_tokens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token vtt_tokens;
begin
  if not is_campaign_owner(p_campaign_id) then
    raise exception 'Só o narrador cria tokens.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from vtt_scenes where id = p_scene_id and campaign_id = p_campaign_id) then
    raise exception 'Cena não encontrada para esta campanha.' using errcode = 'no_data_found';
  end if;

  perform vtt_validar_pegada_em(p_scene_id, p_tamanho, p_orientacao, p_pegada_personalizada, p_q, p_r, null);

  insert into vtt_tokens (
    scene_id, campaign_id, character_id, nome, sigla, lado, vertente,
    q, r, tamanho, orientacao, pegada_personalizada,
    visivel, bloqueado, retrato_url, pv_atual, pv_max, condicoes
  ) values (
    p_scene_id, p_campaign_id, p_character_id, p_nome, coalesce(nullif(p_sigla, ''), '??'), p_lado, coalesce(p_vertente, 'nenhuma'),
    p_q, p_r, p_tamanho, coalesce(p_orientacao, 0), p_pegada_personalizada,
    coalesce(p_visivel, true), coalesce(p_bloqueado, false), p_retrato_url, p_pv_atual, p_pv_max, coalesce(p_condicoes, '{}')
  )
  returning * into v_token;

  return v_token;
end;
$$;

revoke all on function create_vtt_token(uuid, uuid, text, text, text, text, text, integer, jsonb, integer, integer, uuid, boolean, boolean, text, integer, integer, text[]) from public;
grant execute on function create_vtt_token(uuid, uuid, text, text, text, text, text, integer, jsonb, integer, integer, uuid, boolean, boolean, text, integer, integer, text[]) to authenticated;

create or replace function update_vtt_token(
  p_token_id uuid,
  p_nome text,
  p_sigla text,
  p_lado text,
  p_vertente text,
  p_character_id uuid,
  p_retrato_url text,
  p_pv_atual integer,
  p_pv_max integer,
  p_condicoes text[],
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
  if not is_campaign_owner(v_token.campaign_id) then
    raise exception 'Só o narrador edita tokens.' using errcode = 'insufficient_privilege';
  end if;
  if v_token.revision <> p_expected_revision then
    raise exception 'Revisão desatualizada — outra pessoa já alterou este token.' using errcode = 'check_violation';
  end if;

  update vtt_tokens
  set nome = p_nome, sigla = coalesce(nullif(p_sigla, ''), '??'), lado = p_lado, vertente = coalesce(p_vertente, 'nenhuma'),
      character_id = p_character_id, retrato_url = p_retrato_url,
      pv_atual = p_pv_atual, pv_max = p_pv_max, condicoes = coalesce(p_condicoes, '{}'),
      revision = v_token.revision + 1, updated_at = now()
  where id = p_token_id
  returning * into v_token;

  return v_token;
end;
$$;

revoke all on function update_vtt_token(uuid, text, text, text, text, uuid, text, integer, integer, text[], integer) from public;
grant execute on function update_vtt_token(uuid, text, text, text, text, uuid, text, integer, integer, text[], integer) to authenticated;

-- Redimensiona/reformata — âncora (q,r) preservada de propósito
-- (`_dominio/pegada.ts` já documenta a âncora como o ponto fixo da
-- pegada); a UI decide orientação (mantém a atual, ou 0 se a anterior
-- não fazia sentido pro novo tamanho) e manda explicitamente.
create or replace function resize_vtt_token(
  p_token_id uuid,
  p_tamanho text,
  p_orientacao integer,
  p_pegada_personalizada jsonb,
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
  if not is_campaign_owner(v_token.campaign_id) then
    raise exception 'Só o narrador altera tamanho/pegada de token.' using errcode = 'insufficient_privilege';
  end if;
  if v_token.revision <> p_expected_revision then
    raise exception 'Revisão desatualizada — outra pessoa já alterou este token.' using errcode = 'check_violation';
  end if;

  perform vtt_validar_pegada_em(v_token.scene_id, p_tamanho, p_orientacao, p_pegada_personalizada, v_token.q, v_token.r, v_token.id);

  update vtt_tokens
  set tamanho = p_tamanho, orientacao = p_orientacao, pegada_personalizada = p_pegada_personalizada,
      revision = v_token.revision + 1, updated_at = now()
  where id = p_token_id
  returning * into v_token;

  return v_token;
end;
$$;

revoke all on function resize_vtt_token(uuid, text, integer, jsonb, integer) from public;
grant execute on function resize_vtt_token(uuid, text, integer, jsonb, integer) to authenticated;

-- Duplica — NUNCA copia `character_id` (vínculo de controle é
-- exclusivo; duas presenças "sendo" o mesmo personagem não faz
-- sentido) nem `bloqueado` (a cópia nasce destravada, mesmo que a
-- origem estivesse travada — travar foi uma decisão sobre AQUELE
-- token). Posição é escolhida por quem chama (busca determinística no
-- cliente, `_dominio/hex.ts::hexNoRaio`) — o servidor só VALIDA, nunca
-- confia.
create or replace function duplicate_vtt_token(
  p_token_id uuid,
  p_q integer,
  p_r integer
) returns vtt_tokens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_origem vtt_tokens;
  v_novo vtt_tokens;
begin
  select * into v_origem from vtt_tokens where id = p_token_id;
  if v_origem is null then
    raise exception 'Token não encontrado.' using errcode = 'no_data_found';
  end if;
  if not is_campaign_owner(v_origem.campaign_id) then
    raise exception 'Só o narrador duplica tokens.' using errcode = 'insufficient_privilege';
  end if;

  perform vtt_validar_pegada_em(v_origem.scene_id, v_origem.tamanho, v_origem.orientacao, v_origem.pegada_personalizada, p_q, p_r, null);

  insert into vtt_tokens (
    scene_id, campaign_id, character_id, nome, sigla, lado, vertente,
    q, r, tamanho, orientacao, pegada_personalizada,
    visivel, bloqueado, retrato_url, pv_atual, pv_max, condicoes
  ) values (
    v_origem.scene_id, v_origem.campaign_id, null, v_origem.nome, v_origem.sigla, v_origem.lado, v_origem.vertente,
    p_q, p_r, v_origem.tamanho, v_origem.orientacao, v_origem.pegada_personalizada,
    v_origem.visivel, false, v_origem.retrato_url, v_origem.pv_atual, v_origem.pv_max, v_origem.condicoes
  )
  returning * into v_novo;

  return v_novo;
end;
$$;

revoke all on function duplicate_vtt_token(uuid, integer, integer) from public;
grant execute on function duplicate_vtt_token(uuid, integer, integer) to authenticated;

-- Remoção — dura, sem exclusão lógica: não há coluna "arquivado" em
-- `vtt_tokens` e criar uma só pra fingir undo seria exatamente o "não
-- ofereça undo que não existe" que o pedido probe. `character_id`
-- nunca impede a remoção (FK é `on delete set null`, não bloqueia).
create or replace function delete_vtt_token(p_token_id uuid) returns void
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
    raise exception 'Só o narrador remove tokens.' using errcode = 'insufficient_privilege';
  end if;

  delete from vtt_tokens where id = p_token_id;
end;
$$;

revoke all on function delete_vtt_token(uuid) from public;
grant execute on function delete_vtt_token(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Ping efêmero — a RPC PUBLICA o broadcast ela mesma
--    (`realtime.send`, roda como o dono da função, nunca como o
--    cliente) — diferente do canal de movimento (`0070`, cliente
--    publica direto), aqui o cliente NUNCA chama `channel.send()`. Isso
--    fecha de vez a falsificação de autor: o payload que sai sempre
--    carrega `auth.uid()` de dentro da própria RPC, nunca um valor que
--    o cliente escolheu. Rate limit por usuário+campanha, janela
--    deslizante simples (reinicia se o último ping foi há mais de 3s).
-- ---------------------------------------------------------------------

create table if not exists vtt_ping_throttle (
  user_id       uuid not null references auth.users(id) on delete cascade,
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  window_start  timestamptz not null default now(),
  count         integer not null default 0,
  primary key (user_id, campaign_id)
);

alter table vtt_ping_throttle enable row level security;
revoke all on vtt_ping_throttle from anon, authenticated;
-- Sem policy nenhuma pra `authenticated` — só a RPC (security definer)
-- toca esta tabela; não existe leitura/escrita direta pretendida.

create or replace function vtt_ping(
  p_campaign_id uuid,
  p_scene_id uuid,
  p_q integer,
  p_r integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scene vtt_scenes;
  v_uid uuid := auth.uid();
  v_q_min integer;
  v_count integer;
  v_payload jsonb;
begin
  if v_uid is null then
    raise exception 'Sessão expirada.' using errcode = 'insufficient_privilege';
  end if;
  if not is_campaign_member(p_campaign_id) then
    raise exception 'Você não é membro desta campanha.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_scene from vtt_scenes where id = p_scene_id and campaign_id = p_campaign_id;
  if v_scene is null then
    raise exception 'Cena não encontrada para esta campanha.' using errcode = 'no_data_found';
  end if;

  if p_r < 0 or p_r >= v_scene.altura then
    raise exception 'Ping fora dos limites da cena.' using errcode = 'invalid_parameter_value';
  end if;
  v_q_min := -(p_r / 2);
  if p_q < v_q_min or p_q >= v_q_min + v_scene.largura then
    raise exception 'Ping fora dos limites da cena.' using errcode = 'invalid_parameter_value';
  end if;

  insert into vtt_ping_throttle (user_id, campaign_id, window_start, count)
  values (v_uid, p_campaign_id, clock_timestamp(), 1)
  on conflict (user_id, campaign_id) do update
    set window_start = case when clock_timestamp() - vtt_ping_throttle.window_start > interval '3 seconds'
                        then clock_timestamp() else vtt_ping_throttle.window_start end,
        count = case when clock_timestamp() - vtt_ping_throttle.window_start > interval '3 seconds'
                 then 1 else vtt_ping_throttle.count + 1 end
  returning count into v_count;

  if v_count > 5 then
    return false;
  end if;

  v_payload := jsonb_build_object(
    'v', 1,
    'id', gen_random_uuid()::text,
    'campaignId', p_campaign_id::text,
    'sceneId', p_scene_id::text,
    'autorId', v_uid::text,
    'q', p_q,
    'r', p_r,
    'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint
  );

  perform realtime.send(v_payload, 'ping', 'campaign:' || p_campaign_id::text || ':vtt:ping', true);
  return true;
end;
$$;

revoke all on function vtt_ping(uuid, uuid, integer, integer) from public;
grant execute on function vtt_ping(uuid, uuid, integer, integer) to authenticated;

-- Autorização de CANAL (quem pode SUBSCREVER pra receber) — mesmo
-- princípio da 0070/0062: Realtime não herda RLS de tabela nenhuma pra
-- Broadcast, é uma autorização própria sobre `realtime.messages`.
create policy "campaign_members_use_ping_channel"
on "realtime"."messages"
for all
to authenticated
using (
  is_campaign_member(
    (regexp_match(realtime.topic(), '^campaign:([0-9a-fA-F-]{36}):vtt:ping$'))[1]::uuid
  )
)
with check (
  is_campaign_member(
    (regexp_match(realtime.topic(), '^campaign:([0-9a-fA-F-]{36}):vtt:ping$'))[1]::uuid
  )
);
