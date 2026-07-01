-- =====================================================================
-- Ruptura VTT — Ciclo de vida de personagem
-- Migration: 0012_characters_lifecycle
--
-- Checkpoint v0.25. Auditoria do checkpoint anterior (v0.23, migration
-- 0011_characters_campaign_link.sql): confirmado que aquela migration
-- NÃO adicionou nenhuma coluna de ciclo de vida (só campaign_id/
-- profile_id/owner_id) — deliberadamente adiado para agora.
--
-- `characters` já tem uma coluna `status` (texto livre, default
-- 'draft', desde a migration 0002) documentada desde o início como
-- "campo simples de ciclo de vida (ex.: 'draft', 'active',
-- 'archived')" — mas NUNCA foi lida/escrita por nenhuma UI até hoje
-- (grep confirma: zero referências em src/app). Em vez de sobrecarregar
-- essa coluna com um significado novo (arriscando ambiguidade com
-- payloads antigos que a deixaram em 'draft' sem querer dizer nada),
-- esta migration adiciona uma coluna dedicada e inequívoca:
--
--   archived_at timestamptz nullable — null = personagem ativo/vivo;
--   preenchido = arquivado (momento em que foi arquivado). Escolhida
--   em vez de um enum em `status` porque é auto-explicativa (não
--   precisa de uma lista de valores válidos) e porque o pedido do
--   checkpoint aceita explicitamente "characters.status OU archived_at
--   timestamptz nullable".
--
-- NULLABLE, sem valor obrigatório, sem tocar em nenhuma linha
-- existente — todo personagem (incluindo os legados sem mesa) nasce
-- com archived_at = null (ativo), sem quebrar o payload salvo nem a
-- listagem de /dev/character-sheet.
-- =====================================================================

begin;

alter table characters
  add column if not exists archived_at timestamptz;

create index if not exists characters_archived_at_idx on characters (archived_at);

commit;
