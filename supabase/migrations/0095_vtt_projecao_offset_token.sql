-- =====================================================================
-- 0095 — A projeção de tokens devolve o deslocamento sub-célula
--
-- Corpo idêntico ao que estava em produção; muda só o `jsonb_build_object`,
-- que passa a carregar `offset_q`/`offset_r` (migration 0094). Sem isto o
-- mapa recebe a célula âncora e desenha o token no centro dela — a
-- posição livre existiria no banco e não na tela.
--
-- Os dois vão pra TODO participante, e não só pra quem controla: é onde
-- o token aparece. Escondê-los mostraria a mesma peça em dois lugares
-- diferentes para pessoas diferentes.
-- =====================================================================

begin;

create or replace function public.read_vtt_scene_tokens(p_scene_id uuid)
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
  if v_scene is null or not public.is_campaign_member(v_scene.campaign_id) then
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
$function$

;

commit;
