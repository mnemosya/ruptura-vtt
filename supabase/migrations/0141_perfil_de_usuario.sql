-- 0141 — Perfil de usuário (NET-01).
--
-- Até aqui não havia perfil algum no projeto: a lista de participantes
-- do VTT mostrava nome e papel, e nada era clicável. Esta função é a
-- primeira leitura de "quem é essa pessoa", e por isso define a regra
-- de quem pode ver quem.
--
-- REGRA: só se vê o perfil de alguém com quem se COMPARTILHA ao menos
-- uma campanha, e só aparecem as campanhas compartilhadas com quem
-- pergunta — duas pessoas na mesma mesa não passam a enxergar as outras
-- mesas uma da outra. E-mail nunca sai por aqui: continua exclusivo do
-- narrador em `get_campaign_participant_info` (0060).
--
-- Presença respeita "Aparecer offline" (0140): quem está escondido
-- aparece como offline no perfil, como em qualquer outra projeção.
begin;

create function public.read_user_profile(p_user_id uuid)
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
    'is_self', p_user_id = viewer,
    'online', esta_online,
    'campaigns', coalesce(compartilhadas, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.read_user_profile(uuid) from public, anon;
grant execute on function public.read_user_profile(uuid) to authenticated;

-- Presença de TODA a rede numa consulta só: o painel Rede mostrava
-- "Online" fixo para a própria conta e "offline" fixo para o resto —
-- um mock que agora contradiz a presença real. Mesma regra do perfil:
-- só gente com campanha em comum, e "Aparecer offline" é respeitado.
create function public.read_network_presence()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with minhas as (
    select c.id from public.campaigns c
    where auth.uid() is not null and (
      c.owner_id = auth.uid()
      or exists (select 1 from public.campaign_members m
                 where m.campaign_id = c.id and m.user_id = auth.uid() and m.status = 'active'))
  ), pessoas as (
    select distinct c.owner_id as user_id from public.campaigns c join minhas n on n.id = c.id
    union
    select distinct m.user_id from public.campaign_members m join minhas n on n.id = m.campaign_id
    where m.status = 'active'
  )
  select coalesce(jsonb_object_agg(p.user_id, exists (
    select 1 from public.campaign_session_heartbeats h
    where h.user_id = p.user_id and h.campaign_id in (select id from minhas)
      and h.seen_at > clock_timestamp() - interval '2 minutes'
      and not public.presence_hidden(p.user_id)
  )), '{}'::jsonb) from pessoas p;
$$;
revoke all on function public.read_network_presence() from public, anon;
grant execute on function public.read_network_presence() to authenticated;

commit;
