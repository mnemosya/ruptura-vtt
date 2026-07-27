-- =====================================================================
-- Ruptura VTT — idempotência da criação de personagem pelo jogador
-- Migration: 0041_character_creation_idempotency
--
-- Achado da rodada de fechamento (Fase 2 — concorrência/idempotência da
-- criação): `createCharacterFromWizard` (src/lib/character/storage.ts)
-- faz um único INSERT em `characters` (o payload inteiro — atributos,
-- carteira, inventário, magias, talentos — vive numa coluna jsonb só,
-- então cada conclusão do wizard já é atômica por natureza: nunca gera
-- personagem PARCIAL). O gap real era outro: nada impedia dois cliques
-- quase simultâneos (ou um retry de rede após sucesso) de inserirem
-- DUAS linhas para o MESMO perfil na MESMA mesa — dois personagens
-- "órfãos" disputando o mesmo `campaign_profiles.active_character_id`,
-- exatamente o "Personagem duplicado" já registrado como pendência
-- conhecida em CHECKPOINT_CRIACAO_AUTONOMA_JOGADOR.md.
--
-- Correção: índice único parcial — um perfil só pode ter UM personagem
-- NÃO ARQUIVADO por mesa. Arquivar (archived_at, já o mecanismo real de
-- "aposentar" um personagem, migration 0012) libera a criação de um
-- novo pelo mesmo perfil, sem mudar nenhuma regra de produto nova. A
-- segunda inserção concorrente recebe unique_violation — erro
-- controlado, nunca um segundo personagem ativo silencioso.
-- =====================================================================

begin;

create unique index if not exists characters_one_active_per_profile_campaign_uidx
  on characters (profile_id, campaign_id)
  where profile_id is not null and campaign_id is not null and archived_at is null;

commit;
