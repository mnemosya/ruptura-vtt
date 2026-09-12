-- =====================================================================
-- 0099 — Imagens do VTT: arquivo, reserva de quota e fiscalização
--
-- Primeiro uso de Supabase Storage no projeto. Até aqui, imagem no VTT
-- era `vtt_tokens.retrato_url` — e a 0073 é explícita sobre o que isso
-- significa: "sem storage próprio nesta fase (o narrador cola uma URL
-- já hospedada em outro lugar)". Esta migration dá origem própria ao
-- arquivo.
--
-- ── PRIVACIDADE: NENHUM ACESSO DIRETO ───────────────────────────────
-- Nem `vtt_image_assets` nem `storage.objects` recebem policy de
-- `select` para participante, e o bucket não ganha policy nenhuma.
-- A razão é concreta: no Supabase, assinar uma URL de download EXIGE
-- permissão de leitura sobre o objeto. Conceder leitura "a quem é
-- membro da campanha" tornaria descobrível, por qualquer membro e por
-- fora da interface, o caminho e o hash de asset ainda não colocado,
-- de tile com `visivel = false` e de cena futura — exatamente o que o
-- bucket privado deveria impedir. Toda assinatura é mintada no
-- servidor, por um cliente service-role que nunca sai de lá
-- (`src/lib/supabase/adminClient.ts`), depois de resolver AUTORIZAÇÃO
-- POR ID.
--
-- ── ARQUIVO É NEUTRO ────────────────────────────────────────────────
-- "Fundo", "tile" e "retrato" são propriedades do USO, não do arquivo.
-- Por isso `vtt_image_assets` não tem escopo — e é só por isso que
-- `unique (campaign_id, sha256)` fecha: o mesmo conteúdo serve de tile
-- ao narrador e de retrato ao jogador sem colidir.
--
-- ── UMA FONTE DE VERDADE PARA O CICLO DE VIDA ───────────────────────
--   reserva  → cria o asset em `pending` e aponta para ele
--   finalize → promove `pending` → `ready`, NA MESMA TRANSAÇÃO do uso
-- Não existe asset nascendo no finalize, e não existe `pending` que a
-- reserva desconheça. As duas coisas juntas se contradiziam.
--
-- SEM contador de referências de propósito: `refs` exigiria trigger com
-- trava para não perder a corrida "última referência removida ↔ nova
-- referência criada", e ainda assim sofreria drift. O volume inicial é
-- pequeno, então quem decide é `not exists` sobre os usos reais, no GC.
--
-- ── A RESERVA CONTABILIZA O TETO FÍSICO, NÃO O DECLARADO ────────────
-- Uma signed upload URL é uma CAPABILITY temporária: ela não impõe o
-- tamanho informado na reserva — o único limite que vale no `PUT` é o
-- global do bucket. Declarar 100 KB e enviar 10 MB seria abuso barato e
-- repetível. Por isso a reserva desconta `vtt_imagem_bytes_max()`, e o
-- excedente volta no finalize, quando o tamanho REAL é conhecido.
--
-- ── O QUE NÃO ESTÁ AQUI, E POR QUÊ ──────────────────────────────────
-- Os finalizadores públicos moram na migration que é dona do USO:
-- `finalizar_upload_e_criar_imagem_cena` vai com `vtt_scene_images`, e
-- `finalizar_upload_e_definir_retrato` vai com `vtt_tokens
-- .retrato_image_id`. Aqui fica só o helper compartilhado
-- `vtt_finalizar_reserva`, que eles chamam DENTRO da própria transação
-- — é isso que impede a janela em que existiria um asset `ready` sem
-- nenhuma referência, esperando o GC recolher o que acabou de nascer.
-- =====================================================================

begin;

-- ── Limites, num lugar só ───────────────────────────────────────────
-- Funções em vez de literais espalhados: reserva, finalize e GC
-- precisam concordar, e um número repetido em três corpos de função é
-- um número que vai divergir.

create or replace function vtt_imagem_bytes_max() returns bigint
  language sql immutable as $$ select 10485760::bigint $$;          -- 10 MB

create or replace function vtt_imagem_bytes_max_retrato() returns bigint
  language sql immutable as $$ select 2097152::bigint $$;           -- 2 MB

create or replace function vtt_imagem_lado_max_px() returns integer
  language sql immutable as $$ select 4096 $$;

create or replace function vtt_campanha_bytes_max() returns bigint
  language sql immutable as $$ select 1073741824::bigint $$;        -- 1 GB

-- Teto de CONTAGEM, além do de bytes: 1 GB ainda comporta milhares de
-- imagens pequenas, e mil colocações numa cena não é quota estourada —
-- é render impossível.
create or replace function vtt_campanha_assets_max() returns integer
  language sql immutable as $$ select 300 $$;

create or replace function vtt_reservas_ativas_max() returns integer
  language sql immutable as $$ select 3 $$;

create or replace function vtt_reserva_ttl() returns interval
  language sql immutable as $$ select interval '30 minutes' $$;

-- ── Tabelas ─────────────────────────────────────────────────────────

create table if not exists vtt_image_assets (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  storage_path  text not null unique,
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime          text not null check (mime in ('image/webp')),
  -- Nulos enquanto `pending`: largura, altura e tamanho só entram
  -- depois que o servidor DECODIFICOU o objeto. O que o browser
  -- declara não é gravado em lugar nenhum — seria gravar uma alegação.
  bytes         bigint null check (bytes is null or bytes > 0),
  width_px      integer null check (width_px is null or width_px > 0),
  height_px     integer null check (height_px is null or height_px > 0),
  estado        text not null default 'pending' check (estado in ('pending', 'ready', 'deleting')),
  uploaded_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint vtt_image_assets_ready_completo check (
    estado <> 'ready' or (bytes is not null and width_px is not null and height_px is not null)
  ),
  unique (campaign_id, sha256),
  -- Alvo das FKs COMPOSTAS de quem referencia o asset (colocação de
  -- cena, retrato de token). Sem ela, o banco aceitaria ligar uma
  -- colocação da campanha A a uma imagem da campanha B — mesma proteção
  -- que a 0085 deu a `vtt_objects` com `(id, campaign_id)`.
  unique (id, campaign_id)
);

create index if not exists vtt_image_assets_campanha_idx on vtt_image_assets (campaign_id);
create index if not exists vtt_image_assets_coleta_idx on vtt_image_assets (estado, updated_at);

-- Uma linha por campanha. É esta linha que se TRAVA para serializar a
-- quota: sem ela, duas reservas simultâneas leem o mesmo saldo e as
-- duas passam.
create table if not exists vtt_campaign_storage_usage (
  campaign_id      uuid primary key references campaigns(id) on delete cascade,
  bytes_usados     bigint not null default 0 check (bytes_usados >= 0),
  bytes_reservados bigint not null default 0 check (bytes_reservados >= 0),
  updated_at       timestamptz not null default now()
);

create table if not exists vtt_image_upload_reservations (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references campaigns(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  asset_id          uuid not null references vtt_image_assets(id) on delete cascade,
  bytes_reservados  bigint not null check (bytes_reservados > 0),
  sha256            text not null,
  -- A INTENÇÃO é gravada na reserva e revalidada no finalize. Sem isto,
  -- uma reserva autorizada como "retrato" (que um jogador consegue)
  -- poderia ser finalizada como "tile" (que ele não consegue) — a
  -- autorização viraria um campo enviado pelo cliente.
  intencao          text not null check (intencao in ('fundo', 'tile', 'retrato')),
  token_id          uuid references vtt_tokens(id) on delete cascade,
  estado            text not null default 'ativa' check (estado in ('ativa', 'consumida', 'cancelada')),
  expira_em         timestamptz not null,
  created_at        timestamptz not null default now(),
  constraint vtt_reserva_retrato_tem_token check (intencao <> 'retrato' or token_id is not null)
);

-- Uma reserva ATIVA por (campanha, conteúdo): o segundo upload do mesmo
-- hash não ganha uma segunda URL. Ele reaproveita quando o primeiro
-- ficar `ready`, ou tenta de novo depois que a reserva expirar.
create unique index if not exists vtt_reserva_ativa_por_conteudo_idx
  on vtt_image_upload_reservations (campaign_id, sha256) where estado = 'ativa';

create index if not exists vtt_reserva_usuario_idx on vtt_image_upload_reservations (user_id, estado);
create index if not exists vtt_reserva_expiracao_idx on vtt_image_upload_reservations (expira_em) where estado = 'ativa';

-- ── Bucket ──────────────────────────────────────────────────────────
-- Privado. `file_size_limit` e `allowed_mime_types` no PRÓPRIO bucket
-- são a segunda barreira: a primeira é a RPC, mas a signed URL é usada
-- por fora dela, então o teto precisa existir onde o `PUT` chega.
--
-- SVG fica fora por ser FORMATO ATIVO — parser e superfície de execução
-- que este recurso não precisa. GIF fica fora porque o pipeline
-- reencoda em WebP, o que achataria a animação no primeiro frame:
-- recusar é mais honesto que aceitar e mutilar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vtt-imagens', 'vtt-imagens', false, 10485760, array['image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Caminho canônico ────────────────────────────────────────────────
-- Derivado, nunca recebido do cliente: um caminho enviado por fora
-- poderia apontar para a pasta de outra campanha.
create or replace function vtt_imagem_storage_path(p_campaign_id uuid, p_sha256 text)
returns text
language sql
immutable
as $$ select p_campaign_id::text || '/' || p_sha256 || '.webp' $$;

-- ── Reserva ─────────────────────────────────────────────────────────
create or replace function reservar_upload_vtt_imagem(
  p_campaign_id uuid,
  p_sha256      text,
  p_intencao    text,
  p_token_id    uuid default null
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
  if p_intencao not in ('fundo', 'tile', 'retrato') then
    raise exception 'Intenção inválida.' using errcode = 'invalid_parameter_value';
  end if;

  -- AUTORIZAÇÃO PELA INTENÇÃO. Nunca por escopo declarado: é a intenção
  -- gravada aqui que o finalize vai revalidar.
  if p_intencao in ('fundo', 'tile') then
    if not is_campaign_owner(p_campaign_id) then
      raise exception 'Só o narrador coloca imagens na cena.' using errcode = 'insufficient_privilege';
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
    (campaign_id, user_id, asset_id, bytes_reservados, sha256, intencao, token_id, expira_em)
  values
    (p_campaign_id, v_user, v_asset.id, v_teto, p_sha256, p_intencao, p_token_id, now() + vtt_reserva_ttl())
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

revoke all on function reservar_upload_vtt_imagem(uuid, text, text, uuid) from public, anon;
grant execute on function reservar_upload_vtt_imagem(uuid, text, text, uuid) to authenticated;

-- ── Finalização: o helper que os USOS chamam ────────────────────────
-- Não é público de propósito: promover um asset sem criar o uso na
-- mesma transação abriria a janela de um `ready` sem referência, que o
-- GC recolheria logo em seguida — apagando o que acabou de subir.
--
-- IDEMPOTENTE: repetir a chamada de uma reserva já consumida devolve o
-- mesmo `asset_id` com `ja_consumida = true`, para o finalizador
-- público devolver o uso que ELE já criou em vez de criar um segundo.
create or replace function vtt_finalizar_reserva(
  p_reserva_id        uuid,
  p_bytes_reais       bigint,
  p_width_px          integer,
  p_height_px         integer,
  p_intencao_esperada text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_r     vtt_image_upload_reservations;
  v_asset vtt_image_assets;
begin
  select * into v_r from vtt_image_upload_reservations where id = p_reserva_id for update;
  if v_r is null then
    raise exception 'Reserva não encontrada.' using errcode = 'no_data_found';
  end if;

  -- REVALIDAÇÃO DA INTENÇÃO. É o que impede uma reserva autorizada como
  -- retrato de ser finalizada como tile.
  if v_r.intencao <> p_intencao_esperada then
    raise exception 'Este upload foi autorizado para outro uso.' using errcode = 'insufficient_privilege';
  end if;
  if v_r.user_id <> auth.uid() then
    raise exception 'Reserva de outra pessoa.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_asset from vtt_image_assets where id = v_r.asset_id for update;

  if v_r.estado = 'consumida' then
    return jsonb_build_object('asset_id', v_asset.id, 'ja_consumida', true);
  end if;
  if v_r.estado <> 'ativa' then
    raise exception 'Upload cancelado.' using errcode = 'check_violation';
  end if;
  if v_r.expira_em <= now() then
    raise exception 'O upload expirou. Tente de novo.' using errcode = 'check_violation';
  end if;

  if p_bytes_reais <= 0 or p_bytes_reais > vtt_imagem_bytes_max() then
    raise exception 'Arquivo fora do tamanho permitido.' using errcode = 'invalid_parameter_value';
  end if;
  -- Teto do retrato cobrado AQUI também, não só no cliente: a checagem
  -- do browser é conveniência, esta é a regra.
  if v_r.intencao = 'retrato' and p_bytes_reais > vtt_imagem_bytes_max_retrato() then
    raise exception 'Retrato acima do tamanho permitido.' using errcode = 'invalid_parameter_value';
  end if;
  if p_width_px <= 0 or p_height_px <= 0
     or greatest(p_width_px, p_height_px) > vtt_imagem_lado_max_px() then
    raise exception 'Dimensões da imagem fora do permitido.' using errcode = 'invalid_parameter_value';
  end if;

  -- As dimensões e o tamanho gravados são os que o SERVIDOR mediu
  -- decodificando o objeto (ver `lib/vtt/imageService.ts`), nunca os
  -- que o cliente declarou.
  update vtt_image_assets
     set estado = 'ready', bytes = p_bytes_reais,
         width_px = p_width_px, height_px = p_height_px, updated_at = now()
   where id = v_asset.id
  returning * into v_asset;

  update vtt_image_upload_reservations set estado = 'consumida' where id = v_r.id;

  -- Converte reserva em uso e DEVOLVE o excedente do teto físico.
  update vtt_campaign_storage_usage
     set bytes_reservados = greatest(0, bytes_reservados - v_r.bytes_reservados),
         bytes_usados     = bytes_usados + p_bytes_reais,
         updated_at       = now()
   where campaign_id = v_r.campaign_id;

  return jsonb_build_object('asset_id', v_asset.id, 'ja_consumida', false);
end;
$$;

revoke all on function vtt_finalizar_reserva(uuid, bigint, integer, integer, text) from public, anon, authenticated;

-- ── Cancelamento e coleta ───────────────────────────────────────────
-- Ambos devolvem o `storage_path` a remover: banco e Storage não
-- compartilham transação, então o SQL diz o que ficou pendente e o
-- serviço remove — se a remoção falhar, a linha continua `deleting` e a
-- próxima passada tenta de novo. Idempotente por construção, em vez de
-- duas exclusões torcendo para ambas passarem.
create or replace function cancelar_upload_vtt_imagem(p_reserva_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_r    vtt_image_upload_reservations;
  v_path text;
begin
  select * into v_r from vtt_image_upload_reservations where id = p_reserva_id for update;
  if v_r is null then
    return jsonb_build_object('storage_path', null);
  end if;
  if v_r.user_id <> auth.uid() then
    raise exception 'Reserva de outra pessoa.' using errcode = 'insufficient_privilege';
  end if;
  if v_r.estado <> 'ativa' then
    return jsonb_build_object('storage_path', null);
  end if;

  update vtt_image_upload_reservations set estado = 'cancelada' where id = v_r.id;
  update vtt_campaign_storage_usage
     set bytes_reservados = greatest(0, bytes_reservados - v_r.bytes_reservados), updated_at = now()
   where campaign_id = v_r.campaign_id;

  update vtt_image_assets set estado = 'deleting', updated_at = now()
   where id = v_r.asset_id and estado = 'pending'
  returning storage_path into v_path;

  return jsonb_build_object('storage_path', v_path);
end;
$$;

revoke all on function cancelar_upload_vtt_imagem(uuid) from public, anon;
grant execute on function cancelar_upload_vtt_imagem(uuid) to authenticated;

-- Reservas vencidas: devolve a quota e marca o asset pendente para
-- remoção — inclusive o OBJETO FÍSICO que um `PUT` já concluído possa
-- ter deixado. Sem isto, bytes físicos pendentes passariam da quota
-- contabilizada.
create or replace function limpar_reservas_vencidas()
returns table (storage_path text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with vencidas as (
    update vtt_image_upload_reservations r
       set estado = 'cancelada'
     where r.estado = 'ativa' and r.expira_em <= now()
    returning r.asset_id, r.campaign_id, r.bytes_reservados
  ), devolucao as (
    update vtt_campaign_storage_usage u
       set bytes_reservados = greatest(0, u.bytes_reservados - agg.total), updated_at = now()
      from (select campaign_id, sum(bytes_reservados) as total from vencidas group by campaign_id) agg
     where u.campaign_id = agg.campaign_id
    returning u.campaign_id
  )
  update vtt_image_assets a
     set estado = 'deleting', updated_at = now()
   where a.id in (select asset_id from vencidas)
     and a.estado = 'pending'
     and (select count(*) from devolucao) >= 0
  returning a.storage_path;
end;
$$;

revoke all on function limpar_reservas_vencidas() from public, anon, authenticated;
-- Só o serviço server-only (service role) coleta: é ele que remove o
-- objeto no Storage logo depois, e é o único que pode.
grant execute on function limpar_reservas_vencidas() to service_role;

-- ── Biblioteca da campanha (narrador) ───────────────────────────────
-- Única leitura de asset que existe nesta migration. A projeção para
-- JOGADOR depende dos USOS (colocação de cena, retrato de token), que
-- ainda não existem — ela nasce junto deles, não antes.
create or replace function read_vtt_campaign_images(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_campaign_owner(p_campaign_id) then
    raise exception 'Sem acesso.' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'width_px', a.width_px, 'height_px', a.height_px,
      'bytes', a.bytes, 'created_at', a.created_at
    ) order by a.created_at desc)
    from vtt_image_assets a
    where a.campaign_id = p_campaign_id and a.estado = 'ready'
  ), '[]'::jsonb);
end;
$$;

revoke all on function read_vtt_campaign_images(uuid) from public, anon;
grant execute on function read_vtt_campaign_images(uuid) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────
-- Nenhuma policy de `select`: as três tabelas são invisíveis ao
-- PostgREST. Toda leitura é projeção `security definer`, toda escrita é
-- RPC. `storage.objects` NÃO recebe policy nova — dar leitura ali seria
-- dar o poder de assinar.
alter table vtt_image_assets              enable row level security;
alter table vtt_campaign_storage_usage    enable row level security;
alter table vtt_image_upload_reservations enable row level security;

revoke all on vtt_image_assets              from authenticated, anon;
revoke all on vtt_campaign_storage_usage    from authenticated, anon;
revoke all on vtt_image_upload_reservations from authenticated, anon;

-- FORA do Realtime de propósito: publicar `vtt_image_assets` entregaria
-- a EXISTÊNCIA de asset escondido a quem escuta o canal da campanha —
-- o mesmo vazamento que as policies acima evitam.

commit;
