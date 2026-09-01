-- =====================================================================
-- 0084 — HUD persistente do token selecionado
--
-- Recursos de personagem continuam canônicos em characters.payload.
-- Os três booleanos abaixo pertencem ao TOKEN: descrevem somente o que
-- esta presença expõe publicamente na mesa. Leituras do HUD passam por
-- projeções SECURITY DEFINER que removem chaves privadas por completo.
-- =====================================================================

begin;

alter table public.vtt_tokens
  add column if not exists pv_publico boolean not null default false,
  add column if not exists pe_publico boolean not null default false,
  add column if not exists mana_publica boolean not null default false;

comment on column public.vtt_tokens.pv_publico is 'Expõe PV atual e máximo deste token a observadores; falso não envia o recurso.';
comment on column public.vtt_tokens.pe_publico is 'Expõe PE atual e máximo do personagem vinculado; falso não envia o recurso.';
comment on column public.vtt_tokens.mana_publica is 'Expõe Mana atual e máxima do personagem vinculado; falso não envia o recurso.';

-- O helper canônico passa a exigir participação ativa também no ramo
-- de controlador. Uma linha residual em character_controllers nunca
-- mantém controle depois que o usuário sai da campanha.
create or replace function public.can_move_vtt_token(p_token_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.vtt_tokens t
    where t.id = p_token_id
      and public.is_campaign_member(t.campaign_id, check_user_id)
      and (
        public.is_campaign_owner(t.campaign_id, check_user_id)
        or (
          t.character_id is not null
          and public.is_character_controller_for(t.character_id, t.campaign_id, check_user_id)
        )
      )
  );
$$;

revoke all on function public.can_move_vtt_token(uuid, uuid) from public, anon;
grant execute on function public.can_move_vtt_token(uuid, uuid) to authenticated;

-- Avaliador interno da MESMA árvore de fórmulas consumida por
-- computeDerivedStats no TypeScript. É usado apenas para montar a
-- projeção pública sem entregar atributos privados ao observador.
create or replace function public.vtt_hud_eval_formula(
  p_node jsonb,
  p_character jsonb,
  p_rules jsonb,
  p_stack text[] default '{}'
) returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ref text;
  v_kind text;
  v_op text;
  v_arg jsonb;
  v_value numeric;
  v_result numeric;
  v_first boolean := true;
  v_formula jsonb;
begin
  if p_node ? 'const' then
    return (p_node ->> 'const')::numeric;
  end if;

  if p_node ? 'ref' then
    v_kind := p_node ->> 'ref';
    v_ref := p_node ->> 'id';
    if v_kind = 'atributo' then
      return coalesce((p_character -> 'atributos' ->> v_ref)::numeric, 1);
    end if;
    if v_kind = 'derivado' then
      if v_ref = any(p_stack) then raise exception 'Fórmula derivada circular.'; end if;
      select item -> 'formula' into v_formula
      from jsonb_array_elements(coalesce(p_rules -> 'derivados', '[]'::jsonb)) item
      where item ->> 'id' = v_ref
      limit 1;
      if v_formula is null then return 0; end if;
      return public.vtt_hud_eval_formula(v_formula, p_character, p_rules, array_append(p_stack, v_ref));
    end if;
    return 0;
  end if;

  v_op := p_node ->> 'op';
  for v_arg in select value from jsonb_array_elements(coalesce(p_node -> 'args', '[]'::jsonb)) loop
    v_value := public.vtt_hud_eval_formula(v_arg, p_character, p_rules, p_stack);
    if v_first then
      v_result := case when v_op = '*' then 1 else v_value end;
      if v_op = '*' then v_result := v_result * v_value; end if;
      v_first := false;
    elsif v_op = '+' then v_result := v_result + v_value;
    elsif v_op = '-' then v_result := v_result - v_value;
    elsif v_op = '*' then v_result := v_result * v_value;
    elsif v_op = '/' and v_value <> 0 then v_result := v_result / v_value;
    end if;
  end loop;
  return coalesce(v_result, 0);
end;
$$;

revoke all on function public.vtt_hud_eval_formula(jsonb, jsonb, jsonb, text[]) from public, anon, authenticated;

create or replace function public.vtt_hud_derived(
  p_character jsonb,
  p_rules jsonb,
  p_id text
) returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_formula jsonb;
  v_value numeric;
begin
  select item -> 'formula' into v_formula
  from jsonb_array_elements(coalesce(p_rules -> 'derivados', '[]'::jsonb)) item
  where item ->> 'id' = p_id
  limit 1;

  -- Fallbacks são os mesmos de derived.fallback.ts e só entram quando
  -- o documento publicado está ausente/incompleto.
  if v_formula is null then
    v_formula := case p_id
      when 'pv_max' then '{"op":"+","args":[{"const":10},{"ref":"atributo","id":"corpo"}]}'::jsonb
      when 'pe_max' then '{"op":"+","args":[{"const":10},{"ref":"atributo","id":"mente"}]}'::jsonb
      when 'mana_max' then '{"op":"+","args":[{"const":10},{"op":"*","args":[{"ref":"atributo","id":"animo"},{"const":2}]}]}'::jsonb
      when 'pa_max' then '{"const":3}'::jsonb
      when 'reacoes_por_rodada' then '{"ref":"atributo","id":"mente"}'::jsonb
      else '{"const":0}'::jsonb
    end;
  end if;
  v_value := public.vtt_hud_eval_formula(v_formula, p_character, p_rules, array[p_id]);
  if p_id = 'mana_max' then
    v_value := v_value + coalesce((p_character ->> 'mana_bonus_ruptura')::numeric, 0);
  end if;
  return trunc(v_value)::integer;
end;
$$;

revoke all on function public.vtt_hud_derived(jsonb, jsonb, text) from public, anon, authenticated;

-- Lista de tokens para o mapa. character_id, PV e condições são
-- projetados conforme autorização; os campos privados nunca aparecem
-- na resposta de um observador.
create or replace function public.read_vtt_scene_tokens(p_scene_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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
      'revision', v_token.revision
    ));
  end loop;
  return v_result;
end;
$$;

revoke all on function public.read_vtt_scene_tokens(uuid) from public, anon;
grant execute on function public.read_vtt_scene_tokens(uuid) to authenticated;

-- Projeção exclusiva do HUD selecionado. Para observador, resources só
-- contém chaves cujo olho está aberto; visibility/character/conditions
-- não são serializados.
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

revoke all on function public.read_vtt_token_hud(uuid) from public, anon;
grant execute on function public.read_vtt_token_hud(uuid) to authenticated;

create or replace function public.set_vtt_token_resource_visibility(
  p_token_id uuid,
  p_resource text,
  p_public boolean
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token public.vtt_tokens;
begin
  select * into v_token from public.vtt_tokens where id = p_token_id for update;
  if v_token is null then raise exception 'Token não encontrado.' using errcode = 'no_data_found'; end if;
  if not exists (select 1 from public.vtt_scenes s where s.id = v_token.scene_id and s.campaign_id = v_token.campaign_id and s.ativa) then
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
$$;

revoke all on function public.set_vtt_token_resource_visibility(uuid, text, boolean) from public, anon;
grant execute on function public.set_vtt_token_resource_visibility(uuid, text, boolean) to authenticated;

-- Estado próprio de token SEM personagem. Só PV e condições existentes;
-- a assinatura não oferece caminho para inventar PE/Mana/PA/Reações.
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
  if not exists (select 1 from public.vtt_scenes s where s.id = v_token.scene_id and s.campaign_id = v_token.campaign_id and s.ativa) then
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
$$;

revoke all on function public.mutate_unlinked_vtt_token_hud(uuid, text, jsonb, integer) from public, anon;
grant execute on function public.mutate_unlinked_vtt_token_hud(uuid, text, jsonb, integer) to authenticated;

-- Compare-and-swap do payload calculado pela mutação compartilhada do
-- Console. Mesmo escrevendo o JSON canônico inteiro, uma versão antiga
-- jamais vence outra área: updated_at divergente recusa a operação.
create or replace function public.update_linked_vtt_hud_character(
  p_token_id uuid,
  p_expected_updated_at timestamptz,
  p_payload jsonb
) returns public.characters
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token public.vtt_tokens;
  v_character public.characters;
begin
  select * into v_token from public.vtt_tokens where id = p_token_id for update;
  if v_token is null or v_token.character_id is null then raise exception 'Token sem personagem vinculado.' using errcode = 'check_violation'; end if;
  if not exists (select 1 from public.vtt_scenes s where s.id = v_token.scene_id and s.campaign_id = v_token.campaign_id and s.ativa) then
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
$$;

revoke all on function public.update_linked_vtt_hud_character(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.update_linked_vtt_hud_character(uuid, timestamptz, jsonb) to authenticated;

-- Invalidação sem dados para qualquer mudança de token (inclusive FK
-- set null, movimento e RPC futura) e para payload de personagem
-- vinculado. Duplicatas das RPCs antigas são inofensivas: o cliente
-- sequencia releituras e aplica somente a mais recente.
create or replace function public.vtt_hud_broadcast_token_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign uuid := coalesce(new.campaign_id, old.campaign_id);
  v_scene uuid := coalesce(new.scene_id, old.scene_id);
begin
  perform realtime.send(
    jsonb_build_object('v', 1, 'campaignId', v_campaign::text, 'sceneId', v_scene::text, 'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint),
    'tokens_changed', 'campaign:' || v_campaign::text || ':scene:' || v_scene::text || ':vtt:tokens-changed', true
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists vtt_tokens_hud_invalidation on public.vtt_tokens;
create trigger vtt_tokens_hud_invalidation
after insert or update or delete on public.vtt_tokens
for each row execute function public.vtt_hud_broadcast_token_changed();

create or replace function public.vtt_hud_broadcast_character_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token record;
begin
  for v_token in select campaign_id, scene_id from public.vtt_tokens where character_id = new.id loop
    perform realtime.send(
      jsonb_build_object('v', 1, 'campaignId', v_token.campaign_id::text, 'sceneId', v_token.scene_id::text, 'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint),
      'tokens_changed', 'campaign:' || v_token.campaign_id::text || ':scene:' || v_token.scene_id::text || ':vtt:tokens-changed', true
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists characters_vtt_hud_invalidation on public.characters;
create trigger characters_vtt_hud_invalidation
after update of payload on public.characters
for each row when (old.payload is distinct from new.payload)
execute function public.vtt_hud_broadcast_character_changed();

-- Evita leitura direta das colunas privadas. Consultas legítimas do
-- mapa usam read_vtt_scene_tokens; ferramentas de diagnóstico com
-- service_role continuam enxergando a tabela inteira.
revoke select on public.vtt_tokens from authenticated;
grant select (
  id, scene_id, campaign_id, nome, sigla, lado, vertente, q, r,
  tamanho, orientacao, pegada_personalizada, bloqueado, visivel,
  revision, created_at, updated_at
) on public.vtt_tokens to authenticated;

commit;
