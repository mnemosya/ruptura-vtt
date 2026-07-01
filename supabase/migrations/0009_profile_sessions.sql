-- =====================================================================
-- Ruptura VTT — Sessão real de perfil
-- Migration: 0009_profile_sessions
--
-- Checkpoint v0.19. Adiciona uma tabela de SESSÕES de perfil rastreáveis
-- (status/histórico) que espelha e persiste o ciclo de vida que antes
-- vivia só no `lock_session_id` (localStorage) de campaign_profiles.
--
-- ABORDAGEM MÍNIMA-FUNCIONAL (documentada): as Server Actions existentes
-- (enterCampaignProfile/heartbeatCampaignProfile/leaveCampaignProfile/
-- forceReleaseCampaignProfile) passam a manter, ALÉM do lock antigo, uma
-- linha em profile_sessions keyed por (profile_id, session_token_hash),
-- onde session_token_hash = sha256 do sessionId do navegador (que já flui
-- por essas funções). Assim NÃO é preciso mudar o heartbeat do cliente
-- (ficha/join), evitando risco — e ganha-se sessão persistida, status
-- (active/exited/expired/released), last_seen e visibilidade para o
-- narrador.
--
-- NÃO adicionei campaign_profiles.active_session_id (o plano diz "se
-- fizer sentido"): a sessão ativa é derivada por query (status='active'
-- do profile), evitando FK circular e uma escrita extra. Campos antigos
-- de heartbeat em campaign_profiles ficam intactos (compat dev).
--
-- Pendência documentada: o "token de sessão" hoje é o sha256 do sessionId
-- do navegador (estável por navegador), não um token único por sessão
-- distinto do id do navegador. Suficiente para rastrear e liberar
-- sessões; refinamento para token por-sessão fica como próximo passo.
--
-- RLS: mesma estratégia de transição (dev_transition abertas, porque o
-- fluxo de jogador é anon) + owner-scoped por campanha.
-- =====================================================================

begin;

create table if not exists profile_sessions (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references campaigns(id) on delete cascade,
  profile_id          uuid not null references campaign_profiles(id) on delete cascade,
  invite_id           uuid references campaign_invites(id) on delete set null,
  session_token_hash  text not null,
  status              text not null default 'active' check (status in ('active','exited','expired','released')),
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  exited_at           timestamptz,
  released_at         timestamptz,
  user_agent          text
);

create index if not exists profile_sessions_campaign_id_idx on profile_sessions (campaign_id);
create index if not exists profile_sessions_profile_id_idx on profile_sessions (profile_id);
create index if not exists profile_sessions_profile_token_idx on profile_sessions (profile_id, session_token_hash);
create index if not exists profile_sessions_status_idx on profile_sessions (profile_id, status);

alter table profile_sessions enable row level security;

drop policy if exists profile_sessions_dev_transition_select on profile_sessions;
create policy profile_sessions_dev_transition_select on profile_sessions
  for select to anon, authenticated using (true);
comment on policy profile_sessions_dev_transition_select on profile_sessions is
  'TRANSICAO/INSEGURA: leitura aberta a anon (join/ficha anon leem status). Remover com auth de jogador.';

drop policy if exists profile_sessions_dev_transition_insert on profile_sessions;
create policy profile_sessions_dev_transition_insert on profile_sessions
  for insert to anon, authenticated with check (true);
comment on policy profile_sessions_dev_transition_insert on profile_sessions is
  'TRANSICAO/INSEGURA: insert aberto a anon (jogador cria sessao sem login). Remover com auth de jogador.';

drop policy if exists profile_sessions_dev_transition_update on profile_sessions;
create policy profile_sessions_dev_transition_update on profile_sessions
  for update to anon, authenticated using (true) with check (true);
comment on policy profile_sessions_dev_transition_update on profile_sessions is
  'TRANSICAO/INSEGURA: update aberto a anon (heartbeat/exit). Remover com auth de jogador.';

drop policy if exists profile_sessions_dev_transition_delete on profile_sessions;
create policy profile_sessions_dev_transition_delete on profile_sessions
  for delete to anon, authenticated using (true);
comment on policy profile_sessions_dev_transition_delete on profile_sessions is
  'TRANSICAO/INSEGURA: delete aberto a anon. Remover com auth de jogador.';

drop policy if exists profile_sessions_owner_all on profile_sessions;
create policy profile_sessions_owner_all on profile_sessions
  for all to authenticated
  using (campaign_id in (select id from campaigns where owner_id = (select auth.uid())))
  with check (campaign_id in (select id from campaigns where owner_id = (select auth.uid())));

commit;
