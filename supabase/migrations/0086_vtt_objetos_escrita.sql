-- =====================================================================
-- 0086 — Escrita de objetos táticos (RPCs estreitas)
--
-- Autorização: NARRADOR da campanha, igual a terreno (`vtt_terrain`,
-- 0065) — objeto é mobília de cena, não conteúdo de jogador. Nenhuma
-- policy de escrita nas tabelas; tudo passa por estas funções
-- `security definer`, mesma disciplina de `vtt_tokens`/`vtt_areas`.
--
-- Concorrência: `revision` otimista com errcode `check_violation`, a
-- convenção das RPCs de token (`rotacionar_vtt_token`).
--
-- `travado` protege contra edição ACIDENTAL de geometria: bloqueia
-- `move_vtt_object` e `delete_vtt_object`, mas NÃO `update_vtt_object`
-- — é por lá que se destrava. Travar não é autorização (o narrador
-- sempre pode destravar), é um cinto de segurança.
--
-- Objeto sobre célula ocupada por token é PERMITIDO de propósito
-- (decisão D7: autoridade do narrador ao montar a cena). O token
-- consegue sair porque `move_vtt_token` nunca checa a célula de origem.
-- =====================================================================

begin;

-- ── Projeção de UM objeto ───────────────────────────────────────────
-- Mesmo formato de `read_vtt_scene_objects` (0085), para o cliente ter
-- um mapeador só. Sem checagem de acesso: as RPCs abaixo já a fizeram.
create or replace function vtt_objeto_json(p_object_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
  )
  from vtt_objects o where o.id = p_object_id;
$$;

revoke all on function vtt_objeto_json(uuid) from public, anon;

-- ── Validação + substituição das células ────────────────────────────
-- Limite de 64 células: mesma guarda de abuso que `vtt_areas` usa nos
-- pontos (0081) — não é regra de jogo, é teto de payload.
create or replace function vtt_definir_celulas_objeto(p_object_id uuid, p_scene_id uuid, p_celulas jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scene vtt_scenes;
  v_item jsonb;
  v_q integer;
  v_r integer;
  v_q_min integer;
  v_n integer;
begin
  if p_celulas is null or jsonb_typeof(p_celulas) <> 'array' then
    raise exception 'Células do objeto inválidas.' using errcode = 'invalid_parameter_value';
  end if;
  v_n := jsonb_array_length(p_celulas);
  if v_n < 1 or v_n > 64 then
    raise exception 'Objeto precisa de 1 a 64 células (recebeu %).', v_n using errcode = 'invalid_parameter_value';
  end if;

  select * into v_scene from vtt_scenes where id = p_scene_id;
  if v_scene is null then
    raise exception 'Cena não encontrada.' using errcode = 'no_data_found';
  end if;

  delete from vtt_object_cells where object_id = p_object_id;

  for v_item in select value from jsonb_array_elements(p_celulas) loop
    if jsonb_typeof(v_item) <> 'object' or not (v_item ? 'q') or not (v_item ? 'r') then
      raise exception 'Célula do objeto malformada.' using errcode = 'invalid_parameter_value';
    end if;
    if (v_item ->> 'q') !~ '^-?[0-9]+$' or (v_item ->> 'r') !~ '^-?[0-9]+$' then
      raise exception 'Célula do objeto precisa de coordenadas inteiras.' using errcode = 'invalid_parameter_value';
    end if;
    v_q := (v_item ->> 'q')::integer;
    v_r := (v_item ->> 'r')::integer;

    -- Mesmos limites de `vtt_validar_pegada_em`: nunca deixar objeto
    -- fora do mapa, senão ele bloquearia célula que ninguém alcança.
    if v_r < 0 or v_r >= v_scene.altura then
      raise exception 'Objeto sai dos limites do mapa (célula %, %).', v_q, v_r using errcode = 'invalid_parameter_value';
    end if;
    v_q_min := -(v_r / 2);
    if v_q < v_q_min or v_q >= v_q_min + v_scene.largura then
      raise exception 'Objeto sai dos limites do mapa (célula %, %).', v_q, v_r using errcode = 'invalid_parameter_value';
    end if;

    -- `on conflict` absorve célula repetida no payload sem estourar.
    insert into vtt_object_cells (object_id, scene_id, q, r)
    values (p_object_id, p_scene_id, v_q, v_r)
    on conflict do nothing;
  end loop;
end;
$$;

revoke all on function vtt_definir_celulas_objeto(uuid, uuid, jsonb) from public, anon;

-- ── Guarda de autorização ───────────────────────────────────────────
create or replace function vtt_exigir_narrador_do_objeto(p_object_id uuid)
returns vtt_objects
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_obj vtt_objects;
begin
  select * into v_obj from vtt_objects where id = p_object_id;
  if v_obj is null then
    raise exception 'Objeto não encontrado.' using errcode = 'no_data_found';
  end if;
  if not is_campaign_owner(v_obj.campaign_id) then
    raise exception 'Só o narrador altera objetos da cena.' using errcode = 'insufficient_privilege';
  end if;
  return v_obj;
end;
$$;

revoke all on function vtt_exigir_narrador_do_objeto(uuid) from public, anon;

-- ── create ──────────────────────────────────────────────────────────
create or replace function create_vtt_object(
  p_scene_id uuid,
  p_campaign_id uuid,
  p_nome text,
  p_preset text,
  p_celulas jsonb,
  p_bloqueia_movimento boolean default true,
  p_terreno_projetado text default null,
  p_grau_cobertura text default null,
  p_categoria text default null,
  p_pd integer default null,
  p_pd_max integer default null,
  p_visivel boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not is_campaign_owner(p_campaign_id) then
    raise exception 'Só o narrador cria objetos da cena.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from vtt_scenes s where s.id = p_scene_id and s.campaign_id = p_campaign_id) then
    raise exception 'Cena não pertence a esta campanha.' using errcode = 'invalid_parameter_value';
  end if;

  insert into vtt_objects (
    scene_id, campaign_id, nome, preset, bloqueia_movimento, terreno_projetado,
    grau_cobertura, categoria, pd, pd_max, visivel, criador_id
  ) values (
    p_scene_id, p_campaign_id, btrim(p_nome), p_preset, p_bloqueia_movimento, p_terreno_projetado,
    p_grau_cobertura, p_categoria, p_pd, p_pd_max, p_visivel, auth.uid()
  ) returning id into v_id;

  perform vtt_definir_celulas_objeto(v_id, p_scene_id, p_celulas);
  return vtt_objeto_json(v_id);
end;
$$;

revoke all on function create_vtt_object(uuid, uuid, text, text, jsonb, boolean, text, text, text, integer, integer, boolean) from public, anon;
grant execute on function create_vtt_object(uuid, uuid, text, text, jsonb, boolean, text, text, text, integer, integer, boolean) to authenticated;

-- ── update (propriedades; também é por onde se destrava) ────────────
create or replace function update_vtt_object(
  p_object_id uuid,
  p_expected_revision integer,
  p_nome text,
  p_bloqueia_movimento boolean,
  p_terreno_projetado text,
  p_grau_cobertura text,
  p_categoria text,
  p_pd integer,
  p_pd_max integer,
  p_visivel boolean,
  p_travado boolean
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_obj vtt_objects;
begin
  v_obj := vtt_exigir_narrador_do_objeto(p_object_id);
  if v_obj.revision <> p_expected_revision then
    raise exception 'Revisão desatualizada — outra pessoa já alterou este objeto.' using errcode = 'check_violation';
  end if;

  update vtt_objects set
    nome = btrim(p_nome),
    bloqueia_movimento = p_bloqueia_movimento,
    terreno_projetado = p_terreno_projetado,
    grau_cobertura = p_grau_cobertura,
    categoria = p_categoria,
    pd = p_pd,
    pd_max = p_pd_max,
    visivel = p_visivel,
    travado = p_travado,
    revision = revision + 1,
    updated_at = now()
  where id = p_object_id;

  return vtt_objeto_json(p_object_id);
end;
$$;

revoke all on function update_vtt_object(uuid, integer, text, boolean, text, text, text, integer, integer, boolean, boolean) from public, anon;
grant execute on function update_vtt_object(uuid, integer, text, boolean, text, text, text, integer, integer, boolean, boolean) to authenticated;

-- ── move (geometria) ────────────────────────────────────────────────
create or replace function move_vtt_object(
  p_object_id uuid,
  p_expected_revision integer,
  p_celulas jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_obj vtt_objects;
begin
  v_obj := vtt_exigir_narrador_do_objeto(p_object_id);
  if v_obj.travado then
    raise exception 'Objeto travado — destrave antes de mover.' using errcode = 'insufficient_privilege';
  end if;
  if v_obj.revision <> p_expected_revision then
    raise exception 'Revisão desatualizada — outra pessoa já alterou este objeto.' using errcode = 'check_violation';
  end if;

  perform vtt_definir_celulas_objeto(p_object_id, v_obj.scene_id, p_celulas);

  update vtt_objects set revision = revision + 1, updated_at = now() where id = p_object_id;
  return vtt_objeto_json(p_object_id);
end;
$$;

revoke all on function move_vtt_object(uuid, integer, jsonb) from public, anon;
grant execute on function move_vtt_object(uuid, integer, jsonb) to authenticated;

-- ── damage ──────────────────────────────────────────────────────────
-- `p_delta` NEGATIVO tira PD, positivo repara. Chegar a 0 NÃO remove
-- nem transforma o objeto: virar entulho/sumir é decisão de cena, e
-- entra junto da regra de destruição (fase seguinte). Aqui só o número.
create or replace function damage_vtt_object(
  p_object_id uuid,
  p_expected_revision integer,
  p_delta integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_obj vtt_objects;
begin
  v_obj := vtt_exigir_narrador_do_objeto(p_object_id);
  if v_obj.revision <> p_expected_revision then
    raise exception 'Revisão desatualizada — outra pessoa já alterou este objeto.' using errcode = 'check_violation';
  end if;
  if v_obj.pd is null or v_obj.pd_max is null then
    raise exception 'Este objeto não tem PD.' using errcode = 'check_violation';
  end if;

  update vtt_objects set
    pd = greatest(0, least(v_obj.pd_max, v_obj.pd + p_delta)),
    revision = revision + 1,
    updated_at = now()
  where id = p_object_id;

  return vtt_objeto_json(p_object_id);
end;
$$;

revoke all on function damage_vtt_object(uuid, integer, integer) from public, anon;
grant execute on function damage_vtt_object(uuid, integer, integer) to authenticated;

-- ── delete ──────────────────────────────────────────────────────────
create or replace function delete_vtt_object(p_object_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_obj vtt_objects;
begin
  v_obj := vtt_exigir_narrador_do_objeto(p_object_id);
  if v_obj.travado then
    raise exception 'Objeto travado — destrave antes de excluir.' using errcode = 'insufficient_privilege';
  end if;
  -- `vtt_object_cells` cai por cascade (FK on delete cascade).
  delete from vtt_objects where id = p_object_id;
end;
$$;

revoke all on function delete_vtt_object(uuid) from public, anon;
grant execute on function delete_vtt_object(uuid) to authenticated;

commit;
