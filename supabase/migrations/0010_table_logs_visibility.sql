-- =====================================================================
-- Ruptura VTT — Visibilidade real de logs
-- Migration: 0010_table_logs_visibility
--
-- Checkpoint v0.20. Adiciona colunas reais a table_logs para permitir
-- FILTRO POR VISIBILIDADE no servidor (não só filtro visual):
--   • profile_id          — qual perfil gerou o log (dono do 'private')
--   • created_by_user_id  — narrador logado que gerou (quando houver)
--   • profile_session_id  — sessão de perfil (quando houver)
--
-- IMPORTANTE — o enforcement de visibilidade é APPLICATION-LAYER:
-- como o jogador é anon (sem auth.uid()), a RLS não distingue jogadores.
-- A função listLogsForViewer() (storage.ts) filtra no servidor por
-- identidade do observador ANTES de devolver ao cliente:
--   • narrador dono da mesa (autenticado): vê tudo;
--   • sessão de perfil P: public + private do próprio P; NUNCA gm;
--   • anon sem perfil: só public.
-- A RLS de table_logs continua em transição (dev_transition anon aberto)
-- — por isso o /dev/table (console dev/narrador) ainda vê tudo, e isso
-- é sinalizado na UI. As rotas de jogador usam listLogsForViewer.
--
-- Backfill parcial e SEGURO: preenche profile_id a partir de
-- payload->>'profileId' SOMENTE quando esse id ainda existe em
-- campaign_profiles (respeita a FK). Logs sem profileId no payload ou
-- de perfil já apagado ficam com profile_id null (continuam
-- renderizando; private antigo sem dono fica invisível ao jogador, que
-- é o lado seguro).
-- =====================================================================

begin;

alter table table_logs
  add column if not exists profile_id uuid references campaign_profiles(id) on delete set null,
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists profile_session_id uuid references profile_sessions(id) on delete set null;

-- Backfill seguro de profile_id (só quando o perfil ainda existe).
update table_logs t
   set profile_id = p.id
  from campaign_profiles p
 where t.profile_id is null
   and t.payload ? 'profileId'
   and p.id::text = t.payload->>'profileId';

create index if not exists table_logs_visibility_idx on table_logs (campaign_id, visibility);
create index if not exists table_logs_profile_id_idx on table_logs (profile_id);

commit;
