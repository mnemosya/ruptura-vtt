-- ═══════════════════════════════════════════════════════════════════
-- 0122 — A GRADE ganha cor e opacidade, por cena.
--
-- Até aqui a grade era uma constante de CSS (`rgba(150,190,215,.07)`),
-- igual em toda cena da campanha. O problema não é estética: uma planta
-- clara e um mapa noturno pedem grades opostas, e numa delas a linha
-- some ou berra. Quem prepara a cena é quem sabe qual das duas é.
--
-- POR CENA e não por campanha porque é a cena que tem a imagem. Guardar
-- isso num ajuste global obrigaria a escolher entre dois mapas que não
-- se parecem — exatamente o que esta coluna existe pra evitar.
--
-- Os PADRÕES reproduzem a constante que saiu do CSS: nenhuma cena que
-- já existe muda de aparência por causa desta migração.
--
-- A grade continua sendo DESENHO. Ela não muda alcance, custo de
-- movimento nem linha de visão — quem decide isso é o terreno
-- (`vtt_terrain`) e o objeto (`vtt_objects`). Deixar a opacidade em
-- zero esconde a linha e não apaga a geometria: os hexágonos continuam
-- lá, e é por isso que esconder a grade é seguro.
-- ═══════════════════════════════════════════════════════════════════

alter table public.vtt_scenes
  add column if not exists grade_cor text not null default '#96bed7',
  add column if not exists grade_opacidade numeric not null default 0.07;

do $$
begin
  -- Hex de seis dígitos e nada mais: a cor vai direto pro `stroke` de
  -- um SVG, e aceitar texto livre aqui seria deixar o banco carregar
  -- uma string que o navegador vai interpretar.
  if not exists (select 1 from pg_constraint where conname = 'vtt_scenes_grade_cor_hex') then
    alter table public.vtt_scenes
      add constraint vtt_scenes_grade_cor_hex check (grade_cor ~ '^#[0-9a-fA-F]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vtt_scenes_grade_opacidade_faixa') then
    alter table public.vtt_scenes
      add constraint vtt_scenes_grade_opacidade_faixa check (grade_opacidade between 0 and 1);
  end if;
end $$;

comment on column public.vtt_scenes.grade_cor is
  'Cor das linhas da grade, `#rrggbb`. Decoração: não muda alcance, custo nem visão.';
comment on column public.vtt_scenes.grade_opacidade is
  'Opacidade das linhas da grade, 0..1. Zero esconde a linha sem apagar a geometria.';

-- ── A configuração da cena passa a carregá-las ──────────────────────
-- A sobrecarga de SETE parâmetros sai junto. Duas versões coexistindo
-- deixam o PostgREST escolher por nome e a escolha errada grava a
-- configuração ANTIGA por cima da nova sem erro nenhum — foi o que a
-- 0121 acabou de consertar noutra função.
drop function if exists public.set_vtt_scene_config(uuid, text, text, text, integer, integer, integer);

create or replace function public.set_vtt_scene_config(
  p_scene_id uuid,
  p_nome text,
  p_local text,
  p_resumo text,
  p_largura integer,
  p_altura integer,
  p_expected_revision integer,
  -- `null` = não mexa neste campo, como em toda RPC de ajuste daqui.
  p_grade_cor text default null,
  p_grade_opacidade numeric default null
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

  -- Nome em branco volta pro que estava: a cena sempre tem nome (a
  -- coluna é `not null`), e apagar o campo não é o mesmo que pedir
  -- uma cena sem nome.
  v_nome := coalesce(nullif(btrim(p_nome), ''), v_scene.nome);

  -- Faixa igual à do `check` da tabela (1..200). Recusa explícita em
  -- vez de deixar a constraint estourar com mensagem de banco.
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

  update public.vtt_scenes
     set nome            = v_nome,
         local           = nullif(btrim(coalesce(p_local, '')), ''),
         resumo          = nullif(btrim(coalesce(p_resumo, '')), ''),
         largura         = p_largura,
         altura          = p_altura,
         grade_cor       = coalesce(p_grade_cor, grade_cor),
         grade_opacidade = coalesce(p_grade_opacidade, grade_opacidade),
         revision        = revision + 1,
         updated_at      = now()
   where id = p_scene_id
   returning * into v_scene;

  return v_scene;
end;
$$;

revoke all on function public.set_vtt_scene_config(uuid, text, text, text, integer, integer, integer, text, numeric) from public, anon;
grant execute on function public.set_vtt_scene_config(uuid, text, text, text, integer, integer, integer, text, numeric) to authenticated;

-- ── O catálogo devolve os dois campos ───────────────────────────────
-- A folha de parâmetros edita QUALQUER cena, não só a aberta: sem isso
-- ela abriria com a cor errada em toda cena que não é a atual.
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
               'ordem', s.ordem,
               'revision', s.revision,
               'arquivada_em', s.archived_at,
               'apresentada', (s.id = v_apresentada),
               'duplicada_de', s.duplicated_from_id,
               'pasta_id', s.folder_id,
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

revoke all on function public.list_vtt_scenes(uuid, boolean) from public, anon;
grant execute on function public.list_vtt_scenes(uuid, boolean) to authenticated;
