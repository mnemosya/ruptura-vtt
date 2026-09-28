-- 0140 — "Aparecer offline" (PRES-02), segundo a matriz aprovada em PRES-01.
--
-- A preferência filtra a PROJEÇÃO PÚBLICA de presença e nada além dela:
-- não muda autorização, vínculo com a campanha nem o que a pessoa pode
-- fazer. O batimento continua sendo gravado normalmente — o que muda é
-- quem enxerga o resultado.
--
-- Decisões que esta migration implementa:
--   * esconde de TODOS, inclusive do narrador;
--   * não entra em contador algum, nem no que a própria pessoa vê;
--   * NÃO segura o prazo de encerramento automático.
-- Esconder de todos e não segurar o prazo andam juntos de propósito: se
-- a presença escondida segurasse o prazo, o narrador deduziria que há
-- alguém ali pelo simples fato de a sessão nunca encerrar sozinha.
begin;

create table public.user_presence_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  appear_offline boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.user_presence_preferences enable row level security;
revoke all on public.user_presence_preferences from public, anon;
grant select, insert, update on public.user_presence_preferences to authenticated;

-- Cada conta lê e escreve SÓ a própria linha. Ninguém consulta a
-- preferência alheia por aqui; quem precisa dela são as funções de
-- projeção abaixo, que rodam como definer.
create policy presence_prefs_self_select on public.user_presence_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy presence_prefs_self_insert on public.user_presence_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy presence_prefs_self_update on public.user_presence_preferences
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Interna: não é concedida a authenticated de propósito. Serve às
-- funções de projeção, para que "quem está invisível" nunca vire uma
-- consulta que qualquer cliente possa fazer sobre outra pessoa.
create function public.presence_hidden(p_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select appear_offline from public.user_presence_preferences where user_id = p_user), false);
$$;
revoke all on function public.presence_hidden(uuid) from public, anon, authenticated;

-- Projeção pública: some quem está invisível, inclusive para a própria
-- pessoa — existe UMA contagem, a pública, e é ela que todo mundo vê.
create or replace function public.read_campaign_session_presence(p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  owner_user uuid;
  fresh timestamptz := clock_timestamp() - interval '2 minutes';
  session_row public.campaign_online_sessions%rowtype;
  narrator_online boolean;
  player_count integer;
begin
  select owner_id into owner_user from public.campaigns where id = p_campaign_id;
  if not found or auth.uid() is null or not public.is_campaign_member(p_campaign_id) then
    raise exception 'Sem acesso à campanha.' using errcode = '42501';
  end if;

  select * into session_row from public.campaign_online_sessions
    where campaign_id = p_campaign_id order by started_at desc limit 1;

  select exists (
    select 1 from public.campaign_session_heartbeats
    where campaign_id = p_campaign_id and user_id = owner_user and seen_at > fresh
      and not public.presence_hidden(owner_user)
  ) into narrator_online;

  select count(*) into player_count
  from public.campaign_session_heartbeats h
  join public.campaign_members m on m.campaign_id = h.campaign_id and m.user_id = h.user_id
  where h.campaign_id = p_campaign_id and h.user_id <> owner_user
    and m.status = 'active' and h.seen_at > fresh
    and not public.presence_hidden(h.user_id);

  return jsonb_build_object(
    'session', case when session_row.id is null then null else to_jsonb(session_row) end,
    'narrator_online', narrator_online,
    'player_count', player_count
  );
end;
$$;

-- Prazo de encerramento: jogador invisível NÃO segura a sessão.
--
-- O narrador é caso diferente e continua medido pela conexão REAL: o
-- ramo dele não projeta presença para ninguém, só decide se há alguém
-- para confirmar "Continuar". Um narrador invisível que perdesse o
-- próprio aviso veria a sessão morrer sem ser perguntado — privacidade
-- é sobre o que os OUTROS veem, não sobre tirar da pessoa os próprios
-- controles.
create or replace function public.evaluate_campaign_session_timeout(p_campaign_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  owner_user uuid;
  s public.campaign_online_sessions%rowtype;
  t timestamptz := clock_timestamp();
  last_player timestamptz;
  empty_at timestamptz;
  deadline timestamptz;
  end_at timestamptz;
begin
  select owner_id into owner_user from public.campaigns where id = p_campaign_id for update;
  if not found then return; end if;
  select * into s from public.campaign_online_sessions
    where campaign_id = p_campaign_id and ended_at is null;
  if not found then return; end if;
  select max(h.seen_at) into last_player from public.campaign_session_heartbeats h
    join public.campaign_members m on m.campaign_id = h.campaign_id and m.user_id = h.user_id
    where h.campaign_id = p_campaign_id and h.user_id <> owner_user and m.status = 'active'
      and not public.presence_hidden(h.user_id);
  empty_at := s.empty_since;
  deadline := s.confirmation_deadline;
  if last_player > t - interval '2 minutes' then
    empty_at := null;
    deadline := null;
  else
    empty_at := coalesce(empty_at, greatest(s.started_at, least(t, last_player + interval '2 minutes')), t);
    if deadline is not null then
      if t >= deadline then end_at := t; end if;
    elsif t >= empty_at + interval '30 minutes' then
      if exists (select 1 from public.campaign_session_heartbeats
        where campaign_id = p_campaign_id and user_id = owner_user and seen_at > t - interval '2 minutes') then
        deadline := t + interval '10 minutes';
      else
        end_at := t;
      end if;
    end if;
  end if;
  if empty_at is distinct from s.empty_since or deadline is distinct from s.confirmation_deadline or end_at is not null then
    update public.campaign_online_sessions
      set empty_since = empty_at, confirmation_deadline = case when end_at is null then deadline end,
        ended_at = end_at where id = s.id;
    update public.campaigns set updated_at = clock_timestamp() where id = p_campaign_id;
  end if;
end;
$$;

commit;
