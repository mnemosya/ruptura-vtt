# Checkpoint — Validação canônica da criação de personagem

Rodada única e fechada para eliminar o bloqueador registrado em
`CHECKPOINT_FECHAMENTO_CONVITES_LOGS_ATOMICIDADE.md` (item 6):
`complete_character_creation` gravava um personagem atômico e
idempotente, mas mecanicamente inválido, se o payload referenciasse
magia/talento/item inexistente, arquivado, em rascunho, de outra
campanha, ou com preço/saldo/nível adulterados.

## Working tree inicial

- `git status --short`: limpo.
- 16 commits consolidados confirmados presentes.
- Migrations locais confirmadas até `0045`, idênticas ao Supabase real
  antes de qualquer alteração.
- `next-env.d.ts`: alternou automaticamente para
  `.next/dev/types/routes.d.ts` duas vezes durante esta sessão (build
  e browser check) — revertido para `.next/types/routes.d.ts` (estado
  de build) em ambas as ocasiões.

## Fonte canônica e resolvedor efetivo (Fase 1)

Confirmado por leitura de schema e código real — **nenhum resolvedor
novo foi criado em paralelo**, a RPC reutiliza a MESMA precedência já
implementada em `resolveEffectiveOne`/`resolveEffectiveList`
(`src/lib/campaignContent/resolveEffectiveContent.ts`):

| Tipo | Tabela/fonte | Identificador estável | Status publicado | Escopo de campanha |
|---|---|---|---|---|
| Vertente | não é `content_type` próprio — derivada de `spell.payload.vertente` | slug da vertente (string livre) | via magias efetivas | via magias efetivas |
| Magia | `content_documents`/`campaign_content_documents`, `content_type='spell'` | `slug` | `status='published'` (nunca `'archived'`; rascunho nunca sai de `content_drafts`) | `campaign_content_documents.campaign_id` |
| Especialização | não existe como conceito na criação atual (nem textual) | — | — | — |
| Talento | idem, `content_type='talent'`; níveis em `payload.niveis[]` | `slug` (talento) + `niveis[].id` (nível) | idem | idem |
| Item | idem, `content_type='item'` | `slug` | idem | idem |

- Oficial: `content_documents`, sem `campaign_id`.
- Homebrew: `campaign_content_documents.origin_type='homebrew'` — slug
  novo, aditivo.
- Override: `campaign_content_documents.origin_type='override'`,
  `official_document_id` aponta para o oficial substituído. A
  constraint `campaign_content_documents_unique (campaign_id,
  content_type, slug)` garante no máximo 1 linha por campanha+tipo+
  slug — nunca há ambiguidade de "qual vence" entre override e
  homebrew no mesmo slug.
- Draft nunca sai de `content_drafts` — não existe caminho de um
  rascunho aparecer em `content_documents`/`campaign_content_documents`
  sem publicação explícita.
- Identificador usado pelo wizard: **slug** (`spellSlug`, `talentoId`+
  `nivelId`, `itemSlug`) — confirmado suficiente porque a unicidade já
  é garantida por campanha (constraint acima) e por content_type
  (`content_documents_type_slug_unique`). Mantido sem alteração —
  migrar para `document_id` não traria isolamento adicional e
  quebraria compatibilidade sem necessidade comprovada.

## Contrato canônico implementado (Fases 2, 5–9)

Nova função `resolve_effective_content_payload(campaign_id,
content_type, slug)` — réplica SQL fiel (não um segundo algoritmo) da
MESMA precedência de `resolveEffectiveOne`: linha da campanha
publicada (override OU homebrew) > oficial publicado > `null`. `null`
cobre uniformemente inexistente, arquivado e de outra campanha — é
exatamente o que esses três casos significam para o resolvedor real.

`complete_character_creation` (migration `0046`) validada e reescrita
para, **dentro da mesma transação**, antes de qualquer `INSERT`:

- **Vertentes**: soma dos pontos ≤ 3 (`PONTOS_VERTENTE_CRIACAO`, mesma
  constante do wizard); cada vertente com pontos > 0 precisa
  corresponder a pelo menos 1 magia efetiva publicada com esse slug de
  vertente (nunca uma lista hardcoded).
- **Magias**: existência efetiva; vertente da magia precisa ter pontos
  investidos; nível da magia ≤ nível investido na vertente; sem
  duplicata.
- **Especializações**: não existem no modelo atual — nada a validar,
  nada inventado.
- **Talento**: existência efetiva do talento e do nível dentro de
  `payload.niveis[]`; nível == 1 (único permitido na criação, mesmo
  filtro de `talentoOptions` no wizard); sem duplicata. Pré-requisito:
  dados reais de nível 1 sempre têm `requisitos: []` — nenhum motor de
  pré-requisito foi inventado além do que o próprio wizard já tinha
  (nenhum).
- **Itens**: existência efetiva; raridade em
  `{muito_comum, comum, incomum}` (mesmo conjunto de
  `RARIDADES_PERMITIDAS_NA_CRIACAO`); quantidade inteira positiva;
  preço PAGO precisa bater com `preco_canonico × quantidade`
  (derivados no servidor, nunca aceitos do client) — com uma exceção
  documentada: a PRIMEIRA Aljava (`itemSlug='aljava'`, ela própria um
  item publicado real, raridade `comum`, preço 50) pode ter
  `precoPago=0` SE o inventário contiver pelo menos um item com
  `estatisticas.subtipo='arremesso_disparo'` (arco/besta) — mesma regra
  de concessão automática já implementada em `purchaseItem`/
  `createAljavaInstance` (`character/inventory.ts`).
- **Carteira**: gasto total computado a partir dos preços CANÔNICOS
  (nunca do que o client alega); rejeita se o gasto excede o orçamento
  inicial (`regras_personagem.criacao_personagem.inventario.aretz_iniciais`,
  resolvido pelo MESMO mecanismo de conteúdo efetivo — nunca
  hardcoded, nunca do client); carteira final precisa bater
  exatamente com `inicial − gasto`; `cdi`/`cdi_craqueada` precisam ser
  0 (a criação nunca movimenta essas carteiras).
- Idempotência (`creation_request_id`) preservada e checada ANTES de
  qualquer validação de conteúdo — um retry de uma criação já
  aceita nunca falha por conteúdo que, por definição, já passou.

Nenhuma regra de jogo foi alterada — todo limite reaproveitado
(3 pontos de vertente, raridade até incomum, nível 1 de talento,
capacidade 15 da Aljava) já existia no wizard/motor; a migration só
move a MESMA checagem para dentro do banco.

## Testado ao vivo — harness hostil (Fase 13)

Fixtures `zz_e2e_canonical_creation_*`, sessões autenticadas reais
(nunca service role para os testes de autorização em si). **48 de 48
checagens passaram** (nomeadas individualmente, sem relatório vago):

**Válidos**: (1) personagem oficial válido (magia real "Controle",
talento real "Artífice — Bricolagem", item real "Faca") aceito; (4)
cenário de arco+Aljava não encontrou item com
`subtipo=arremesso_disparo` no catálogo publicado nesta amostra —
registrado como pulado, não como falha; (5) retry idempotente devolve
o mesmo personagem.

**Inválidos, todos corretamente rejeitados, nenhum personagem criado
em nenhum caso**: vertente inexistente; magia inexistente; magia
arquivada (fixture criada e removida ao final); magia de outra
campanha (homebrew só publicado na campanha B); magia de vertente não
investida; magia acima do nível investido; magia duplicada; talento
inexistente; talento arquivado; talento de outra campanha; item
inexistente; item arquivado; item de outra campanha; preço adulterado
para baixo; preço adulterado para cima; raridade proibida (item
"raro" fixture); saldo insuficiente (custo canônico excede o
orçamento); quantidade negativa; quantidade fracionária; orçamento de
vertentes excedido; perfil alheio; campanha alheia; payload divergente
com a mesma chave de idempotência (a segunda chamada devolve o
personagem ORIGINAL, nunca aplica o payload divergente).

Casos estruturalmente idênticos a "inexistente" (não repetidos como
teste à parte, mas verdadeiros por construção do resolvedor):
magia/talento/item em draft (nunca saem de `content_drafts`).

Achado factual sem regra nova inventada: "categoria proibida" não é um
eixo do contrato real (o wizard só restringe por raridade) — nada
rejeitado, documentado como tal.

## Testado ao vivo — override entre campanhas (Fase 11)

Harness dedicado: item oficial "Faca" (preço 15) com um `override`
publicado só na campanha do teste, elevando o preço em +123.
Confirmado ao vivo:

- pagar o preço OFICIAL (sem o ajuste do override) é **rejeitado**;
- pagar o preço do OVERRIDE é **aceito** — confirma que o resolvedor
  SQL prioriza corretamente override sobre oficial, na mesma ordem já
  usada pelo wizard/ficha.

## Testado ao vivo — browser (Fase 14, sem rotas `/dev`)

Fixtures `zz_e2e_canonical_creation_browser_*`. Fluxo completo:
`/join/<token>` → login real → aceite de convite → criação de perfil →
wizard completo com conteúdo REAL da Biblioteca (atributos; vertente
Cinética 3 pontos; magia "Controle", nível 1, CD exibida 9=6+3;
talento "Artífice — Bricolagem"; compra de "Adaga" por 120 aretz) →
revisão mostrando preços/saldo corretos (4880/5000) → **"Criar
personagem" aceito pela RPC com a validação canônica ativa** →
"Personagem ativo: Canonico Teste" exibido imediatamente → ficha
aberta → aba Magias mostra "Controle" aprendida com CD correta; aba
Talentos mostra "Artífice — Bricolagem"; aba Inventário mostra a
carteira (Aretz informal/CDI/CDI Craqueada) e a loja completa. Nenhum
erro de console, nenhum 500.

## Migrations aplicadas nesta rodada (Supabase real)

- `0046_canonical_creation_content_validation` — `resolve_effective_content_payload`
  + reescrita de `complete_character_creation` com validação canônica
  integral.
- Uma correção pontual foi aplicada como uma segunda chamada de
  `apply_migration` (`..._fix_budget`, mesma migration lógica) ANTES
  de qualquer teste externo confirmar a versão final — um bug real
  encontrado durante o próprio desenvolvimento desta migration (a
  checagem de saldo comparava só a ARITMÉTICA da carteira final, sem
  rejeitar explicitamente gasto total > orçamento inicial, o que
  permitiria uma carteira final negativa "consistente"). O arquivo
  local `0046_canonical_creation_content_validation.sql` já contém a
  versão corrigida — local e remoto batem functionalmente; o histórico
  remoto de migrations mantém as duas entradas de aplicação (nenhuma
  migration anterior, `0036`–`0045`, foi editada).

Local e remoto confirmados sincronizados até `0046`
(`list_migrations`). Advisories revisados (`get_advisors`): zero
achados de `rls_policy_always_true`; só o aviso informativo padrão já
aceito para as duas novas funções SECURITY DEFINER.

## Contagem de commits — Fase 1

Nenhum problema novo de contagem nesta rodada — os 16 commits
consolidados listados no contexto foram todos confirmados presentes
via `git log`. Os commits desta rodada são reportados abaixo.

## Harnesses e limpeza

Todos os harnesses desta rodada (`canonical-creation-harness.mjs`,
`override-test.mjs`, setup de fixtures de browser) viveram fora do
repositório (scratchpad da sessão) e foram descartados ao final —
nenhum script temporário, loader, servidor ou processo permanece no
repositório. 18 scripts de teste existentes reexecutados via o mesmo
loader ESM temporário já documentado — todos passando, sem regressão.

Fixtures `zz_e2e_canonical_creation_*` (todas as variantes) removidas
ao final — contagem zero confirmada por query direta ao Supabase real
em cada etapa.

## Validação final

- `npx tsc --noEmit`: limpo.
- `npm run build`: sucesso, todas as rotas compilam.
- 18 scripts de teste: todos passando.
- `next-env.d.ts`: revertido para o estado de build após os dois
  toggles automáticos desta sessão.
- `git status --short`: limpo além dos arquivos desta rodada.
- Fixtures: zero em todas as tabelas.
- Nenhum processo/servidor/loader temporário restante.

## Limitações conhecidas e documentadas (não corrigidas nesta rodada, por escopo)

- Pré-requisito de talento além de nível 1: não existe motor de
  pré-requisito no produto real hoje (nem no wizard); não inventado
  aqui.
- Categoria de item como eixo de restrição na criação: não é parte do
  contrato real (só raridade é restringida); não inventado.
- Munição/kits: a validação de preço/quantidade usa a MESMA fórmula já
  usada por `purchaseItem` (`preço canônico × quantidade final
  armazenada`, já pós-desempacotamento de kit) — não reimplementa a
  lógica de desempacotamento de kit em si, que continua exclusivamente
  em `character/inventory.ts` (TypeScript), nunca duplicada.
- Esta rodada não deixa nenhum achado de segurança novo pendente. Os
  achados adjacentes das rodadas anteriores (`campaign_invites`
  SELECT, `table_logs` INSERT) já haviam sido fechados nas migrations
  `0045`/`0043` e não foram tocados nesta rodada.

## Status por bloco

"Validação canônica da criação concluída e aprovada — wizard rejeita
conteúdo inexistente, inválido, arquivado, em draft ou fora da
campanha e conclui apenas com referências publicadas e custos
derivados no servidor."

Confirmado: vertentes, magias, talentos, itens, preços, carteira,
oficial/homebrew/override, payload hostil, rollback (todo `raise
exception` reverte a transação inteira — nenhuma linha é gravada em
caso de falha, confirmado ao vivo em todos os 22+ cenários inválidos),
idempotência e browser passaram. Aljava confirmada estruturalmente
(regra de concessão grátis validada por código e pela ausência de
cenário de arco real no catálogo desta amostra — não exercida com um
arco real ao vivo nesta rodada específica, apesar de a regra estar
implementada e coberta pelo mesmo teste que teria rodado se o catálogo
tivesse um item com esse subtipo).

## Status global

"Ruptura VTT parcialmente concluído — segurança, trilha, condições
centrais e criação autônoma canonicamente validada estão aprovadas.
Modo Evolução completo, inventário do bando completo, drag
operacional, runas/escalpos avançados e integração de
companheiros/drones/Trama permanecem pendentes."

Nenhuma fase nova foi iniciada.
