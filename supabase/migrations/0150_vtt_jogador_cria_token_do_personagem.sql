-- =====================================================================
-- 0150 — Jogador põe o PRÓPRIO personagem no mapa
--
-- Até aqui `create_vtt_token` era só do narrador. O jogador arrasta o
-- personagem dele da aba Personagens pro mapa, e precisa conseguir
-- criar esse token.
--
-- REGRA (quem não é o dono da campanha):
--   · o token TEM de estar vinculado a um personagem (`p_character_id`)
--     que ele controla — `is_character_controller`, que já exige
--     participação ativa na campanha do personagem;
--   · o personagem tem de ser desta campanha;
--   · só um token por personagem na cena (arrastar de novo não duplica);
--   · o lado é sempre 'pj', visível e desbloqueado — o jogador não
--     escolhe esses campos, que são decisão de mesa.
-- O narrador segue exatamente como antes.
--
-- Mesma assinatura da 0135, então `create or replace` basta (nada de
-- sobrecarga — ver lição 0094/0096).
-- =====================================================================

begin;

create or replace function public.create_vtt_token(
  p_scene_id uuid,
  p_campaign_id uuid,
  p_nome text,
  p_sigla text,
  p_lado text,
  p_vertente text,
  p_tamanho text,
  p_orientacao integer,
  p_direcao integer,
  p_pegada_personalizada jsonb,
  p_q integer,
  p_r integer,
  p_character_id uuid,
  p_visivel boolean,
  p_bloqueado boolean,
  p_retrato_url text,
  p_pv_atual integer,
  p_pv_max integer,
  p_pe_atual integer,
  p_pe_max integer,
  p_mana_atual integer,
  p_mana_max integer,
  p_condicoes text[]
) returns vtt_tokens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token vtt_tokens;
  v_nome text;
  v_sigla text;
  v_narrador boolean := is_campaign_owner(p_campaign_id);
  v_lado text := p_lado;
  v_visivel boolean := p_visivel;
  v_bloqueado boolean := p_bloqueado;
begin
  if not v_narrador then
    if p_character_id is null
      or not is_character_controller(p_character_id)
      or not exists (select 1 from characters where id = p_character_id and campaign_id = p_campaign_id)
    then
      raise exception 'Você só pode pôr no mapa um personagem que controla.' using errcode = 'insufficient_privilege';
    end if;
    if exists (select 1 from vtt_tokens where scene_id = p_scene_id and character_id = p_character_id) then
      raise exception 'Este personagem já está no mapa desta cena.' using errcode = 'unique_violation';
    end if;
    v_lado := 'pj';
    v_visivel := true;
    v_bloqueado := false;
  end if;

  if not exists (select 1 from vtt_scenes where id = p_scene_id and campaign_id = p_campaign_id) then
    raise exception 'Cena não encontrada para esta campanha.' using errcode = 'no_data_found';
  end if;
  if coalesce(p_direcao, 0) < 0 or coalesce(p_direcao, 0) > 5 then
    raise exception 'Direção inválida.' using errcode = 'invalid_parameter_value';
  end if;

  v_nome := trim(coalesce(p_nome, ''));
  v_sigla := trim(coalesce(p_sigla, ''));
  if v_nome = '' then
    v_nome := vtt_alocar_nome_automatico(p_scene_id, null);
    if v_sigla = '' then v_sigla := substring(v_nome from 2); end if; -- "#7" → "7"
  end if;

  perform vtt_validar_pegada_em(p_scene_id, p_tamanho, p_orientacao, p_pegada_personalizada, p_q, p_r, null);

  insert into vtt_tokens (
    scene_id, campaign_id, character_id, nome, sigla, lado, vertente,
    q, r, tamanho, orientacao, direcao, pegada_personalizada,
    visivel, bloqueado, retrato_url,
    pv_atual, pv_max, pe_atual, pe_max, mana_atual, mana_max, condicoes
  ) values (
    p_scene_id, p_campaign_id, p_character_id, v_nome, coalesce(nullif(v_sigla, ''), '??'), v_lado, coalesce(p_vertente, 'nenhuma'),
    p_q, p_r, p_tamanho, coalesce(p_orientacao, 0), coalesce(p_direcao, 0), p_pegada_personalizada,
    coalesce(v_visivel, true), coalesce(v_bloqueado, false), p_retrato_url,
    p_pv_atual, p_pv_max, p_pe_atual, p_pe_max, p_mana_atual, p_mana_max, coalesce(p_condicoes, '{}')
  )
  returning * into v_token;

  perform realtime.send(
    jsonb_build_object('v', 1, 'campaignId', p_campaign_id::text, 'sceneId', p_scene_id::text, 'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint),
    'tokens_changed', 'campaign:' || p_campaign_id::text || ':scene:' || p_scene_id::text || ':vtt:tokens-changed', true
  );

  return v_token;
end;
$$;

commit;
