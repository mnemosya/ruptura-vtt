-- =====================================================================
-- 0119 — Quando o palco alcança quem foi separado
--
-- A 0118 estabeleceu uma invariante e só a manteve na metade dos
-- caminhos. A invariante é:
--
--     uma linha em `vtt_player_scene_assignments` significa
--     "esta pessoa NÃO está onde a mesa está".
--
-- `move_players_to_scene` já a respeitava: mandar alguém para a cena do
-- palco APAGA a atribuição em vez de gravá-la. `present_vtt_scene` não
-- — levar a mesa até a cena de alguém deixava a linha dele intacta.
--
-- O resultado era um estado que se contradiz: todo mundo na mesma cena,
-- e uma pessoa marcada como separada. Na tela isso aparecia como
-- "Reagrupar (1)" com o grupo inteiro junto. Pior que o contador, a
-- consequência real: quando a mesa saísse dali, essa pessoa ficaria
-- para trás sem que ninguém tivesse decidido isso na hora — a decisão
-- tinha sido tomada minutos antes, para outra situação.
--
-- Encontrado pelo check de interface da fase 6, que montou o caso sem
-- querer: mandar a Alma para as Catacumbas e depois apresentar as
-- Catacumbas.
--
-- Regenerada da 0111 com um `delete` a mais. O resto é idêntico.
-- =====================================================================

begin;

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

  -- O palco ALCANÇOU quem estava separado nesta cena: a atribuição
  -- deixa de descrever qualquer coisa, e mantê-la faria essa pessoa
  -- ficar para trás na PRÓXIMA apresentação sem ninguém ter decidido
  -- isso agora.
  delete from vtt_player_scene_assignments
   where campaign_id = p_campaign_id and scene_id = p_scene_id;

  -- Espelho do legado. Enquanto houver RPC perguntando `s.ativa`, ela
  -- precisa continuar respondendo a verdade — e a verdade agora é o
  -- palco.
  update vtt_scenes
     set ativa = (id = p_scene_id)
   where campaign_id = p_campaign_id
     and ativa is distinct from (id = p_scene_id);

  return v_stage;
end;
$$;

comment on function public.present_vtt_scene(uuid, uuid, integer) is
  'Move a mesa inteira para uma cena. Narrador-only, serializada por bloqueio de linha, com revisão opcional. Apaga as atribuições individuais que apontavam para a cena nova — o palco alcançou quem estava lá.';

commit;
