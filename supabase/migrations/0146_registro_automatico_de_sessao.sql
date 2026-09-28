-- 0146 — Registro automático de sessão (CONT-04).
--
-- Ao iniciar uma sessão online nasce UMA entrada narrativa do tipo
-- `sessao`, em rascunho, vinculada à sessão canônica. Os participantes
-- são acumulados durante a sessão, batimento a batimento.
--
-- ── Por que acumular, e não fotografar no fim ────────────────────────
--
-- `campaign_session_heartbeats` guarda UMA linha por pessoa, sobrescrita
-- a cada batimento: depois que a sessão acaba, quem passou por ela não
-- está em lugar nenhum. Uma foto do fim registraria só quem ficou até o
-- fim — que é justamente o que o critério de aceite proíbe.
--
-- ── Quem entra ───────────────────────────────────────────────────────
--
-- Quem esteve conectado em QUALQUER momento, com primeiro e último
-- visto guardados, para o narrador julgar depois quem só passou — em
-- vez de um tempo mínimo arbitrário decidir por ele.
--
-- Quem está com "Aparecer offline" NÃO entra. É a consequência direta
-- de PRES-01: se a pessoa se escondeu de todos, o registro não pode
-- contá-la depois — senão esconder-se ao vivo apenas adiaria a
-- revelação até o fim da sessão, e ninguém esperaria por isso.
--
-- O NARRADOR entra sempre, mesmo invisível, porque ele não entra como
-- presença e sim como autor: uma sessão sem narrador não aconteceu. O
-- registro nasce em rascunho, só dele; se mais tarde ele revelar à mesa
-- estando invisível, os jogadores saberão que ele estava lá — mas ele
-- controla as duas pontas, a invisibilidade e a revelação, então é
-- escolha dele e não vazamento imposto.
begin;

-- Uma entrada narrativa por sessão, garantido pelo índice e não por
-- disciplina de quem chama.
create unique index campaign_narrative_entries_sessao_unica
  on public.campaign_narrative_entries (online_session_id)
  where online_session_id is not null;

create table public.campaign_session_participants (
  session_id     uuid not null references public.campaign_online_sessions(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  primeiro_visto timestamptz not null default clock_timestamp(),
  ultimo_visto   timestamptz not null default clock_timestamp(),
  -- 'automatico' é o que os batimentos registraram; 'manual' é correção
  -- do narrador. Guardar a origem é o que permite distinguir o que o
  -- sistema viu do que alguém afirmou depois.
  origem         text not null default 'automatico' check (origem in ('automatico', 'manual')),
  incluido       boolean not null default true,
  primary key (session_id, user_id)
);
create index campaign_session_participants_user_idx on public.campaign_session_participants (user_id);

-- Correção manual precisa ser auditável (critério de aceite): fica
-- registrado quem mexeu, quando, e para qual valor.
create table public.campaign_session_participants_log (
  id           bigserial primary key,
  session_id   uuid not null references public.campaign_online_sessions(id) on delete cascade,
  user_id      uuid not null,
  incluido     boolean not null,
  alterado_por uuid references auth.users(id) on delete set null,
  alterado_em  timestamptz not null default clock_timestamp()
);
create index campaign_session_participants_log_idx
  on public.campaign_session_participants_log (session_id, alterado_em desc);

alter table public.campaign_session_participants enable row level security;
alter table public.campaign_session_participants_log enable row level security;
revoke all on public.campaign_session_participants, public.campaign_session_participants_log
  from public, anon, authenticated;
grant select on public.campaign_session_participants to authenticated;
grant select on public.campaign_session_participants_log to authenticated;

-- A lista segue a visibilidade da ENTRADA correspondente: enquanto o
-- registro é rascunho, só o narrador a vê; revelado, quem vê a entrada
-- vê os participantes. Uma regra só, de novo — a de `narrativa_pode_ver`.
create policy participantes_select on public.campaign_session_participants
  for select to authenticated using (
    exists (select 1 from public.campaign_narrative_entries e
            where e.online_session_id = session_id and public.narrativa_pode_ver(e.id))
  );
create policy participantes_log_select on public.campaign_session_participants_log
  for select to authenticated using (
    exists (select 1 from public.campaign_online_sessions s
            where s.id = session_id and public.is_campaign_owner(s.campaign_id))
  );

-- ── Criação da entrada, idempotente ─────────────────────────────────
create function public.garantir_entrada_de_sessao(p_session_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.campaign_online_sessions%rowtype;
  existente uuid;
begin
  select * into s from public.campaign_online_sessions where id = p_session_id;
  if not found then return null; end if;
  select id into existente from public.campaign_narrative_entries where online_session_id = p_session_id;
  if existente is not null then return existente; end if;
  insert into public.campaign_narrative_entries
    (campaign_id, tipo, titulo, estado, acontecida_em, online_session_id, criado_por)
  values (
    s.campaign_id, 'sessao',
    'Sessão de ' || to_char(s.started_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
    'rascunho', s.started_at, p_session_id, s.started_by
  )
  -- Corrida entre dois inícios simultâneos morre aqui, no índice.
  on conflict (online_session_id) where online_session_id is not null do nothing
  returning id into existente;
  if existente is null then
    select id into existente from public.campaign_narrative_entries where online_session_id = p_session_id;
  end if;
  return existente;
end;
$$;
revoke all on function public.garantir_entrada_de_sessao(uuid) from public, anon, authenticated;

-- ── Início da sessão passa a criar a entrada ────────────────────────
create or replace function public.set_campaign_online_session(
  p_campaign_id uuid, p_online boolean, p_expected_session_id uuid
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  active_id uuid;
  nova_id uuid;
begin
  perform 1 from public.campaigns where id = p_campaign_id for update;
  if not found or not public.is_campaign_owner(p_campaign_id) then
    raise exception 'Só o narrador pode iniciar ou encerrar a sessão.' using errcode = '42501';
  end if;
  if p_online is null then
    raise exception 'Estado de sessão inválido.' using errcode = '22023';
  end if;
  select id into active_id from public.campaign_online_sessions
    where campaign_id = p_campaign_id and ended_at is null;
  if p_online then
    if active_id is not null then return; end if;
    if p_expected_session_id is not null then
      raise exception 'A sessão mudou. Atualize antes de iniciar.' using errcode = '40001';
    end if;
    insert into public.campaign_online_sessions(campaign_id, started_by)
      values (p_campaign_id, auth.uid()) returning id into nova_id;
    -- O registro nasce junto com a sessão, e o narrador entra como
    -- autor já no primeiro instante.
    perform public.garantir_entrada_de_sessao(nova_id);
    insert into public.campaign_session_participants(session_id, user_id)
      values (nova_id, auth.uid()) on conflict do nothing;
  else
    if active_id is null then return; end if;
    if active_id is distinct from p_expected_session_id then
      raise exception 'A sessão mudou. Atualize antes de encerrar.' using errcode = '40001';
    end if;
    update public.campaign_online_sessions set ended_at = clock_timestamp() where id = active_id;
  end if;
  update public.campaigns set updated_at = clock_timestamp() where id = p_campaign_id;
end;
$$;

-- ── O batimento passa a acumular participação ───────────────────────
create or replace function public.heartbeat_campaign_session(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  result jsonb;
  ativa uuid;
  dono uuid;
begin
  perform 1 from public.campaigns where id = p_campaign_id for update;
  if not found or auth.uid() is null or not public.is_campaign_member(p_campaign_id) then
    raise exception 'Sem acesso à campanha.' using errcode = '42501';
  end if;
  perform public.evaluate_campaign_session_timeout(p_campaign_id);
  insert into public.campaign_session_heartbeats(campaign_id, user_id, seen_at)
    values (p_campaign_id, auth.uid(), clock_timestamp())
    on conflict (campaign_id, user_id) do update set seen_at = excluded.seen_at;

  -- Acumula a presença NA SESSÃO, que os batimentos sozinhos não
  -- guardam: eles sobrescrevem, esta tabela soma.
  select id into ativa from public.campaign_online_sessions
    where campaign_id = p_campaign_id and ended_at is null;
  select owner_id into dono from public.campaigns where id = p_campaign_id;
  if ativa is not null and (auth.uid() = dono or not public.presence_hidden(auth.uid())) then
    insert into public.campaign_session_participants(session_id, user_id)
      values (ativa, auth.uid())
      on conflict (session_id, user_id) do update set ultimo_visto = clock_timestamp();
  end if;

  perform public.evaluate_campaign_session_timeout(p_campaign_id);
  select to_jsonb(s) into result from public.campaign_online_sessions s
    where campaign_id = p_campaign_id order by started_at desc limit 1;
  return jsonb_build_object('session', result, 'server_now', clock_timestamp());
end;
$$;

-- ── Correção manual, auditada ───────────────────────────────────────
create function public.set_session_participant(p_session_id uuid, p_user_id uuid, p_incluir boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare camp uuid;
begin
  select campaign_id into camp from public.campaign_online_sessions where id = p_session_id;
  if not found or not public.is_campaign_owner(camp) then
    raise exception 'Só o narrador corrige a lista de participantes.' using errcode = '42501';
  end if;
  if not public.is_campaign_member(camp, p_user_id) then
    raise exception 'Só participantes da campanha entram no registro.' using errcode = '42501';
  end if;
  insert into public.campaign_session_participants(session_id, user_id, origem, incluido)
    values (p_session_id, p_user_id, 'manual', p_incluir)
    on conflict (session_id, user_id) do update set incluido = p_incluir, origem = 'manual';
  insert into public.campaign_session_participants_log(session_id, user_id, incluido, alterado_por)
    values (p_session_id, p_user_id, p_incluir, auth.uid());
end;
$$;
revoke all on function public.set_session_participant(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_session_participant(uuid, uuid, boolean) to authenticated;

commit;
