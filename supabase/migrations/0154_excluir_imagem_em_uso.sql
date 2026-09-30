-- 0154 — Excluir imagem da biblioteca MESMO em uso.
--
-- Antes a exclusão era recusada enquanto houvesse uso. Agora o narrador
-- decide: excluir tira a imagem de TODOS os usos, na mesma transação —
--   • cena: a colocação (fundo/tile) é removida;
--   • token: o retrato próprio volta a vazio (herda o avatar, se houver);
--   • ficha: o avatar volta a vazio (sigla);
--   • chat: a mensagem perde `imagemId` e ganha `imagemRemovida`, para o
--     card dizer que havia uma imagem ali em vez de sumir com ela calado.
-- Só então o arquivo é marcado `deleting` e a ação apaga o objeto.

begin;

-- A trava de cena arquivada (`vtt_recusar_escrita_em_cena_arquivada`)
-- barraria a cascata quando a imagem está numa cena arquivada. A
-- exclusão liga um sinal LOCAL à transação e a trava o respeita.
create or replace function public.vtt_recusar_escrita_em_cena_arquivada()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_scene_id uuid := coalesce(new.scene_id, old.scene_id);
begin
  -- Sem sessão = service role (coleta, manutenção, migration). Passa.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  -- Exclusão de imagem em cascata (0154): tirar o uso não é editar a cena.
  if current_setting('vtt.cascata_imagem', true) = 'on' then
    return coalesce(new, old);
  end if;

  if exists (select 1 from public.vtt_scenes s
              where s.id = v_scene_id and s.archived_at is not null) then
    raise exception 'Esta cena está arquivada — restaure antes de editar.'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce(new, old);
end;
$function$;

create or replace function public.vtt_excluir_imagem_da_campanha(p_campaign_id uuid, p_asset_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_asset vtt_image_assets%rowtype;
begin
  if not is_campaign_owner(p_campaign_id) then
    raise exception 'Sem acesso.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_asset
  from vtt_image_assets
  where id = p_asset_id and campaign_id = p_campaign_id
  for update;

  if v_asset.id is null then
    raise exception 'Imagem não encontrada nesta campanha.' using errcode = 'no_data_found';
  end if;

  if v_asset.estado = 'deleting' then
    return v_asset.storage_path;
  end if;

  perform set_config('vtt.cascata_imagem', 'on', true);
  delete from vtt_scene_images where image_id = v_asset.id;
  update vtt_tokens set retrato_image_id = null where retrato_image_id = v_asset.id;
  update characters set avatar_image_id = null where avatar_image_id = v_asset.id;
  update table_logs
     set payload = (payload - 'imagemId' - 'imagemLargura' - 'imagemAltura') || '{"imagemRemovida": true}'::jsonb
   where campaign_id = p_campaign_id and type = 'chat'
     and payload->>'imagemId' = v_asset.id::text;

  perform set_config('vtt.cascata_imagem', 'off', true);

  update vtt_image_assets
     set estado = 'deleting', updated_at = now()
   where id = v_asset.id;

  return v_asset.storage_path;
end;
$function$;

commit;
