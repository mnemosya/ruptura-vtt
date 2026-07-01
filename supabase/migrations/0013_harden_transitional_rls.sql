-- =====================================================================
-- Ruptura VTT — Endurecimento parcial de RLS/dev_transition
-- Migration: 0013_harden_transitional_rls
--
-- Checkpoint v0.27. Auditoria completa das 6 tabelas com policies
-- `*_dev_transition_*` (campaigns, campaign_profiles, table_logs,
-- campaign_invites, profile_sessions, characters) via `pg_policies`.
-- Full audit + rationale documentado no relatório
-- (docs/RELATORIO_MESAS_LOG_V0_1.md, checkpoint v0.27).
--
-- RESUMO DA CLASSIFICAÇÃO:
--   campaign_invites (A) — ENDURECIDA (insert/update/delete).
--   campaigns        (E) — ENDURECIDA (insert/update/delete).
--   profile_sessions (B) — ainda precisa de transição (depende de
--     autenticação real de jogador — ver comentário na policy).
--   table_logs       (C) — ainda precisa de transição no INSERT/SELECT
--     (idem); UPDATE/DELETE já não têm NENHUMA policy (nem
--     dev_transition) — já são bloqueados por padrão pelo RLS desde
--     a migration 0003, sem trabalho adicional necessário aqui.
--   campaign_profiles(D) — ainda precisa de transição (idem).
--   characters       (F) — depende de refactor de storage (ver
--     comentário na policy) — characters/storage.ts usa
--     getContentClient() (client anon puro, nunca anexa o JWT do
--     narrador), então nenhuma policy owner-scoped funcionaria hoje
--     mesmo se criada — endurecer aqui exigiria trocar o client usado
--     em character/storage.ts para getScopedTableClient() E decidir
--     a semântica de "dono" usando characters.owner_id (migration
--     0011), o que é um refactor de storage, não só de RLS. Fora de
--     escopo desta etapa.
--
-- NENHUM client privilegiado novo (service role) foi necessário: as
-- duas tabelas endurecidas (campaign_invites, campaigns) já têm
-- policies `*_owner_*` completas desde as migrations 0006/0007, e o
-- fluxo de produto (/mesas) já sempre usa getScopedTableClient() com
-- o JWT real do narrador logado — bastou remover as policies
-- dev_transition que competiam com elas. Service role continua nunca
-- importada em lugar nenhum do frontend (ver scopedClient.ts).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- A. campaign_invites — ENDURECIDA
--
-- INSERT/UPDATE/DELETE (criar/revogar convite) só acontecem hoje via
-- Server Actions autenticadas como o narrador dono da mesa
-- (createCampaignInvite/revokeCampaignInvite, chamadas por
-- /mesas/[campaignId], sempre logado — v0.21). Nenhuma função apaga
-- convites (revogação é só UPDATE de is_active/revoked_at), então
-- dropar o DELETE aberto não tem custo funcional nenhum.
--
-- A policy `campaign_invites_owner_all` (migration 0007) já cobre
-- insert/update/delete para o narrador dono — bastava remover as
-- policies dev_transition equivalentes para essas 3 operações
-- passarem a exigir de fato `auth.uid()` = dono da mesa.
--
-- SELECT continua aberta a anon/authenticated de propósito:
-- `resolveCampaignInvite` (usada por /join/[token], visitante
-- ANÔNIMO com só o token na URL) precisa ler a linha pelo hash do
-- token sem estar logado. A segurança aqui já vem do token ser um
-- segredo de 256 bits (randomBytes(32)), não de RLS — nunca listamos
-- convites por essa rota, só resolvemos um hash específico.
-- ---------------------------------------------------------------------
drop policy if exists campaign_invites_dev_transition_insert on campaign_invites;
drop policy if exists campaign_invites_dev_transition_update on campaign_invites;
drop policy if exists campaign_invites_dev_transition_delete on campaign_invites;

comment on policy campaign_invites_dev_transition_select on campaign_invites is
  'v0.27: mantida de propósito. Precisa continuar aberta a anon porque resolveCampaignInvite (/join/[token]) é chamada por visitantes sem login — a segurança do convite vem do token (256 bits, só o hash é gravado), não desta policy. insert/update/delete já foram endurecidas (ver campaign_invites_owner_all) — só o dono autenticado da mesa cria/revoga convites agora.';

-- ---------------------------------------------------------------------
-- E. campaigns — ENDURECIDA
--
-- Nenhuma função em storage.ts faz UPDATE ou DELETE de campaigns hoje
-- (sem "renomear mesa"/"apagar mesa" na UI ainda) — dropar essas duas
-- policies dev_transition não tem custo funcional nenhum. INSERT
-- (createCampaign) só acontece autenticado no fluxo de produto
-- (/mesas sempre exige login desde v0.21); a policy
-- `campaigns_owner_insert` (migration 0007) já garante owner_id =
-- auth.uid() no insert.
--
-- SELECT continua aberta: getCampaign() é chamada por /join/[token] e
-- por validateProductSession (/ficha) para visitantes ANÔNIMOS
-- (mostrar o nome da mesa no convite/ficha) — endurecer o select
-- quebraria login/join/ficha, que é explicitamente proibido.
-- ---------------------------------------------------------------------
drop policy if exists campaigns_dev_transition_insert on campaigns;
drop policy if exists campaigns_dev_transition_update on campaigns;
drop policy if exists campaigns_dev_transition_delete on campaigns;

comment on policy campaigns_dev_transition_select on campaigns is
  'v0.27: mantida de propósito. /join/[token] e /ficha (validateProductSession) leem o nome da mesa como visitante anônimo, sem login — endurecer quebraria esses fluxos de produto. insert/update/delete já foram endurecidas (ver campaigns_owner_insert/update/delete) — nenhuma função de storage faz update/delete de mesas hoje, e criar mesa sempre exige o narrador logado no fluxo real (/mesas).';

-- ---------------------------------------------------------------------
-- B. profile_sessions — AINDA PRECISA DE TRANSIÇÃO (bloqueio documentado)
--
-- INSERT/UPDATE reais (upsertActiveProfileSession, markProfileSessions,
-- expireStaleProfileSessions) rodam tanto para o narrador (dashboard)
-- quanto — principalmente — para JOGADORES ANÔNIMOS entrando/saindo
-- de perfil via /join e /ficha (enterCampaignProfile,
-- heartbeatCampaignProfile, leaveCampaignProfile). Não existe
-- autenticação real de jogador (sessionId é só um id de navegador em
-- localStorage, não um usuário do Supabase Auth) — não há `auth.uid()`
-- para restringir essas escritas sem quebrar o heartbeat/join/ficha,
-- que são fluxos de produto proibidos de quebrar.
-- ---------------------------------------------------------------------
comment on policy profile_sessions_dev_transition_insert on profile_sessions is
  'v0.27: BLOQUEADA (depende de autenticação real de jogador). Escritas vêm majoritariamente de jogadores anônimos entrando em perfil via /join e /ficha (enterCampaignProfile) — não há auth.uid() de jogador para restringir sem quebrar esse fluxo de produto. Reavaliar quando existir login real de jogador.';
comment on policy profile_sessions_dev_transition_update on profile_sessions is
  'v0.27: BLOQUEADA (depende de autenticação real de jogador). heartbeatCampaignProfile/leaveCampaignProfile/expireStaleProfileSessions rodam para jogadores anônimos (/ficha, heartbeat a cada 10s) — endurecer sem auth real de jogador quebraria o heartbeat. Reavaliar quando existir login real de jogador.';
comment on policy profile_sessions_dev_transition_select on profile_sessions is
  'v0.27: BLOQUEADA (depende de autenticação real de jogador). listProfileSessions/getActiveProfileSession são lidas tanto pelo dashboard do narrador quanto potencialmente por telas de jogador — sem auth real de jogador, não há como restringir sem risco de quebrar leituras legítimas.';
comment on policy profile_sessions_dev_transition_delete on profile_sessions is
  'v0.27: nenhuma função de storage apaga profile_sessions (só muda status) — candidata a remoção futura de baixo risco, mas deixada por simetria com as demais nesta etapa (não é a prioridade B descrita no checkpoint, que foca em insert/update/select, os caminhos realmente usados).';

-- ---------------------------------------------------------------------
-- D. campaign_profiles — AINDA PRECISA DE TRANSIÇÃO (bloqueio documentado)
--
-- Mesmo motivo de profile_sessions: enterCampaignProfile,
-- heartbeatCampaignProfile e leaveCampaignProfile — o núcleo do
-- controle de "quem é dono do perfil" — são chamadas por jogadores
-- ANÔNIMOS via /join e /ficha. createCampaignProfile/
-- setCampaignProfileActiveCharacter/forceReleaseCampaignProfile são
-- só do narrador (dashboard), mas o UPDATE do heartbeat de jogador usa
-- a MESMA tabela/policy — não dá para separar insert-do-narrador de
-- update-do-jogador só com RLS sem quebrar o segundo.
-- ---------------------------------------------------------------------
comment on policy campaign_profiles_dev_transition_insert on campaign_profiles is
  'v0.27: BLOQUEADA (depende de autenticação real de jogador). createCampaignProfile é só do narrador (dashboard, autenticado), mas endurecer isoladamente aqui teria efeito prático baixo enquanto update permanece aberto para o heartbeat de jogador na mesma tabela — reavaliar junto com update, quando existir login real de jogador.';
comment on policy campaign_profiles_dev_transition_update on campaign_profiles is
  'v0.27: BLOQUEADA (depende de autenticação real de jogador). enterCampaignProfile/heartbeatCampaignProfile/leaveCampaignProfile (o mecanismo de bloqueio de perfil) rodam para jogadores anônimos via /join e /ficha, incluindo o heartbeat a cada 10s — não há auth.uid() de jogador para restringir sem quebrar esse fluxo de produto. Reavaliar quando existir login real de jogador.';
comment on policy campaign_profiles_dev_transition_select on campaign_profiles is
  'v0.27: BLOQUEADA (depende de autenticação real de jogador). listCampaignProfiles é lida por /join (visitante anônimo escolhendo perfil) e pelo dashboard do narrador — endurecer quebraria a tela de convite.';
comment on policy campaign_profiles_dev_transition_delete on campaign_profiles is
  'v0.27: nenhuma função de storage apaga campaign_profiles — candidata a remoção futura de baixo risco, deixada por simetria nesta etapa (a prioridade D do checkpoint é sobre insert/update/select, os caminhos realmente usados por jogadores).';

-- ---------------------------------------------------------------------
-- C. table_logs — AINDA PRECISA DE TRANSIÇÃO no INSERT/SELECT
--
-- addLog (chat/rolagens) é a própria funcionalidade de jogador
-- ANÔNIMO via /ficha — endurecer o INSERT quebraria chat/rolagens de
-- jogador, proibido pelo checkpoint ("nunca quebrar... logs").
-- listLogsForViewer já filtra visibilidade na CAMADA DE APLICAÇÃO
-- (checkpoint v0.20) — mas o SELECT do RLS ainda precisa ficar aberto
-- porque essa mesma função lê "todos os logs" (listLogs, sem filtro)
-- via cliente anon quando chamada para um jogador sem perfil, e então
-- filtra em JS; endurecer o SELECT do RLS para excluir gm/private
-- quebraria o caso "jogador vê o próprio private", que depende de
-- comparar profile_id — informação que a RLS não tem sem auth real de
-- jogador. UPDATE/DELETE não têm NENHUMA policy (nem dev_transition)
-- desde a migration 0003 — já são bloqueados por padrão pelo RLS
-- (append-only de fato, não só por convenção), sem trabalho adicional
-- necessário.
-- ---------------------------------------------------------------------
comment on policy table_logs_dev_transition_insert on table_logs is
  'v0.27: BLOQUEADA (depende de autenticação real de jogador). addLog (chat/rolagens) é usada por jogadores anônimos via /ficha — endurecer quebraria essa funcionalidade central, proibida de quebrar pelo checkpoint. Reavaliar quando existir login real de jogador.';
comment on policy table_logs_dev_transition_select on table_logs is
  'v0.27: BLOQUEADA (depende de autenticação real de jogador). listLogsForViewer (v0.20) filtra visibilidade na camada de aplicação, não em RLS — o SELECT precisa continuar aberto para o caso "jogador vê a própria mensagem private", que depende de profile_id (sem equivalente de auth.uid() para jogador). UPDATE/DELETE já não têm nenhuma policy desde a migration 0003 (bloqueados por padrão, append-only de fato) — nada a fazer ali.';

-- ---------------------------------------------------------------------
-- F. characters — DEPENDE DE REFACTOR DE STORAGE (bloqueio documentado)
--
-- character/storage.ts usa getContentClient() (client anon PURO,
-- nunca anexa o JWT do narrador logado) para TODAS as operações,
-- incluindo as que já têm owner_id preenchido (migration 0011,
-- checkpoint v0.23). Criar uma policy owner-scoped usando
-- `owner_id = auth.uid()` não teria efeito algum hoje, porque a
-- própria requisição nunca chega como `authenticated` — sempre chega
-- como `anon`, então essa policy nunca bateria (nem para o dono real).
-- Endurecer esta tabela exige primeiro trocar o client usado em
-- character/storage.ts para getScopedTableClient() (mesmo padrão de
-- table/storage.ts desde a migration 0006) — um refactor de storage,
-- não só de RLS. Fora de escopo deste checkpoint (v0.27 é sobre
-- RLS/dev_transition, não sobre revisitar qual client cada módulo
-- usa).
-- ---------------------------------------------------------------------
comment on policy characters_dev_transition_select on characters is
  'v0.27: BLOQUEADA (depende de refactor de storage). character/storage.ts usa getContentClient() (client anon puro) para tudo, mesmo com owner_id preenchido (migration 0011) — uma policy owner_id=auth.uid() nunca bateria porque a requisição nunca chega autenticada. Endurecer exige trocar para getScopedTableClient() primeiro (refactor de storage, fora de escopo aqui).';
comment on policy characters_dev_transition_insert on characters is
  'v0.27: BLOQUEADA (depende de refactor de storage) — mesmo motivo do select, ver comentário lá.';
comment on policy characters_dev_transition_update on characters is
  'v0.27: BLOQUEADA (depende de refactor de storage) — mesmo motivo do select, ver comentário lá.';
comment on policy characters_dev_transition_delete on characters is
  'v0.27: BLOQUEADA (depende de refactor de storage) — mesmo motivo do select, ver comentário lá.';

commit;
