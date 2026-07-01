-- =====================================================================
-- Ruptura VTT — Personagem ligado à mesa/perfil
-- Migration: 0011_characters_campaign_link
--
-- Checkpoint v0.23. Para de tratar `characters` como lista global solta:
-- adiciona vínculo opcional a mesa (campaign_id), perfil
-- (profile_id) e dono (owner_id, narrador logado).
--
-- TODOS os campos são NULLABLE — personagens antigos/legados (criados
-- antes deste checkpoint, ou pela ficha dev sem contexto de mesa)
-- continuam existindo e visíveis em /dev/character-sheet sem quebrar.
-- Nenhum dado é apagado ou migrado agressivamente; nenhum personagem
-- existente é tocado por esta migration (só o schema muda).
--
-- FKs usam `on delete set null` (não cascade): apagar uma mesa, perfil
-- ou usuário NÃO apaga o personagem — ele só perde o vínculo, virando
-- "legado" de novo. Isso evita perda de dados de jogador por uma ação
-- em outra entidade.
--
-- RLS: characters já está em `characters_dev_transition_*` (aberta a
-- anon+authenticated) desde o checkpoint v0.17 — esta migration NÃO
-- mexe em RLS (fora de escopo do v0.23; ver v0.27 para avaliação de
-- endurecimento).
-- =====================================================================

begin;

alter table characters
  add column if not exists campaign_id uuid references campaigns(id) on delete set null,
  add column if not exists profile_id uuid references campaign_profiles(id) on delete set null,
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

create index if not exists characters_campaign_id_idx on characters (campaign_id);
create index if not exists characters_profile_id_idx on characters (profile_id);
create index if not exists characters_owner_id_idx on characters (owner_id);

commit;
