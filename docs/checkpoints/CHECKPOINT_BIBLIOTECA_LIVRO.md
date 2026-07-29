# Checkpoint — Biblioteca do Livro (leitura, parcial)

## Achado

Content type `"capitulo"` existia desde a Etapa 11 (migration 0035),
mas só era tocado no editor/admin — nenhuma rota de leitura existia em
lugar nenhum do produto (narrador ou jogador). `listCapitulosEffective`
não existia (só os 4 tipos mecânicos tinham um `listXEffective`).

## Implementado

- `listCapitulosEffective(campaignId)` em `resolveEffectiveContent.ts`
  — mesmo padrão dos outros 4 (oficial + override + homebrew).
- `/mesas/[campaignId]/livro` (sumário): lista capítulos com
  `status === "published"` (rascunho nunca aparece), busca por nome/
  descrição/tag no cliente. Ordenados alfabeticamente por nome — o
  schema de capítulo não tem campo de ordem/posição no livro ainda
  (limitação registrada abaixo).
- `/mesas/[campaignId]/livro/[slug]` (leitura): corpo introdutório +
  blocos (texto corrido; blocos de entidade viram cards — "Ver
  capítulo" quando a entidade é outro capítulo, card informativo com
  tipo+slug para magia/talento/item/runa, já que essas ainda não têm
  página de leitura própria). Navegação anterior/próximo pela mesma
  ordem alfabética do sumário.
- Guard de acesso: narrador dono OU jogador com perfil reivindicado
  nesta mesa (mesmo padrão da Fase 2/3) — nunca a lista de mesas
  inteira, nunca conteúdo de outra campanha.
- Descoberta: link "Livro" na mesa de produção (narrador) e no fluxo
  de convite (`JoinClient`, variante jogador).

## Limitações conhecidas (não implementadas nesta sessão)

- **Sem ordem canônica de capítulos**: `CamposCapitulo` (schema do
  Editor Universal) não tem campo de posição/ordem no livro — ordenar
  por nome é um substituto razoável, não a ordem editorial real.
  Adicionar isso exigiria mudar o schema do Editor Universal
  (`draftTypes.ts`), fora do escopo desta leitura.
- **Sem deep link para magia/talento/item/runa**: blocos de entidade
  que referenciam esses 4 tipos viram um card informativo (tipo +
  slug), não um link navegável — não existe página de leitura
  dedicada para eles ainda (só o editor admin).
- **Sem cache/paginação**: lê a lista inteira de capítulos a cada
  request (`dynamic = "force-dynamic"`) — aceitável para o volume
  atual de conteúdo, pode precisar de paginação se crescer muito.
- **Visibilidade**: por enquanto só existe o corte official/override/
  homebrew de `listCapitulosEffective` — não há um campo de
  visibilidade adicional (ex.: "só para o narrador") diferente do que
  os outros 4 tipos já usam.

## Validação

- `npx tsc --noEmit` e `npm run build`: limpos, rotas
  `/mesas/[campaignId]/livro` e `/livro/[slug]` registradas.
- Não verificado em navegador nesta sessão (sem capítulos publicados
  reais para testar o fluxo ponta a ponta).
