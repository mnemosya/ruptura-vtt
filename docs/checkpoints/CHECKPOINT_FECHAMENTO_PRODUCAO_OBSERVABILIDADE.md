# Checkpoint — Fechamento de experiência de produção + observabilidade mínima (parcial)

## Achado

`src/app` não tinha nenhum `error.tsx`, `loading.tsx` ou `not-found.tsx`
em lugar nenhum (nem raiz nem por rota) — uma exceção não tratada
numa Server Component derrubava a página inteira sem UI de
recuperação; uma URL inexistente mostrava a página 404 genérica do
Next sem link de volta. Também não havia `.env.example` — só
`.env.local` (gitignored), sem contrato documentado de quais
variáveis um setup novo precisa.

## Implementado

- `src/app/error.tsx` — boundary de erro raiz (Client Component,
  `reset()` para tentar de novo), loga só `error.message`/`digest` via
  `console.error` (nunca stack completo/dados sensíveis).
- `src/app/loading.tsx` — fallback de carregamento raiz.
- `src/app/not-found.tsx` — 404 com link de volta a `/mesas`.
- `.env.example` — só nomes de variável + comentário do que cada uma
  é (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  com aviso explícito "nunca no client", `SUPABASE_DB_URL`,
  `CONTENT_DIR`) — nenhum valor real, gerado só lendo os NOMES de
  `.env.local` (nunca os valores).

## Limitações conhecidas (não implementadas nesta sessão)

- **Sem `error.tsx`/`loading.tsx` por rota** — só o boundary raiz
  existe; rotas com carregamento pesado (ex.: `/mesas/[campaignId]`)
  ainda dependem do fallback genérico em vez de um esqueleto
  específico.
- **Sem logging server-side estruturado** — continua só
  `console.error` pontual (aqui e em blocos `catch` já existentes
  espalhados pelo código); não foi criado um logger/wrapper central,
  nem integração com serviço externo (fora de escopo, PRD explícito:
  "não integrar serviço externo pago").
- **Navegação/breadcrumbs**: não auditado nesta sessão — dashboard,
  mesa, ficha, Livro e inventário do bando já têm links de "voltar",
  mas uma auditoria completa de breadcrumbs/retorno entre todas as
  telas não foi refeita.
- **Acessibilidade**: não houve uma auditoria dedicada de labels/
  foco/teclado/contraste nesta sessão — os componentes novos desta
  sessão (TurnTrackPanel, wizard, Livro) usam elementos semânticos
  nativos (`button`, `select`, `label`, `Link`) mas não foram testados
  com leitor de tela.

## Validação

- `npx tsc --noEmit` e `npm run build`: limpos — `/_not-found` agora
  aparece como página estática no build.
- Não verificado em navegador nesta sessão (erro real disparado para
  confirmar o boundary, 404 real navegado).

## Atualização — primeira rodada de fechamento (boundaries por rota, logger central, acessibilidade)

Fecha as 3 pendências acima com escopo delimitado e validado em
navegador real — não uma reescrita geral, ver limitações restantes ao
final.

### 1. `loading.tsx`/`error.tsx`/`not-found.tsx` por rota

3 componentes compartilhados novos em `src/app/_boundaries/`
(`SectionLoading`, `SectionError` — `role="alert"`, usa o logger
central — e `SectionNotFound`), cada um reaproveitado por um arquivo
fino por segmento. Aproveitando a herança de segmento do App Router,
**9 segmentos** receberam arquivo próprio e cobrem as ~22 rotas reais:

| Segmento | Arquivos | Rotas cobertas por herança |
|---|---|---|
| `login/` | loading | (só ela) |
| `mesas/` | loading, error | (só ela) |
| `mesas/[campaignId]/` | loading, error, not-found | `biblioteca`, `livro`, `personagens/novo` |
| `mesas/[campaignId]/biblioteca/` | loading, not-found | `biblioteca/comparar/[docId]`, `biblioteca/rascunho/[draftId]` |
| `mesas/[campaignId]/livro/` | loading, not-found | `livro/[slug]` |
| `mesas/[campaignId]/personagens/novo/` | loading | (só ela) |
| `ficha/` | loading, error | (só ela) |
| `join/[token]/` | loading, error | (só ela) |
| `admin/biblioteca/` | loading, error, not-found | `[contentType]/[slug]`, `[contentType]/[slug]/historico`, `rascunhos/*`, `importacoes/[id]`, `exportar`, `importar` |

**Cenários realmente testados em navegador** (não só leitura de
código):
- `not-found.tsx` de segmento: navegado para `/admin/biblioteca/item/<slug-inexistente>` autenticado como admin — confirma texto específico "Não encontrado na Biblioteca" (não o genérico da raiz), cobrindo por herança a rota aninhada `[contentType]/[slug]`.
- `loading.tsx` de segmento: confirmado via streaming SSR real (`curl --max-time 1` capturando o chunk inicial da resposta) que o texto "Carregando o Livro…" é enviado ANTES do conteúdo final em `mesas/[campaignId]/livro` sob atraso forçado temporário (revertido depois do teste) — prova mais rigorosa que uma captura de tela, que não consegue garantir o timing de um flash de poucos ms.
- `error.tsx` de segmento: forçada uma exceção real controlada e temporária em `/ficha` (revertida depois do teste) — confirma: boundary contextual "Não foi possível carregar a ficha..." aparece (não o genérico da raiz); `role="alert"` presente no container; log estruturado emitido (`{"level":"error","scope":"ficha","message":"...","digest":"..."}`); botão "Tentar de novo" dispara `reset()` de verdade (re-executa a Server Component — confirmado pelo erro reaparecer quando a causa persistia); navegação de volta sem o parâmetro de força confirma recuperação real (página volta ao comportamento normal).

### 2. Logger central — migração completa confirmada por busca global

`src/lib/logger.ts` (`logError`/`logWarn`/`logInfo`, JSON estruturado,
nunca stack/dados sensíveis, sem serviço externo pago). Busca global
por `console.error`/`console.warn`/`console.log` em `src` — **zero
ocorrências restantes em código de produto** (raiz `error.tsx` e as 4
ocorrências do wizard já migradas). As únicas ocorrências restantes no
repositório são:
- `src/lib/logger.ts` (3 ocorrências) — o próprio wrapper interno, que
  precisa chamar `console.*` para efetivamente emitir a linha.
- `scripts/*.ts` (53 ocorrências) — scripts Node de teste/diagnóstico
  executados manualmente no terminal (não código de runtime do app);
  `console.log` ali é o próprio propósito da ferramenta (feedback
  legível ao humano rodando o script), não um caso a migrar para um
  logger de servidor.
- `/dev/*` (0 ocorrências) — não havia nenhuma.

### 3. Acessibilidade — primeira rodada (não uma auditoria completa)

**Label/input**: dos 24 arquivos com `<label>`, 22 já associavam
corretamente (input aninhado dentro do label); 2 gaps reais
encontrados e corrigidos com `htmlFor`/`id` (`ImportarClient.tsx`,
`ActionsTab.tsx` — este último com id único por ação via `slug`, já
que renderiza em loop).

**Mensagens de erro/status anunciáveis**: nenhum lugar do projeto
usava `aria-live`/`role` antes desta rodada. Adicionado `role="alert"`
(mensagens de erro reais) ou `role="status"` (mensagens neutras de
carregamento) nos textos dinâmicos das rotas centrais: `errorMessage`,
tela de erro de carregamento de rascunho e tela de confirmação de
descarte no wizard; `persistError`, `autoFailBlockedMessage` e
`expressaoErro` no `RollsTab`; e o bloco de bloqueio de sessão
(`ficha-bloqueio`) do `CharacterSheetClient` (`role` condicional:
`"status"` para "Carregando…", `"alert"` para os demais estados).

**Navegação por teclado, foco visível e ordem de foco** — validado em
navegador real na rota `/login`: `Tab` percorre Entrar → Criar conta →
Email → Senha → Entrar, cada elemento com anel de foco azul claramente
visível; o botão "Entrar" é corretamente PULADO pela ordem de tabulação
enquanto `disabled` (email/senha vazios) — comportamento nativo
correto, confirmado preenchendo os campos e vendo o botão passar a
receber foco. Busca global confirma **zero** ocorrências de
`outline: none` em todo `src/app` (nenhum código remove o indicador de
foco padrão do navegador).

**Cliques só em elementos nativos**: busca global (incluindo a árvore
`app/dev/character-sheet`, que apesar do nome é a UI real da ficha
usada por `/ficha`) confirma que **todo** `onClick` em código de
produto está em `<button>`/`<input>` — nenhum `<div>`/`<span>`
clicável sem suporte a teclado.

**Modais/confirmações**: não existe nenhum modal customizado no
projeto (busca por overlays `position: fixed` não encontrou nenhum) —
a única confirmação existente é `window.confirm()` nativo (wizard,
"Cancelar criação"), acessível pelo sistema operacional por padrão,
nada a corrigir aqui.

**Contraste — auditado e quantificado, não corrigido em massa**
(cálculo real de contraste WCAG, não estimativa): texto principal
(`#e8e8ec` sobre fundo `#14151a`) 14.92:1, links (`#5ec8ff`) 9.71:1,
aviso (`#f5a623`) 8.99:1 e texto de botão 13.60:1 — todos passam AAA
(≥7:1). Texto de erro (`#ff6b6b`) 6.57:1 — passa AA (≥4.5:1), não AAA.
Texto esmaecido via `opacity`: a partir de 0.5 passa AA (4.51:1+); **22
ocorrências** usam `opacity: 0.35/0.4/0.45` (3+16+3), que **FALHAM** o
mínimo AA de 4.5:1 (2.83:1/3.33:1/3.87:1 respectivamente) — identificadas
e quantificadas, **não corrigidas nesta rodada** (correção em massa das
~956 cores hardcoded, incluindo essas 22, fica para uma rodada
dedicada de design system/tema, fora deste escopo).

**Headings/landmarks**: `<main>` presente em todas as rotas
verificadas (direto no `page.tsx` ou delegado ao client component,
ex.: `/login` via `LoginForm`, `/mesas` via `MesasDashboardClient`);
sem duplicação de `<h1>` (telas com múltiplos `<h1>` no código-fonte do
wizard são ramos mutuamente exclusivos — nunca mais de um no DOM ao
mesmo tempo).

### Limitações restantes (não implementadas nesta rodada, deliberadamente)

- Correção em massa das ~956 cores hardcoded / pass formal de tema e
  contraste (as 22 ocorrências de opacidade reprovada em AA incluídas).
- Teste manual com leitor de tela real (NVDA/VoiceOver) — a auditoria
  desta rodada cobriu semântica/ARIA/teclado/contraste por inspeção e
  ferramentas, não uma sessão com leitor de tela ao vivo.
- Navegação/breadcrumbs entre todas as telas — ainda não reauditado.
- Demais `catch` silenciosos em `src/lib/auth`/`src/lib/table` que já
  tratam o erro internamente sem logar — não migrados para o logger
  (escopo à parte, não pedido nesta rodada).

### Status

**Primeira rodada de fechamento de produção concluída — boundaries
estratégicos, logger estruturado e correções iniciais de
acessibilidade implementados.**
