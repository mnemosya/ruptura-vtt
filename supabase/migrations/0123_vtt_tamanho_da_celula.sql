-- ═══════════════════════════════════════════════════════════════════
-- 0123 — O TAMANHO DA CÉLULA EM PIXELS, por cena.
--
-- A grade do VTT é geométrica: 1 célula = 1 metro, e o zoom é contínuo.
-- Nada disso depende de pixel, e é por isso que a coluna não existia.
--
-- O que a obriga a existir é o MAPA PRONTO. Uma planta comprada vem com
-- uma grade desenhada de N pixels por quadrado, e encaixar a cena nela
-- é aritmética: 2000 px ÷ 70 px/célula = 28,6 células. Sem guardar o
-- divisor, quem monta a cena faz essa conta de cabeça, uma vez por
-- mapa, e erra por um quadrado — que é o erro nº 1 de mapa em VTT e o
-- motivo de a confirmação de imagem existir.
--
-- Ela é UNIDADE DE CONVERSÃO, não de desenho: o mapa continua sendo
-- desenhado em metros, e mudar este número não mexe em nada que já
-- está na cena. É o que o campo "px" da folha de parâmetros usa para
-- traduzir células em pixels nos dois sentidos.
--
-- O padrão (70) é o mesmo do Roll20 e o mais comum nos mapas prontos.
-- ═══════════════════════════════════════════════════════════════════

alter table public.vtt_scenes
  add column if not exists celula_px integer not null default 70;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vtt_scenes_celula_px_faixa') then
    alter table public.vtt_scenes
      add constraint vtt_scenes_celula_px_faixa check (celula_px between 8 and 512);
  end if;
end $$;

comment on column public.vtt_scenes.celula_px is
  'Pixels por célula. Unidade de CONVERSÃO para encaixar mapas prontos; o desenho continua em metros.';

-- ── Criar já com o tamanho da célula ────────────────────────────────
-- Necessário para "nova cena a partir de um mapa": a cena nasce com as
-- células que o mapa tem, e o divisor que produziu essa conta precisa
-- ficar guardado — senão a folha de parâmetros abriria com outro e a
-- primeira edição desalinharia o que tinha nascido alinhado.
drop function if exists public.create_vtt_scene(uuid, text, text, text, integer, integer);

create or replace function public.create_vtt_scene(
  p_campaign_id uuid,
  p_nome text,
  p_local text default null,
  p_resumo text default null,
  p_largura integer default 26,
  p_altura integer default 18,
  p_celula_px integer default 70
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
  if p_celula_px is not null and p_celula_px not between 8 and 512 then
    raise exception 'O tamanho da célula vai de 8 a 512 pixels.' using errcode = 'invalid_parameter_value';
  end if;

  insert into vtt_scenes (campaign_id, nome, local, resumo, largura, altura, celula_px, ativa, ordem, created_by, updated_by)
  values (
    p_campaign_id,
    coalesce(nullif(btrim(p_nome), ''), 'Cena'),
    nullif(btrim(p_local), ''),
    nullif(btrim(p_resumo), ''),
    p_largura,
    p_altura,
    coalesce(p_celula_px, 70),
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

revoke all on function public.create_vtt_scene(uuid, text, text, text, integer, integer, integer) from public, anon;
grant execute on function public.create_vtt_scene(uuid, text, text, text, integer, integer, integer) to authenticated;

-- ── A configuração passa a carregá-lo ───────────────────────────────
-- A sobrecarga de nove parâmetros (0122) sai junto, pelo mesmo motivo
-- de sempre: duas versões coexistindo deixam o PostgREST escolher por
-- nome, e a errada grava por cima sem erro nenhum.
drop function if exists public.set_vtt_scene_config(uuid, text, text, text, integer, integer, integer, text, numeric);

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
  p_celula_px integer default null
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
    raise exception 'A cena mudou enquanto você editava.' using errcode = 'serialization_failure';
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
         revision        = revision + 1,
         updated_at      = now()
   where id = p_scene_id
   returning * into v_scene;

  return v_scene;
end;
$$;

revoke all on function public.set_vtt_scene_config(uuid, text, text, text, integer, integer, integer, text, numeric, integer) from public, anon;
grant execute on function public.set_vtt_scene_config(uuid, text, text, text, integer, integer, integer, text, numeric, integer) to authenticated;

-- ── O catálogo devolve o divisor ────────────────────────────────────
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
