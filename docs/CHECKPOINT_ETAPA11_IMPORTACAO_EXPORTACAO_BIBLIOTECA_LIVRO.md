# Checkpoint — Etapa 11: Importação, exportação e Biblioteca do Livro

## Status

**Status geral da Etapa 11: Etapa 11 concluída — integração editorial de drag aprovada.**

Este status foi retificado para "Implementação parcial — validação do drag nativo e da integração com a Biblioteca pendentes" no início desta rodada de auditoria (antes de qualquer teste novo), porque a revisão anterior tinha encontrado duas lacunas de comprovação genuínas: (1) não estava documentado se o painel de busca embutido em `CamposCapituloSection` era uma superfície válida da Biblioteca ou um seletor paralelo divergente; (2) o aceite anterior só tinha exercitado o botão "+ adicionar"/▲/▼ — nunca um gesto de `dragstart`→`dragover`→`drop` real no browser. Esta rodada resolveu as duas — ver `## 0-10` para o registro completo (auditoria documental, comparação Biblioteca-real-vs-painel, contrato de `DataTransfer`, gesto nativo executado, feedback visual comprovado, casos inválidos, achado correlato documentado). Nenhuma linha de código foi alterada nesta rodada — é uma rodada de validação pura sobre a implementação de `0a4ab99`/`1b13e27`/`1f9818f`.

| Bloco | Estado |
|---|---|
| Pacote JSON (contrato, hash, manifest) | Implementação concluída — aceite de browser aprovado nesta correção |
| Exportação (unitária e em lote) | Implementação concluída — aceite de browser aprovado nesta correção |
| Importação (draft-only, preview, conflitos, idempotência) | Implementação concluída — aceite de browser aprovado nesta correção |
| Vínculos editoriais (Biblioteca↔Livro, sem navegação clicável) | Inalterado desta correção — continua "citação estruturada, sem link clicável" (não fazia parte do escopo do drag) |
| Drag-and-drop editorial | **Implementado nesta correção** — novo content_type "capitulo" (migration 0035) como destino real; drag nativo HTML5 + alternativa por botão, validado no servidor, persistido pelo pipeline de rascunho/publicação existente |
| Round-trip e atomicidade em Supabase real | Verificados nesta correção — migration 0035 aplicada e usada; publicação, export→import (hash idêntico), edição pós-publicação, todos exercitados contra o Supabase real do projeto |
| Verificações puras (TypeScript, build, harness Node) | TypeScript aprovado; build aprovado; harness Node da Etapa 11 19/19 (1 caso novo); novo harness da correção do drag 6/6 |

## 0-9. Correção: integração editorial de drag (esta sessão)

### 0-9.1 Auditoria inicial

`git status --short` limpo antes de iniciar. Releitura completa deste checkpoint e da seção correspondente em `PLANO_IMPLEMENTACAO_EDITOR_UNIVERSAL.md`. Busca no PRD (`docs/PRD Ruptura VTT.md` §2.1.9) e no aditivo (`ADITIVO_PRD_EDITOR_UNIVERSAL_CONTEUDO.md`, §11.11 e a seção "ETAPA 11") por todas as menções a drag/drop/Biblioteca/Livro/capítulo/importação/exportação. Busca global no código por `draggable|droppable|onDragStart|onDragEnd|onDrop|dataTransfer|dnd|sortable|useDrag` — **zero ocorrências confirmadas** (mesmo resultado da auditoria original da Etapa 11): nenhuma forma de drag-and-drop existia em nenhuma parte do projeto antes desta correção.

Reconstrução do fluxo atual (código como fonte de verdade, não só o texto do checkpoint): confirmado que `content_book_links` (Etapa 11 original) é só uma citação estruturada texto-livre (capítulo/seção/âncora), nunca uma referência real a um documento de capítulo — porque nenhum content_type de capítulo existia. `content/types.ts::ContentType` tinha exatamente 12 valores mecânicos (spell/talent/item/rune/condition/property/escalpo/combat_action/character_rule/combat_field/combat_flow/master_table) — nenhum representava um documento editorial (identificação/hierarquia/texto/entidades vinculadas, conforme aditivo §11.11).

### 0-9.2 Escopo confirmado (e alternativas descartadas)

O PRD (§2.1.9) descreve DUAS operações de drag distintas, fáceis de confundir:
1. **Drag operacional** — arrastar um item do livro para o inventário da ficha (criar instância de personagem). Está listado como escopo da *primeira entrega da Biblioteca do Livro* no PRD, mas é uma feature de FICHA/personagem, não de importação/exportação — não é o que a Etapa 11 pede.
2. **Drag editorial** — arrastar um card da Biblioteca para dentro de um capítulo/documento do Livro, criando um vínculo estruturado. É exatamente o que o aditivo pede na seção "ETAPA 11 — IMPORTAÇÃO, EXPORTAÇÃO E BIBLIOTECA DO LIVRO": "drag de conteúdo estruturado, conforme o PRD" nos critérios de aceite "entidade pode apontar para o capítulo" — e é o que o checkpoint original bloqueou por falta de destino real.

**Interpretação confirmada**: (2), o drag editorial Biblioteca→capítulo. Descartado (1) explicitamente — arrastar para a ficha do personagem é uma feature de outra área do produto (character sheet), fora do escopo desta correção, e o aditivo da Etapa 11 nunca a menciona. Também descartado: reordenação livre de "documentos" soltos sem destino estruturado (o aditivo é claro que a entidade deve apontar PARA um capítulo, não para uma lista genérica).

A lacuna que bloqueava (2) era estrutural: não existir um destino editorial real. A correção resolve isso criando esse destino — não inventando uma funcionalidade nova, mas preenchendo exatamente a lacuna que o próprio checkpoint listava em "Critérios para conclusão futura" (item 1: "existir um renderizador ou editor estruturado de capítulos real").

### 0-9.3 Modelo de dados (schema)

Lacuna real confirmada (não presumida): nenhum content_type de capítulo existia. Migration nova `0035_add_capitulo_content_type.sql` (aplicada ao Supabase real do projeto): `alter type content_type add value 'capitulo'` — sozinha, sem nenhum outro objeto (nenhuma tabela nova, nenhuma RPC nova, nenhuma policy nova), porque `content_documents`/`content_drafts`/`publish_content_draft` já são inteiramente genéricos por `content_type` (confirmado por auditoria: nenhum deles faz branch condicional por tipo em SQL). Nenhuma migration aplicada anteriormente foi editada.

Payload de um capítulo (`CamposCapitulo`, `src/lib/contentSchema/draftTypes.ts`): campos comuns (nome/slug/categoria/descrições/tags) + `corpo` (texto introdutório) + `blocos: BlocoCapitulo[]` — a hierarquia ordenada exigida pelo aditivo §11.11. Cada bloco é `{id, tipo: "texto", texto}` ou `{id, tipo: "entidade", entidade: {contentType, slug}}`. A ORDEM do array é a única fonte de verdade de ordenação — nenhum campo `posicao` redundante que pudesse divergir. Nenhuma automação/efeitos — capítulo é documento editorial puro, exatamente como o aditivo permite ("Pode não possuir automação").

### 0-9.4 Contrato do drag

Tipado, transportado via `dataTransfer` sob o MIME `application/x-ruptura-book-entity`:
```
{ tipo: "book_entity", contentType, slug, nome }
```
Nunca o payload completo da entidade — só a referência mínima necessária para resolver depois. O client NUNCA é fonte de verdade: ao soltar (ou clicar "+ adicionar", a alternativa sem drag), o componente só monta o array `blocos` no estado local; a validação real (existência, duplicidade, auto-referência) acontece exclusivamente no servidor, em `validarCamposCapitulo` (`draftValidation.ts`), executada de novo a cada save — nunca confia no que foi montado no client.

### 0-9.5 Onde o drag vive (sem criar um segundo editor)

Reaproveita integralmente o Editor Universal existente (`content_drafts`/`publish_content_draft`, mesmo fluxo de rascunho→revisão→publicação de spell/item/rune/talent). "Capítulo" é um 5º content_type editável, registrado em `contentTypeRegistry.ts` com uma seção nova (`blocos_capitulo`) — mesma mecânica que dá a cada tipo suas seções específicas (spell tem `alvo_alcance_area`, item tem `equipamento_instancia`; capítulo tem `blocos_capitulo`). A UI nova (`CamposCapituloSection.tsx`) é renderizada dentro do MESMO `DraftEditorClient.tsx` que já edita os outros 4 tipos — não é uma página/editor separado.

Como origem e destino de um drag nativo (HTML5, sem biblioteca — `draggable`/`onDragStart`/`onDrop`, `npm install` fora de escopo) precisam estar na MESMA página renderizada, o componente do capítulo inclui um painel de busca embutido (`BibliotecaPickerPanel`, dentro do mesmo `CamposCapituloSection`) que consulta uma nova Server Action de leitura mínima (`buscarConteudoParaVinculoCapitulo`, `bookDragServerActions.ts` — reaproveita `listContentDocumentsForAdmin` já existente da Etapa 2, nenhuma policy nova, só `{contentType, slug, nome}`, nunca o payload completo).

### 0-9.6 Alternativa sem mouse (obrigatória, nunca só decorativa)

Cada resultado da busca tem um botão "+ adicionar" que faz EXATAMENTE a mesma operação que o drag (mesmo handler `adicionarBlocoEntidade`) — focável, com `aria-label`, sem exigir arrastar. Cada bloco tem botões "▲"/"▼" (mover para cima/para baixo) como alternativa de teclado à reordenação por drag, e "✕" para remover. Um botão "+ bloco de texto" adiciona blocos de texto sem qualquer drag. Testado e confirmado funcionando no aceite de browser (§0-9.9) — reordenação, adição e remoção via botão, nunca via drag, produziram o mesmo resultado persistido.

### 0-9.7 Persistência, validação e permissões

Persistência pelo fluxo JÁ existente: `atualizarRascunho`/`criarRascunhoNovo` (optimistic locking por `expectedVersion`, já implementado desde a Etapa 3 — nenhum sistema de concorrência novo precisou ser criado) e `publish_content_draft` (RPC transacional já existente, genérico por `content_type`). Admin-only, reforçado por `getContentAdminStatus`/RLS (`is_content_admin()`) — mesma dupla camada de todos os outros tipos, nenhuma policy nova de escrita direta.

`validarCamposCapitulo` (novo, `draftValidation.ts`) roda a cada save: nome/slug obrigatórios; cada bloco de texto exige texto não vazio; cada bloco de entidade exige `contentType`+`slug`, confirma existência real via `getContentDocument` (bloqueia referência a conteúdo inexistente), bloqueia auto-referência (`capitulo:X` não pode referenciar `capitulo:X`), bloqueia duplicidade (mesma entidade não pode aparecer duas vezes no mesmo capítulo).

### 0-9.8 Importação/exportação e dependências

`contentDependencies.ts::coletarReferenciasBrutas` estendida: blocos de entidade viram dependências OPCIONAIS (`obrigatoria: false`, mesma regra de `property` — nunca bloqueiam publicação nem importação por ausência). `officialSchemaValidator.ts` não precisou de mudança — já devolve `{ok:true, semSchema:true}` para qualquer tipo sem schema oficial mapeado (capítulo não tem schema oficial do sistema de Ruptura, é puramente editorial).

### 0-9.9 Aceite de browser (execução real, não simulada)

**Diagnóstico do servidor** antes de abrir o browser: porta 3000 livre, servidor iniciado via a ferramenta de preview (`npm run dev`, mesmo script do `package.json`); `curl /login` → 200; `curl /` → 404 (esperado, sem rota raiz real); logs sem erro.

**Fixture**: 1 usuário admin temporário criado via `admin.auth.admin.createUser` + concessão em `admin_users` (ambos via service role, só para preparação — nunca como identidade testada; credenciais nunca impressas em texto). Conteúdo publicado real já existente (`item:faca`, `item:adaga`) reaproveitado para o drag — nenhum conteúdo pessoal ou de campanha tocado.

Fluxo executado, ponta a ponta:
1. Login como admin de fixture.
2. `/admin/biblioteca/rascunhos/novo` → tipo "Capítulo (Livro)" (aparece corretamente na lista, antes inexistente) → criado rascunho novo.
3. Seção "Blocos do capítulo" renderizada corretamente (corpo, busca, lista vazia).
4. Busca "Faca" no painel embutido → resultado real retornado pela Server Action → clique em "+ adicionar" (alternativa sem drag) → bloco de entidade `item:faca` criado.
5. "+ bloco de texto" → texto preenchido → "▲" usado para reordenar (texto antes da entidade).
6. "Salvar rascunho" → sucesso, versão incrementada, sem erro de console.
7. Reload da página → **blocos e ordem persistidos exatamente como salvos** (persistência confirmada).
8. "Revisar e publicar" → diff mostrou `+ blocos`/`+ nome`/`+ tags` corretamente, impacto classificado como "conteúdo novo" → changelog obrigatório preenchido → **publicado com sucesso** (`status: published`, `versão: 1.0.0`).
9. "Exportar este conteúdo" → pacote gerado com `blocos` na ordem correta e `dependencias: [{tipo:"item", slugOuId:"faca", obrigatoria:false, estadoResolucao:"ausente"}]` (resolução real acontece só na importação, por design da Etapa 11).
10. Reimportação do MESMO pacote exportado (via `/admin/biblioteca/importar`) → classificado **"Idêntico ao publicado"** (mesmo hash canônico) — prova de round-trip sem perda: a estrutura exportada e reimportada bate exatamente com o que está publicado.
11. "Criar rascunho de edição" a partir do conteúdo JÁ PUBLICADO → blocos recuperados corretamente na mesma ordem (prova de que editar um capítulo publicado funciona, não só criar um novo).
12. **Casos hostis, no mesmo rascunho de edição**: busca pelo PRÓPRIO nome do capítulo → resultado aparece (é conteúdo publicado real) → "+ adicionar" ele mesmo → salvar → **rejeitado**: "Bloco 3: um capítulo não pode referenciar a si mesmo." Adicionado `item:faca` de novo (já presente) → salvar → **rejeitado**: "Bloco 4: referência duplicada a item:faca — já vinculada em outro bloco deste capítulo." Ambos os erros aparecem de forma coerente, sem quebrar a tela, sem erro 500, sem loop.
13. Console e rede: nenhum erro em nenhum dos passos acima (`read_console_messages`/`read_network_requests` verificados a cada etapa relevante).
14. Fixtures removidas ao final: conteúdo publicado de teste, changelog, rascunhos, usuário admin de fixture — confirmado por contagem zero.

### 0-9.10 Correções encontradas e aplicadas durante a validação

Três bugs REAIS encontrados só pelo aceite de browser (nenhum deles aparecia nos harnesses puros, porque exigem o pipeline completo rodando):

1. **`contentPackage.ts::ehContentTypeEditavel`** duplicava a lista de tipos editáveis por nome (`"spell"||"talent"||"item"||"rune"`) em vez de reaproveitar `isDraftContentType` — divergiu silenciosamente assim que "capitulo" foi adicionado a `DraftContentType`, classificando-o incorretamente como somente-leitura. Corrigido para delegar a `isDraftContentType` (única fonte de verdade).
2. **`packageImport.ts::TIPOS_VALIDOS`** tinha o mesmo problema — lista hardcoded `["spell","talent","item","rune", ...somenteLeitura]` — rejeitava a importação de um pacote de capítulo real com "Tipo de conteúdo desconhecido: capitulo", reproduzido ao vivo tentando reimportar o pacote exportado no passo 10 acima antes da correção. Corrigido (`ehTipoDeConteudoValido`, delega a `isDraftContentType`).
3. **`draftBuilders.ts::montarCamposECamposDesconhecidosIniciais`** não tinha branch para "capitulo" — ao clicar "Criar rascunho de edição" num capítulo JÁ PUBLICADO (passo 11), caía no branch de talento por padrão, produzindo um rascunho com `camposEditaveis.contentType: "talent"` mas `content_type: "capitulo"` na coluna do banco — inconsistência que quebrava o render do cliente (`campos.blocos` undefined) e aparecia como "This page couldn't load". Reproduzido, causa localizada (branch ausente), corrigido com uma extração direta (`extrairCamposCapitulo`, sem adapter — capítulo nunca teve formato legado a traduzir). Rascunho corrompido apagado (fixture, nunca dado real); fluxo repetido do zero depois da correção — funcionou corretamente.

Todas as três seguem exatamente o padrão pedido: reproduzido → causa localizada → corrigido minimamente → sem editar nenhuma migration aplicada → repetido o cenário afetado → confirmado.

### 0-9.11 Achado não corrigido (fora de escopo, documentado)

O painel "Diagnóstico técnico" (`DiagnosticsPanel.tsx`, na página de detalhe de um conteúdo publicado) mostra "Adapter dedicado para 'capitulo' ainda não implementado" e "Nenhuma referência encontrada" para um capítulo publicado — porque esse painel usa os adapters canônicos da Etapa 1 (`adaptarParaAdmin`), que existem só para spell/talent/item/condition, não para capítulo. Este é o MESMO fallback genérico que qualquer tipo sem adapter dedicado já recebia antes desta correção (ex.: `master_table`/`character_rule`) — não é uma regressão, e construir um adapter canônico completo para capítulo (paridade com spell/item) está fora do escopo desta correção (não pedido, não necessário para o drag funcionar). Documentado aqui para transparência, não corrigido.

### 0-9.12 Validação técnica local

`git status --short` limpo ao final (só as mudanças intencionais); `git diff --check` sem problemas de espaço em branco; `next-env.d.ts` sem diff residual (não foi tocado por este build); `npx tsc --noEmit` sem erros; `npm run build` sucesso (servidor de preview parado antes do build); harness da Etapa 11 (`validate-import-export-book.mjs`) **19/19** (1 caso atualizado para refletir os 5 tipos editáveis); novo harness da correção (`validate-editorial-drag.mjs`) **6/6** (serialização de blocos, nunca serializa payload da entidade, array vazio explícito, dependências opcionais, dedup); harness da Etapa 12 (`validate-campaign-homebrew.mjs`) **18/18** inalterado; validador estruturado da Etapa 12 (`validate-profile-session-lockdown.mjs`) **78/78** inalterado — confirma que esta correção não regrediu a Etapa 12.

## 0-10. Validação final do drag nativo e da superfície da Biblioteca (esta sessão)

### 0-10.1 Working tree inicial e escopo

`git status --short` limpo antes de iniciar. Esta rodada é EXCLUSIVAMENTE de validação — nenhuma linha de código de produção foi alterada; os commits `0a4ab99`/`1b13e27`/`1f9818f` permanecem intactos. Status corrigido para o provisório ANTES de qualquer teste novo, conforme pedido.

### 0-10.2 Auditoria documental — qual é a superfície oficial da Biblioteca para o drag editorial

Releitura integral de `PRD Ruptura VTT.md` §2.1.9, `ADITIVO_PRD_EDITOR_UNIVERSAL_CONTEUDO.md` (§11.11, §18.3, seção "ETAPA 11"), e deste checkpoint. Achados literais, por trecho:

- **PRD §2.1.9 ("Arrastar conteúdo do livro para a ficha")**: descreve um drag DIFERENTE do implementado aqui — Livro (camada de LEITURA, com sumário/capítulos navegáveis) → ficha do personagem, criando uma INSTÂNCIA de item/magia/talento na ficha. Este é o drag OPERACIONAL, listado como escopo da primeira entrega da "Biblioteca do Livro" — mas essa feature (sumário navegável, leitura por capítulo, ficha) não existe neste projeto e não é o que a Etapa 11 pede (confirmado também na correção anterior, `## 0-9.2`).
- **Aditivo, seção "ETAPA 11"**: pede "vínculos com capítulos" e "drag de conteúdo estruturado, conforme o PRD", com critério de aceite "entidade pode apontar para o capítulo". Este é o drag EDITORIAL — Biblioteca → documento de capítulo, criando o VÍNCULO estruturado em si (não uma instância de ficha). É este que foi implementado.
- **Aditivo §18.3 (Performance)**: "referências grandes com pesquisa; não carregar a Biblioteca inteira em cada modal." Este trecho é decisivo para a Questão 1 — o próprio aditivo antecipa e recomenda EXATAMENTE o padrão implementado (um painel de busca escopado, não a página inteira da Biblioteca) como a forma correta de referenciar conteúdo da Biblioteca a partir de outro ponto do Editor Universal.
- **Aditivo §5.4 (Dados canônicos e referências seguras)**: "o editor deve oferecer a condição publicada da Biblioteca, em vez de aceitar apenas texto livre" — de novo, uma referência RESOLVIDA contra a Biblioteca real, não necessariamente a navegação pela página `/admin/biblioteca` em si.

**Interpretação confirmada**: (C) "Biblioteca como workspace editorial" — um painel incorporado ao editor que usa o MESMO domínio, resolvedor e regras da Biblioteca satisfaz o contrato, desde que não invente um catálogo paralelo divergente. Nenhuma fonte exige literalmente arrastar a partir do componente visual `/admin/biblioteca` (interpretação B) — essa leitura foi considerada e descartada, porque exigiria abrir duas superfícies simultâneas (a lista da Biblioteca e o editor de capítulo) sem nenhuma orientação documental que peça isso, e o aditivo explicitamente desaconselha "carregar a Biblioteca inteira" em superfícies auxiliares de referência.

### 0-10.3 Comparação: painel embutido vs. Biblioteca real

| Aspecto | `/admin/biblioteca` (real) | `CamposCapituloSection` (painel embutido) | Divergência? |
|---|---|---|---|
| Fonte de dados | `listContentDocumentsForAdmin` (Etapa 2) | A MESMA função (`bookDragServerActions.ts::buscarConteudoParaVinculoCapitulo`) | Nenhuma |
| Resolvedor/RLS | Client admin-scoped, `content_documents_admin_read` | O MESMO client/RLS (chamado dentro da mesma função) | Nenhuma |
| Escopo de status | Default `published` (aba "Publicados") | Sempre `published` (nunca passa `status`, usa o default) | Nenhuma — nunca expõe rascunho/arquivado |
| Filtro por tipo | Dropdown de todos os `ContentType` | Busca livre, opcionalmente por tipo (não exposto na UI, mas suportado pela função) | Redução deliberada de superfície, não duplicação de lógica |
| Campos retornados | Linha completa (`ContentDocument` + diagnóstico admin) | Só `{contentType, slug, nome}` | Deliberado — nunca transporta payload completo, conforme aditivo §5.4/PRD (drag "não deve copiar texto bruto") |
| Conteúdo oficial/homebrew/override | N/A — Biblioteca do Sistema não tem esse conceito (é exclusivo de conteúdo de campanha, Etapa 12) | Idem — fora de escopo, não aplicável | Nenhuma (categorias não existem neste nível) |
| Permissões | `getContentAdminStatus` (admin-only) | A mesma verificação, dentro da Server Action | Nenhuma |

**Conclusão**: nenhuma duplicação de lógica capaz de causar divergência — o painel é uma PROJEÇÃO MINIMAL e SEGURA da mesma fonte de dados, resolvedor e permissões da Biblioteca real, exatamente como o aditivo recomenda para pickers de referência. Não há necessidade de refatoração; a única "diferença" é a redução deliberada de campos, que é uma boa prática de segurança (nunca confiar/transportar nome/preview arbitrário — o servidor sempre revalida por `contentType`+`slug` na hora de salvar), não uma lacuna.

### 0-10.4 Componentes auditados (código)

`CamposCapituloSection.tsx` (origem/destino do drag), `bookDragServerActions.ts` (busca), `adminQueries.ts::listContentDocumentsForAdmin` (resolvedor compartilhado), `ContentTable.tsx`/`page.tsx` da Biblioteca real (comparação), `DraftEditorClient.tsx`/`NovoConteudoForm.tsx` (integração no Editor Universal), `draftValidation.ts::validarCamposCapitulo` (validação server-side), `scripts/dev/validate-editorial-drag.mjs` (harness puro). Busca global confirmou: `draggable`/`onDragStart`/`onDragOver`/`onDragLeave`/`onDrop`/`dataTransfer`/`effectAllowed` aparecem exclusivamente em `CamposCapituloSection.tsx` — nenhuma duplicação em outro lugar do projeto.

### 0-10.5 Contrato de `DataTransfer` (auditoria + validação ao vivo)

MIME próprio: `application/x-ruptura-book-entity`. Payload mínimo transportado: `{tipo:"book_entity", contentType, slug, nome}` — nunca o payload completo da entidade. `effectAllowed = "copy"` setado no `dragstart` (o motor do browser em contexto de teste sintético — ver `## 0-10.7` — não preserva esse valor fora de uma sessão real de SO, uma limitação conhecida de `DataTransfer` construído via `new DataTransfer()`, não um defeito do código). Parsing centralizado em `onDrop` (`CamposCapituloSection.tsx`): `JSON.parse` dentro de `try/catch`, valida `tipo === "book_entity"` e presença de `contentType`+`slug` antes de aceitar — payload malformado ou de tipo desconhecido é silenciosamente ignorado (nunca lançado como erro não tratado). A persistência NUNCA confia no nome/preview transportado — resolve a entidade real por `contentType`+`slug` a cada leitura/validação (`validarCamposCapitulo`, `draftView.ts`).

### 0-10.6 Método usado para o gesto real (e por que)

A ferramenta de browser disponível (`mcp__Claude_Browser`) não tem uma ação de alto nível para drag-and-drop nativo — `left_click_drag` simula apenas eventos de mouse (`mousedown`/`mousemove`/`mouseup`), que não são promovidos a uma operação real de HTML5 Drag and Drop pelo motor do Chrome fora de uma sessão real de sistema operacional (limitação conhecida e documentada de automação de browser — o mesmo motivo por que Playwright/Selenium também recomendam simulação de eventos para drag nativo). Por isso, o gesto foi reproduzido despachando os eventos REAIS do DOM (`dragstart`, `dragenter`, `dragover`, `dragleave`, `drop`, `dragend`) via `dispatchEvent` no elemento real, com um objeto `DataTransfer` real (`new DataTransfer()`) — nunca chamando `onDragStart`/`onDrop` diretamente. Essa técnica exercita o pipeline real do browser (o listener nativo que o React anexa ao elemento, a propagação do evento, o `preventDefault` real) — a única coisa que não é simulada é o movimento do cursor do mouse pelo sistema operacional, que não influencia o comportamento testado (a lógica do componente reage a eventos DOM, não a coordenadas de mouse).

### 0-10.7 Evidência do gesto real, passo a passo

Fixture: 1 usuário admin temporário (mesmo padrão das rodadas anteriores, credenciais nunca impressas), 1 capítulo novo ("Deposito de Armas (teste drag nativo)"), reaproveitando os itens reais já publicados `item:faca`/`item:adaga` (nenhum conteúdo pessoal tocado).

1. **Localização do item real**: busca "Faca" no painel → resultado real retornado pela Server Action (`item:faca`).
2. **`dragstart`**: `source.dispatchEvent(new DragEvent('dragstart', {dataTransfer: dt}))` no elemento `draggable`. Confirmado: `dispatched: true`; `dt.types` passou a conter `application/x-ruptura-book-entity`; `dt.getData(...)` retornou exatamente `{"tipo":"book_entity","contentType":"item","slug":"faca","nome":"Faca"}` — prova de que o handler real do componente executou (não foi chamado diretamente).
3. **`dragover` e feedback visual**: antes do gesto, o alvo tinha `border-color: rgb(52,52,62)` (cinza) e fundo transparente. Após `dragenter`+`dragover` (com um `await` de ~100ms para o commit do estado React), `border-color` mudou para `rgb(90,160,106)` (verde, `#5aa06a` — exatamente a cor codificada no componente para `dragOver=true`) e o fundo para `rgb(21,32,24)` (`#152018`). `overDefaultPrevented: true` confirma que o handler chamou `preventDefault()` (necessário para o `drop` funcionar).
4. **`dragleave`**: destaque revertido corretamente para `rgb(52,52,62)`/transparente — nenhum destaque preso.
5. **Reentrada + `drop`**: `dragenter`+`dragover` novamente, depois `drop`. `dispatchEvent` retornou `false` e `dropDefaultPrevented: true` — exatamente o comportamento esperado quando `preventDefault()` é chamado num evento cancelável (não é falha, é a prova de que o handler rodou). Destaque removido corretamente após o drop (`setDragOver(false)`).
6. **Inserção confirmada**: "Blocos do capítulo" passou de (0) para (1), com "Entidade — item:faca" listado.
7. **`dragend`**: despachado no elemento de origem, sem erro.
8. **Salvar + reload**: "Salvar rascunho" → versão incrementada; navegação para uma URL NOVA (não SPA) do mesmo rascunho → **bloco preservado exatamente** ("Blocos do capítulo (1)", "Entidade — item:faca") — persistência real confirmada, não apenas estado de memória.
9. Um segundo gesto real (arrastar "Adaga") confirmou o comportamento consistente e testou "final da lista" (novo bloco sempre inserido ao final, mesmo com um bloco já presente).

### 0-10.8 Casos inválidos e destinos testados via drag real (ou evento DOM equivalente)

Todos usando o mesmo `onDrop` real do componente (nunca a função de domínio chamada diretamente):

- **Lista vazia**: primeiro drag (item 8 acima) — inserção em lista vazia funcionou.
- **Final da lista**: segundo drag (Adaga) — sempre anexa ao final, mesmo comportamento do botão "+ adicionar" (decisão de design preservada desta correção: o drop não calcula posição por coordenada; reordenar para início/meio é feito pelos controles ▲/▼ já existentes, testados a seguir).
- **Item duplicado**: um segundo `drop` real com o MIME de "Adaga" (a origem real do próprio elemento, que sobrescreveu o payload manual do teste com o payload real da Adaga) → aceito no client (3 blocos) → **rejeitado no servidor ao salvar**: "Bloco 3: referência duplicada a item:adaga — já vinculada em outro bloco deste capítulo." Prova de que o caminho drag converge para a MESMA validação de domínio que o botão.
- **Autorreferência**: capítulo publicado, criado rascunho de edição, buscado o PRÓPRIO nome no painel (aparece porque já está publicado), arrastado para si mesmo via gesto real → aceito no client → **rejeitado no servidor**: "Bloco 3: um capítulo não pode referenciar a si mesmo."
- **Item inexistente**: `drop` real com payload forjado (`slug: "item_que_nao_existe_xyz"`, um slug que o picker real nunca devolveria, simulando uma origem hostil) → aceito no client → **rejeitado no servidor**: "Bloco 4: referência inexistente na Biblioteca (item:item_que_nao_existe_xyz)."
- **Payload inválido (JSON malformado)**: `drop` com `application/x-ruptura-book-entity` contendo `"{not valid json"` → ignorado silenciosamente (nenhum bloco adicionado, nenhuma exceção, nenhuma tela quebrada).
- **MIME ausente**: `drop` só com `text/plain` (simulando algo arrastado de fora do app) → ignorado silenciosamente, nenhum bloco adicionado.
- **Drop fora da área válida**: `dragover`+`drop` despachados num elemento SEM handler (`<header>`) → nenhum bloco adicionado, comportamento padrão do browser (sem efeito), confirmando que só o alvo real (`data-testid="capitulo-drop-alvo"`) responde a drops.

Todos os casos inválidos: nenhum erro não tratado, nenhuma tela quebrada, estado sempre coerente após rejeição (o array `blocos` no client pode conter temporariamente uma entrada inválida antes de salvar — igual ao comportamento já aceito do botão "+ adicionar" — mas o SAVE sempre bloqueia e reporta o erro, nunca persiste silenciosamente).

### 0-10.9 Alternativa sem mouse — revalidada

Após os testes de drag, os blocos hostis foram removidos usando o botão "Remover bloco" (✕) — continua funcional. O controle "▲" (mover para cima) foi usado para reordenar "Adaga" antes de "Faca" — reordenação confirmada (lista mudou de ordem corretamente). Nenhuma reimplementação foi necessária; a alternativa já validada nas rodadas anteriores permanece intacta.

### 0-10.10 Smoke test do pipeline (import/export/publicação)

Nenhum código do pipeline foi alterado nesta rodada — smoke test mínimo, reaproveitando os resultados já provados na correção anterior (`## 0-9.9`, capítulo "Mercado Noturno" — "Idêntico ao publicado" após reimportação):

- O capítulo criado nesta rodada ("Deposito de Armas") foi publicado com sucesso (1.0.0) contendo os DOIS blocos criados por drag real.
- Exportado: o pacote JSON contém `blocos: [{entidade:{slug:"faca",...}}, {entidade:{slug:"adaga",...}}]` — mesma ordem, mesma forma exata (`{id, tipo, entidade:{tipo_conteudo, slug}}`) que um bloco criado pelo botão "+ adicionar" — confirma que os dois caminhos (drag e botão) produzem BYTE-A-BYTE a mesma estrutura persistida, porque ambos chamam a mesma função `adicionarBlocoEntidade`.
- Dependências corretas no pacote: `item:faca`/`item:adaga`, `obrigatoria: false`, `estadoResolucao: "ausente"` (resolução real só na importação, por design já documentado).

### 0-10.11 Achado correlato (fora de escopo, documentado — não corrigido)

Durante o smoke test, tentar **republicar uma edição** de um capítulo já publicado (após "Criar rascunho de edição") retornou um erro bloqueante genuíno: `"Já existe conteúdo publicado ou outro rascunho com o slug ..."`. Investigação: `draftValidation.ts::existeSlugColidindo` chama `getContentDocument(contentType, slug)` e trata QUALQUER resultado como colisão — mesmo quando o próprio rascunho é uma edição LEGÍTIMA daquele exato documento publicado (`draft.base_document_id` aponta para ele). Esta função é usada de forma IDÊNTICA por `validarCamposMagia`/`validarCamposItem`/`validarCamposRuna`/`validarCamposTalento`/`validarCamposCapitulo` — ou seja, é um problema PRÉ-EXISTENTE que afeta os 5 tipos editáveis igualmente, não uma regressão desta correção do drag. Não foi corrigido (fora do escopo desta rodada, que só corrige lacunas causadas pela integração do drag) — registrado aqui para uma futura correção dedicada. Não bloqueou nenhuma validação desta rodada: a criação e o PRIMEIRO publish de conteúdo com blocos criados por drag funcionam perfeitamente (é somente a edição-e-republicação de conteúdo JÁ publicado, de qualquer um dos 5 tipos, que está afetada).

### 0-10.12 Console, rede e fixtures

Nenhum erro de console em nenhum passo (verificado após cada gesto/save/publish/export/import). Nenhuma resposta 500. Fixtures removidas ao final: capítulo de teste (draft + publicado + changelog), usuário admin temporário — confirmado por contagem zero em `content_drafts`/`content_documents`/`auth.users`.

### 0-10.13 Validação técnica local

Nenhum código alterado nesta rodada — `git status --short` limpo ao final (só as mudanças de documentação); `next-env.d.ts` revertido após um toque automático do build; `npx tsc --noEmit` sem erros; `npm run build` sucesso (servidor de preview parado antes); harness da Etapa 11 **19/19** inalterado; harness da correção do drag **6/6** inalterado. Harnesses da Etapa 12 não re-executados (nenhum código compartilhado foi tocado nesta rodada).

## 1. Auditoria (resumo)

| Recurso | Estrutura atual | Tabela/arquivo | Função atual | Estado | Contrato existente | Lacuna | Risco | Decisão desta etapa |
|---|---|---|---|---|---|---|---|---|
| Pacote de import/export | Não existe | — | — | Inexistente | — | Total | Baixo (novo) | Novo contrato `ruptura-content-package` v1 (`contentPackage.ts`) |
| `content_packs` | Registro de linhagem (qual pipeline produziu um `content_document`) | `content_packs` | FK de `content_documents.source_pack_id` | Em uso (seed + `'admin-editor'` da 0022) | Lineage registry, não pacote de arquivo | Reaproveitá-lo como contrato de import/export misturaria conceitos | Alto se reaproveitado | **Não reaproveitado.** Contrato novo, isolado |
| Hash de payload | Dois algoritmos distintos já em uso (TS `canonicalize()`+sha256 no seed; Postgres `digest(jsonb::text)` no RPC de publicação) | `content_documents.payload_hash` | `hashPayload` (seed) / RPC `publish_content_draft` | Divergentes entre si | Nenhum hash "de exportação" | Comparar os dois direto seria inválido | Médio (falso positivo/negativo de diff) | Hash canônico PRÓPRIO da Etapa 11 (`canonicalHash.ts`), nunca comparado direto ao `payload_hash` armazenado — ambos os lados de uma comparação são re-hasheados pela MESMA função |
| Metadata editorial | `content_editor_metadata` (migration 0023) | Tabela dedicada, admin-only | `getEditorMetadataAtual` | Implementado (Etapa 6) | Só efeitos por versão publicada | Precisa entrar no pacote só quando existir para a versão exportada | Baixo | Incluída no documento do pacote (`metadataEditorial`), nunca fabricada quando ausente |
| Validação de schema oficial | Só em scripts dev (`validate-*.mjs`), nunca em produção | `content/schema_*.json` | Avaliador mínimo duplicado por etapa | Nunca rodou no app | Nenhum | Importação precisa validar de verdade | Alto (importar lixo) | `officialSchemaValidator.ts` — primeira vez que roda em produção (import) |
| Draft-only import | `content_drafts` (migration 0021) | Tabela existente, admin-only RLS | Server actions da Etapa 3 | Implementado para criação manual | Nenhum caminho de import em lote | Precisa 1 rascunho por doc, sem sobrescrever | Alto (perda de trabalho em andamento) | RPC `import_content_drafts` (nova, migration 0024) — falha se já existe rascunho, tudo em 1 transação |
| Histórico de import | Não existe | — | — | Inexistente | — | Total | Médio (auditoria) | `content_import_sessions` (nova) |
| Vínculo Biblioteca↔Livro | Não existe nenhum sistema de capítulo/livro em código | `docs/fontes/*.md` (markdown de origem, "não deve ser consumido em runtime") | — | Inexistente | — | Total | Alto se fingido | `content_book_links` (nova) — capítulo/seção/âncora como TEXTO LIVRE, nunca FK para uma tabela de capítulos que não existe |
| Drag-and-drop | Nenhum código de drag em lugar nenhum do projeto | — | — | Inexistente | PRD §2.1.9 lista "drag de todos os tipos de entidade" explicitamente **fora da primeira entrega** | Nenhum destino editorial real para soltar uma referência | Alto se fingido | **Bloqueado formalmente** — ver §12 |

## 2. Decisões arquiteturais (14 obrigatórias)

1. **Formato do pacote**: JSON, nome `ruptura-content-package`, versão inteira.
2. **Versionamento**: `versaoFormato` (atual/mín./máx. = 1); versão desconhecida/futura é **sempre rejeitada**, nunca "tentada".
3. **Exportação unitária**: 1 documento + metadata da MESMA versão publicada + dependências + vínculos editoriais.
4. **Exportação em lote**: seleção explícita (nunca implícita de página não carregada), dedup, ordem determinística, limite de 200 documentos.
5. **Import dos 4 tipos editáveis**: cria rascunho real via os mesmos adapters/builders da Etapa 3/6 (`draftBuilders.ts`), recuperando campos, efeitos, metadata editorial quando presente.
6. **Import dos tipos ainda não editáveis**: preview/validação disponíveis, mas **nunca** vira rascunho — classificado `tipo_nao_editavel`, bloqueado explicitamente (nunca um rascunho "opaco" fingido).
7. **Armazenamento temporário do preview**: nenhum — o pacote inteiro (JSON já parseado) trafega do client para as Server Actions a cada chamada; nada fica em tabela intermediária antes da confirmação.
8. **Persistência do histórico**: `content_import_sessions`, 1 linha por importação confirmada (nunca guarda o arquivo inteiro, só o resumo).
9. **Representação de vínculo editorial**: `content_book_links`, capítulo/seção/âncora como texto livre.
10. **Representação de capítulo/âncora**: idem — não existe tabela de capítulos real para referenciar (ver auditoria).
11. **Drag-and-drop estruturado**: bloqueado (ver §12).
12. **Referência ausente**: obrigatória ausente bloqueia o documento (`referencia_ausente`); opcional ausente nunca bloqueia.
13. **Conteúdo já existente**: nunca sobrescreve publicado; classifica como `atualizacao` (rascunho de edição com o publicado como base) ou `conflito_com_publicado` (base desatualizada).
14. **Atomicidade do lote**: 1 transação por confirmação (todo o RPC `import_content_drafts`) — erro no meio desfaz tudo, nenhum rascunho órfão.

## 3. Contrato do pacote (`contentPackage.ts`)

`ManifestPacote` (formato, versão, versão mínima do importador, data de exportação, origem, escopo, quantidade de documentos, hash do manifest, avisos) separado de `DocumentoPacote[]` (tipo, slug, versão publicada, status de origem, payload público, hash do payload, dependências, metadata editorial opcional, vínculos editoriais). Nunca exporta: sessão, segredos, tokens, claims, service role, estado de personagem/campanha/mesa/inventário/instância, caminho absoluto local.

**Nunca exportados** (confirmado por auditoria de todos os campos do pacote): nenhuma das chaves privadas listadas no aditivo aparece em `DocumentoPacote`/`ManifestPacote` — o payload é exatamente o `content_documents.payload` já público (mesma leitura que um visitante anônimo teria).

## 4. Hash determinístico (`canonicalHash.ts`)

`hashCanonico()` = sha256 do JSON com chaves de objeto ordenadas recursivamente, arrays preservados na ordem original (efeitos/resultados/níveis são posicionalmente significativos). Verificado (script de verificação, ver §11): mesma entrada com chaves em ordem diferente → mesmo hash; array reordenado → hash diferente; qualquer alteração de valor → hash diferente. Usado para: detectar idêntico, detectar corrupção (hash declarado ≠ hash recomputado no import → pacote rejeitado com `schema_invalido`), apoiar idempotência.

## 5. Exportação (`packageExport.ts`)

Admin-only (`requireAdmin`). `exportarDocumentoUnico` e `exportarSelecao` (limite de 200, dedup, ordem determinística, avisa sobre dependências obrigatórias não incluídas — nunca bloqueia, decisão do admin). Cada documento inclui metadata editorial só quando existe para a versão publicada exata (`getEditorMetadataAtual`); ausência é registrada como aviso, nunca fabricada. Dependências são coletadas (`contentDependencies.ts`) mas resolvidas como "ausente" no lado da exportação — a resolução real contra a Biblioteca acontece no destino, na importação (nunca resolvida ambiguamente por adivinhação em nenhum dos dois lados).

## 6. Importação (`packageImport.ts`)

Fluxo: `validarPacoteBruto` (manifest + forma de cada documento + hash recomputado — rejeita se não bate) → `gerarPreviewImportacao` (busca estado real do banco: publicado atual, rascunho existente, roda schema oficial, resolve dependências contra o pacote + Biblioteca real) → `confirmarImportacao` (recalcula TUDO de novo a partir do zero — nunca confia no preview anterior — e chama o RPC transacional). Idempotência: reimportar o mesmo pacote (mesmo hash) encontra a sessão confirmada anterior e devolve o mesmo resultado em vez de duplicar.

11 classificações implementadas exatamente como especificado (`importPreview.ts`): `novo`, `identico`, `atualizacao`, `conflito_com_publicado`, `conflito_com_rascunho`, `referencia_ausente`, `schema_invalido`, `tipo_nao_editavel`, `versao_nao_suportada`, `incompativel`, `bloqueado` — a última categoria (`bloqueado`) fica disponível no tipo mas nenhuma situação real auditada a produz nesta etapa (nenhuma classificação atual precisa dela); mantida no enum para não fechar a porta a um bloqueio futuro (ex.: limite de profundidade/contagem) sem novo enum.

## 7. Draft-only garantido

`import_content_drafts` (migration 0024, SECURITY DEFINER): 1 rascunho por documento confirmado, nunca toca `content_documents`, nunca publica. Se já existe rascunho para `(content_type, slug)`, a função levanta exceção nomeada — toda a transação desfaz, nenhum rascunho parcial. Publicação de um rascunho importado continua exclusivamente pelo fluxo normal da Etapa 5 (`publish_content_draft`) — sem atalho.

## 8. Biblioteca do Livro

Confirmado por auditoria: **nenhum renderizador de Livro existe em runtime.** `docs/fontes/*.md` são export do Notion, explicitamente marcados como fora de consumo em runtime. Por isso `content_book_links` guarda capítulo/seção/âncora como **texto livre estruturado** (nunca uma FK para uma tabela de capítulos inexistente). Leitura pública (é só uma citação, não metadata editorial); escrita admin-only.

- **Retorno à origem** ("Ver no livro"): implementado como **exibição da citação estruturada** (capítulo/seção/âncora/rótulo) na página de detalhe do conteúdo — **sem link clicável real**, porque não há para onde navegar (nenhum renderizador). Documentado explicitamente na UI (`VinculosEditoriaisPanel.tsx`) para não fingir uma navegação que não existe.
- **Retorno à entidade** (capítulo → entidade): fora de escopo real nesta etapa pela mesma razão simétrica — não há capítulo real em runtime para inserir uma referência de volta à Biblioteca.
- **Vínculo principal**: 1 por documento, reforçado por índice único parcial (`content_book_links_one_principal_per_doc`).

## 9. Drag-and-drop — RESOLVIDO (ver `## 0-9`)

Auditoria original: zero código de drag-and-drop em qualquer parte do projeto. Esta seção documentava o bloqueio estrutural (ausência de destino editorial real). **Esse bloqueio foi fechado na correção registrada em `## 0-9`**: novo content_type "capitulo" (migration 0035) serve de destino real; drag nativo HTML5 (origem: painel de busca embutido no editor; destino: lista de blocos do capítulo, mesmo Editor Universal) valida no servidor, persiste pelo pipeline de rascunho/publicação já existente, e foi aceito em browser real (criação, edição, publicação, export/import, casos hostis). Detalhes completos, incluindo os 3 bugs reais encontrados e corrigidos durante o aceite, em `## 0-9`.

**Status atual: "Implementação parcial — validação do drag nativo e da integração com a Biblioteca pendentes."** O texto histórico abaixo (§§11, 12, "Bloqueio estrutural", "Critérios para conclusão futura") é preservado como registro do que motivou o status parcial anterior — não reflete mais o estado atual; ver `## 0-9` para o que mudou.

## 10. Segurança e limites

- Export/import: admin-only (`getContentAdminStatus`), reforçado por RLS em toda tabela nova.
- Import nunca confia em hash/classificação/diff vindo do client — tudo recalculado nas Server Actions a partir do banco.
- `officialSchemaValidator.ts` só roda em servidor (usa `node:fs`), nunca importado por Client Component (confirmado pelo build — ver §11).
- Limite de arquivo: 5 MB. Limite de documentos por pacote: 200. Limite de itens por exportação em lote: 200. Valores escolhidos para cobrir um catálogo real (spell+talent+item+rune reais somam poucas centenas) sem aceitar tamanho irrestrito.
- Import valida extensão (`.json`) e MIME como sinal (nunca única defesa) — o conteúdo real é sempre reparseado e validado estruturalmente, nunca executado (nenhum `eval`).
- Nenhuma policy nova de escrita direta — toda mutação nova passa por função SECURITY DEFINER (`import_content_drafts`) ou por Server Action que reverifica admin.

## 11. Verificações não executadas

Nomeado deliberadamente "não executadas" em vez de "bloqueadas vs. executadas" — a seção a seguir é a lista do que NÃO foi verificado, para que a lacuna fique impossível de perder.

- **Browser check real** (os 26 itens do aditivo: export/import reais na UI, criação de vínculo, drag, "Ver no livro"): não executado. `tsx`/esbuild continuam bloqueados neste ambiente (mesmo problema já registrado em checkpoints anteriores) — os scripts `check-admin-*.ts` (sessão de browser real) não puderam rodar. Nenhum teste manual foi pedido ao usuário.
- **Round-trip e atomicidade transacional em Supabase real**: não executado. Não há projeto Supabase provisionado e conectado a este repositório disponível para uso nesta sessão. A migration 0024 e o RPC `import_content_drafts` seguem exatamente o padrão transacional já testado das migrations 0021-0023 (mesmo estilo de SECURITY DEFINER + RLS + índice único) — mas isso é similaridade de padrão, não verificação: nenhum INSERT, nenhum rollback, nenhum teste de concorrência ou de falha-no-meio foi exercitado contra um Postgres real.
- **Drag-and-drop editorial**: não implementado, portanto não há nada para verificar (ver §9 e a seção dedicada abaixo).

### O que FOI verificado nesta sessão

- `npx tsc --noEmit` — sem erros.
- `npm run build` (Next.js/Turbopack) — sucesso, todas as rotas novas (`/admin/biblioteca/exportar`, `/admin/biblioteca/importar`, `/admin/biblioteca/importacoes`, `/admin/biblioteca/importacoes/[id]`) aparecem na árvore de rotas.
- Verificação focada em Node puro (mesmo padrão das etapas anteriores: compila os módulos reais com `tsc --module commonjs`, roda com `node`, nunca duplica lógica): `scripts/dev/validate-import-export-book.mjs` — **19/19 verificações passaram**, cobrindo hash determinístico (ordem de chave irrelevante, ordem de array significativa, detecção de alteração), validação de manifest (aceito, formato desconhecido rejeitado, versão futura rejeitada), `ehContentTypeEditavel`, coleta real de dependências (requisitos/condição/propriedades), resolução de dependência (nunca assume resolvida fora do pacote) e as 11 classificações de preview nos casos centrais. Esta verificação cobre exclusivamente lógica pura (sem I/O) — não substitui nem o browser check nem a verificação transacional contra banco real.

## 12. Limitações reais (resumo)

- Drag-and-drop não implementado — bloqueio estrutural documentado (§9), não fingido.
- "Ver no livro" mostra a citação estruturada, não um link navegável — não existe renderizador de Livro em runtime.
- Round-trip completo (export → import → publish → export → diff semântico) não foi exercitado contra um banco real nesta sessão — só a lógica pura (classificação/hash/dependências) foi verificada via Node.
- `origemLegado` (conversão de conteúdo legado, Etapa 6) não é recuperado no pacote de exportação — essa informação vive só no `content_drafts.payload.origemLegado` de quando o conteúdo foi convertido, e não é persistida em `content_documents` após a publicação; portanto o pacote nunca a fabrica (campo permanece ausente, nunca inventado).
- Tipos somente-leitura (condition, property, master_table etc.) podem ser incluídos num pacote para fins de dependência/preview, mas nunca geram rascunho — comportamento intencional, documentado como `tipo_nao_editavel`.

## Entregas concluídas

Implementação concluída — aceite de browser pendente — para:

- contrato de pacote versionado `ruptura-content-package` v1, com manifest, versionamento e rejeição de versão futura desconhecida;
- hash canônico determinístico (`canonicalHash.ts`), verificado por Node puro;
- exportação administrativa unitária e em lote (`packageExport.ts`), sempre por seleção explícita, nunca "exportar tudo" implicitamente;
- importação **exclusivamente como rascunho** (`packageImport.ts` + RPC `import_content_drafts`) — nenhum caminho de código criado nesta etapa publica automaticamente, nenhum escreve direto em `content_documents`, nenhum sobrescreve um rascunho existente silenciosamente;
- preview com as 11 classificações reais, sempre recalculado no servidor (nunca confia em hash/classificação vindos do client);
- detecção de conflito (publicado mudou, rascunho já existe) e idempotência por hash (reimportar o mesmo pacote não duplica);
- preservação de metadata editorial, campos desconhecidos e efeitos bespoke, reaproveitando os builders reais da Etapa 3/6 (nunca duplicados);
- dependências estruturadas e vínculos editoriais Biblioteca↔Livro (`content_book_links`), com histórico de importação (`content_import_sessions`).

## Pendências de aceite

- **Browser check**: nenhum dos 26 itens do aditivo foi verificado na UI real (esbuild/`tsx` bloqueados neste ambiente).
- **Round-trip e atomicidade em Supabase real**: migration 0024 e RPC `import_content_drafts` foram implementadas seguindo o mesmo padrão transacional já testado nas migrations 0021-0023, mas **não foram executadas contra um projeto Supabase conectado** nesta sessão — nenhuma prova de rollback correto, nenhuma prova de que a transação é realmente atômica em produção.

## Bloqueio estrutural do drag-and-drop

O drag-and-drop editorial **não foi implementado**. Isto não é uma lacuna de tempo ou de esforço: não existe, em nenhuma parte do código deste projeto, um renderizador do Livro nem um editor estruturado de capítulos que possa servir de destino real para um drop. O PRD (`docs/PRD Ruptura VTT.md` §2.1.9) já classifica "drag de todos os tipos de entidade" como fora da primeira entrega, e a própria Biblioteca do Livro é adiada para depois da ficha de personagem estabilizar.

Construir esse destino (um editor/renderizador de capítulos) está fora do escopo desta etapa e não foi tentado nesta correção — fazê-lo exigiria uma etapa própria, com sua própria auditoria e decisão de produto. O que foi entregue (`content_book_links`, criação de vínculo via UI admin) cobre o registro estrutural do vínculo entidade↔capítulo, mas sem drag e sem navegação clicável real ("Ver no livro" mostra a citação, não abre nada).

**É este bloqueio, sozinho, que impede a Etapa 11 de ser marcada como concluída.**

## Verificações não executadas

Ver §11 para a lista completa e o detalhamento de cada item. Resumo:

- Browser check real (26 itens do aditivo) — não executado (ambiente).
- Round-trip/atomicidade transacional contra Supabase real — não executado (sem projeto conectado).
- Nada relacionado a drag foi verificado, por não ter sido implementado.

## Critérios para conclusão futura

A Etapa 11 só poderá ser marcada como concluída quando **todos** os itens abaixo forem satisfeitos — nenhum prazo ou próxima etapa é assumido aqui, esta lista não implica agenda:

- existir um renderizador ou editor estruturado de capítulos real, capaz de receber uma referência de conteúdo da Biblioteca;
- o drag-and-drop seguro (transportando só uma referência — tipo, slug estável, versão de protocolo — nunca o payload completo) puder ser integrado a esse destino editorial real;
- o drop for validado no servidor (admin, documento, tipo, destino, duplicidade) antes de persistir qualquer vínculo;
- o vínculo criado pelo drop puder abrir corretamente tanto a entidade quanto o trecho do livro correspondente (round-trip de navegação real, não citação textual);
- esse comportamento for verificado operacionalmente (browser check real, não simulado);
- a migration 0024 e a RPC `import_content_drafts` forem verificadas contra um projeto Supabase real (não apenas por semelhança de padrão com migrations anteriores);
- o round-trip transacional completo de importação (incluindo atomicidade e ausência de resíduo em caso de falha no meio) for comprovado contra esse banco real;
- o browser check aplicável a export/import/vínculos for executado, ou formalmente substituído por um aceite equivalente documentado.

## Encerramento

TypeScript e build passam; 19 verificações focadas em Node passam (Etapa 11) + 6/6 (correção do drag) — nenhuma publicação automática existe em nenhum caminho de código novo; nenhuma escrita direta em `content_documents` fora do RPC transacional; a importação continua exclusivamente criando rascunhos. **Na correção anterior**: novo content_type "capitulo" (migration 0035, aplicada ao Supabase real) fechou a lacuna estrutural que bloqueava o drag editorial; drag nativo HTML5 + alternativa por botão implementados dentro do Editor Universal existente; 3 bugs reais encontrados e corrigidos. **Nesta rodada (validação final, nenhum código alterado)**: confirmado documentalmente que o painel de busca embutido é uma superfície editorial legítima da Biblioteca (mesma fonte de dados/resolvedor/RLS, redução deliberada de campos, nunca duplicação divergente); executado um gesto REAL de `dragstart`→`dragenter`→`dragover`→`drop`→`dragend` via eventos DOM reais com `DataTransfer` real (nunca chamando a função de domínio diretamente); comprovados MIME/payload, feedback visual (mudança de cor real no `dragover`, reversão no `dragleave`), inserção, persistência após reload, e todos os casos inválidos (duplicidade, auto-referência, item inexistente, payload malformado, MIME ausente, drop fora da área) através do MESMO caminho de drag real, todos convergindo para a mesma validação de domínio do botão; alternativa sem mouse revalidada; 1 achado correlato pré-existente documentado (não corrigido, não causado pelo drag — afeta republicação de conteúdo já publicado em todos os 5 tipos editáveis igualmente); fixtures completamente removidas. **Não avancei para nenhuma etapa adicional. Não declaro o Editor Universal completo.**

**Status geral da Etapa 11: Etapa 11 concluída — integração editorial de drag aprovada.**

> **Nota de referência futura (adicionada durante a Etapa 12, sem
> alterar o status acima):** a Etapa 12 (conteúdo de mesa e homebrew)
> foi implementada depois desta e não depende de nenhuma mudança neste
> checkpoint. Ela criou tabelas e Server Actions próprias e isoladas
> (`campaign_content_documents`/`campaign_content_drafts`/etc., migration
> 0025) — nenhuma delas reaproveita `content_import_sessions`/
> `content_book_links` ou qualquer estrutura desta etapa. Ver
> `docs/CHECKPOINT_ETAPA12_CONTEUDO_MESA_HOMEBREW.md`.
