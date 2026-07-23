-- =====================================================================
-- Ruptura VTT — RLS restritiva de perfis e personagens (Etapa 12, correção 5)
-- Migration: 0030_campaign_profile_character_rls
--
-- AUDITORIA DESTA CORREÇÃO (revalidada no código atual, não presumida —
-- matriz completa no checkpoint):
--
--   • `character/storage.ts` tem 4 seções reais, confirmadas por
--     inspeção linha a linha:
--       Seção 1 (produto/narrador) — `getScopedTableClient()`.
--       Seção 2 (jogador) — as 2 RPCs `SECURITY DEFINER` já reforçadas
--         na correção 4 (migration 0029).
--       Seção 3/4 (dev/legado) — `getContentClient()` (ANON PURO,
--         SEMPRE, mesmo com sessão de narrador ativa) — confirmado nas
--         5 funções (`createCharacter`/`updateCharacter`/`getCharacter`/
--         `listCharacters`/`deleteCharacter`), usadas só por
--         `scripts/test-character-storage.ts` e `/dev/character-sheet`
--         (comentário do próprio arquivo confirma).
--   • `table/storage.ts` (campaign_profiles): TODAS as funções de
--     produto (`createCampaignProfile`, `listCampaignProfiles`,
--     `setCampaignProfileLocked`, `setCampaignProfileActiveCharacter`,
--     `enterCampaignProfile`, `heartbeatCampaignProfile`,
--     `leaveCampaignProfile`, `forceReleaseCampaignProfile`) já usam
--     `getScopedTableClient()` — role `authenticated` quando há sessão
--     (narrador OU, desde a correção 2/3, jogador autenticado), role
--     `anon` quando não há (jogador ainda não autenticado, ex.:
--     `/dev/join` legado).
--
-- CONCLUSÃO: como as funções dev/legado usam SEMPRE `getContentClient()`
-- (nunca `authenticated`), restringir a policy `authenticated` das duas
-- tabelas NÃO QUEBRA NENHUM fluxo dev/legado — eles continuam cobertos
-- pela policy `anon` (preservada, só o papel `authenticated` é
-- removido dela). E como TODO acesso de produto (narrador + jogador
-- autenticado) já passa por `getScopedTableClient()`, restringir
-- `authenticated` por ownership real é seguro DESDE QUE as novas
-- policies cubram exatamente os padrões de acesso reais listados acima
-- — verificado helper a helper abaixo.
--
-- DECISÃO SOBRE LEITURA DE PERFIS (desvio documentado do pedido
-- original): `campaign_profiles` não guarda nenhum segredo (o segredo
-- real de sessão é `session_token_hash`, em `profile_sessions`, tabela
-- separada, não tocada aqui). A tela de reivindicação de perfil
-- (`ClaimProfileClient`, correção 3) precisa listar TODOS os perfis da
-- campanha (inclusive os de outros jogadores, para marcá-los como
-- indisponíveis) ANTES do usuário reivindicar qualquer um — portanto a
-- policy de SELECT para `authenticated` é "qualquer membro ATIVO da
-- própria campanha", não "só o próprio perfil". Sem isso, a UI de
-- reivindicação já entregue quebraria. Nenhuma coluna sensível é
-- exposta por essa leitura mais ampla.
--
-- profile_sessions NÃO é alterada nesta migration — não é o mecanismo
-- de autoridade (a correção 4 já fechou a lacuna real, dentro das 2
-- RPCs); esta migration trata do isolamento de TABELA para acesso
-- direto fora da aplicação.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Helpers corrigidos — CREATE OR REPLACE, mesma assinatura.
--    can_read_character/can_manage_character (0028) checavam
--    `profile.user_id = auth.uid()` sem confirmar que a membership
--    ainda está ACTIVE — um jogador `removed` que já tinha reivindicado
--    um perfil continuaria passando. Corrigido: agora exige
--    is_campaign_member() (que já checa status='active') também.
-- ---------------------------------------------------------------------
create or replace function can_read_character(p_character_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from characters c
    left join campaign_profiles p on p.id = c.profile_id
    where c.id = p_character_id
      and (
        (c.campaign_id is not null and is_campaign_owner(c.campaign_id, check_user_id))
        or (c.owner_id = check_user_id)
        or (
          p.user_id is not null
          and p.user_id = check_user_id
          and c.campaign_id is not null
          and is_campaign_member(c.campaign_id, check_user_id)
        )
      )
  );
$$;

create or replace function can_manage_character(p_character_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select can_read_character(p_character_id, check_user_id);
$$;

-- can_access_campaign_profile (0028) já checa is_campaign_owner OU
-- p.user_id = check_user_id — mas não confirmava membership ACTIVE
-- para o segundo caso. Corrigido pelo mesmo motivo acima.
create or replace function can_access_campaign_profile(p_profile_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from campaign_profiles p
    where p.id = p_profile_id
      and (
        is_campaign_owner(p.campaign_id, check_user_id)
        or (p.user_id = check_user_id and is_campaign_member(p.campaign_id, check_user_id))
      )
  );
$$;

-- can_manage_campaign_profile (0028) já era owner-only — mantida.

-- ---------------------------------------------------------------------
-- 2. campaign_profiles — narrow das policies antigas (só `anon` fica),
--    novas policies restritivas para `authenticated`.
-- ---------------------------------------------------------------------
drop policy if exists campaign_profiles_dev_anon_select on campaign_profiles;
create policy campaign_profiles_dev_anon_select
  on campaign_profiles
  for select
  to anon
  using (true);

drop policy if exists campaign_profiles_dev_anon_insert on campaign_profiles;
create policy campaign_profiles_dev_anon_insert
  on campaign_profiles
  for insert
  to anon
  with check (true);

drop policy if exists campaign_profiles_dev_anon_update on campaign_profiles;
create policy campaign_profiles_dev_anon_update
  on campaign_profiles
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists campaign_profiles_dev_anon_delete on campaign_profiles;
create policy campaign_profiles_dev_anon_delete
  on campaign_profiles
  for delete
  to anon
  using (true);

-- Já existiam desde 0006/0007 como policies aditivas para authenticated
-- (nome antigo `campaign_profiles_owner_all`, migration 0006/0007) —
-- removida/substituída aqui por um conjunto explícito e completo.
drop policy if exists campaign_profiles_owner_all on campaign_profiles;

-- SELECT: owner vê tudo da própria campanha; qualquer MEMBRO ATIVO vê
-- todos os perfis da própria campanha (ver nota de decisão no
-- cabeçalho — necessário para a tela de reivindicação).
drop policy if exists campaign_profiles_authenticated_select on campaign_profiles;
create policy campaign_profiles_authenticated_select
  on campaign_profiles
  for select
  to authenticated
  using (is_campaign_owner(campaign_id) or is_campaign_member(campaign_id));

-- INSERT: só owner por caminho direto — jogador cria/reivindica perfil
-- só pela RPC `create_and_claim_campaign_profile` (SECURITY DEFINER,
-- bypassa RLS como dono da função).
drop policy if exists campaign_profiles_authenticated_insert on campaign_profiles;
create policy campaign_profiles_authenticated_insert
  on campaign_profiles
  for insert
  to authenticated
  with check (is_campaign_owner(campaign_id));

-- UPDATE: owner administra qualquer perfil da própria campanha; o
-- próprio jogador atualiza seu perfil reivindicado (heartbeat/lock/
-- active_character — as funções reais que chamam isso).
-- Limitação aceita: RLS de linha não impede o próprio jogador de
-- também escrever `nickname`/`color_label` (não há enforcement de
-- coluna sem trigger dedicado) — aceitável, sem dado sensível em jogo.
drop policy if exists campaign_profiles_authenticated_update on campaign_profiles;
create policy campaign_profiles_authenticated_update
  on campaign_profiles
  for update
  to authenticated
  using (can_access_campaign_profile(id))
  with check (is_campaign_owner(campaign_id) or user_id = (select auth.uid()));

-- DELETE: só owner (a aplicação não expõe exclusão de perfil ao
-- jogador em nenhum fluxo real).
drop policy if exists campaign_profiles_authenticated_delete on campaign_profiles;
create policy campaign_profiles_authenticated_delete
  on campaign_profiles
  for delete
  to authenticated
  using (is_campaign_owner(campaign_id));

-- ---------------------------------------------------------------------
-- 3. characters — mesmo padrão.
-- ---------------------------------------------------------------------
drop policy if exists characters_dev_transition_select on characters;
create policy characters_dev_transition_select
  on characters
  for select
  to anon
  using (true);

drop policy if exists characters_dev_transition_insert on characters;
create policy characters_dev_transition_insert
  on characters
  for insert
  to anon
  with check (true);

drop policy if exists characters_dev_transition_update on characters;
create policy characters_dev_transition_update
  on characters
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists characters_dev_transition_delete on characters;
create policy characters_dev_transition_delete
  on characters
  for delete
  to anon
  using (true);

-- Policies aditivas antigas (owner-scoped, migration 0014) — substituídas
-- por um conjunto explícito que também cobre o jogador.
drop policy if exists characters_owner_select on characters;
drop policy if exists characters_owner_insert on characters;
drop policy if exists characters_owner_update on characters;
drop policy if exists characters_owner_delete on characters;

-- SELECT: owner de campanha; dono via owner_id (legado/dev autenticado);
-- jogador para os personagens do próprio perfil reivindicado.
drop policy if exists characters_authenticated_select on characters;
create policy characters_authenticated_select
  on characters
  for select
  to authenticated
  using (
    (campaign_id is not null and is_campaign_owner(campaign_id))
    or owner_id = (select auth.uid())
    or (
      profile_id is not null
      and campaign_id is not null
      and is_campaign_member(campaign_id)
      and exists (select 1 from campaign_profiles p where p.id = profile_id and p.user_id = (select auth.uid()))
    )
  );

-- INSERT: owner cria para a própria campanha; jogador só pode criar
-- vinculado ao PRÓPRIO perfil (nunca perfil alheio).
drop policy if exists characters_authenticated_insert on characters;
create policy characters_authenticated_insert
  on characters
  for insert
  to authenticated
  with check (
    (campaign_id is not null and is_campaign_owner(campaign_id))
    or owner_id = (select auth.uid())
    or (
      profile_id is not null
      and exists (select 1 from campaign_profiles p where p.id = profile_id and p.user_id = (select auth.uid()))
    )
  );

-- UPDATE: mesma regra de leitura reaplicada (owner administra tudo da
-- campanha; jogador só o personagem do próprio perfil).
drop policy if exists characters_authenticated_update on characters;
create policy characters_authenticated_update
  on characters
  for update
  to authenticated
  using (can_manage_character(id))
  with check (
    (campaign_id is not null and is_campaign_owner(campaign_id))
    or owner_id = (select auth.uid())
    or (
      profile_id is not null
      and exists (select 1 from campaign_profiles p where p.id = profile_id and p.user_id = (select auth.uid()))
    )
  );

-- DELETE: só owner (jogador nunca apaga personagem por acesso genérico).
drop policy if exists characters_authenticated_delete on characters;
create policy characters_authenticated_delete
  on characters
  for delete
  to authenticated
  using (campaign_id is not null and is_campaign_owner(campaign_id));

commit;
