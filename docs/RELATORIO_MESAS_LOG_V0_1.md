# Relatório — Base mínima de Mesa e Log persistente (v0.1)

Checkpoint da Fase 0 do PRD: estado compartilhado mínimo (`campaigns`) e log
persistente de mesa (`table_logs`), com rolagens públicas/privadas/GM já
modeladas via `visibility`. Sem autenticação, sem realtime, sem conectar a
ficha mínima a este log ainda.

## 1. Arquivos criados

**Migration:**
- `supabase/migrations/0003_campaigns_table_logs.sql` — tabelas `campaigns`
  e `table_logs` + RLS de desenvolvimento.

**Camada de dados (`src/lib/table/`):**
- `types.ts` — `Campaign`, `TableLogVisibility`, `TableLogEntry`.
- `storage.ts` — Server Actions: `createCampaign`, `listCampaigns`,
  `addLog`, `listLogs`.
- `storage.errors.ts` — `TableStorageError` (classe separada, mesmo motivo
  de `character/storage.errors.ts`: módulos `"use server"` só exportam
  funções assíncronas).
- `index.ts` — reexporta `types.ts` (não reexporta `storage.ts` — mesmo
  padrão de `src/lib/character`, consumidores importam Server Actions
  diretamente do arquivo).

**Rota dev (`src/app/dev/table/`):**
- `page.tsx` — Server Component, busca a lista inicial de mesas.
- `TableClient.tsx` — Client Component: criar mesa, selecionar mesa, ver
  logs, adicionar mensagem de teste.

**Este relatório:**
- `docs/RELATORIO_MESAS_LOG_V0_1.md`.

## 2. SQL aplicado

Aplicado via conexão direta Postgres (`SUPABASE_DB_URL`), mesmo padrão das
migrations 0001/0002 (idempotente — `create table if not exists`, `drop
policy if exists` + `create policy`).

```sql
create table if not exists campaigns (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists table_logs (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  character_id uuid references characters(id) on delete set null,
  type         text not null,
  visibility   text not null check (visibility in ('public', 'private', 'gm')),
  payload      jsonb not null,
  created_at   timestamptz not null default now()
);
```

Triggers/índices: `campaigns_set_updated_at` (reusa `set_updated_at()` da
migration 0001); índices em `campaigns(updated_at desc)`,
`table_logs(campaign_id)` e `table_logs(campaign_id, created_at desc)`.

Verificado após aplicar (consulta a `information_schema.tables` e
`pg_policies`):

```
Tabelas: [ 'campaigns', 'table_logs' ]
Policies:
 - campaigns campaigns_dev_anon_delete DELETE {anon,authenticated}
 - campaigns campaigns_dev_anon_insert INSERT {anon,authenticated}
 - campaigns campaigns_dev_anon_select SELECT {anon,authenticated}
 - campaigns campaigns_dev_anon_update UPDATE {anon,authenticated}
 - table_logs table_logs_dev_anon_insert INSERT {anon,authenticated}
 - table_logs table_logs_dev_anon_select SELECT {anon,authenticated}
```

## 3. Policies criadas (RLS) — TEMPORÁRIAS, sem autenticação

- **`campaigns`**: CRUD completo (select/insert/update/delete) para
  `anon`/`authenticated` — mesmo padrão já usado em `characters`
  (migration 0002), necessário para criar/listar/renomear mesas nesta fase
  de dev.
- **`table_logs`**: só **select** e **insert** — sem update/delete. Log
  é conceitualmente append-only; essa restrição já é mais cuidadosa que
  `characters` por design (não depende de autenticação para existir).

### Riscos documentados (mesmo princípio do checkpoint v0.2 da ficha, mais os específicos de mesa compartilhada)

- Qualquer pessoa com a anon key (pública, embutida no bundle do frontend)
  pode ler/criar/editar/apagar **qualquer** mesa de **qualquer** "dono" —
  sem isolamento por usuário.
- Qualquer pessoa com a anon key pode ler e inserir em `table_logs` de
  **qualquer** mesa, **incluindo** entradas marcadas `visibility='private'`
  ou `'gm'`. **`visibility` hoje é só um campo de dados** — não há filtro de
  RLS por visibilidade, porque isso depende de saber "quem" está pedindo
  (autenticação), que ainda não existe. Ou seja: nada aqui é realmente
  privado ainda, apesar do nome da coluna.
- Sem rate limit: nada impede flood de entradas de log.
- TODO explícito na migration (bloqueante para produção): adicionar
  dono/membros em `campaigns` via FK para usuários do Supabase Auth; filtrar
  `SELECT` de `table_logs` por `visibility` usando `auth.uid()`; restringir
  escrita de `campaigns` ao dono.

## 4. Camada server (`src/lib/table/storage.ts`)

| Função | O que faz |
|---|---|
| `createCampaign(name)` | Insere uma mesa nova (nome vazio vira `"Mesa sem nome"`). |
| `listCampaigns()` | Lista mesas, mais recentemente atualizadas primeiro. |
| `addLog({ campaignId, characterId?, type, visibility, payload })` | Insere uma entrada de log (append-only). |
| `listLogs(campaignId)` | Lista os logs de uma mesa, mais recentes primeiro. |

Todas usam `getContentClient()` (mesmo cliente Supabase com anon key já
usado pela Biblioteca do Sistema e pela ficha) e lançam `TableStorageError`
em caso de falha, preservando o erro original em `cause`.

## 5. Rota `/dev/table`

`http://localhost:3000/dev/table` — página de debug, sem design definitivo
(mesmo espírito de `/dev/character-sheet`). Permite:

- **Criar mesa**: campo de nome + botão "Criar mesa" — a mesa criada já é
  selecionada automaticamente.
- **Selecionar mesa**: lista de mesas com botão "Selecionar"/"Selecionada".
- **Ver logs persistidos**: lista de entradas da mesa selecionada (horário,
  visibilidade, tipo, conteúdo).
- **Adicionar mensagem de teste**: campo de texto + seletor de visibilidade
  (Pública/Privada/Mestre) + botão "Adicionar ao log" — grava via `addLog`
  com `type: "chat"`.

## 6. Resultado do build e do `test:character-storage`

```
$ npm run build
✓ Compiled successfully in 2.4s
  Running TypeScript ...
  Finished TypeScript in 2.3s ...
✓ Generating static pages using 5 workers (2/2) in 286ms

Route (app)
┌ ○ /_not-found
├ ƒ /dev/character-sheet
└ ƒ /dev/table
```

```
$ npm run test:character-storage
=== test-character-storage ===
1. Criado: id=81ba6cb9-1582-441f-ae6b-715956f95c07, schema_version=1
2. Carregado por id: nome="__TESTE_STORAGE_RUPTURA__"
3. Atualizado: nome="__TESTE_STORAGE_RUPTURA___editado", corpo=4
4. Encontrado na listagem (2 personagens no total).
5. Apagado e confirmado ausente via getCharacter.
6. Confirmado: nenhum registro de teste residual.
=== test-character-storage: TODOS OS PASSOS PASSARAM ===
```

Ambos passaram sem erros — confirma que a nova rota/tabela não quebrou a
ficha mínima nem a camada de storage de personagem.

## 7. Resultado do teste manual (browser, via preview tools)

1. Abri `/dev/table` — página carregou com "MESAS (0)", nenhuma mesa ainda.
2. Criei a mesa "Mesa Teste Fase 0" — apareceu em "MESAS (1)", já
   selecionada automaticamente.
3. Adicionei a mensagem de teste "Olá, mesa!" (visibilidade Pública) —
   apareceu em "LOG DA MESA (1)" com horário, `[Pública]`, `chat:` e o
   texto.
4. **Recarreguei a página inteira** (`window.location.reload()`).
5. A mesa "Mesa Teste Fase 0" reapareceu na lista (carregada do servidor,
   não de estado local) — confirma persistência da mesa.
6. Selecionei a mesa novamente — o log "Olá, mesa!" voltou idêntico
   (mesmo horário, mesma visibilidade, mesmo conteúdo) — **confirma
   persistência real no Supabase**, não estado de UI.

Resultado: **todos os passos do teste manual passaram**.

## 8. Confirmação de escopo

- **Autenticação**: não implementada — RLS continua na política temporária
  de desenvolvimento (ver seção 3).
- **Realtime**: não implementado — sem Supabase Realtime, sem WebSocket,
  sem atualização automática entre abas/usuários.
- **Ficha ↔ log persistente**: **não conectados** — `/dev/character-sheet`
  continua usando só o Log local em memória (checkpoint v0.12); nenhuma
  chamada a `src/lib/table` foi adicionada lá nesta etapa.
- **Biblioteca do Sistema** (`content_packs`, `content_documents`,
  `src/lib/content`): não alterada.
- **`characters`** (migration 0002): não alterada além de uma FK opcional
  nova em `table_logs.character_id` (`on delete set null`) — não muda nada
  na tabela `characters` em si.
- Nenhuma chave secreta exposta: nenhum valor de `.env.local` foi impresso
  em nenhum momento; `storage.ts` usa exclusivamente a anon key (mesmo
  `getContentClient()` da ficha), nunca a service role key; o script
  auxiliar usado para aplicar a migration via `SUPABASE_DB_URL`
  (`scripts/_tmp_apply_0003.ts`) foi criado e removido na mesma sessão,
  nunca commitado.
