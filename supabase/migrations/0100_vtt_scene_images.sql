-- =====================================================================
-- 0100 — Colocação de imagem na cena: fundo e tiles
--
-- Continua a 0099, que trata do ARQUIVO. Aqui mora o USO: onde a imagem
-- fica, de que tamanho, em que ordem. A separação é a mesma que a 0085
-- fez entre `vtt_objects` (entidade) e `vtt_object_cells` (ocupação), e
-- é o que permite o mesmo arquivo aparecer N vezes com transforms
-- diferentes sem duplicar bytes.
--
-- ── IMAGEM NÃO É PAREDE ─────────────────────────────────────────────
-- Nada aqui entra em `vtt_celula_bloqueada`. Uma imagem é decoração;
-- quem quiser que a parede desenhada BLOQUEIE cria um objeto tático por
-- cima. É a mesma disciplina da 0085: só produz fato mecânico o que foi
-- declarado como fato mecânico.
--
-- ── GEOMETRIA: METRO EUCLIDIANO, NÃO "CÉLULA" ───────────────────────
-- `hexParaPixel` (`_mapa/hex.ts`) é pointy-top:
--     x = tam·√3·(q + r/2)        y = tam·(3/2)·r
-- O passo horizontal (√3·tam) e o avanço de fileira (1,5·tam) NÃO são
-- iguais. Então "largura em células" seria uma unidade diferente em
-- cada eixo, e derivar altura a partir da proporção em pixels
-- distorceria a imagem. Por isso as dimensões são METROS, com uma
-- escala uniforme nos dois eixos — `PX_POR_METRO = √3 · TAM`, a largura
-- do hexágono entre faces. O cliente é dono dessa constante
-- (`_dominio/imagemCena.ts`); o banco só guarda metros.
--
-- `altura_m` é NULA por padrão: a altura vem da proporção real do
-- arquivo (que a 0099 mediu no servidor). Preencher a coluna é um ato
-- deliberado de distorcer — nunca o caminho comum.
--
-- Âncora é o CENTRO, em coordenadas axiais CONTÍNUAS (numeric): um
-- fundo raramente cai exatamente sobre o centro de um hexágono, e
-- arredondar para célula tiraria o encaixe fino que o ajuste existe
-- para dar. Rotação em graus, pivô no mesmo centro.
--
-- OVERHANG é permitido de propósito — um fundo precisa sangrar além da
-- grade — com teto de 4× a dimensão da cena, que separa "sangrar" de
-- "bomba de renderização".
-- =====================================================================

begin;

create table if not exists vtt_scene_images (
  id            uuid primary key default gen_random_uuid(),
  scene_id      uuid not null references vtt_scenes(id) on delete cascade,
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  image_id      uuid not null references vtt_image_assets(id) on delete restrict,
  papel         text not null check (papel in ('fundo', 'tile')),
  centro_q      numeric not null,
  centro_r      numeric not null,
  largura_m     numeric not null check (largura_m > 0),
  altura_m      numeric null check (altura_m is null or altura_m > 0),
  rotacao_graus numeric not null default 0 check (rotacao_graus >= 0 and rotacao_graus < 360),
  opacidade     numeric not null default 1 check (opacidade > 0 and opacidade <= 1),
  camada        text not null default 'abaixo_grade' check (camada in ('abaixo_grade', 'acima_grade')),
  z             integer not null default 0,
  visivel       boolean not null default true,
  travado       boolean not null default false,
  revision      integer not null default 1,
  -- Chave de IDEMPOTÊNCIA do finalize: repetir a mesma finalização
  -- devolve ESTA colocação em vez de criar uma segunda. Nula nas
  -- colocações criadas a partir de asset já existente (reuso da
  -- biblioteca), que não passam por reserva.
  reserva_id    uuid unique,
  criador_id    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Cena e campanha precisam concordar (mesma proteção da 0085)…
  constraint vtt_scene_images_scene_campaign_fk
    foreign key (scene_id, campaign_id) references vtt_scenes(id, campaign_id) on delete cascade,
  -- …e a IMAGEM também. Sem esta, uma colocação da campanha A poderia
  -- apontar um arquivo da campanha B, e o bucket privado por campanha
  -- viraria letra morta.
  constraint vtt_scene_images_image_campaign_fk
    foreign key (image_id, campaign_id) references vtt_image_assets(id, campaign_id)
);

-- Uma cena tem no máximo UM fundo.
create unique index if not exists vtt_scene_images_fundo_unico_idx
  on vtt_scene_images (scene_id) where papel = 'fundo';

create index if not exists vtt_scene_images_cena_idx on vtt_scene_images (scene_id);
create index if not exists vtt_scene_images_asset_idx on vtt_scene_images (image_id);

create or replace function vtt_cena_colocacoes_max() returns integer
  language sql immutable as $$ select 60 $$;

-- ── Camada da cena ──────────────────────────────────────────────────
-- A visibilidade de camada é ESTADO PERSISTIDO DA CENA (0093), não
-- preferência local — e precisa valer também na hora de assinar uma
-- URL: de nada adianta esconder a camada se o arquivo continua
-- assinável. Assume o formato de `EstadoCamadas`
-- (`_shell/PainelCamadas.tsx`): objeto `{ <camadaId>: { visivel,
-- bloqueada } }`. ⚠ CONFERIR contra 0093 — esta é a única suposição
-- desta migration sobre uma migration que não estava disponível quando
-- ela foi escrita.
create or replace function vtt_camada_cena_visivel(p_scene_id uuid, p_camada text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select (s.camadas -> p_camada ->> 'visivel')::boolean from vtt_scenes s where s.id = p_scene_id),
    true  -- camada não configurada = visível, o padrão de `CAMADAS_PADRAO`
  );
$$;

-- ── Quem pode receber uma URL assinada deste arquivo ────────────────
-- Chamada pelo serviço de assinatura, id por id. Narrador vê tudo da
-- própria campanha; participante só vê o arquivo que ALGUM uso visível
-- expõe a ele.
--
-- Limitação declarada: uma URL JÁ EMITIDA continua válida até expirar,
-- mesmo que a colocação seja escondida no instante seguinte. Isso é
-- consistência eventual de privacidade, e é por isso que o TTL de
-- assinatura é curto (5 min) em vez de horas.
create or replace function vtt_asset_assinavel_para(p_asset_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from vtt_image_assets a
    where a.id = p_asset_id and a.estado = 'ready'
      and (
        is_campaign_owner(a.campaign_id, p_user_id)
        or (
          is_campaign_member(a.campaign_id, p_user_id)
          and exists (
            select 1 from vtt_scene_images si
            where si.image_id = a.id
              and si.visivel
              and vtt_camada_cena_visivel(
                    si.scene_id,
                    case when si.papel = 'fundo' then 'imagemFundo' else 'tiles' end)
          )
        )
      )
  );
$$;

revoke all on function vtt_asset_assinavel_para(uuid, uuid) from public, anon, authenticated;
-- Quem assina é o serviço server-only, e ele passa o usuário
-- explicitamente (não há `auth.uid()` numa conexão service role).
grant execute on function vtt_asset_assinavel_para(uuid, uuid) to service_role;

-- ── Leitura da cena ─────────────────────────────────────────────────
create or replace function read_vtt_scene_images(p_scene_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_scene vtt_scenes;
begin
  select * into v_scene from vtt_scenes where id = p_scene_id;
  if v_scene is null or not is_campaign_member(v_scene.campaign_id) then
    raise exception 'Cena não encontrada ou sem acesso.' using errcode = 'insufficient_privilege';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', si.id, 'scene_id', si.scene_id, 'image_id', si.image_id, 'papel', si.papel,
      'centro_q', si.centro_q, 'centro_r', si.centro_r,
      'largura_m', si.largura_m, 'altura_m', si.altura_m,
      'rotacao_graus', si.rotacao_graus, 'opacidade', si.opacidade,
      'camada', si.camada, 'z', si.z, 'visivel', si.visivel, 'travado', si.travado,
      'revision', si.revision,
      'width_px', a.width_px, 'height_px', a.height_px
    ) order by si.papel desc, si.z, si.created_at)
    from vtt_scene_images si
    join vtt_image_assets a on a.id = si.image_id
    where si.scene_id = p_scene_id
      and (si.visivel or is_campaign_owner(si.campaign_id))
  ), '[]'::jsonb);
end;
$$;

revoke all on function read_vtt_scene_images(uuid) from public, anon;
grant execute on function read_vtt_scene_images(uuid) to authenticated;

-- ── Projeção de UMA colocação (mesmo formato da leitura) ────────────
create or replace function vtt_scene_image_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', si.id, 'scene_id', si.scene_id, 'image_id', si.image_id, 'papel', si.papel,
    'centro_q', si.centro_q, 'centro_r', si.centro_r,
    'largura_m', si.largura_m, 'altura_m', si.altura_m,
    'rotacao_graus', si.rotacao_graus, 'opacidade', si.opacidade,
    'camada', si.camada, 'z', si.z, 'visivel', si.visivel, 'travado', si.travado,
    'revision', si.revision, 'width_px', a.width_px, 'height_px', a.height_px
  )
  from vtt_scene_images si join vtt_image_assets a on a.id = si.image_id
  where si.id = p_id;
$$;

-- ── Helper de validação geométrica ──────────────────────────────────
create or replace function vtt_validar_geometria_imagem(
  p_scene_id uuid, p_largura_m numeric, p_altura_m numeric
) returns void
language plpgsql
as $$
declare
  v_scene vtt_scenes;
  v_teto  numeric;
begin
  select * into v_scene from vtt_scenes where id = p_scene_id;
  if v_scene is null then
    raise exception 'Cena não encontrada.' using errcode = 'no_data_found';
  end if;
  if p_largura_m <= 0 or (p_altura_m is not null and p_altura_m <= 0) then
    raise exception 'Dimensão inválida.' using errcode = 'invalid_parameter_value';
  end if;
  -- 4× a maior dimensão da cena (1 célula = 1 metro): sangrar, sim;
  -- cobrir dezesseis mapas, não.
  v_teto := 4 * greatest(v_scene.largura, v_scene.altura);
  if p_largura_m > v_teto or coalesce(p_altura_m, 0) > v_teto then
    raise exception 'Imagem grande demais para esta cena.' using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

create or replace function vtt_exigir_narrador_da_cena(p_scene_id uuid)
returns vtt_scenes
language plpgsql
as $$
declare v_scene vtt_scenes;
begin
  select * into v_scene from vtt_scenes where id = p_scene_id;
  if v_scene is null then
    raise exception 'Cena não encontrada.' using errcode = 'no_data_found';
  end if;
  if not is_campaign_owner(v_scene.campaign_id) then
    raise exception 'Só o narrador altera imagens da cena.' using errcode = 'insufficient_privilege';
  end if;
  return v_scene;
end;
$$;

-- ── Criação a partir de asset JÁ pronto (biblioteca) ────────────────
create or replace function criar_vtt_scene_image(
  p_scene_id      uuid,
  p_image_id      uuid,
  p_papel         text,
  p_centro_q      numeric,
  p_centro_r      numeric,
  p_largura_m     numeric,
  p_altura_m      numeric default null,
  p_rotacao_graus numeric default 0,
  p_opacidade     numeric default 1,
  p_camada        text default 'abaixo_grade',
  p_reserva_id    uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scene vtt_scenes;
  v_id    uuid;
  v_z     integer;
begin
  v_scene := vtt_exigir_narrador_da_cena(p_scene_id);
  perform vtt_validar_geometria_imagem(p_scene_id, p_largura_m, p_altura_m);

  if p_papel not in ('fundo', 'tile') then
    raise exception 'Papel inválido.' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (
    select 1 from vtt_image_assets a
    where a.id = p_image_id and a.campaign_id = v_scene.campaign_id and a.estado = 'ready'
  ) then
    raise exception 'Imagem não encontrada nesta campanha.' using errcode = 'no_data_found';
  end if;
  if (select count(*) from vtt_scene_images where scene_id = p_scene_id) >= vtt_cena_colocacoes_max() then
    raise exception 'Limite de imagens nesta cena atingido.' using errcode = 'too_many_rows';
  end if;

  select coalesce(max(z), 0) + 1 into v_z from vtt_scene_images where scene_id = p_scene_id;

  insert into vtt_scene_images (
    scene_id, campaign_id, image_id, papel, centro_q, centro_r,
    largura_m, altura_m, rotacao_graus, opacidade, camada, z, reserva_id, criador_id
  ) values (
    p_scene_id, v_scene.campaign_id, p_image_id, p_papel, p_centro_q, p_centro_r,
    p_largura_m, p_altura_m, coalesce(p_rotacao_graus, 0), coalesce(p_opacidade, 1),
    coalesce(p_camada, 'abaixo_grade'), case when p_papel = 'fundo' then 0 else v_z end,
    p_reserva_id, auth.uid()
  ) returning id into v_id;

  return vtt_scene_image_json(v_id);
exception
  when unique_violation then
    raise exception 'Esta cena já tem um fundo. Troque ou remova o atual.' using errcode = 'check_violation';
end;
$$;

revoke all on function criar_vtt_scene_image(uuid, uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid) from public, anon;
grant execute on function criar_vtt_scene_image(uuid, uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid) to authenticated;

-- ── Finalização ATÔMICA: promove o arquivo e cria o uso juntos ──────
-- É a razão de `vtt_finalizar_reserva` (0099) não ser pública: entre
-- promover e colocar existiria um asset `ready` sem nenhuma referência,
-- que o GC recolheria — apagando o arquivo recém-enviado.
create or replace function finalizar_upload_e_criar_imagem_cena(
  p_reserva_id    uuid,
  p_bytes_reais   bigint,
  p_width_px      integer,
  p_height_px     integer,
  p_scene_id      uuid,
  p_papel         text,
  p_centro_q      numeric,
  p_centro_r      numeric,
  p_largura_m     numeric,
  p_altura_m      numeric default null,
  p_rotacao_graus numeric default 0,
  p_opacidade     numeric default 1,
  p_camada        text default 'abaixo_grade'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res      jsonb;
  v_asset_id uuid;
  v_existente uuid;
begin
  if p_papel not in ('fundo', 'tile') then
    raise exception 'Papel inválido.' using errcode = 'invalid_parameter_value';
  end if;

  v_res := vtt_finalizar_reserva(p_reserva_id, p_bytes_reais, p_width_px, p_height_px, p_papel);
  v_asset_id := (v_res ->> 'asset_id')::uuid;

  -- Idempotente: a mesma finalização repetida devolve a colocação que
  -- ela já criou, nunca uma segunda.
  if (v_res ->> 'ja_consumida')::boolean then
    select id into v_existente from vtt_scene_images where reserva_id = p_reserva_id;
    if v_existente is not null then
      return vtt_scene_image_json(v_existente);
    end if;
  end if;

  return criar_vtt_scene_image(
    p_scene_id, v_asset_id, p_papel, p_centro_q, p_centro_r,
    p_largura_m, p_altura_m, p_rotacao_graus, p_opacidade, p_camada, p_reserva_id
  );
end;
$$;

revoke all on function finalizar_upload_e_criar_imagem_cena(uuid, bigint, integer, integer, uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function finalizar_upload_e_criar_imagem_cena(uuid, bigint, integer, integer, uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, text) to authenticated;

-- ── Atualizar / mover / excluir ─────────────────────────────────────
-- `revision` otimista com `check_violation`, a convenção das RPCs de
-- token. `travado` bloqueia mover e excluir, mas NÃO atualizar — é por
-- lá que se destrava (cinto de segurança, não autorização), exatamente
-- como a 0086 decidiu para objeto.

create or replace function atualizar_vtt_scene_image(
  p_id                uuid,
  p_expected_revision integer,
  p_largura_m         numeric default null,
  p_altura_m          numeric default null,
  p_rotacao_graus     numeric default null,
  p_opacidade         numeric default null,
  p_camada            text default null,
  p_z                 integer default null,
  p_visivel           boolean default null,
  p_travado           boolean default null,
  p_limpar_altura     boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_si vtt_scene_images;
begin
  select * into v_si from vtt_scene_images where id = p_id for update;
  if v_si is null then
    raise exception 'Imagem não encontrada.' using errcode = 'no_data_found';
  end if;
  perform vtt_exigir_narrador_da_cena(v_si.scene_id);
  if v_si.revision <> p_expected_revision then
    raise exception 'Revisão desatualizada — outra pessoa já alterou esta imagem.' using errcode = 'check_violation';
  end if;

  perform vtt_validar_geometria_imagem(
    v_si.scene_id,
    coalesce(p_largura_m, v_si.largura_m),
    case when p_limpar_altura then null else coalesce(p_altura_m, v_si.altura_m) end
  );

  update vtt_scene_images set
    largura_m     = coalesce(p_largura_m, largura_m),
    -- `p_limpar_altura` é o caminho de VOLTA à proporção do arquivo:
    -- sem ele, `null` seria indistinguível de "não mexer".
    altura_m      = case when p_limpar_altura then null else coalesce(p_altura_m, altura_m) end,
    rotacao_graus = coalesce(p_rotacao_graus, rotacao_graus),
    opacidade     = coalesce(p_opacidade, opacidade),
    camada        = coalesce(p_camada, camada),
    z             = coalesce(p_z, z),
    visivel       = coalesce(p_visivel, visivel),
    travado       = coalesce(p_travado, travado),
    revision      = revision + 1,
    updated_at    = now()
  where id = p_id;

  return vtt_scene_image_json(p_id);
end;
$$;

revoke all on function atualizar_vtt_scene_image(uuid, integer, numeric, numeric, numeric, numeric, text, integer, boolean, boolean, boolean) from public, anon;
grant execute on function atualizar_vtt_scene_image(uuid, integer, numeric, numeric, numeric, numeric, text, integer, boolean, boolean, boolean) to authenticated;

create or replace function mover_vtt_scene_image(
  p_id uuid, p_centro_q numeric, p_centro_r numeric, p_expected_revision integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_si vtt_scene_images;
begin
  select * into v_si from vtt_scene_images where id = p_id for update;
  if v_si is null then
    raise exception 'Imagem não encontrada.' using errcode = 'no_data_found';
  end if;
  perform vtt_exigir_narrador_da_cena(v_si.scene_id);
  if v_si.travado then
    raise exception 'Imagem travada.' using errcode = 'insufficient_privilege';
  end if;
  if v_si.revision <> p_expected_revision then
    raise exception 'Revisão desatualizada — outra pessoa já alterou esta imagem.' using errcode = 'check_violation';
  end if;

  update vtt_scene_images
     set centro_q = p_centro_q, centro_r = p_centro_r, revision = revision + 1, updated_at = now()
   where id = p_id;

  return vtt_scene_image_json(p_id);
end;
$$;

revoke all on function mover_vtt_scene_image(uuid, numeric, numeric, integer) from public, anon;
grant execute on function mover_vtt_scene_image(uuid, numeric, numeric, integer) to authenticated;

create or replace function excluir_vtt_scene_image(p_id uuid, p_expected_revision integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_si vtt_scene_images;
begin
  select * into v_si from vtt_scene_images where id = p_id for update;
  if v_si is null then
    return;  -- idempotente
  end if;
  perform vtt_exigir_narrador_da_cena(v_si.scene_id);
  if v_si.travado then
    raise exception 'Imagem travada.' using errcode = 'insufficient_privilege';
  end if;
  if v_si.revision <> p_expected_revision then
    raise exception 'Revisão desatualizada — outra pessoa já alterou esta imagem.' using errcode = 'check_violation';
  end if;
  -- O ARQUIVO não é apagado aqui: outro uso pode apontar para ele. Quem
  -- decide é o GC, por `not exists` sobre os usos reais.
  delete from vtt_scene_images where id = p_id;
end;
$$;

revoke all on function excluir_vtt_scene_image(uuid, integer) from public, anon;
grant execute on function excluir_vtt_scene_image(uuid, integer) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────
-- Leitura por RPC (a projeção já filtra invisível); escrita só pelas
-- funções acima. Mesma disciplina de `vtt_objects` depois da 0085/0086.
alter table vtt_scene_images enable row level security;
revoke all on vtt_scene_images from authenticated, anon;

-- ── Realtime ────────────────────────────────────────────────────────
-- Só a COLOCAÇÃO entra no canal — `vtt_image_assets` continua fora (a
-- 0099 explica: publicá-la entregaria a existência de arquivo
-- escondido). O cliente trata o evento como SINAL SEM PAYLOAD e relê,
-- como `onObjetosInvalidados`.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vtt_scene_images'
  ) then
    execute 'alter publication supabase_realtime add table public.vtt_scene_images';
  end if;
end $$;

alter table vtt_scene_images replica identity full;

commit;
