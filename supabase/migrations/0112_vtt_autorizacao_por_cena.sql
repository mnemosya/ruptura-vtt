-- =====================================================================
-- 0112 — Autorização por CENA, não por campanha
--
-- Esta é a migration que torna verdadeira a promessa da 0111. Sem ela,
-- o catálogo entrega o contrário do que promete: o narrador monta a
-- próxima cena e a mesa inteira pode ler o que ele está montando.
--
-- O problema não era a interface esconder mal. Era o banco não ter a
-- pergunta certa. Toda a autorização do VTT dizia:
--
--     is_campaign_member(campaign_id)
--
-- que traduzido é "você é desta mesa?". Com UMA cena por campanha, essa
-- pergunta e "você pode ver esta cena?" tinham a mesma resposta, e por
-- isso a diferença nunca apareceu. Com catálogo elas se separam — e a
-- primeira passa a ser larga demais para tudo que é CONTEÚDO de cena:
-- tokens, terreno, marcações, áreas, objetos, imagens, trilha.
--
-- Duas frentes, porque há dois caminhos até o dado:
--
--   1. POLICIES — o caminho do `select` direto. Trocam o predicado.
--   2. RPCs `SECURITY DEFINER` — que IGNORAM RLS por construção, então
--      nenhuma policy as alcança. `read_vtt_scene_tokens`,
--      `read_vtt_scene_objects` e `read_vtt_scene_images` conferiam
--      só `is_campaign_member`: eram a porta aberta de verdade, e
--      mexer só nas policies teria deixado o vazamento inteiro de pé
--      com aparência de resolvido.
--
-- E a terceira frente, menor: quatro funções de HUD perguntavam
-- `s.ativa`. Aquela coluna deixou de significar "a cena em que estou" na
-- 0111 — virou espelho do palco. Perguntar por ela agora responderia
-- "não" para o narrador que abriu qualquer cena fora do palco, que é
-- exatamente o caso de uso que estamos construindo.
--
-- REGRA, em uma frase: o narrador vê todo o catálogo e escreve em
-- qualquer cena não arquivada; qualquer outro membro só existe na cena
-- apresentada.
--
-- `vtt_area_permissoes` fica como está, de propósito: é a lista de
-- quem o narrador autorizou a criar áreas NA CAMPANHA — uma concessão,
-- não conteúdo de cena. Escopá-la por cena seria responder a uma
-- pergunta que ninguém fez.
--
-- As definições de função abaixo foram REGENERADAS a partir do banco
-- (`pg_get_functiondef`), com a guarda trocada e mais nada. O corpo é
-- literalmente o que estava rodando — o diff desta migration contra o
-- comportamento anterior é só a linha da guarda em cada uma.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. O catálogo em si
--
-- Um jogador não deve saber que existem sete cenas, nem como se chamam.
-- Não é sigilo por capricho: o nome de uma cena é metade da surpresa.
-- ---------------------------------------------------------------------
drop policy if exists vtt_scenes_select on vtt_scenes;
create policy vtt_scenes_select on vtt_scenes
  for select to authenticated
  using (public.vtt_pode_ver_cena(id));

-- ---------------------------------------------------------------------
-- 2. Conteúdo de cena
--
-- Em todas: a parte depois do `and` é a regra que JÁ existia (token
-- oculto, marcação privada, área invisível, objeto oculto) e continua
-- intacta. O que muda é só o predicado da frente.
-- ---------------------------------------------------------------------
drop policy if exists vtt_tokens_select on vtt_tokens;
create policy vtt_tokens_select on vtt_tokens
  for select to authenticated
  using (public.vtt_pode_ver_cena(scene_id) and (visivel or is_campaign_owner(campaign_id)));

drop policy if exists vtt_terrain_select on vtt_terrain;
create policy vtt_terrain_select on vtt_terrain
  for select to authenticated
  using (public.vtt_pode_ver_cena(scene_id));

drop policy if exists vtt_marks_select on vtt_marks;
create policy vtt_marks_select on vtt_marks
  for select to authenticated
  using (
    public.vtt_pode_ver_cena(scene_id)
    and ((not privada) or autor_id = (select auth.uid()) or is_campaign_owner(campaign_id))
  );

drop policy if exists vtt_measurements_select on vtt_measurements;
create policy vtt_measurements_select on vtt_measurements
  for select to authenticated
  using (public.vtt_pode_ver_cena(scene_id));

drop policy if exists vtt_areas_select on vtt_areas;
create policy vtt_areas_select on vtt_areas
  for select to authenticated
  using (
    public.vtt_pode_ver_cena(scene_id)
    and (visivel or is_campaign_owner(campaign_id) or criador_id = (select auth.uid()))
    and (tipo <> 'aura' or token_id is null or vtt_token_visivel_para(token_id))
  );

drop policy if exists vtt_objects_select on vtt_objects;
create policy vtt_objects_select on vtt_objects
  for select to authenticated
  using (public.vtt_pode_ver_cena(scene_id) and (visivel or is_campaign_owner(campaign_id)));

-- As células herdam a visibilidade do objeto — inclusive a da cena.
drop policy if exists vtt_object_cells_select on vtt_object_cells;
create policy vtt_object_cells_select on vtt_object_cells
  for select to authenticated
  using (exists (
    select 1 from vtt_objects o
     where o.id = vtt_object_cells.object_id
       and public.vtt_pode_ver_cena(o.scene_id)
       and (o.visivel or is_campaign_owner(o.campaign_id))
  ));

drop policy if exists vtt_turn_tracks_select on vtt_turn_tracks;
create policy vtt_turn_tracks_select on vtt_turn_tracks
  for select to authenticated
  using (public.vtt_pode_ver_cena(scene_id));

-- ---------------------------------------------------------------------
-- 3. Escrita direta por policy
--
-- Terreno é do narrador — mas agora "do narrador" para de incluir cena
-- arquivada. Marcação e medição qualquer membro cria, na cena em que
-- está: `vtt_pode_interagir_cena` já embute a checagem de membro, então
-- não sobra `is_campaign_member` para conferir duas vezes.
--
-- Os DELETE de marcação e medição ficam como estavam (autor ou
-- narrador): ninguém tem o que apagar numa cena onde nunca escreveu.
-- ---------------------------------------------------------------------
drop policy if exists vtt_terrain_insert on vtt_terrain;
create policy vtt_terrain_insert on vtt_terrain
  for insert to authenticated
  with check (is_campaign_owner(campaign_id) and public.vtt_pode_interagir_cena(scene_id));

drop policy if exists vtt_terrain_update on vtt_terrain;
create policy vtt_terrain_update on vtt_terrain
  for update to authenticated
  using (is_campaign_owner(campaign_id) and public.vtt_pode_interagir_cena(scene_id))
  with check (is_campaign_owner(campaign_id) and public.vtt_pode_interagir_cena(scene_id));

drop policy if exists vtt_terrain_delete on vtt_terrain;
create policy vtt_terrain_delete on vtt_terrain
  for delete to authenticated
  using (is_campaign_owner(campaign_id) and public.vtt_pode_interagir_cena(scene_id));

drop policy if exists vtt_marks_insert on vtt_marks;
create policy vtt_marks_insert on vtt_marks
  for insert to authenticated
  with check (public.vtt_pode_interagir_cena(scene_id) and autor_id = (select auth.uid()));

drop policy if exists vtt_measurements_insert on vtt_measurements;
create policy vtt_measurements_insert on vtt_measurements
  for insert to authenticated
  with check (public.vtt_pode_interagir_cena(scene_id) and autor_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 4. As funções que a RLS não alcança
-- ---------------------------------------------------------------------

-- ── read_vtt_scene_tokens ─────────────────────────────────────────
-- SECURITY DEFINER: ignora RLS, então a policy nova não a alcança. Era o caminho por onde um jogador lia os tokens de qualquer cena da campanha.
CREATE OR REPLACE FUNCTION public.read_vtt_scene_tokens(p_scene_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scene public.vtt_scenes;
  v_rules jsonb;
  v_result jsonb := '[]'::jsonb;
  v_token public.vtt_tokens;
  v_character jsonb;
  v_control boolean;
  v_pv_max integer;
  v_pv integer;
  v_conditions jsonb;
begin
  select * into v_scene from public.vtt_scenes where id = p_scene_id;
  if v_scene is null or not public.vtt_pode_ver_cena(p_scene_id) then
    raise exception 'Cena não encontrada ou sem acesso.' using errcode = 'insufficient_privilege';
  end if;
  select payload into v_rules from public.content_documents
  where content_type = 'character_rule' and slug = 'regras_personagem' and status = 'published'
  limit 1;

  for v_token in
    select * from public.vtt_tokens
    where scene_id = p_scene_id and (visivel or public.is_campaign_owner(campaign_id))
    order by created_at, id
  loop
    v_control := public.can_move_vtt_token(v_token.id);
    v_character := null;
    v_pv := null;
    v_pv_max := null;
    v_conditions := '[]'::jsonb;
    if v_token.character_id is not null then
      select payload into v_character from public.characters where id = v_token.character_id and campaign_id = v_token.campaign_id;
      if v_character is not null and (v_control or v_token.pv_publico) then
        v_pv_max := public.vtt_hud_derived(v_character, coalesce(v_rules, '{}'::jsonb), 'pv_max');
        v_pv := coalesce((v_character -> 'recursos_atuais' ->> 'pv')::integer, v_pv_max);
      end if;
      if v_control and v_character is not null then
        select coalesce(jsonb_agg(coalesce(item ->> 'conditionId', item ->> 'nome')), '[]'::jsonb)
          into v_conditions
        from jsonb_array_elements(coalesce(v_character -> 'condicoes_ativas', '[]'::jsonb)) item
        where coalesce(item ->> 'ativa', 'true') <> 'false';
      end if;
    else
      if v_control or v_token.pv_publico then
        v_pv := v_token.pv_atual;
        v_pv_max := v_token.pv_max;
      end if;
      if v_control then v_conditions := to_jsonb(v_token.condicoes); end if;
    end if;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', v_token.id,
      'scene_id', v_token.scene_id,
      'character_id', case when v_control then v_token.character_id else null end,
      'nome', v_token.nome,
      'sigla', v_token.sigla,
      'lado', v_token.lado,
      'vertente', v_token.vertente,
      'q', v_token.q,
      'r', v_token.r,
      'tamanho', v_token.tamanho,
      'orientacao', v_token.orientacao,
      'pegada_personalizada', v_token.pegada_personalizada,
      'bloqueado', v_token.bloqueado,
      'visivel', v_token.visivel,
      'retrato_url', v_token.retrato_url,
      -- 0102: o arquivo próprio. O cliente assina; ver o cabeçalho.
      -- O próprio, cru: é ele que o botão de remover opera.
      'retrato_image_id', v_token.retrato_image_id,
      -- O que se desenha, com a herança da ficha resolvida (0105).
      'retrato_efetivo_id', vtt_token_imagem_efetiva(
        v_token.retrato_image_id, v_token.retrato_url, v_token.character_id),
      'pv_atual', v_pv,
      'pv_max', v_pv_max,
      'condicoes', v_conditions,
      'pv_publico', case when v_control then v_token.pv_publico else null end,
      'pe_publico', case when v_control then v_token.pe_publico else null end,
      'mana_publica', case when v_control then v_token.mana_publica else null end,
      'pode_controlar', v_control,
      -- Deslocamento sub-célula (0094): só desenho. Vai pra todo mundo,
      -- porque é onde o token aparece — esconder isso mostraria o token
      -- no centro do hex pra uns e onde ele foi solto pra outros.
      'offset_q', v_token.offset_q,
      'offset_r', v_token.offset_r,
      'revision', v_token.revision
    ));
  end loop;
  return v_result;
end;
$function$;

-- ── read_vtt_scene_objects ────────────────────────────────────────
-- Mesmo motivo dos tokens.
CREATE OR REPLACE FUNCTION public.read_vtt_scene_objects(p_scene_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scene vtt_scenes;
  v_result jsonb;
begin
  select * into v_scene from vtt_scenes where id = p_scene_id;
  if v_scene is null or not public.vtt_pode_ver_cena(p_scene_id) then
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
$function$;

-- ── read_vtt_scene_images ─────────────────────────────────────────
-- Mesmo motivo — e aqui vazaria também o `image_id` de arquivos que a pessoa não deveria saber que existem.
CREATE OR REPLACE FUNCTION public.read_vtt_scene_images(p_scene_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scene vtt_scenes;
begin
  select * into v_scene from vtt_scenes where id = p_scene_id;
  if v_scene is null or not public.vtt_pode_ver_cena(p_scene_id) then
    raise exception 'Cena não encontrada ou sem acesso.' using errcode = 'insufficient_privilege';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', si.id, 'scene_id', si.scene_id, 'image_id', si.image_id, 'papel', si.papel,
      'centro_q', si.centro_q, 'centro_r', si.centro_r,
      'largura_m', si.largura_m, 'altura_m', si.altura_m,
      'rotacao_graus', si.rotacao_graus, 'opacidade', si.opacidade,
      'camada', si.camada, 'z', si.z, 'visivel', si.visivel, 'travado', si.travado,
      'revision', si.revision,
      'width_px', a.width_px, 'height_px', a.height_px
    ) order by si.papel desc, si.z, si.created_at)
    from vtt_scene_images si
    join vtt_image_assets a on a.id = si.image_id
    where si.scene_id = p_scene_id
      and (si.visivel or is_campaign_owner(si.campaign_id))
  ), '[]'::jsonb);
end;
$function$;

-- ── read_vtt_token_hud ────────────────────────────────────────────
-- Trocava `s.ativa` — que deixou de significar 'a cena em que estou' — por 'a cena que posso ver'.
CREATE OR REPLACE FUNCTION public.read_vtt_token_hud(p_token_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_token public.vtt_tokens;
  v_character public.characters;
  v_rules jsonb;
  v_control boolean;
  v_resources jsonb := '{}'::jsonb;
  v_max integer;
  v_current integer;
begin
  select * into v_token from public.vtt_tokens where id = p_token_id;
  if v_token is null
     or not public.is_campaign_member(v_token.campaign_id)
     or (not v_token.visivel and not public.is_campaign_owner(v_token.campaign_id)) then
    return null;
  end if;
  if not public.vtt_pode_ver_cena(v_token.scene_id) then
    return null;
  end if;

  v_control := public.can_move_vtt_token(v_token.id);
  select payload into v_rules from public.content_documents
  where content_type = 'character_rule' and slug = 'regras_personagem' and status = 'published'
  limit 1;
  if v_token.character_id is not null then
    select * into v_character from public.characters
    where id = v_token.character_id and campaign_id = v_token.campaign_id and archived_at is null;
  end if;

  if v_character.id is not null then
    if v_control or v_token.pv_publico then
      v_max := public.vtt_hud_derived(v_character.payload, coalesce(v_rules, '{}'::jsonb), 'pv_max');
      v_current := coalesce((v_character.payload -> 'recursos_atuais' ->> 'pv')::integer, v_max);
      v_resources := v_resources || jsonb_build_object('pv', jsonb_build_object('atual', v_current, 'max', v_max));
    end if;
    if v_control or v_token.pe_publico then
      v_max := public.vtt_hud_derived(v_character.payload, coalesce(v_rules, '{}'::jsonb), 'pe_max');
      v_current := coalesce((v_character.payload -> 'recursos_atuais' ->> 'pe')::integer, v_max);
      v_resources := v_resources || jsonb_build_object('pe', jsonb_build_object('atual', v_current, 'max', v_max));
    end if;
    if v_control or v_token.mana_publica then
      v_max := public.vtt_hud_derived(v_character.payload, coalesce(v_rules, '{}'::jsonb), 'mana_max');
      v_current := coalesce((v_character.payload -> 'recursos_atuais' ->> 'mana')::integer, v_max);
      v_resources := v_resources || jsonb_build_object('mana', jsonb_build_object('atual', v_current, 'max', v_max));
    end if;
  elsif v_token.character_id is null
    and (v_control or v_token.pv_publico)
    and v_token.pv_atual is not null
    and v_token.pv_max is not null then
    v_resources := jsonb_build_object('pv', jsonb_build_object('atual', v_token.pv_atual, 'max', v_token.pv_max));
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'tokenId', v_token.id,
    'sceneId', v_token.scene_id,
    'campaignId', v_token.campaign_id,
    'name', v_token.nome,
    'initials', v_token.sigla,
    'imageUrl', v_token.retrato_url,
      -- 0102: o arquivo próprio. O cliente assina; ver o cabeçalho.
      'retratoImageId', v_token.retrato_image_id,
    'retratoEfetivoId', vtt_token_imagem_efetiva(
      v_token.retrato_image_id, v_token.retrato_url, v_token.character_id),
    'canControl', v_control,
    'characterId', case when v_control then v_token.character_id else null end,
    'character', case when v_control and v_character.id is not null then v_character.payload else null end,
    'characterUpdatedAt', case when v_control and v_character.id is not null then v_character.updated_at else null end,
    'resources', v_resources,
    'visibility', case when v_control then jsonb_build_object(
      'pv', v_token.pv_publico,
      'pe', v_token.pe_publico,
      'mana', v_token.mana_publica
    ) else null end,
    'tokenConditions', case when v_control and v_token.character_id is null then to_jsonb(v_token.condicoes) else null end,
    'tokenRevision', v_token.revision
  ));
end;
$function$;

-- ── set_vtt_token_resource_visibility ─────────────────────────────
-- Escrita: exige poder INTERAGIR, o que também recusa cena arquivada.
CREATE OR REPLACE FUNCTION public.set_vtt_token_resource_visibility(p_token_id uuid, p_resource text, p_public boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_token public.vtt_tokens;
begin
  select * into v_token from public.vtt_tokens where id = p_token_id for update;
  if v_token is null then raise exception 'Token não encontrado.' using errcode = 'no_data_found'; end if;
  if not public.vtt_pode_interagir_cena(v_token.scene_id) then
    raise exception 'Token fora da cena ativa.' using errcode = 'insufficient_privilege';
  end if;
  if not public.can_move_vtt_token(p_token_id) then raise exception 'Sem permissão para alterar a visibilidade deste token.' using errcode = 'insufficient_privilege'; end if;
  if p_resource not in ('pv', 'pe', 'mana') then raise exception 'Recurso inválido.' using errcode = 'invalid_parameter_value'; end if;

  update public.vtt_tokens set
    pv_publico = case when p_resource = 'pv' then p_public else pv_publico end,
    pe_publico = case when p_resource = 'pe' then p_public else pe_publico end,
    mana_publica = case when p_resource = 'mana' then p_public else mana_publica end,
    revision = revision + 1,
    updated_at = now()
  where id = p_token_id
  returning * into v_token;
  return v_token.revision;
end;
$function$;

-- ── mutate_unlinked_vtt_token_hud ─────────────────────────────────
-- Escrita: idem.
CREATE OR REPLACE FUNCTION public.mutate_unlinked_vtt_token_hud(p_token_id uuid, p_kind text, p_value jsonb, p_expected_revision integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_token public.vtt_tokens;
  v_number integer;
  v_condition text;
begin
  select * into v_token from public.vtt_tokens where id = p_token_id for update;
  if v_token is null then raise exception 'Token não encontrado.' using errcode = 'no_data_found'; end if;
  if not public.vtt_pode_interagir_cena(v_token.scene_id) then
    raise exception 'Token fora da cena ativa.' using errcode = 'insufficient_privilege';
  end if;
  if v_token.character_id is not null then raise exception 'Token vinculado usa a ficha canônica.' using errcode = 'check_violation'; end if;
  if not public.can_move_vtt_token(p_token_id) then raise exception 'Sem permissão para alterar este token.' using errcode = 'insufficient_privilege'; end if;
  if v_token.revision <> p_expected_revision then raise exception 'Revisão desatualizada.' using errcode = 'serialization_failure'; end if;

  if p_kind = 'pv' then
    if v_token.pv_max is null then raise exception 'Este token não possui PV.' using errcode = 'check_violation'; end if;
    v_number := greatest(0, least(v_token.pv_max, (p_value #>> '{}')::integer));
    update public.vtt_tokens set pv_atual = v_number, revision = revision + 1, updated_at = now() where id = p_token_id;
  elsif p_kind = 'condition_add' then
    v_condition := p_value #>> '{}';
    if not (v_condition = any(array[
      'atordoado','caido','cego','surdo','lento','sangrando','queimando','envenenado',
      'saturado','insaturado','imobilizado','agarrado','ofuscado','contundido','sufocando','inconsciente'
    ]::text[])) then raise exception 'Condição inválida.' using errcode = 'invalid_parameter_value'; end if;
    update public.vtt_tokens set condicoes = case when v_condition = any(condicoes) then condicoes else array_append(condicoes, v_condition) end,
      revision = revision + 1, updated_at = now() where id = p_token_id;
  elsif p_kind = 'condition_remove' then
    v_condition := p_value #>> '{}';
    update public.vtt_tokens set condicoes = array_remove(condicoes, v_condition), revision = revision + 1, updated_at = now() where id = p_token_id;
  else
    raise exception 'Mutação inválida.' using errcode = 'invalid_parameter_value';
  end if;
  select revision into v_number from public.vtt_tokens where id = p_token_id;
  return v_number;
end;
$function$;

-- ── update_linked_vtt_hud_character ───────────────────────────────
-- Escrita: idem.
CREATE OR REPLACE FUNCTION public.update_linked_vtt_hud_character(p_token_id uuid, p_expected_updated_at timestamp with time zone, p_payload jsonb)
 RETURNS characters
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_token public.vtt_tokens;
  v_character public.characters;
begin
  select * into v_token from public.vtt_tokens where id = p_token_id for update;
  if v_token is null or v_token.character_id is null then raise exception 'Token sem personagem vinculado.' using errcode = 'check_violation'; end if;
  if not public.vtt_pode_interagir_cena(v_token.scene_id) then
    raise exception 'Token fora da cena ativa.' using errcode = 'insufficient_privilege';
  end if;
  if not public.can_move_vtt_token(p_token_id) then raise exception 'Sem permissão para alterar este personagem.' using errcode = 'insufficient_privilege'; end if;
  if jsonb_typeof(p_payload) <> 'object' then raise exception 'Payload inválido.' using errcode = 'invalid_parameter_value'; end if;

  update public.characters
     set payload = p_payload,
         name = coalesce(nullif(trim(p_payload ->> 'nome'), ''), name),
         updated_at = now()
   where id = v_token.character_id
     and campaign_id = v_token.campaign_id
     and archived_at is null
     and updated_at = p_expected_updated_at
  returning * into v_character;
  if v_character is null then raise exception 'Personagem mudou em outra sessão; tente novamente.' using errcode = 'serialization_failure'; end if;
  return v_character;
end;
$function$;

-- ── can_move_vtt_token ────────────────────────────────────────────
-- Ser da campanha deixou de bastar para mover um token: tem que ser uma cena em que a pessoa pode agir. É o predicado que a policy de UPDATE de `vtt_tokens` e a RPC de movimento consultam.
CREATE OR REPLACE FUNCTION public.can_move_vtt_token(p_token_id uuid, check_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.vtt_tokens t
    where t.id = p_token_id
      and public.vtt_pode_interagir_cena(t.scene_id, check_user_id)
      and (
        public.is_campaign_owner(t.campaign_id, check_user_id)
        or (
          t.character_id is not null
          and public.is_character_controller_for(t.character_id, t.campaign_id, check_user_id)
        )
      )
  );
$function$;

-- ── pode_criar_vtt_area ───────────────────────────────────────────
-- Idem para criar área de efeito.
CREATE OR REPLACE FUNCTION public.pode_criar_vtt_area(p_campaign_id uuid, p_scene_id uuid, check_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.vtt_pode_interagir_cena(p_scene_id, check_user_id)
     and exists (select 1 from vtt_scenes s where s.id = p_scene_id and s.campaign_id = p_campaign_id);
$function$;

-- ── pode_editar_vtt_area ──────────────────────────────────────────
-- Idem para editar/apagar área.
CREATE OR REPLACE FUNCTION public.pode_editar_vtt_area(p_area_id uuid, check_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from vtt_areas a
    where a.id = p_area_id
      and public.vtt_pode_interagir_cena(a.scene_id, check_user_id)
      and (is_campaign_owner(a.campaign_id, check_user_id) or a.criador_id = check_user_id)
  );
$function$;

-- ── vtt_ping ──────────────────────────────────────────────────────
-- Ping é broadcast: apontar para uma cena que não é a sua mandaria um sinal para gente que está em outro mapa.
CREATE OR REPLACE FUNCTION public.vtt_ping(p_campaign_id uuid, p_scene_id uuid, p_q integer, p_r integer, p_foco boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  if not public.vtt_pode_interagir_cena(p_scene_id) then
    raise exception 'Você não está nesta cena.' using errcode = 'insufficient_privilege';
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
    'largura', v_scene.largura,
    'altura', v_scene.altura,
    'foco', coalesce(p_foco, false),
    'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint
  );

  perform realtime.send(
    v_payload, 'ping',
    'campaign:' || p_campaign_id::text || ':scene:' || p_scene_id::text || ':vtt:ping',
    true
  );
  return true;
end;
$function$;

-- ── atualizar_vtt_trilha ──────────────────────────────────────────
-- Avançar a rodada de uma cena em que não se está é mexer na mesa dos outros.
CREATE OR REPLACE FUNCTION public.atualizar_vtt_trilha(p_scene_id uuid, p_estado jsonb, p_expected_revision integer)
 RETURNS vtt_turn_tracks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_atual vtt_turn_tracks;
  v_row vtt_turn_tracks;
begin
  select * into v_atual from vtt_turn_tracks where scene_id = p_scene_id;
  if v_atual.scene_id is null then
    raise exception 'Não há rodadas ativas nesta cena.';
  end if;
  if not public.vtt_pode_interagir_cena(p_scene_id) then
    raise exception 'Sem acesso a esta campanha.';
  end if;
  if v_atual.revision <> p_expected_revision then
    raise exception 'A trilha mudou em outra sessão (revisão % ≠ %). Releia antes de escrever.',
      v_atual.revision, p_expected_revision;
  end if;

  if not is_campaign_owner(v_atual.campaign_id) then
    if vtt_trilha_ids(p_estado) is distinct from vtt_trilha_ids(v_atual.estado) then
      raise exception 'Só o narrador pode alterar os participantes das rodadas.';
    end if;
    if (p_estado ->> 'modo') is distinct from (v_atual.estado ->> 'modo')
       or (p_estado ->> 'ladoSurpresa') is distinct from (v_atual.estado ->> 'ladoSurpresa') then
      raise exception 'Só o narrador pode mudar o modo das rodadas.';
    end if;
  end if;

  update vtt_turn_tracks
     set estado = p_estado,
         revision = revision + 1,
         updated_at = now(),
         updated_by = (select auth.uid())
   where scene_id = p_scene_id
  returning * into v_row;

  return v_row;
end;
$function$;

-- ── vtt_exigir_narrador_da_cena ───────────────────────────────────
-- Guarda compartilhada das imagens da cena: passa a recusar também cena ARQUIVADA, que é só leitura até ser restaurada.
CREATE OR REPLACE FUNCTION public.vtt_exigir_narrador_da_cena(p_scene_id uuid)
 RETURNS vtt_scenes
 LANGUAGE plpgsql
AS $function$
declare v_scene vtt_scenes;
begin
  select * into v_scene from vtt_scenes where id = p_scene_id;
  if v_scene is null then
    raise exception 'Cena não encontrada.' using errcode = 'no_data_found';
  end if;
  if not public.vtt_pode_interagir_cena(p_scene_id) or not is_campaign_owner(v_scene.campaign_id) then
    raise exception 'Só o narrador altera imagens da cena.' using errcode = 'insufficient_privilege';
  end if;
  return v_scene;
end;
$function$;

commit;
