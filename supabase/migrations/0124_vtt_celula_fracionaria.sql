-- ═══════════════════════════════════════════════════════════════════
-- 0124 — O tamanho da célula aceita FRAÇÃO.
--
-- A 0123 guardou `celula_px` como inteiro, e isso deixava um buraco
-- que só aparece com mapa na mão: uma planta de 2000 px não fecha em
-- células de 70. O melhor que a tela podia fazer era arredondar para
-- 29 células (2030 px) e avisar que sobrou — empurrando para quem usa
-- uma conta que o programa sabe fazer.
--
-- Com fração ela fecha: 2000 ÷ 29 = 68,9655 px por célula, e a grade
-- cobre o mapa inteiro sem faixa cortada na borda. O divisor continua
-- sendo CONVERSÃO — o desenho segue em metros, e nada no mapa muda de
-- lugar por causa deste número.
--
-- `numeric(10,4)` e não `real`: quatro casas bastam para qualquer
-- divisão de mapa (o erro acumulado em 200 células fica abaixo de meio
-- pixel) e ponto flutuante binário não representa 68,9655 — guardar
-- dinheiro e medida em `float` é o erro clássico que esta coluna não
-- precisa repetir.
-- ═══════════════════════════════════════════════════════════════════

alter table public.vtt_scenes
  alter column celula_px type numeric(10,4) using celula_px::numeric(10,4),
  alter column celula_px set default 70;

comment on column public.vtt_scenes.celula_px is
  'Pixels por célula, com até quatro casas. Unidade de CONVERSÃO para encaixar mapas prontos; o desenho continua em metros.';

-- As duas RPCs recebiam `integer`: trocar o tipo do parâmetro cria uma
-- assinatura NOVA, então a velha cai junto — duas coexistindo deixam o
-- PostgREST escolher por nome, e a errada trunca a fração em silêncio.
drop function if exists public.create_vtt_scene(uuid, text, text, text, integer, integer, integer);
drop function if exists public.set_vtt_scene_config(uuid, text, text, text, integer, integer, integer, text, numeric, integer);

create or replace function public.create_vtt_scene(
  p_campaign_id uuid,
  p_nome text,
  p_local text default null,
  p_resumo text default null,
  p_largura integer default 26,
  p_altura integer default 18,
  p_celula_px numeric default 70
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
    false,
    coalesce((select max(ordem) + 1 from vtt_scenes where campaign_id = p_campaign_id), 0),
    v_uid,
    v_uid
  )
  returning * into v_nova;

  return v_nova;
end;
$$;

revoke all on function public.create_vtt_scene(uuid, text, text, text, integer, integer, numeric) from public, anon;
grant execute on function public.create_vtt_scene(uuid, text, text, text, integer, integer, numeric) to authenticated;

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
  p_celula_px numeric default null
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

revoke all on function public.set_vtt_scene_config(uuid, text, text, text, integer, integer, integer, text, numeric, numeric) from public, anon;
grant execute on function public.set_vtt_scene_config(uuid, text, text, text, integer, integer, integer, text, numeric, numeric) to authenticated;
