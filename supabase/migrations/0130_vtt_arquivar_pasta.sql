-- =====================================================================
-- 0130 — Arquivar PASTA: a saída que não destrói
--
-- Excluir pasta passou a apagar o conteúdo (0129), e isso deixou o
-- catálogo com uma única saída, a irreversível. Cena já tinha as duas
-- desde a 0116 — arquivar tira do catálogo sem apagar nada —, e pasta
-- não tinha nenhuma: quem só queria "tirar o Ato I da frente" precisava
-- apagar o Ato I.
--
-- Arquivar a pasta leva JUNTO as subpastas e as cenas delas, e
-- desarquivar devolve tudo no lugar de onde saiu. Duas regras herdadas
-- da 0116, porque valem pelo mesmo motivo:
--
--   • A CENA APRESENTADA não é arquivada — arquivar o palco deixaria a
--     mesa olhando pra uma cena congelada (0115). Ela SOBE pro pai da
--     pasta e a RPC devolve o nome, pra quem chamou avisar. É o mesmo
--     tratamento que a exclusão em cascata dá (0129).
--   • A ÚLTIMA CENA UTILIZÁVEL da campanha não pode ir: campanha sem
--     cena não-arquivada é campanha sem mesa.
--
-- COMO O DESARQUIVAR SABE O QUE DEVOLVER. Uma cena pode já estar
-- arquivada por conta própria ANTES de a pasta ir — e essa não pode
-- voltar junto, senão desarquivar a pasta "desfaz" uma decisão que
-- ninguém pediu pra desfazer. Por isso a cena arquivada PELA PASTA
-- guarda qual foi (`archived_with_folder`): desarquivar devolve só
-- quem carrega a marca, e a limpa.
-- =====================================================================

begin;

alter table vtt_scene_folders
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table vtt_scenes
  add column if not exists archived_with_folder uuid references vtt_scene_folders(id) on delete set null;

comment on column vtt_scenes.archived_with_folder is
  'Pasta que arquivou esta cena (0130). Só quem carrega a marca volta quando a pasta é desarquivada — cena arquivada por conta própria antes disso continua arquivada.';

create index if not exists vtt_scene_folders_arquivo_idx on vtt_scene_folders (campaign_id, archived_at);

-- ── Listagem: a pasta passa a dizer se está arquivada ───────────────
create or replace function public.list_vtt_scene_folders(
  p_campaign_id uuid
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_campaign_owner(p_campaign_id, auth.uid()) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    with recursive arvore as (
      select f.id, f.parent_id, f.nome, f.ordem, f.created_at, f.archived_at,
             1 as nivel,
             f.nome::text as caminho
        from vtt_scene_folders f
       where f.campaign_id = p_campaign_id and f.parent_id is null
      union all
      select f.id, f.parent_id, f.nome, f.ordem, f.created_at, f.archived_at,
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
               'caminho', caminho,
               'archived_at', archived_at
             ) order by caminho
           )
      from arvore
  ), '[]'::jsonb);
end;
$$;

-- ── Arquivar ────────────────────────────────────────────────────────
create or replace function public.archive_vtt_scene_folder(
  p_folder_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_pasta      vtt_scene_folders;
  v_palco      uuid;
  v_ids        uuid[];
  v_preservada text := null;
  v_cenas      integer := 0;
  v_restantes  integer;
begin
  select * into v_pasta from vtt_scene_folders where id = p_folder_id;
  if v_pasta.id is null then
    raise exception 'Pasta não encontrada.' using errcode = 'no_data_found';
  end if;
  if not public.is_campaign_owner(v_pasta.campaign_id, v_uid) then
    raise exception 'Só o narrador organiza o catálogo.' using errcode = '42501';
  end if;
  if v_pasta.archived_at is not null then
    return jsonb_build_object('cenas', 0, 'preservada', null); -- idempotente, como `archive_vtt_scene`
  end if;

  with recursive descendencia as (
    select id from vtt_scene_folders where id = p_folder_id
    union all
    select f.id from vtt_scene_folders f join descendencia d on f.parent_id = d.id
  ) cycle id set ciclo using caminho
  select array_agg(id) into v_ids from descendencia;

  select presented_scene_id into v_palco
    from vtt_campaign_stage where campaign_id = v_pasta.campaign_id;

  select count(*) into v_restantes
    from vtt_scenes s
   where s.campaign_id = v_pasta.campaign_id
     and s.archived_at is null
     and (s.folder_id is null or not (s.folder_id = any(v_ids)) or s.id = v_palco);
  if v_restantes = 0 then
    raise exception 'Isto arquivaria a última cena utilizável da campanha — crie outra antes.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- O palco sobe pro pai e NÃO é arquivado.
  if v_palco is not null then
    update vtt_scenes
       set folder_id = v_pasta.parent_id, updated_by = v_uid, updated_at = now()
     where id = v_palco and folder_id = any(v_ids)
    returning nome into v_preservada;
  end if;

  with arquivadas as (
    update vtt_scenes
       set archived_at = now(), archived_by = v_uid,
           archived_with_folder = p_folder_id,
           updated_by = v_uid, updated_at = now()
     where folder_id = any(v_ids)
       and archived_at is null
       and (v_palco is null or id <> v_palco)
    returning 1
  ) select count(*) into v_cenas from arquivadas;

  update vtt_scene_folders
     set archived_at = now(), archived_by = v_uid, updated_by = v_uid, updated_at = now()
   where id = any(v_ids) and archived_at is null;

  return jsonb_build_object('cenas', v_cenas, 'preservada', v_preservada);
end;
$$;

-- ── Desarquivar ─────────────────────────────────────────────────────
create or replace function public.unarchive_vtt_scene_folder(
  p_folder_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_pasta vtt_scene_folders;
  v_ids   uuid[];
  v_cenas integer := 0;
begin
  select * into v_pasta from vtt_scene_folders where id = p_folder_id;
  if v_pasta.id is null then
    raise exception 'Pasta não encontrada.' using errcode = 'no_data_found';
  end if;
  if not public.is_campaign_owner(v_pasta.campaign_id, v_uid) then
    raise exception 'Só o narrador organiza o catálogo.' using errcode = '42501';
  end if;

  with recursive descendencia as (
    select id from vtt_scene_folders where id = p_folder_id
    union all
    select f.id from vtt_scene_folders f join descendencia d on f.parent_id = d.id
  ) cycle id set ciclo using caminho
  select array_agg(id) into v_ids from descendencia;

  -- Só volta quem foi arquivado POR ESTA pasta (ver o cabeçalho).
  with devolvidas as (
    update vtt_scenes
       set archived_at = null, archived_by = null, archived_with_folder = null,
           updated_by = v_uid, updated_at = now()
     where archived_with_folder = p_folder_id
    returning 1
  ) select count(*) into v_cenas from devolvidas;

  update vtt_scene_folders
     set archived_at = null, archived_by = null, updated_by = v_uid, updated_at = now()
   where id = any(v_ids);

  return jsonb_build_object('cenas', v_cenas);
end;
$$;

revoke all on function public.archive_vtt_scene_folder(uuid) from public, anon;
grant execute on function public.archive_vtt_scene_folder(uuid) to authenticated;
revoke all on function public.unarchive_vtt_scene_folder(uuid) from public, anon;
grant execute on function public.unarchive_vtt_scene_folder(uuid) to authenticated;

comment on function public.archive_vtt_scene_folder(uuid) is
  'Arquiva a pasta, as subpastas e as cenas delas. A cena apresentada é poupada e sobe para o pai. Devolve {cenas, preservada}.';
comment on function public.unarchive_vtt_scene_folder(uuid) is
  'Desarquiva a pasta, as subpastas e SÓ as cenas que esta pasta arquivou. Devolve {cenas}.';

commit;
