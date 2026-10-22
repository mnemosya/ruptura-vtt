-- Imagem do companheiro de caça (Domador). Segue o avatar da ficha
-- (0104): o arquivo vive na biblioteca da campanha e a ficha guarda só o
-- id numa COLUNA, nunca no payload — o payload vai inteiro para o cliente
-- e uma cópia ali seria uma segunda fonte para o mesmo fato.
--
-- O que muda, ponto a ponto:
--   1. `characters.companion_image_id`;
--   2. intenção 'companheiro' na reserva, com a mesma autorização do avatar
--      (quem gerencia a ficha);
--   3. `finalizar_upload_e_definir_companheiro` e
--      `set_character_companion_image` (ligar, trocar, tirar);
--   4. assinatura: quem lê a ficha vê o companheiro dela;
--   5. o GC, a exclusão pela biblioteca e a contagem de usos enxergam
--      o novo uso — sem isso a primeira coleta apagaria a imagem.

alter table public.characters
  add column if not exists companion_image_id uuid references public.vtt_image_assets(id) on delete set null;

alter table public.vtt_image_upload_reservations drop constraint vtt_image_upload_reservations_intencao_check;
alter table public.vtt_image_upload_reservations add constraint vtt_image_upload_reservations_intencao_check
  check (intencao = any (array['fundo', 'tile', 'retrato', 'avatar', 'chat', 'companheiro']));
alter table public.vtt_image_upload_reservations add constraint vtt_reserva_companheiro_tem_character
  check (intencao <> 'companheiro' or character_id is not null);

create or replace function public.reservar_upload_vtt_imagem(p_campaign_id uuid, p_sha256 text, p_intencao text, p_token_id uuid default null::uuid, p_character_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user        uuid := auth.uid();
  v_uso         vtt_campaign_storage_usage;
  v_asset       vtt_image_assets;
  v_teto        bigint := vtt_imagem_bytes_max();
  v_reserva_id  uuid;
  v_path        text;
begin
  if v_user is null then
    raise exception 'Sessão ausente.' using errcode = 'insufficient_privilege';
  end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash de conteúdo inválido.' using errcode = 'invalid_parameter_value';
  end if;
  if p_intencao not in ('fundo', 'tile', 'retrato', 'avatar', 'chat', 'companheiro') then
    raise exception 'Intenção inválida.' using errcode = 'invalid_parameter_value';
  end if;

  -- AUTORIZAÇÃO PELA INTENÇÃO. Nunca por escopo declarado: é a intenção
  -- gravada aqui que o finalize vai revalidar.
  if p_intencao in ('fundo', 'tile') then
    if not is_campaign_owner(p_campaign_id) then
      raise exception 'Só o narrador coloca imagens na cena.' using errcode = 'insufficient_privilege';
    end if;
  elsif p_intencao = 'chat' then
    -- Conversa da mesa: qualquer membro (o narrador é membro-dono).
    if not (is_campaign_owner(p_campaign_id) or is_campaign_member(p_campaign_id, v_user)) then
      raise exception 'Você não participa desta campanha.' using errcode = 'insufficient_privilege';
    end if;
  elsif p_intencao in ('avatar', 'companheiro') then
    -- Avatar e companheiro pertencem à ficha: mesma regra, mesmo alvo.
    if p_character_id is null then
      raise exception 'Esta imagem exige um personagem.' using errcode = 'invalid_parameter_value';
    end if;
    if not exists (
      select 1 from characters c
      where c.id = p_character_id and c.campaign_id = p_campaign_id
    ) then
      raise exception 'Personagem não encontrado nesta campanha.' using errcode = 'no_data_found';
    end if;
    if not can_manage_character(p_character_id) then
      raise exception 'Sem permissão sobre esta ficha.' using errcode = 'insufficient_privilege';
    end if;
  else
    if p_token_id is null then
      raise exception 'Retrato exige um token.' using errcode = 'invalid_parameter_value';
    end if;
    if not exists (select 1 from vtt_tokens t where t.id = p_token_id and t.campaign_id = p_campaign_id) then
      raise exception 'Token não encontrado nesta campanha.' using errcode = 'no_data_found';
    end if;
    if not can_move_vtt_token(p_token_id) then
      raise exception 'Sem permissão sobre este token.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if (select count(*) from vtt_image_upload_reservations r
      where r.user_id = v_user and r.estado = 'ativa' and r.expira_em > now()) >= vtt_reservas_ativas_max() then
    raise exception 'Já há uploads em andamento demais. Conclua ou cancele antes de começar outro.'
      using errcode = 'too_many_rows';
  end if;
  if (select count(*) from vtt_image_upload_reservations r
      where r.user_id = v_user and r.created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Uploads demais em pouco tempo. Tente de novo em instantes.' using errcode = 'too_many_rows';
  end if;

  select * into v_asset from vtt_image_assets
   where campaign_id = p_campaign_id and sha256 = p_sha256 and estado = 'ready';
  if found then
    return jsonb_build_object(
      'reutilizado', true, 'asset_id', v_asset.id, 'storage_path', v_asset.storage_path,
      'reserva_id', null, 'width_px', v_asset.width_px, 'height_px', v_asset.height_px
    );
  end if;

  insert into vtt_campaign_storage_usage (campaign_id) values (p_campaign_id)
    on conflict (campaign_id) do nothing;
  select * into v_uso from vtt_campaign_storage_usage
   where campaign_id = p_campaign_id for update;

  if v_uso.bytes_usados + v_uso.bytes_reservados + v_teto > vtt_campanha_bytes_max() then
    raise exception 'Espaço da campanha esgotado.' using errcode = 'disk_full';
  end if;
  if (select count(*) from vtt_image_assets a
      where a.campaign_id = p_campaign_id and a.estado <> 'deleting') >= vtt_campanha_assets_max() then
    raise exception 'Limite de imagens da campanha atingido.' using errcode = 'too_many_rows';
  end if;

  v_path := vtt_imagem_storage_path(p_campaign_id, p_sha256);

  insert into vtt_image_assets (campaign_id, storage_path, sha256, mime, uploaded_by)
  values (p_campaign_id, v_path, p_sha256, 'image/webp', v_user)
  on conflict (campaign_id, sha256) do update
    set updated_at = now(), uploaded_by = excluded.uploaded_by
  returning * into v_asset;

  if v_asset.estado <> 'pending' then
    raise exception 'Imagem em estado inesperado.' using errcode = 'check_violation';
  end if;

  insert into vtt_image_upload_reservations
    (campaign_id, user_id, asset_id, bytes_reservados, sha256, intencao, token_id, character_id, expira_em)
  values
    (p_campaign_id, v_user, v_asset.id, v_teto, p_sha256, p_intencao, p_token_id, p_character_id, now() + vtt_reserva_ttl())
  returning id into v_reserva_id;

  update vtt_campaign_storage_usage
     set bytes_reservados = bytes_reservados + v_teto, updated_at = now()
   where campaign_id = p_campaign_id;

  return jsonb_build_object(
    'reutilizado', false, 'asset_id', v_asset.id, 'storage_path', v_path,
    'reserva_id', v_reserva_id, 'width_px', null, 'height_px', null
  );
exception
  when unique_violation then
    raise exception 'Já existe um upload em andamento para esta imagem.' using errcode = 'too_many_rows';
end;
$function$;

-- Ligar, trocar ou tirar (null) a imagem do companheiro de uma ficha.
create or replace function public.set_character_companion_image(p_character_id uuid, p_image_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_char characters;
begin
  select * into v_char from characters where id = p_character_id for update;
  if v_char.id is null then
    raise exception 'Personagem não encontrado.' using errcode = 'no_data_found';
  end if;
  if not can_manage_character(p_character_id) then
    raise exception 'Sem permissão sobre esta ficha.' using errcode = 'insufficient_privilege';
  end if;
  if p_image_id is not null then
    -- Mesma campanha, sempre (ver `set_character_avatar_image`).
    if not exists (
      select 1 from vtt_image_assets a
      where a.id = p_image_id and a.campaign_id = v_char.campaign_id and a.estado = 'ready'
    ) then
      raise exception 'Imagem não encontrada nesta campanha.' using errcode = 'no_data_found';
    end if;
  end if;
  update characters set companion_image_id = p_image_id, updated_at = now()
   where id = p_character_id;
  return jsonb_build_object('character_id', p_character_id, 'companion_image_id', p_image_id);
end;
$function$;

create or replace function public.finalizar_upload_e_definir_companheiro(p_reserva_id uuid, p_bytes_reais bigint, p_width_px integer, p_height_px integer, p_character_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_r   vtt_image_upload_reservations;
  v_fim jsonb;
begin
  select * into v_r from vtt_image_upload_reservations where id = p_reserva_id;
  if v_r.id is null then
    raise exception 'Reserva não encontrada.' using errcode = 'no_data_found';
  end if;
  if v_r.character_id is distinct from p_character_id then
    raise exception 'Este upload foi autorizado para outra ficha.' using errcode = 'insufficient_privilege';
  end if;
  -- Mesmo teto do avatar: é um retrato pequeno.
  if p_bytes_reais > vtt_imagem_bytes_max_retrato() then
    raise exception 'Retrato acima do tamanho permitido.' using errcode = 'invalid_parameter_value';
  end if;

  v_fim := vtt_finalizar_reserva(p_reserva_id, p_bytes_reais, p_width_px, p_height_px, 'companheiro');
  perform set_character_companion_image(p_character_id, (v_fim->>'asset_id')::uuid);

  return jsonb_build_object(
    'character_id', p_character_id,
    'companion_image_id', (v_fim->>'asset_id')::uuid,
    'ja_consumida', (v_fim->>'ja_consumida')::boolean
  );
end;
$function$;

revoke all on function public.set_character_companion_image(uuid, uuid) from public, anon;
grant execute on function public.set_character_companion_image(uuid, uuid) to authenticated;
revoke all on function public.finalizar_upload_e_definir_companheiro(uuid, bigint, integer, integer, uuid) from public, anon;
grant execute on function public.finalizar_upload_e_definir_companheiro(uuid, bigint, integer, integer, uuid) to authenticated;

create or replace function public.vtt_asset_assinavel_para(p_asset_id uuid, p_user_id uuid default auth.uid())
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from vtt_image_assets a
    where a.id = p_asset_id
      and a.estado = 'ready'
      and (
        is_campaign_owner(a.campaign_id, p_user_id)
        or (
          is_campaign_member(a.campaign_id, p_user_id)
          and (
            exists (
              select 1 from vtt_scene_images si
              where si.image_id = a.id
                and si.visivel
                and vtt_pode_ver_cena(si.scene_id, p_user_id)
                and vtt_camada_cena_visivel(
                      si.scene_id,
                      case when si.papel = 'fundo' then 'imagemFundo' else 'tiles' end)
            )
            -- Retrato próprio de um token que esta pessoa enxerga.
            or exists (
              select 1 from vtt_tokens t
              where t.retrato_image_id = a.id
                and vtt_token_visivel_para(t.id, p_user_id)
            )
            -- Avatar de ficha que esta pessoa pode ler.
            or exists (
              select 1 from characters c
              where c.avatar_image_id = a.id
                and can_read_character(c.id, p_user_id)
            )
            -- Companheiro de caça de uma ficha que esta pessoa pode ler.
            or exists (
              select 1 from characters c
              where c.companion_image_id = a.id
                and can_read_character(c.id, p_user_id)
            )
            -- Avatar HERDADO por um token visível.
            or exists (
              select 1 from vtt_tokens t
              join characters c on c.id = t.character_id
              where c.avatar_image_id = a.id
                and t.retrato_image_id is null
                and t.retrato_url is null
                and vtt_token_visivel_para(t.id, p_user_id)
            )
            -- Imagem de mensagem do chat que esta pessoa enxerga.
            or exists (
              select 1 from table_logs l
              where l.campaign_id = a.campaign_id
                and l.type = 'chat'
                and l.deleted_at is null
                and l.payload->>'imagemId' = a.id::text
                and (l.visibility = 'public' or l.created_by_user_id = p_user_id)
            )
          )
        )
      )
  );
$function$;

create or replace function public.vtt_coletar_imagens_sem_uso(p_carencia interval default '01:00:00'::interval)
 returns table(storage_path text)
 language sql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  update vtt_image_assets a
     set estado = 'deleting', updated_at = now()
   where a.estado = 'ready'
     -- Carência: um arquivo recém-promovido pode estar entre o upload e
     -- a criação do uso num fluxo que ainda não terminou.
     and a.updated_at < now() - p_carencia
     and not exists (select 1 from vtt_scene_images si where si.image_id = a.id)
     and not exists (select 1 from vtt_tokens t where t.retrato_image_id = a.id)
     -- 0104: avatar de ficha é USO. Sem esta linha, a primeira passada
     -- do GC deixaria todas as fichas sem cara.
     and not exists (select 1 from characters c where c.avatar_image_id = a.id)
     -- Companheiro de caça também é uso.
     and not exists (select 1 from characters c where c.companion_image_id = a.id)
  returning a.storage_path;
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
  update characters set companion_image_id = null where companion_image_id = v_asset.id;
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

create or replace function public.read_vtt_campaign_images(p_campaign_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_campaign_owner(p_campaign_id) then
    raise exception 'Sem acesso.' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'width_px', a.width_px, 'height_px', a.height_px,
      'bytes', a.bytes, 'created_at', a.created_at,
      'usos_cena', (
        select count(*) from vtt_scene_images si where si.image_id = a.id
      ),
      'usos_retrato', (
        select count(*) from vtt_tokens t where t.retrato_image_id = a.id
      ),
      -- O companheiro conta como avatar na biblioteca: é a cara de algo da ficha.
      'usos_avatar', (
        select count(*) from characters c where c.avatar_image_id = a.id or c.companion_image_id = a.id
      )
    ) order by a.created_at desc)
    from vtt_image_assets a
    where a.campaign_id = p_campaign_id and a.estado = 'ready'
  ), '[]'::jsonb);
end;
$function$;
