-- 0131 — A APARÊNCIA DA GRADE JÁ NA CRIAÇÃO DA CENA.
--
-- `create_vtt_scene` gravava a cor e a opacidade do DEFAULT da coluna
-- (0122), e a folha de criação não tinha como dizer outra coisa: quem
-- quisesse uma grade diferente criava a cena, abria os parâmetros e
-- salvava de novo — duas idas ao servidor e uma revisão gasta pra
-- ajustar algo que já se sabia antes de criar.
--
-- DROP ANTES DE CREATE, e não `create or replace`: acrescentar um
-- parâmetro com default não substitui a função, cria uma SOBRECARGA —
-- e o PostgREST, diante de duas `create_vtt_scene`, recusa a chamada
-- por ambiguidade em vez de escolher. Foi a lição de 0094/0096.
--
-- Os dois novos são opcionais e validados como em `set_vtt_scene_config`:
-- `null` mantém o default da coluna, que é o que a folha manda quando
-- ninguém mexeu nos controles.

drop function if exists public.create_vtt_scene(uuid, text, text, text, integer, integer, numeric);

create or replace function public.create_vtt_scene(
  p_campaign_id uuid,
  p_nome text,
  p_local text default null,
  p_resumo text default null,
  p_largura integer default 26,
  p_altura integer default 18,
  p_celula_px numeric default 70,
  p_grade_cor text default null,
  p_grade_opacidade numeric default null
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
  if p_grade_cor is not null and p_grade_cor !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'A cor da grade precisa ser um hexadecimal #rrggbb.' using errcode = 'invalid_parameter_value';
  end if;
  if p_grade_opacidade is not null and p_grade_opacidade not between 0 and 1 then
    raise exception 'A opacidade da grade vai de 0 a 1.' using errcode = 'invalid_parameter_value';
  end if;

  insert into vtt_scenes (
    campaign_id, nome, local, resumo, largura, altura, celula_px,
    grade_cor, grade_opacidade, ativa, ordem, created_by, updated_by
  )
  values (
    p_campaign_id,
    coalesce(nullif(btrim(p_nome), ''), 'Cena'),
    nullif(btrim(p_local), ''),
    nullif(btrim(p_resumo), ''),
    p_largura,
    p_altura,
    coalesce(p_celula_px, 70),
    coalesce(p_grade_cor, '#96bed7'),
    coalesce(p_grade_opacidade, 0.07),
    false,
    coalesce((select max(ordem) + 1 from vtt_scenes where campaign_id = p_campaign_id), 0),
    v_uid,
    v_uid
  )
  returning * into v_nova;

  return v_nova;
end;
$$;

revoke all on function public.create_vtt_scene(uuid, text, text, text, integer, integer, numeric, text, numeric) from public, anon;
grant execute on function public.create_vtt_scene(uuid, text, text, text, integer, integer, numeric, text, numeric) to authenticated;
