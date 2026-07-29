# CHECKPOINT — ETAPA 2: LISTA ADMINISTRATIVA E INSPEÇÃO (READ-ONLY)

**Projeto:** Ruptura VTT
**Data:** 14 de julho de 2026
**Checkpoint anterior:** `d2a2505` — feat: add canonical content schema foundation (Etapa 1)
**Escopo desta etapa:** primeira interface administrativa da Biblioteca — só leitura e diagnóstico. Nenhum botão de criar/editar/duplicar/publicar/arquivar/importar/exportar.

---

## 1. Autorização escolhida

A auditoria da Etapa 0 confirmou que não existia nenhum papel administrativo no projeto (`docs/AUDITORIA_EDITOR_UNIVERSAL_CONTEUDO.md` §9) — só Supabase Auth (identifica quem está logado), sem nenhum conceito de "o que pode fazer". Esta etapa cria a camada mínima:

- **Migration `supabase/migrations/0020_content_admin_roles.sql`** (aplicada ao banco real do projeto):
  - Tabela `admin_users (user_id uuid primary key references auth.users(id), granted_at, granted_by, note)`, RLS habilitada, **sem nenhuma policy** de select/insert/update/delete para `anon`/`authenticated` — a tabela não é legível nem gravável via PostgREST por ninguém além do `service_role`.
  - Função `is_content_admin(check_user_id uuid default auth.uid()) returns boolean`, `security definer`, `stable`. Roda com o privilégio de quem a criou (consegue ler `admin_users` mesmo sem policy de select), mas só responde `true`/`false` — nunca vaza a lista de administradores. `execute` revogado de `PUBLIC` e concedido só a `authenticated` (um usuário anônimo recebe "permission denied" ao tentar chamar, nunca uma resposta).
  - **Nenhuma alteração em `content_documents`/`content_packs`/`content_changelog` ou em suas policies existentes.** A leitura administrativa desta etapa usa o MESMO client anon-key/RLS já existente (`getContentClient()`, `src/lib/content/client.ts`) — hoje todo o conteúdo é `status='published'`, então o alcance de leitura não mudou; só a autorização de acesso à ROTA é nova.

- **Checagem no servidor, sempre** — `src/lib/auth/contentAdmin.ts::getContentAdminStatus()`:
  1. Lê a sessão do cookie httpOnly já existente (`getCurrentUser()`, mesmo mecanismo de `/login`).
  2. Sem sessão → `{ isAdmin: false }` imediatamente, sem tocar o banco.
  3. Com sessão → usa o client "scoped" já existente (`getScopedTableClient()`, que anexa o access token) e chama `.rpc("is_content_admin")`.
  4. Qualquer erro de rede/RPC é tratado como **não autorizado** — nunca como autorizado por padrão (fail-closed).

- **Gate único**: `src/app/admin/layout.tsx` roda essa checagem em toda requisição a qualquer rota sob `/admin` (`export const dynamic = "force-dynamic"` impede cache estático da checagem). Não é uma questão de esconder um link na UI — sem sessão, renderiza uma tela de "faça login"; com sessão mas sem `admin_users`, renderiza "acesso restrito" e nem chega a buscar dados da Biblioteca.

### Forma segura de conceder acesso administrativo

`scripts/grant-content-admin.ts` (novo) — conecta direto no Postgres (`SUPABASE_DB_URL`, mesma variável já usada por `scripts/apply-migration.ts`), resolve `auth.users` por email e insere/remove em `admin_users`. **O email nunca é passado por argumento e nunca fica no repositório** — é digitado na hora de rodar o comando:

```bash
npx tsx scripts/grant-content-admin.ts conceder alguem@exemplo.com   # concede
npx tsx scripts/grant-content-admin.ts revogar alguem@exemplo.com    # revoga
npx tsx scripts/grant-content-admin.ts listar                       # lista quem tem acesso
```

Aplicado nesta etapa: a conta da proprietária do projeto (fornecida diretamente na conversa, não commitada em nenhum arquivo) recebeu acesso via `conceder`, confirmado com `listar` e pelo browser check (§9).

---

## 2. Arquitetura da interface

```
src/app/admin/
├── layout.tsx              # gate de autorização único (força dynamic)
├── AcessoNegado.tsx         # tela de "faça login" / "acesso restrito"
└── biblioteca/
    ├── page.tsx              # lista: fetch + composição (Server Component)
    ├── labels.ts              # labels/cores/formatador compartilhados (lista + detalhe)
    ├── ListFilters.tsx         # formulário GET (sem JS) — tipo, busca, categoria
    ├── ContentTable.tsx        # tabela: adapta cada linha, mostra legado/automação/desconhecidos
    ├── Pagination.tsx           # anterior/próxima via querystring
    ├── ManifestPanel.tsx         # alerta de divergência manifesto × dados
    └── [contentType]/[slug]/
        ├── page.tsx                # detalhe: fetch + composição
        ├── EffectsPanel.tsx         # efeitos em cards (tipo, gatilho, duração, automação, payload)
        └── DiagnosticsPanel.tsx     # validação, referências, campos desconhecidos

src/lib/auth/contentAdmin.ts        # getContentAdminStatus() — única porta de autorização
src/lib/contentSchema/
├── adminQueries.ts                  # listContentDocumentsForAdmin, countContentDocumentsByType
├── adminDiagnostics.ts               # adaptarParaAdmin — adapta+valida+diagnostica de uma vez
└── manifestDiagnostics.ts            # getManifestDiagnostics — compara manifesto × contagem real
```

Cada arquivo tem uma responsabilidade; nenhum componente decide sozinho "isso é automático" ou "isso é admin" — essas decisões continuam só em `src/lib/contentSchema/{effectTypeRegistry,diagnostics}.ts` (Etapa 1) e `src/lib/auth/contentAdmin.ts` (esta etapa), reutilizados aqui, nunca duplicados.

---

## 3. Rota, filtros, paginação

- **Lista**: `GET /admin/biblioteca?contentType=&q=&categoria=&page=`
- **Detalhe**: `GET /admin/biblioteca/[contentType]/[slug]`
- **Busca textual** (`q`): `nome`/`slug`/`categoria`/`subtipo` via `.or(...ilike...)` no PostgREST; a entrada é higienizada (remove `, ( ) % \`) em vez de tentar escapar a sintaxe do filtro — mais simples e sem risco de quebrar a query.
- **Filtro por tipo**: os 12 `content_type` (dropdown com rótulo "adapter dedicado" vs. "adapter genérico" vindo do próprio `CONTENT_TYPE_REGISTRY`).
- **Filtro por categoria**: igualdade exata na coluna projetada `categoria`.
- **Paginação**: `range()` do PostgREST, 25 itens por página, contagem exata via `{ count: "exact" }` na mesma query (sem round-trip extra). Testado com 435 documentos reais → 18 páginas.
- **Ordenação**: por `content_type, slug` (ordem estável do enum Postgres, depois alfabética dentro de cada tipo).

---

## 4. Tipos de conteúdo suportados

Todos os 12 `content_type` funcionam na lista e no detalhe:

| Grupo | content_types | Comportamento |
|---|---|---|
| Adapter semântico (Etapa 1) | spell, talent, item, condition | Preview humano completo: classificação, duração, resistência, efeitos em cards com automação/executor, referências clicáveis |
| Adapter genérico | rune, escalpo, property, combat_action, character_rule, combat_field, combat_flow, master_table | Preview mínimo (nome, tags), "Nenhum efeito canonicalizado para este conteúdo", payload inteiro preservado como campo desconhecido — nunca quebra |

Confirmado com dados reais (spell `energetica_bola_de_fogo`, item `ansiolitico`, condition `queimando`, talent `artifice`, rune `runa_cac_retratil`, property `arremesso`) e com browser check em `spell` e `combat_action`.

---

## 5. Diagnósticos exibidos

Na lista (por linha) e no detalhe (por documento/nível):

- **Classificação do legado** (`conversao_direta` / `conversao_com_confirmacao` / `somente_leitura` / `incompativel` / `invalido`), rotulada em português.
- **Modo de automação por efeito** — símbolo + cor + rótulo (não depende só de cor): ✓ automático, ◐ assistido, ✎ lembrete, ▶ narrativo rastreado, ✕ sem executor. Resumo agregado por documento na lista.
- **Executor conhecido** — quando existe, mostrado como caminho de módulo (ex.: `src/lib/character/itemUse.ts`) embaixo de cada card de efeito.
- **Efeitos sem executor** — contabilizados no resumo de automação (nenhum é apresentado como "automático" sem que o catálogo confirme).
- **Campos desconhecidos / somente leitura** — tabela com caminho, valor formatado e motivo (nunca some, nunca aparece como JSON cru na tabela).
- **Erros / avisos / informações de validação** — `ResultadoValidacao` completo por documento, com símbolo por severidade.
- **Referências encontradas** — lista com link clicável para `/admin/biblioteca/{tipo}/{slug}` quando o tipo é resolvido; texto simples quando não.
- **Versão, status, pack e origem** — `versão`, `status`, `pack: <source_pack_id> @ <source_pack_version>`, `atualizado em`.
- **Divergência manifesto × dados** — painel no topo da lista, cobrindo todos os content_types com contagem no manifesto (não só o caso já conhecido). Confirmado ao vivo: `Item / Equipamento (equipamentos): manifesto declara 119, banco tem 120` — exibido, **não corrigido**.

Nenhum JSON bruto aparece no fluxo principal — só dentro de um `<details>` recolhido ("Modo avançado — payload bruto (JSON)"), como o aditivo permite.

---

## 6. Limitações (deliberadas)

- Só 4/12 content_types têm preview semântico completo (os do MVP + condition) — os outros 8 mostram o payload preservado como campo desconhecido em vez de um preview estruturado (correto: eles ainda não têm adapter dedicado, ver Etapa 1).
- Busca é `ilike` simples nas colunas projetadas — não busca dentro de `payload` (JSONB) nem em texto longo.
- `admin_users` concede acesso total (leitura) a toda a Biblioteca — não há granularidade por content_type ou por pack ainda (não pedido nesta etapa).
- Sem cache/invalidação — cada requisição consulta o Supabase direto; aceitável para uma tela de baixo tráfego administrativo.
- Filtro de categoria exige valor exato (sem dropdown de opções conhecidas ainda).

---

## 7. Segurança — checklist

- ✅ Somente usuário autenticado E com linha em `admin_users` acessa `/admin/*` (checado no servidor, `layout.tsx`).
- ✅ Não depende de esconder UI — a checagem roda antes de qualquer busca de dado, em toda requisição.
- ✅ Nenhuma policy nova para `anon` (nem em `admin_users`, nem em `content_documents`).
- ✅ Nenhuma escrita genérica liberada em `content_documents` — a rota é 100% leitura, e a única tabela nova (`admin_users`) não tem policy de escrita para ninguém além de `service_role`.
- ✅ Nenhum uso de service role no client — `getContentAdminStatus`/`getContentClient` usam exclusivamente a anon key; `scripts/grant-content-admin.ts` usa conexão Postgres direta (`SUPABASE_DB_URL`), rodado manualmente fora do app, nunca embutido no bundle.
- ✅ Nenhuma chave, `.env.local` ou segredo exposto nesta conversa ou no repositório — o email da administradora foi usado apenas como argumento de linha de comando, não commitado.
- ✅ Nenhuma policy existente de `content_documents`/`content_packs`/`content_changelog` foi alterada.
- ✅ Nenhuma escrita de conteúdo implementada.

---

## 8. Validação

- `npx tsc --noEmit` — sem erros.
- `npm run build` — sucesso; rotas novas registradas: `ƒ /admin/biblioteca`, `ƒ /admin/biblioteca/[contentType]/[slug]`.
- `git status --short` — ver §10.
- `next-env.d.ts` — inalterado.
- Verificações locais (sem browser, via `tsx`, usando só a anon key — mesmos dados que um visitante público já leria):
  - `listContentDocumentsForAdmin({ search: "fogo" })` → 23 resultados reais.
  - `getManifestDiagnostics()` → detectou ao vivo a divergência real de `item` (119 vs. 120) e `master_table` fora do manifesto.
  - `adaptarParaAdmin` rodado contra 6 registros reais (spell, item, condition, talent, rune, property) — todos válidos, sem exceções.

### Browser check (confirmado pela proprietária da conta, com login real)

- ✅ Acesso sem autenticação bloqueado — tela "Área administrativa — Esta área exige login", sem vazar dado nenhum.
- ✅ Login com a conta autorizada (`gabrielagabrielcardoso@gmail.com`) → lista carrega: 435 conteúdos, 18 páginas, painel de divergência do manifesto visível, filtros (tipo/busca/categoria) renderizados.
- ✅ Detalhe de conteúdo com adapter semântico (`spell:energetica_bola_de_fogo`) — preview humano completo, 3 efeitos em cards (`Teste ou resistência` assistido, `Dano` assistido, `Aplicar condição` lembrete com referência `condition:queimando`), diagnóstico técnico disponível.
- ✅ Detalhe de conteúdo com adapter genérico (`combat_action:agarrar`) — abre sem erro, "Nenhum efeito canonicalizado para este conteúdo", campo desconhecido presente.
- ✅ Nenhum overlay de erro do Next.js visível em nenhuma das duas telas (screenshots confirmadas).

Não foi possível eu mesma dirigir o login via automação de browser — digitar senha em qualquer campo, mesmo a pedido do usuário, é uma ação que não realizo (ver regras de segurança do agente). Por isso os passos de login e navegação autenticada foram conduzidos pela própria proprietária da conta, com screenshots compartilhados na conversa como evidência.

---

## 9. Próximos passos (não iniciados nesta etapa)

Conforme `docs/PLANO_IMPLEMENTACAO_EDITOR_UNIVERSAL.md`, a Etapa 3 (Editor Universal de Campos Básicos) é o próximo passo natural — criar/editar metadados simples de magia/talento/item. Esta etapa não inicia nenhuma escrita; entrega só a base de leitura/diagnóstico e a autorização mínima sobre a qual a Etapa 3 vai construir formulários de edição.
