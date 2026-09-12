-- =====================================================================
-- 0101 — Retrato de token com arquivo próprio
--
-- Fecha a lacuna que a 0073 declarou ao criar `retrato_url`: "sem
-- storage próprio nesta fase (o narrador cola uma URL já hospedada em
-- outro lugar)". Agora há storage próprio (0099), e o retrato pode vir
-- dele.
--
-- ── POR QUE UMA RPC NOVA, E NÃO UM CAMPO A MAIS EM `edit_vtt_token` ──
-- `edit_vtt_token` (0076) é NARRADOR-ONLY, e o gerenciador de token na
-- interface também é: no menu contextual, quem controla o token sem ser
-- narrador recebe rotação e nada mais. Acrescentar `retrato_image_id`
-- lá dentro não daria ao jogador o poder de trocar o próprio retrato —
-- só daria ao narrador mais um campo. Daí uma RPC ESTREITA, que muda
-- exatamente um atributo e usa a autorização que já existe para "este
-- token é seu": `can_move_vtt_token` (0065), a mesma de mover e girar.
--
-- ── UM RETRATO, UMA ORIGEM ──────────────────────────────────────────
-- `retrato_url` (endereço externo) e `retrato_image_id` (arquivo nosso)
-- coexistem como COLUNAS, mas nunca como valor: definir um LIMPA o
-- outro. Guardar os dois com precedência silenciosa faria a pessoa não
-- saber qual está valendo — e o dia em que o endereço externo saísse do
-- ar, o retrato "voltaria" sozinho para uma imagem antiga.
-- =====================================================================

begin;

alter table vtt_tokens
  add column if not exists retrato_image_id uuid references vtt_image_assets(id) on delete set null;

comment on column vtt_tokens.retrato_image_id is
  'Retrato vindo do nosso Storage (0099). Mutuamente exclusivo com retrato_url — definir um limpa o outro.';

-- FK COMPOSTA: sem ela, o banco aceitaria um token da campanha A
-- apontando um arquivo da campanha B. Mesma proteção que a 0100 deu à
-- colocação de cena.
alter table vtt_tokens drop constraint if exists vtt_tokens_retrato_image_campaign_fk;
alter table vtt_tokens
  add constraint vtt_tokens_retrato_image_campaign_fk
  foreign key (retrato_image_id, campaign_id) references vtt_image_assets(id, campaign_id);

create index if not exists vtt_tokens_retrato_image_idx
  on vtt_tokens (retrato_image_id) where retrato_image_id is not null;

-- ── RPC estreita ────────────────────────────────────────────────────
-- `p_image_id` nulo LIMPA o retrato de arquivo (é como se remove).
create or replace function set_vtt_token_portrait_image(
  p_token_id          uuid,
  p_image_id          uuid,
  p_expected_revision integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token vtt_tokens;
begin
  select * into v_token from vtt_tokens where id = p_token_id for update;
  if v_token is null then
    raise exception 'Token não encontrado.' using errcode = 'no_data_found';
  end if;

  -- Mesma autorização de mover/girar: narrador, ou quem controla o
  -- personagem vinculado.
  if not can_move_vtt_token(p_token_id) then
    raise exception 'Sem permissão sobre este token.' using errcode = 'insufficient_privilege';
  end if;
  if v_token.revision <> p_expected_revision then
    raise exception 'Revisão desatualizada — outra pessoa já alterou este token.' using errcode = 'check_violation';
  end if;

  if p_image_id is not null then
    -- Trava o asset junto: sem isto, o GC poderia decidir "nenhum uso"
    -- entre a checagem e o update, e remover o arquivo recém-ligado.
    if not exists (
      select 1 from vtt_image_assets a
      where a.id = p_image_id and a.campaign_id = v_token.campaign_id and a.estado = 'ready'
      for update
    ) then
      raise exception 'Imagem não encontrada nesta campanha.' using errcode = 'no_data_found';
    end if;
  end if;

  -- Altera SÓ o retrato. Definir o arquivo limpa o endereço externo.
  update vtt_tokens
     set retrato_image_id = p_image_id,
         retrato_url      = case when p_image_id is not null then null else retrato_url end,
         revision         = revision + 1,
         updated_at       = now()
   where id = p_token_id
  returning * into v_token;

  perform realtime.send(
    jsonb_build_object(
      'v', 1, 'campaignId', v_token.campaign_id::text, 'sceneId', v_token.scene_id::text,
      'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint
    ),
    'tokens_changed',
    'campaign:' || v_token.campaign_id::text || ':scene:' || v_token.scene_id::text || ':vtt:tokens-changed',
    true
  );

  return jsonb_build_object(
    'id', v_token.id, 'revision', v_token.revision,
    'retrato_image_id', v_token.retrato_image_id, 'retrato_url', v_token.retrato_url
  );
end;
$$;

revoke all on function set_vtt_token_portrait_image(uuid, uuid, integer) from public, anon;
grant execute on function set_vtt_token_portrait_image(uuid, uuid, integer) to authenticated;

-- ── Endereço externo, para o mesmo caminho de UI ────────────────────
-- A aba "Endereço" do editor de retrato precisa estar disponível a quem
-- controla o token, e `edit_vtt_token` não serve (narrador-only). O
-- espelho de `set_vtt_token_portrait_image`: definir o endereço LIMPA o
-- arquivo.
create or replace function set_vtt_token_portrait_url(
  p_token_id          uuid,
  p_url               text,
  p_expected_revision integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token vtt_tokens;
  v_url   text := nullif(btrim(coalesce(p_url, '')), '');
begin
  select * into v_token from vtt_tokens where id = p_token_id for update;
  if v_token is null then
    raise exception 'Token não encontrado.' using errcode = 'no_data_found';
  end if;
  if not can_move_vtt_token(p_token_id) then
    raise exception 'Sem permissão sobre este token.' using errcode = 'insufficient_privilege';
  end if;
  if v_token.revision <> p_expected_revision then
    raise exception 'Revisão desatualizada — outra pessoa já alterou este token.' using errcode = 'check_violation';
  end if;

  -- Mesma regra do cliente (`validarUrlImagem`), repetida aqui porque a
  -- RPC é alcançável sem passar pela interface. `data:` e `javascript:`
  -- nunca são "uma imagem hospedada em outro lugar".
  if v_url is not null then
    if length(v_url) > 2048 then
      raise exception 'Endereço muito longo.' using errcode = 'invalid_parameter_value';
    end if;
    if v_url !~* '^https?://' then
      raise exception 'Só endereços http:// ou https:// são aceitos.' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  update vtt_tokens
     set retrato_url      = v_url,
         retrato_image_id = case when v_url is not null then null else retrato_image_id end,
         revision         = revision + 1,
         updated_at       = now()
   where id = p_token_id
  returning * into v_token;

  perform realtime.send(
    jsonb_build_object(
      'v', 1, 'campaignId', v_token.campaign_id::text, 'sceneId', v_token.scene_id::text,
      'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint
    ),
    'tokens_changed',
    'campaign:' || v_token.campaign_id::text || ':scene:' || v_token.scene_id::text || ':vtt:tokens-changed',
    true
  );

  return jsonb_build_object(
    'id', v_token.id, 'revision', v_token.revision,
    'retrato_image_id', v_token.retrato_image_id, 'retrato_url', v_token.retrato_url
  );
end;
$$;

revoke all on function set_vtt_token_portrait_url(uuid, text, integer) from public, anon;
grant execute on function set_vtt_token_portrait_url(uuid, text, integer) to authenticated;

-- ── Finalização ATÔMICA do upload de retrato ────────────────────────
-- Promove o arquivo e liga ao token na MESMA transação, pelo mesmo
-- motivo da 0100: um `ready` sem referência viveria só até o GC passar.
create or replace function finalizar_upload_e_definir_retrato(
  p_reserva_id        uuid,
  p_bytes_reais       bigint,
  p_width_px          integer,
  p_height_px         integer,
  p_token_id          uuid,
  p_expected_revision integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res      jsonb;
  v_asset_id uuid;
  v_reserva  vtt_image_upload_reservations;
  v_token    vtt_tokens;
begin
  select * into v_reserva from vtt_image_upload_reservations where id = p_reserva_id;
  if v_reserva is null then
    raise exception 'Reserva não encontrada.' using errcode = 'no_data_found';
  end if;
  -- O token do finalize precisa ser o MESMO que autorizou a reserva:
  -- senão a permissão conferida sobre um token valeria para outro.
  if v_reserva.token_id is distinct from p_token_id then
    raise exception 'Este upload foi autorizado para outro token.' using errcode = 'insufficient_privilege';
  end if;

  v_res := vtt_finalizar_reserva(p_reserva_id, p_bytes_reais, p_width_px, p_height_px, 'retrato');
  v_asset_id := (v_res ->> 'asset_id')::uuid;

  -- Idempotente: se a reserva já foi consumida E o token já aponta para
  -- este arquivo, devolve o estado atual em vez de gastar uma revisão.
  if (v_res ->> 'ja_consumida')::boolean then
    select * into v_token from vtt_tokens where id = p_token_id;
    if v_token.retrato_image_id = v_asset_id then
      return jsonb_build_object(
        'id', v_token.id, 'revision', v_token.revision,
        'retrato_image_id', v_token.retrato_image_id, 'retrato_url', v_token.retrato_url
      );
    end if;
  end if;

  return set_vtt_token_portrait_image(p_token_id, v_asset_id, p_expected_revision);
end;
$$;

revoke all on function finalizar_upload_e_definir_retrato(uuid, bigint, integer, integer, uuid, integer) from public, anon;
grant execute on function finalizar_upload_e_definir_retrato(uuid, bigint, integer, integer, uuid, integer) to authenticated;

-- ── Coleta: quem já não tem uso nenhum ──────────────────────────────
-- Aqui, e não na 0099, porque só agora as DUAS formas de uso existem
-- (colocação de cena e retrato de token). Sem contador de referências
-- de propósito: `not exists` sobre os usos reais não sofre drift nem
-- perde a corrida "última referência removida ↔ nova criada", que um
-- `refs` só resolveria com trigger e trava.
--
-- Marca e devolve o caminho; a remoção no Storage é do serviço. Se ela
-- falhar, a linha continua `deleting` e a próxima passada tenta de
-- novo — idempotente, em vez de duas exclusões torcendo para as duas
-- passarem.
create or replace function vtt_coletar_imagens_sem_uso(p_carencia interval default interval '1 hour')
returns table (storage_path text)
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
  returning a.storage_path;
$$;

revoke all on function vtt_coletar_imagens_sem_uso(interval) from public, anon, authenticated;
grant execute on function vtt_coletar_imagens_sem_uso(interval) to service_role;

-- Caminhos já marcados que a remoção anterior não conseguiu apagar.
create or replace function vtt_imagens_pendentes_de_remocao()
returns table (storage_path text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select a.storage_path from vtt_image_assets a where a.estado = 'deleting' $$;

revoke all on function vtt_imagens_pendentes_de_remocao() from public, anon, authenticated;
grant execute on function vtt_imagens_pendentes_de_remocao() to service_role;

-- Só depois que o objeto sumiu do bucket é que a linha vai embora.
create or replace function vtt_confirmar_remocao_imagem(p_storage_path text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$ delete from vtt_image_assets where storage_path = p_storage_path and estado = 'deleting' $$;

revoke all on function vtt_confirmar_remocao_imagem(text) from public, anon, authenticated;
grant execute on function vtt_confirmar_remocao_imagem(text) to service_role;

commit;
