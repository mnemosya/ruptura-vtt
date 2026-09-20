begin;

alter table public.campaign_online_sessions
  add column empty_since timestamptz default clock_timestamp(),
  add column confirmation_deadline timestamptz;

-- Presença autenticada para prazos; não usa payloads de Presence enviados pelo cliente.
-- Uma linha por usuário também evita que fechar uma aba desconecte outra.
create table public.campaign_session_heartbeats (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seen_at timestamptz not null default clock_timestamp(),
  primary key (campaign_id, user_id)
);
alter table public.campaign_session_heartbeats enable row level security;
revoke all on public.campaign_session_heartbeats from public, anon, authenticated;

-- Todos os caminhos bloqueiam primeiro a campanha, como o controle manual.
create function public.evaluate_campaign_session_timeout(p_campaign_id uuid)
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
    where h.campaign_id = p_campaign_id and h.user_id <> owner_user and m.status = 'active';
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
revoke all on function public.evaluate_campaign_session_timeout(uuid) from public, anon, authenticated;

create function public.heartbeat_campaign_session(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  perform 1 from public.campaigns where id = p_campaign_id for update;
  if not found or auth.uid() is null or not public.is_campaign_member(p_campaign_id) then
    raise exception 'Sem acesso à campanha.' using errcode = '42501';
  end if;
  -- Um retorno depois do prazo não pode ressuscitar a sessão entre execuções do cron.
  perform public.evaluate_campaign_session_timeout(p_campaign_id);
  insert into public.campaign_session_heartbeats(campaign_id, user_id, seen_at)
    values (p_campaign_id, auth.uid(), clock_timestamp())
    on conflict (campaign_id, user_id) do update set seen_at = excluded.seen_at;
  perform public.evaluate_campaign_session_timeout(p_campaign_id);
  select to_jsonb(s) into result from public.campaign_online_sessions s
    where campaign_id = p_campaign_id order by started_at desc limit 1;
  return jsonb_build_object('session', result, 'server_now', clock_timestamp());
end;
$$;
revoke all on function public.heartbeat_campaign_session(uuid) from public, anon;
grant execute on function public.heartbeat_campaign_session(uuid) to authenticated;

create function public.continue_campaign_session(p_campaign_id uuid, p_session_id uuid, p_deadline timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.campaigns where id = p_campaign_id for update;
  if not found or not public.is_campaign_owner(p_campaign_id) then
    raise exception 'Só o narrador pode continuar a sessão.' using errcode = '42501';
  end if;
  update public.campaign_online_sessions
    set empty_since = clock_timestamp(), confirmation_deadline = null
    where campaign_id = p_campaign_id and id = p_session_id and ended_at is null
      and confirmation_deadline = p_deadline and confirmation_deadline > clock_timestamp();
  if not found then
    raise exception 'Este aviso expirou ou a sessão mudou. Atualize a mesa.' using errcode = '40001';
  end if;
  update public.campaigns set updated_at = clock_timestamp() where id = p_campaign_id;
end;
$$;
revoke all on function public.continue_campaign_session(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.continue_campaign_session(uuid, uuid, timestamptz) to authenticated;

create function public.sweep_campaign_session_timeouts()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare campaign uuid;
begin
  for campaign in select campaign_id from public.campaign_online_sessions where ended_at is null order by campaign_id loop
    perform public.evaluate_campaign_session_timeout(campaign);
  end loop;
  delete from public.campaign_session_heartbeats where seen_at < clock_timestamp() - interval '1 day';
end;
$$;
revoke all on function public.sweep_campaign_session_timeouts() from public, anon, authenticated;

-- O agendador continua funcionando sem abas abertas. Falhar aqui reverte a migration inteira.
create extension if not exists pg_cron;
select cron.schedule('ruptura-session-timeouts', '* * * * *', 'select public.sweep_campaign_session_timeouts()');

commit;
