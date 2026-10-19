-- O cartão do token usava "cena com ativa = true" como a cena de quem
-- joga, mas o resto do VTT (mover, interagir) usa a cena ATRIBUÍDA ao
-- jogador (`vtt_cena_do_jogador`). Jogador atribuído a outra cena via o
-- próprio token e não abria o cartão. Agora as duas regras são a mesma:
-- `vtt_pode_interagir_cena` (narrador: qualquer cena; jogador: a sua).
-- Parte do que estava no banco (checagem de luz) não tinha migration;
-- esta versão parte da definição viva.

create or replace function public.read_vtt_token_hud(p_token_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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
  -- Narrador lê qualquer cena; jogador, só a cena em que ele está
  -- (atribuída a ele, ou a apresentada) — a mesma regra de mover.
  if not public.vtt_pode_interagir_cena(v_token.scene_id) then
    return null;
  end if;

  v_control := public.can_move_vtt_token(v_token.id);
  if not v_control and not public.vtt_light_ponto_visivel(v_token.scene_id, v_token.q, v_token.r) then
    return null;
  end if;
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
  elsif v_token.character_id is null then
    if (v_control or v_token.pv_publico) and v_token.pv_atual is not null and v_token.pv_max is not null then
      v_resources := v_resources || jsonb_build_object('pv', jsonb_build_object('atual', v_token.pv_atual, 'max', v_token.pv_max));
    end if;
    if (v_control or v_token.pe_publico) and v_token.pe_atual is not null and v_token.pe_max is not null then
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
$$;
