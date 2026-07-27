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
