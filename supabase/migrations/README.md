# Migrations

Os arquivos daqui são aplicados **executando o SQL direto** no projeto
Supabase (SQL editor, `execute_sql`/`apply_migration` do MCP), um de cada
vez, na ordem da numeração.

**Não use `supabase db push` / `supabase migration up`.** O histórico de
migrations do projeto remoto (`supabase_migrations.schema_migrations`)
nunca acompanhou esta pasta: boa parte dos arquivos não está registrada, e
os que estão usam versão por data (`20260913161151`) em vez do número do
arquivo (`0124`). A CLI trataria quase tudo como pendente e tentaria
reaplicar desde o começo — várias migrations criam tabelas sem
`if not exists` e quebrariam no meio.

Antes de aplicar um arquivo, confira no banco se ele já não foi aplicado
(tabela, função ou policy que ele cria). Ex.: a `0149_vtt_targets.sql` já
estava aplicada quando foi commitada.
