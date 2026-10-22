-- Presença da conta em toda a área autenticada, mesmo fora de uma mesa.
begin;

create table public.account_presence_heartbeats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seen_at timestamptz not null default clock_timestamp()
);
alter table public.account_presence_heartbeats enable row level security;
revoke all on public.account_presence_heartbeats from public, anon;
grant select, insert, update on public.account_presence_heartbeats to authenticated;
create policy account_presence_self_select on public.account_presence_heartbeats
  for select to authenticated using (user_id = (select auth.uid()));
create policy account_presence_self_insert on public.account_presence_heartbeats
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy account_presence_self_update on public.account_presence_heartbeats
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create function public.heartbeat_account_presence()
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'Sem sessão.' using errcode = '42501';
  end if;
  insert into public.account_presence_heartbeats (user_id, seen_at)
  values (auth.uid(), clock_timestamp())
  on conflict (user_id) do update set seen_at = excluded.seen_at;
end;
$$;
revoke all on function public.heartbeat_account_presence() from public, anon;
grant execute on function public.heartbeat_account_presence() to authenticated;

create or replace function public.read_user_profile(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  viewer uuid := auth.uid();
  fresh timestamptz := clock_timestamp() - interval '2 minutes';
  nome text;
  compartilhadas jsonb;
  esta_online boolean;
begin
  if viewer is null or p_user_id is null then
    raise exception 'Sem acesso a este perfil.' using errcode = '42501';
  end if;

  -- Campanhas em que AMBOS estão, cada um como dono ou membro ativo.
  with minhas as (
    select c.id, c.name, c.owner_id from public.campaigns c
    where c.owner_id = viewer
       or exists (select 1 from public.campaign_members m
                  where m.campaign_id = c.id and m.user_id = viewer and m.status = 'active')
  ), ambas as (
    select m.id, m.name, m.owner_id from minhas m
    where m.owner_id = p_user_id
       or exists (select 1 from public.campaign_members cm
                  where cm.campaign_id = m.id and cm.user_id = p_user_id and cm.status = 'active')
  )
  select jsonb_agg(jsonb_build_object(
    'campaign_id', a.id,
    'campaign_name', a.name,
    'role', case when a.owner_id = p_user_id then 'narrator' else 'player' end,
    'characters', coalesce((
      select jsonb_agg(jsonb_build_object('id', ch.id, 'name', ch.name) order by ch.name)
      from public.characters ch
      where ch.campaign_id = a.id and ch.owner_id = p_user_id
    ), '[]'::jsonb)
  ) order by a.name) into compartilhadas from ambas a;

  -- Ver o PRÓPRIO perfil não exige campanha em comum com ninguém.
  if compartilhadas is null and p_user_id <> viewer then
    raise exception 'Sem acesso a este perfil.' using errcode = '42501';
  end if;

  select coalesce(
    nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(u.email, '@', 1), ''),
    'Conta sem nome'
  ) into nome from auth.users u where u.id = p_user_id;
  if nome is null then
    raise exception 'Sem acesso a este perfil.' using errcode = '42501';
  end if;

  -- Online = batimento recente na conta ou em campanha compartilhada, e sem
  -- a preferência de aparecer offline. A mesma projeção do resto: quem
  -- se escondeu aparece offline aqui também, inclusive para si.
  select exists (
    select 1 from public.account_presence_heartbeats a
    where a.user_id = p_user_id and a.seen_at > fresh
      and not public.presence_hidden(p_user_id)
  ) or exists (
    select 1 from public.campaign_session_heartbeats h
    where h.user_id = p_user_id and h.seen_at > fresh
      and h.campaign_id in (select (e->>'campaign_id')::uuid from jsonb_array_elements(coalesce(compartilhadas, '[]'::jsonb)) e)
      and not public.presence_hidden(p_user_id)
  ) into esta_online;

  return jsonb_build_object(
    'user_id', p_user_id,
    'display_name', nome,
    'is_self', p_user_id = viewer,
    'online', esta_online,
    'campaigns', coalesce(compartilhadas, '[]'::jsonb)
  );
end;
$$;


create or replace function public.read_network_presence()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with minhas as (
    select c.id from public.campaigns c
    where auth.uid() is not null and (
      c.owner_id = auth.uid()
      or exists (select 1 from public.campaign_members m
                 where m.campaign_id = c.id and m.user_id = auth.uid() and m.status = 'active'))
  ), pessoas as (
    select auth.uid() as user_id where auth.uid() is not null
    union
    select distinct c.owner_id as user_id from public.campaigns c join minhas n on n.id = c.id
    union
    select distinct m.user_id from public.campaign_members m join minhas n on n.id = m.campaign_id
    where m.status = 'active'
  )
  select coalesce(jsonb_object_agg(p.user_id, exists (
    select 1 from public.account_presence_heartbeats a
    where a.user_id = p.user_id and a.seen_at > clock_timestamp() - interval '2 minutes'
      and not public.presence_hidden(p.user_id)
  ) or exists (
    select 1 from public.campaign_session_heartbeats h
    where h.user_id = p.user_id and h.campaign_id in (select id from minhas)
      and h.seen_at > clock_timestamp() - interval '2 minutes'
      and not public.presence_hidden(p.user_id)
  )), '{}'::jsonb) from pessoas p;
$$;

commit;
