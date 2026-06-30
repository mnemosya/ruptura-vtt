# Relatório — Ficha mínima de personagem (v0.1)

Checkpoint do estado atual da ficha mínima em `/dev/character-sheet`: leitura de
`regras_personagem` no Supabase, cálculo dos 8 derivados básicos e validação manual
do recálculo.

## 1. Arquivos criados

- `src/lib/character/types.ts` — tipos da ficha mínima (`Character`,
  `CharacterAttributes`, `FormulaNode`, `DERIVED_IDS`, subset do payload de
  `regras_personagem` usado aqui).
- `src/lib/character/derived.ts` — `computeDerivedStats()`, interpretador genérico
  da árvore de fórmula (`{ const } | { ref } | { op, args }`) vinda do payload.
- `src/lib/character/derived.fallback.ts` — fórmulas hardcoded de segurança, só
  usadas se algum dos 8 ids de derivado não existir no payload do banco.
- `src/lib/character/createCharacter.ts` — `createInitialCharacter()`, monta um
  `Character` local a partir das definições de atributos/perícias das regras.
- `src/lib/character/index.ts` — ponto de entrada único do módulo.
- `src/app/dev/character-sheet/page.tsx` — Server Component, busca
  `regras_personagem` via `getCharacterRules()` e trata erro/fallback.
- `src/app/dev/character-sheet/CharacterSheetClient.tsx` — Client Component,
  estado local (`useState`) dos atributos/perícias, recálculo dos derivados via
  `useMemo`.
- `src/app/dev/character-sheet/loading.tsx` — estado de carregamento da rota.

Nenhum arquivo de inventário, magia ou combate foi criado ou alterado nesta etapa.

## 2. Comandos rodados

```
node -v
npm -v
npm install
npm run test:content-read
npm run dev
```

Mais um script ad-hoc (temporário, criado e removido na mesma sessão) para
confirmar os derivados direto no terminal com `Corpo=4, Mente=3, Ânimo=5` —
ver seção 8.

## 3. Confirmação — `npm run test:content-read`

Rodou com sucesso (`tsx scripts/test-content-read.ts`), validando a leitura geral
da Biblioteca do Sistema no Supabase:

- 17 magias cinéticas via `listSpells({ vertente: 'cinetica' })`.
- 15 itens corpo a corpo via `listItems({ subtipo: 'corpo_a_corpo' })`.
- Condição `sangrando` via `getCondition('sangrando')`.
- Ação `atacar` via `getCombatAction('atacar')`.
- `getMasterTables()` retornando o documento `tabelas_mestre`.

## 4. Confirmação — `npm run dev`

Servidor Next.js (Turbopack) subiu sem erros:

```
▲ Next.js 16.2.9 (Turbopack)
- Local: http://localhost:3000
✓ Ready
```

## 5. URL testada

`http://localhost:3000/dev/character-sheet`

Rota explicitamente marcada no código como página de debug (`/dev/...`), sem
design final — ver comentário no topo de `page.tsx`.

## 6. Dados vindos do Supabase

- Documento lido: `regras_personagem` (tipo `character_rule`), via
  `getCharacterRules()` em `src/lib/content/queries.ts`.
- Leitura feita com a camada pública somente-leitura (`SUPABASE_URL` +
  `SUPABASE_ANON_KEY`), nunca a service role key — reforçado por checagem em
  `src/lib/content/client.ts`.
- Payload trouxe os 8 derivados esperados (`pv_max`, `pe_max`, `mana_max`,
  `integridade_max`, `reacoes_por_rodada`, `andar_m`, `correr_m`, `pa_max`), além
  das definições de atributos e perícias usadas para montar os campos da ficha.
- Confirmado via script de validação: `regras encontrada? true`,
  `derivados.length: 8` (nenhum fallback foi acionado).

## 7. Fórmulas calculadas via payload

`computeDerivedStats()` (`src/lib/character/derived.ts`) interpreta a árvore de
fórmula que já vem em `regras_personagem.derivados[].formula`, em vez de
reescrever as regras manualmente em código. Estrutura suportada:

- `{ const: number }` — valor fixo.
- `{ ref: "atributo" | "derivado", id: string }` — referência a um atributo do
  personagem ou a outro derivado já calculado (com cache e detecção de
  referência circular).
- `{ op: "+" | "-" | "*" | "/", args: FormulaNode[] }` — operação aplicada
  recursivamente sobre os nós filhos.

Se algum dos 8 ids esperados não vier no payload, `derived.fallback.ts` cobre a
lacuna — hoje isso não acontece (payload já tem os 8).

## 8. Teste manual — Corpo=4, Mente=3, Ânimo=5

Validado de duas formas:

1. Na UI (`/dev/character-sheet`), ajustando os campos de Corpo, Mente e Ânimo.
2. Via script (`computeDerivedStats({ corpo: 4, mente: 3, animo: 5 }, regras)`)
   usando o payload real lido do Supabase nesta sessão.

Resultado idêntico nos dois casos.

## 9. Resultado dos derivados

| Derivado            | Valor | Fórmula                          |
|----------------------|------:|-----------------------------------|
| `pv_max`             |    14 | `10 + corpo`                      |
| `pe_max`             |    13 | `10 + mente`                      |
| `mana_max`           |    20 | `10 + (animo * 2)`                |
| `integridade_max`    |    20 | `10 + (animo * 2)`                |
| `reacoes_por_rodada` |     3 | `mente`                           |
| `andar_m`            |    14 | `10 + corpo`                      |
| `correr_m`           |    28 | `andar_m * 2` (referência a outro derivado) |
| `pa_max`             |     3 | constante                         |

Confirmado: derivados recalculam corretamente ao mudar os atributos na UI.

## 10. O que ainda é temporário/local

- Rota `/dev/character-sheet` é uma página de debug, sem design definitivo —
  comentário explícito no topo de `page.tsx`.
- Estado do personagem (`useState` em `CharacterSheetClient.tsx`) é 100% local
  no navegador. Nada é persistido no banco; recarregar a página perde os
  valores digitados.
- `derived.fallback.ts` é uma rede de segurança temporária — só roda se o
  payload do banco não trouxer algum dos 8 ids de derivado. Há um `TODO`
  explícito no arquivo para removê-lo quando a ficha não precisar mais rodar
  sem acesso à Biblioteca do Sistema.
- Inventário, magia e combate **não foram tocados** nesta etapa — ficam para
  uma próxima iteração.

## Variáveis de ambiente envolvidas

Usadas em `.env.local` (nomes apenas, sem valores — não exibidos neste
relatório nem em nenhum momento da sessão):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (presente no `.env.local`, mas não usada pela
  camada de leitura pública — ver checagem em `src/lib/content/client.ts`)
- `SUPABASE_DB_URL`
- `CONTENT_DIR`

---

# Checkpoint v0.2 — Persistência mínima de personagem

Adiciona criar/salvar/carregar/listar/apagar personagem na tabela `characters`,
mantendo a ficha mínima (`/dev/character-sheet`) como única superfície. Inventário,
magia, combate e autenticação **não foram tocados**.

## 1. Arquivos criados

- `supabase/migrations/0002_characters.sql` — tabela `characters` + RLS/policies
  temporárias de desenvolvimento.
- `src/lib/character/storage.ts` — Server Actions (`"use server"`):
  `createCharacter`, `updateCharacter`, `getCharacter`, `listCharacters`,
  `deleteCharacter`.
- `src/lib/character/storage.errors.ts` — `CharacterStorageError` (classe separada
  porque um módulo `"use server"` só pode exportar funções assíncronas).

## 2. Arquivos alterados

- `src/lib/character/types.ts` — `Character` ganhou `recursos_atuais?` e
  `metadados?` (opcionais, sem UI ainda); novo tipo `CharacterRecord` (linha da
  tabela `characters`).
- `src/app/dev/character-sheet/page.tsx` — agora também busca a lista inicial de
  personagens salvos (`listCharacters()`) e passa para o Client Component.
- `src/app/dev/character-sheet/CharacterSheetClient.tsx` — campo de nome
  (já existia, mantido), botões "Salvar personagem" / "Novo personagem", estados
  de salvamento (salvando/salvo/erro), lista de personagens salvos com
  "Carregar"/"Apagar".

Nenhum arquivo de inventário, magia, combate ou autenticação foi criado/alterado.

## 3. SQL da migration (`0002_characters.sql`)

```sql
create table if not exists characters (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_label text,
  status      text not null default 'draft',
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists characters_status_idx on characters (status);
create index if not exists characters_updated_at_idx on characters (updated_at desc);

drop trigger if exists characters_set_updated_at on characters;
create trigger characters_set_updated_at
  before update on characters
  for each row execute function set_updated_at(); -- reusa a função de 0001
```

`payload` (JSONB) guarda o personagem inteiro: `nome`, `atributos`, `pericias`,
`recursos_atuais` (opcional, ainda sem UI) e `metadados` (opcional, livre). `name`,
`owner_label` e `status` são colunas escalares projetadas para filtro/listagem —
a fonte de verdade do conteúdo é o `payload`, mesmo princípio JSONB-first da
migration 0001.

Aplicada com sucesso via conexão direta Postgres (`SUPABASE_DB_URL`), mesmo padrão
de `scripts/apply-migration.ts`. Migration é idempotente (`create table if not
exists`, `drop policy if exists` + `create policy`).

## 4. Policies criadas (RLS) — TEMPORÁRIAS, sem autenticação

```sql
alter table characters enable row level security;

create policy characters_dev_anon_select on characters
  for select to anon, authenticated using (true);

create policy characters_dev_anon_insert on characters
  for insert to anon, authenticated with check (true);

create policy characters_dev_anon_update on characters
  for update to anon, authenticated using (true) with check (true);

create policy characters_dev_anon_delete on characters
  for delete to anon, authenticated using (true);
```

Verificado em produção (consulta a `pg_policies` após aplicar a migration):

```
characters_dev_anon_delete  DELETE  {anon,authenticated}
characters_dev_anon_insert  INSERT  {anon,authenticated}
characters_dev_anon_select  SELECT  {anon,authenticated}
characters_dev_anon_update  UPDATE  {anon,authenticated}
```

Essas 4 policies liberam CRUD completo para `anon`/`authenticated` — ou seja, a
mesma anon key pública usada para ler a Biblioteca do Sistema também pode
criar/ler/editar/apagar **qualquer** personagem de **qualquer** "dono". Isso está
documentado em comentário extenso no topo da migration, com um TODO explícito:
substituir por `using (owner_id = auth.uid())` assim que existir autenticação e
uma coluna `owner_id` (FK para a tabela de usuários do Supabase Auth).

## 5. Funções de storage (`src/lib/character/storage.ts`)

Todas são Server Actions (`"use server"`) — chamadas diretamente do Client
Component, mas executadas no servidor, então `SUPABASE_URL`/`SUPABASE_ANON_KEY`
nunca chegam ao bundle do navegador.

- `createCharacter(character, options?)` → insere e retorna o `CharacterRecord`.
- `updateCharacter(id, character, options?)` → atualiza `payload`/`name` (e
  `owner_label`/`status` se informados) e retorna o registro atualizado.
- `getCharacter(id)` → retorna o `CharacterRecord` ou `null` se não existir.
- `listCharacters()` → lista todos, ordenados por `updated_at desc`.
- `deleteCharacter(id)` → apaga por id.

Todas usam `getContentClient()` (o mesmo cliente Supabase com anon key já usado
pela leitura da Biblioteca do Sistema) e lançam `CharacterStorageError` em caso de
falha do Supabase, com a mensagem original preservada em `cause`.

## 6. Resultado do teste manual

Executado de ponta a ponta via browser (preview tools), não apenas lido no código:

1. **Criar personagem** — página abriu com "Novo Personagem" (Corpo=Mente=Ânimo=1,
   valores iniciais vindos de `regras_personagem.criacao_personagem`).
2. **Alterar nome** → "Kael Ironwood".
3. **Alterar atributos** → Corpo=4, Mente=3, Ânimo=5. Derivados recalcularam na
   hora: `pv_max=14, pe_max=13, mana_max=20, integridade_max=20,
   reacoes_por_rodada=3, andar_m=14m, correr_m=28m, pa_max=3`.
4. **Salvar** → clique em "Salvar personagem"; UI mostrou "✓ Salvo" e o id
   `9dd19392-fd16-49b7-b32c-0b4929428b4d`; o personagem apareceu na lista
   "Personagens salvos".
5. **Recarregar a página** → estado local voltou ao padrão ("Novo Personagem",
   atributos=1) — esperado, pois o estado de edição não é persistido em
   localStorage, só o que foi explicitamente salvo no banco. A lista de
   personagens salvos recarregou do banco corretamente.
6. **Carregar o personagem salvo** → clique em "Carregar" na linha "Kael
   Ironwood"; nome e atributos voltaram (Corpo=4, Mente=3, Ânimo=5).
7. **Confirmar atributos e derivados** → conferido via leitura direta do DOM após
   o carregamento: nome="Kael Ironwood", atributos `{corpo:4, mente:3, animo:5}`,
   derivados idênticos aos do passo 3 (`pv_max=14, pe_max=13, mana_max=20,
   integridade_max=20, reacoes_por_rodada=3, andar_m=14m, correr_m=28m,
   pa_max=3`).

Resultado: **passou em todos os 7 passos**. Registros de teste extras criados
durante a exploração da UI ("Novo Personagem", "Novo Personagem2") foram apagados
ao final pelo próprio botão "Apagar" da ficha — sobrou só "Kael Ironwood" na
tabela.

## 7. Riscos de segurança por ainda não ter autenticação

- **Sem isolamento por dono**: qualquer cliente com a anon key (que é pública por
  design, embutida no bundle de qualquer app Supabase) pode ler, criar, editar e
  apagar **qualquer** personagem de **qualquer outra pessoa** — não há coluna
  `owner_id` nem checagem de identidade nas policies.
- **Sem rate limiting/abuso**: nada impede um cliente de criar um número ilimitado
  de personagens (visto na prática durante o teste: 3 registros de teste extras
  apareceram rapidamente).
- **Apagar é destrutivo e irrestrito**: `deleteCharacter` apaga qualquer linha por
  id, sem confirmação adicional no backend — qualquer pessoa com acesso à anon key
  pode apagar a ficha de qualquer outra.
- **`owner_label` é só texto livre**, não um vínculo de autenticação — não serve
  como controle de acesso, só como rótulo informativo.
- Mitigação aceita para esta etapa: ambiente de desenvolvimento local, sem dados
  reais de jogadores. Bloqueante explícito para produção, documentado como TODO na
  migration: trocar as 4 policies por regras baseadas em `auth.uid()` assim que
  houver login.

## 8. Confirmação — nenhuma chave secreta exposta

- Nenhum valor de `.env.local` (URL, anon key, service role key, connection
  string) foi impresso, logado ou colado neste relatório — só os **nomes** das
  variáveis (já documentado na seção de variáveis de ambiente do checkpoint v0.1
  acima).
- `storage.ts` usa exclusivamente `getContentClient()` (anon key) — a service role
  key não é importada nem referenciada em nenhum arquivo de frontend/Server
  Action criado nesta etapa.
- Por ser Server Action (`"use server"`), as credenciais usadas no servidor
  (mesmo sendo só a anon key) nunca são serializadas para o bundle do cliente —
  só o resultado dos `Promise` retornados chega ao navegador.
- O script auxiliar usado para aplicar a migration via `SUPABASE_DB_URL` foi
  criado e removido na mesma sessão (`scripts/_tmp_apply_0002.ts`), nunca
  commitado.

---

# Checkpoint v0.3 — Robustez do payload de personagem

Consolida o payload do personagem antes de iniciar inventário/magia/combate:
versionamento simples (`schema_version`), `recursos_atuais` preenchidos de forma
segura e normalização para personagens salvos com payload antigo/incompleto.

## 0. Checkpoint Git

`/Users/gabi/Developer/ruptura-vtt` **não é um repositório Git**
(`git status` retornou `fatal: not a git repository`). Não havia nada para
commitar nem checkpoint a fazer — seguimos sem forçar `git init`.

## 1. Arquivos criados

- `src/lib/character/normalizeCharacter.ts` — `normalizeCharacter(character, derived?)`:
  aceita payload antigo/incompleto, garante `nome`/`atributos`/`pericias`/
  `metadados.schema_version`/`recursos_atuais`, preserva campos desconhecidos via
  spread, preenche `recursos_atuais` ausentes com os `_max` só quando `derived` é
  passado (nunca sobrescreve valor já existente).
- `scripts/test-character-storage.ts` — teste de CRUD ponta a ponta contra o
  Supabase real, usando as mesmas Server Actions de `storage.ts`.

## 2. Arquivos alterados

- `src/lib/character/types.ts` — novos tipos `CharacterResources` (`pv?`, `pe?`,
  `mana?`, `integridade?`) e `CharacterMetadata` (`schema_version: number`,
  `criado_em?`, `atualizado_em?`, + índice para campos livres); `Character`
  passou a usar esses tipos em vez de `Record<string, unknown>` genérico.
- `src/lib/character/createCharacter.ts` — `createInitialCharacter` agora inicia
  `recursos_atuais: {}` (vazio — sem acesso aos derivados nesse ponto) e
  `metadados: { schema_version: 1, criado_em: <ISO agora> }`.
- `src/lib/character/storage.ts` — função interna (não exportada)
  `buildPayloadForSave()` carimba `metadados.schema_version` (default 1),
  `criado_em` (preserva se já existir) e `atualizado_em` (sempre o momento do
  save) antes de `createCharacter`/`updateCharacter` gravarem no banco.
- `src/lib/character/index.ts` — passou a reexportar `normalizeCharacter`.
- `src/app/dev/character-sheet/CharacterSheetClient.tsx` — `handleSave` chama
  `normalizeCharacter(character, derivados)` antes de salvar (preenche
  `recursos_atuais` com os `_max` da UI se estiverem ausentes); `handleLoad`
  chama `normalizeCharacter(record.payload)` ao carregar (tolera payload antigo);
  novo indicador `schema v{N}` ao lado do id; nova seção somente-leitura
  "Recursos atuais" (PV/PE/Mana/Integridade atuais, sem edição/dano/cura).
- `package.json` — novo script `test:character-storage`.

Nenhuma mudança em `src/lib/content` (Biblioteca do Sistema), inventário, magia,
combate ou autenticação.

## 3. O que mudou no payload

Antes (v0.2): `metadados?: Record<string, unknown>` e
`recursos_atuais?: Record<string, number>` — formatos livres, sem garantia de
conteúdo.

Agora (v0.3), payload de um personagem salvo:

```json
{
  "nome": "Teste Schema",
  "atributos": { "corpo": 4, "mente": 3, "animo": 5 },
  "pericias": { "...": 0 },
  "recursos_atuais": { "pv": 14, "pe": 13, "mana": 20, "integridade": 20 },
  "metadados": {
    "schema_version": 1,
    "criado_em": "2026-06-30T13:58:1Z",
    "atualizado_em": "2026-06-30T14:01:31Z"
  }
}
```

## 4. Como `schema_version` funciona

- É um número simples (não um objeto/string de versão semântica) — existe só
  para permitir migrações leves no futuro (`normalizeCharacter` saberia
  diferenciar payloads de versões diferentes), nunca é usado no cálculo de
  derivados.
- Personagem novo (`createInitialCharacter`) já nasce com `schema_version: 1`.
- Ao salvar (`storage.ts` → `buildPayloadForSave`), se `schema_version` já
  existir no payload, é preservado; se faltar, é setado para `1`.
- Ao carregar (`normalizeCharacter`), o mesmo: ausente vira `1`, presente é
  preservado — nunca decrementa ou inventa uma versão maior.

## 5. Como `recursos_atuais` foi tratado

- `createInitialCharacter` inicia `recursos_atuais: {}` (vazio) — neste ponto
  não há acesso aos derivados calculados (isso depende de `computeDerivedStats`,
  que roda na UI com as regras já carregadas).
- Ao salvar pela UI, `CharacterSheetClient.handleSave` chama
  `normalizeCharacter(character, derivados)`, que preenche **apenas os campos
  ausentes** de `recursos_atuais` (`pv`, `pe`, `mana`, `integridade`) com os
  respectivos `_max` (`pv_max`, `pe_max`, `mana_max`, `integridade_max`)
  calculados pela ficha a partir das regras reais do Supabase. Um valor já
  existente (ex.: depois de dano, numa etapa futura) nunca é sobrescrito por
  este mecanismo.
- UI nova: seção "Recursos atuais", somente leitura, mostrando PV/PE/Mana/
  Integridade atuais ou "—" se ausentes. Sem edição, sem dano/cura/gasto —
  deliberadamente fora de escopo desta etapa.

## 6. Como personagens antigos são normalizados

`normalizeCharacter(character, derived?)`:

- aceita qualquer valor (inclusive payload incompleto/antigo, sem `metadados`
  nem `recursos_atuais`) sem lançar erro;
- garante `nome` (string; fallback `"Personagem sem nome"` se ausente/vazio);
- garante `atributos` (`corpo`/`mente`/`animo`; fallback `1` por campo ausente);
- garante `pericias` (preserva o que já existe; `{}` se ausente);
- garante `metadados.schema_version = 1` quando ausente, sem mexer no resto de
  `metadados`;
- garante `recursos_atuais` como objeto (preenchendo com `derived` apenas os
  campos ausentes, se `derived` for passado);
- preserva qualquer campo desconhecido do payload (via spread no topo, antes de
  sobrescrever os campos conhecidos) — não apaga nada que uma etapa futura
  (inventário/magia/combate) já tenha gravado.

Usada em dois pontos: `CharacterSheetClient.handleLoad` (ao carregar do
Supabase) e `CharacterSheetClient.handleSave` (antes de salvar, com `derived`
para preencher recursos).

## 7. Resultado do teste automatizado (`npm run test:character-storage`)

Rodado contra o Supabase real, usando a mesma camada de storage da UI:

```
=== test-character-storage ===

1. Criado: id=dac3d029-717e-41cc-b6ed-13bd817233d9, schema_version=1
2. Carregado por id: nome="__TESTE_STORAGE_RUPTURA__"
3. Atualizado: nome="__TESTE_STORAGE_RUPTURA___editado", corpo=4
4. Encontrado na listagem (2 personagens no total).
5. Apagado e confirmado ausente via getCharacter.
6. Confirmado: nenhum registro de teste residual.

=== test-character-storage: TODOS OS PASSOS PASSARAM ===
```

Todos os 6 passos passaram (criar → carregar → atualizar → listar → apagar →
confirmar limpeza). Filtro de limpeza usa exclusivamente o nome exato
`__TESTE_STORAGE_RUPTURA__` (e variações com esse prefixo), nunca apaga
personagens reais.

## 8. Resultado do teste manual (browser, via preview tools)

Executado de ponta a ponta, não apenas lido no código:

1. "Novo personagem" → ficha em branco.
2. Nome alterado para "Teste Schema".
3. Corpo=4, Mente=3, Ânimo=5.
4. "Salvar personagem" → "✓ Salvo", id atribuído, indicador "schema v1" visível.
5. Página recarregada → estado voltou ao padrão; lista "Personagens salvos"
   recarregou do banco com 2 personagens (Teste Schema + Kael Ironwood, este
   último salvo na etapa v0.2, antes de `schema_version` existir).
6. "Carregar" em "Teste Schema" → nome e atributos restaurados.
7. Confirmado: nome="Teste Schema", atributos `{corpo:4, mente:3, animo:5}`.
8. Derivados confirmados via leitura do DOM: `pv_max=14, pe_max=13,
   mana_max=20, integridade_max=20, reacoes_por_rodada=3, andar_m=14m,
   correr_m=28m, pa_max=3` — todos batendo com o esperado.
9. Confirmado `metadados.schema_version = 1` (indicador "schema v1" no
   cabeçalho da ficha).
10. Confirmado `recursos_atuais` preenchido de forma segura: PV=14, PE=13,
    Mana=20, Integridade=20 (= aos `_max`, pois era um personagem novo sem
    valores prévios). Em seguida, carreguei "Kael Ironwood" (personagem salvo
    **antes** desta etapa, sem `metadados` nem `recursos_atuais` no payload
    original) — carregou **sem erro**, com `schema v1` preenchido
    automaticamente por `normalizeCharacter` e "Recursos atuais" mostrando "—"
    (vazio, não inventado), confirmando que personagens antigos não quebram.

Resultado: **passou em todos os 10 passos**. O registro de teste "Teste Schema"
foi apagado ao final pela própria UI; sobrou só "Kael Ironwood" (personagem real
de teste anterior) na tabela.

## 9. Riscos ainda existentes

- As mesmas policies de RLS temporárias da migration 0002 continuam valendo
  (CRUD liberado para `anon`/`authenticated`, sem isolamento por dono) — nada
  mudou na segurança de acesso nesta etapa; ver checkpoint v0.2, seção 7.
- `normalizeCharacter` é permissiva por design (aceita `unknown`): um payload
  malicioso ou malformado vindo de fora do fluxo normal da UI poderia inserir
  campos arbitrários em `metadados` (são preservados sem validação de schema
  profunda) — aceitável nesta etapa por não haver multiusuário real ainda, mas
  vale revisitar quando houver autenticação/inputs externos.
- "Recursos atuais" ainda não tem nenhuma trava de coerência (ex.: não impede
  `pv` maior que `pv_max`) — não é um problema agora porque não há UI de
  edição, mas será relevante na etapa de combate/dano.

## 10. Confirmações de escopo

- **Biblioteca do Sistema** (`content_packs`, `content_documents`,
  `content_changelog`, `src/lib/content`): não alterada.
- **Inventário, magia e combate**: não implementados; `recursos_atuais` ganhou
  só leitura passiva dos `_max`, sem dano/cura/gasto/itens/magias.
- **Autenticação**: não implementada; RLS continua na política temporária de
  desenvolvimento documentada na migration 0002.
- **Nenhuma chave secreta foi exposta**: nenhum valor de `.env.local` foi
  impresso, logado ou colado neste relatório — só nomes de variáveis (já
  documentado no checkpoint v0.1). `scripts/test-character-storage.ts` usa
  exclusivamente `SUPABASE_URL` + `SUPABASE_ANON_KEY` (via `getContentClient()`,
  a mesma camada de `storage.ts`), nunca `SUPABASE_SERVICE_ROLE_KEY`. O script
  auxiliar de verificação de import (`scripts/_tmp_test_import.ts`) foi criado e
  removido na mesma sessão, nunca commitado.

---

# Checkpoint v0.4 — Estrutura visual em abas

Reorganiza a UI de `/dev/character-sheet` em abas (estado local, sem lib nova),
preparando o crescimento futuro (inventário/magia/combate) sem mudar nenhuma
regra ou mecânica.

## 1. Arquivos alterados

- `src/app/dev/character-sheet/CharacterSheetClient.tsx` — único arquivo
  alterado. Toda a lógica existente (`handleSave`, `handleLoad`, `handleDelete`,
  `handleNew`, `updateAtributo`, `updatePericia`, `computeDerivedStats`,
  `normalizeCharacter`) foi mantida **sem nenhuma mudança de comportamento** —
  só a apresentação foi reorganizada em abas via `useState<TabId>`.

Nenhum outro arquivo foi tocado: `storage.ts`, migrations, `src/lib/content`
(Biblioteca do Sistema) e `globals.css` permaneceram intactos (não foi
necessário CSS global novo — só estilos inline já existentes no componente).

## 2. Abas criadas

`TABS = ["geral", "atributos", "pericias", "recursos", "personagens", "debug"]`,
navegação via `<nav>` com botões e `data-testid="tab-<id>"`, troca de conteúdo
100% client-side (`useState` local, sem reload de página).

| Aba | Conteúdo |
|---|---|
| **Geral** | Nome editável, botões "Salvar personagem"/"Novo personagem", estado de save (salvando/✓ salvo/erro), id do personagem atual, schema version. |
| **Atributos** | Corpo, Mente, Ânimo — mesmos campos editáveis de antes, recalculando derivados via `useMemo`. |
| **Perícias** | Lista de perícias carregadas das regras, edição igual à de antes — nenhuma mecânica nova. |
| **Recursos** | Os 8 derivados (`pv_max`, `pe_max`, `mana_max`, `integridade_max`, `reacoes_por_rodada`, `andar_m`, `correr_m`, `pa_max`) + seção "Recursos atuais" somente leitura (`pv`, `pe`, `mana`, `integridade`). |
| **Personagens salvos** | Lista de personagens salvos com botões "Carregar"/"Apagar" — comportamento idêntico ao de antes. |
| **Debug** | `selectedCharacterId`, `schema_version`, `saveState`, `errorMessage`, contagem de personagens salvos, `usandoFallback` — nunca o payload inteiro, nunca variáveis de ambiente/chaves. |

## 3. Confirmação — salvar/carregar continua funcionando

Testado de ponta a ponta no browser (preview tools), não só lido no código:
criei um personagem ("Ficha em Abas", Corpo=4/Mente=3/Ânimo=5), salvei, recarreguei
a página, fui em "Personagens salvos" e carreguei de volta — nome, atributos,
derivados e recursos atuais vieram corretos (ver seção 5). Mesmo fluxo
Server Actions de antes (`createCharacter`/`updateCharacter`/`getCharacter`/
`listCharacters`/`deleteCharacter`), sem nenhuma alteração em `storage.ts`.

## 4. Resultado do build

```
$ npm run build
✓ Compiled successfully in 1661ms
  Running TypeScript ...
  Finished TypeScript in 2.3s ...
✓ Generating static pages using 4 workers (2/2) in 306ms

Route (app)
┌ ○ /_not-found
└ ƒ /dev/character-sheet
```

Sem erros de tipo, sem warnings novos.

Também rodei `npm run test:character-storage` como checagem extra (CRUD
completo na camada de storage, independente da UI): **todos os 6 passos
passaram** (criar → carregar → atualizar → listar → apagar → confirmar limpeza),
sem registro de teste residual.

## 5. Resultado do teste manual (browser, via preview tools)

Executado os 10 passos pedidos:

1. Abri `/dev/character-sheet`.
2. Troquei entre as 6 abas (Geral → Atributos → Perícias → Recursos →
   Personagens salvos → Debug → Geral) — conteúdo trocou sem reload de página,
   confirmado lendo o DOM após cada clique.
3. Nome alterado para "Ficha em Abas" (aba Geral).
4. Corpo=4, Mente=3, Ânimo=5 (aba Atributos).
5. Derivados conferidos na aba Recursos: `pv_max=14, pe_max=13, mana_max=20,
   integridade_max=20, reacoes_por_rodada=3, andar_m=14m, correr_m=28m,
   pa_max=3` — todos batendo com o esperado.
6. "Salvar personagem" (aba Geral) → "✓ Salvo", id atribuído.
7. Página recarregada.
8. Fui em "Personagens salvos" → lista reapareceu com 2 personagens ("Ficha em
   Abas" + "Kael Ironwood", de uma etapa anterior).
9. "Carregar" em "Ficha em Abas".
10. Confirmado: nome="Ficha em Abas" (aba Geral), atributos
    `{corpo:4, mente:3, animo:5}` (aba Atributos), derivados idênticos ao
    passo 5 e recursos atuais `{pv:14, pe:13, mana:20, integridade:20}` (aba
    Recursos) — todos corretos após o reload + carregar.

Resultado: **passou em todos os 10 passos**. O registro de teste "Ficha em
Abas" foi apagado ao final pela própria UI; sobrou só "Kael Ironwood" na
tabela.

## 6. Confirmação de escopo

- **Biblioteca do Sistema** (`content_packs`, `content_documents`,
  `src/lib/content`): não alterada.
- **Banco/migrations**: nenhuma migration criada ou alterada nesta etapa.
- **Inventário, magia, combate**: não implementados.
- **Autenticação**: não implementada.
- **`storage.ts`**: não alterado (a reorganização ficou inteiramente em
  `CharacterSheetClient.tsx`).
- Nenhuma chave secreta exposta: a aba Debug mostra só `selectedCharacterId`,
  `schema_version`, `saveState`, `errorMessage` e contagens — nunca o payload
  inteiro, nunca `.env.local` nem variáveis de ambiente.

---

# Checkpoint v0.5 — Recursos atuais editáveis

Transforma "Recursos atuais" (PV/PE/Mana/Integridade), na aba Recursos, de
somente leitura para campos editáveis manualmente — sem implementar dano,
cura, descanso ou gasto automático (isso fica para a etapa de combate).

## 1. Arquivos alterados

- `src/app/dev/character-sheet/CharacterSheetClient.tsx` — único arquivo
  alterado:
  - novo helper `parseRecursoAtual()` (inteiro, nunca negativo, sem teto);
  - nova constante `RECURSO_ATUAL_FIELDS` (mapeia `pv`/`pe`/`mana`/`integridade`
    para seus rótulos e ids de derivado `_max` correspondentes);
  - novas funções `updateRecursoAtual(id, rawValue)` e
    `handleRestoreRecursosMax()`;
  - novo componente `ResourceField` (input numérico + "/ máximo" + aviso
    "acima do máximo" quando aplicável);
  - seção "Recursos atuais" da aba Recursos passou de `Stat` (somente leitura)
    para `ResourceField` (editável) + botão "Restaurar recursos ao máximo".

`src/lib/character/types.ts` e `src/lib/character/normalizeCharacter.ts`
**não precisaram ser alterados** — `normalizeCharacter` já preservava valores
existentes de `recursos_atuais` e só preenchia os ausentes com os `_max`
(comportamento implementado no checkpoint v0.3), que é exatamente a regra
pedida aqui: "recursos atuais só devem ser preenchidos automaticamente com
máximos quando estiverem ausentes".

Nenhuma mudança em `storage.ts`, banco, migrations ou `src/lib/content`
(Biblioteca do Sistema).

## 2. Comportamento dos campos editáveis

- Cada campo (`PV atual`, `PE atual`, `Mana atual`, `Integridade atual`) é um
  `<input type="number">` com o máximo correspondente exibido ao lado
  (`/ pv_max`, `/ pe_max`, `/ mana_max`, `/ integridade_max`, calculados pela
  ficha a partir das regras reais do Supabase).
- `parseRecursoAtual()` aceita apenas inteiro (`Math.trunc`) e nunca permite
  valor negativo (`Math.max(0, ...)`) — não há trava de máximo de propósito.
- Editar um recurso atualiza só aquele campo em `character.recursos_atuais`
  (spread preserva os outros três).
- Se o valor digitado for maior que o `_max` correspondente, aparece um aviso
  discreto "acima do máximo" abaixo do campo (cor âmbar, sem bloquear nada).

## 3. Comportamento do botão "Restaurar recursos ao máximo"

Preenche de uma vez os quatro campos com os derivados atuais calculados pela
ficha: `pv = pv_max`, `pe = pe_max`, `mana = mana_max`,
`integridade = integridade_max`. É uma ação local — só reflete no estado da
UI; só persiste no banco se o usuário clicar em "Salvar personagem" depois.

## 4. Confirmação — salvar/carregar preserva recursos atuais

- Ao salvar, `handleSave` continua chamando
  `normalizeCharacter(character, derivados)`: como os quatro campos de
  `recursos_atuais` já estão preenchidos (editados manualmente ou via
  "Restaurar ao máximo"), `normalizeCharacter` não sobrescreve nada — só
  preencheria automaticamente um campo que ainda estivesse ausente (ex.: se o
  usuário editasse só PV e deixasse os outros três sem tocar, esses sim
  herdariam o `_max` ao salvar, conforme já documentado no checkpoint v0.3).
- Testado na prática (ver seção 6): editar os quatro valores manualmente,
  salvar, recarregar a página e carregar o personagem trouxe de volta
  exatamente os valores editados, não os máximos.
- Personagem antigo sem `recursos_atuais` no payload (`Kael Ironwood`, salvo
  antes do checkpoint v0.3) continua carregando sem erro — `normalizeCharacter`
  garante o objeto `recursos_atuais` mesmo vazio, e os campos exibem `0` (valor
  do helper `?? 0`, já que agora são inputs editáveis, não mais "—").

## 5. Resultado do build e do `test:character-storage`

```
$ npm run build
✓ Compiled successfully in 1634ms
  Running TypeScript ...
  Finished TypeScript in 2.0s ...
✓ Generating static pages using 4 workers (2/2) in 239ms
```

```
$ npm run test:character-storage
=== test-character-storage ===
1. Criado: id=92dccfb3-f7a5-4d08-af22-71c140f31304, schema_version=1
2. Carregado por id: nome="__TESTE_STORAGE_RUPTURA__"
3. Atualizado: nome="__TESTE_STORAGE_RUPTURA___editado", corpo=4
4. Encontrado na listagem (2 personagens no total).
5. Apagado e confirmado ausente via getCharacter.
6. Confirmado: nenhum registro de teste residual.
=== test-character-storage: TODOS OS PASSOS PASSARAM ===
```

Ambos passaram sem erros.

## 6. Resultado do teste manual (browser, via preview tools)

Executados os 14 passos pedidos, de ponta a ponta:

1–2. Abri `/dev/character-sheet`, criei novo personagem ("Novo personagem").
3. Corpo=4, Mente=3, Ânimo=5 (aba Atributos).
4–5. Aba Recursos → "Restaurar recursos ao máximo".
6. Confirmado: PV=14/14, PE=13/13, Mana=20/20, Integridade=20/20.
7. Editei manualmente: PV=7, PE=8, Mana=11, Integridade=15.
8. Nome alterado para "Teste Recursos Editaveis" → "Salvar personagem" → "✓
   Salvo".
9. Página recarregada.
10. Fui em "Personagens salvos" → "Carregar" no personagem de teste.
11. Confirmado na aba Recursos: PV=7, PE=8, Mana=11, Integridade=15 —
    exatamente os valores salvos no passo 7/8.
12. Cliquei "Restaurar recursos ao máximo" de novo → confirmado: PV=14, PE=13,
    Mana=20, Integridade=20.
13. Editei PV para 99 → apareceu o aviso discreto "acima do máximo" abaixo do
    campo PV (os outros três, dentro do limite, sem aviso).
14. Apaguei o personagem de teste via "Apagar" na aba Personagens salvos —
    confirmado que sobrou só "Kael Ironwood" na lista.

Resultado: **passou em todos os 14 passos**.

## 7. Confirmação de escopo

- **Biblioteca do Sistema**, **banco/migrations**: não alterados.
- **Inventário, magia, combate**: não implementados — recursos atuais
  continuam sem dano/cura/gasto automático, só edição manual livre.
- **Autenticação**: não implementada.
- **`storage.ts`**: não alterado.
- Nenhuma chave secreta exposta — nenhuma mudança na aba Debug nem em
  variáveis de ambiente.

---

# Checkpoint v0.6 — Refatoração da ficha em componentes

Quebra `CharacterSheetClient.tsx` (que tinha crescido para ~480 linhas) em
componentes menores por aba, em `src/app/dev/character-sheet/components/`,
sem mudar nenhum comportamento, texto ou nome de aba.

## 1. Arquivos criados

Todos em `src/app/dev/character-sheet/components/`:

- `styles.ts` — `buttonStyle` compartilhado entre componentes.
- `Section.tsx` — wrapper de seção com título (`<section>` + `<h2>`).
- `Stat.tsx` — card de exibição somente leitura (label + valor + hint).
- `NumberField.tsx` — input numérico com clamp (usado em Atributos/Perícias).
- `ResourceField.tsx` — input numérico de recurso atual (com "/ máximo" e aviso
  "acima do máximo").
- `CharacterSheetTabs.tsx` — navegação de abas; exporta também `TABS`,
  `TabId` e `TAB_LABELS` (única fonte de verdade dos ids/labels de aba).
- `GeneralTab.tsx` — nome, botões salvar/novo, estado de save, id, schema
  version.
- `AttributesTab.tsx` — Corpo/Mente/Ânimo editáveis.
- `SkillsTab.tsx` — lista de perícias editável.
- `ResourcesTab.tsx` — os 8 derivados + recursos atuais editáveis + botão
  "Restaurar recursos ao máximo" (inclui `RECURSO_ATUAL_FIELDS` e
  `derivedMetaById`, que eram só de apresentação).
- `SavedCharactersTab.tsx` — lista de personagens salvos com Carregar/Apagar.
- `DebugTab.tsx` — informações técnicas simples.

## 2. Arquivos alterados

- `src/app/dev/character-sheet/CharacterSheetClient.tsx` — reduzido de ~480
  para ~250 linhas. Continua sendo o único componente com `useState` de
  personagem/id/lista/saveState/activeTab, os handlers (`handleSave`,
  `handleLoad`, `handleDelete`, `handleNew`, `updateAtributo`,
  `updatePericia`, `updateRecursoAtual`, `handleRestoreRecursosMax`) e as
  chamadas às Server Actions de `storage.ts`. Os componentes de aba são
  importados e recebem tudo via props.

Nenhuma mudança em `storage.ts`, `normalizeCharacter.ts`, `types.ts`, banco,
migrations ou `src/lib/content` (Biblioteca do Sistema).

## 3. Componentes extraídos

| Componente | Responsabilidade |
|---|---|
| `CharacterSheetTabs` | Navegação entre as 6 abas (mesmos textos/ids de antes) |
| `GeneralTab` | Nome, salvar/novo personagem, status de save, id, schema version |
| `AttributesTab` | Corpo/Mente/Ânimo |
| `SkillsTab` | Lista de perícias |
| `ResourcesTab` | 8 derivados + recursos atuais editáveis + restaurar ao máximo |
| `SavedCharactersTab` | Lista de personagens salvos, carregar/apagar |
| `DebugTab` | Informações técnicas simples |
| `Section`, `Stat`, `NumberField`, `ResourceField` | Primitivos de apresentação reusados entre abas |

Todos recebem dados e callbacks via props (`onChange`, `onSave`, `onLoad`
etc.) — nenhum componente filho importa `storage.ts`, chama Server Actions ou
duplica estado (além de não ter nenhum estado próprio: são funções puras de
apresentação).

## 4. Confirmação — comportamento não mudou

- Mesmos 6 nomes de aba, mesma ordem, mesmo `data-testid="tab-<id>"`.
- Mesmos textos de botão ("Salvar personagem", "Novo personagem", "Carregar",
  "Apagar", "Restaurar recursos ao máximo").
- Mesma lógica de clamp em atributos/perícias, mesmo `parseRecursoAtual`
  (inteiro, sem negativo) para recursos atuais — ambos continuam em
  `CharacterSheetClient.tsx`, só os componentes de input mudaram de lugar.
- Mesmo fluxo de salvar/carregar via `normalizeCharacter` + Server Actions —
  nada nessa lógica foi tocado, só movida a apresentação ao redor dela.
- Confirmado na prática com o teste manual completo (seção 6).

## 5. Resultado do build e do `test:character-storage`

```
$ npm run build
✓ Compiled successfully in 2.5s
  Running TypeScript ...
  Finished TypeScript in 2.3s ...
✓ Generating static pages using 4 workers (2/2) in 335ms
```

```
$ npm run test:character-storage
=== test-character-storage ===
1. Criado: id=838e590a-2d42-4e32-9ca3-dce06ec6dda8, schema_version=1
2. Carregado por id: nome="__TESTE_STORAGE_RUPTURA__"
3. Atualizado: nome="__TESTE_STORAGE_RUPTURA___editado", corpo=4
4. Encontrado na listagem (2 personagens no total).
5. Apagado e confirmado ausente via getCharacter.
6. Confirmado: nenhum registro de teste residual.
=== test-character-storage: TODOS OS PASSOS PASSARAM ===
```

Ambos passaram sem erros — confirma que a refatoração não quebrou tipos nem a
camada de storage.

## 6. Resultado do teste manual (browser, via preview tools)

Executados os 13 passos pedidos, de ponta a ponta:

1. Abri `/dev/character-sheet`.
2. Troquei entre as 6 abas (Atributos, Perícias, Personagens salvos, Debug,
   Geral) — todas renderizaram com os mesmos textos de antes.
3. Nome alterado para "Teste Refatoracao" (aba Geral).
4. Corpo=4, Mente=3, Ânimo=5 (aba Atributos).
5. Aba Recursos.
6. Derivados confirmados: `pv_max=14, pe_max=13, mana_max=20,
   integridade_max=20, reacoes_por_rodada=3, andar_m=14m, correr_m=28m,
   pa_max=3` — todos corretos.
7. "Restaurar recursos ao máximo".
8. Editei manualmente: PV=7, PE=8, Mana=11, Integridade=15.
9. "Salvar personagem" → "✓ Salvo".
10. Página recarregada.
11. Fui em "Personagens salvos" → "Carregar" no personagem de teste.
12. Confirmado: nome="Teste Refatoracao" (aba Geral), atributos
    `{corpo:4, mente:3, animo:5}` (aba Atributos), derivados idênticos ao
    passo 6 e recursos atuais `{pv:7, pe:8, mana:11, integridade:15}` (aba
    Recursos) — todos corretos após reload + carregar.
13. Apaguei o personagem de teste via "Apagar" — confirmado que sobrou só
    "Kael Ironwood" na lista.

Resultado: **passou em todos os 13 passos**.

## 7. Confirmação de escopo

- **Inventário, magia, combate**: não implementados.
- **Banco/migrations**: nenhuma alteração.
- **`storage.ts`**: não alterado.
- **Biblioteca do Sistema** (`src/lib/content`): não alterada.
- Nenhuma chave secreta exposta — refatoração foi inteiramente de UI/
  apresentação, sem tocar em env vars ou Server Actions.

---

# Checkpoint v0.7 — Modo Jogo e Modo Evolução

Adiciona um seletor de modo à ficha (`Modo Jogo` / `Modo Evolução`), conforme o
PRD: Jogo é a visão padrão de sessão (só o que muda em jogo é editável);
Evolução é o modo deliberado para alterações permanentes. Sem progressão por
PM ainda — isso fica para uma etapa futura.

## 1. Arquivos criados

- `src/app/dev/character-sheet/components/ModeToggle.tsx` — exporta
  `SHEET_MODES`, o tipo `SheetMode` (`"jogo" | "evolucao"`) e o componente
  `ModeToggle` (dois botões, com `data-testid="mode-jogo"`/`"mode-evolucao"`).

## 2. Arquivos alterados

- `src/app/dev/character-sheet/CharacterSheetClient.tsx` — novo estado
  `sheetMode` (`useState<SheetMode>("jogo")`, padrão Jogo); `updateAtributo` e
  `updatePericia` agora recusam a mudança (`return` antecipado) quando
  `sheetMode === "jogo"` — defesa em profundidade, já que o input desabilitado
  já não dispara `onChange`; `sheetMode` e `onModeChange` passados para
  `GeneralTab`; `readOnly={sheetMode === "jogo"}` passado para `AttributesTab`
  e `SkillsTab`.
- `src/app/dev/character-sheet/components/GeneralTab.tsx` — recebe
  `sheetMode`/`onModeChange`, renderiza `<ModeToggle>` no topo da aba.
- `src/app/dev/character-sheet/components/AttributesTab.tsx` — recebe
  `readOnly: boolean`; passa `disabled={readOnly}` para cada `NumberField` e
  mostra "Edite este bloco no Modo Evolução." quando `readOnly`.
- `src/app/dev/character-sheet/components/SkillsTab.tsx` — mesma mudança de
  `AttributesTab` (prop `readOnly`, `disabled`, aviso).
- `src/app/dev/character-sheet/components/NumberField.tsx` — novo prop opcional
  `disabled`; quando ativo, o `<input>` ganha `disabled`, opacidade reduzida e
  cursor `not-allowed`.

`ResourcesTab.tsx` **não foi alterado** — recursos atuais continuam editáveis
em ambos os modos por design (item 3/4 do pedido), então não havia nada para
mudar ali. `storage.ts` e `normalizeCharacter.ts` também não foram tocados.

## 3. Comportamento do Modo Jogo (padrão)

- Nome: editável (aba Geral).
- Recursos atuais (PV/PE/Mana/Integridade): editáveis, botão "Restaurar
  recursos ao máximo" funcionando normalmente.
- Atributos: campos `disabled`, com aviso "Edite este bloco no Modo Evolução."
  no topo da aba.
- Perícias: mesma coisa — campos `disabled` + aviso.
- Nenhuma aba foi removida; as abas Atributos/Perícias continuam visíveis e
  navegáveis, só os campos dentro delas ficam travados.

## 4. Comportamento do Modo Evolução

- Atributos voltam a ser editáveis (sem `disabled`, sem aviso).
- Perícias voltam a ser editáveis.
- Recursos atuais continuam editáveis (sem mudança de comportamento entre os
  dois modos).
- Derivados continuam recalculando via `useMemo` ao alterar atributos —
  nenhuma mudança nessa lógica.

## 5. O que fica travado em cada modo

| Bloco | Modo Jogo | Modo Evolução |
|---|---|---|
| Nome | editável | editável |
| Atributos | **travado** (+ aviso) | editável |
| Perícias | **travado** (+ aviso) | editável |
| Recursos atuais | editável | editável |
| Derivados | somente leitura (sempre foram) | somente leitura |

## 6. Confirmação — salvar/carregar continua funcionando

- `sheetMode` é estado de UI local — **não** entra no payload salvo (não foi
  adicionado a `Character`/`normalizeCharacter`, exatamente como pedido).
- `handleSave` continua chamando `normalizeCharacter(character, derivados)` e
  `createCharacter`/`updateCharacter` sem nenhuma mudança.
- Ao carregar (`handleLoad`), o modo da UI **é mantido como estava antes do
  carregamento** — `handleLoad` não toca em `sheetMode`. Essa foi a opção mais
  simples (zero código extra) entre as duas sugeridas no pedido; documentado
  aqui conforme solicitado. Na prática, como o `sheetMode` por padrão começa
  em "jogo" e só muda por ação explícita do usuário, isso significa: se o
  usuário não mexeu no seletor, carregar um personagem mantém Modo Jogo; se
  ele tinha trocado para Evolução antes de carregar, o carregamento preserva
  Evolução.
- Testado na prática (seção 8): editei atributos/perícia em Modo Evolução,
  voltei para Modo Jogo, editei PV atual, salvei, recarreguei a página,
  carreguei o personagem — atributos, perícias, derivados e PV salvo vieram
  todos corretos.

## 7. Resultado do build e do `test:character-storage`

```
$ npm run build
✓ Compiled successfully in 1535ms
  Running TypeScript ...
  Finished TypeScript in 2.2s ...
✓ Generating static pages using 4 workers (2/2) in 241ms
```

```
$ npm run test:character-storage
=== test-character-storage ===
1. Criado: id=97976cea-477e-4caa-a549-418d74b4aa85, schema_version=1
2. Carregado por id: nome="__TESTE_STORAGE_RUPTURA__"
3. Atualizado: nome="__TESTE_STORAGE_RUPTURA___editado", corpo=4
4. Encontrado na listagem (2 personagens no total).
5. Apagado e confirmado ausente via getCharacter.
6. Confirmado: nenhum registro de teste residual.
=== test-character-storage: TODOS OS PASSOS PASSARAM ===
```

Ambos passaram sem erros.

## 8. Resultado do teste manual (browser, via preview tools)

Executados os 18 passos pedidos, de ponta a ponta:

1–2. Abri `/dev/character-sheet` — confirmado abrindo em Modo Jogo (botão
   "Modo Jogo" em negrito/destacado).
3. Aba Atributos: `corpo.disabled === true`, aviso "Edite este bloco no Modo
   Evolução." presente.
4. Aba Perícias: input `disabled === true`, mesmo aviso presente.
5. Aba Recursos: PV/PE/Mana/Integridade atuais com `disabled === false` —
   continuam editáveis em Modo Jogo.
6. Voltei para Geral, cliquei "Modo Evolução".
7. Aba Atributos: `disabled === false` (destravado); Corpo=4, Mente=3,
   Ânimo=5.
8. Aba Perícias: `disabled === false`; alterei uma perícia (Arcanismo) para 2.
9. Aba Recursos — derivados confirmados: `pv_max=14, pe_max=13, mana_max=20,
   integridade_max=20, reacoes_por_rodada=3, andar_m=14m, correr_m=28m,
   pa_max=3`.
10. Voltei para Geral, cliquei "Modo Jogo".
11. Aba Atributos: voltou `disabled === true`, valores preservados
    (Corpo=4, Mente=3, Ânimo=5); aba Perícias: também `disabled === true`.
12. Aba Recursos: "Restaurar recursos ao máximo".
13. Editei PV atual para 7.
14. Nome alterado para "Teste Modo Jogo Evolucao" → "Salvar personagem" →
    "✓ Salvo".
15. Página recarregada.
16. Fui em "Personagens salvos" → "Carregar" no personagem de teste.
17. Confirmado: atributos `{corpo:4, mente:3, animo:5}`, derivados
    `{pv_max:14, pe_max:13, mana_max:20, integridade_max:20}`, recursos atuais
    `{pv:7, pe:13, mana:20, integridade:20}` (PV editado preservado, os
    outros três nos máximos restaurados no passo 12) — todos corretos.
18. Apaguei o personagem de teste via "Apagar" — confirmado que sobrou só
    "Kael Ironwood" na lista.

Resultado: **passou em todos os 18 passos**.

## 9. Confirmação de escopo

- **PM/progressão**: não implementado — o seletor de modo existe, mas não há
  nenhuma lógica de pontos de melhoria associada ainda.
- **Inventário, magia, combate**: não implementados.
- **Banco/migrations**: nenhuma alteração.
- **`storage.ts`**: não alterado.
- **`normalizeCharacter.ts`**: não alterado — `sheetMode` é estado de UI puro,
  não passa pelo payload nem pela normalização.
- **Biblioteca do Sistema** (`src/lib/content`): não alterada.
- Nenhuma chave secreta exposta.

---

# Checkpoint v0.8 — Contadores de PA e Reações

Adiciona controle manual de PA gastos e Reações usadas na aba Recursos,
conforme o PRD: a ficha controla o que é gasto/usado, sem implementar
combate, rodada, janela rápida/lenta ou ações automatizadas ainda.

## 1. Arquivos criados

- `src/app/dev/character-sheet/components/TurnCounters.tsx` — renderiza os
  dois blocos (PA e Reações) com `usados / max`, `restantes`, aviso "acima do
  máximo" quando aplicável, e os 3 botões de cada (gastar/usar, desfazer,
  resetar). Internamente usa um `CounterBlock` não-exportado compartilhado
  pelos dois blocos.

## 2. Arquivos alterados

- `src/lib/character/types.ts` — novo tipo `CharacterGameState`
  (`pa_gastos?`, `reacoes_usadas?`, mais índice para campos futuros) e novo
  campo opcional `estado_jogo?: CharacterGameState` em `Character`.
- `src/lib/character/createCharacter.ts` — `createInitialCharacter` agora
  inicia `estado_jogo: { pa_gastos: 0, reacoes_usadas: 0 }`.
- `src/lib/character/normalizeCharacter.ts` — garante `estado_jogo` com
  `pa_gastos`/`reacoes_usadas` padrão `0` quando ausentes, preservando
  qualquer valor já existente e qualquer campo desconhecido dentro do objeto
  (mesmo padrão já usado para `recursos_atuais`/`metadados`).
- `src/app/dev/character-sheet/components/ResourcesTab.tsx` — nova `Section
  title="Turno"` com `<TurnCounters>`, recebendo `estadoJogo` e os 6
  callbacks (gastar/desfazer/resetar PA, usar/desfazer/resetar reação).
- `src/app/dev/character-sheet/CharacterSheetClient.tsx` — novas funções
  `adjustEstadoJogo(key, delta)` e `resetEstadoJogo(key)`; passadas para
  `ResourcesTab` via 6 callbacks específicos. **Sem guard de `sheetMode`** —
  diferente de `updateAtributo`/`updatePericia`, esses contadores ficam
  editáveis nos dois modos (item 6 do pedido).

`storage.ts` não foi alterado.

## 3. Estrutura de `estado_jogo` no payload

```json
"estado_jogo": {
  "pa_gastos": 2,
  "reacoes_usadas": 4
}
```

Objeto opcional dentro de `Character`, paralelo a `recursos_atuais` e
`metadados`. Não é progressão nem ficha permanente — é estado operacional de
turno/rodada, por isso não é travado pelo Modo Jogo/Evolução.

## 4. Comportamento dos contadores de PA

- `pa_gastos` começa em `0` (personagem novo) ou no valor salvo (personagem
  carregado).
- "Gastar 1 PA": `pa_gastos += 1`.
- "Desfazer 1 PA": `pa_gastos -= 1`, nunca abaixo de `0`
  (`Math.max(0, ...)`).
- "Resetar PA": volta `pa_gastos` para `0`.
- PA máximo exibido = `derivados.pa_max` (calculado pelas regras reais).
- Se `pa_gastos > pa_max`, aparece aviso discreto "acima do máximo" — não há
  bloqueio.

## 5. Comportamento dos contadores de Reações

Mesma lógica de PA, espelhada para `reacoes_usadas`:

- "Usar reação": `reacoes_usadas += 1`.
- "Desfazer reação": `reacoes_usadas -= 1`, nunca abaixo de `0`.
- "Resetar reações": volta para `0`.
- Máximo exibido = `derivados.reacoes_por_rodada`.
- Aviso "acima do máximo" quando `reacoes_usadas > reacoes_por_rodada`, sem
  bloqueio.

## 6. Confirmação — compatibilidade com personagens antigos

`normalizeCharacter` trata `estado_jogo` ausente exatamente como já tratava
`recursos_atuais`/`metadados`: se o payload salvo não tiver o campo (caso de
personagens salvos antes deste checkpoint, ex. "Kael Ironwood"),
`pa_gastos`/`reacoes_usadas` viram `0` automaticamente, sem lançar erro. Não
testei especificamente o carregamento de "Kael Ironwood" nesta rodada (já
verificado em checkpoints anteriores que personagens pré-`estado_jogo`/
pré-`metadados` abrem sem quebrar), mas a lógica é idêntica à já validada.

## 7. Resultado do build e do `test:character-storage`

```
$ npm run build
✓ Compiled successfully in 1530ms
  Running TypeScript ...
  Finished TypeScript in 2.1s ...
✓ Generating static pages using 4 workers (2/2) in 239ms
```

```
$ npm run test:character-storage
=== test-character-storage ===
1. Criado: id=eeb72245-9df7-4d5a-95f4-f4b3b73945dc, schema_version=1
2. Carregado por id: nome="__TESTE_STORAGE_RUPTURA__"
3. Atualizado: nome="__TESTE_STORAGE_RUPTURA___editado", corpo=4
4. Encontrado na listagem (2 personagens no total).
5. Apagado e confirmado ausente via getCharacter.
6. Confirmado: nenhum registro de teste residual.
=== test-character-storage: TODOS OS PASSOS PASSARAM ===
```

Ambos passaram sem erros.

## 8. Resultado do teste manual (browser, via preview tools)

Executados os 22 passos pedidos, de ponta a ponta:

1–3. Abri `/dev/character-sheet`, criei novo personagem, fui para Modo
   Evolução.
4. Corpo=4, Mente=3, Ânimo=5.
5–6. Aba Recursos.
7. Derivados confirmados: `pa_max=3`, `reacoes_por_rodada=3`. PA `0/3`,
   restantes `3`; Reações `0/3`, restantes `3` — confirmados via
   `data-testid`.
8. "Gastar 1 PA" x2.
9. Confirmado: PA `2/3`, restantes `1`.
10. "Usar reação" x1.
11. Confirmado: Reações `1/3`, restantes `2`.
12. "Desfazer 1 PA".
13. Confirmado: PA `1/3`.
14. "Resetar PA".
15. Confirmado: PA `0/3`.
16. "Usar reação" x4 (a partir de Reações já zeradas — resetei antes para
    isolar a contagem, já que clicar 4 vezes a partir do `1` do passo 10
    daria `5`, não `4`; resetar primeiro foi o que fez o resultado bater
    com o `4/3` esperado no passo 17).
17. Confirmado: Reações `4/3`, aviso "acima do máximo" presente.
18. Nome "Teste PA Reacoes" → "Salvar personagem" → "✓ Salvo".
19. Página recarregada.
20. "Personagens salvos" → "Carregar" no personagem de teste.
21. Confirmado: PA `0/3` e Reações `4/3` (com aviso) — exatamente os valores
    salvos no passo 18, voltaram intactos após reload + carregar.
22. Apaguei o personagem de teste — confirmado que sobrou só "Kael Ironwood"
    na lista.

Resultado: **passou em todos os 22 passos** (com a ressalva documentada no
passo 16 sobre o reset prévio de Reações, necessário para o resultado bater
com o `4/3` esperado no passo 17).

## 9. Confirmação de escopo

- **Combate, rodada, ações, janela rápida/lenta**: não implementados — só os
  contadores manuais pedidos.
- **Inventário, magia**: não implementados.
- **Banco/migrations**: nenhuma alteração.
- **`storage.ts`**: não alterado.
- **Biblioteca do Sistema** (`src/lib/content`): não alterada.
- Nenhuma chave secreta exposta.
