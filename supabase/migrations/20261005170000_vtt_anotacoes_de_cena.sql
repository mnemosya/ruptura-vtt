-- Desenhos e textos são uma camada própria, independente de vtt_marks.
begin;

create table public.vtt_scene_annotations (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null,
  campaign_id uuid not null,
  autor_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('desenho', 'texto')),
  pontos jsonb not null check (jsonb_typeof(pontos) = 'array' and jsonb_array_length(pontos) between 1 and 512),
  texto text check (texto is null or char_length(texto) between 1 and 500),
  cor text not null default 'ciano' check (cor in ('ciano', 'ambar', 'verde', 'vermelho', 'roxo', 'branco')),
  espessura integer not null default 2 check (espessura between 1 and 6),
  tamanho integer not null default 16 check (tamanho between 12 and 32),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  constraint vtt_scene_annotations_scene_fk foreign key (scene_id, campaign_id)
    references public.vtt_scenes(id, campaign_id) on delete cascade,
  constraint vtt_scene_annotations_conteudo check (
    (tipo = 'desenho' and texto is null and jsonb_array_length(pontos) >= 2) or
    (tipo = 'texto' and texto is not null and jsonb_array_length(pontos) = 1)
  )
);
create index vtt_scene_annotations_scene_idx on public.vtt_scene_annotations (scene_id, created_at);

create function public.vtt_validar_anotacao() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  p jsonb;
  v_camadas jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.scene_id <> old.scene_id or new.campaign_id <> old.campaign_id
      or new.autor_id <> old.autor_id or new.tipo <> old.tipo then
      raise exception 'Não é possível alterar a identidade de uma anotação.' using errcode = '42501';
    end if;
    new.revision := old.revision + 1;
  else
    -- Serializa inserções da mesma cena para que duas requisições não ultrapassem o limite juntas.
    perform pg_advisory_xact_lock(hashtextextended(new.scene_id::text, 0));
    if (select count(*) from public.vtt_scene_annotations where scene_id = new.scene_id) >= 500 then
      raise exception 'Esta cena atingiu o limite de 500 anotações.' using errcode = 'check_violation';
    end if;
  end if;
  select camadas into v_camadas from public.vtt_scenes where id = new.scene_id;
  if auth.uid() is not null and coalesce((v_camadas -> 'anotacoes' ->> 'bloqueada')::boolean, false) then
    raise exception 'A camada Desenhos e textos está bloqueada.' using errcode = '42501';
  end if;
  for p in select value from jsonb_array_elements(new.pontos) loop
    if jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'q') <> 'number'
      or jsonb_typeof(p -> 'r') <> 'number'
      or abs((p ->> 'q')::numeric) > 10000 or abs((p ->> 'r')::numeric) > 10000 then
      raise exception 'Ponto inválido na anotação.' using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;
create trigger vtt_validar_anotacao before insert or update on public.vtt_scene_annotations
  for each row execute function public.vtt_validar_anotacao();

create function public.vtt_validar_remocao_anotacao() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_camadas jsonb;
begin
  select camadas into v_camadas from public.vtt_scenes where id = old.scene_id;
  if auth.uid() is not null and coalesce((v_camadas -> 'anotacoes' ->> 'bloqueada')::boolean, false) then
    raise exception 'A camada Desenhos e textos está bloqueada.' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger vtt_validar_remocao_anotacao before delete on public.vtt_scene_annotations
  for each row execute function public.vtt_validar_remocao_anotacao();

alter table public.vtt_scene_annotations enable row level security;
revoke all on public.vtt_scene_annotations from anon, authenticated;
grant select, insert, delete on public.vtt_scene_annotations to authenticated;
grant update (pontos, texto, cor, espessura, tamanho) on public.vtt_scene_annotations to authenticated;
create policy vtt_scene_annotations_select on public.vtt_scene_annotations for select to authenticated
  using (public.vtt_pode_ver_cena(scene_id));
create policy vtt_scene_annotations_insert on public.vtt_scene_annotations for insert to authenticated
  with check (public.vtt_pode_interagir_cena(scene_id) and autor_id = (select auth.uid()));
create policy vtt_scene_annotations_update on public.vtt_scene_annotations for update to authenticated
  using (public.vtt_pode_interagir_cena(scene_id) and (autor_id = (select auth.uid()) or public.is_campaign_owner(campaign_id)))
  with check (public.vtt_pode_interagir_cena(scene_id) and (autor_id = (select auth.uid()) or public.is_campaign_owner(campaign_id)));
create policy vtt_scene_annotations_delete on public.vtt_scene_annotations for delete to authenticated
  using (public.vtt_pode_interagir_cena(scene_id) and (autor_id = (select auth.uid()) or public.is_campaign_owner(campaign_id)));

alter table public.vtt_scene_annotations replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vtt_scene_annotations') then
    alter publication supabase_realtime add table public.vtt_scene_annotations;
  end if;
end $$;
create trigger vtt_congela_vtt_scene_annotations before insert or update or delete on public.vtt_scene_annotations
  for each row execute function public.vtt_recusar_escrita_em_cena_arquivada();

-- Mantém os dois modos de duplicação: mapa não leva anotações.
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
    scene_id, campaign_id, autor_id, tipo, pontos, texto, cor, espessura, tamanho
  )
  select v_nova.id, campaign_id, autor_id, tipo, pontos, texto, cor, espessura, tamanho
    from public.vtt_scene_annotations where scene_id = p_scene_id;

  return v_nova;
end;
$$;

comment on function public.duplicate_vtt_scene(uuid, text, text) is
  'Cópia completa leva desenhos e textos; cópia só do mapa leva imagens e terreno. Não copia trilha, medições nem marcações temporárias.';

commit;
