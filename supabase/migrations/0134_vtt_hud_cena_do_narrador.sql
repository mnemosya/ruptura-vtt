-- =====================================================================
-- 0134 — o HUD do token vale em qualquer cena DO NARRADOR
--
-- `read_vtt_token_hud` (0084) recusa qualquer token cuja cena não seja
-- a ATIVA. A regra existe por um motivo real: o jogador não pode ler
-- recurso de token de uma cena onde a mesa não está — ele nem sabe que
-- aquela cena existe (`list_vtt_scenes` não conta).
--
-- Só que ela valia também para o NARRADOR, e ele abre outra cena o
-- tempo todo: preparar é justamente isso — olhar a cena de amanhã
-- enquanto a mesa está na de hoje (o catálogo até marca os dois
-- lugares, "Você está aqui" e "Jogadores aqui"). Nessa situação, todo
-- token que ele passava o mouse devolvia nulo e o cartão simplesmente
-- não abria. Sem erro na tela: o HUD morria calado.
--
-- A correção é uma exceção, não uma abertura: quem é DONO da campanha
-- lê o HUD de qualquer cena dela. Para todo o resto — jogador,
-- controlador de um personagem, visitante — a regra continua exatamente
-- a mesma.
-- =====================================================================

begin;

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
  -- A CENA ATIVA É A REGRA DE QUEM JOGA, não de quem conduz. O narrador
  -- abre outra cena para preparar, e ali o cartão precisa continuar
  -- existindo; para o resto da mesa, ler token de uma cena onde ninguém
  -- está continua fora de alcance.
  if not public.is_campaign_owner(v_token.campaign_id)
     and not exists (
       select 1 from public.vtt_scenes s
       where s.id = v_token.scene_id and s.campaign_id = v_token.campaign_id and s.ativa
     ) then
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

-- A ESCRITA acompanha, pela mesma razão: o narrador ajusta o PV de um
-- inimigo enquanto monta a cena de amanhã, e a trava de cena ativa
-- transformava o ±1 em erro. Para quem não é dono, nada muda.
create or replace function public.mutate_unlinked_vtt_token_hud(
  p_token_id uuid,
  p_kind text,
  p_value jsonb,
  p_expected_revision integer
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token public.vtt_tokens;
  v_number integer;
  v_condition text;
begin
  select * into v_token from public.vtt_tokens where id = p_token_id for update;
  if v_token is null then raise exception 'Token não encontrado.' using errcode = 'no_data_found'; end if;
  if not public.is_campaign_owner(v_token.campaign_id)
     and not exists (
       select 1 from public.vtt_scenes s
       where s.id = v_token.scene_id and s.campaign_id = v_token.campaign_id and s.ativa
     ) then
    raise exception 'Token fora da cena ativa.' using errcode = 'insufficient_privilege';
  end if;
  if v_token.character_id is not null then raise exception 'Token vinculado usa a ficha canônica.' using errcode = 'check_violation'; end if;
  if not public.can_move_vtt_token(p_token_id) then raise exception 'Sem permissão para alterar este token.' using errcode = 'insufficient_privilege'; end if;
  if v_token.revision <> p_expected_revision then raise exception 'Revisão desatualizada.' using errcode = 'serialization_failure'; end if;

  if p_kind = 'pv' then
    if v_token.pv_max is null then raise exception 'Este token não possui PV.' using errcode = 'check_violation'; end if;
    v_number := greatest(0, least(v_token.pv_max, (p_value #>> '{}')::integer));
    update public.vtt_tokens set pv_atual = v_number, revision = revision + 1, updated_at = now() where id = p_token_id;
  elsif p_kind = 'pe' then
    if v_token.pe_max is null then raise exception 'Este token não possui PE.' using errcode = 'check_violation'; end if;
    v_number := greatest(0, least(v_token.pe_max, (p_value #>> '{}')::integer));
    update public.vtt_tokens set pe_atual = v_number, revision = revision + 1, updated_at = now() where id = p_token_id;
  elsif p_kind = 'mana' then
    if v_token.mana_max is null then raise exception 'Este token não possui Mana.' using errcode = 'check_violation'; end if;
    v_number := greatest(0, least(v_token.mana_max, (p_value #>> '{}')::integer));
    update public.vtt_tokens set mana_atual = v_number, revision = revision + 1, updated_at = now() where id = p_token_id;
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
    update public.vtt_tokens set condicoes = array_remove(condicoes, v_condition),
      revision = revision + 1, updated_at = now() where id = p_token_id;
  else
    raise exception 'Operação não suportada para token sem ficha.' using errcode = 'invalid_parameter_value';
  end if;

  select revision into v_number from public.vtt_tokens where id = p_token_id;
  return v_number;
end;
$$;

commit;
