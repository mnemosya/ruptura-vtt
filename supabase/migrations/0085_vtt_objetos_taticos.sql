-- =====================================================================
-- 0085 — Objetos táticos da cena
--
-- Um objeto é uma ENTIDADE com identidade própria (nome, preset, PD,
-- cobertura), não um punhado de células pintadas de "bloqueado". É essa
-- diferença que permite nomear, dar cobertura, danificar e destruir.
--
-- FISCALIZAÇÃO (decisão D1/D3 do plano): bloqueio vindo de OBJETO passa
-- a valer exatamente onde bloqueio de TERRENO já valia — nem mais, nem
-- menos. Concretamente isso significa:
--   • `vtt_validar_pegada_em` (criação/edição/posicionamento) recusa;
--   • `rotacionar_vtt_token` recusa;
--   • `move_vtt_token` NÃO recusa — deslocar um token já existente
--     continua CONSULTIVO em relação a bloqueio, exatamente como a
--     0080 estabeleceu de propósito ("habilidades, voo, teleporte e
--     decisão do narrador podem ignorar uma restrição normal"). Objeto
--     não é exceção a essa regra; ele só produz o MESMO fato mecânico
--     que uma célula pintada.
--
-- As duas checagens de bloqueio que existiam duplicadas (uma no helper,
-- outra inline na rotação) passam a chamar `vtt_celula_bloqueada`, para
-- a precedência morar num lugar só.
--
-- FORA daqui de propósito, seguindo o mesmo princípio documentado na
-- 0065 (não reservar vocabulário que nenhuma regra consome ainda):
--   • `altura_m` e `bloqueia_visao` — só ganham sentido junto da regra
--     de cobertura/linha de visão, que ainda não existe;
--   • elevação de terreno — idem.
-- =====================================================================

begin;

-- ── Tabelas ─────────────────────────────────────────────────────────

create table if not exists vtt_objects (
  id                  uuid primary key default gen_random_uuid(),
  scene_id            uuid not null references vtt_scenes(id) on delete cascade,
  campaign_id         uuid not null references campaigns(id) on delete cascade,
  nome                text not null check (length(btrim(nome)) between 1 and 60),
  preset              text not null check (preset in (
                        'muro', 'porta', 'caixa', 'entulho', 'mesa',
                        'veiculo', 'barricada', 'coluna', 'grade', 'personalizado')),
  -- Mecânica de passagem. `entulho` é o caso que prova a separação:
  -- não bloqueia, mas encarece — por isso são dois campos, não um enum.
  bloqueia_movimento  boolean not null default true,
  terreno_projetado   text null check (terreno_projetado is null or terreno_projetado = 'dificil'),
  -- Informação tática mostrada ao grupo; a REGRA de cobertura continua
  -- consultiva (o narrador decide), então nada aqui é aplicado sozinho.
  grau_cobertura      text null check (grau_cobertura is null or grau_cobertura in ('parcial', 'maior', 'total')),
  categoria           text null check (categoria is null or categoria in ('fragil', 'media', 'resistente')),
  pd                  integer null check (pd is null or pd >= 0),
  pd_max              integer null check (pd_max is null or pd_max > 0),
  visivel             boolean not null default true,
  travado             boolean not null default false,
  revision            integer not null default 1,
  criador_id          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint vtt_objects_pd_coerente check (
    (pd is null and pd_max is null) or (pd is not null and pd_max is not null and pd <= pd_max)
  )
);

-- Cena e campanha precisam concordar — mesma proteção que a 0066 deu a
-- `vtt_terrain`: sem isto, uma cena de outra campanha poderia ser
-- referenciada e a RLS por campanha viraria letra morta.
alter table vtt_objects drop constraint if exists vtt_objects_scene_campaign_fk;
alter table vtt_objects
  add constraint vtt_objects_scene_campaign_fk
  foreign key (scene_id, campaign_id) references vtt_scenes(id, campaign_id) on delete cascade;

-- Células NORMALIZADAS (decisão D2): a fiscalização de bloqueio roda
-- dentro de laço por célula, em caminho quente — `jsonb` ali viraria
-- varredura de containment. Com índice em (scene_id, q, r) a checagem
-- fica simétrica à de `vtt_terrain`.
create table if not exists vtt_object_cells (
  object_id uuid not null references vtt_objects(id) on delete cascade,
  scene_id  uuid not null references vtt_scenes(id) on delete cascade,
  q         integer not null,
  r         integer not null,
  primary key (object_id, q, r)
);

create index if not exists vtt_object_cells_cena_celula_idx on vtt_object_cells (scene_id, q, r);
create index if not exists vtt_objects_cena_idx on vtt_objects (scene_id);

-- ── Precedência num lugar só ────────────────────────────────────────

-- Objeto OCULTO continua bloqueando (decisão D6): esconder é segredo do
-- narrador, não licença para atravessar uma parede. Quem chama devolve
-- "posição indisponível" sem revelar o motivo.
create or replace function vtt_celula_bloqueada(p_scene_id uuid, p_q integer, p_r integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from vtt_terrain t
    where t.scene_id = p_scene_id and t.q = p_q and t.r = p_r and t.tipo = 'bloqueado'
  ) or exists (
    select 1
    from vtt_object_cells oc
    join vtt_objects o on o.id = oc.object_id
    where oc.scene_id = p_scene_id and oc.q = p_q and oc.r = p_r
      and o.bloqueia_movimento
  );
$$;

revoke all on function vtt_celula_bloqueada(uuid, integer, integer) from public, anon;
grant execute on function vtt_celula_bloqueada(uuid, integer, integer) to authenticated;

-- ── Fiscalização: helper compartilhado (criação/edição/posicionamento) ──
-- Mesma assinatura e mesmo corpo da 0073; muda SÓ a checagem de
-- bloqueio, que passa a considerar objetos via `vtt_celula_bloqueada`.
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
    if vtt_celula_bloqueada(p_scene_id, v_cell.q, v_cell.r) then
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

-- ── Fiscalização: rotação ───────────────────────────────────────────
-- Idêntica à 0073, trocando só o `exists` inline de terreno pelo helper
-- (era a segunda cópia da mesma regra).
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

-- ── Leitura ─────────────────────────────────────────────────────────
-- Projeção do mapa: participante da campanha lê os objetos VISÍVEIS; o
-- narrador lê todos. Células vêm agregadas para o cliente montar o mapa
-- tático sem uma segunda consulta.
create or replace function read_vtt_scene_objects(p_scene_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_scene vtt_scenes;
  v_result jsonb;
begin
  select * into v_scene from vtt_scenes where id = p_scene_id;
  if v_scene is null or not is_campaign_member(v_scene.campaign_id) then
    raise exception 'Cena não encontrada ou sem acesso.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(jsonb_agg(item order by item ->> 'id'), '[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
      'id', o.id,
      'scene_id', o.scene_id,
      'nome', o.nome,
      'preset', o.preset,
      'bloqueia_movimento', o.bloqueia_movimento,
      'terreno_projetado', o.terreno_projetado,
      'grau_cobertura', o.grau_cobertura,
      'categoria', o.categoria,
      'pd', o.pd,
      'pd_max', o.pd_max,
      'visivel', o.visivel,
      'travado', o.travado,
      'revision', o.revision,
      'celulas', coalesce((
        select jsonb_agg(jsonb_build_object('q', c.q, 'r', c.r) order by c.q, c.r)
        from vtt_object_cells c where c.object_id = o.id
      ), '[]'::jsonb)
    ) as item
    from vtt_objects o
    where o.scene_id = p_scene_id
      and (o.visivel or is_campaign_owner(o.campaign_id))
  ) s;

  return v_result;
end;
$$;

revoke all on function read_vtt_scene_objects(uuid) from public, anon;
grant execute on function read_vtt_scene_objects(uuid) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────
-- Escrita SÓ por RPC `security definer` (nenhuma policy de write, e os
-- grants de escrita direta ficam revogados) — mesma disciplina de
-- `vtt_tokens` depois da 0066/0073.
alter table vtt_objects enable row level security;
alter table vtt_object_cells enable row level security;

drop policy if exists vtt_objects_select on vtt_objects;
create policy vtt_objects_select on vtt_objects
  for select to authenticated
  using (is_campaign_member(campaign_id) and (visivel or is_campaign_owner(campaign_id)));

drop policy if exists vtt_object_cells_select on vtt_object_cells;
create policy vtt_object_cells_select on vtt_object_cells
  for select to authenticated
  using (exists (
    select 1 from vtt_objects o
    where o.id = object_id
      and is_campaign_member(o.campaign_id)
      and (o.visivel or is_campaign_owner(o.campaign_id))
  ));

revoke all on vtt_objects from authenticated, anon;
revoke all on vtt_object_cells from authenticated, anon;
grant select on vtt_objects to authenticated;
grant select on vtt_object_cells to authenticated;

-- ── Realtime ────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['vtt_objects', 'vtt_object_cells'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

alter table vtt_objects      replica identity full;
alter table vtt_object_cells replica identity full;

commit;
