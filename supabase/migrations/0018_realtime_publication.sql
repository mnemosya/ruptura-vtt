-- Checkpoint v0.46.1 — Habilita Realtime (postgres_changes) para as
-- tabelas já assinadas pelo client de browser desde o v0.46
-- (`src/lib/realtime/tableRealtime.ts`): characters, campaigns,
-- table_logs. Sem isso, o client conecta ao canal com sucesso mas
-- nunca recebe eventos, porque a tabela não está na publicação
-- `supabase_realtime` (confirmado via pg_publication_tables no
-- relatório do v0.46).
--
-- Idempotente: `ALTER PUBLICATION ... ADD TABLE` não aceita
-- `IF NOT EXISTS` (só `CREATE PUBLICATION ... FOR TABLE` aceita), então
-- a checagem de idempotência é feita manualmente contra
-- `pg_publication_tables` dentro de um bloco `DO` — rodar esta
-- migration mais de uma vez, ou contra um banco onde alguma tabela já
-- foi adicionada manualmente pelo painel, não falha nem duplica.
--
-- Não altera RLS, auth, nem schema de tabelas — só a lista de tabelas
-- publicadas para Realtime (WAL logical replication), que é ortogonal
-- a RLS: policies continuam controlando o que cada client PODE ler
-- via subscribe, Realtime só decide que MUDANÇAS são replicadas.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'characters'
  ) then
    alter publication supabase_realtime add table public.characters;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'campaigns'
  ) then
    alter publication supabase_realtime add table public.campaigns;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'table_logs'
  ) then
    alter publication supabase_realtime add table public.table_logs;
  end if;
end $$;
