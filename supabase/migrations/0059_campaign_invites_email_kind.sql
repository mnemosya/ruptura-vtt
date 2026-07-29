-- =====================================================================
-- Ruptura VTT — Fase 2: convite por e-mail (kind) e ativação automática
-- Migration: 0059_campaign_invites_email_kind
--
-- Aditivo §6/§7/§14: dois tipos de convite. "clean" (já existente,
-- comportamento inalterado — multi-uso, sempre concede Jogador, nunca
-- Narrador). "email": associado a um e-mail específico; só a conta
-- autenticada com aquele e-mail pode ativá-lo (accept_campaign_invite
-- OU login/cadastro via activate_pending_email_invites) — nunca cria
-- campaign_members antes da autenticação real acontecer (correção da
-- revisão 4: "pendente" vive inteiramente em campaign_invites).
-- =====================================================================

begin;

alter table campaign_invites
  add column if not exists kind text not null default 'clean',
  add column if not exists email text,
  add column if not exists activated_by uuid references auth.users(id) on delete set null,
  add column if not exists activated_at timestamptz;

alter table campaign_invites
  drop constraint if exists campaign_invites_kind_check;
alter table campaign_invites
  add constraint campaign_invites_kind_check check (kind in ('email', 'clean'));

alter table campaign_invites
  drop constraint if exists campaign_invites_email_kind_check;
alter table campaign_invites
  add constraint campaign_invites_email_kind_check
    check ((kind = 'email' and email is not null) or (kind = 'clean' and email is null));

create index if not exists campaign_invites_email_idx on campaign_invites (email) where email is not null;

-- ---------------------------------------------------------------------
-- resolve_campaign_invite_public: passa a devolver também kind/email
-- (só quando kind='email') — permite ao /join/[token] pré-preencher o
-- e-mail no LoginForm sem exigir SELECT direto na tabela.
-- ---------------------------------------------------------------------
create or replace function resolve_campaign_invite_public(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_token_hash text;
  v_invite campaign_invites%rowtype;
  v_campaign_name text;
begin
  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select * into v_invite from campaign_invites where token_hash = v_token_hash;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_invite.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;
  if not v_invite.is_active then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select name into v_campaign_name from campaigns where id = v_invite.campaign_id;

  return jsonb_build_object(
    'ok', true,
    'inviteId', v_invite.id,
    'campaignId', v_invite.campaign_id,
    'campaignName', v_campaign_name,
    'kind', v_invite.kind,
    'email', v_invite.email
  );
end;
$function$;
revoke all on function resolve_campaign_invite_public(text) from public;
revoke all on function resolve_campaign_invite_public(text) from authenticated;
grant execute on function resolve_campaign_invite_public(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- accept_campaign_invite: convite 'email' só ativa para a conta cujo
-- e-mail (auth.email(), lido do JWT) bate com campaign_invites.email —
-- nunca confia em nada informado pelo cliente além do token.
-- ---------------------------------------------------------------------
create or replace function accept_campaign_invite(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_uid        uuid := auth.uid();
  v_invite     campaign_invites%rowtype;
  v_token_hash text;
  v_member_id  uuid;
begin
  if v_uid is null then
    raise exception 'É necessário estar autenticado para aceitar um convite.' using errcode = 'insufficient_privilege';
  end if;

  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select * into v_invite from campaign_invites where token_hash = v_token_hash;

  if not found then
    raise exception 'Convite não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'Este convite foi revogado.' using errcode = 'insufficient_privilege';
  end if;
  if not v_invite.is_active then
    raise exception 'Este convite está inativo.' using errcode = 'insufficient_privilege';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'Este convite expirou.' using errcode = 'insufficient_privilege';
  end if;

  if v_invite.kind = 'email' and lower(coalesce(auth.email(), '')) <> lower(v_invite.email) then
    raise exception 'Este convite pertence a outro e-mail — entre com a conta correspondente para aceitá-lo.' using errcode = 'insufficient_privilege';
  end if;

  insert into campaign_members (campaign_id, user_id, role, status, origem, invite_id, invited_by, joined_at)
  values (v_invite.campaign_id, v_uid, 'player', 'active', 'invite_accept', v_invite.id, v_invite.created_by, now())
  on conflict (campaign_id, user_id) do update set
    status = 'active',
    invite_id = coalesce(campaign_members.invite_id, excluded.invite_id),
    joined_at = coalesce(campaign_members.joined_at, excluded.joined_at)
  returning id into v_member_id;

  if v_invite.kind = 'email' and v_invite.activated_at is null then
    update campaign_invites set activated_by = v_uid, activated_at = now() where id = v_invite.id;
  end if;

  return jsonb_build_object('campaignId', v_invite.campaign_id, 'memberId', v_member_id);
end;
$function$;
revoke all on function accept_campaign_invite(text) from public;
revoke all on function accept_campaign_invite(text) from anon;
grant execute on function accept_campaign_invite(text) to authenticated;

-- ---------------------------------------------------------------------
-- activate_pending_email_invites: chamada best-effort logo após
-- login/cadastro bem-sucedido — ativa TODOS os convites por e-mail
-- pendentes cujo e-mail bate com a conta que acabou de autenticar, sem
-- exigir que a pessoa reabra cada link manualmente.
-- ---------------------------------------------------------------------
create or replace function activate_pending_email_invites()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.email();
  v_invite record;
  v_activated_campaign_ids uuid[] := '{}';
begin
  if v_uid is null or v_email is null then
    return jsonb_build_object('activatedCampaignIds', '[]'::jsonb);
  end if;

  for v_invite in
    select * from campaign_invites
    where kind = 'email'
      and is_active
      and activated_at is null
      and revoked_at is null
      and lower(email) = lower(v_email)
      and (expires_at is null or expires_at > now())
  loop
    insert into campaign_members (campaign_id, user_id, role, status, origem, invite_id, invited_by, joined_at)
    values (v_invite.campaign_id, v_uid, 'player', 'active', 'invite_accept', v_invite.id, v_invite.created_by, now())
    on conflict (campaign_id, user_id) do update set
      status = 'active',
      invite_id = coalesce(campaign_members.invite_id, excluded.invite_id),
      joined_at = coalesce(campaign_members.joined_at, excluded.joined_at);

    update campaign_invites set activated_by = v_uid, activated_at = now() where id = v_invite.id;
    v_activated_campaign_ids := array_append(v_activated_campaign_ids, v_invite.campaign_id);
  end loop;

  return jsonb_build_object('activatedCampaignIds', to_jsonb(v_activated_campaign_ids));
end;
$function$;
revoke all on function activate_pending_email_invites() from public;
revoke all on function activate_pending_email_invites() from anon;
grant execute on function activate_pending_email_invites() to authenticated;

commit;
