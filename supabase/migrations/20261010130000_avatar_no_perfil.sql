-- O perfil passa a devolver `avatar_path` (user_metadata, ver
-- 20261010120000_account_avatars). A regra de quem vê quem não muda:
-- é ela que autoriza a rota /api/usuarios/<id>/avatar, que só serve a
-- imagem depois de esta função aceitar o pedido.
begin;

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

  -- Online = batimento recente em ALGUMA campanha compartilhada, e sem
  -- a preferência de aparecer offline. A mesma projeção do resto: quem
  -- se escondeu aparece offline aqui também, inclusive para si.
  select exists (
    select 1 from public.campaign_session_heartbeats h
    where h.user_id = p_user_id and h.seen_at > fresh
      and h.campaign_id in (select (e->>'campaign_id')::uuid from jsonb_array_elements(coalesce(compartilhadas, '[]'::jsonb)) e)
      and not public.presence_hidden(p_user_id)
  ) into esta_online;

  return jsonb_build_object(
    'user_id', p_user_id,
    'display_name', nome,
    'avatar_path', (select nullif(u.raw_user_meta_data->>'avatar_path', '') from auth.users u where u.id = p_user_id),
    'is_self', p_user_id = viewer,
    'online', esta_online,
    'campaigns', coalesce(compartilhadas, '[]'::jsonb)
  );
end;
$$;

commit;
