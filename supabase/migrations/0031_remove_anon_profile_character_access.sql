-- =====================================================================
-- Ruptura VTT — remoção completa de acesso anônimo a perfis/personagens
-- e leitura de perfil estritamente auto-escopada (Etapa 12, correção 6)
-- Migration: 0031_remove_anon_profile_character_access
--
-- CONTEXTO (reabertura da correção 5, migration 0030): a correção 5
-- havia NARROWED as policies `*_dev_anon_*`/`*_dev_transition_*` de
-- `campaign_profiles`/`characters` (removendo `authenticated` da lista
-- de papéis, mas mantendo `anon`), com a justificativa de preservar 5
-- funções "dev/legado" (`createCharacter`/`updateCharacter`/
-- `getCharacter`/`listCharacters`/`deleteCharacter`, todas usando
-- `getContentClient()`, client anon puro). Essa justificativa foi
-- rejeitada: "função de desenvolvimento não justifica policy aberta no
-- banco de produção" — preservar `anon` em tabela privada mantém
-- acesso direto possível por qualquer cliente com a chave pública
-- anon, independente de quem chama essas funções hoje.
--
-- AUDITORIA DESTA CORREÇÃO (revalidada função a função, não por nome —
-- ver `src/lib/character/storage.ts`, comentário de seção 3):
--   • `updateCharacter` — NÃO é só dev/legado: chamada por
--     `MesaDetailClient.tsx` (dashboard real do narrador, dano direto),
--     `table/endRound.ts` e `table/endScene.ts` (ambos Server Actions
--     de produto, "Encerrar Rodada"/"Encerrar Cena"). Contexto real:
--     sempre dentro de uma sessão de narrador autenticada (a página
--     `/mesas/[campaignId]/page.tsx` já exige `getCurrentUser()` +
--     ownership antes de renderizar `MesaDetailClient`).
--   • `listCharactersForCampaign` — chamada por
--     `/join/[token]/page.tsx` DEPOIS de exigir `getCurrentUser()` e
--     aceitar o convite (`campaign_members` ativo) — não antes.
--   • `createCharacter`/`getCharacter`/`listCharacters`/
--     `deleteCharacter`/`listLegacyCharactersDev` — confirmadas (só
--     agora, função a função, não por nome/comentário do arquivo) como
--     usadas exclusivamente por `/dev/character-sheet`,
--     `/dev/table`, `/dev/join/[campaignId]` (rotas de diagnóstico) e
--     por scripts que rodam sem login
--     (`scripts/test-character-storage.ts`,
--     `scripts/test-campaign-end-scene.ts`,
--     `scripts/test-campaign-end-round.ts`).
--
-- DECISÃO: TODAS as funções acima foram migradas (no código, antes
-- desta migration) de `getContentClient()` para
-- `getScopedTableClient()`. Consequência aceita e documentada: rotas
-- dev sem login e scripts que rodam fora de um contexto de request
-- deixam de conseguir ler/escrever essas tabelas depois desta
-- migration (RLS nega por padrão sem nenhuma policy de `anon`) — nunca
-- fizeram parte da verificação executável automatizada
-- (`validate-campaign-homebrew.mjs`), que não depende de Supabase real.
--
-- O QUE ESTA MIGRATION FAZ:
--   1. Remove (DROP, não só narrow) todas as policies `anon` de
--      `campaign_profiles` e `characters`.
--   2. Revoga qualquer grant direto de tabela para `anon` nessas duas
--      tabelas (defesa em profundidade além da RLS).
--   3. Reescreve a policy de SELECT `authenticated` de
--      `campaign_profiles`: owner continua vendo todos os perfis da
--      própria campanha; jogador passa a ver SOMENTE o próprio perfil
--      (nunca mais "qualquer membro ativo vê todos os perfis").
--   4. Cria `list_claimable_campaign_profiles(p_campaign_id)` —
--      SECURITY DEFINER, exige auth.uid() + membership ativa, devolve
--      SOMENTE id+nickname dos perfis NÃO reivindicados da mesma
--      campanha (nunca outro user_id, nunca payload completo, nunca
--      dado de outra campanha) — supre a necessidade real de
--      `ClaimProfileClient` sem depender de SELECT amplo.
--   5. `characters` (0030) e as RPCs de reivindicação/sessão de perfil
--      (0028/0029) NÃO são alteradas aqui — auditadas nesta correção e
--      confirmadas como já corretas/independentes da mudança acima (a
--      condição `exists (select 1 from campaign_profiles p where
--      p.id = profile_id and p.user_id = auth.uid())`, usada nas
--      policies de `characters`, continua resolvendo: sob a NOVA
--      policy de SELECT, o próprio jogador ainda pode ler sua própria
--      linha em `campaign_profiles`).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. campaign_profiles — remove policies anon (não narrow: DROP).
-- ---------------------------------------------------------------------
drop policy if exists campaign_profiles_dev_anon_select on campaign_profiles;
drop policy if exists campaign_profiles_dev_anon_insert on campaign_profiles;
drop policy if exists campaign_profiles_dev_anon_update on campaign_profiles;
drop policy if exists campaign_profiles_dev_anon_delete on campaign_profiles;

revoke all on campaign_profiles from anon;

-- SELECT: owner vê tudo da própria campanha; jogador vê SOMENTE o
-- próprio perfil (nunca mais "qualquer membro ativo vê todos").
drop policy if exists campaign_profiles_authenticated_select on campaign_profiles;
create policy campaign_profiles_authenticated_select
  on campaign_profiles
  for select
  to authenticated
  using (is_campaign_owner(campaign_id) or user_id = (select auth.uid()));

-- INSERT/UPDATE/DELETE (0030) — inalteradas: já eram owner-only (insert/
-- delete) ou owner-or-próprio-perfil (update), nenhuma dependia da
-- leitura ampla removida acima.

-- ---------------------------------------------------------------------
-- 2. characters — remove policies anon (não narrow: DROP).
-- ---------------------------------------------------------------------
drop policy if exists characters_dev_transition_select on characters;
drop policy if exists characters_dev_transition_insert on characters;
drop policy if exists characters_dev_transition_update on characters;
drop policy if exists characters_dev_transition_delete on characters;

revoke all on characters from anon;

-- Policies `characters_authenticated_*` (0030) — inalteradas: auditadas
-- nesta correção, continuam corretas (ver nota no cabeçalho).

-- ---------------------------------------------------------------------
-- 3. Listagem mínima de perfis reivindicáveis — supre ClaimProfileClient
--    sem depender de SELECT amplo em campaign_profiles.
-- ---------------------------------------------------------------------
drop function if exists list_claimable_campaign_profiles(uuid);
create function list_claimable_campaign_profiles(p_campaign_id uuid)
returns table(id uuid, nickname text)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if not is_campaign_member(p_campaign_id, auth.uid()) then
    return;
  end if;

  return query
    select p.id, p.nickname
    from campaign_profiles p
    where p.campaign_id = p_campaign_id
      and p.user_id is null
    order by p.nickname;
end;
$$;

revoke all on function list_claimable_campaign_profiles(uuid) from public;
grant execute on function list_claimable_campaign_profiles(uuid) to authenticated;

commit;
