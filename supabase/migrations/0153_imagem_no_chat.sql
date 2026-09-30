-- 0153 — Imagem no chat.
--
-- Uma intenção de upload nova, `chat`, liberada para QUALQUER membro da
-- campanha (é conversa, não cena). O arquivo segue o mesmo caminho dos
-- outros: reserva → PUT na URL assinada → finalize que valida no
-- servidor. A mensagem do chat guarda o id em `payload.imagemId`.
--
-- Quem vê a imagem: quem vê a MENSAGEM. A assinatura
-- (`vtt_asset_assinavel_para`) ganha a cláusula "citada por um log do
-- chat que esta pessoa enxerga" — público, ou privado dela mesma; o
-- narrador já via tudo pela regra de dono.
--
-- Anexar exige que a imagem seja da pessoa: ela a enviou para o chat
-- (reserva `chat` consumida) OU já pode vê-la. Sem isso, um id qualquer
-- da campanha (um mapa escondido) viraria visível para a mesa só por
-- ser citado numa mensagem.

begin;

-- 1. Intenção `chat` na reserva.
alter table public.vtt_image_upload_reservations
  drop constraint if exists vtt_image_upload_reservations_intencao_check;
alter table public.vtt_image_upload_reservations
  add constraint vtt_image_upload_reservations_intencao_check
  check (intencao = any (array['fundo', 'tile', 'retrato', 'avatar', 'chat']));

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
  if p_intencao not in ('fundo', 'tile', 'retrato', 'avatar', 'chat') then
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
  elsif p_intencao = 'avatar' then
    if p_character_id is null then
      raise exception 'Avatar exige um personagem.' using errcode = 'invalid_parameter_value';
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

-- 2. Finalize do chat: só promove o arquivo. A mensagem é gravada
--    depois, pela ação do chat, que confere `pode_anexar_imagem_chat`.
create or replace function public.finalizar_upload_chat(p_reserva_id uuid, p_bytes_reais bigint, p_width_px integer, p_height_px integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  return vtt_finalizar_reserva(p_reserva_id, p_bytes_reais, p_width_px, p_height_px, 'chat');
end;
$function$;

-- 3. Pode citar esta imagem numa mensagem?
create or replace function public.pode_anexar_imagem_chat(p_campaign_id uuid, p_asset_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from vtt_image_assets a
    where a.id = p_asset_id
      and a.campaign_id = p_campaign_id
      and a.estado = 'ready'
      and (
        exists (
          select 1 from vtt_image_upload_reservations r
          where r.asset_id = a.id and r.user_id = auth.uid()
            and r.intencao = 'chat' and r.estado = 'consumida'
        )
        or vtt_asset_assinavel_para(a.id, auth.uid())
      )
  );
$function$;

-- 4. Assinatura: + imagem citada por mensagem do chat que a pessoa vê.
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

-- 5. A biblioteca não apaga imagem que está numa mensagem do chat.
create or replace function public.vtt_excluir_imagem_da_campanha(p_campaign_id uuid, p_asset_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_asset        vtt_image_assets%rowtype;
  v_usos_cena    integer;
  v_usos_retrato integer;
  v_usos_avatar  integer;
  v_usos_chat    integer;
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

  select count(*) into v_usos_cena    from vtt_scene_images si where si.image_id = v_asset.id;
  select count(*) into v_usos_retrato from vtt_tokens t        where t.retrato_image_id = v_asset.id;
  select count(*) into v_usos_avatar  from characters c        where c.avatar_image_id = v_asset.id;
  select count(*) into v_usos_chat    from table_logs l
   where l.campaign_id = p_campaign_id and l.type = 'chat' and l.deleted_at is null
     and l.payload->>'imagemId' = v_asset.id::text;

  if v_usos_cena + v_usos_retrato + v_usos_avatar + v_usos_chat > 0 then
    raise exception 'Esta imagem está em uso: % em cena, % como retrato, % como avatar, % no chat. Remova os usos antes de excluir.',
      v_usos_cena, v_usos_retrato, v_usos_avatar, v_usos_chat
      using errcode = 'foreign_key_violation';
  end if;

  update vtt_image_assets
     set estado = 'deleting', updated_at = now()
   where id = v_asset.id;

  return v_asset.storage_path;
end;
$function$;

revoke all on function public.finalizar_upload_chat(uuid, bigint, integer, integer) from public;
grant execute on function public.finalizar_upload_chat(uuid, bigint, integer, integer) to authenticated;
revoke all on function public.pode_anexar_imagem_chat(uuid, uuid) from public;
grant execute on function public.pode_anexar_imagem_chat(uuid, uuid) to authenticated;

-- A assinatura procura a imagem nas mensagens da campanha.
create index if not exists table_logs_chat_imagem_idx
  on public.table_logs (campaign_id, (payload->>'imagemId'))
  where type = 'chat' and payload ? 'imagemId';

commit;
