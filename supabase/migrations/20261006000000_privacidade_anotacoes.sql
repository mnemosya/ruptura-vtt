-- Desenhos e textos privados são legíveis somente pelo autor.
-- A invalidação não carrega conteúdo: a leitura RLS decide a lista visível.
begin;

alter table public.vtt_scene_annotations
  add column privada boolean not null default false;
grant update (privada) on public.vtt_scene_annotations to authenticated;

drop policy vtt_scene_annotations_select on public.vtt_scene_annotations;
create policy vtt_scene_annotations_select on public.vtt_scene_annotations for select to authenticated
  using (public.vtt_pode_ver_cena(scene_id) and (not privada or autor_id = (select auth.uid())));

drop policy vtt_scene_annotations_update on public.vtt_scene_annotations;
create policy vtt_scene_annotations_update on public.vtt_scene_annotations for update to authenticated
  using (public.vtt_pode_interagir_cena(scene_id)
    and (autor_id = (select auth.uid()) or (not privada and public.is_campaign_owner(campaign_id))))
  with check (public.vtt_pode_interagir_cena(scene_id)
    and (autor_id = (select auth.uid()) or (not privada and public.is_campaign_owner(campaign_id))));

drop policy vtt_scene_annotations_delete on public.vtt_scene_annotations;
create policy vtt_scene_annotations_delete on public.vtt_scene_annotations for delete to authenticated
  using (public.vtt_pode_interagir_cena(scene_id)
    and (autor_id = (select auth.uid()) or (not privada and public.is_campaign_owner(campaign_id))));

create function public.vtt_anotacoes_canal_autorizado(p_topic text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.vtt_scenes s
    where s.id = (regexp_match(p_topic, '^campaign:([0-9a-fA-F-]{36}):scene:([0-9a-fA-F-]{36}):vtt:annotations-changed$'))[2]::uuid
      and s.campaign_id = (regexp_match(p_topic, '^campaign:([0-9a-fA-F-]{36}):scene:([0-9a-fA-F-]{36}):vtt:annotations-changed$'))[1]::uuid
      and public.vtt_pode_ver_cena(s.id)
  );
$$;
revoke all on function public.vtt_anotacoes_canal_autorizado(text) from public;
grant execute on function public.vtt_anotacoes_canal_autorizado(text) to authenticated;

create policy campaign_members_receive_annotations_changed_channel
on realtime.messages for select to authenticated
using (public.vtt_anotacoes_canal_autorizado(realtime.topic()));

create function public.vtt_avisar_anotacoes_alteradas() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_linha public.vtt_scene_annotations;
begin
  if tg_op = 'DELETE' then v_linha := old; else v_linha := new; end if;
  perform realtime.send(
    jsonb_build_object('v', 1, 'sceneId', v_linha.scene_id::text),
    'annotations_changed',
    'campaign:' || v_linha.campaign_id::text || ':scene:' || v_linha.scene_id::text || ':vtt:annotations-changed',
    true
  );
  return null;
end $$;
create trigger vtt_avisar_anotacoes_alteradas after insert or update or delete on public.vtt_scene_annotations
  for each row execute function public.vtt_avisar_anotacoes_alteradas();

do $$ begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'vtt_scene_annotations') then
    alter publication supabase_realtime drop table public.vtt_scene_annotations;
  end if;
end $$;

-- A duplicação completa preserva a visibilidade de cada anotação.
-- A definição de duplicate_vtt_scene é reaplicada abaixo com a nova coluna.
create or replace function public.duplicate_vtt_scene(
  p_scene_id uuid,
  p_nome     text default null,
  -- 'completa' = tudo que é reusável; 'mapa' = só cenário (config,
  -- camadas, imagens e terreno). São os dois modos que o diálogo
  -- oferece; a duplicação seletiva por categoria é fase 5.
  p_modo     text default 'completa'
) returns vtt_scenes
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_origem   vtt_scenes;
  v_nova     vtt_scenes;
  v_nome     text;
  v_ordem    integer;
  v_map_tok  jsonb := '{}'::jsonb;
  v_map_obj  jsonb := '{}'::jsonb;
begin
  if p_modo not in ('completa', 'mapa') then
    raise exception 'Modo de duplicação desconhecido: %', p_modo using errcode = 'invalid_parameter_value';
  end if;

  select * into v_origem from vtt_scenes where id = p_scene_id;
  if v_origem.id is null then
    raise exception 'Cena não encontrada.' using errcode = 'no_data_found';
  end if;
  if not public.is_campaign_owner(v_origem.campaign_id, v_uid) then
    raise exception 'Só o narrador duplica cenas.' using errcode = '42501';
  end if;

  v_nome := coalesce(nullif(btrim(p_nome), ''), v_origem.nome || ' (cópia)');

  select coalesce(max(ordem), -1) + 1 into v_ordem
    from vtt_scenes where campaign_id = v_origem.campaign_id;

  -- A cópia nasce NÃO arquivada mesmo que a origem esteja: duplicar uma
  -- cena arquivada é justamente como se reaproveita um mapa guardado, e
  -- a cópia nascer congelada obrigaria a restaurá-la em seguida.
  insert into vtt_scenes (
    campaign_id, nome, local, resumo, largura, altura, ativa, camadas,
    ordem, duplicated_from_id, created_by, updated_by
  ) values (
    v_origem.campaign_id, v_nome, v_origem.local, v_origem.resumo,
    v_origem.largura, v_origem.altura, false, v_origem.camadas,
    v_ordem, v_origem.id, v_uid, v_uid
  ) returning * into v_nova;

  -- ── Imagens: a mesma colocação, o MESMO asset ──────────────────────
  insert into vtt_scene_images (
    scene_id, campaign_id, image_id, papel, centro_q, centro_r,
    largura_m, altura_m, rotacao_graus, opacidade, camada, z,
    visivel, travado, criador_id
  )
  select v_nova.id, campaign_id, image_id, papel, centro_q, centro_r,
         largura_m, altura_m, rotacao_graus, opacidade, camada, z,
         visivel, travado, v_uid
    from vtt_scene_images where scene_id = p_scene_id;

  -- ── Terreno ────────────────────────────────────────────────────────
  insert into vtt_terrain (scene_id, campaign_id, q, r, tipo, updated_by)
  select v_nova.id, campaign_id, q, r, tipo, v_uid
    from vtt_terrain where scene_id = p_scene_id;

  if p_modo = 'mapa' then
    return v_nova;
  end if;

  -- ── Tokens, guardando velho→novo ───────────────────────────────────
  with origem as (
    select t.*, gen_random_uuid() as novo_id
      from vtt_tokens t where t.scene_id = p_scene_id
  ), inseridos as (
    insert into vtt_tokens (
      id, scene_id, campaign_id, character_id, nome, sigla, lado, vertente,
      q, r, tamanho, bloqueado, visivel, orientacao, pegada_personalizada,
      retrato_url, pv_atual, pv_max, condicoes, pv_publico, pe_publico,
      mana_publica, offset_q, offset_r, retrato_image_id
    )
    select novo_id, v_nova.id, campaign_id, character_id, nome, sigla, lado, vertente,
           q, r, tamanho, bloqueado, visivel, orientacao, pegada_personalizada,
           retrato_url, pv_atual, pv_max, condicoes, pv_publico, pe_publico,
           mana_publica, offset_q, offset_r, retrato_image_id
      from origem
    returning id
  )
  select coalesce(jsonb_object_agg(origem.id::text, origem.novo_id::text), '{}'::jsonb)
    into v_map_tok
    from origem;

  -- ── Áreas, com a aura reapontada para o token NOVO ─────────────────
  insert into vtt_areas (
    scene_id, campaign_id, tipo, origem_q, origem_r, direcao_graus,
    raio_m, comprimento_m, largura_m, altura_m, lado_m, abertura_graus,
    nivel_origem_m, modo_linha, pontos, token_id, cor, opacidade,
    rotulo, visivel, criador_id
  )
  select v_nova.id, campaign_id, tipo, origem_q, origem_r, direcao_graus,
         raio_m, comprimento_m, largura_m, altura_m, lado_m, abertura_graus,
         nivel_origem_m, modo_linha, pontos,
         -- Uma aura cujo token não veio junto perderia o dono. Não
         -- acontece hoje (tokens são copiados inteiros), mas deixar o
         -- `token_id` original entrar seria pior que deixá-lo nulo:
         -- seria a cópia mexendo no estado da cena de origem.
         case when token_id is null then null
              else (v_map_tok ->> token_id::text)::uuid end,
         cor, opacidade, rotulo, visivel, v_uid
    from vtt_areas where scene_id = p_scene_id;

  -- ── Objetos, guardando velho→novo ──────────────────────────────────
  with origem as (
    select o.*, gen_random_uuid() as novo_id
      from vtt_objects o where o.scene_id = p_scene_id
  ), inseridos as (
    insert into vtt_objects (
      id, scene_id, campaign_id, nome, preset, bloqueia_movimento,
      terreno_projetado, grau_cobertura, categoria, pd, pd_max,
      visivel, travado, criador_id
    )
    select novo_id, v_nova.id, campaign_id, nome, preset, bloqueia_movimento,
           terreno_projetado, grau_cobertura, categoria, pd, pd_max,
           visivel, travado, v_uid
      from origem
    returning id
  )
  select coalesce(jsonb_object_agg(origem.id::text, origem.novo_id::text), '{}'::jsonb)
    into v_map_obj
    from origem;

  insert into vtt_object_cells (object_id, scene_id, q, r)
  select (v_map_obj ->> c.object_id::text)::uuid, v_nova.id, c.q, c.r
    from vtt_object_cells c where c.scene_id = p_scene_id;

  -- ── Marcações: só as PERSISTENTES ──────────────────────────────────
  -- 'rodada' e 'combate' são amarradas a um combate que a cópia não
  -- herda (a trilha não vem junto); copiá-las criaria marcas que nunca
  -- expiram, porque a rodada que as apagaria não existe nesta cena.
  insert into vtt_marks (
    scene_id, campaign_id, autor_id, tipo, pontos, texto, cor,
    espessura, opacidade, privada, sinal, duracao
  )
  select v_nova.id, campaign_id, autor_id, tipo, pontos, texto, cor,
         espessura, opacidade, privada, sinal, duracao
    from vtt_marks
   where scene_id = p_scene_id and duracao = 'persistente';

  -- Desenhos e textos acompanham apenas a cópia completa da cena.
  insert into public.vtt_scene_annotations (
    scene_id, campaign_id, autor_id, tipo, pontos, texto, cor, espessura, tamanho, privada
  )
  select v_nova.id, campaign_id, autor_id, tipo, pontos, texto, cor, espessura, tamanho, privada
    from public.vtt_scene_annotations where scene_id = p_scene_id;

  return v_nova;
end;
$$;

commit;
