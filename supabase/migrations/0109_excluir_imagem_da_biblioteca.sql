-- ═══════════════════════════════════════════════════════════════════
-- 0109 — Excluir um arquivo da biblioteca da campanha, à mão.
--
-- Até aqui só existia a COLETA (`vtt_coletar_imagens_sem_uso`): um
-- arquivo sem uso nenhum some sozinho depois da carência. Isso resolve
-- resto de fluxo abandonado, não "subi o mapa errado e quero ele fora
-- daqui agora" — e uma imagem que a pessoa quer apagar hoje ficava na
-- grade até a coleta passar.
--
-- ── O QUE ESTA FUNÇÃO NÃO FAZ ───────────────────────────────────────
-- Ela não desfaz usos. Um arquivo colocado numa cena, usado como
-- retrato de token ou como avatar de ficha é RECUSADO, com a contagem
-- no erro para a pessoa saber o que remover antes. Apagar em cascata
-- seria decidir, do lugar errado, que a imagem some da cena de alguém.
-- A FK `on delete restrict` de `vtt_scene_images` diz o mesmo; aqui a
-- recusa vira mensagem em vez de erro de integridade.
--
-- ── COMO O ARQUIVO SOME ─────────────────────────────────────────────
-- Mesma dança da coleta: marca `deleting` e devolve o caminho. Quem
-- chama remove o objeto do Storage e confirma com
-- `vtt_confirmar_remocao_imagem`, que devolve a quota e apaga a linha.
-- Se a remoção física falhar, a linha fica marcada e a próxima passada
-- da coleta termina o serviço — nunca o contrário (linha apagada e
-- objeto órfão pagando quota).
-- ═══════════════════════════════════════════════════════════════════

create or replace function vtt_excluir_imagem_da_campanha(
  p_campaign_id uuid,
  p_asset_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_asset        vtt_image_assets%rowtype;
  v_usos_cena    integer;
  v_usos_retrato integer;
  v_usos_avatar  integer;
begin
  if not is_campaign_owner(p_campaign_id) then
    raise exception 'Sem acesso.' using errcode = 'insufficient_privilege';
  end if;

  -- Trava a linha: duas exclusões simultâneas do mesmo arquivo não
  -- podem descontar a quota duas vezes.
  select * into v_asset
  from vtt_image_assets
  where id = p_asset_id and campaign_id = p_campaign_id
  for update;

  if v_asset.id is null then
    raise exception 'Imagem não encontrada nesta campanha.' using errcode = 'no_data_found';
  end if;

  -- Já marcada por uma coleta ou por outra exclusão: devolver o caminho
  -- é o certo, e não um erro — quem chamou quer o objeto fora, e ele
  -- vai sair.
  if v_asset.estado = 'deleting' then
    return v_asset.storage_path;
  end if;

  select count(*) into v_usos_cena    from vtt_scene_images si where si.image_id = v_asset.id;
  select count(*) into v_usos_retrato from vtt_tokens t        where t.retrato_image_id = v_asset.id;
  select count(*) into v_usos_avatar  from characters c        where c.avatar_image_id = v_asset.id;

  if v_usos_cena + v_usos_retrato + v_usos_avatar > 0 then
    raise exception 'Esta imagem está em uso: % em cena, % como retrato, % como avatar. Remova os usos antes de excluir.',
      v_usos_cena, v_usos_retrato, v_usos_avatar
      using errcode = 'foreign_key_violation';
  end if;

  update vtt_image_assets
     set estado = 'deleting', updated_at = now()
   where id = v_asset.id;

  return v_asset.storage_path;
end;
$$;

revoke all on function vtt_excluir_imagem_da_campanha(uuid, uuid) from public, anon;
grant execute on function vtt_excluir_imagem_da_campanha(uuid, uuid) to authenticated;
