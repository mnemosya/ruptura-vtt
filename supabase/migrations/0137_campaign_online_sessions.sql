begin;

create table public.campaign_online_sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  started_by uuid not null references auth.users(id),
  started_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create unique index campaign_one_online_session
  on public.campaign_online_sessions(campaign_id) where ended_at is null;
alter table public.campaign_online_sessions enable row level security;
grant select on public.campaign_online_sessions to authenticated;
revoke insert, update, delete on public.campaign_online_sessions from authenticated, anon;
create policy campaign_online_sessions_read on public.campaign_online_sessions
  for select to authenticated using (public.is_campaign_member(campaign_id));

-- expected_session_id é o estado que o narrador confirmou na interface.
-- Um pedido antigo nunca encerra uma sessão iniciada posteriormente.
create function public.set_campaign_online_session(
  p_campaign_id uuid, p_online boolean, p_expected_session_id uuid
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  active_id uuid;
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
      values (p_campaign_id, auth.uid());
  else
    if active_id is null then return; end if;
    if active_id is distinct from p_expected_session_id then
      raise exception 'A sessão mudou. Atualize antes de encerrar.' using errcode = '40001';
    end if;
    update public.campaign_online_sessions set ended_at = clock_timestamp() where id = active_id;
  end if;
  -- Reutiliza a assinatura de campanhas do provider. O timestamp é
  -- só invalidação; a fonte de estado e histórico é a tabela acima.
  update public.campaigns set updated_at = clock_timestamp() where id = p_campaign_id;
end;
$$;
revoke all on function public.set_campaign_online_session(uuid, boolean, uuid) from public, anon;
grant execute on function public.set_campaign_online_session(uuid, boolean, uuid) to authenticated;

commit;
