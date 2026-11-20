-- PV e PE dos tokens deixam de ter a opção "público": só quem controla o
-- token (inclui o narrador), a Vitalista (PV) e a Terapeuta (PE) veem.
-- As colunas pv_publico/pe_publico ficam, mas não liberam mais leitura.
begin;

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
  v_pe_max integer;
  v_pe integer;
  v_conditions jsonb;
  v_vitalista boolean;
  v_terapeuta boolean;
begin
  select * into v_scene from public.vtt_scenes where id = p_scene_id;
  if v_scene is null or not public.vtt_pode_ver_cena(p_scene_id) then
    raise exception 'Cena não encontrada ou sem acesso.' using errcode = 'insufficient_privilege';
  end if;
  select payload into v_rules from public.content_documents
  where content_type = 'character_rule' and slug = 'regras_personagem' and status = 'published'
  limit 1;
  v_vitalista := public.vtt_tem_subclasse_na_campanha(v_scene.campaign_id, 'vitalista');
  v_terapeuta := public.vtt_tem_subclasse_na_campanha(v_scene.campaign_id, 'terapeuta');

  for v_token in
    select * from public.vtt_tokens
    where scene_id = p_scene_id and (visivel or public.is_campaign_owner(campaign_id))
    order by created_at, id
  loop
    v_control := public.can_move_vtt_token(v_token.id);
    v_character := null;
    v_pv := null;
    v_pv_max := null;
    v_pe := null;
    v_pe_max := null;
    v_conditions := '[]'::jsonb;
    if v_token.character_id is not null then
      select payload into v_character from public.characters where id = v_token.character_id and campaign_id = v_token.campaign_id;
      if v_character is not null and (v_control or v_vitalista) then
        v_pv_max := public.vtt_hud_derived(v_character, coalesce(v_rules, '{}'::jsonb), 'pv_max');
        v_pv := coalesce((v_character -> 'recursos_atuais' ->> 'pv')::integer, v_pv_max);
      end if;
      if v_character is not null and (v_control or v_terapeuta) then
        v_pe_max := public.vtt_hud_derived(v_character, coalesce(v_rules, '{}'::jsonb), 'pe_max');
        v_pe := coalesce((v_character -> 'recursos_atuais' ->> 'pe')::integer, v_pe_max);
      end if;
      if v_control and v_character is not null then
        select coalesce(jsonb_agg(coalesce(item ->> 'conditionId', item ->> 'nome')), '[]'::jsonb)
          into v_conditions
        from jsonb_array_elements(coalesce(v_character -> 'condicoes_ativas', '[]'::jsonb)) item
        where coalesce(item ->> 'ativa', 'true') <> 'false';
      end if;
    else
      if v_control or v_vitalista then
        v_pv := v_token.pv_atual;
        v_pv_max := v_token.pv_max;
      end if;
      if v_control or v_terapeuta then
        v_pe := v_token.pe_atual;
        v_pe_max := v_token.pe_max;
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
      'direcao', v_token.direcao,
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
      'pe_atual', v_pe,
      'pe_max', v_pe_max,
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
  v_vitalista boolean;
  v_terapeuta boolean;
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
  -- Narrador lê qualquer cena; jogador, só a cena em que ele está
  -- (atribuída a ele, ou a apresentada) — a mesma regra de mover.
  if not public.vtt_pode_interagir_cena(v_token.scene_id) then
    return null;
  end if;

  v_control := public.can_move_vtt_token(v_token.id);
  if not v_control and not public.vtt_light_ponto_visivel(v_token.scene_id, v_token.q, v_token.r) then
    return null;
  end if;
  v_vitalista := public.vtt_tem_subclasse_na_campanha(v_token.campaign_id, 'vitalista');
  v_terapeuta := public.vtt_tem_subclasse_na_campanha(v_token.campaign_id, 'terapeuta');
  select payload into v_rules from public.content_documents
  where content_type = 'character_rule' and slug = 'regras_personagem' and status = 'published'
  limit 1;
  if v_token.character_id is not null then
    select * into v_character from public.characters
    where id = v_token.character_id and campaign_id = v_token.campaign_id and archived_at is null;
  end if;

  if v_character.id is not null then
    if v_control or v_vitalista then
      v_max := public.vtt_hud_derived(v_character.payload, coalesce(v_rules, '{}'::jsonb), 'pv_max');
      v_current := coalesce((v_character.payload -> 'recursos_atuais' ->> 'pv')::integer, v_max);
      v_resources := v_resources || jsonb_build_object('pv', jsonb_build_object('atual', v_current, 'max', v_max));
    end if;
    if v_control or v_terapeuta then
      v_max := public.vtt_hud_derived(v_character.payload, coalesce(v_rules, '{}'::jsonb), 'pe_max');
      v_current := coalesce((v_character.payload -> 'recursos_atuais' ->> 'pe')::integer, v_max);
      v_resources := v_resources || jsonb_build_object('pe', jsonb_build_object('atual', v_current, 'max', v_max));
    end if;
    if v_control or v_token.mana_publica then
      v_max := public.vtt_hud_derived(v_character.payload, coalesce(v_rules, '{}'::jsonb), 'mana_max');
      v_current := coalesce((v_character.payload -> 'recursos_atuais' ->> 'mana')::integer, v_max);
      v_resources := v_resources || jsonb_build_object('mana', jsonb_build_object('atual', v_current, 'max', v_max));
    end if;
  elsif v_token.character_id is null then
    if (v_control or v_vitalista) and v_token.pv_atual is not null and v_token.pv_max is not null then
      v_resources := v_resources || jsonb_build_object('pv', jsonb_build_object('atual', v_token.pv_atual, 'max', v_token.pv_max));
    end if;
    if (v_control or v_terapeuta) and v_token.pe_atual is not null and v_token.pe_max is not null then
      v_resources := v_resources || jsonb_build_object('pe', jsonb_build_object('atual', v_token.pe_atual, 'max', v_token.pe_max));
    end if;
    if (v_control or v_token.mana_publica) and v_token.mana_atual is not null and v_token.mana_max is not null then
      v_resources := v_resources || jsonb_build_object('mana', jsonb_build_object('atual', v_token.mana_atual, 'max', v_token.mana_max));
    end if;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'tokenId', v_token.id,
    'sceneId', v_token.scene_id,
    'campaignId', v_token.campaign_id,
    'name', v_token.nome,
    'initials', v_token.sigla,
    'imageUrl', v_token.retrato_url,
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

commit;
