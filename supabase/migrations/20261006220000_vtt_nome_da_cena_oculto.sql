-- ═══════════════════════════════════════════════════════════════════
-- O NOME DA CENA PODE SER ESCONDIDO DOS JOGADORES, por cena.
--
-- O narrador decide, cena a cena, se a mesa vê como ela se chama. É
-- sigilo de verdade, não de tela: com `mostrar_nome = false` o nome não
-- sai do banco para quem não é o narrador — nem pela tabela, nem pelo
-- tempo real, nem pelo catálogo.
--
-- Como:
--   1. `mostrar_nome` (padrão true: nada muda para as cenas que existem).
--   2. A coluna `nome` deixa de ser legível por `authenticated` direto na
--      tabela (privilégio por coluna). O RLS decide QUAIS linhas; não há
--      RLS por coluna, então a coluna sai do grant. O tempo real
--      (`postgres_changes`) respeita privilégio de coluna e também para
--      de mandar o nome no payload.
--   3. O nome passa a vir de `vtt_nome_da_cena`, que devolve o nome ao
--      narrador sempre e ao jogador só se `mostrar_nome`.
--   4. `list_vtt_scenes` e `set_vtt_scene_config` aprendem o campo.
--
-- ATENÇÃO para migrations futuras: coluna NOVA em `vtt_scenes` não entra
-- sozinha no grant por coluna — precisa de
-- `grant select (<coluna>) on public.vtt_scenes to authenticated;`.
-- ═══════════════════════════════════════════════════════════════════

begin;

-- ── 1. A escolha ────────────────────────────────────────────────────
alter table public.vtt_scenes
  add column if not exists mostrar_nome boolean not null default true;

comment on column public.vtt_scenes.mostrar_nome is
  'Se os jogadores veem o nome da cena. Falso: o nome só sai do banco para o narrador (ver vtt_nome_da_cena).';

-- ── 2. O nome sai do grant da tabela ────────────────────────────────
-- Tudo menos `nome`, montado do catálogo para não depender de uma lista
-- escrita à mão que envelhece.
revoke select on public.vtt_scenes from authenticated;
do $$
declare
  v_colunas text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_colunas
    from information_schema.columns
   where table_schema = 'public' and table_name = 'vtt_scenes' and column_name <> 'nome';
  execute format('grant select (%s) on public.vtt_scenes to authenticated', v_colunas);
end $$;

-- ── 3. Quem pode ler o nome ─────────────────────────────────────────
-- `null` quando a cena não existe, quando quem pede não pode vê-la, ou
-- quando o nome está escondido dele — os três iguais de propósito, como
-- em `vtt_pode_ver_cena`.
create or replace function public.vtt_nome_da_cena(p_scene_id uuid)
returns text
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
           when public.is_campaign_owner(s.campaign_id, auth.uid()) then s.nome
           when s.mostrar_nome and public.vtt_pode_ver_cena(s.id) then s.nome
         end
    from vtt_scenes s
   where s.id = p_scene_id;
$$;

revoke all on function public.vtt_nome_da_cena(uuid) from public, anon;
grant execute on function public.vtt_nome_da_cena(uuid) to authenticated;

-- ── 4a. Catálogo ─────────────────────────────────────────────────────
-- Igual à 0123, com o nome condicionado e `mostrar_nome` no objeto. O
-- jogador só recebe a cena apresentada; é nela que o nome some.
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
               'nome', case when v_narrador or s.mostrar_nome then s.nome end,
               'mostrar_nome', s.mostrar_nome,
               'local', s.local,
               'resumo', s.resumo,
               'largura', s.largura,
               'altura', s.altura,
               'grade_cor', s.grade_cor,
               'grade_opacidade', s.grade_opacidade,
               'celula_px', s.celula_px,
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

revoke all on function public.list_vtt_scenes(uuid, boolean) from public, anon;
grant execute on function public.list_vtt_scenes(uuid, boolean) to authenticated;

-- ── 4b. Configuração ─────────────────────────────────────────────────
-- Igual à 0124 (com o errcode da 0155), mais `p_mostrar_nome`. A
-- sobrecarga de dez parâmetros sai: duas versões coexistindo deixam o
-- PostgREST escolher por nome, e a errada grava por cima sem erro.
drop function if exists public.set_vtt_scene_config(uuid, text, text, text, integer, integer, integer, text, numeric, numeric);

create or replace function public.set_vtt_scene_config(
  p_scene_id uuid,
  p_nome text,
  p_local text,
  p_resumo text,
  p_largura integer,
  p_altura integer,
  p_expected_revision integer,
  p_grade_cor text default null,
  p_grade_opacidade numeric default null,
  p_celula_px numeric default null,
  p_mostrar_nome boolean default null
) returns vtt_scenes
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_scene vtt_scenes;
  v_nome  text;
begin
  select * into v_scene from public.vtt_scenes where id = p_scene_id for update;
  if v_scene.id is null then
    raise exception 'Cena não encontrada.' using errcode = 'no_data_found';
  end if;
  if not public.is_campaign_owner(v_scene.campaign_id, auth.uid()) then
    raise exception 'Só o narrador altera a cena.' using errcode = '42501';
  end if;
  if v_scene.revision <> p_expected_revision then
    raise exception 'A cena mudou enquanto você editava.' using errcode = 'check_violation';
  end if;

  v_nome := coalesce(nullif(btrim(p_nome), ''), v_scene.nome);

  if p_largura is null or p_altura is null
     or p_largura not between 1 and 200 or p_altura not between 1 and 200 then
    raise exception 'Largura e altura precisam estar entre 1 e 200 células.' using errcode = 'invalid_parameter_value';
  end if;
  if p_grade_cor is not null and p_grade_cor !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'A cor da grade precisa ser um hexadecimal #rrggbb.' using errcode = 'invalid_parameter_value';
  end if;
  if p_grade_opacidade is not null and p_grade_opacidade not between 0 and 1 then
    raise exception 'A opacidade da grade vai de 0 a 1.' using errcode = 'invalid_parameter_value';
  end if;
  if p_celula_px is not null and p_celula_px not between 8 and 512 then
    raise exception 'O tamanho da célula vai de 8 a 512 pixels.' using errcode = 'invalid_parameter_value';
  end if;

  update public.vtt_scenes
     set nome            = v_nome,
         local           = nullif(btrim(coalesce(p_local, '')), ''),
         resumo          = nullif(btrim(coalesce(p_resumo, '')), ''),
         largura         = p_largura,
         altura          = p_altura,
         grade_cor       = coalesce(p_grade_cor, grade_cor),
         grade_opacidade = coalesce(p_grade_opacidade, grade_opacidade),
         celula_px       = coalesce(p_celula_px, celula_px),
         mostrar_nome    = coalesce(p_mostrar_nome, mostrar_nome),
         revision        = revision + 1,
         updated_at      = now()
   where id = p_scene_id
   returning * into v_scene;

  return v_scene;
end;
$$;

revoke all on function public.set_vtt_scene_config(uuid, text, text, text, integer, integer, integer, text, numeric, numeric, boolean) from public, anon;
grant execute on function public.set_vtt_scene_config(uuid, text, text, text, integer, integer, integer, text, numeric, numeric, boolean) to authenticated;

commit;
