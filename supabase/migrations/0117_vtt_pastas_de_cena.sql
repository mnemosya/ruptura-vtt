-- =====================================================================
-- 0117 — Pastas de cena
--
-- A 0111 recusou `folder_id` com uma frase que vale reler: "coluna nula
-- apontando para uma tabela que não existe é peso morto com cara de
-- plano". A tabela existe agora, então a coluna entra.
--
-- ── O que NÃO entra, pelo mesmo princípio ────────────────────────────
--
-- O desenho original previa `archived_at` nas pastas. Fica de fora: não
-- há operação nesta migration que escreva ou leia esse campo, e o que
-- "pasta arquivada" significaria para as cenas dentro dela é uma
-- pergunta sem resposta decidida. Arquivar continua sendo por CENA.
-- Quando arquivar pasta for um gesto de verdade, a coluna entra junto
-- com a regra.
--
-- ── Pastas são organização, nunca conteúdo ───────────────────────────
--
-- Esta é a regra que decide todo o resto do arquivo. Uma pasta não
-- guarda nada: ela agrupa. Por isso:
--
--   • apagar uma pasta NUNCA apaga cena. Os filhos diretos (cenas e
--     subpastas) sobem para o pai da pasta apagada. Cena é o que custou
--     trabalho; pasta é uma etiqueta com filhos;
--   • `vtt_scenes.folder_id` é `on delete set null` — mesmo que alguém
--     apague a linha por fora da RPC, a cena sobrevive na raiz;
--   • pasta não entra em nenhuma decisão de AUTORIZAÇÃO. Quem pode ver
--     uma cena continua sendo `vtt_pode_ver_cena` (0111/0112), e mover
--     uma cena para dentro de uma pasta não a esconde de ninguém que
--     pudesse vê-la. Uma hierarquia que também fosse permissão seria
--     uma segunda regra de acesso, divergindo da primeira no primeiro
--     caso difícil.
--
-- ── Ciclo e profundidade ─────────────────────────────────────────────
--
-- As duas travas são o MESMO gatilho, porque as duas são a mesma
-- caminhada pela corrente de pais. O limite é 4 níveis, e ele é
-- conferido contra a SUBÁRVORE inteira, não só contra o pai novo:
-- mover uma pasta que tem netos para o terceiro nível empurraria os
-- netos para o quinto, e conferir só o pai deixaria passar.
-- =====================================================================

begin;

create table if not exists vtt_scene_folders (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  parent_id   uuid null,
  nome        text not null check (btrim(nome) <> ''),
  ordem       integer not null default 0,
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Alvo da FK composta de quem referencia uma pasta: é ela que torna
  -- "a pasta é desta campanha" verdade ESTRUTURAL, e não uma checagem
  -- que alguém pode esquecer de escrever. Mesmo recurso que a 0111 usou
  -- no palco.
  unique (id, campaign_id),
  -- Subpasta e pasta-mãe na mesma campanha, pelo mesmo motivo.
  constraint vtt_scene_folders_pai_da_campanha
    foreign key (parent_id, campaign_id)
    references vtt_scene_folders (id, campaign_id) on delete cascade
);

comment on table vtt_scene_folders is
  'Agrupamento do catálogo do narrador. Organização, nunca conteúdo nem permissão: apagar uma pasta não apaga cena, e estar numa pasta não muda quem vê a cena.';

create index if not exists vtt_scene_folders_campanha_idx
  on vtt_scene_folders (campaign_id, parent_id, ordem, created_at);

alter table vtt_scenes
  add column if not exists folder_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vtt_scenes_pasta_da_campanha'
  ) then
    alter table vtt_scenes
      add constraint vtt_scenes_pasta_da_campanha
      foreign key (folder_id, campaign_id)
      references vtt_scene_folders (id, campaign_id) on delete set null;
  end if;
end
$$;

comment on column vtt_scenes.folder_id is
  'Pasta do catálogo. Nula = raiz, que é o caso normal. `on delete set null`: apagar a pasta por fora da RPC deixa a cena na raiz, nunca a apaga junto.';

create index if not exists vtt_scenes_pasta_idx
  on vtt_scenes (campaign_id, folder_id, ordem) where archived_at is null;

-- ---------------------------------------------------------------------
-- Ciclo e profundidade, num gatilho só
-- ---------------------------------------------------------------------
create or replace function public.vtt_validar_hierarquia_de_pasta()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_prof_pai  integer;
  v_altura    integer;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'Uma pasta não pode ser mãe de si mesma.' using errcode = 'invalid_parameter_value';
  end if;

  -- Sobe do pai novo até a raiz. Encontrar a PRÓPRIA pasta no caminho é
  -- a definição de ciclo: o pai novo é descendente dela.
  with recursive acima as (
    select f.id, f.parent_id, 1 as nivel
      from vtt_scene_folders f where f.id = new.parent_id
    union all
    select f.id, f.parent_id, a.nivel + 1
      from vtt_scene_folders f
      join acima a on f.id = a.parent_id
     where a.nivel < 16 -- trava de segurança: dados corrompidos não viram laço infinito
  )
  select max(nivel) into v_prof_pai from acima;

  if exists (
    with recursive acima as (
      select f.id, f.parent_id, 1 as nivel
        from vtt_scene_folders f where f.id = new.parent_id
      union all
      select f.id, f.parent_id, a.nivel + 1
        from vtt_scene_folders f
        join acima a on f.id = a.parent_id
       where a.nivel < 16
    )
    select 1 from acima where id = new.id
  ) then
    raise exception 'Isso colocaria a pasta dentro dela mesma.' using errcode = 'invalid_parameter_value';
  end if;

  -- A altura da SUBÁRVORE desta pasta. Conferir só o pai deixaria
  -- passar uma pasta com netos indo parar no terceiro nível.
  with recursive abaixo as (
    select f.id, 1 as nivel from vtt_scene_folders f where f.id = new.id
    union all
    select f.id, b.nivel + 1
      from vtt_scene_folders f
      join abaixo b on f.parent_id = b.id
     where b.nivel < 16
  )
  select coalesce(max(nivel), 1) into v_altura from abaixo;

  if coalesce(v_prof_pai, 0) + coalesce(v_altura, 1) > 4 then
    raise exception 'As pastas vão até quatro níveis.' using errcode = 'invalid_parameter_value';
  end if;

  return new;
end;
$$;

comment on function public.vtt_validar_hierarquia_de_pasta is
  'Recusa ciclo e passagem do quarto nível. A profundidade é conferida contra a subárvore inteira: mover uma pasta com netos empurra os netos junto.';

drop trigger if exists vtt_pastas_hierarquia on public.vtt_scene_folders;
create trigger vtt_pastas_hierarquia
  before insert or update of parent_id on public.vtt_scene_folders
  for each row execute function public.vtt_validar_hierarquia_de_pasta();

-- ---------------------------------------------------------------------
-- RLS: ler é de quem é da campanha, escrever é só por RPC
-- ---------------------------------------------------------------------
alter table vtt_scene_folders enable row level security;
revoke all on vtt_scene_folders from anon, authenticated;
grant select on vtt_scene_folders to authenticated;

drop policy if exists vtt_scene_folders_select on vtt_scene_folders;
-- Só o NARRADOR lê pasta. O jogador recebe uma cena e nada de catálogo
-- (`list_vtt_scenes`, 0111) — contar a ele que existem "Sessão 4" e
-- "Vilões" seria contar o índice do que ele não pode ver.
create policy vtt_scene_folders_select on vtt_scene_folders
  for select to authenticated
  using (is_campaign_owner(campaign_id));

commit;

begin;

-- ---------------------------------------------------------------------
-- As operações
-- ---------------------------------------------------------------------
create or replace function public.create_vtt_scene_folder(
  p_campaign_id uuid,
  p_nome        text,
  p_parent_id   uuid default null
) returns vtt_scene_folders
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_nova  vtt_scene_folders;
  v_ordem integer;
begin
  if not public.is_campaign_owner(p_campaign_id, v_uid) then
    raise exception 'Só o narrador organiza o catálogo.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'A pasta precisa de um nome.' using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(max(ordem), -1) + 1 into v_ordem
    from vtt_scene_folders
   where campaign_id = p_campaign_id and parent_id is not distinct from p_parent_id;

  insert into vtt_scene_folders (campaign_id, parent_id, nome, ordem, created_by, updated_by)
  values (p_campaign_id, p_parent_id, btrim(p_nome), v_ordem, v_uid, v_uid)
  returning * into v_nova;
  return v_nova;
end;
$$;

create or replace function public.rename_vtt_scene_folder(
  p_folder_id uuid,
  p_nome      text
) returns vtt_scene_folders
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_pasta  vtt_scene_folders;
begin
  select * into v_pasta from vtt_scene_folders where id = p_folder_id;
  if v_pasta.id is null then
    raise exception 'Pasta não encontrada.' using errcode = 'no_data_found';
  end if;
  if not public.is_campaign_owner(v_pasta.campaign_id, v_uid) then
    raise exception 'Só o narrador organiza o catálogo.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'A pasta precisa de um nome.' using errcode = 'invalid_parameter_value';
  end if;

  update vtt_scene_folders
     set nome = btrim(p_nome), updated_by = v_uid, updated_at = now()
   where id = p_folder_id
  returning * into v_pasta;
  return v_pasta;
end;
$$;

/**
 * Reparenta uma pasta. O gatilho é quem recusa ciclo e quinto nível —
 * aqui só a autorização e a garantia de que as duas pastas são da
 * mesma campanha.
 */
create or replace function public.move_vtt_scene_folder(
  p_folder_id     uuid,
  p_novo_parent_id uuid
) returns vtt_scene_folders
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_pasta  vtt_scene_folders;
  v_pai    vtt_scene_folders;
  v_ordem  integer;
begin
  select * into v_pasta from vtt_scene_folders where id = p_folder_id;
  if v_pasta.id is null then
    raise exception 'Pasta não encontrada.' using errcode = 'no_data_found';
  end if;
  if not public.is_campaign_owner(v_pasta.campaign_id, v_uid) then
    raise exception 'Só o narrador organiza o catálogo.' using errcode = '42501';
  end if;

  if p_novo_parent_id is not null then
    select * into v_pai from vtt_scene_folders where id = p_novo_parent_id;
    if v_pai.id is null or v_pai.campaign_id <> v_pasta.campaign_id then
      raise exception 'A pasta de destino não é desta campanha.' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  select coalesce(max(ordem), -1) + 1 into v_ordem
    from vtt_scene_folders
   where campaign_id = v_pasta.campaign_id
     and parent_id is not distinct from p_novo_parent_id
     and id <> p_folder_id;

  update vtt_scene_folders
     set parent_id = p_novo_parent_id, ordem = v_ordem, updated_by = v_uid, updated_at = now()
   where id = p_folder_id
  returning * into v_pasta;
  return v_pasta;
end;
$$;

/**
 * Apaga a pasta e SOBE os filhos para o pai dela.
 *
 * Nunca apaga cena: pasta é etiqueta, e apagar a etiqueta não pode
 * apagar o que estava etiquetado. Quem quer apagar as cenas usa
 * `delete_vtt_scene`, uma a uma, com o nome digitado — que é o preço
 * certo para uma exclusão de conteúdo.
 */
create or replace function public.delete_vtt_scene_folder(
  p_folder_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_pasta vtt_scene_folders;
begin
  select * into v_pasta from vtt_scene_folders where id = p_folder_id;
  if v_pasta.id is null then
    raise exception 'Pasta não encontrada.' using errcode = 'no_data_found';
  end if;
  if not public.is_campaign_owner(v_pasta.campaign_id, v_uid) then
    raise exception 'Só o narrador organiza o catálogo.' using errcode = '42501';
  end if;

  update vtt_scenes
     set folder_id = v_pasta.parent_id, updated_by = v_uid, updated_at = now()
   where folder_id = p_folder_id;

  update vtt_scene_folders
     set parent_id = v_pasta.parent_id, updated_by = v_uid, updated_at = now()
   where parent_id = p_folder_id;

  delete from vtt_scene_folders where id = p_folder_id;
end;
$$;

comment on function public.delete_vtt_scene_folder(uuid) is
  'Apaga a pasta e sobe os filhos (cenas e subpastas) para o pai dela. NUNCA apaga cena.';

/** Move uma cena para uma pasta (ou para a raiz, com `null`). */
create or replace function public.move_vtt_scene_to_folder(
  p_scene_id  uuid,
  p_folder_id uuid
) returns vtt_scenes
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_scene vtt_scenes;
  v_pasta vtt_scene_folders;
  v_ordem integer;
begin
  select * into v_scene from vtt_scenes where id = p_scene_id;
  if v_scene.id is null then
    raise exception 'Cena não encontrada.' using errcode = 'no_data_found';
  end if;
  if not public.is_campaign_owner(v_scene.campaign_id, v_uid) then
    raise exception 'Só o narrador organiza o catálogo.' using errcode = '42501';
  end if;

  if p_folder_id is not null then
    select * into v_pasta from vtt_scene_folders where id = p_folder_id;
    if v_pasta.id is null or v_pasta.campaign_id <> v_scene.campaign_id then
      raise exception 'A pasta de destino não é desta campanha.' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  -- Entra no fim da pasta de destino. Manter a `ordem` antiga faria a
  -- cena aparecer no meio de uma lista onde ela nunca esteve.
  select coalesce(max(ordem), -1) + 1 into v_ordem
    from vtt_scenes
   where campaign_id = v_scene.campaign_id
     and folder_id is not distinct from p_folder_id
     and id <> p_scene_id;

  update vtt_scenes
     set folder_id = p_folder_id, ordem = v_ordem, updated_by = v_uid, updated_at = now()
   where id = p_scene_id
  returning * into v_scene;
  return v_scene;
end;
$$;

/**
 * As pastas da campanha, com o CAMINHO já montado.
 *
 * O caminho sai daqui e não do cliente porque a recursão é do banco: o
 * cliente teria que remontar a corrente de pais a cada render, e o
 * breadcrumb é exatamente o lugar onde errar isso aparece.
 */
create or replace function public.list_vtt_scene_folders(
  p_campaign_id uuid
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_campaign_owner(p_campaign_id, auth.uid()) then
    -- Não é erro: o jogador simplesmente não tem catálogo. Uma exceção
    -- aqui contaria que existe algo a esconder.
    return '[]'::jsonb;
  end if;

  return coalesce((
    with recursive arvore as (
      select f.id, f.parent_id, f.nome, f.ordem, f.created_at,
             1 as nivel,
             f.nome::text as caminho
        from vtt_scene_folders f
       where f.campaign_id = p_campaign_id and f.parent_id is null
      union all
      select f.id, f.parent_id, f.nome, f.ordem, f.created_at,
             a.nivel + 1,
             (a.caminho || ' / ' || f.nome)::text
        from vtt_scene_folders f
        join arvore a on f.parent_id = a.id
       where a.nivel < 16
    )
    select jsonb_agg(
             jsonb_build_object(
               'id', id,
               'parent_id', parent_id,
               'nome', nome,
               'ordem', ordem,
               'nivel', nivel,
               'caminho', caminho
             ) order by caminho
           )
      from arvore
  ), '[]'::jsonb);
end;
$$;

comment on function public.list_vtt_scene_folders(uuid) is
  'Pastas do catálogo com nível e caminho montados. Narrador-only; qualquer outro recebe lista vazia, não erro.';

revoke all on function public.create_vtt_scene_folder(uuid, text, uuid) from public, anon;
revoke all on function public.rename_vtt_scene_folder(uuid, text) from public, anon;
revoke all on function public.move_vtt_scene_folder(uuid, uuid) from public, anon;
revoke all on function public.delete_vtt_scene_folder(uuid) from public, anon;
revoke all on function public.move_vtt_scene_to_folder(uuid, uuid) from public, anon;
revoke all on function public.list_vtt_scene_folders(uuid) from public, anon;
grant execute on function public.create_vtt_scene_folder(uuid, text, uuid) to authenticated;
grant execute on function public.rename_vtt_scene_folder(uuid, text) to authenticated;
grant execute on function public.move_vtt_scene_folder(uuid, uuid) to authenticated;
grant execute on function public.delete_vtt_scene_folder(uuid) to authenticated;
grant execute on function public.move_vtt_scene_to_folder(uuid, uuid) to authenticated;
grant execute on function public.list_vtt_scene_folders(uuid) to authenticated;

commit;

begin;

-- ---------------------------------------------------------------------
-- O catálogo passa a dizer em que pasta cada cena está
--
-- Regenerada a partir da 0111 com UMA linha a mais (`folder_id`). O
-- resto do corpo é idêntico de propósito: esta migration não é o lugar
-- de mexer em miniatura, ordenação ou recorte por papel.
-- ---------------------------------------------------------------------
create or replace function public.list_vtt_scenes(
  p_campaign_id uuid,
  p_incluir_arquivadas boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_narrador    boolean;
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
               'pasta_id', s.folder_id,
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

commit;
