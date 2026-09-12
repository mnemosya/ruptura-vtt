-- =====================================================================
-- 0105 — O token HERDA o avatar da ficha
--
-- A 0104 deu origem ao avatar; esta migration faz o token usá-lo. A
-- precedência, de cima para baixo:
--
--   1. `vtt_tokens.retrato_image_id`  — sobreposição por arquivo
--   2. `vtt_tokens.retrato_url`       — sobreposição por endereço
--   3. `characters.avatar_image_id`   — herança da ficha
--   4. a sigla
--
-- O degrau 2 é o detalhe que importa: um token com ENDEREÇO externo
-- NÃO herda. Se herdasse, quem apontou o token para uma imagem de fora
-- veria a cara da ficha aparecer por baixo — e "um retrato, uma origem"
-- deixaria de valer justamente onde ele foi escrito para valer.
--
-- Token sem personagem segue como antes: não há ficha de onde puxar.
--
-- As duas projeções abaixo vêm de `pg_get_functiondef` e só trocam a
-- expressão do id — pelo mesmo motivo da 0102: o que 0084/0095
-- decidiram sobre autorização e campos continua decidido por elas.
-- =====================================================================

begin;

-- ── A cadeia, num lugar só ──────────────────────────────────────────
-- Uma função e não três `case` copiados: a precedência é uma regra, e
-- regra repetida é regra que diverge.
create or replace function vtt_token_imagem_efetiva(
  p_retrato_image_id uuid,
  p_retrato_url      text,
  p_character_id     uuid
) returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_retrato_image_id is not null then p_retrato_image_id
    when p_retrato_url is not null then null          -- endereço externo vence a herança
    when p_character_id is null then null             -- figurante não tem ficha
    else (select c.avatar_image_id from characters c where c.id = p_character_id)
  end;
$$;

revoke all on function vtt_token_imagem_efetiva(uuid, text, uuid) from public, anon;
grant execute on function vtt_token_imagem_efetiva(uuid, text, uuid) to authenticated, service_role;

-- ── Assinatura: a cara de um token VISÍVEL é visível ────────────────
-- Sem este ramo, o avatar herdado só seria assinável para quem pode ler
-- a ficha — ou seja, o time inteiro veria a sigla no lugar do rosto do
-- personagem do colega. Um token visível na mesa já mostra quem é; a
-- cara dele não é informação a mais.
create or replace function vtt_asset_assinavel_para(p_asset_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from vtt_image_assets a
    where a.id = p_asset_id
      and a.estado = 'ready'
      and (
        is_campaign_owner(a.campaign_id, p_user_id)
        or (
          is_campaign_member(a.campaign_id, p_user_id)
          and (
            exists (
              select 1 from vtt_scene_images si
              where si.image_id = a.id
                and si.visivel
                and vtt_camada_cena_visivel(
                      si.scene_id,
                      case when si.papel = 'fundo' then 'imagemFundo' else 'tiles' end)
            )
            -- Retrato próprio de um token que esta pessoa enxerga.
            or exists (
              select 1 from vtt_tokens t
              where t.retrato_image_id = a.id
                and vtt_token_visivel_para(t.id, p_user_id)
            )
            -- Avatar de ficha que esta pessoa pode ler (a própria, ou a
            -- de quem ela controla, ou qualquer uma se for narrador).
            or exists (
              select 1 from characters c
              where c.avatar_image_id = a.id
                and can_read_character(c.id, p_user_id)
            )
            -- Avatar HERDADO por um token visível: ver o token é ver a
            -- cara dele.
            or exists (
              select 1 from vtt_tokens t
              join characters c on c.id = t.character_id
              where c.avatar_image_id = a.id
                and t.retrato_image_id is null
                and t.retrato_url is null
                and vtt_token_visivel_para(t.id, p_user_id)
            )
          )
        )
      )
  );
$$;

revoke all on function vtt_asset_assinavel_para(uuid, uuid) from public, anon, authenticated;
grant execute on function vtt_asset_assinavel_para(uuid, uuid) to service_role;

-- ── Tokens da cena: o id passa pela cadeia ──────────────────────────
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
      -- 0102: o arquivo próprio. O cliente assina; ver o cabeçalho.
      'retrato_image_id', vtt_token_imagem_efetiva(
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

-- ── HUD do token selecionado: idem ──────────────────────────────────
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
  if not exists (select 1 from public.vtt_scenes s where s.id = v_token.scene_id and s.campaign_id = v_token.campaign_id and s.ativa) then
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
      'retratoImageId', vtt_token_imagem_efetiva(
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

commit;
