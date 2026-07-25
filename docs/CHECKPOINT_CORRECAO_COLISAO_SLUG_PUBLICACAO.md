# Checkpoint — Correção: colisão de slug ao editar conteúdo já publicado

## Status

**Correção concluída e validada.** Bug crítico identificado pela auditoria formal do Editor Universal (rodada anterior) — `existeSlugColidindo` (`draftValidation.ts`) bloqueava o botão "Salvar rascunho" em QUALQUER edição de conteúdo já publicado, para os 5 tipos editáveis, e envenenava rascunhos de importação classificados `atualizacao`. Corrigido, testado (harness puro + Supabase real via browser), documentado.

Não reabre a Etapa 11 (`Etapa 11 concluída — integração editorial de drag aprovada.`) nem a Etapa 12 (`Etapa 12 concluída — validação integrada aprovada.`) — ambas permanecem exatamente como estavam.

## 1. Causa

`existeSlugColidindo(contentType, slug, ignorarDraftId?)` (`src/lib/contentSchema/draftValidation.ts`) tratava **qualquer** documento publicado encontrado com o mesmo `content_type`+`slug` como colisão:

```ts
const publicado = await getContentDocument(contentType as ContentType, slug);
if (publicado) return true;   // nunca excluía o próprio documento-base do rascunho
```

Como um rascunho de edição (`criarRascunhoDeEdicao`) sempre mantém o slug do documento publicado que está editando, toda chamada a essa função durante a edição encontrava esse mesmo documento e sinalizava colisão — bloqueando o salvamento antes mesmo de chegar à publicação. Afetava os 5 tipos editáveis (spell/talent/item/rune/capitulo) igualmente, via dois call sites: `atualizarRascunho` (`draftServerActions.ts`, o botão "Salvar rascunho") e `montarRevisaoPublicacao`/`validarCampos` (`publishReview.ts`, a tela de revisão). Rascunhos criados por importação com classificação `atualizacao` (`packageImport.ts::confirmarImportacao`) usam o mesmo padrão de `base_document_id` e sofriam do mesmo bug.

O RPC de publicação (`publish_content_draft`, migration `0022`) nunca teve esse defeito — já resolve "é o mesmo documento?" corretamente por `id` (`content_type:slug`) e por comparação de `base_payload_hash`. O bug era isolado à camada de pré-validação em TypeScript.

## 2. Regra anterior vs. regra corrigida

**Antes:** qualquer documento publicado com o mesmo `content_type`+`slug` = colisão, sempre.

**Depois:** `existeSlugColidindo(contentType, slug, ignorarDraftId?, baseDocumentId?)` — um documento publicado encontrado só é colisão se seu `id` for **diferente** de `baseDocumentId` (o `content_documents.id` do documento que este rascunho está editando, sempre lido do servidor via `ContentDraftRow.base_document_id`, nunca aceito livremente do client):

```ts
const publicado = await getContentDocument(contentType as ContentType, slug);
if (publicado && publicado.id !== baseDocumentId) return true;
```

Como `content_documents.id` é sempre `"<content_type>:<slug>"`, um `baseDocumentId` de outro `content_type` nunca pode coincidir por acidente com o `id` de um documento do tipo atual — a checagem é segura por construção, sem necessidade de comparar `content_type` separadamente.

A regra de colisão contra outro **rascunho** (`findDraftBySlug`) não mudou — continua bloqueando sempre que existe outro rascunho com o mesmo slug, exceto o próprio rascunho sendo salvo (`ignorarDraftId`).

## 3. Tipos afetados e importação

Todos os 5 tipos editáveis (`spell`, `talent`, `item`, `rune`, `capitulo`) — mesma regra centralizada, nenhuma duplicação por tipo. Rascunhos de atualização criados por importação (`packageImport.ts::confirmarImportacao`, que define `base_document_id: "${contentType}:${slug}"` quando `item.hashAtualPublicado` existe) passam pelo mesmo `atualizarRascunho`/`validarCamposX` ao serem salvos — corrigidos pela mesma mudança, sem qualquer alteração no importador em si.

## 4. Arquivos alterados

- `src/lib/contentSchema/draftValidation.ts` — `existeSlugColidindo` ganha o parâmetro `baseDocumentId?: string | null`; as 5 funções `validarCamposMagia/Item/Runa/Talento/Capitulo` ganham o mesmo parâmetro opcional e o repassam.
- `src/lib/contentSchema/draftServerActions.ts` — `atualizarRascunho` passa `draft.base_document_id` (lido do servidor via `getDraftById`) para a função de validação correspondente.
- `src/lib/contentSchema/publishReview.ts` — `validarCampos` (interno a `montarRevisaoPublicacao`) passa `draft.base_document_id` da mesma forma.
- `scripts/dev/validate-slug-collision.mjs` — harness novo (regressão focada).

Nenhuma migration criada ou alterada. Nenhum outro arquivo do Editor Universal tocado — sem detecção de ciclos entre capítulos, sem alteração de preview de capítulo, sem alteração de exportação em massa, sem reabertura do aceite de browser das Etapas 4/6–10.

## 5. Regra corrigida — cobertura

- Rascunho novo, slug livre: permitido.
- Rascunho novo, slug já publicado: bloqueado (comportamento preexistente, preservado).
- Edição mantendo o slug do próprio documento-base: **permitido (era o bug — agora corrigido)**.
- Edição mudando para slug livre: permitido.
- Edição mudando para slug de outro documento publicado: bloqueado.
- `base_document_id` de outro `content_type`: nunca libera colisão (seguro por construção, `id` sempre embute o tipo).
- Rascunho de atualização importado, mantendo o próprio slug: **permitido (era o bug — agora corrigido)**.
- Rascunho sem `base_document_id`: não se beneficia da exceção (comportamento de rascunho novo preservado).
- Colisão contra outro rascunho (não documento publicado): comportamento preexistente, preservado.
- Consistente para os 5 tipos editáveis.

## 6. Reprodução do defeito (antes da correção)

`git stash` temporário das 3 alterações de código, recompilado o harness contra o código anterior e executado: **10 falhas**, exatamente nos 2 cenários previstos (edição mantendo o próprio slug; importação de atualização mantendo o próprio slug), para os 5 tipos — confirmando que o harness detecta o bug real, não um cenário hipotético. `git stash pop` restaurou a correção; recompilado e reexecutado — as mesmas 10 verificações passam.

## 7. Testes de regressão

`scripts/dev/validate-slug-collision.mjs` — roda a regra REAL de produção (`validarCamposMagia/Item/Runa/Talento/Capitulo`, que chamam `existeSlugColidindo` internamente), nunca uma cópia reimplementada. As duas dependências de I/O real (`getContentDocument`, `findDraftBySlug`) são substituídas por fakes em memória via injeção em `require.cache`, no path resolvido dos módulos compilados — nunca reimplementando a lógica de colisão em si.

```
npx tsc --module commonjs --target es2020 --moduleResolution node \
  --esModuleInterop --skipLibCheck --resolveJsonModule --outDir <dir> \
  src/lib/contentSchema/draftValidation.ts
node scripts/dev/validate-slug-collision.mjs <dir-compilado>
```

**46/46 verificações passando** — 9 cenários × 5 tipos editáveis + 1 caso extra (colisão contra outro rascunho).

Harnesses preexistentes diretamente relacionados, reexecutados sem alteração de código e sem regressão: `validate-editorial-drag.mjs` (Etapa 11, correção do drag) — **6/6**; `validate-import-export-book.mjs` (Etapa 11) — **19/19**.

## 8. Validação contra Supabase real (fluxo real da aplicação, não SQL direto)

Ambiente diagnosticado (porta 3000 livre, servidor iniciado via `npm run dev`). O `.env.local` `SUPABASE_SERVICE_ROLE_KEY` local está desatualizado (o projeto rotacionou para chaves de assinatura JWT ES256 — `auth.admin.createUser` via `@supabase/supabase-js` falha com `bad_jwt` a partir deste ambiente); contornado criando a fixture admin via o próprio fluxo de cadastro do app (`/login` → "Criar conta", auto-confirmado neste projeto) e concedendo `admin_users` via SQL direto contra o projeto real (`yvxoijexyhjjipjktfuu`, credenciais MCP, que não dependem da chave local desatualizada). Achado registrado, não corrigido (fora do escopo desta correção — não é um problema de código, é uma chave local para rotacionar fora desta sessão).

Fluxo completo executado, via browser real, para **2 tipos**:

### `capitulo`

1. Criado rascunho novo → salvo → publicado (`1.0.0`).
2. Criado rascunho de edição a partir do publicado.
3. Alterado campo `descricao_curta`, slug mantido (campo de slug **desabilitado na UI** durante edição — `"Slug * (travado — vínculo com o publicado)"`, uma segunda camada de proteção do produto, independente desta correção).
4. "Salvar rascunho" → **sucesso**, sem erro de colisão, versão de edição incrementada (1→2).
5. "Revisar e publicar" → `base: base atual (sem conflito)`, `próxima versão: 1.0.1`, botão "Publicar" habilitado (`podePublicar: true`).
6. Publicado com sucesso → `status: published`, `versão: 1.0.1`.
7. Reload completo da página de detalhe (nova navegação, não SPA) → versão e conteúdo confirmados persistidos.
8. Consulta direta a `content_documents` (Supabase real) → `version: "1.0.1"`, `descricao_curta` com o texto editado — persistência confirmada no banco, não só na UI.
9. `content_changelog` — 2 entradas: `created` (`—`→`1.0.0`) e `updated` (`1.0.0`→`1.0.1`), ambas com o resumo digitado.

### `item`

Mesmo fluxo ponta a ponta: criar → salvar → publicar (`1.0.0`) → criar rascunho de edição → alterar `descricao_curta` mantendo o slug → salvar com sucesso (sem colisão) → revisão mostra `base atual (sem conflito)` → publicar (`1.0.1`) → `content_documents` confirma `version: "1.0.1"` e a descrição editada.

Console e rede: nenhum erro em nenhum passo, em nenhum dos dois tipos (`read_console_messages` verificado ao final de cada fluxo).

### Mudança de slug para outro conteúdo publicado

A UI desabilita o campo de slug durante a edição (constatado ao inspecionar o formulário: `disabled: true`, rótulo "travado — vínculo com o publicado") — este cenário não é alcançável por um usuário real através da tela. A regra em si (edição tentando mudar para o slug de OUTRO documento publicado → bloqueado) está coberta e comprovada pelo harness puro (casos 5 e 9, para os 5 tipos, contra a função de produção real), que é a evidência decisiva para essa regra; não repetido via browser por já não ser um caminho de UI real.

### Importação de atualização

Não reexercida via a UI de upload de arquivo (fora do escopo desta correção — "não reescrever o importador"). Coberta por: (a) leitura direta do código de produção (`packageImport.ts:290`, confirma que um rascunho de atualização importado recebe `base_document_id: "<contentType>:<slug>"`, exatamente o formato que a correção espera); (b) o harness puro exercita exatamente esse formato contra a função de produção real (caso 7, para os 5 tipos); (c) o fluxo de browser confirma que `atualizarRascunho` — a mesma função que qualquer rascunho importado usa ao ser salvo — funciona corretamente com um `base_document_id` real. A combinação das três é considerada evidência suficiente sem reexercitar a UI de importação de arquivo.

## 9. Fixtures

Removidas ao final, confirmado por contagem zero contra o Supabase real: 2 documentos `capitulo` de teste + 1 `item` de teste (drafts, publicados, changelog, editor_metadata, book_links — todas as tabelas relacionadas), usuário admin de fixture (`admin_users` + `auth.users`). Nenhum conteúdo oficial ou dado real tocado.

## 10. Verificação técnica

`git status --short` limpo antes de iniciar; `git diff --check` sem problemas; `npx tsc --noEmit` sem erros; `npm run build` sucesso (servidor de preview parado antes; `next-env.d.ts` revertido após um toque automático do build); harness da correção **46/46**; harness do drag editorial (Etapa 11) **6/6** inalterado; harness de import/export (Etapa 11) **19/19** inalterado. Harnesses/matriz da Etapa 12 não reexecutados (nenhum código compartilhado com a Etapa 12 foi tocado).

## 11. Limitações e itens fora de escopo (não tocados nesta correção)

- Detecção de ciclos indiretos entre capítulos — não implementada (fora de escopo explícito desta rodada).
- Preview de capítulo — inalterado.
- Exportação em massa/"tipo completo" — inalterada.
- Aceite de browser das Etapas 4 e 6–10 — não reaberto; permanecem "aceite de browser pendente" conforme a auditoria formal anterior.
- Chave de service role local desatualizada (`.env.local`) — identificada, não corrigida (rotação de chave é uma ação de infraestrutura fora do escopo de uma correção de código).

## 12. Status final

- **Etapa 11: "Etapa 11 concluída — integração editorial de drag aprovada."** — inalterada.
- **Etapa 12: "Etapa 12 concluída — validação integrada aprovada."** — inalterada.
- **Etapa 5** (Publicação, versões e changelog): edição de conteúdo publicado, salvamento, revisão, republicação e importação de atualização confirmados funcionando; testes focados passando; validação integrada (Supabase real, fluxo real da aplicação) passando para 2 tipos reais. Rebaixada para "Parcial" pela auditoria anterior por causa exatamente deste bug — reclassificada para **"Implementada — aceite de browser pendente."**, já que o fluxo de edição/publicação em si foi validado via browser real nesta correção (registrado especificamente para a Etapa 5); o aceite de browser completo da Etapa 5 original (25 itens do checkpoint original) continua pendente — não reaberto nem reexecutado por completo aqui.
- **Estado global do Editor Universal: "Editor Universal parcialmente concluído — validações de browser das Etapas 4 e 6–10 pendentes."** — não declarado concluído.
