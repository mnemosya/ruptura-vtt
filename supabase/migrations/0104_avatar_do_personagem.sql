-- =====================================================================
-- 0104 — Avatar do personagem, e o token HERDANDO ele
--
-- O avatar do Console do Personagem nunca teve origem: `CharacterConsole`
-- fazia `URL.createObjectURL(file)` e parava aí — preview em memória,
-- que morria ao fechar o console. O próprio comentário declarava a
-- limitação ("sem fluxo de upload real no projeto"). Esta migration dá
-- a ele o mesmo caminho que as imagens de cena já têm.
--
-- ── UMA IMAGEM, DUAS TELAS ──────────────────────────────────────────
-- Decisão do dono do produto: o avatar da FICHA é a fonte, e o token do
-- personagem o herda. Não são dois arquivos a manter em dia.
--
-- A precedência do token fica, de cima para baixo:
--
--   1. `vtt_tokens.retrato_image_id`  — sobreposição por arquivo
--   2. `vtt_tokens.retrato_url`       — sobreposição por endereço
--   3. `characters.avatar_image_id`   — HERANÇA da ficha  ← novo
--   4. a sigla
--
-- Herança é o caso normal, e sobrepor continua possível: um mesmo
-- personagem pode aparecer disfarçado numa cena, ou a mesa pode querer
-- um retrato "em cena" diferente do retrato de ficha. O que não existe
-- mais é subir a MESMA cara duas vezes.
--
-- Token sem personagem (`character_id is null`) não herda nada e segue
-- exatamente como antes — é um figurante, não tem ficha de onde puxar.
--
-- ── AUTORIZAÇÃO ─────────────────────────────────────────────────────
-- Avatar não é decisão de cena, é decisão de ficha: quem pode mexer é
-- quem `can_manage_character` diz — o dono, quem controla o personagem
-- na campanha, ou o narrador dela. NÃO se usa `is_campaign_owner` puro,
-- senão um personagem sem campanha (rascunho pessoal) ficaria sem
-- ninguém autorizado.
-- =====================================================================

begin;

-- ── A coluna ────────────────────────────────────────────────────────
alter table characters
  add column if not exists avatar_image_id uuid
    references vtt_image_assets(id) on delete set null;

comment on column characters.avatar_image_id is
  'Avatar da ficha (0104). O token do personagem herda isto quando não tem retrato próprio. Arquivo privado: só vira URL depois de assinado pelo servidor.';

create index if not exists characters_avatar_image_idx
  on characters (avatar_image_id) where avatar_image_id is not null;

-- ── A intenção nova ─────────────────────────────────────────────────
-- `character_id` entra ao lado de `token_id`: a reserva guarda O QUE
-- ela autoriza, e o finalize revalida contra isso. Sem a coluna, uma
-- reserva de avatar teria de carregar o alvo por fora — que é
-- exatamente o buraco que a revalidação de intenção existe para fechar.
alter table vtt_image_upload_reservations
  add column if not exists character_id uuid references characters(id) on delete cascade;

alter table vtt_image_upload_reservations
  drop constraint if exists vtt_image_upload_reservations_intencao_check;
alter table vtt_image_upload_reservations
  add constraint vtt_image_upload_reservations_intencao_check
  check (intencao in ('fundo', 'tile', 'retrato', 'avatar'));

alter table vtt_image_upload_reservations
  drop constraint if exists vtt_reserva_avatar_tem_character;
alter table vtt_image_upload_reservations
  add constraint vtt_reserva_avatar_tem_character
  check (intencao <> 'avatar' or character_id is not null);

-- ── Reserva: aceita `avatar` e autoriza pela ficha ──────────────────
-- O corpo abaixo é o da 0099 VERBATIM, com três acréscimos: o parâmetro
-- `p_character_id`, o ramo de autorização do avatar e a gravação do
-- alvo na reserva. Reescrever a função de memória (primeira tentativa)
-- perdeu o nome real da função de quota, o atalho de dedup e o
-- tratamento do `pending` órfão — por isso ela é copiada, não redigida.

create or replace function reservar_upload_vtt_imagem(
  p_campaign_id uuid,
  p_sha256      text,
  p_intencao    text,
  p_token_id    uuid default null,
  p_character_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  if p_intencao not in ('fundo', 'tile', 'retrato', 'avatar') then
    raise exception 'Intenção inválida.' using errcode = 'invalid_parameter_value';
  end if;

  -- AUTORIZAÇÃO PELA INTENÇÃO. Nunca por escopo declarado: é a intenção
  -- gravada aqui que o finalize vai revalidar.
  if p_intencao in ('fundo', 'tile') then
    if not is_campaign_owner(p_campaign_id) then
      raise exception 'Só o narrador coloca imagens na cena.' using errcode = 'insufficient_privilege';
    end if;
  elsif p_intencao = 'avatar' then
    -- Avatar é decisão de FICHA, não de cena: quem manda é
    -- `can_manage_character` (dono, quem controla, ou o narrador da
    -- campanha). Usar `is_campaign_owner` puro deixaria o jogador sem
    -- poder pôr a cara do próprio personagem.
    if p_character_id is null then
      raise exception 'Avatar exige um personagem.' using errcode = 'invalid_parameter_value';
    end if;
    -- O arquivo pertence à CAMPANHA (é o que a quota e o caminho do
    -- Storage usam), então o personagem tem de ser desta campanha.
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

  -- Rate limit e teto de reservas em aberto: uma signed URL é uma
  -- capability de ~2h, então acumular reservas é acumular capabilities.
  if (select count(*) from vtt_image_upload_reservations r
      where r.user_id = v_user and r.estado = 'ativa' and r.expira_em > now()) >= vtt_reservas_ativas_max() then
    raise exception 'Já há uploads em andamento demais. Conclua ou cancele antes de começar outro.'
      using errcode = 'too_many_rows';
  end if;
  if (select count(*) from vtt_image_upload_reservations r
      where r.user_id = v_user and r.created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Uploads demais em pouco tempo. Tente de novo em instantes.' using errcode = 'too_many_rows';
  end if;

  -- Atalho de dedup: conteúdo idêntico já pronto nesta campanha não
  -- sobe de novo nem consome quota de novo.
  select * into v_asset from vtt_image_assets
   where campaign_id = p_campaign_id and sha256 = p_sha256 and estado = 'ready';
  if found then
    return jsonb_build_object(
      'reutilizado', true, 'asset_id', v_asset.id, 'storage_path', v_asset.storage_path,
      'reserva_id', null, 'width_px', v_asset.width_px, 'height_px', v_asset.height_px
    );
  end if;

  -- Quota, serializada na linha de uso.
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

  -- Um `pending` desta mesma campanha+hash sem reserva ativa é resto de
  -- tentativa anterior; reaproveita a linha em vez de bater no unique.
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
$$;

revoke all on function reservar_upload_vtt_imagem(uuid, text, text, uuid, uuid) from public, anon;
grant execute on function reservar_upload_vtt_imagem(uuid, text, text, uuid, uuid) to authenticated;
-- A assinatura de 4 argumentos (0099) sai de cena: deixá-la viva daria
-- dois caminhos de reserva, e só um deles conheceria `avatar`.
drop function if exists reservar_upload_vtt_imagem(uuid, text, text, uuid);

-- ── Gravar o avatar ─────────────────────────────────────────────────
create or replace function set_character_avatar_image(
  p_character_id uuid,
  p_image_id     uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
    -- Mesma campanha, sempre: sem isto, uma ficha da campanha A
    -- apontaria um arquivo da campanha B e a assinatura passaria a
    -- vazar entre mesas.
    if not exists (
      select 1 from vtt_image_assets a
      where a.id = p_image_id and a.campaign_id = v_char.campaign_id and a.estado = 'ready'
    ) then
      raise exception 'Imagem não encontrada nesta campanha.' using errcode = 'no_data_found';
    end if;
  end if;

  update characters set avatar_image_id = p_image_id, updated_at = now()
   where id = p_character_id;

  -- Não há broadcast explícito aqui: quem avisa a mesa é o trigger de
  -- `characters`, e um segundo caminho para o mesmo aviso seria um
  -- caminho a divergir.
  --
  -- ⚠ ERRATA (ver 0107): quando esta migration foi escrita, o trigger
  -- era `AFTER UPDATE OF payload`, e o update abaixo toca
  -- `avatar_image_id` — ou seja, ele NÃO disparava, e o avatar só
  -- aparecia na mesa depois de recarregar a página. A 0107 estende o
  -- gatilho. O raciocínio acima continua valendo; ele é que estava
  -- aplicado ao gatilho errado.

  return jsonb_build_object('character_id', p_character_id, 'avatar_image_id', p_image_id);
end;
$$;

revoke all on function set_character_avatar_image(uuid, uuid) from public, anon;
grant execute on function set_character_avatar_image(uuid, uuid) to authenticated;

-- ── Finalização atômica do avatar ───────────────────────────────────
-- Mesma disciplina de 0100/0101: promover o arquivo e criar o uso na
-- MESMA transação, para nunca existir asset `ready` sem referência.
create or replace function finalizar_upload_e_definir_avatar(
  p_reserva_id   uuid,
  p_bytes_reais  bigint,
  p_width_px     integer,
  p_height_px    integer,
  p_character_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_r   vtt_image_upload_reservations;
  v_fim jsonb;
begin
  select * into v_r from vtt_image_upload_reservations where id = p_reserva_id;
  if v_r.id is null then
    raise exception 'Reserva não encontrada.' using errcode = 'no_data_found';
  end if;
  -- O alvo tem de ser o MESMO que foi autorizado. Aceitar o que o
  -- cliente manda agora seria autorizar na ida e confiar na volta.
  if v_r.character_id is distinct from p_character_id then
    raise exception 'Este upload foi autorizado para outra ficha.' using errcode = 'insufficient_privilege';
  end if;
  -- Avatar usa o teto do retrato: é uma cara num hexágono de 96 px, não
  -- um mapa.
  if p_bytes_reais > vtt_imagem_bytes_max_retrato() then
    raise exception 'Retrato acima do tamanho permitido.' using errcode = 'invalid_parameter_value';
  end if;

  v_fim := vtt_finalizar_reserva(p_reserva_id, p_bytes_reais, p_width_px, p_height_px, 'avatar');
  perform set_character_avatar_image(p_character_id, (v_fim->>'asset_id')::uuid);

  return jsonb_build_object(
    'character_id', p_character_id,
    'avatar_image_id', (v_fim->>'asset_id')::uuid,
    'ja_consumida', (v_fim->>'ja_consumida')::boolean
  );
end;
$$;

revoke all on function finalizar_upload_e_definir_avatar(uuid, bigint, integer, integer, uuid) from public, anon;
grant execute on function finalizar_upload_e_definir_avatar(uuid, bigint, integer, integer, uuid) to authenticated;

-- ── Assinatura: o avatar também é assinável ─────────────────────────
-- Quem pode LER a ficha pode ver a cara dela. Note que isto é mais
-- largo que a regra das imagens de cena de propósito: um avatar não
-- esconde informação tática, e um token visível na mesa já mostra o
-- rosto para todo mundo que enxerga o token.
create or replace function vtt_asset_assinavel_para(p_asset_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
            -- Avatar de ficha legível por esta pessoa (0104).
            or exists (
              select 1 from characters c
              where c.avatar_image_id = a.id
                and can_read_character(c.id, p_user_id)
            )
          )
        )
      )
  );
$$;

revoke all on function vtt_asset_assinavel_para(uuid, uuid) from public, anon, authenticated;
grant execute on function vtt_asset_assinavel_para(uuid, uuid) to service_role;

-- ── Coleta: o avatar é um USO ───────────────────────────────────────
-- Sem esta linha, a coleta recolheria o arquivo de todo avatar (nenhuma
-- colocação e nenhum token apontam para ele) e as fichas ficariam sem
-- cara depois da primeira passada do GC.
create or replace function vtt_coletar_imagens_sem_uso(p_carencia interval default interval '1 hour')
returns table(storage_path text)
language sql
security definer
set search_path = public, pg_temp
as $$
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
  returning a.storage_path;
$$;

revoke all on function vtt_coletar_imagens_sem_uso(interval) from public, anon, authenticated;
grant execute on function vtt_coletar_imagens_sem_uso(interval) to service_role;

commit;
