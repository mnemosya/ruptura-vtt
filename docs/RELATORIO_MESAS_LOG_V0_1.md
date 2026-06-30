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

---

# Checkpoint v0.4 — Filtros visuais de visibilidade

Adiciona um filtro de visibilidade (Todos/Pública/Privada/Narrador) na
seção "Log da mesa" de `/dev/table`. **Filtro 100% client-side** — só
esconde/mostra cartões já carregados em memória; não muda a query ao
Supabase, o payload gravado, nem implica nenhuma garantia de segurança.

## 1. Arquivos alterados

- `src/app/dev/table/TableClient.tsx` — único arquivo alterado:
  - nova constante `VISIBILITY_FILTERS = ["todos", ...TABLE_LOG_VISIBILITIES]`
    e tipo `VisibilityFilter`;
  - novo mapa `VISIBILITY_FILTER_LABELS` (`todos` → "Todos", `public` →
    "Pública", `private` → "Privada", `gm` → "Narrador" — rótulo "Narrador"
    usado aqui em vez de "Mestre (GM)" por ser o termo pedido para o
    filtro; o cabeçalho de cada cartão continua usando
    `VISIBILITY_LABELS`/"Mestre (GM)", inalterado);
  - novo estado `visibilidadeFiltro` (`useState<VisibilityFilter>("todos")`,
    padrão "Todos");
  - nova constante derivada `logsFiltrados` — `logs` quando o filtro é
    "todos", senão `logs.filter(entry => entry.visibility === filtro)`;
  - novo `<select data-testid="filtro-visibilidade-select">` ao lado do
    botão "Atualizar logs";
  - novo aviso discreto abaixo do cabeçalho: "Filtro visual apenas; ainda
    sem segurança real." (`fontSize: 11, opacity: 0.5`);
  - título da seção passou de "Log da mesa (N)" para
    "Log da mesa (filtrados/total)" (ex.: `7/9`);
  - nova mensagem "Nenhum log com essa visibilidade." quando o filtro
    ativo não tem resultado, mas existem logs (distinta da mensagem já
    existente "Nenhum log ainda nesta mesa.", que cobre o caso de a mesa
    não ter log nenhum);
  - a lista de cartões (`.map`) passou a iterar `logsFiltrados` em vez de
    `logs` — `logs` continua intacto, usado só para a contagem total e
    para os estados de loading/vazio.

Nenhuma mudança em `src/lib/table/storage.ts`, `src/lib/table/types.ts`,
banco, migrations, `src/app/dev/character-sheet` (ficha) ou
`src/lib/content` (Biblioteca do Sistema). `formatRolagem`,
`entryKindLabel`, `entryIcon` (do checkpoint v0.3) não foram tocados.

## 2. Como o filtro funciona

- Puramente em memória: `logsFiltrados` é derivado de `logs` a cada
  render via `.filter()`, sem nenhuma chamada nova ao Supabase.
- Trocar o filtro não dispara `listLogs()` — os dados já carregados (pela
  seleção da mesa ou pelo botão "Atualizar logs") continuam os mesmos;
  só a exibição muda.
- `addLog` (envio de mensagem manual) e a estrutura de `payload` em
  `table_logs` **não foram alterados** — o filtro não influencia o que é
  gravado, só o que é mostrado depois de carregado.
- Reforço do aviso já documentado desde a migration 0003: como não há
  filtro de RLS por visibilidade, qualquer cliente com a anon key
  continua recebendo as 3 visibilidades na mesma resposta de
  `listLogs()` — o filtro de UI não esconde nada do servidor, só da tela.

## 3. Resultado do build e do `test:character-storage`

```
$ npm run build
✓ Compiled successfully in 1559ms
  Running TypeScript ...
  Finished TypeScript in 2.2s ...
✓ Generating static pages using 5 workers (2/2) in 242ms

Route (app)
┌ ○ /_not-found
├ ƒ /dev/character-sheet
└ ƒ /dev/table
```

```
$ npm run test:character-storage
=== test-character-storage ===
1. Criado: id=86e6a122-ed65-429b-9e62-24aec9551ccc, schema_version=1
2. Carregado por id: nome="__TESTE_STORAGE_RUPTURA__"
3. Atualizado: nome="__TESTE_STORAGE_RUPTURA___editado", corpo=4
4. Encontrado na listagem (3 personagens no total).
5. Apagado e confirmado ausente via getCharacter.
6. Confirmado: nenhum registro de teste residual.
=== test-character-storage: TODOS OS PASSOS PASSARAM ===
```

Ambos passaram sem erros — confirma que o filtro puramente de UI não
afetou a camada de storage de personagem (a contagem "3 personagens no
total" reflete personagens reais já salvos em sessões anteriores, não um
resíduo desta etapa — o passo 6 confirma ausência de registro de teste).

## 4. Resultado do teste manual (browser, via preview tools)

1. Abri `/dev/table`, selecionei "Mesa Teste Fase 0" (9 logs já
   existentes de checkpoints anteriores, incluindo entradas Pública,
   Privada e Mestre/GM).
2. Filtro padrão "Todos" → "LOG DA MESA (9/9)", todas as 9 entradas
   visíveis.
3. Selecionei filtro "Pública" → "LOG DA MESA (7/9)", confirmado via
   leitura do DOM que as 7 entradas visíveis tinham `[Pública]` no
   cabeçalho — nenhuma `[Privada]`/`[Mestre (GM)]` aparecendo.
4. Selecionei filtro "Privada" → "LOG DA MESA (1/9)", 1 entrada visível
   com `[Privada]`.
5. Selecionei filtro "Narrador" → "LOG DA MESA (1/9)", 1 entrada visível
   com `[Mestre (GM)]` (rótulo do cartão, inalterado desde v0.3).
6. Voltei para "Todos" → "LOG DA MESA (9/9)" novamente, todas as 9
   entradas de volta.
7. Confirmado: aviso "Filtro visual apenas; ainda sem segurança real."
   visível abaixo do cabeçalho em todos os momentos.
8. Confirmado: formulário "Enviar mensagem" com seletor de visibilidade
   (Pública/Privada/Mestre) e botão "Enviar" continuam presentes e
   funcionando, inalterados — não dependem do filtro de leitura.
9. Confirmado: botão "Atualizar logs" continua presente e funcional ao
   lado do novo seletor de filtro.
10. Sem erros no console (`preview_console_logs`) durante toda a sequência.

Resultado: **todos os passos do teste manual passaram**. Não criei
mensagens novas de cada visibilidade nesta rodada porque a mesa já tinha
as 3 visibilidades representadas (de testes anteriores do usuário) — a
contagem 7/1/1 (pública/privada/gm) já cobre o cenário pedido (alternar
entre filtros com dados reais de cada tipo presentes).

## 5. Confirmação de escopo

- **Banco/migrations**: nenhuma alteração.
- **Ficha** (`src/app/dev/character-sheet`): não alterada.
- **Payload de `table_logs`**: não alterado — `addLog()` continua
  gravando exatamente como antes.
- **RLS/segurança real por visibilidade**: não implementada — o aviso
  "Filtro visual apenas; ainda sem segurança real." é explícito sobre
  isso na própria UI, reforçando o já documentado na migration 0003 e
  nos checkpoints anteriores.
- **Realtime**: não implementado.
- **Autenticação**: não implementada.
- **Biblioteca do Sistema** (`src/lib/content`): não alterada.
- Nenhuma chave secreta exposta.

---

# Checkpoint v0.5 — Autoatualização visual do Log

Adiciona um toggle "Autoatualizar" em `/dev/table`: quando ligado, busca
os logs da mesa selecionada a cada 5 segundos via polling
(`setInterval` + `listLogs()`, a mesma Server Action já usada pelo botão
"Atualizar logs"). **Não é Supabase Realtime** — é polling simples no
cliente, sem WebSocket/subscription.

## 1. Arquivos alterados

- `src/app/dev/table/TableClient.tsx` — único arquivo alterado:
  - import de `useEffect` adicionado;
  - nova constante `AUTO_REFRESH_INTERVAL_MS = 5000`;
  - novos estados `autoAtualizar` (`useState<boolean>(false)`, padrão
    desligado) e `ultimaAtualizacao` (`useState<Date | null>(null)`);
  - `handleSelectMesa`, `handleAddLog` e `handleRefreshLogs` passaram a
    chamar `setUltimaAtualizacao(new Date())` logo após
    `setLogs(...)` — qualquer busca de logs (manual ou automática)
    atualiza o mesmo carimbo de horário;
  - novo `useEffect` com `setInterval(..., AUTO_REFRESH_INTERVAL_MS)`,
    ativo só quando `autoAtualizar && selectedCampaignId`; busca
    `listLogs(selectedCampaignId)`, chama `setLogs()` e
    `setUltimaAtualizacao()`; `return () => clearInterval(intervalId)`
    limpa o timer ao desligar o toggle, trocar de mesa ou desmontar o
    componente;
  - novo `<input type="checkbox" data-testid="auto-atualizar-toggle">`
    com label "Autoatualizar", ao lado do botão "Atualizar logs";
  - novo parágrafo `data-testid="auto-atualizar-status"`, mostrando
    "Autoatualização ligada"/"Autoatualização desligada" + "— Última
    atualização: HH:mm:ss" (via `toLocaleTimeString("pt-BR")") quando já
    houve alguma busca.

Nenhuma mudança em `src/lib/table/storage.ts`, `src/lib/table/types.ts`,
banco, migrations, `src/app/dev/character-sheet` (ficha) ou
`src/lib/content` (Biblioteca do Sistema). `formatRolagem`,
`entryKindLabel`, `entryIcon`, o filtro de visibilidade (`visibilidadeFiltro`/
`logsFiltrados`, do checkpoint v0.4) e `handleAddLog` não foram alterados
em sua lógica — `handleAddLog` só ganhou a linha extra de
`setUltimaAtualizacao`.

## 2. Como o polling funciona

- Intervalo fixo de 5000ms (`AUTO_REFRESH_INTERVAL_MS`), sem backoff nem
  configuração de intervalo pela UI.
- Cada tick chama exatamente `listLogs(selectedCampaignId)` — a mesma
  Server Action de sempre — e faz `setLogs(proximosLogs)`, substituindo
  a lista inteira a partir do servidor. Não há `[...logs, ...novos]`
  nem merge manual, então **não há risco de duplicar entradas**: cada
  tick reflete o estado real e completo da tabela `table_logs` para
  aquela mesa no momento da consulta.
- O filtro de visibilidade (`visibilidadeFiltro`) vive em um `useState`
  separado, nunca tocado pelo efeito de polling — trocar de filtro e
  deixar a autoatualização ligada não reseta a seleção do filtro.
- Erros de rede durante o polling usam a mesma área de erro já existente
  (`setErrorMessage`), sem travar o timer (o próximo tick tenta de
  novo).
- Trocar de mesa (`selectedCampaignId` muda) ou desligar o toggle
  cancela o timer anterior via `clearInterval` no cleanup do
  `useEffect`, evitando dois intervals concorrentes ou polling de uma
  mesa que não está mais selecionada.

## 3. Resultado do build e do `test:character-storage`

```
$ npm run build
✓ Compiled successfully in 2.3s
  Running TypeScript ...
  Finished TypeScript in 2.2s ...
✓ Generating static pages using 5 workers (2/2) in 364ms

Route (app)
┌ ○ /_not-found
├ ƒ /dev/character-sheet
└ ƒ /dev/table
```

```
$ npm run test:character-storage
=== test-character-storage ===
1. Criado: id=6406242b-fc70-4ba3-86bc-8ef05f766344, schema_version=1
2. Carregado por id: nome="__TESTE_STORAGE_RUPTURA__"
3. Atualizado: nome="__TESTE_STORAGE_RUPTURA___editado", corpo=4
4. Encontrado na listagem (3 personagens no total).
5. Apagado e confirmado ausente via getCharacter.
6. Confirmado: nenhum registro de teste residual.
=== test-character-storage: TODOS OS PASSOS PASSARAM ===
```

Ambos passaram sem erros — confirma que o polling de UI não afetou a
camada de storage de personagem.

## 4. Resultado do teste manual (browser, via preview tools)

1. Abri `/dev/table`, selecionei "Mesa Teste Fase 0" (11 logs
   existentes) — status mostrou "Autoatualização desligada — Última
   atualização: 17:15:03" (carimbo já preenchido pela própria seleção
   da mesa, mesmo com o toggle desligado).
2. Liguei "Autoatualizar" → status mudou para "Autoatualização ligada
   — Última atualização: 17:15:03".
3. Troquei o filtro para "Privada" → "LOG DA MESA (1/11)".
4. Enviei pela própria UI uma mensagem privada de teste → apareceu na
   hora (comportamento já existente de `handleAddLog`, inalterado),
   contagem "LOG DA MESA (2/12)", filtro "Privada" preservado.
5. **Simulei outro cliente**: inserido externamente, via script
   (`scripts/_tmp_add_external_log.ts`, criado e removido na mesma
   sessão, nunca commitado) usando a mesma `addLog()`/`listCampaigns()`
   de `src/lib/table/storage.ts`, uma mensagem **pública** na mesma
   mesa — sem clicar em nada na UI.
6. Aguardei ~4s sem interagir → "LOG DA MESA (2/13)": o total subiu de
   12 para 13 sozinho (a nova mensagem pública foi buscada pelo
   polling), a contagem **filtrada continuou em 2** (a nova mensagem é
   pública, então o filtro "Privada" corretamente a manteve oculta) —
   "Última atualização" avançou para 17:16:22 sem nenhum clique manual.
7. Troquei o filtro para "Todos" → confirmei a mensagem pública externa
   no topo da lista, texto íntegro.
8. Desliguei "Autoatualizar" → status voltou a "Autoatualização
   desligada", carimbo parou em 17:16:47.
9. Inseri mais uma entrada pública externamente (mesmo método do passo
   5, script removido ao final). Aguardei 8s sem tocar na UI →
   contagem **permaneceu em "LOG DA MESA (13/13)"**, carimbo
   inalterado (17:16:47) — confirma que desligar o toggle realmente
   para o polling.
10. Cliquei "Atualizar logs" manualmente → contagem foi para
    "LOG DA MESA (14/14)", confirmando que a entrada estava no banco o
    tempo todo, só não tinha sido buscada automaticamente.
11. Sem erros no console (`preview_console_logs`) durante toda a
    sequência.

Resultado: **todos os passos do teste manual passaram**, incluindo o
cenário "outro cliente grava no banco" que o checklist original pedia
implicitamente (uma mesa real, compartilhada, recebendo uma escrita
externa enquanto a aba de teste só observa).

## 5. Confirmação de escopo

- **Supabase Realtime**: não implementado — o mecanismo é polling por
  `setInterval` no cliente, não subscription/WebSocket.
- **Banco/migrations**: nenhuma alteração.
- **Ficha** (`src/app/dev/character-sheet`): não alterada.
- **Envio de mensagens** (`handleAddLog`, payload de `table_logs`): não
  alterado em sua lógica — só ganhou a atualização do carimbo de
  horário, que é puramente de UI.
- **Filtro de visibilidade** (checkpoint v0.4): preservado e testado em
  conjunto com a autoatualização (passos 3–7 acima).
- **Autenticação**: não implementada.
- **Biblioteca do Sistema** (`src/lib/content`): não alterada.
- Nenhuma chave secreta exposta: os dois scripts auxiliares usados para
  simular gravações externas (`scripts/_tmp_add_external_log.ts` e
  `scripts/_tmp_add_external_log2.ts`) usaram exclusivamente
  `SUPABASE_URL`/`SUPABASE_ANON_KEY` (mesma `getContentClient()` de
  sempre), foram criados e apagados na mesma sessão, nunca commitados.

---

# Checkpoint v0.6 — Perfis dev de mesa

Adiciona `campaign_profiles`: um registro DEV de "quem está jogando"
dentro de uma mesa — apelido + bloqueio manual + personagem ativo
opcional. **Não é o fluxo final de jogador do PRD** (seção 1.2/1.3):
sem login, sem link de convite, sem heartbeat de presença. É só o
suporte mínimo de dados para visualizar/testar o conceito de "perfil"
em `/dev/table`.

## 1. Arquivos criados/alterados

**Migration:**
- `supabase/migrations/0004_campaign_profiles.sql` — tabela
  `campaign_profiles` + RLS de desenvolvimento (novo).

**Camada de dados (`src/lib/table/`):**
- `types.ts` — novo tipo `CampaignProfile` (linha completa da tabela).
- `storage.ts` — três novas Server Actions: `createCampaignProfile`,
  `listCampaignProfiles`, `setCampaignProfileLocked`.

**Rota dev (`src/app/dev/table/`):**
- `TableClient.tsx` — nova seção "Perfis da mesa", estados
  `perfis`/`novoPerfilApelido`/`loadingPerfis`, handlers
  `handleRefreshPerfis`/`handleCreatePerfil`/`handleToggleLockPerfil`.

**Este relatório:**
- `docs/RELATORIO_MESAS_LOG_V0_1.md` — esta seção.

Nenhuma mudança em `src/app/dev/character-sheet` (ficha), `src/lib/content`
(Biblioteca do Sistema), `campaigns`/`table_logs` (migrations 0002/0003,
exceto a FK opcional já existente de `characters` reaproveitada aqui) ou
nas funcionalidades dos checkpoints v0.3–v0.5 (cartões, filtro de
visibilidade, autoatualização — todos intactos).

## 2. SQL aplicado (migration 0004)

Aplicada via conexão direta Postgres (`SUPABASE_DB_URL`), mesmo padrão
das migrations 0001–0003 (idempotente — `create table if not exists`,
`drop policy if exists` + `create policy`), usando um script auxiliar
(`scripts/_tmp_apply_0004.ts`) criado e removido na mesma sessão, nunca
commitado.

```sql
create table if not exists campaign_profiles (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid not null references campaigns(id) on delete cascade,
  nickname             text not null,
  color_label          text,
  is_locked            boolean not null default false,
  active_character_id  uuid references characters(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
```

Índices: `campaign_profiles_campaign_id_idx`,
`campaign_profiles_campaign_created_at_idx` (campaign_id, created_at
desc). Trigger `campaign_profiles_set_updated_at` reusa a função
`set_updated_at()` de 0001. `active_character_id` é opcional, nullable,
`on delete set null` — mesmo padrão de `table_logs.character_id`
(0003): um perfil sobrevive se o personagem associado for apagado.

Verificado após aplicar (consulta a `information_schema.tables` e
`pg_policies`):

```
Migration 0004 aplicada.
Tabela campaign_profiles existe: true
Policies:
 - campaign_profiles_dev_anon_select SELECT {anon,authenticated}
 - campaign_profiles_dev_anon_insert INSERT {anon,authenticated}
 - campaign_profiles_dev_anon_update UPDATE {anon,authenticated}
 - campaign_profiles_dev_anon_delete DELETE {anon,authenticated}
```

## 3. Policies criadas (RLS) — TEMPORÁRIAS, sem autenticação

CRUD completo (select/insert/update/delete) liberado para
`anon`/`authenticated` — mesmo padrão já usado em `campaigns`
(migration 0003), pelo mesmo motivo: nesta fase de dev, qualquer
cliente com a anon key precisa poder criar/listar/bloquear perfis para
testar o fluxo via `/dev/table`.

### Riscos documentados (mesmo princípio dos checkpoints anteriores, mais os específicos de perfil)

- Qualquer pessoa com a anon key pode ler/criar/editar/apagar
  **qualquer** perfil de **qualquer** mesa — sem isolamento por
  usuário, sem checagem de que quem bloqueia/desbloqueia é realmente o
  narrador daquela mesa.
- **`is_locked` é só um boolean de dados**: não há enforcement real de
  "perfil bloqueado não pode ser usado" em nenhuma camada — isso
  dependeria de autenticação + lógica de aplicação que ainda não
  existe. Bloquear aqui é só um indicador visual em `/dev/table`.
- **Sem link de convite**: não há token/segredo associado a um perfil —
  qualquer cliente com a anon key pode listar todos os perfis de
  qualquer mesa diretamente, sem precisar de nenhum link.
- **Sem heartbeat**: um perfil bloqueado manualmente fica bloqueado até
  alguém desbloquear manualmente — sem timeout, sem liberação
  automática por inatividade/fechar aba (isso é requisito explícito do
  PRD, seção 1.3, ainda não implementado).
- Sem rate limit: nada impede criação ilimitada de perfis.
- TODO explícito na migration (bloqueante para produção): coluna de
  dono/narrador, restringir insert/update ao narrador da mesa,
  heartbeat real de presença, link de convite com token revogável.

## 4. Camada server (`src/lib/table/storage.ts`)

| Função | O que faz |
|---|---|
| `createCampaignProfile(campaignId, nickname, colorLabel?)` | Insere um perfil novo (apelido vazio vira "Perfil sem apelido"). |
| `listCampaignProfiles(campaignId)` | Lista perfis de uma mesa, mais recentemente criados primeiro. |
| `setCampaignProfileLocked(profileId, locked)` | Atualiza `is_locked` (bloquear/desbloquear). |

Todas usam `getContentClient()` (mesmo cliente Supabase com anon key já
usado pelo resto de `src/lib/table`) e lançam `TableStorageError` em
caso de falha, preservando o erro original em `cause` — mesmo padrão
de `createCampaign`/`listCampaigns`/`addLog`/`listLogs`.

## 5. UI em `/dev/table`

Nova seção "Perfis da mesa (N) — {nome da mesa}", entre a lista de
mesas e o formulário "Enviar mensagem":

- Aviso fixo: "Perfil DEV: só apelido + bloqueio manual. Sem login, sem
  link de convite, sem heartbeat de presença — bloqueio aqui é só um
  indicador visual, sem enforcement real (ver migration 0004)."
- Campo de texto "Apelido do perfil" + botão "Criar perfil"
  (`data-testid="novo-perfil-apelido"`/`"criar-perfil-button"`).
- Lista de perfis (`data-testid="perfis-lista"`), cada um mostrando
  apelido, status ("Livre"/"Bloqueado", cor verde/âmbar) e botão
  "Bloquear"/"Desbloquear" (`data-testid="bloquear-perfil-{id}"`).
- Selecionar uma mesa (`handleSelectMesa`) agora também busca os perfis
  daquela mesa automaticamente, junto com os logs.

## 6. Resultado do build e do `test:character-storage`

```
$ npm run build
✓ Compiled successfully in 1834ms
  Running TypeScript ...
  Finished TypeScript in 2.3s ...
✓ Generating static pages using 5 workers (2/2) in 240ms

Route (app)
┌ ○ /_not-found
├ ƒ /dev/character-sheet
└ ƒ /dev/table
```

```
$ npm run test:character-storage
=== test-character-storage ===
1. Criado: id=c5e5ee46-2a0c-47a5-bc8b-69dbf07295bf, schema_version=1
2. Carregado por id: nome="__TESTE_STORAGE_RUPTURA__"
3. Atualizado: nome="__TESTE_STORAGE_RUPTURA___editado", corpo=4
4. Encontrado na listagem (3 personagens no total).
5. Apagado e confirmado ausente via getCharacter.
6. Confirmado: nenhum registro de teste residual.
=== test-character-storage: TODOS OS PASSOS PASSARAM ===
```

Ambos passaram sem erros — confirma que a nova tabela/UI não afetou a
camada de storage de personagem.

## 7. Resultado do teste manual (browser, via preview tools)

1. Abri `/dev/table`, selecionei "Mesa Teste Fase 0" — nova seção
   "Perfis da mesa (0)" apareceu, vazia (mesa ainda sem perfis).
2. Criei o perfil "Kael o Jogador" via "Criar perfil" — apareceu na
   lista com status "Livre" e botão "Bloquear".
3. **Recarreguei a página inteira** (`window.location.reload()`),
   reselecionei a mesa — "Perfis da mesa (1)" reapareceu com "Kael o
   Jogador" / "Livre", carregado do servidor, não de estado local —
   confirma persistência real no Supabase.
4. Cliquei "Bloquear" — status mudou para "Bloqueado" (cor âmbar),
   botão virou "Desbloquear".
5. Recarreguei a página novamente, reselecionei a mesa — status
   continuou "Bloqueado"/"Desbloquear", confirmando que o bloqueio
   também persiste no banco, não é só estado de UI.
6. Cliquei "Desbloquear" — status voltou a "Livre"/"Bloquear".
7. Sem erros no console (`preview_console_logs`) durante toda a
   sequência.
8. Removi o perfil de teste "Kael o Jogador" via script auxiliar
   (`scripts/_tmp_cleanup_profile.ts`, criado e removido na mesma
   sessão, nunca commitado) — sem botão de apagar perfil na UI nesta
   etapa (fora de escopo do pedido).

Resultado: **todos os passos do teste manual passaram**, incluindo
persistência de criação e de bloqueio/desbloqueio através de reloads
completos da página.

## 8. Confirmação de escopo

- **Autenticação**: não implementada.
- **Link de convite**: não implementado — perfis são criados
  diretamente em `/dev/table`, sem token nem fluxo de convite.
- **Heartbeat de presença**: não implementado — `is_locked` é só um
  boolean manual, sem liberação automática por timeout/inatividade.
- **Ficha** (`src/app/dev/character-sheet`): não alterada.
- **Biblioteca do Sistema** (`src/lib/content`): não alterada.
- **`campaigns`/`table_logs`** (migrations 0002/0003): não alteradas.
- Nenhuma chave secreta exposta: os scripts auxiliares
  (`scripts/_tmp_apply_0004.ts`, `scripts/_tmp_cleanup_profile.ts`)
  usaram exclusivamente `SUPABASE_URL`/`SUPABASE_ANON_KEY`/
  `SUPABASE_DB_URL` (mesmas variáveis já documentadas, nunca a service
  role key), foram criados e removidos na mesma sessão, nunca
  commitados.
