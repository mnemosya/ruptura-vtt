# Checkpoint — Correção: round-trip de item falhava contra o schema oficial (`categoria_label`/`raridade_label` ausentes)

## Status

**Correção concluída e validada ao vivo (browser real + Supabase real).** Achado registrado como "não corrigido nesta rodada" em `docs/CHECKPOINT_ETAPA5_PUBLICACAO_VERSIONAMENTO.md` (seção "Aceite de browser" da rodada anterior): `serializarItem` (`src/lib/contentSchema/publishSerialization.ts`) nunca emitia `categoria_label`/`raridade_label` — campos obrigatórios do schema oficial de equipamentos (`content/schema_equipamentos_v1_2.json`). Resultado prático: **qualquer item publicado pelo Editor Universal, ao ser exportado e reimportado sem edição manual, era classificado "Inválido contra o schema oficial"** — o round-trip básico "exportar → reimportar" só funcionava se um humano editasse o JSON exportado à mão para acrescentar os dois campos, o que contradiz o próprio propósito de exportação/importação como caminho confiável de mover conteúdo.

Não reabre Etapa 12, drag editorial (Etapa 11), RLS, campanhas, perfis ou personagens. Não implementa funcionalidade nova, não faz refactor amplo, não altera mecânica de jogo.

## Auditoria inicial — reprodução exata

Reproduzido contra o código pré-fix real (antes de qualquer alteração desta rodada), via harness puro compilando `publishSerialization.ts`/`officialSchemaValidator.ts`/`draftMapping.ts`/`canonicalHash.ts`/`contentPackage.ts` reais com `tsc` e executando com `node` (nunca reimplementando a lógica):

```
schema oficial de equipamentos: "categoria_label" is a required property
schema oficial de equipamentos: "raridade_label" is a required property
```

Confirmado também via UI real: um item mínimo (nome/slug/categoria/raridade) publicado e exportado por `/admin/biblioteca/exportar`, reimportado sem alteração por `/admin/biblioteca/importar` → classificação **"Inválido contra o schema oficial"**, listando exatamente os dois erros acima.

### O problema é só os dois labels, ou há mais campos obrigatórios ausentes?

Investigado lendo `content/schema_equipamentos_v1_2.json` (`required`) contra `validarCamposItem` (`draftValidation.ts`, a validação de SALVAMENTO de rascunho). Achado: o schema oficial também exige `preco` e `descricao_longa`, que `validarCamposItem` não torna obrigatórios ao salvar — mas isso é esperado e correto: um rascunho pode ficar incompleto entre salvamentos (aditivo §14.1), então bloquear o SALVAMENTO por esses campos seria incorreto. A correção abaixo (checagem no momento da REVISÃO/publicação, reaproveitando `validarContraSchemaOficial`) já cobre genericamente QUALQUER campo obrigatório ausente do schema oficial — não só os dois labels — sem precisar de uma lista bespoke de campos "realmente obrigatórios para publicar".

## Fonte de verdade dos labels

`categoria`/`raridade` do item são os únicos valores reais editados pelo usuário (campos de texto no editor, sem select restrito ao enum oficial ainda — limitação preexistente, não tocada aqui). Os rótulos (`categoria_label`/`raridade_label`) são estritamente derivados desses valores — **nunca aceitos do client, nunca duplicados em mais de um lugar**. Extraídos diretamente do conteúdo oficial real (`content/db_equipamentos_normalizado_v1_2.json`, script Python de extração) e cross-checados contra o enum do schema oficial (10 categorias, 5 raridades — ambos batem exatamente).

Novo módulo `src/lib/contentSchema/itemLabels.ts`:
- `CATEGORIA_ITEM_LABELS`/`RARIDADE_ITEM_LABELS` — os dois mapas fechados, únicos no repositório (nenhum outro lugar duplica esses rótulos).
- `categoriaItemLabel(categoria)`/`raridadeItemLabel(raridade)` — retornam `undefined` quando o valor está ausente OU não é reconhecido; **nunca inventam um rótulo**, nunca combinam categoria válida com label de outra categoria.

## Regra de serialização

`serializarItem` (`publishSerialization.ts`) agora deriva os labels no SERVIDOR, na hora de serializar para publicação — nunca confia num label vindo do rascunho/client:

```ts
setOpcional(base, "categoria", campos.categoria);
setOpcional(base, "categoria_label", categoriaItemLabel(campos.categoria));
setOpcional(base, "raridade", campos.raridade);
setOpcional(base, "raridade_label", raridadeItemLabel(campos.raridade));
```

`setOpcional` só define a chave quando o valor não é `undefined`; quando `categoria` está ausente/não reconhecida, `categoria_label` também fica `undefined` — analisado como seguro porque a checagem de "reconhecida" em si é bloqueante na REVISÃO (ver abaixo), nunca na serialização — serialização não decide se algo publica.

### Legado e campos desconhecidos

A estratégia "overlay sobre clone do `rawOriginal`" (Etapa 5) é preservada sem alteração — campos desconhecidos do payload legado sobrevivem à serialização por construção. Um item legado que nunca teve `categoria_label`/`raridade_label` no `rawOriginal` passa a receber os labels corretos (derivados do `categoria`/`raridade` atuais), confirmado por harness.

## Checagem bloqueante na revisão/publicação

`montarRevisaoPublicacao` (`publishReview.ts`) ganhou uma checagem nova, escopada só a `content_type === "item"` (não generalizada a magia/talento/runa — fora do escopo desta correção pontual, evitaria surfacear violações de schema não relacionadas): simula os campos que só o RPC `publish_content_draft` injeta (`id`/`slug`/`status`/`versao`/`created_at`/`updated_at` — nunca escritos de verdade aqui, só simulados para a checagem de forma) e chama `validarContraSchemaOficial("item", corpoSimulado)` — o MESMO validador já usado por `packageImport.ts` na importação, nunca uma cópia divergente. Bloqueante: nunca publica um item que não seria reimportável sem edição manual do payload.

Arquivos alterados: `src/lib/contentSchema/itemLabels.ts` (novo), `src/lib/contentSchema/publishSerialization.ts`, `src/lib/contentSchema/publishReview.ts`. Nenhum outro arquivo de produção tocado. Nenhuma migration.

## Payload antes/depois (item de fixture real, ver §"Round-trip real" abaixo)

Antes (payload que `serializarItem` produzia, pré-fix):
```json
{ "categoria": "ferramenta", "raridade": "incomum", ... }
```
Depois:
```json
{ "categoria": "ferramenta", "categoria_label": "Ferramenta", "raridade": "incomum", "raridade_label": "Incomum", ... }
```
Confirmado por leitura direta de `content_documents.payload` no Supabase real após publicação.

## Teste de regressão — serialização de item (harness puro)

`scripts/dev/validate-item-schema-roundtrip.mjs` — 12 verificações, rodando `serializarRascunhoParaPublicacao`/`validarContraSchemaOficial` REAIS (compiladas com `tsc`, executadas com `node`, nunca reimplementadas):

1. Categoria válida → label correto (individual).
2. Raridade válida → label correto (individual).
3. Todas as 10 categorias reais produzem exatamente o label esperado.
4. Todas as 5 raridades reais produzem exatamente o label esperado.
5. Categoria não reconhecida (texto livre) nunca produz um label inventado.
6. Item completo e válido passa no schema oficial.
7. **Prova de regressão**: corpo já serializado, com os labels removidos manualmente (simulando o comportamento pré-fix), É rejeitado pelo schema oficial — confirma que o schema genuinamente exige os campos, não é um teste vazio.
8. Categoria fora do enum oficial é rejeitada pelo schema.
9. Hash canônico determinístico para o payload corrigido.
10. Campos desconhecidos do `rawOriginal` sobrevivem à serialização (overlay sobre clone preservado).
11. Item legado (sem labels prévios no `rawOriginal`) ainda serializa com labels corretos.
12. Efeitos do item sobrevivem à correção, não tocados por ela.

**12/12 passam contra o código corrigido.** Reproduzido rigorosamente contra o código pré-fix real (`git stash` de `publishReview.ts`+`publishSerialization.ts`, `itemLabels.ts` movido para fora do working tree): **6/12 falham** exatamente como esperado (todas as checagens de derivação de label e de schema-passa falharam; a prova de regressão em si, a checagem de categoria-fora-do-enum, o hash e a preservação de campos desconhecidos continuaram passando, como esperado — não dependem da correção). `git stash pop` restaurado; 12/12 voltam a passar.

## Round-trip real obrigatório — provado ao vivo (browser real + Supabase real, sem edição manual do JSON)

Fixture: item "RT Item Fix XYZ" (`item:rt_item_fix_xyz`), criado via `/admin/biblioteca/rascunhos/novo` com `categoria=ferramenta`, `raridade=incomum`, preço, descrições, efeito `cura`.

1. Salvo (v2, sem erros) → publicado (`1.0.0`). Revisão mostrou `+ categoria_label — Ferramenta` e `+ raridade_label — Incomum` derivados automaticamente no diff.
2. Confirmado por SQL direto: `categoria_label="Ferramenta"`, `raridade_label="Incomum"` persistidos em `content_documents.payload`.
3. Exportado via `/admin/biblioteca/exportar` (resposta de rede real capturada — pacote `ruptura-content-package` completo).
4. **Reimportado o arquivo exportado, SEM NENHUMA edição** (via injeção `File`+`DataTransfer` no `<input type="file">` real — a ferramenta de browser não tem upload nativo de disco, técnica padrão de teste headless, nunca contornando a leitura real do arquivo pelo app) → classificação: **"Idêntico ao publicado"** (mesmo hash canônico, nada a fazer). **Esta é a prova central**: o round-trip funciona com zero reparo manual do JSON.
5. Pacote de "atualização" construído usando SÓ a função real `hashCanonico` (compilada e executada em Node, nunca reimplementada): pegou o JSON exportado de verdade, alterou APENAS `descricao_curta`, recomputou `hashPayload`/`hashManifest` reais.
6. Reimportado → classificação: **"Atualização de conteúdo publicado"**. Confirmado — 1 rascunho criado.
7. `base_document_id` do rascunho confirmado (`item:rt_item_fix_xyz`) por SQL direto.
8. Rascunho aberto na UI real, "Salvar rascunho" **sem falsa colisão** (versão 1→2 — reconfirma que a correção de colisão de slug de `docs/CHECKPOINT_CORRECAO_COLISAO_SLUG_PUBLICACAO.md` segue intacta).
9. "Revisar e publicar": `base: base atual (sem conflito)`, próxima versão `1.0.1`, **sem erros bloqueantes** (a checagem nova de schema passou).
10. Publicado → `1.0.1`. Confirmado por SQL: `version="1.0.1"`, `descricao_curta` atualizada, `categoria_label`/`raridade_label` corretos persistidos, changelog com 2 entradas (`created` 1.0.0, `updated` 1.0.1).
11. Reload da página confirmou persistência via UI.
12. Console (`read_console_messages`) sem erros em nenhum passo.

### Casos extras (edge cases)

- **Hash inválido**: pacote com `hashPayload` adulterado (zeros) → corretamente rejeitado: `"Hash declarado não bate com o hash recomputado do payload — o pacote pode estar corrompido ou adulterado"`.
- **Conteúdo de outro slug não é tratado como atualização**: pacote válido (hash real) para um slug nunca publicado (`rt_item_fix_outro_slug`) → corretamente classificado **"Novo"** (nunca "atualização"). Não confirmado/importado (fixture não criada, sem necessidade de limpeza).

## Smoke check de talento (post-MVP + regressão junto)

Executado no mesmo browser real, confirmando junto a correção anterior de efeitos pós-MVP (`e584abb`, ver `docs/CHECKPOINT_CORRECAO_VALIDACAO_TIPOS_EFEITO_POS_MVP.md`) e o novo harness de regressão dela (`validate-post-mvp-effects.mjs`): talento "RT Smoke Talento XYZ" com um efeito `acao_trama` (tipo pós-MVP da Etapa 10) — "Salvar rascunho" sem erro de tipo inválido (v1→v2), reload confirmando persistência, "Revisar e publicar" abrindo sem erros bloqueantes. Ver detalhes no checkpoint da correção de efeitos pós-MVP.

## Fixtures

Removidas ao final, confirmado por contagem zero contra o Supabase real: item `rt_item_fix_xyz` (documento publicado, drafts, changelog, sessão de importação), rascunho de talento `rt_smoke_talento_xyz` (nunca publicado), usuário admin de fixture (`admin_users` + `auth.users`, id `92018e8d-5a15-4cd2-b64a-310682e50ac9`). Nenhum conteúdo oficial ou dado real tocado.

## Verificação técnica

`git status --short` limpo antes de iniciar; `next-env.d.ts` revertido após um toque automático do `next build` (não fazia parte da correção); `npx tsc --noEmit` sem erros; `npm run build` sucesso (servidor de preview parado antes). Harnesses reexecutados sem alteração de código e sem regressão: `validate-item-schema-roundtrip.mjs` (12/12, novo), `validate-post-mvp-effects.mjs` (17/17, novo), `validate-slug-collision.mjs` (46/46), `validate-import-export-book.mjs` (19/19). Nenhuma migration criada ou alterada; migrations 0020–0035 intactas.

## Commits

Fix (labels + checagem de schema na revisão) e os dois novos harnesses de regressão combinados num único commit — formam uma unidade inseparável (o fix sem o teste de regressão que prova o antes/depois não é verificável; o teste sem o fix falha). Um segundo commit registra esta documentação.

## Status por documento após esta correção

- **Etapa 5**: continua **"Implementada — aceite de browser parcial."** — não promovida a "concluída" (o checklist original de 20 itens não foi reexecutado item a item nesta rodada; o teste de conflito de versão otimista concorrente segue pendente). O achado de round-trip de item, antes registrado como "não corrigido", passa a **resolvido** — nota adicionada em `docs/CHECKPOINT_ETAPA5_PUBLICACAO_VERSIONAMENTO.md`.
- **Etapa 11**: permanece exatamente **"Etapa 11 concluída — integração editorial de drag aprovada."** — não reaberta, drag editorial não revalidado nesta rodada. Nota transversal adicionada em `docs/CHECKPOINT_ETAPA11_IMPORTACAO_EXPORTACAO_BIBLIOTECA_LIVRO.md` registrando que o defeito de round-trip de item — que afetava a importação usada por esta etapa — deixou de existir.
- **Etapas 4, 6–10**: não reabertas, não revalidadas nesta rodada; permanecem no estado "aceite de browser parcial" da rodada anterior.
- **Etapa 12**: permanece exatamente **"Etapa 12 concluída — validação integrada aprovada."** — inalterada, nenhum código compartilhado tocado.
- **Editor Universal (estado global)**: **"Editor Universal parcialmente concluído — validações de browser pendentes."** — não declarado concluído.
