-- LIGHT-02: modelo 2D de iluminação. Nenhum dado privado via Realtime.
begin;

alter table public.vtt_tokens add column visao_noturna boolean not null default false;
create function public.vtt_light_night_vision_write() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.visao_noturna is distinct from old.visao_noturna then
    if not public.is_campaign_owner(old.campaign_id) then
      raise exception 'Só o narrador altera visão noturna.' using errcode = '42501';
    end if;
    if new.revision <> old.revision + 1 then
      raise exception 'Revisão do token desatualizada.' using errcode = '40001';
    end if;
  end if;
  return new;
end;
$$;
create trigger vtt_light_night_vision_write before update of visao_noturna on public.vtt_tokens
  for each row execute function public.vtt_light_night_vision_write();

create table public.vtt_light_settings (
  scene_id uuid primary key references public.vtt_scenes(id) on delete cascade,
  campaign_id uuid not null,
  modo text not null default 'claro' check (modo in ('claro', 'penumbra', 'escuro')),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  foreign key (scene_id, campaign_id) references public.vtt_scenes(id, campaign_id) on delete cascade
);

create table public.vtt_light_walls (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null,
  campaign_id uuid not null,
  a_q numeric(7,3) not null, a_r numeric(7,3) not null,
  b_q numeric(7,3) not null, b_r numeric(7,3) not null,
  bloqueia_luz boolean not null default true,
  bloqueia_visao boolean not null default true,
  porta boolean not null default false,
  aberta boolean not null default false,
  visivel boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  foreign key (scene_id, campaign_id) references public.vtt_scenes(id, campaign_id) on delete cascade,
  check (a_q <> b_q or a_r <> b_r),
  check (a_q between -200 and 200 and a_r between -200 and 200 and b_q between -200 and 200 and b_r between -200 and 200)
);
create index vtt_light_walls_scene_idx on public.vtt_light_walls(scene_id);

create table public.vtt_light_sources (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null,
  campaign_id uuid not null,
  token_id uuid null references public.vtt_tokens(id) on delete cascade,
  origem_q numeric(7,3), origem_r numeric(7,3),
  raio_m numeric(5,2) not null check (raio_m > 0 and raio_m <= 12),
  formato text not null default 'radial' check (formato in ('radial', 'cone')),
  abertura_graus numeric(5,2),
  direcao_graus numeric(5,2) not null default 0 check (direcao_graus >= 0 and direcao_graus < 360),
  intensidade text not null default 'forte' check (intensidade in ('fraca', 'forte')),
  cor text not null default '#ffffff' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  ativa boolean not null default true,
  visivel boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  foreign key (scene_id, campaign_id) references public.vtt_scenes(id, campaign_id) on delete cascade,
  check ((token_id is null and origem_q is not null and origem_r is not null) or (token_id is not null and origem_q is null and origem_r is null)),
  check ((formato = 'radial' and abertura_graus is null) or (formato = 'cone' and abertura_graus between 1 and 180))
);
create index vtt_light_sources_scene_idx on public.vtt_light_sources(scene_id);

create function public.vtt_light_validate_write() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_scene public.vtt_scenes; v_count integer;
begin
  select * into v_scene from public.vtt_scenes where id = new.scene_id for update;
  if v_scene is null or v_scene.campaign_id <> new.campaign_id or not public.is_campaign_owner(new.campaign_id) then
    raise exception 'Sem permissão para editar a iluminação.' using errcode = '42501';
  end if;
  if tg_table_name = 'vtt_light_walls' then
    if new.a_r < 0 or new.a_r >= v_scene.altura or new.b_r < 0 or new.b_r >= v_scene.altura
      or new.a_q < -floor(new.a_r / 2) or new.a_q >= -floor(new.a_r / 2) + v_scene.largura
      or new.b_q < -floor(new.b_r / 2) or new.b_q >= -floor(new.b_r / 2) + v_scene.largura
    then raise exception 'Parede fora da grade da cena.' using errcode = '23514'; end if;
  elsif tg_table_name = 'vtt_light_sources' then
    if new.token_id is null and (
      new.origem_r < 0 or new.origem_r >= v_scene.altura
      or new.origem_q < -floor(new.origem_r / 2)
      or new.origem_q >= -floor(new.origem_r / 2) + v_scene.largura
    ) then raise exception 'Fonte fora da grade da cena.' using errcode = '23514'; end if;
    if new.token_id is not null and not exists (
      select 1 from public.vtt_tokens t where t.id = new.token_id and t.scene_id = new.scene_id and t.campaign_id = new.campaign_id
    ) then raise exception 'Token da fonte pertence a outra cena.' using errcode = '23514'; end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.scene_id <> old.scene_id or new.campaign_id <> old.campaign_id or new.revision <> old.revision + 1 then
      raise exception 'Revisão ou cena inválida.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'vtt_light_walls' then
    select count(*) into v_count from public.vtt_light_walls where scene_id = new.scene_id;
    if v_count >= 600 then raise exception 'Limite de 600 paredes atingido.' using errcode = '23514'; end if;
  elsif tg_table_name = 'vtt_light_sources' then
    select count(*) into v_count from public.vtt_light_sources where scene_id = new.scene_id;
    if v_count >= 16 then raise exception 'Limite de 16 fontes atingido.' using errcode = '23514'; end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger vtt_light_settings_write before insert or update on public.vtt_light_settings for each row execute function public.vtt_light_validate_write();
create trigger vtt_light_walls_write before insert or update on public.vtt_light_walls for each row execute function public.vtt_light_validate_write();
create trigger vtt_light_sources_write before insert or update on public.vtt_light_sources for each row execute function public.vtt_light_validate_write();

alter table public.vtt_light_settings enable row level security;
alter table public.vtt_light_walls enable row level security;
alter table public.vtt_light_sources enable row level security;
grant select, insert, update, delete on public.vtt_light_settings, public.vtt_light_walls, public.vtt_light_sources to authenticated;

create policy vtt_light_settings_read on public.vtt_light_settings for select to authenticated
  using (public.vtt_pode_ver_cena(scene_id));
create policy vtt_light_settings_insert on public.vtt_light_settings for insert to authenticated
  with check (public.is_campaign_owner(campaign_id));
create policy vtt_light_settings_update on public.vtt_light_settings for update to authenticated
  using (public.is_campaign_owner(campaign_id)) with check (public.is_campaign_owner(campaign_id));
create policy vtt_light_settings_delete on public.vtt_light_settings for delete to authenticated
  using (public.is_campaign_owner(campaign_id));

create policy vtt_light_walls_read on public.vtt_light_walls for select to authenticated
  using (public.vtt_pode_ver_cena(scene_id) and (visivel or public.is_campaign_owner(campaign_id)));
create policy vtt_light_walls_insert on public.vtt_light_walls for insert to authenticated
  with check (public.is_campaign_owner(campaign_id));
create policy vtt_light_walls_update on public.vtt_light_walls for update to authenticated
  using (public.is_campaign_owner(campaign_id)) with check (public.is_campaign_owner(campaign_id));
create policy vtt_light_walls_delete on public.vtt_light_walls for delete to authenticated
  using (public.is_campaign_owner(campaign_id));

create policy vtt_light_sources_read on public.vtt_light_sources for select to authenticated
  using (public.vtt_pode_ver_cena(scene_id) and (visivel or public.is_campaign_owner(campaign_id))
    and (token_id is null or public.is_campaign_owner(campaign_id) or exists (
      select 1 from public.vtt_tokens t where t.id = token_id and t.scene_id = vtt_light_sources.scene_id
        and t.campaign_id = vtt_light_sources.campaign_id and t.visivel
    )));
create policy vtt_light_sources_insert on public.vtt_light_sources for insert to authenticated
  with check (public.is_campaign_owner(campaign_id));
create policy vtt_light_sources_update on public.vtt_light_sources for update to authenticated
  using (public.is_campaign_owner(campaign_id)) with check (public.is_campaign_owner(campaign_id));
create policy vtt_light_sources_delete on public.vtt_light_sources for delete to authenticated
  using (public.is_campaign_owner(campaign_id));

-- Canal de invalidação: o payload nunca contém a entidade editada.
create function public.vtt_light_channel_autorizado(p_topic text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_match text[];
begin
  v_match := regexp_match(p_topic, '^campaign:([0-9a-fA-F-]{36}):scene:([0-9a-fA-F-]{36}):vtt:light-changed$');
  if v_match is null then return false; end if;
  return public.vtt_pode_ver_cena(v_match[2]::uuid)
    and exists (select 1 from public.vtt_scenes s where s.id = v_match[2]::uuid and s.campaign_id = v_match[1]::uuid);
exception when invalid_text_representation then return false;
end;
$$;
revoke all on function public.vtt_light_channel_autorizado(text) from public, anon;
grant execute on function public.vtt_light_channel_autorizado(text) to authenticated;
create policy campaign_members_receive_light_changed_channel on realtime.messages
  for select to authenticated using (public.vtt_light_channel_autorizado(realtime.topic()));

-- O canal legado de movimento é da campanha inteira e aceita payload do
-- cliente. Em cena escura, nem um cliente antigo pode publicar uma rota.
create function public.vtt_light_movement_channel_safe(p_topic text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_campaign uuid;
begin
  if p_topic !~ '^campaign:[0-9a-fA-F-]{36}:vtt:movimento$' then return true; end if;
  v_campaign := (regexp_match(p_topic, '^campaign:([0-9a-fA-F-]{36}):vtt:movimento$'))[1]::uuid;
  return not exists (
    select 1 from public.vtt_light_settings ls
    where ls.campaign_id = v_campaign and ls.modo <> 'claro'
  );
exception when invalid_text_representation then return false;
end;
$$;
revoke all on function public.vtt_light_movement_channel_safe(text) from public, anon;
grant execute on function public.vtt_light_movement_channel_safe(text) to authenticated;
create policy light_restricts_legacy_movement_channel on realtime.messages
  as restrictive for all to authenticated
  using (public.vtt_light_movement_channel_safe(realtime.topic()))
  with check (public.vtt_light_movement_channel_safe(realtime.topic()));

create function public.vtt_light_invalidate() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row record;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  perform realtime.send(
    jsonb_build_object('v', 1, 'sceneId', v_row.scene_id),
    'light_changed',
    'campaign:' || v_row.campaign_id::text || ':scene:' || v_row.scene_id::text || ':vtt:light-changed',
    true
  );
  return null;
end;
$$;
create trigger vtt_light_settings_notify after insert or update or delete on public.vtt_light_settings for each row execute function public.vtt_light_invalidate();
create trigger vtt_light_walls_notify after insert or update or delete on public.vtt_light_walls for each row execute function public.vtt_light_invalidate();
create trigger vtt_light_sources_notify after insert or update or delete on public.vtt_light_sources for each row execute function public.vtt_light_invalidate();
create trigger vtt_light_night_vision_notify after update of visao_noturna on public.vtt_tokens
  for each row when (old.visao_noturna is distinct from new.visao_noturna)
  execute function public.vtt_light_invalidate();

-- Interseção de segmentos no plano axial (transformação linear preserva
-- interseções). Paredes privadas não produzem silhueta para jogador.
create function public.vtt_light_linha_livre(
  p_scene_id uuid, p_a_q double precision, p_a_r double precision,
  p_b_q double precision, p_b_r double precision, p_tipo text
) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare w record; den double precision; t double precision; u double precision;
dx double precision := p_b_q - p_a_q; dy double precision := p_b_r - p_a_r;
wx double precision; wy double precision; qx double precision; qy double precision;
begin
  for w in select a_q, a_r, b_q, b_r from public.vtt_light_walls
    where scene_id = p_scene_id and visivel and not (porta and aberta)
      and case when p_tipo = 'luz' then bloqueia_luz else bloqueia_visao end
  loop
    wx := w.b_q - w.a_q; wy := w.b_r - w.a_r;
    den := dx * wy - dy * wx;
    if abs(den) < 0.0000001 then continue; end if;
    qx := w.a_q - p_a_q; qy := w.a_r - p_a_r;
    t := (qx * wy - qy * wx) / den;
    u := (qx * dy - qy * dx) / den;
    if t > 0.000001 and t < 0.999999 and u >= 0 and u <= 1 then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.vtt_light_linha_livre(uuid, double precision, double precision, double precision, double precision, text) from public, anon;

create function public.vtt_light_ponto_iluminado(p_scene_id uuid, p_q double precision, p_r double precision)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s record; x double precision; y double precision; dq double precision; dr double precision;
ang double precision; diff double precision; dir double precision;
begin
  for s in select ls.*, t.q as token_q, t.r as token_r, t.visivel as token_visivel
    from public.vtt_light_sources ls left join public.vtt_tokens t
      on t.id = ls.token_id and t.scene_id = ls.scene_id and t.campaign_id = ls.campaign_id
    where ls.scene_id = p_scene_id and ls.ativa and ls.visivel
  loop
    if s.token_id is not null and not coalesce(s.token_visivel, false) then continue; end if;
    x := coalesce(s.token_q::double precision, s.origem_q::double precision);
    y := coalesce(s.token_r::double precision, s.origem_r::double precision);
    dq := p_q - x; dr := p_r - y;
    if greatest(abs(dq), abs(dr), abs(dq + dr)) > s.raio_m then continue; end if;
    if s.formato = 'cone' then
      ang := degrees(atan2(dr * sqrt(3.0) / 2, dq + dr / 2));
      dir := case when s.token_id is null then s.direcao_graus else s.direcao_graus + (select direcao * 60 from public.vtt_tokens where id = s.token_id) end;
      diff := ang - dir - 360 * floor((ang - dir + 180) / 360);
      if abs(diff) > s.abertura_graus / 2 then continue; end if;
    end if;
    if public.vtt_light_linha_livre(p_scene_id, x, y, p_q, p_r, 'luz') then return true; end if;
  end loop;
  return false;
end;
$$;
revoke all on function public.vtt_light_ponto_iluminado(uuid, double precision, double precision) from public, anon;

create function public.vtt_light_ponto_visivel(
  p_scene_id uuid, p_q double precision, p_r double precision
) returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_campaign uuid; v_modo text; t record; p_user_id uuid := auth.uid();
begin
  if p_user_id is null or p_q is null or p_r is null then return false; end if;
  select campaign_id into v_campaign from public.vtt_scenes where id = p_scene_id;
  if v_campaign is null or not public.vtt_pode_ver_cena(p_scene_id, p_user_id) then return false; end if;
  if public.is_campaign_owner(v_campaign, p_user_id) then return true; end if;
  select modo into v_modo from public.vtt_light_settings where scene_id = p_scene_id;
  if coalesce(v_modo, 'claro') = 'claro' then return true; end if;
  for t in select q, r, visao_noturna from public.vtt_tokens
    where scene_id = p_scene_id and visivel and character_id is not null
      and public.is_character_controller_for(character_id, campaign_id, p_user_id)
  loop
    if greatest(abs(p_q - t.q), abs(p_r - t.r), abs(p_q - t.q + p_r - t.r)) > 12 then continue; end if;
    if not public.vtt_light_linha_livre(p_scene_id, t.q, t.r, p_q, p_r, 'visao') then continue; end if;
    if v_modo = 'penumbra' or t.visao_noturna or public.vtt_light_ponto_iluminado(p_scene_id, p_q, p_r) then return true; end if;
  end loop;
  return false;
end;
$$;
revoke all on function public.vtt_light_ponto_visivel(uuid, double precision, double precision) from public, anon;
grant execute on function public.vtt_light_ponto_visivel(uuid, double precision, double precision) to authenticated;

-- Aura e assinatura de retrato usam este helper, fora das projeções da cena.
create or replace function public.vtt_token_visivel_para(p_token_id uuid, check_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.vtt_tokens t where t.id = p_token_id
      and public.is_campaign_member(t.campaign_id, check_user_id)
      and (t.visivel or public.is_campaign_owner(t.campaign_id, check_user_id))
      and (public.is_campaign_owner(t.campaign_id, check_user_id)
        or (check_user_id = auth.uid() and
          (public.can_move_vtt_token(t.id) or public.vtt_light_ponto_visivel(t.scene_id, t.q, t.r))))
  );
$$;

drop policy if exists vtt_tokens_select on public.vtt_tokens;
create policy vtt_tokens_select on public.vtt_tokens for select to authenticated
  using (public.vtt_pode_ver_cena(scene_id) and (visivel or public.is_campaign_owner(campaign_id))
    and (public.can_move_vtt_token(id) or public.vtt_light_ponto_visivel(scene_id, q, r)));


-- SELECT direto e RPCs privilegiadas usam o MESMO predicado de visão.
create function public.vtt_light_objeto_visivel(p_object_id uuid, p_scene_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.vtt_objects o join public.vtt_object_cells cv on cv.object_id = o.id
    where o.id = p_object_id and o.scene_id = p_scene_id
      and public.vtt_pode_ver_cena(o.scene_id)
      and (o.visivel or public.is_campaign_owner(o.campaign_id))
      and public.vtt_light_ponto_visivel(p_scene_id, cv.q, cv.r)
  );
$$;
revoke all on function public.vtt_light_objeto_visivel(uuid, uuid) from public, anon;
grant execute on function public.vtt_light_objeto_visivel(uuid, uuid) to authenticated;
drop policy if exists vtt_objects_select on public.vtt_objects;
create policy vtt_objects_select on public.vtt_objects for select to authenticated
  using (public.vtt_pode_ver_cena(scene_id) and (visivel or public.is_campaign_owner(campaign_id))
    and public.vtt_light_objeto_visivel(id, scene_id));
drop policy if exists vtt_object_cells_select on public.vtt_object_cells;
create policy vtt_object_cells_select on public.vtt_object_cells for select to authenticated
  using (exists (select 1 from public.vtt_objects o where o.id = object_id
    and public.vtt_pode_ver_cena(o.scene_id) and (o.visivel or public.is_campaign_owner(o.campaign_id))
    and public.vtt_light_ponto_visivel(o.scene_id, q, r)));

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
      and (public.can_move_vtt_token(id) or public.vtt_light_ponto_visivel(p_scene_id, q, r))
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
      'direcao', v_token.direcao,
      'visao_noturna', case when v_control then v_token.visao_noturna else null end,
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
          and public.vtt_light_ponto_visivel(p_scene_id, c.q, c.r)
      ), '[]'::jsonb)
    ) as item
    from vtt_objects o
    where o.scene_id = p_scene_id
      and (o.visivel or is_campaign_owner(o.campaign_id))
      and exists (select 1 from public.vtt_object_cells cv where cv.object_id = o.id
        and public.vtt_light_ponto_visivel(p_scene_id, cv.q, cv.r))
  ) s;

  return v_result;
end;
$function$;

-- Projeções privilegiadas que antes contornavam a RLS de FoV.
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


create or replace function public.read_vtt_targets(p_scene_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tokenId', t.id, 'autorId', a.user_id, 'expiresAt', a.expires_at
  )), '[]'::jsonb)
  from vtt_targets a join vtt_tokens t on t.id = a.token_id
  where t.scene_id = p_scene_id and a.expires_at > now()
    and vtt_pode_ver_cena(t.scene_id)
    and is_campaign_member(t.campaign_id, a.user_id)
    and (t.visivel or is_campaign_owner(t.campaign_id))
    and (public.can_move_vtt_token(t.id) or public.vtt_light_ponto_visivel(t.scene_id, t.q, t.r));
$$;

create or replace function public.set_vtt_target(p_scene_id uuid, p_token_id uuid, p_selected boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_campaign uuid; v_count integer;
begin
  select campaign_id into v_campaign from vtt_tokens
  where id = p_token_id and scene_id = p_scene_id
    and vtt_pode_interagir_cena(scene_id) and (visivel or is_campaign_owner(campaign_id))
    and (public.can_move_vtt_token(id) or public.vtt_light_ponto_visivel(scene_id, q, r));
  if v_campaign is null or auth.uid() is null then
    raise exception 'Token indisponível para marcar como alvo.' using errcode = '42501';
  end if;
  -- Serializa alterações do mesmo usuário, inclusive em abas distintas.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 49));
  delete from vtt_targets where user_id = auth.uid() and expires_at <= now();
  if p_selected then
    select count(*) into v_count from vtt_targets a join vtt_tokens t on t.id=a.token_id
      where a.user_id=auth.uid() and t.scene_id=p_scene_id;
    if v_count >= 32 and not exists(select 1 from vtt_targets where user_id=auth.uid() and token_id=p_token_id) then
      raise exception 'Limite de 32 alvos por participante.';
    end if;
    insert into vtt_targets(token_id,user_id) values(p_token_id,auth.uid())
      on conflict(token_id,user_id) do update set expires_at=now()+interval '90 seconds';
  else
    delete from vtt_targets where token_id=p_token_id and user_id=auth.uid();
  end if;
  perform realtime.send(jsonb_build_object('sceneId',p_scene_id), 'targets_changed',
    'campaign:'||v_campaign||':scene:'||p_scene_id||':vtt:targets',true);
  return read_vtt_targets(p_scene_id);
end;
$$;

create or replace function public.renew_vtt_targets(p_scene_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Uma aba não recria alvos removidos por outra; só renova os existentes.
  update vtt_targets a set expires_at=now()+interval '90 seconds'
  from vtt_tokens t where t.id=a.token_id and t.scene_id=p_scene_id
    and a.user_id=auth.uid() and a.expires_at>now()
    and vtt_pode_interagir_cena(t.scene_id) and (t.visivel or is_campaign_owner(t.campaign_id))
    and (public.can_move_vtt_token(t.id) or public.vtt_light_ponto_visivel(t.scene_id, t.q, t.r));
  return read_vtt_targets(p_scene_id);
end;
$$;


create or replace function public.read_vtt_action_context(p_actor_id uuid,p_target_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a vtt_tokens; t vtt_tokens;
begin
  select * into a from vtt_tokens where id=p_actor_id;
  if a.id is null or a.character_id is null or not can_move_vtt_token(a.id)
    or (not a.visivel and not is_campaign_owner(a.campaign_id)) then
    raise exception 'Você não controla este personagem.' using errcode='42501';
  end if;
  if p_target_id is not null then
    select * into t from vtt_tokens where id=p_target_id and scene_id=a.scene_id
      and campaign_id=a.campaign_id and (visivel or is_campaign_owner(campaign_id))
      and (public.can_move_vtt_token(id) or public.vtt_light_ponto_visivel(scene_id, q, r));
    if t.id is null then raise exception 'Alvo indisponível nesta cena.' using errcode='42501'; end if;
  end if;
  return jsonb_build_object('campaignId',a.campaign_id,'sceneId',a.scene_id,
    'actorCharacterId',a.character_id,'actorTokenId',a.id,
    'alvoTokenId',t.id,'alvoCharacterId',t.character_id,'alvoNome',t.nome,
    'logVisibility',case when not a.visivel or (t.id is not null and not t.visivel) then 'gm' else 'public' end);
end;
$$;


-- Prévia do narrador: usa as mesmas projeções sob a identidade do
-- participante escolhido. A claim local é restaurada também em erro.
create function public.read_vtt_light_preview(p_scene_id uuid, p_player_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_campaign uuid; v_original_uid text := current_setting('request.jwt.claim.sub', true);
  v_result jsonb;
begin
  select campaign_id into v_campaign from public.vtt_scenes where id = p_scene_id;
  if v_campaign is null or not public.is_campaign_owner(v_campaign)
    or not public.is_campaign_member(v_campaign, p_player_id)
    or public.is_campaign_owner(v_campaign, p_player_id)
    or not public.vtt_pode_ver_cena(p_scene_id, p_player_id) then
    raise exception 'Prévia indisponível para este participante e cena.' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', p_player_id::text, true);
  v_result := jsonb_build_object(
    'tokens', public.read_vtt_scene_tokens(p_scene_id),
    'objetos', public.read_vtt_scene_objects(p_scene_id),
    'imagens', public.read_vtt_scene_images(p_scene_id),
    'areas', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at) from public.vtt_areas a
      where a.scene_id = p_scene_id
        and (a.visivel or a.criador_id = p_player_id)
        and (a.tipo <> 'aura' or a.token_id is null or public.vtt_token_visivel_para(a.token_id))
    ), '[]'::jsonb)
  );
  perform set_config('request.jwt.claim.sub', coalesce(v_original_uid, ''), true);
  return v_result;
exception when others then
  perform set_config('request.jwt.claim.sub', coalesce(v_original_uid, ''), true);
  raise;
end;
$$;
revoke all on function public.read_vtt_light_preview(uuid, uuid) from public, anon;
grant execute on function public.read_vtt_light_preview(uuid, uuid) to authenticated;

commit;
