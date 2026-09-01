-- =====================================================================
-- 0088 — Trilha de turnos PERSISTIDA (ferramenta "Rodadas")
--
-- Até aqui a trilha de turnos era estado 100% local do navegador
-- (`useState` em `VttClient.tsx`): cada participante via uma rodada
-- diferente, e um F5 zerava o combate. A ferramenta "Rodadas" exige o
-- contrário — iniciar, administrar e encerrar valem PRA MESA INTEIRA,
-- e uma rodada aberta precisa sobreviver ao reload.
--
-- FORMA DO DADO: uma linha por CENA, com o `EstadoTrilha` inteiro num
-- `jsonb`. Deliberadamente não é uma tabela de participantes
-- normalizada. As regras de Ruptura (`_turnos/modelo.ts`) são
-- transições que leem o estado INTEIRO — alternância entre lados,
-- fragmentação de PA, quem abre a próxima janela. Espalhar isso em
-- linhas obrigaria a remontar o agregado a cada leitura e abriria a
-- porta pra estados intermediários incoerentes chegando por realtime
-- (metade dos participantes na rodada nova, metade na velha). Uma
-- linha só é atômica por construção, e o `revision` dá concorrência
-- otimista igual à de token e área.
--
-- O BANCO NÃO CONHECE AS REGRAS DE COMBATE. Nenhuma função aqui sabe
-- o que é janela, PA ou alternância — isso é de `modelo.ts`, e
-- duplicar aquilo em plpgsql criaria uma segunda verdade que
-- divergiria na primeira mudança de regra. O que o servidor garante é
-- AUTORIZAÇÃO e INTEGRIDADE ESTRUTURAL:
--
--   · só o narrador INICIA e ENCERRA;
--   · só o narrador muda o ELENCO (conjunto de ids), o MODO e o lado
--     que emboscou — as decisões de mesa;
--   · qualquer participante AVANÇA a trilha (declarar janela, assumir
--     turno, concluir, passar), que é o equivalente digital de mover
--     a própria peça na mesa;
--   · nenhuma escrita sem revisão bater.
-- =====================================================================

create table if not exists vtt_turn_tracks (
  -- PK é o `scene_id`: uma cena tem no máximo UMA trilha aberta. Não
  -- existe "duas rodadas simultâneas na mesma cena" em Ruptura, e a PK
  -- é o jeito de isso ser impossível em vez de ser só uma convenção.
  scene_id     uuid primary key references vtt_scenes(id) on delete cascade,
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  -- `EstadoTrilha` serializado (ver `_turnos/serializacao.ts`, que é o
  -- único lugar que valida a forma na leitura — aqui só o mínimo
  -- estrutural, pra nenhum cliente adulterado gravar lixo).
  estado       jsonb not null,
  revision     integer not null default 1,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null,

  constraint vtt_turn_tracks_estado_objeto
    check (jsonb_typeof(estado) = 'object'),
  constraint vtt_turn_tracks_participantes
    check (
      jsonb_typeof(estado -> 'participantes') = 'array'
      and jsonb_array_length(estado -> 'participantes') between 1 and 64
    )
);

create index if not exists vtt_turn_tracks_campaign_idx on vtt_turn_tracks (campaign_id);

-- Mesma trava de coerência da 0066: impede a linha apontar pra uma
-- cena de OUTRA campanha, o que furaria toda a autorização (avaliada
-- sempre por `campaign_id`).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vtt_turn_tracks_scene_campaign_fk'
  ) then
    alter table vtt_turn_tracks
      add constraint vtt_turn_tracks_scene_campaign_fk
      foreign key (scene_id, campaign_id) references vtt_scenes (id, campaign_id) on delete cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- RLS — leitura pra todo participante, escrita SÓ pelas RPCs abaixo.
--
-- Nenhum `grant insert/update/delete`: a autorização de "quem pode
-- mudar o quê" é fina demais (elenco/modo são do narrador, avanço é de
-- todos) pra caber numa policy de tabela, e uma policy de UPDATE
-- genérica deixaria um cliente adulterado reescrever o elenco inteiro.
-- ---------------------------------------------------------------------
alter table vtt_turn_tracks enable row level security;

revoke all on vtt_turn_tracks from anon, authenticated;
grant select on vtt_turn_tracks to authenticated;

drop policy if exists vtt_turn_tracks_select on vtt_turn_tracks;
create policy vtt_turn_tracks_select on vtt_turn_tracks
  for select to authenticated
  using (is_campaign_member(campaign_id));

-- ---------------------------------------------------------------------
-- Ids do elenco, ORDENADOS — a comparação que define "mudou o elenco".
--
-- Ordenado de propósito: reordenar a lista de participantes é
-- consequência normal da interface (a ordem do trilho segue a
-- situação de cada um), e não pode ser confundida com adicionar ou
-- remover alguém.
-- ---------------------------------------------------------------------
create or replace function vtt_trilha_ids(p_estado jsonb)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    array(
      select p ->> 'id'
      from jsonb_array_elements(coalesce(p_estado -> 'participantes', '[]'::jsonb)) as p
      order by p ->> 'id'
    ),
    '{}'::text[]
  );
$$;

revoke all on function vtt_trilha_ids(jsonb) from public;
grant execute on function vtt_trilha_ids(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Iniciar — só narrador. Idempotente por cena: reiniciar substitui a
-- trilha anterior em vez de estourar por PK duplicada (o painel só
-- oferece "Iniciar" quando não há trilha, mas duas abas do narrador
-- clicando junto não podem virar erro de banco).
-- ---------------------------------------------------------------------
create or replace function iniciar_vtt_trilha(p_scene_id uuid, p_estado jsonb)
returns vtt_turn_tracks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign uuid;
  v_row vtt_turn_tracks;
begin
  select campaign_id into v_campaign from vtt_scenes where id = p_scene_id;
  if v_campaign is null then
    raise exception 'Cena inexistente.';
  end if;
  if not is_campaign_owner(v_campaign) then
    raise exception 'Só o narrador pode iniciar as rodadas.';
  end if;
  if coalesce(jsonb_array_length(p_estado -> 'participantes'), 0) = 0 then
    raise exception 'Não dá pra iniciar rodadas sem participantes.';
  end if;

  insert into vtt_turn_tracks as t (scene_id, campaign_id, estado, revision, updated_by)
  values (p_scene_id, v_campaign, p_estado, 1, (select auth.uid()))
  on conflict (scene_id) do update
    set estado = excluded.estado,
        revision = t.revision + 1,
        updated_at = now(),
        updated_by = (select auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function iniciar_vtt_trilha(uuid, jsonb) from public;
grant execute on function iniciar_vtt_trilha(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Avançar — qualquer participante, com revisão otimista.
--
-- O recorte de papel está nas TRÊS comparações abaixo: elenco, modo e
-- lado que emboscou são decisões de mesa (narrador); todo o resto do
-- estado — declaração de janela, quem assumiu o turno, PA gasto,
-- rodada — é jogar, e jogar é de todos.
-- ---------------------------------------------------------------------
create or replace function atualizar_vtt_trilha(
  p_scene_id uuid,
  p_estado jsonb,
  p_expected_revision integer
)
returns vtt_turn_tracks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_atual vtt_turn_tracks;
  v_row vtt_turn_tracks;
begin
  select * into v_atual from vtt_turn_tracks where scene_id = p_scene_id;
  if v_atual.scene_id is null then
    raise exception 'Não há rodadas ativas nesta cena.';
  end if;
  if not is_campaign_member(v_atual.campaign_id) then
    raise exception 'Sem acesso a esta campanha.';
  end if;
  if v_atual.revision <> p_expected_revision then
    raise exception 'A trilha mudou em outra sessão (revisão % ≠ %). Releia antes de escrever.',
      v_atual.revision, p_expected_revision;
  end if;

  if not is_campaign_owner(v_atual.campaign_id) then
    if vtt_trilha_ids(p_estado) is distinct from vtt_trilha_ids(v_atual.estado) then
      raise exception 'Só o narrador pode alterar os participantes das rodadas.';
    end if;
    if (p_estado ->> 'modo') is distinct from (v_atual.estado ->> 'modo')
       or (p_estado ->> 'ladoSurpresa') is distinct from (v_atual.estado ->> 'ladoSurpresa') then
      raise exception 'Só o narrador pode mudar o modo das rodadas.';
    end if;
  end if;

  update vtt_turn_tracks
     set estado = p_estado,
         revision = revision + 1,
         updated_at = now(),
         updated_by = (select auth.uid())
   where scene_id = p_scene_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function atualizar_vtt_trilha(uuid, jsonb, integer) from public;
grant execute on function atualizar_vtt_trilha(uuid, jsonb, integer) to authenticated;

-- ---------------------------------------------------------------------
-- Encerrar — só narrador. Apaga a linha da trilha e NADA MAIS: os
-- tokens da cena não são tocados. Encerrar rodadas é sair do combate,
-- não limpar a mesa.
-- ---------------------------------------------------------------------
create or replace function encerrar_vtt_trilha(p_scene_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign uuid;
begin
  select campaign_id into v_campaign from vtt_turn_tracks where scene_id = p_scene_id;
  if v_campaign is null then
    return false; -- já encerrada por outra sessão: sucesso silencioso, nunca erro
  end if;
  if not is_campaign_owner(v_campaign) then
    raise exception 'Só o narrador pode encerrar as rodadas.';
  end if;
  delete from vtt_turn_tracks where scene_id = p_scene_id;
  return true;
end;
$$;

revoke all on function encerrar_vtt_trilha(uuid) from public;
grant execute on function encerrar_vtt_trilha(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Realtime
--
-- `replica identity full` pelo mesmo motivo das outras tabelas de
-- cena: o filtro dos canais é `campaign_id=eq.<id>` e, num DELETE
-- (encerrar rodadas), a identidade padrão só traria a PK — o
-- encerramento nunca casaria o filtro e as outras sessões ficariam com
-- os trilhos na tela até recarregar.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vtt_turn_tracks'
  ) then
    alter publication supabase_realtime add table public.vtt_turn_tracks;
  end if;
end $$;

alter table vtt_turn_tracks replica identity full;

comment on table vtt_turn_tracks is
  'Trilha de turnos de Ruptura, uma linha por cena. O `estado` é o EstadoTrilha inteiro (_turnos/modelo.ts) — o banco não conhece as regras de combate, só autoriza: narrador inicia/encerra/edita elenco e modo, qualquer participante avança, tudo com revisão otimista.';
