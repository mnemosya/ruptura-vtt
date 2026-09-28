-- 0139 — Contagem real de participantes conectados numa sessão (DASH-01).
-- O dashboard lia a sessão por select e não tinha de onde tirar "quantos
-- estão agora". A autoridade é `campaign_session_heartbeats` (0138), a
-- mesma que decide os prazos de encerramento — não a presença decorativa
-- enviada pelo cliente, que ninguém pode forjar aqui.
--
-- Devolve CONTAGEM e presença do narrador, nunca nomes: nomes de
-- participantes seguem exclusivos do narrador em
-- `get_campaign_participant_info` (0060), e esta função é legível por
-- qualquer membro da campanha.
--
-- PRES-02 ("Aparecer offline") entra em UM lugar só, marcado abaixo:
-- enquanto a preferência não existe, ninguém é filtrado e a contagem é
-- a conexão real.
begin;

create function public.read_campaign_session_presence(p_campaign_id uuid)
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
    -- PRES-02: aqui entra o filtro de "aparecer offline" do narrador.
  ) into narrator_online;

  select count(*) into player_count
  from public.campaign_session_heartbeats h
  join public.campaign_members m on m.campaign_id = h.campaign_id and m.user_id = h.user_id
  where h.campaign_id = p_campaign_id and h.user_id <> owner_user
    and m.status = 'active' and h.seen_at > fresh;
    -- PRES-02: e aqui o mesmo filtro para os jogadores.

  return jsonb_build_object(
    'session', case when session_row.id is null then null else to_jsonb(session_row) end,
    'narrator_online', narrator_online,
    'player_count', player_count
  );
end;
$$;

revoke all on function public.read_campaign_session_presence(uuid) from public, anon;
grant execute on function public.read_campaign_session_presence(uuid) to authenticated;

commit;
