-- =====================================================================
-- Ruptura VTT — RLS controlada (renomeação + documentação)
-- Migration: 0007_rls_controlled
--
-- Checkpoint v0.17. Objetivo: sair do estado "RLS dev-aberta total e
-- SEM RÓTULO" para um estado "controlado" — as mesmas policies abertas,
-- porém explicitamente marcadas como *_dev_transition_* e comentadas no
-- banco com o que precisa ser removido para haver segurança real.
--
-- ATENÇÃO — ISTO NÃO É SEGURANÇA REAL AINDA. Esta migration NÃO corta o
-- acesso anon. As policies renomeadas continuam com USING(true)/CHECK
-- (true) para anon+authenticated. O comportamento de acesso é
-- IDÊNTICO ao de antes (ALTER POLICY ... RENAME preserva roles, cmd,
-- USING e WITH CHECK). Zero risco de lockout.
--
-- POR QUE NÃO CORTAR ANON AGORA (bloqueio documentado, item 4 do
-- checkpoint v0.17):
--   • Jogadores entram por /dev/join SEM login (são `anon`). Cortar o
--     SELECT anon de campaigns/campaign_profiles ou o INSERT anon de
--     table_logs quebraria entrar na mesa, heartbeat, rolar e conversar.
--   • A ficha e o teste `npm run test:character-storage` usam a anon key
--     SEM sessão. Cortar characters dev-anon quebraria o teste (lockout)
--     e a ficha anon.
--   • Mesmo com sessão de perfil (checkpoints v0.18/v0.19), o jogador
--     NÃO tem JWT do Supabase, então `auth.uid()` não o identifica — a
--     segurança de jogador terá que ser feita em application-layer
--     (Server Actions validando tokens hasheados), não em RLS pura,
--     enquanto jogador for anon.
--
-- CAMADAS DE POLICY (separação explícita):
--   1. PÚBLICAS necessárias (Biblioteca do Sistema) — NÃO tocar:
--        content_documents_public_read (status='published')
--        content_packs_public_read
--      (content_changelog fica sem policy pública de propósito.)
--   2. PRODUTO / autenticadas (owner-scoped, migration 0006) — mantidas:
--        campaigns_owner_{select,insert,update,delete}
--        campaign_profiles_owner_all
--        table_logs_owner_{select,insert}
--      Hoje NÃO enforçam nada porque as de transição coexistem (OR).
--   3. DEV / TRANSIÇÃO (renomeadas aqui) — REMOVER quando houver
--      segurança real de jogador. Enquanto existirem, QUALQUER cliente
--      com a anon key (logado ou não) faz bypass total.
--
-- QUANDO REMOVER (NÃO fazer agora — quebraria /dev/join e o teste):
--   1. Ter auth/sessão de jogador validada server-side (v0.18/v0.19) e
--      migrar a ficha/teste para operar autenticado ou via camada
--      server confiável.
--   2. Dropar todas as policies *_dev_transition_* abaixo.
--   3. Adicionar policies de jogador (por sessão/convite) conforme o
--      modelo de application-layer.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------
alter policy campaigns_dev_anon_select on campaigns rename to campaigns_dev_transition_select;
alter policy campaigns_dev_anon_insert on campaigns rename to campaigns_dev_transition_insert;
alter policy campaigns_dev_anon_update on campaigns rename to campaigns_dev_transition_update;
alter policy campaigns_dev_anon_delete on campaigns rename to campaigns_dev_transition_delete;

comment on policy campaigns_dev_transition_select on campaigns is
  'TRANSICAO/INSEGURA: leitura aberta a anon. Remover quando houver seguranca real de jogador; ate la /dev/join depende dela.';
comment on policy campaigns_dev_transition_insert on campaigns is
  'TRANSICAO/INSEGURA: insert aberto a anon. Remover; produto usa campaigns_owner_insert.';
comment on policy campaigns_dev_transition_update on campaigns is
  'TRANSICAO/INSEGURA: update aberto a anon. Remover; produto usa campaigns_owner_update.';
comment on policy campaigns_dev_transition_delete on campaigns is
  'TRANSICAO/INSEGURA: delete aberto a anon. Remover; produto usa campaigns_owner_delete.';

-- ---------------------------------------------------------------------
-- campaign_profiles
-- ---------------------------------------------------------------------
alter policy campaign_profiles_dev_anon_select on campaign_profiles rename to campaign_profiles_dev_transition_select;
alter policy campaign_profiles_dev_anon_insert on campaign_profiles rename to campaign_profiles_dev_transition_insert;
alter policy campaign_profiles_dev_anon_update on campaign_profiles rename to campaign_profiles_dev_transition_update;
alter policy campaign_profiles_dev_anon_delete on campaign_profiles rename to campaign_profiles_dev_transition_delete;

comment on policy campaign_profiles_dev_transition_select on campaign_profiles is
  'TRANSICAO/INSEGURA: leitura aberta a anon. /dev/join lista perfis por aqui. Remover quando sessao de jogador existir.';
comment on policy campaign_profiles_dev_transition_insert on campaign_profiles is
  'TRANSICAO/INSEGURA: insert aberto a anon. Remover; produto usa campaign_profiles_owner_all.';
comment on policy campaign_profiles_dev_transition_update on campaign_profiles is
  'TRANSICAO/INSEGURA: update aberto a anon (heartbeat/enter/leave usam). Remover apos sessao real de perfil (v0.19).';
comment on policy campaign_profiles_dev_transition_delete on campaign_profiles is
  'TRANSICAO/INSEGURA: delete aberto a anon. Remover; produto usa campaign_profiles_owner_all.';

-- ---------------------------------------------------------------------
-- table_logs
-- ---------------------------------------------------------------------
alter policy table_logs_dev_anon_select on table_logs rename to table_logs_dev_transition_select;
alter policy table_logs_dev_anon_insert on table_logs rename to table_logs_dev_transition_insert;

comment on policy table_logs_dev_transition_select on table_logs is
  'TRANSICAO/INSEGURA: leitura aberta a anon, SEM filtro de visibility. Jogador ve gm/private de todos. Remover quando visibilidade real (v0.20) e sessao de jogador existirem.';
comment on policy table_logs_dev_transition_insert on table_logs is
  'TRANSICAO/INSEGURA: insert aberto a anon. Remover; produto usa table_logs_owner_insert + insert por sessao de jogador (futuro).';

-- ---------------------------------------------------------------------
-- characters
-- ---------------------------------------------------------------------
alter policy characters_dev_anon_select on characters rename to characters_dev_transition_select;
alter policy characters_dev_anon_insert on characters rename to characters_dev_transition_insert;
alter policy characters_dev_anon_update on characters rename to characters_dev_transition_update;
alter policy characters_dev_anon_delete on characters rename to characters_dev_transition_delete;

comment on policy characters_dev_transition_select on characters is
  'TRANSICAO/INSEGURA: CRUD aberto a anon. A ficha e o teste character-storage usam anon key sem sessao. Nao ha owner de personagem ainda. Remover exige owner_id em characters + auth na ficha.';
comment on policy characters_dev_transition_insert on characters is
  'TRANSICAO/INSEGURA: insert aberto a anon (ver select).';
comment on policy characters_dev_transition_update on characters is
  'TRANSICAO/INSEGURA: update aberto a anon (ver select).';
comment on policy characters_dev_transition_delete on characters is
  'TRANSICAO/INSEGURA: delete aberto a anon (ver select).';

commit;
