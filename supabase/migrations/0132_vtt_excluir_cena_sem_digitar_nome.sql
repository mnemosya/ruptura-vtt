-- 0132 — EXCLUIR CENA DEIXA DE EXIGIR O NOME DIGITADO.
--
-- A confirmação por nome (0116) nasceu para uma exclusão que leva
-- conteúdo junto. Ela continua fazendo sentido em PASTA (0129), que
-- apaga subpastas e cenas em cascata: ali o gesto destrói coisas que
-- não estão à vista, e a digitação é o que obriga a olhar o que se
-- está mandando embora.
--
-- Numa CENA é atrito sem o mesmo lastro: o alvo é um item só, ele está
-- à vista no cartão, e o narrador que abriu o menu daquele cartão já
-- apontou para ele duas vezes. Digitar o nome ali não acrescenta
-- decisão, só custo — e custo que aparece justamente quando se está
-- arrumando o catálogo, ou seja, muitas vezes seguidas.
--
-- O resto das guardas FICA, e é onde a proteção real sempre esteve:
-- só o narrador exclui, a cena apresentada não sai debaixo da mesa, e a
-- última cena utilizável da campanha não pode sumir.
--
-- DROP ANTES DE CREATE porque a assinatura muda: `create or replace`
-- não tira parâmetro, criaria uma SOBRECARGA, e o PostgREST recusa por
-- ambiguidade em vez de escolher (0094/0096).

drop function if exists public.delete_vtt_scene(uuid, text);

create or replace function public.delete_vtt_scene(
  p_scene_id uuid
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

comment on function public.delete_vtt_scene(uuid) is
  'Exclui uma cena da campanha. Só o narrador; recusa a cena apresentada e a última utilizável. '
  'Sem confirmação por nome desde 0132 — essa exigência ficou só em delete_vtt_scene_folder, '
  'que apaga em cascata.';

revoke all on function public.delete_vtt_scene(uuid) from public, anon;
grant execute on function public.delete_vtt_scene(uuid) to authenticated;
