-- =====================================================================
-- Ruptura VTT — Heartbeat dev de perfil
-- Migration: 0005_campaign_profiles_heartbeat
--
-- PRD (seção 1.3): "usar heartbeat de presença; se o jogador fechar a
-- aba sem sair, o perfil é liberado após um tempo sem sinal; o narrador
-- pode forçar a liberação a qualquer momento." Esta migration adiciona
-- só as colunas necessárias para um heartbeat DEV simples (polling no
-- cliente, sem Supabase Realtime, sem autenticação real): quem
-- "segura" o bloqueio (lock_session_id, um id gerado no localStorage do
-- navegador — não é usuário autenticado), quando bloqueou (locked_at) e
-- o último sinal de vida (last_seen_at).
--
-- Fora de escopo aqui (próximas etapas):
--   • autenticação (sem auth.uid(), sem tabela de usuários — sessionId
--     continua sendo só um id local de navegador, não prova identidade);
--   • link de convite;
--   • Supabase Realtime (a expiração é detectada por polling client-side
--     comparando last_seen_at com o relógio local, não por um job no
--     banco nem por subscription).
-- =====================================================================

begin;

alter table campaign_profiles
  add column if not exists lock_session_id text,
  add column if not exists locked_at timestamptz,
  add column if not exists last_seen_at timestamptz;

-- =====================================================================
-- RLS — sem mudança de policy nesta migration
--
-- As 4 policies de campaign_profiles (CRUD completo para
-- anon/authenticated) já criadas na migration 0004 cobrem as novas
-- colunas automaticamente (RLS no Postgres é por linha, não por
-- coluna) — update de lock_session_id/locked_at/last_seen_at já está
-- liberado pela mesma policy campaign_profiles_dev_anon_update.
--
-- RISCO ADICIONAL desta migration (mesmo princípio das anteriores,
-- agora aplicado a heartbeat):
--   • Qualquer cliente com a anon key pode chamar enterCampaignProfile/
--     heartbeatCampaignProfile/leaveCampaignProfile/
--     forceReleaseCampaignProfile para QUALQUER perfil — não há
--     verificação de que o `sessionId` realmente pertence a quem diz
--     ser, porque sessionId é só um valor gerado no localStorage do
--     navegador (sem autenticação). Um cliente malicioso pode forjar
--     qualquer sessionId e "roubar" um perfil sem esperar os 30s de
--     expiração, bastando saber o profileId.
--   • forceReleaseCampaignProfile não exige nenhuma autorização de
--     narrador — qualquer cliente com a anon key pode liberar
--     qualquer perfil de qualquer mesa.
--   • A expiração (30s) é decidida no CLIENTE (comparando last_seen_at
--     com Date.now() local), não no banco — não há job/cron que limpe
--     bloqueios expirados automaticamente; um perfil "expirado" só é
--     liberado de fato quando outro cliente tenta entrar e o servidor
--     aceita por estar vencido, ou quando alguém clica "Liberar
--     perfil".
--
-- TODO (bloqueante para produção): quando houver autenticação,
--   1. lock_session_id deveria derivar de auth.uid(), não de um valor
--      gerado no navegador;
--   2. forceReleaseCampaignProfile deveria checar que quem chama é o
--      narrador da mesa;
--   3. considerar um mecanismo de expiração server-side (function/cron
--      do Postgres ou Edge Function agendada) em vez de depender só do
--      relógio do cliente.
-- =====================================================================

commit;
