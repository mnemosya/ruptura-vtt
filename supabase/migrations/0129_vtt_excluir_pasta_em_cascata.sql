-- =====================================================================
-- 0129 — Excluir pasta passa a apagar o que está DENTRO dela
--
-- A 0117 decidiu o contrário, e vale citar o que ela escreveu: "pasta é
-- etiqueta, e apagar a etiqueta não pode apagar o que estava
-- etiquetado". O raciocínio é bom e continuaria valendo se pasta fosse
-- só uma etiqueta — mas na prática do catálogo ela virou CONTINENTE:
-- quem apaga "Ato I" quer que o Ato I inteiro saia, e o que acontecia
-- era o oposto — as cenas reapareciam soltas na raiz, uma a uma, pra
-- serem apagadas de novo à mão.
--
-- A exclusão agora é em CASCATA: a pasta, as subpastas e as cenas
-- delas. Três freios, e nenhum é decoração:
--
--   • CONFIRMAÇÃO POR NOME, igual a `delete_vtt_scene` (0116). Apagar
--     uma cena já custava digitar o nome dela; apagar N de uma vez não
--     pode custar menos.
--   • A CENA APRESENTADA não é apagada NUNCA — ela sobe pro pai da
--     pasta e a RPC devolve o nome dela pra quem chamou avisar. A mesa
--     inteira está olhando pra ela; sumir com o palco no meio da sessão
--     é o tipo de estrago que nenhuma confirmação compra de volta.
--   • A ÚLTIMA CENA UTILIZÁVEL da campanha continua protegida, mesma
--     regra da 0116: uma campanha sem cena não-arquivada é uma campanha
--     sem mesa.
--
-- Devolve um resumo (jsonb) em vez de `void`: quem chama precisa saber
-- quantas cenas foram, quantas subpastas, e se alguma cena foi POUPADA
-- — sem isso o aviso na tela seria chute.
-- =====================================================================

begin;

-- Assinatura nova (2 args, retorno jsonb). A antiga é REMOVIDA, não
-- sobrecarregada: duas funções com o mesmo nome e aridades diferentes
-- foi exatamente o que quebrou `move_vtt_token` na 0094/0096.
drop function if exists public.delete_vtt_scene_folder(uuid);

create or replace function public.delete_vtt_scene_folder(
  p_folder_id uuid,
  p_nome_confirmacao text
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
  v_subpastas  integer := 0;
  v_restantes  integer;
begin
  select * into v_pasta from vtt_scene_folders where id = p_folder_id;
  if v_pasta.id is null then
    raise exception 'Pasta não encontrada.' using errcode = 'no_data_found';
  end if;
  if not public.is_campaign_owner(v_pasta.campaign_id, v_uid) then
    raise exception 'Só o narrador organiza o catálogo.' using errcode = '42501';
  end if;
  if p_nome_confirmacao is distinct from v_pasta.nome then
    raise exception 'A confirmação não corresponde ao nome da pasta.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- A pasta e TODA a descendência dela, em largura. `cycle` protege
  -- contra um ciclo de `parent_id` que nunca deveria existir mas
  -- travaria o banco se existisse.
  with recursive descendencia as (
    select id from vtt_scene_folders where id = p_folder_id
    union all
    select f.id from vtt_scene_folders f join descendencia d on f.parent_id = d.id
  ) cycle id set ciclo using caminho
  select array_agg(id) into v_ids from descendencia;

  select presented_scene_id into v_palco
    from vtt_campaign_stage where campaign_id = v_pasta.campaign_id;

  -- A campanha não pode ficar sem nenhuma cena utilizável. Conta o que
  -- SOBRA: fora da subárvore, ou dentro dela sendo a apresentada (que
  -- não será apagada).
  select count(*) into v_restantes
    from vtt_scenes s
   where s.campaign_id = v_pasta.campaign_id
     and s.archived_at is null
     and (s.folder_id is null or not (s.folder_id = any(v_ids)) or s.id = v_palco);
  if v_restantes = 0 then
    raise exception 'Isto apagaria a última cena utilizável da campanha — crie outra antes.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- O PALCO é poupado e sobe pro pai da pasta apagada.
  if v_palco is not null then
    update vtt_scenes
       set folder_id = v_pasta.parent_id, updated_by = v_uid, updated_at = now()
     where id = v_palco
       and folder_id = any(v_ids)
    returning nome into v_preservada;
  end if;

  -- Conteúdo de cada cena sai por cascata de FK (0065/0085/0100), como
  -- em `delete_vtt_scene`.
  with apagadas as (
    delete from vtt_scenes
     where folder_id = any(v_ids)
       and (v_palco is null or id <> v_palco)
    returning 1
  ) select count(*) into v_cenas from apagadas;

  with apagadas as (
    delete from vtt_scene_folders where id = any(v_ids) returning 1
  ) select count(*) - 1 into v_subpastas from apagadas;

  return jsonb_build_object(
    'cenas', v_cenas,
    'subpastas', greatest(v_subpastas, 0),
    'preservada', v_preservada
  );
end;
$$;

comment on function public.delete_vtt_scene_folder(uuid, text) is
  'Apaga a pasta, as subpastas e as cenas delas. Exige o nome da pasta como confirmação. NUNCA apaga a cena apresentada (ela sobe para o pai) nem a última cena utilizável da campanha. Devolve {cenas, subpastas, preservada}.';

revoke all on function public.delete_vtt_scene_folder(uuid, text) from public, anon;
grant execute on function public.delete_vtt_scene_folder(uuid, text) to authenticated;

commit;
