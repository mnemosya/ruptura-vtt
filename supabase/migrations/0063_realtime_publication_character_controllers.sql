-- Auditoria pós-Fase-4 (reestrutura da área de campanha) — habilita
-- Realtime (postgres_changes) para `character_controllers`. Grant/
-- revoke de controle de personagem não toca a linha de `characters`,
-- então o canal já publicado para essa tabela (migration 0018) nunca
-- vê essa mudança: sem isto, "Seus personagens" (Mesa do jogador,
-- MesaClient.tsx) só descobria um personagem recém-atribuído/removido
-- quando a janela recuperava o foco — nunca com a Mesa aberta e em
-- foco a sessão inteira.
--
-- Idempotente: mesmo padrão da migration 0018 (`ALTER PUBLICATION ...
-- ADD TABLE` não aceita `IF NOT EXISTS`, checagem manual contra
-- `pg_publication_tables` dentro de um bloco `DO`).
--
-- Não altera RLS: a policy `character_controllers_select` (migration
-- 0051, `user_id = auth.uid() or is_campaign_owner(campaign_id)`) já
-- restringe o que cada assinante recebe via Realtime — publicação e
-- RLS são ortogonais, publicação só decide que mudanças ENTRAM no
-- fluxo de replicação, RLS decide quem pode LER cada uma.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'character_controllers'
  ) then
    alter publication supabase_realtime add table public.character_controllers;
  end if;
end $$;
