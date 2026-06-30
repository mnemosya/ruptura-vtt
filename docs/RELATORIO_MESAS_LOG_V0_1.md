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

---

# Checkpoint v0.2 — Ficha conectada ao Log persistente

Conecta `/dev/character-sheet` ao log persistente de `/dev/table`: a aba
Geral ganhou um seletor de mesa, e a aba Rolagens passou a gravar cada
rolagem (perícia ou expressão) em `table_logs` quando há mesa selecionada —
mantendo o Log local intacto.

## 1. Arquivos alterados

- `src/app/dev/character-sheet/page.tsx` — busca a lista inicial de mesas
  via `listCampaigns()` (de `src/lib/table/storage`) e passa como
  `mesasIniciais` para `CharacterSheetClient`.
- `src/app/dev/character-sheet/CharacterSheetClient.tsx` — novo estado
  `selectedCampaignId` (UI local, não persiste no payload do personagem);
  `mesas` guarda a lista recebida do server; ambos passados para
  `GeneralTab` (seleção) e `RollsTab` (gravação + `characterId`/
  `character.nome`, usados no payload do log).
- `src/app/dev/character-sheet/components/GeneralTab.tsx` — novo `<select>`
  "Mesa" (`data-testid="mesa-select"`), com opção "Nenhuma mesa (só log
  local)" como padrão.
- `src/app/dev/character-sheet/components/RollsTab.tsx` — novo estado
  `visibilidade` (padrão `"public"`) e `persistError`; nova função
  `persistirNaMesa(tipo, payload)` chamada ao final de
  `handleRolarPericia`/`handleRolarExpressao` (agora `async`), só quando
  `campaignId` está presente; nova seção "Mesa" no topo da aba com o
  seletor de visibilidade e o erro discreto de persistência, quando houver.
- `docs/RELATORIO_MESAS_LOG_V0_1.md` — esta seção.

Nenhuma mudança em `storage.ts` (nem de personagem, nem de mesa), banco,
migrations ou `src/lib/content` (Biblioteca do Sistema).

## 2. Seleção de mesa

Vive na aba Geral, ao lado do nome/Modo Jogo-Evolução — é estado de sessão,
não de payload. `CharacterSheetClient` busca a lista de mesas uma vez (na
carga da página, via Server Component) e mantém em estado local; não há
botão de "criar mesa" na ficha — isso continua sendo responsabilidade de
`/dev/table`, a ficha só **seleciona** uma mesa já existente.

## 3. O que acontece numa rolagem com mesa selecionada

Para rolagem de perícia (`handleRolarPericia`) e de expressão
(`handleRolarExpressao`), nesta ordem:

1. Calcula o resultado (mesma lógica de sempre, `rollPericia`/
   `rollExpression` — **não mudou**).
2. Adiciona ao histórico local da Dice Tray (`pushHistorico`) — igual a
   antes.
3. Registra no **Log local** via `onLog(...)` — igual a antes, **não foi
   removido**.
4. Se `campaignId` estiver definido, chama `persistirNaMesa(tipo, payload)`,
   que chama `addLog()` (Server Action de `src/lib/table/storage.ts`) com a
   visibilidade selecionada. Se não houver mesa selecionada, este passo é
   pulado silenciosamente (`if (!campaignId) return;`).

## 4. Payload gravado em `table_logs`

**Rolagem de perícia** (`type: "rolagem_pericia"`):

```json
{
  "characterId": "<uuid ou null>",
  "characterNome": "Heroi Conectado",
  "atributo": "Corpo",
  "atributoValor": 1,
  "pericia": null,
  "periciaValor": 0,
  "modificador": 0,
  "dados": [4],
  "maiorDado": 4,
  "total": 4,
  "cd": null,
  "sucesso": null,
  "margem": null,
  "classificacaoMargem": null,
  "origem": null
}
```

**Rolagem de expressão** (`type: "rolagem_expressao"`):

```json
{
  "characterId": "<uuid ou null>",
  "characterNome": "Heroi Conectado",
  "expressao": "2d6+1",
  "dados": [{ "sides": 6, "value": 6, "sign": 1 }, { "sides": 6, "value": 4, "sign": 1 }],
  "modificador": 1,
  "total": 11
}
```

Campos ausentes na rolagem (sem CD, sem perícia) vão como `null` no
payload, não são omitidos — mantém o formato previsível para quem for ler
depois.

## 5. Visibilidade

Seletor "Visibilidade no log da mesa" com as 3 opções pedidas — Pública,
Privada, Narrador — mapeadas para os valores reais da coluna
(`public`/`private`/`gm`, definidos na migration 0003). **Padrão: Pública**,
conforme pedido. O seletor fica desabilitado (visualmente e via `disabled`)
quando não há mesa selecionada, já que não há onde persistir.

**Reforço do aviso já documentado na migration 0003**: a visibilidade
escolhida aqui é só um **campo de dados** — não há filtro de RLS por
visibilidade nesta etapa (depende de autenticação, que não existe ainda).
Marcar uma rolagem como "Privada" ou "Narrador" não impede ninguém com a
anon key de lê-la em `/dev/table`.

## 6. Erro discreto de gravação

Se `addLog()` falhar (mesa apagada entretanto, problema de rede, etc.), a
UI mostra uma linha discreta (`data-testid="roll-persist-erro"`, vermelho,
fonte pequena) logo abaixo do seletor de visibilidade: "Não foi possível
gravar no log persistente da mesa: \<mensagem\>". A rolagem em si e o Log
local **não são afetados** — eles já aconteceram antes dessa chamada.

## 7. Resultado do build e do `test:character-storage`

```
$ npm run build
✓ Compiled successfully in 1588ms
  Running TypeScript ...
  Finished TypeScript in 3.0s ...
✓ Generating static pages using 5 workers (2/2) in 310ms

Route (app)
┌ ○ /_not-found
├ ƒ /dev/character-sheet
└ ƒ /dev/table
```

```
$ npm run test:character-storage
=== test-character-storage ===
1. Criado: id=632c8dcd-8e64-4d1f-b01b-bce8026528df, schema_version=1
2. Carregado por id: nome="__TESTE_STORAGE_RUPTURA__"
3. Atualizado: nome="__TESTE_STORAGE_RUPTURA___editado", corpo=4
4. Encontrado na listagem (2 personagens no total).
5. Apagado e confirmado ausente via getCharacter.
6. Confirmado: nenhum registro de teste residual.
=== test-character-storage: TODOS OS PASSOS PASSARAM ===
```

Ambos passaram sem erros.

## 8. Resultado do teste manual (browser, via preview tools)

1. Abri `/dev/character-sheet`, novo personagem, nome "Heroi Conectado".
2. Aba Geral → seletor "Mesa" já mostrava "Mesa Teste Fase 0" (criada no
   checkpoint v0.1) — selecionei.
3. Aba Rolagens → seção "Mesa" confirmou "Mesa selecionada..." e
   visibilidade padrão "Pública".
4. Rolei uma perícia (Corpo, sem perícia selecionada) — nenhum erro de
   persistência (`roll-persist-erro` ausente).
5. Rolei a expressão `2d6+1` — idem, sem erro.
6. Conferi a aba Log (local) — as 2 rolagens apareceram normalmente,
   confirmando que **o Log local não foi removido**.
7. Naveguei para `/dev/table`, selecionei "Mesa Teste Fase 0" — **3 entradas**
   no log da mesa: a mensagem de teste do checkpoint v0.1 + as 2 rolagens
   novas, com payload completo (`characterNome: "Heroi Conectado"`,
   atributo, dados, total, modificador, expressão) e `[Pública]` —
   confirmando persistência real no Supabase.

Resultado: **todos os passos do teste manual passaram**.

## 9. Confirmação de escopo

- **Realtime**: não implementado.
- **Autenticação**: não implementada.
- **Chat completo**: não implementado — `/dev/table` continua sendo só
  visualização de log + mensagem de teste manual, sem interface de
  conversa.
- **Banco/migrations**: nenhuma alteração — reusa as tabelas/policies da
  migration 0003 tal como estavam.
- **Biblioteca do Sistema** (`src/lib/content`): não alterada.
- Nenhuma chave secreta exposta.

---

# Checkpoint v0.3 — Console mínimo de mesa

Melhora a apresentação de `/dev/table` sem alterar banco/migrations nem a
camada de storage: renderização das entradas de log como cartões legíveis
(chat e rolagens), botão "Atualizar logs" e clareza no formulário de
mensagem manual. Nenhuma tabela, policy ou Server Action nova.

## 1. Arquivos alterados

- `src/app/dev/table/TableClient.tsx` — único arquivo alterado:
  - novo mapa `ENTRY_KIND_LABELS` (`chat` → "Mensagem",
    `rolagem_pericia` → "Rolagem de Perícia", `rolagem_expressao` →
    "Rolagem de Expressão") e helpers `entryKindLabel()`/`entryIcon()`
    (`💬` para chat, `🎲` para rolagens, `•` para qualquer outro tipo
    futuro);
  - `formatRolagem()` (já existente desde o commit `4834169`) **mantida
    sem nenhuma mudança de comportamento**;
  - nova função `handleRefreshLogs()` — recarrega `listLogs(campaignId)`
    sem precisar reselecionar a mesa;
  - novo botão "Atualizar logs" (`data-testid="atualizar-logs-button"`),
    ao lado do título "Log da mesa (N)";
  - cada entrada do log passou de uma linha (`flex` horizontal) para um
    cartão (`flex-direction: column`), com cabeçalho (ícone + tipo
    legível + visibilidade + horário) e o conteúdo formatado abaixo;
    borda lateral colorida (`#4f8cff` para chat, `#ffb84f` para
    rolagens) para diferenciar tipos rapidamente;
  - formulário de mensagem manual renomeado de "Adicionar mensagem de
    teste" para "Enviar mensagem", botão "Adicionar ao log" → "Enviar"
    (mesmos `data-testid`, comportamento idêntico — só rótulos).

Nenhuma mudança em `src/lib/table/storage.ts`, `src/lib/table/types.ts`,
banco, migrations, `src/app/dev/character-sheet` (ficha) ou
`src/lib/content` (Biblioteca do Sistema).

## 2. Tipos reais confirmados em `table_logs.type` antes da implementação

Conferido em `src/lib/table/types.ts` (campo livre, `type: string`) e nos
dois pontos reais de escrita:

- `"chat"` — gravado por `TableClient.handleAddLog()` (mensagem manual).
- `"rolagem_pericia"` / `"rolagem_expressao"` — gravados por
  `RollsTab.persistirNaMesa()` (`src/app/dev/character-sheet/components/
  RollsTab.tsx`), valores literais do tipo
  `"rolagem_pericia" | "rolagem_expressao"` passado para `onLog`.

`ENTRY_KIND_LABELS` cobre exatamente esses três; qualquer `type` futuro
não mapeado cai no fallback (`entryKindLabel` retorna o próprio `type`,
`entryIcon` retorna `"•"`), sem quebrar a renderização.

## 3. Botão "Atualizar logs"

- Reusa a mesma Server Action `listLogs(campaignId)` já usada por
  `handleSelectMesa` — não foi criada nenhuma função de storage nova.
- Mostra o mesmo indicador "Carregando…" (`loadingLogs`) usado ao
  selecionar uma mesa.
- Erros de rede/Supabase aparecem na mesma área de erro já existente no
  topo da página (`errorMessage`).

## 4. Campo de mensagem manual + visibilidade

Comportamento idêntico ao já existente desde o checkpoint v0.1 — só
rótulos mais claros ("Enviar mensagem" / "Enviar"). Continua usando o
mesmo `<select>` com as 3 opções de `TABLE_LOG_VISIBILITIES`
(`public`/`private`/`gm`) e gravando via `addLog({ type: "chat", ... })`.
**Reforço do aviso já documentado**: `visibility` continua sendo só um
campo de dados — sem filtro de RLS (ver migration 0003).

## 5. Renderização em cartões — chat vs. rolagens

Cada entrada de `logs` agora é um cartão com:

1. Cabeçalho: ícone (`💬`/`🎲`/`•`) + label legível do tipo + visibilidade
   entre colchetes + horário (`toLocaleString("pt-BR")`), alinhado à
   direita.
2. Conteúdo: para `chat`, o texto da mensagem
   (`entry.payload.mensagem`); para `rolagem_pericia`/
   `rolagem_expressao`, `formatRolagem(entry.payload)` — **a mesma
   função e o mesmo formato já validados no commit `4834169`**, sem
   nenhuma alteração de lógica; para qualquer outro `type`,
   `JSON.stringify(entry.payload)` (fallback inalterado).

## 6. Resultado do build e do `test:character-storage`

```
$ npm run build
✓ Compiled successfully in 1760ms
  Running TypeScript ...
  Finished TypeScript in 2.4s ...
✓ Generating static pages using 5 workers (2/2) in 253ms

Route (app)
┌ ○ /_not-found
├ ƒ /dev/character-sheet
└ ƒ /dev/table
```

```
$ npm run test:character-storage
=== test-character-storage ===
1. Criado: id=f3d8e76c-b5f3-4da7-95d0-9e0c0a81c8f1, schema_version=1
2. Carregado por id: nome="__TESTE_STORAGE_RUPTURA__"
3. Atualizado: nome="__TESTE_STORAGE_RUPTURA___editado", corpo=4
4. Encontrado na listagem (2 personagens no total).
5. Apagado e confirmado ausente via getCharacter.
6. Confirmado: nenhum registro de teste residual.
=== test-character-storage: TODOS OS PASSOS PASSARAM ===
```

Ambos passaram sem erros — confirma que a mudança puramente de UI não
afetou a camada de storage de personagem.

## 7. Resultado do teste manual (browser, via preview tools)

1. Abri `/dev/table`, mesa "Mesa Teste Fase 0" já existente (de
   checkpoints anteriores) selecionada.
2. Enviei a mensagem "Mensagem manual de teste do console" (visibilidade
   Pública, padrão) via "Enviar".
3. Confirmado: apareceu como cartão com cabeçalho `💬 Mensagem [Pública]`
   + horário, conteúdo "Mensagem manual de teste do console".
4. Confirmado: as rolagens já existentes (de checkpoints anteriores —
   "Heroi Conectado: Corpo (sem perícia) = 4", "Heroi Conectado: 2d6+1 =
   11", "Novo Personagem: Mente + Arcanismo = 6") renderizaram como
   cartões `🎲 Rolagem de Perícia`/`🎲 Rolagem de Expressão`, com o
   **mesmo texto formatado** de antes (`formatRolagem`, sem mudança).
5. Cliquei "Atualizar logs" — lista recarregada sem erro no console
   (verificado via `preview_console_logs`), contagem "LOG DA MESA (5)"
   mantida.

Resultado: **todos os passos do teste manual passaram**. Não rolei pela
ficha nesta rodada (fluxo já validado no checkpoint v0.2 de Mesas/Log e
não alterado aqui), mas confirmei que rolagens gravadas anteriormente
continuam renderizando corretamente após a mudança de apresentação.

## 8. Confirmação de escopo

- **Banco/migrations**: nenhuma alteração.
- **Ficha** (`src/app/dev/character-sheet`): não alterada.
- **Realtime**: não implementado.
- **Autenticação**: não implementada — RLS continua na política temporária
  de desenvolvimento da migration 0003.
- **Biblioteca do Sistema** (`src/lib/content`): não alterada.
- Nenhuma chave secreta exposta — mudança inteiramente de apresentação em
  `TableClient.tsx`, sem tocar em env vars, Server Actions ou queries.
