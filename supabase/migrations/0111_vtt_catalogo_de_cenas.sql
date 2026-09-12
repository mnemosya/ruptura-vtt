-- =====================================================================
-- 0111 — Catálogo de cenas: o palco deixa de ser a cena
--
-- Até aqui "a cena da campanha" era uma coisa só: `vtt_scenes.ativa` era
-- ao mesmo tempo onde o narrador estava, onde os jogadores estavam e
-- qual cena o servidor aceitava escrever. Três perguntas diferentes
-- respondidas por um booleano — e é por isso que preparar a próxima
-- cena sem tirar a mesa da atual era impossível: mudar de cena era,
-- literalmente, mudar a cena de todo mundo.
--
-- Esta migration separa as duas primeiras:
--
--   • CENA EXISTENTE   — qualquer linha de `vtt_scenes` não arquivada.
--   • CENA APRESENTADA — `vtt_campaign_stage.presented_scene_id`, uma
--                        por campanha. É a "fita dos jogadores".
--
-- A terceira (a cena que o narrador está olhando) não é estado do
-- banco nesta fase: é do cliente, porque ninguém além dele precisa
-- saber, e persistir por usuário custaria uma tabela e uma escrita a
-- cada clique para resolver um problema que `localStorage` resolve.
--
-- NADA de autorização muda aqui, de propósito. `ativa` continua
-- existindo e continua significando exatamente o que significava —
-- a diferença é que agora ela é DERIVADA do palco, mantida em sincronia
-- por `present_vtt_scene`. Todas as RPCs que hoje exigem `s.ativa`
-- seguem funcionando sem saber que o mundo mudou. A troca das regras
-- para "por cena" é a 0112, e ela depende dos predicados definidos no
-- fim deste arquivo.
--
-- O que ficou FORA, e por quê:
--   • `folder_id` — pastas são a fase 5. Coluna nula apontando para uma
--     tabela que não existe é peso morto com cara de plano.
--   • `update_vtt_scene_metadata` — já existe: `set_vtt_scene_config`
--     (0097) faz nome/local/resumo/largura/altura com revisão conferida.
--     Uma segunda RPC com o mesmo trabalho seria dois lugares para
--     corrigir a mesma regra.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Colunas de catálogo
-- ---------------------------------------------------------------------
alter table vtt_scenes
  add column if not exists ordem              integer not null default 0,
  add column if not exists archived_at        timestamptz,
  add column if not exists thumbnail_image_id uuid references vtt_image_assets(id) on delete set null,
  add column if not exists duplicated_from_id uuid references vtt_scenes(id) on delete set null,
  add column if not exists created_by         uuid references auth.users(id) on delete set null,
  add column if not exists updated_by         uuid references auth.users(id) on delete set null;

comment on column vtt_scenes.ordem is
  'Posição no catálogo do narrador. Sem unique: reordenar reescreve o bloco inteiro numa transação, e um índice único exigiria constraint diferida para não falhar no meio da renumeração.';
comment on column vtt_scenes.archived_at is
  'Arquivada: some do catálogo principal, continua legível e restaurável. Arquivar é o caminho preferencial; excluir é a exceção.';
comment on column vtt_scenes.thumbnail_image_id is
  'Miniatura ESCOLHIDA a dedo. Nula é o caso normal — a miniatura automática é a imagem de fundo da cena, derivada em `list_vtt_scenes`.';
comment on column vtt_scenes.ativa is
  'LEGADO. Passou a ser derivada de `vtt_campaign_stage.presented_scene_id` e mantida por `present_vtt_scene`. Não escreva nela; leia o palco. Sai quando a 0112 tirar o último guard que a consulta.';

-- Ordem inicial: a que já existia de fato (data de criação).
update vtt_scenes s
   set ordem = p.pos
  from (select id, (row_number() over (partition by campaign_id order by created_at, id) - 1) as pos
          from vtt_scenes) p
 where p.id = s.id and s.ordem = 0;

-- O catálogo é sempre lido por campanha, ordenado, sem as arquivadas.
create index if not exists vtt_scenes_catalogo_idx
  on vtt_scenes (campaign_id, ordem, created_at) where archived_at is null;

-- ---------------------------------------------------------------------
-- 2. O palco da campanha
--
-- Uma linha por campanha. A FK composta contra `vtt_scenes (id,
-- campaign_id)` — o `unique` que a 0065 criou sem uso aparente — é o
-- que torna "a cena apresentada pertence a esta campanha" uma verdade
-- estrutural, não uma checagem que alguém pode esquecer de escrever.
--
-- `on delete no action` (e não `restrict`) é deliberado: RESTRICT
-- dispara ANTES dos outros cascatas do mesmo comando, então apagar a
-- campanha falharia por causa da própria linha de palco que o cascade
-- ia remover em seguida. NO ACTION confere no fim do comando, quando a
-- linha já saiu. Apagar a cena apresentada continua recusado — que é o
-- ponto.
-- ---------------------------------------------------------------------
create table if not exists vtt_campaign_stage (
  campaign_id        uuid primary key references campaigns(id) on delete cascade,
  presented_scene_id uuid not null,
  revision           integer not null default 1,
  updated_by         uuid references auth.users(id) on delete set null,
  updated_at         timestamptz not null default now(),
  constraint vtt_campaign_stage_cena_da_campanha
    foreign key (presented_scene_id, campaign_id)
    references vtt_scenes (id, campaign_id) on delete no action
);

comment on table vtt_campaign_stage is
  'Onde os JOGADORES estão. Uma por campanha. O narrador pode estar em qualquer outra cena sem tocar nesta linha — é essa distância que permite preparar a próxima cena com a mesa em jogo.';

-- Migração do estado atual: a cena que `carregarCenaAtiva` escolheria
-- hoje (ativa mais antiga) vira a apresentada. É o que faz cada
-- campanha existente abrir exatamente onde abria antes.
insert into vtt_campaign_stage (campaign_id, presented_scene_id)
select distinct on (campaign_id) campaign_id, id
  from vtt_scenes
 where ativa
 order by campaign_id, created_at asc, id
on conflict (campaign_id) do nothing;

alter table vtt_campaign_stage enable row level security;
revoke all on vtt_campaign_stage from anon, authenticated;
grant select on vtt_campaign_stage to authenticated;

-- Todo membro lê o palco: o jogador precisa saber para onde ir, e essa
-- é justamente a informação que ele PODE ter. Escrever, só por RPC.
create policy vtt_campaign_stage_select on vtt_campaign_stage
  for select to authenticated
  using (is_campaign_member(campaign_id));

-- Realtime: a mudança de palco tem que CHEGAR sozinha em quem está
-- jogando — é a fase 3, mas a tabela precisa estar publicada desde já,
-- e `replica identity full` pelo mesmo motivo da 0093 (sem ela o
-- payload de UPDATE não traz `campaign_id` para filtrar).
alter table vtt_campaign_stage replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vtt_campaign_stage'
  ) then
    alter publication supabase_realtime add table public.vtt_campaign_stage;
  end if;
end
$$;

commit;

begin;

-- ---------------------------------------------------------------------
-- 3. Os dois predicados de cena
--
-- Toda a autorização do VTT hoje pergunta "você é da campanha?". Com
-- catálogo essa pergunta passa a ser larga demais: ser da campanha não
-- pode dar acesso à cena que o narrador está montando em segredo.
-- Estes dois predicados são a pergunta certa, e a 0112 os planta nas
-- policies e nas RPCs.
--
-- A diferença entre VER e INTERAGIR é o arquivo: o narrador enxerga uma
-- cena arquivada (precisa, para restaurá-la) mas não escreve nela. Uma
-- cena arquivada é um documento, não uma mesa.
-- ---------------------------------------------------------------------
create or replace function public.vtt_pode_ver_cena(
  p_scene_id uuid,
  check_user_id uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.vtt_scenes s
      left join public.vtt_campaign_stage st on st.campaign_id = s.campaign_id
     where s.id = p_scene_id
       and (
         -- Narrador vê o catálogo inteiro, arquivadas inclusive.
         public.is_campaign_owner(s.campaign_id, check_user_id)
         -- Jogador vê UMA cena: aquela em que a mesa está.
         or (
           public.is_campaign_member(s.campaign_id, check_user_id)
           and st.presented_scene_id = s.id
         )
       )
  );
$$;

comment on function public.vtt_pode_ver_cena(uuid, uuid) is
  'Quem pode LER o conteúdo desta cena: o narrador, sempre; qualquer outro membro, só se for a cena apresentada. Substitui `is_campaign_member(campaign_id)` em tudo que é conteúdo de cena.';

create or replace function public.vtt_pode_interagir_cena(
  p_scene_id uuid,
  check_user_id uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.vtt_scenes s
      left join public.vtt_campaign_stage st on st.campaign_id = s.campaign_id
     where s.id = p_scene_id
       and s.archived_at is null
       and (
         public.is_campaign_owner(s.campaign_id, check_user_id)
         or (
           public.is_campaign_member(s.campaign_id, check_user_id)
           and st.presented_scene_id = s.id
         )
       )
  );
$$;

comment on function public.vtt_pode_interagir_cena(uuid, uuid) is
  'Quem pode ESCREVER nesta cena: narrador em qualquer cena não arquivada; demais membros só na apresentada. Arquivada é só leitura, para todo mundo.';

revoke all on function public.vtt_pode_ver_cena(uuid, uuid) from public, anon;
revoke all on function public.vtt_pode_interagir_cena(uuid, uuid) from public, anon;
grant execute on function public.vtt_pode_ver_cena(uuid, uuid) to authenticated;
grant execute on function public.vtt_pode_interagir_cena(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Administração do catálogo — narrador, por RPC
--
-- `vtt_scenes` só tem GRANT de select para `authenticated` desde a
-- 0065, e continua assim: escrita passa por função estreita que confere
-- autoria no CORPO, não só por policy.
-- ---------------------------------------------------------------------
create or replace function public.create_vtt_scene(
  p_campaign_id uuid,
  p_nome text,
  p_local text default null,
  p_resumo text default null,
  p_largura integer default 26,
  p_altura integer default 18
) returns vtt_scenes
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_nova vtt_scenes;
  v_uid uuid := auth.uid();
begin
  if not public.is_campaign_owner(p_campaign_id, v_uid) then
    raise exception 'Só o narrador cria cenas.' using errcode = '42501';
  end if;
  if p_largura not between 1 and 200 or p_altura not between 1 and 200 then
    raise exception 'Largura e altura precisam estar entre 1 e 200 células.' using errcode = 'invalid_parameter_value';
  end if;

  insert into vtt_scenes (campaign_id, nome, local, resumo, largura, altura, ativa, ordem, created_by, updated_by)
  values (
    p_campaign_id,
    coalesce(nullif(btrim(p_nome), ''), 'Cena'),
    nullif(btrim(p_local), ''),
    nullif(btrim(p_resumo), ''),
    p_largura,
    p_altura,
    -- Nasce FORA do palco. Criar cena nunca move a mesa; para isso
    -- existe `present_vtt_scene`, e ela é um gesto separado de propósito.
    false,
    coalesce((select max(ordem) + 1 from vtt_scenes where campaign_id = p_campaign_id), 0),
    v_uid,
    v_uid
  )
  returning * into v_nova;

  return v_nova;
end;
$$;

comment on function public.create_vtt_scene(uuid, text, text, text, integer, integer) is
  'Cria uma cena VAZIA no fim do catálogo, sem tocar no palco. Narrador-only.';

-- ---------------------------------------------------------------------
-- Apresentar: a única operação que move a mesa.
-- ---------------------------------------------------------------------
create or replace function public.present_vtt_scene(
  p_campaign_id uuid,
  p_scene_id uuid,
  p_expected_revision integer default null
) returns vtt_campaign_stage
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_stage vtt_campaign_stage;
  v_scene vtt_scenes;
  v_uid uuid := auth.uid();
begin
  if not public.is_campaign_owner(p_campaign_id, v_uid) then
    raise exception 'Só o narrador apresenta cenas.' using errcode = '42501';
  end if;

  select * into v_scene from vtt_scenes
   where id = p_scene_id and campaign_id = p_campaign_id;
  if v_scene.id is null then
    raise exception 'Cena não encontrada nesta campanha.' using errcode = 'no_data_found';
  end if;
  if v_scene.archived_at is not null then
    raise exception 'Não dá para apresentar uma cena arquivada — restaure antes.' using errcode = 'invalid_parameter_value';
  end if;

  -- `for update` e não só revisão: duas abas do mesmo narrador clicando
  -- em cenas diferentes no mesmo instante têm que virar uma ordem, não
  -- um empate. A revisão continua valendo quando quem chama leu o palco
  -- antes — aí o segundo clique é recusado em vez de aplicado por cima.
  select * into v_stage from vtt_campaign_stage
   where campaign_id = p_campaign_id for update;

  if v_stage.campaign_id is null then
    insert into vtt_campaign_stage (campaign_id, presented_scene_id, updated_by)
    values (p_campaign_id, p_scene_id, v_uid)
    returning * into v_stage;
  else
    if p_expected_revision is not null and v_stage.revision <> p_expected_revision then
      raise exception 'O palco mudou enquanto você decidia.' using errcode = 'serialization_failure';
    end if;

    update vtt_campaign_stage
       set presented_scene_id = p_scene_id,
           revision           = revision + 1,
           updated_by         = v_uid,
           updated_at         = now()
     where campaign_id = p_campaign_id
    returning * into v_stage;
  end if;

  -- Espelho do legado. Enquanto houver RPC perguntando `s.ativa`, ela
  -- precisa continuar respondendo a verdade — e a verdade agora é o
  -- palco. Sai junto com o último guard, na 0112.
  update vtt_scenes
     set ativa = (id = p_scene_id)
   where campaign_id = p_campaign_id
     and ativa is distinct from (id = p_scene_id);

  return v_stage;
end;
$$;

comment on function public.present_vtt_scene(uuid, uuid, integer) is
  'Move a mesa inteira para uma cena. Narrador-only, serializada por bloqueio de linha, com revisão opcional para recusar cliques em cima de estado velho.';

-- ---------------------------------------------------------------------
-- Reordenar: a ordem do catálogo é do narrador, não do banco.
-- ---------------------------------------------------------------------
create or replace function public.reorder_vtt_scenes(
  p_campaign_id uuid,
  p_scene_ids uuid[]
) returns setof vtt_scenes
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_fora integer;
begin
  if not public.is_campaign_owner(p_campaign_id, v_uid) then
    raise exception 'Só o narrador reordena o catálogo.' using errcode = '42501';
  end if;
  if p_scene_ids is null or array_length(p_scene_ids, 1) is null then
    raise exception 'Nenhuma cena para reordenar.' using errcode = 'invalid_parameter_value';
  end if;

  -- Um id de outra campanha na lista não é "ignorável": é sinal de que
  -- quem chamou está trabalhando com um catálogo que não é este.
  select count(*) into v_fora
    from unnest(p_scene_ids) as x(id)
    left join vtt_scenes s on s.id = x.id and s.campaign_id = p_campaign_id
   where s.id is null;
  if v_fora > 0 then
    raise exception 'A lista traz cenas que não são desta campanha.' using errcode = 'invalid_parameter_value';
  end if;

  update vtt_scenes s
     set ordem = p.pos, updated_by = v_uid, updated_at = now()
    from (select id, (ord - 1)::integer as pos
            from unnest(p_scene_ids) with ordinality as t(id, ord)) p
   where s.id = p.id and s.campaign_id = p_campaign_id;

  return query
    select * from vtt_scenes
     where campaign_id = p_campaign_id
     order by ordem, created_at, id;
end;
$$;

comment on function public.reorder_vtt_scenes(uuid, uuid[]) is
  'Renumera `ordem` pela posição na lista recebida, numa transação só. Narrador-only.';

commit;

begin;

-- ---------------------------------------------------------------------
-- 5. O catálogo, numa chamada
--
-- Poderia ser um `select` direto — depois da 0112 a RLS já devolveria
-- o recorte certo. É RPC por duas razões: a miniatura automática é um
-- lateral por cena (a imagem de fundo) que viraria N+1 no cliente, e
-- "os jogadores estão aqui" mora em outra tabela. Uma chamada, um
-- cartão pronto.
--
-- O jogador que chamar isto recebe UMA cena: aquela em que ele está.
-- Não é a interface escondendo o catálogo — é o servidor não tendo o
-- que contar.
-- ---------------------------------------------------------------------
create or replace function public.list_vtt_scenes(
  p_campaign_id uuid,
  p_incluir_arquivadas boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_narrador boolean;
  v_apresentada uuid;
begin
  if not public.is_campaign_member(p_campaign_id) then
    raise exception 'Você não é membro desta campanha.' using errcode = 'insufficient_privilege';
  end if;

  v_narrador := public.is_campaign_owner(p_campaign_id);
  select presented_scene_id into v_apresentada
    from vtt_campaign_stage where campaign_id = p_campaign_id;

  return coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'id', s.id,
               'nome', s.nome,
               'local', s.local,
               'resumo', s.resumo,
               'largura', s.largura,
               'altura', s.altura,
               'ordem', s.ordem,
               'revision', s.revision,
               'arquivada_em', s.archived_at,
               'apresentada', (s.id = v_apresentada),
               'duplicada_de', s.duplicated_from_id,
               -- Escolhida a dedo tem precedência; senão, o mapa é a
               -- miniatura. A URL assinada quem emite é o servidor da
               -- aplicação — aqui só sai o identificador.
               'miniatura_image_id', coalesce(
                 s.thumbnail_image_id,
                 (select si.image_id from vtt_scene_images si
                   where si.scene_id = s.id and si.papel = 'fundo' limit 1)
               ),
               'criada_em', s.created_at,
               'atualizada_em', s.updated_at
             )
             order by s.ordem, s.created_at, s.id
           )
      from vtt_scenes s
     where s.campaign_id = p_campaign_id
       and (v_narrador or s.id = v_apresentada)
       and (p_incluir_arquivadas or s.archived_at is null or s.id = v_apresentada)
  ), '[]'::jsonb);
end;
$$;

comment on function public.list_vtt_scenes(uuid, boolean) is
  'Catálogo de cenas da campanha com miniatura automática e marca de palco. Narrador recebe tudo; qualquer outro membro recebe só a cena apresentada.';

revoke all on function public.create_vtt_scene(uuid, text, text, text, integer, integer) from public, anon;
revoke all on function public.present_vtt_scene(uuid, uuid, integer) from public, anon;
revoke all on function public.reorder_vtt_scenes(uuid, uuid[]) from public, anon;
revoke all on function public.list_vtt_scenes(uuid, boolean) from public, anon;
grant execute on function public.create_vtt_scene(uuid, text, text, text, integer, integer) to authenticated;
grant execute on function public.present_vtt_scene(uuid, uuid, integer) to authenticated;
grant execute on function public.reorder_vtt_scenes(uuid, uuid[]) to authenticated;
grant execute on function public.list_vtt_scenes(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 6. A semeadura precisa montar o palco também
--
-- `seed_vtt_scene` (0068) é o que roda quando um narrador abre a mesa
-- pela primeira vez. Sem a linha de palco, a campanha nasceria com uma
-- cena e nenhum lugar onde os jogadores estão — e a 0112, que decide
-- acesso de jogador olhando o palco, os deixaria de fora da própria
-- campanha. A função continua idempotente: chamar de novo não duplica
-- nem cena nem palco.
-- ---------------------------------------------------------------------
create or replace function public.seed_vtt_scene(
  p_campaign_id uuid,
  p_nome text,
  p_local text,
  p_resumo text,
  p_largura integer,
  p_altura integer
) returns vtt_scenes
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_existente vtt_scenes;
  v_nova vtt_scenes;
begin
  if not is_campaign_owner(p_campaign_id, auth.uid()) then
    raise exception 'Só o narrador pode semear a cena inicial.' using errcode = 'insufficient_privilege';
  end if;

  -- Agora a cena "de entrada" é a APRESENTADA, não a primeira `ativa`:
  -- com catálogo, "primeira ativa" deixaria de ser uma pergunta com
  -- resposta única.
  select s.* into v_existente
    from vtt_scenes s
    join vtt_campaign_stage st
      on st.campaign_id = s.campaign_id and st.presented_scene_id = s.id
   where s.campaign_id = p_campaign_id;
  if found then
    return v_existente;
  end if;

  -- Sem palco, mas talvez com cena (campanha semeada antes desta
  -- migration e sem `ativa`): aproveita a mais antiga em vez de criar
  -- uma segunda cena vazia ao lado.
  select * into v_existente from vtt_scenes
   where campaign_id = p_campaign_id
   order by created_at asc, id limit 1;

  if found then
    v_nova := v_existente;
  else
    insert into vtt_scenes (campaign_id, nome, local, resumo, largura, altura, created_by, updated_by)
      values (p_campaign_id, p_nome, p_local, p_resumo, p_largura, p_altura, auth.uid(), auth.uid())
      returning * into v_nova;
  end if;

  insert into vtt_campaign_stage (campaign_id, presented_scene_id, updated_by)
    values (p_campaign_id, v_nova.id, auth.uid())
  on conflict (campaign_id) do nothing;

  update vtt_scenes set ativa = (id = v_nova.id)
   where campaign_id = p_campaign_id and ativa is distinct from (id = v_nova.id);

  return v_nova;
end;
$$;

comment on function public.seed_vtt_scene(uuid, text, text, text, integer, integer) is
  'Cria (ou devolve) a cena de entrada da campanha E garante a linha de palco. Narrador-only, idempotente.';

commit;
