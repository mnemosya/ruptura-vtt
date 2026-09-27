-- TOK-06: alvos públicos por participante/cena, com lease de 90 s.
-- Broadcast só invalida; a leitura filtra tokens ocultos via RPC.
begin;
create table public.vtt_targets (
  token_id uuid not null references public.vtt_tokens(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '90 seconds'),
  primary key (token_id, user_id)
);
alter table public.vtt_targets enable row level security;
revoke all on public.vtt_targets from anon, authenticated;

create function public.read_vtt_targets(p_scene_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tokenId', t.id, 'autorId', a.user_id, 'expiresAt', a.expires_at
  )), '[]'::jsonb)
  from vtt_targets a join vtt_tokens t on t.id = a.token_id
  where t.scene_id = p_scene_id and a.expires_at > now()
    and vtt_pode_ver_cena(t.scene_id)
    and is_campaign_member(t.campaign_id, a.user_id)
    and (t.visivel or is_campaign_owner(t.campaign_id));
$$;

create function public.set_vtt_target(p_scene_id uuid, p_token_id uuid, p_selected boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_campaign uuid; v_count integer;
begin
  select campaign_id into v_campaign from vtt_tokens
  where id = p_token_id and scene_id = p_scene_id
    and vtt_pode_interagir_cena(scene_id) and (visivel or is_campaign_owner(campaign_id));
  if v_campaign is null or auth.uid() is null then
    raise exception 'Token indisponível para marcar como alvo.' using errcode = '42501';
  end if;
  -- Serializa alterações do mesmo usuário, inclusive em abas distintas.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 49));
  delete from vtt_targets where user_id = auth.uid() and expires_at <= now();
  if p_selected then
    select count(*) into v_count from vtt_targets a join vtt_tokens t on t.id=a.token_id
      where a.user_id=auth.uid() and t.scene_id=p_scene_id;
    if v_count >= 32 and not exists(select 1 from vtt_targets where user_id=auth.uid() and token_id=p_token_id) then
      raise exception 'Limite de 32 alvos por participante.';
    end if;
    insert into vtt_targets(token_id,user_id) values(p_token_id,auth.uid())
      on conflict(token_id,user_id) do update set expires_at=now()+interval '90 seconds';
  else
    delete from vtt_targets where token_id=p_token_id and user_id=auth.uid();
  end if;
  perform realtime.send(jsonb_build_object('sceneId',p_scene_id), 'targets_changed',
    'campaign:'||v_campaign||':scene:'||p_scene_id||':vtt:targets',true);
  return read_vtt_targets(p_scene_id);
end;
$$;

create function public.renew_vtt_targets(p_scene_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Uma aba não recria alvos removidos por outra; só renova os existentes.
  update vtt_targets a set expires_at=now()+interval '90 seconds'
  from vtt_tokens t where t.id=a.token_id and t.scene_id=p_scene_id
    and a.user_id=auth.uid() and a.expires_at>now()
    and vtt_pode_interagir_cena(t.scene_id) and (t.visivel or is_campaign_owner(t.campaign_id));
  return read_vtt_targets(p_scene_id);
end;
$$;

create function public.vtt_targets_channel_autorizado(p_topic text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from vtt_scenes s where
    p_topic='campaign:'||s.campaign_id||':scene:'||s.id||':vtt:targets'
    and vtt_pode_ver_cena(s.id));
$$;
create policy campaign_members_receive_targets on realtime.messages for select to authenticated
using (public.vtt_targets_channel_autorizado(realtime.topic()));

-- Contexto autorizado, usado ANTES de gastar qualquer recurso.
create function public.read_vtt_action_context(p_actor_id uuid,p_target_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a vtt_tokens; t vtt_tokens;
begin
  select * into a from vtt_tokens where id=p_actor_id;
  if a.id is null or a.character_id is null or not can_move_vtt_token(a.id)
    or (not a.visivel and not is_campaign_owner(a.campaign_id)) then
    raise exception 'Você não controla este personagem.' using errcode='42501';
  end if;
  if p_target_id is not null then
    select * into t from vtt_tokens where id=p_target_id and scene_id=a.scene_id
      and campaign_id=a.campaign_id and (visivel or is_campaign_owner(campaign_id));
    if t.id is null then raise exception 'Alvo indisponível nesta cena.' using errcode='42501'; end if;
  end if;
  return jsonb_build_object('campaignId',a.campaign_id,'sceneId',a.scene_id,
    'actorCharacterId',a.character_id,'actorTokenId',a.id,
    'alvoTokenId',t.id,'alvoCharacterId',t.character_id,'alvoNome',t.nome,
    'logVisibility',case when not a.visivel or (t.id is not null and not t.visivel) then 'gm' else 'public' end);
end;
$$;
revoke all on function public.read_vtt_targets(uuid),public.set_vtt_target(uuid,uuid,boolean),
  public.renew_vtt_targets(uuid),public.vtt_targets_channel_autorizado(text),
  public.read_vtt_action_context(uuid,uuid) from public,anon;
grant execute on function public.read_vtt_targets(uuid),public.set_vtt_target(uuid,uuid,boolean),
  public.renew_vtt_targets(uuid),public.vtt_targets_channel_autorizado(text),
  public.read_vtt_action_context(uuid,uuid) to authenticated;
commit;
