-- =====================================================================
-- 0081 — Áreas de efeito do VTT (Esfera, Domo, Aura, Linha, Faixa,
-- Parede, Cubo, Cone e Área personalizada).
--
-- ESCOPO, EXPLICITAMENTE: geometria e informação. Nenhuma área aqui
-- aplica dano, cura, condição, vantagem, teste, salvamento, bloqueio de
-- movimento, bloqueio de ataque, linha de visão, cobertura ou colisão —
-- nem mesmo a Parede, que nesta rodada é só uma barreira DESENHADA. A
-- altura fica persistida em metros justamente pra que uma camada
-- mecânica futura possa ser construída sem migrar dado de novo.
--
-- O QUE É CANÔNICO NO BANCO: os PARÂMETROS da geometria — nunca um
-- desenho em pixels, nunca uma lista congelada de tokens afetados,
-- nunca um resultado dependente de zoom, nunca uma aproximação por
-- hexes. Células e tokens afetados são SEMPRE derivados no cliente a
-- partir destes parâmetros (`_dominio/areaEfeito.ts`), então mover um
-- token, girar a pegada ou trocar de cena recalcula sozinho.
--
-- COORDENADAS: axial FRACIONÁRIO (`numeric`), a mesma convenção (q, r)
-- de `vtt_tokens`/`vtt_terrain`/`vtt_marks`, só que contínua — a
-- origem de uma área não precisa cair no centro de uma célula. Isso é
-- o que mantém a geometria independente de zoom, de pan e do raio de
-- hexágono que a renderização escolher. Distâncias em METROS
-- (1 metro = 1 célula de distância, `16 COMBATE` → ESPAÇOS E MEDIDAS),
-- direção em GRAUS no plano do mapa.
--
-- AUTORIZAÇÃO: narrador sempre; jogador SÓ com autorização explícita,
-- registrada em `vtt_area_permissoes` (concedida pelo narrador) — e,
-- mesmo autorizado, um jogador só edita/apaga o que ele mesmo criou.
-- Como em `vtt_tokens` depois da 0066/0073, `authenticated` recebe
-- apenas `select`: toda escrita passa por RPC `security definer` que
-- reautoriza, revalida os parâmetros e cuida da revisão otimista.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Autorização explícita de jogador
-- ---------------------------------------------------------------------
create table if not exists vtt_area_permissoes (
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  concedido_por uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

comment on table vtt_area_permissoes is 'Jogadores com autorização EXPLÍCITA do narrador para criar áreas de efeito nesta campanha. Ausência de linha = sem autorização.';

create or replace function pode_gerenciar_vtt_areas(p_campaign_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select is_campaign_owner(p_campaign_id, check_user_id)
     or exists (
       select 1 from vtt_area_permissoes p
       where p.campaign_id = p_campaign_id and p.user_id = check_user_id
     );
$$;

revoke all on function pode_gerenciar_vtt_areas(uuid, uuid) from public;
grant execute on function pode_gerenciar_vtt_areas(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Áreas
-- ---------------------------------------------------------------------
create table if not exists vtt_areas (
  id             uuid primary key default gen_random_uuid(),
  scene_id       uuid not null references vtt_scenes(id) on delete cascade,
  -- Denormalizado como em `vtt_tokens`: é o filtro do canal de Realtime
  -- e o alvo das policies, sem join dentro da policy.
  campaign_id    uuid not null references campaigns(id) on delete cascade,
  tipo           text not null check (tipo in ('esfera', 'domo', 'aura', 'linha', 'faixa', 'parede', 'cubo', 'cone', 'personalizada')),

  -- Geometria canônica -------------------------------------------------
  origem_q       numeric,
  origem_r       numeric,
  direcao_graus  numeric check (direcao_graus is null or (direcao_graus >= 0 and direcao_graus < 360)),
  raio_m         numeric check (raio_m is null or (raio_m > 0 and raio_m <= 60)),
  -- Cone usa `comprimento_m` como ALCANCE (uma coluna, um significado
  -- por tipo, documentado — nunca duas colunas pra mesma medida).
  comprimento_m  numeric check (comprimento_m is null or (comprimento_m > 0 and comprimento_m <= 120)),
  largura_m      numeric check (largura_m is null or (largura_m > 0 and largura_m <= 60)),
  altura_m       numeric check (altura_m is null or (altura_m >= 0 and altura_m <= 60)),
  lado_m         numeric check (lado_m is null or (lado_m > 0 and lado_m <= 60)),
  abertura_graus numeric check (abertura_graus is null or (abertura_graus > 0 and abertura_graus < 180)),
  -- Nível/superfície de origem em metros. O mapa é uma projeção
  -- superior e o projeto NÃO tem coordenada vertical: isto é
  -- informação preservada, nunca uma regra aplicada.
  nivel_origem_m numeric check (nivel_origem_m is null or (nivel_origem_m >= -60 and nivel_origem_m <= 60)),
  modo_linha     text check (modo_linha is null or modo_linha in ('uma_celula', 'traco_fino')),
  -- Percurso da Parede / vértices da Área personalizada: [{q,r}, …] em axial fracionário.
  pontos         jsonb,
  -- Aura: vínculo obrigatório com o token de origem. `on delete
  -- cascade` — a aura NÃO pode continuar apontando pra um token que
  -- não existe mais.
  token_id       uuid references vtt_tokens(id) on delete cascade,

  -- Apresentação -------------------------------------------------------
  cor            text not null default 'ciano' check (cor in ('ciano', 'ambar', 'verde', 'vermelho', 'roxo', 'branco')),
  opacidade      numeric(3, 2) not null default 0.35 check (opacidade between 0.05 and 1.0),
  rotulo         text check (rotulo is null or char_length(rotulo) <= 80),
  visivel        boolean not null default true,

  criador_id     uuid not null references auth.users(id) on delete cascade,
  revision       integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Cada tipo exige exatamente os parâmetros que a sua geometria usa —
  -- e as REGRAS FIXAS do sistema viram invariantes de banco, não
  -- convenção de interface: Cone sempre 45°, Parede sempre 1 metro de
  -- largura, Cubo sempre com altura igual ao lado.
  constraint vtt_areas_geometria_por_tipo check (
    case tipo
      when 'esfera' then origem_q is not null and origem_r is not null and raio_m is not null
      when 'domo'   then origem_q is not null and origem_r is not null and raio_m is not null
      when 'aura'   then token_id is not null and raio_m is not null
      when 'linha'  then origem_q is not null and origem_r is not null and direcao_graus is not null
                         and comprimento_m is not null and modo_linha is not null
      when 'faixa'  then origem_q is not null and origem_r is not null and direcao_graus is not null
                         and comprimento_m is not null and largura_m is not null
      when 'parede' then pontos is not null and jsonb_typeof(pontos) = 'array' and jsonb_array_length(pontos) >= 2
                         and altura_m is not null and largura_m = 1
      when 'cubo'   then origem_q is not null and origem_r is not null and direcao_graus is not null
                         and lado_m is not null and altura_m = lado_m
      when 'cone'   then origem_q is not null and origem_r is not null and direcao_graus is not null
                         and comprimento_m is not null and abertura_graus = 45
      when 'personalizada' then pontos is not null and jsonb_typeof(pontos) = 'array' and jsonb_array_length(pontos) >= 3
      else false
    end
  )
);

create index if not exists vtt_areas_scene_idx on vtt_areas (scene_id);
create index if not exists vtt_areas_campaign_idx on vtt_areas (campaign_id);
create index if not exists vtt_areas_token_idx on vtt_areas (token_id) where token_id is not null;

comment on column vtt_areas.origem_q is 'Origem em coordenada axial FRACIONÁRIA (contínua) — nunca arredondada pra célula.';
comment on column vtt_areas.comprimento_m is 'Comprimento em metros. No tipo `cone`, é o ALCANCE.';
comment on column vtt_areas.altura_m is 'Altura em metros dos formatos tridimensionais (parede, cubo, e opcionalmente esfera/domo). Informativa nesta fase — nenhuma regra 3D é aplicada.';
comment on column vtt_areas.token_id is 'Aura: token de origem. A geometria é DERIVADA da posição/pegada atual dele — a aura nunca é regravada quando o token se move.';

-- ---------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------
alter table vtt_areas enable row level security;
alter table vtt_area_permissoes enable row level security;

revoke all on vtt_areas from anon, authenticated;
revoke all on vtt_area_permissoes from anon, authenticated;

-- Só leitura pra `authenticated`: escrita passa exclusivamente pelas
-- RPCs `security definer` abaixo (mesmo desenho de `vtt_tokens`).
grant select on vtt_areas to authenticated;
grant select on vtt_area_permissoes to authenticated;

-- Visibilidade de aura: uma aura presa a um token OCULTO revelaria a
-- posição desse token. Função dedicada (`security definer`) espelhando
-- `vtt_tokens_select` da 0065 — nunca depende de RLS aninhada dentro
-- de outra policy.
create or replace function vtt_token_visivel_para(p_token_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from vtt_tokens t
    where t.id = p_token_id
      and is_campaign_member(t.campaign_id, check_user_id)
      and (t.visivel or is_campaign_owner(t.campaign_id, check_user_id))
  );
$$;

revoke all on function vtt_token_visivel_para(uuid, uuid) from public;
grant execute on function vtt_token_visivel_para(uuid, uuid) to authenticated;

drop policy if exists vtt_areas_select on vtt_areas;
create policy vtt_areas_select on vtt_areas
  for select to authenticated
  using (
    is_campaign_member(campaign_id)
    and (visivel or is_campaign_owner(campaign_id) or criador_id = (select auth.uid()))
    and (tipo <> 'aura' or token_id is null or vtt_token_visivel_para(token_id))
  );

drop policy if exists vtt_area_permissoes_select on vtt_area_permissoes;
create policy vtt_area_permissoes_select on vtt_area_permissoes
  for select to authenticated
  using (is_campaign_member(campaign_id));

-- ---------------------------------------------------------------------
-- 4. Validação dos parâmetros (servidor, nunca só a interface)
-- ---------------------------------------------------------------------
create or replace function vtt_area_pontos_validos(p_pontos jsonb, p_minimo integer)
returns boolean
language sql
immutable
as $$
  select p_pontos is not null
     and jsonb_typeof(p_pontos) = 'array'
     and jsonb_array_length(p_pontos) between p_minimo and 64
     and not exists (
       select 1 from jsonb_array_elements(p_pontos) e
       where jsonb_typeof(e) <> 'object'
          or jsonb_typeof(e -> 'q') <> 'number'
          or jsonb_typeof(e -> 'r') <> 'number'
     );
$$;

/**
 * Reautoriza e revalida TUDO que uma área grava. Chamada por
 * `create_vtt_area` e `update_vtt_area` — as duas passam pela mesma
 * porta, então não existe caminho em que criar valide mais que editar.
 */
create or replace function vtt_validar_area(
  p_campaign_id uuid,
  p_scene_id uuid,
  p_tipo text,
  p_token_id uuid,
  p_pontos jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not pode_gerenciar_vtt_areas(p_campaign_id) then
    raise exception 'Você não tem autorização para criar ou alterar áreas nesta campanha.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from vtt_scenes where id = p_scene_id and campaign_id = p_campaign_id) then
    raise exception 'Cena não encontrada para esta campanha.' using errcode = 'no_data_found';
  end if;

  if p_tipo = 'aura' then
    if p_token_id is null then
      raise exception 'Uma aura precisa de um token de origem.' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from vtt_tokens t where t.id = p_token_id and t.scene_id = p_scene_id) then
      raise exception 'O token de origem da aura não está nesta cena.' using errcode = 'no_data_found';
    end if;
  end if;

  if p_tipo = 'parede' and not vtt_area_pontos_validos(p_pontos, 2) then
    raise exception 'Percurso de parede inválido.' using errcode = 'check_violation';
  end if;
  if p_tipo = 'personalizada' and not vtt_area_pontos_validos(p_pontos, 3) then
    raise exception 'Polígono personalizado inválido.' using errcode = 'check_violation';
  end if;
end;
$$;

revoke all on function vtt_validar_area(uuid, uuid, text, uuid, jsonb) from public;
grant execute on function vtt_validar_area(uuid, uuid, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Canal de invalidação sanitizada
--
-- Mesmo problema (e mesma solução) da 0075 para tokens: quando uma
-- área deixa de satisfazer a RLS de quem assina (o narrador OCULTA uma
-- área que o jogador via), o Realtime nunca entrega esse UPDATE a esse
-- assinante — a linha nova falha a checagem no momento da entrega e
-- não vira um DELETE sintético. Este canal avisa que "a lista
-- autorizada de áreas desta cena mudou", SEM nenhum dado da área;
-- quem recebe relê pela mesma leitura sujeita à RLS.
-- ---------------------------------------------------------------------
create or replace function vtt_areas_changed_channel_autorizado(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from vtt_scenes s
    where s.id = (regexp_match(p_topic, '^campaign:([0-9a-fA-F-]{36}):scene:([0-9a-fA-F-]{36}):vtt:areas-changed$'))[2]::uuid
      and s.campaign_id = (regexp_match(p_topic, '^campaign:([0-9a-fA-F-]{36}):scene:([0-9a-fA-F-]{36}):vtt:areas-changed$'))[1]::uuid
      and is_campaign_member(s.campaign_id)
  );
$$;

revoke all on function vtt_areas_changed_channel_autorizado(text) from public;
grant execute on function vtt_areas_changed_channel_autorizado(text) to authenticated;

drop policy if exists "campaign_members_receive_areas_changed_channel" on "realtime"."messages";
-- Só SELECT: sem policy de INSERT, `channel.send()` direto do cliente é
-- recusado pelo Postgres — quem publica é sempre a RPC.
create policy "campaign_members_receive_areas_changed_channel"
on "realtime"."messages"
for select
to authenticated
using (vtt_areas_changed_channel_autorizado(realtime.topic()));

create or replace function vtt_publicar_areas_alteradas(p_campaign_id uuid, p_scene_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  select realtime.send(
    jsonb_build_object(
      'v', 1,
      'campaignId', p_campaign_id::text,
      'sceneId', p_scene_id::text,
      'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint
    ),
    'areas_changed',
    'campaign:' || p_campaign_id::text || ':scene:' || p_scene_id::text || ':vtt:areas-changed',
    true
  );
$$;

revoke all on function vtt_publicar_areas_alteradas(uuid, uuid) from public;

-- ---------------------------------------------------------------------
-- 6. RPCs de escrita
-- ---------------------------------------------------------------------
create or replace function create_vtt_area(
  p_scene_id uuid,
  p_campaign_id uuid,
  p_tipo text,
  p_origem_q numeric,
  p_origem_r numeric,
  p_direcao_graus numeric,
  p_raio_m numeric,
  p_comprimento_m numeric,
  p_largura_m numeric,
  p_altura_m numeric,
  p_lado_m numeric,
  p_nivel_origem_m numeric,
  p_modo_linha text,
  p_pontos jsonb,
  p_token_id uuid,
  p_cor text,
  p_opacidade numeric,
  p_rotulo text,
  p_visivel boolean
) returns vtt_areas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_area vtt_areas;
begin
  perform vtt_validar_area(p_campaign_id, p_scene_id, p_tipo, p_token_id, p_pontos);

  insert into vtt_areas (
    scene_id, campaign_id, tipo,
    origem_q, origem_r, direcao_graus, raio_m, comprimento_m, largura_m, altura_m, lado_m,
    abertura_graus, nivel_origem_m, modo_linha, pontos, token_id,
    cor, opacidade, rotulo, visivel, criador_id
  ) values (
    p_scene_id, p_campaign_id, p_tipo,
    p_origem_q, p_origem_r, p_direcao_graus, p_raio_m, p_comprimento_m,
    -- Regras FIXAS aplicadas pelo servidor, nunca aceitas do cliente:
    case when p_tipo = 'parede' then 1 else p_largura_m end,
    case when p_tipo = 'cubo' then p_lado_m else p_altura_m end,
    p_lado_m,
    case when p_tipo = 'cone' then 45 else null end,
    p_nivel_origem_m, p_modo_linha, p_pontos, case when p_tipo = 'aura' then p_token_id else null end,
    coalesce(p_cor, 'ciano'), coalesce(p_opacidade, 0.35), nullif(btrim(coalesce(p_rotulo, '')), ''), coalesce(p_visivel, true),
    auth.uid()
  )
  returning * into v_area;

  perform vtt_publicar_areas_alteradas(p_campaign_id, p_scene_id);
  return v_area;
end;
$$;

/**
 * Edição — geometria E apresentação numa transação só, com revisão
 * otimista. Nunca troca de cena/campanha/criador (um jogador não pode
 * forjar nenhum dos três: eles simplesmente não são parâmetros).
 */
create or replace function update_vtt_area(
  p_area_id uuid,
  p_origem_q numeric,
  p_origem_r numeric,
  p_direcao_graus numeric,
  p_raio_m numeric,
  p_comprimento_m numeric,
  p_largura_m numeric,
  p_altura_m numeric,
  p_lado_m numeric,
  p_nivel_origem_m numeric,
  p_modo_linha text,
  p_pontos jsonb,
  p_token_id uuid,
  p_cor text,
  p_opacidade numeric,
  p_rotulo text,
  p_visivel boolean,
  p_expected_revision integer
) returns vtt_areas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_area vtt_areas;
begin
  select * into v_area from vtt_areas where id = p_area_id for update;
  if v_area is null then
    raise exception 'Área não encontrada.' using errcode = 'no_data_found';
  end if;
  perform vtt_validar_area(v_area.campaign_id, v_area.scene_id, v_area.tipo, coalesce(p_token_id, v_area.token_id), p_pontos);
  -- Jogador autorizado só mexe no que ele mesmo criou; narrador mexe em tudo.
  if not is_campaign_owner(v_area.campaign_id) and v_area.criador_id <> auth.uid() then
    raise exception 'Você só pode alterar as áreas que você criou.' using errcode = 'insufficient_privilege';
  end if;
  if v_area.revision <> p_expected_revision then
    raise exception 'Esta área mudou em outra sessão. Recarregue antes de editar.' using errcode = 'serialization_failure';
  end if;

  update vtt_areas set
    origem_q = p_origem_q,
    origem_r = p_origem_r,
    direcao_graus = p_direcao_graus,
    raio_m = p_raio_m,
    comprimento_m = p_comprimento_m,
    largura_m = case when v_area.tipo = 'parede' then 1 else p_largura_m end,
    altura_m = case when v_area.tipo = 'cubo' then p_lado_m else p_altura_m end,
    lado_m = p_lado_m,
    nivel_origem_m = p_nivel_origem_m,
    modo_linha = p_modo_linha,
    pontos = p_pontos,
    token_id = case when v_area.tipo = 'aura' then coalesce(p_token_id, v_area.token_id) else null end,
    cor = coalesce(p_cor, v_area.cor),
    opacidade = coalesce(p_opacidade, v_area.opacidade),
    rotulo = nullif(btrim(coalesce(p_rotulo, '')), ''),
    visivel = coalesce(p_visivel, v_area.visivel),
    revision = v_area.revision + 1,
    updated_at = now()
  where id = p_area_id
  returning * into v_area;

  perform vtt_publicar_areas_alteradas(v_area.campaign_id, v_area.scene_id);
  return v_area;
end;
$$;

/**
 * Duplica com um deslocamento DETERMINÍSTICO de 1 célula pra leste
 * (`q + 1`) — nunca sobreposta exatamente à original, que seria
 * indistinguível na tela. Aura é a exceção: ela é presa ao token, então
 * a cópia continua no mesmo token.
 */
create or replace function duplicate_vtt_area(p_area_id uuid)
returns vtt_areas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_orig vtt_areas;
  v_nova vtt_areas;
begin
  select * into v_orig from vtt_areas where id = p_area_id;
  if v_orig is null then
    raise exception 'Área não encontrada.' using errcode = 'no_data_found';
  end if;
  if not pode_gerenciar_vtt_areas(v_orig.campaign_id) then
    raise exception 'Você não tem autorização para criar áreas nesta campanha.' using errcode = 'insufficient_privilege';
  end if;

  insert into vtt_areas (
    scene_id, campaign_id, tipo,
    origem_q, origem_r, direcao_graus, raio_m, comprimento_m, largura_m, altura_m, lado_m,
    abertura_graus, nivel_origem_m, modo_linha, pontos, token_id,
    cor, opacidade, rotulo, visivel, criador_id
  ) values (
    v_orig.scene_id, v_orig.campaign_id, v_orig.tipo,
    case when v_orig.origem_q is null then null else v_orig.origem_q + 1 end,
    v_orig.origem_r, v_orig.direcao_graus, v_orig.raio_m, v_orig.comprimento_m, v_orig.largura_m, v_orig.altura_m, v_orig.lado_m,
    v_orig.abertura_graus, v_orig.nivel_origem_m, v_orig.modo_linha,
    case
      when v_orig.pontos is null then null
      else (select jsonb_agg(jsonb_build_object('q', (e ->> 'q')::numeric + 1, 'r', (e ->> 'r')::numeric))
            from jsonb_array_elements(v_orig.pontos) e)
    end,
    v_orig.token_id,
    v_orig.cor, v_orig.opacidade, v_orig.rotulo, v_orig.visivel, auth.uid()
  )
  returning * into v_nova;

  perform vtt_publicar_areas_alteradas(v_nova.campaign_id, v_nova.scene_id);
  return v_nova;
end;
$$;

create or replace function delete_vtt_area(p_area_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_area vtt_areas;
begin
  select * into v_area from vtt_areas where id = p_area_id;
  if v_area is null then
    return; -- já não existe: apagar de novo é sucesso, não erro
  end if;
  if not pode_gerenciar_vtt_areas(v_area.campaign_id) then
    raise exception 'Você não tem autorização para remover áreas nesta campanha.' using errcode = 'insufficient_privilege';
  end if;
  if not is_campaign_owner(v_area.campaign_id) and v_area.criador_id <> auth.uid() then
    raise exception 'Você só pode remover as áreas que você criou.' using errcode = 'insufficient_privilege';
  end if;

  delete from vtt_areas where id = p_area_id;
  perform vtt_publicar_areas_alteradas(v_area.campaign_id, v_area.scene_id);
end;
$$;

/** Narrador concede ou revoga a autorização explícita de um jogador. */
create or replace function set_vtt_area_permissao(p_campaign_id uuid, p_user_id uuid, p_permitir boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_campaign_owner(p_campaign_id) then
    raise exception 'Só o narrador autoriza jogadores a criar áreas.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from campaign_members m where m.campaign_id = p_campaign_id and m.user_id = p_user_id) then
    raise exception 'Este usuário não é membro da campanha.' using errcode = 'no_data_found';
  end if;

  if p_permitir then
    insert into vtt_area_permissoes (campaign_id, user_id, concedido_por)
    values (p_campaign_id, p_user_id, auth.uid())
    on conflict (campaign_id, user_id) do nothing;
  else
    delete from vtt_area_permissoes where campaign_id = p_campaign_id and user_id = p_user_id;
  end if;
  return p_permitir;
end;
$$;

revoke all on function create_vtt_area(uuid, uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, jsonb, uuid, text, numeric, text, boolean) from public;
revoke all on function update_vtt_area(uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, jsonb, uuid, text, numeric, text, boolean, integer) from public;
revoke all on function duplicate_vtt_area(uuid) from public;
revoke all on function delete_vtt_area(uuid) from public;
revoke all on function set_vtt_area_permissao(uuid, uuid, boolean) from public;

grant execute on function create_vtt_area(uuid, uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, jsonb, uuid, text, numeric, text, boolean) to authenticated;
grant execute on function update_vtt_area(uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, jsonb, uuid, text, numeric, text, boolean, integer) to authenticated;
grant execute on function duplicate_vtt_area(uuid) to authenticated;
grant execute on function delete_vtt_area(uuid) to authenticated;
grant execute on function set_vtt_area_permissao(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Realtime
--
-- `REPLICA IDENTITY FULL` pelo mesmo motivo da 0065: o filtro do canal
-- é `campaign_id=eq.<id>`, e num DELETE o registro "old" do WAL só
-- traria a PK com a identidade padrão — sem FULL, apagar uma área nunca
-- casaria o filtro e não chegaria aos outros participantes.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vtt_areas'
  ) then
    execute 'alter publication supabase_realtime add table public.vtt_areas';
  end if;
end $$;

alter table vtt_areas replica identity full;

commit;
