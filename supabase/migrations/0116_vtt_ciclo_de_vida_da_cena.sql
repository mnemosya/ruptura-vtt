-- =====================================================================
-- 0116 — Ciclo de vida da cena: duplicar, arquivar, restaurar, excluir
--
-- A 0111 criou o catálogo e deixou explicitamente de fora o que esta
-- migration entrega. As colunas já existem desde lá (`archived_at`,
-- `duplicated_from_id`, `thumbnail_image_id`) e a 0115 já pôs o
-- congelamento de cena arquivada em gatilho — o que falta são as quatro
-- operações.
--
-- ── O que ARQUIVAR já significa ──────────────────────────────────────
--
-- Nada aqui reimplementa "arquivada não se edita": a 0115 resolveu isso
-- por gatilho, em todas as nove tabelas de conteúdo e na própria linha
-- da cena. `archive_vtt_scene` só escreve `archived_at` — a
-- imutabilidade vem de graça, inclusive para caminhos de escrita que
-- ainda não existem.
--
-- ── Por que excluir é a exceção ──────────────────────────────────────
--
-- Arquivar é reversível e é o caminho oferecido. Excluir apaga tokens,
-- terreno, marcações, áreas, objetos e colocações de imagem em cascata,
-- e uma mesa de campanha longa guarda sessões inteiras aí. Por isso
-- `delete_vtt_scene` exige uma confirmação EXPLÍCITA no parâmetro (não
-- um booleano `true` que qualquer chamada descuidada passaria, mas o
-- nome da cena digitado) e recusa dois casos que deixariam a campanha
-- quebrada: a cena apresentada e a última utilizável.
--
-- ── A duplicação, e o que ela deliberadamente NÃO copia ──────────────
--
-- Copiar tudo seria mais simples e estaria errado. Três categorias
-- ficam de fora porque são estado de UM momento da mesa, não conteúdo
-- da cena:
--
--   • a trilha de turnos (`vtt_turn_tracks`) — um combate em andamento
--     pertence à cena em que está acontecendo; a cópia nasceria com
--     iniciativa rolada para um confronto que nunca houve;
--   • as medições (`vtt_measurements`) — a régua é gesto, não cenário;
--   • as marcações de duração 'rodada' e 'combate' — elas existem
--     amarradas a um combate que a cópia não herda. As 'persistente'
--     vão, porque essas são anotação de mapa.
--
-- As IMAGENS são reusadas, não recopiadas: `image_id` aponta o mesmo
-- asset. Quota é por bytes de arquivo (0099), não por colocação, então
-- duplicar não cobra nada de ninguém — e recopiar o binário cobraria
-- duas vezes pelo mesmo arquivo. `reserva_id` NÃO vai junto: é `unique`
-- e é a chave de idempotência de UMA finalização de upload; copiá-la
-- faria a segunda inserção falhar.
--
-- ── O remapeamento ───────────────────────────────────────────────────
--
-- Token e objeto ganham ids novos, e há duas coisas que APONTAM para
-- eles: a aura (`vtt_areas.token_id`) e as células do objeto
-- (`vtt_object_cells.object_id`). Sem remapear, a cópia teria auras
-- grudadas nos tokens do ORIGINAL — duas cenas compartilhando estado, e
-- apagar um token de uma quebraria a outra. O mapa velho→novo é montado
-- na mesma CTE que insere: a CTE materializa uma vez (tem função
-- volátil), então o `gen_random_uuid()` lido pelo mapa é exatamente o
-- que foi gravado.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Arquivar e restaurar
-- ---------------------------------------------------------------------
create or replace function public.archive_vtt_scene(
  p_scene_id uuid
) returns vtt_scenes
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_scene vtt_scenes;
  v_palco uuid;
begin
  select * into v_scene from vtt_scenes where id = p_scene_id;
  if v_scene.id is null then
    raise exception 'Cena não encontrada.' using errcode = 'no_data_found';
  end if;
  if not public.is_campaign_owner(v_scene.campaign_id, v_uid) then
    raise exception 'Só o narrador arquiva cenas.' using errcode = '42501';
  end if;

  -- Arquivar o palco deixaria a mesa numa cena congelada: os jogadores
  -- continuariam vendo-a e nada mais poderia ser escrito nela (0115).
  select presented_scene_id into v_palco
    from vtt_campaign_stage where campaign_id = v_scene.campaign_id;
  if v_palco = p_scene_id then
    raise exception 'Esta cena está apresentada aos jogadores — leve a mesa para outra antes de arquivar.'
      using errcode = 'invalid_parameter_value';
  end if;

  if v_scene.archived_at is not null then
    return v_scene; -- idempotente: arquivar o arquivado não é erro
  end if;

  update vtt_scenes
     set archived_at = now(), updated_by = v_uid, updated_at = now()
   where id = p_scene_id
  returning * into v_scene;
  return v_scene;
end;
$$;

comment on function public.archive_vtt_scene(uuid) is
  'Tira a cena do catálogo principal sem apagá-la. A imutabilidade que isso implica vem dos gatilhos da 0115, não daqui. Recusa a cena apresentada.';

create or replace function public.restore_vtt_scene(
  p_scene_id uuid
) returns vtt_scenes
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_scene vtt_scenes;
begin
  select * into v_scene from vtt_scenes where id = p_scene_id;
  if v_scene.id is null then
    raise exception 'Cena não encontrada.' using errcode = 'no_data_found';
  end if;
  if not public.is_campaign_owner(v_scene.campaign_id, v_uid) then
    raise exception 'Só o narrador restaura cenas.' using errcode = '42501';
  end if;

  update vtt_scenes
     set archived_at = null, updated_by = v_uid, updated_at = now()
   where id = p_scene_id
  returning * into v_scene;
  return v_scene;
end;
$$;

comment on function public.restore_vtt_scene(uuid) is
  'Devolve a cena ao catálogo. O gatilho da 0115 permite escrever `archived_at` justamente para que esta porta não tranque por dentro.';

-- ---------------------------------------------------------------------
-- 2. Excluir
--
-- A confirmação é o NOME da cena, não um booleano. Um `p_confirmar
-- boolean` seria satisfeito por qualquer chamada que passasse `true` —
-- inclusive uma escrita por engano no cliente. Exigir o nome faz a
-- confirmação carregar informação que só quem está olhando a cena
-- certa tem.
-- ---------------------------------------------------------------------
create or replace function public.delete_vtt_scene(
  p_scene_id uuid,
  p_nome_confirmacao text
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_scene     vtt_scenes;
  v_palco     uuid;
  v_restantes integer;
begin
  select * into v_scene from vtt_scenes where id = p_scene_id;
  if v_scene.id is null then
    raise exception 'Cena não encontrada.' using errcode = 'no_data_found';
  end if;
  if not public.is_campaign_owner(v_scene.campaign_id, v_uid) then
    raise exception 'Só o narrador exclui cenas.' using errcode = '42501';
  end if;

  if p_nome_confirmacao is distinct from v_scene.nome then
    raise exception 'A confirmação não corresponde ao nome da cena.'
      using errcode = 'invalid_parameter_value';
  end if;

  select presented_scene_id into v_palco
    from vtt_campaign_stage where campaign_id = v_scene.campaign_id;
  if v_palco = p_scene_id then
    raise exception 'Esta cena está apresentada aos jogadores — leve a mesa para outra antes de excluir.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- "Utilizável" = não arquivada. Deixar a campanha só com cenas
  -- arquivadas é deixá-la sem mesa: tudo congelado, nada apresentável.
  select count(*) into v_restantes
    from vtt_scenes
   where campaign_id = v_scene.campaign_id
     and archived_at is null
     and id <> p_scene_id;
  if v_scene.archived_at is null and v_restantes = 0 then
    raise exception 'Esta é a última cena utilizável da campanha — crie outra antes de excluir.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Conteúdo sai por cascata (`on delete cascade` desde a 0065/0085/
  -- 0100). As colocações de imagem também: o ASSET fica, e a coleta de
  -- lixo (0103) devolve a quota de quem ficou sem uso nenhum.
  delete from vtt_scenes where id = p_scene_id;
end;
$$;

comment on function public.delete_vtt_scene(uuid, text) is
  'Apaga a cena e, em cascata, todo o conteúdo dela. Exige o NOME como confirmação. Recusa a cena apresentada e a última utilizável. Arquivar é o caminho preferencial.';

commit;

begin;

-- ---------------------------------------------------------------------
-- 3. Duplicar
-- ---------------------------------------------------------------------
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

  return v_nova;
end;
$$;

comment on function public.duplicate_vtt_scene(uuid, text, text) is
  'Copia uma cena inteira numa transação, remapeando ids de token e objeto. Não copia trilha de turnos, medições nem marcações de duração rodada/combate. Reusa os assets de imagem.';

commit;
