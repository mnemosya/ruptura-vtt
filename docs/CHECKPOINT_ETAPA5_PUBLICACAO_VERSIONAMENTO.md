# CHECKPOINT — ETAPA 5: PUBLICAÇÃO, VERSÕES E CHANGELOG

**Projeto:** Ruptura VTT
**Checkpoint anterior:** `14e5285` — docs: record Etapa 4 as partial operational acceptance
**Escopo desta etapa:** fechar o ciclo editorial administrativo — validar rascunho, comparar com o publicado, publicar transacionalmente, versionar, registrar histórico, arquivar, consultar/comparar versões e informar impacto em instâncias. **Sem** avançar para a Etapa 6, sem conversão em massa de legados, sem importação/exportação/homebrew.

**Status:** **Implementação concluída — aceite de browser pendente.** O núcleo transacional foi verificado por SQL direto contra o banco; TypeScript e build passam. O browser check está bloqueado pelo conflito de arquitetura do esbuild (mesmo das etapas anteriores) — script criado, não executado.

---

## 1. Auditoria inicial (antes de implementar)

- **`content_documents`**: `id` = `{content_type}:{slug}` (ex.: `spell:energetica_bola_de_fogo`); `version` é `text` semver; `status` `text` default `'published'` (só existia `published`); `payload` JSONB no formato legado, com `versao`/`status` também embutidos no payload; `payload_hash` `text`. `source_pack_id` NOT NULL (FK a `content_packs`).
- **`content_changelog`**: já tinha `document_id`, `content_type`, `change_type`(created/updated/deleted), `payload_before/after`, `created_at`. **Faltava**: versões, autor, resumo, caminhos alterados, impacto, rascunho de origem e hashes — a tabela **não** resolvia sozinha "listar/abrir/comparar versões". Foi **estendida** (não substituída).
- **`content_drafts`** (Etapa 3): envelope `DraftEnvelope` em `payload` (não o formato legado); `version` `int4` = controle otimista (trigger `content_drafts_bump_version` incrementa a cada UPDATE); `base_document_id`/`base_payload_hash` = vínculo/base para conflito; unique `(content_type, slug)` = um rascunho ativo por conteúdo.
- **Triggers**: `set_updated_at` em documents/drafts; `content_drafts_bump_version` em drafts. Nenhum trigger de auditoria automática em documents.
- **Versão real**: semver `a.b.c` em `version` (coluna) **e** `versao` (payload) — em sincronia nos dados atuais.
- **Concorrência**: `content_drafts.version` (otimista) + `base_payload_hash` (base vs publicado).
- **Consumo publicado**: **todas** as queries de `src/lib/content/queries.ts` filtram `status = 'published'` — logo **arquivar (`status='archived'`) some do jogo por construção**, sem tocar consumidor nenhum.
- **RLS de escrita**: `content_documents` tinha **só** `SELECT` público (`status='published'`) — **nenhuma** policy de INSERT/UPDATE/DELETE. `content_changelog` **sem policy** (RLS on) — só service role / SECURITY DEFINER. Confirma: publicar/arquivar **precisa** passar por função SECURITY DEFINER que checa `is_content_admin()`.
- **Serialização**: só existia o caminho DIRETO (legado/canônico → editável, `effectDraftMapping.ts`); o INVERSO (editável → legado) **não existia** e é o trabalho novo desta etapa (nota explícita em `draftTypes.ts`: o canônico nunca é reconstruído a partir dos campos editados).
- **Instâncias**: personagens/inventário guardam dados em `payload` JSONB próprio — estado mutável (munição, PV/PE, runas, apelidos, usos, condições) é cópia da instância; definições lidas por slug refletem a versão atual nas próximas leituras.

---

## 2. Arquitetura

### 2.1 Migration `0022_content_publishing.sql`

- `content_documents`: novas colunas `published_at`, `published_by`, `source_draft_id`, `archived_at`, `archived_by`, `archive_reason`. Índice por `status`.
- `content_changelog`: novas colunas `version_before/after`, `summary`, `author_user_id`, `author_email`, `changed_paths` (jsonb), `impact` (jsonb), `source_draft_id`, `payload_hash_before/after`. `change_type` passa a aceitar `'archived'`. Índice `(document_id, created_at desc)`.
- **Policies de leitura administrativa** (escrita segue sem policy — só via SECURITY DEFINER): `content_documents_admin_read` (admin lê qualquer status, inclusive `archived`; a pública `published` continua para anon) e `content_changelog_admin_read` (histórico só para admin, nunca público).
- Pacote de lineage `admin-editor` em `content_packs` para conteúdo autorado no editor.

### 2.2 Funções (SQL)

- `content_next_patch_version(text)`: `a.b.c → a.b.(c+1)`; versão ausente/inválida = **erro bloqueante** (nunca adivinha). Conteúdo novo começa em `1.0.0` (decidido por quem chama).
- `publish_content_draft(...)` **SECURITY DEFINER, transacional**: (1) valida admin; (2) trava o rascunho `FOR UPDATE` + versão otimista; (3) resolve novo/edição pela existência do documento; (4) edição: confere `base_payload_hash` contra o publicado atual — divergência **bloqueia** (base desatualizada, sem merge); (5) novo: garante que não há `(type,slug)` publicado; (6) **computa a versão no SQL** (única fonte de verdade) e injeta `id/slug/status/versao/created_at/updated_at` no payload; (7) `payload_hash` sha256 determinístico (`extensions.digest`); (8) upsert em `content_documents`; (9) grava `content_changelog`; (10) **consome o rascunho** (delete — só há um ativo por type/slug); (11) retorna metadados. Qualquer `raise` reverte tudo.
- `archive_content_document(...)` **SECURITY DEFINER, transacional**: valida admin + motivo obrigatório, muda `status='archived'` (some do jogo por construção), registra no changelog, preserva tudo (não apaga instâncias, rascunhos nem versões).

### 2.3 Camada TypeScript (`src/lib/contentSchema/`)

- `effectLegacySerialization.ts` — `EfeitoEditavel` → objeto de efeito legado (chaves que os consumidores leem) **+ blob `_editor`** (efeito editável completo, anti-perda; consumidores ignoram). `reconstruirEfeitosLegado`: preservados (não-MVP) na ordem original, depois editáveis na ordem do editor.
- `publishSerialization.ts` — `DraftEnvelope` → corpo legado por **overlay sobre clone do `rawOriginal`** (tudo que o editor não toca sobrevive por construção). Mapeia campos por tipo (magia/item/talento) para os caminhos legados; talento mantém os 3 níveis no mesmo documento. Não define versão/status/timestamps (autoridade do RPC).
- `publishDiff.ts` — comparação estruturada (campos adicionados/removidos/alterados + resumo de efeitos + mudança de ordem); ignora chaves gerenciadas e o blob `_editor`.
- `publishImpact.ts` — classifica impacto (`somente_texto` / `afeta_novas_aquisicoes` / `afeta_leitura_dinamica` / `pode_exigir_migracao` / `impacto_nao_determinado`), com os caminhos e a lista de estado mutável **nunca** sobrescrito.
- `publishReview.ts` — `montarRevisaoPublicacao(draft)`: valida (erros/avisos/infos), serializa, faz diff/impacto, calcula base/versões, resume efeitos+modos. **Versão aqui é só exibição** — o SQL recomputa.
- `publishServerActions.ts` (`"use server"`) — `publicarRascunho`/`arquivarConteudo`: reverificam admin, **re-serializam no servidor** (nunca confiam em corpo do client) e chamam os RPCs. **Não** re-exportado por barrel consumido por client.
- `changelogQueries.ts` — leitura do histórico (client scoped, policy admin).
- `adminQueries.ts` — `listContentDocumentsForAdmin` agora usa client scoped + filtro de status (vê `archived`); novo `getContentDocumentForAdmin` (qualquer status).

### 2.4 UI

- **Revisar e publicar** (`/admin/biblioteca/rascunhos/[id]/publicar`): nome/slug/tipo, versão atual→próxima, origem do rascunho, hash da base, comparação (`DiffView`), erros, avisos, efeitos+modos, impacto, **resumo obrigatório do changelog**, confirmação. Sem JSON bruto no fluxo principal.
- **Histórico** (`/admin/biblioteca/[contentType]/[slug]/historico`): lista versões (versão, data, autor, resumo, impacto), abre uma versão (diff antes→depois) e compara duas versões. Somente leitura.
- **Arquivar** (`ArchiveBar` no detalhe): motivo obrigatório + confirmação explícita; banner de "Arquivado" no admin.
- **Filtro Publicados/Arquivados** na lista; botão "Revisar e publicar" no editor de rascunho.

---

## 3. Decisões de produto atendidas

- Estados: rascunho / publicado / arquivado. Rascunho nunca aparece no jogo; salvar rascunho não altera publicado; publicar é ação explícita; arquivado some de novas aquisições mas não é apagado; instâncias existentes não são alteradas nem apagadas; publicação não sobrescreve versão mais recente (bloqueio por hash); nenhum campo preservado é perdido (overlay sobre clone); nenhum efeito declara automação acima do executor real (modo derivado, avisos na revisão).
- **Versionamento**: novo = `1.0.0`; nova publicação = **+patch** (`1.4.9→1.4.10`); sem major/minor manual; versão inválida/ausente = erro bloqueante; coluna `version`, `payload.versao` e o changelog ficam sincronizados pelo RPC (uma fonte de verdade: o SQL).
- **Duplicação** publica como conteúdo novo (novo id/slug, `1.0.0`, sem herdar identidade) — herdado da Etapa 3 (`duplicarConteudo`); a proveniência fica em `content_drafts.duplicated_from`.

---

## 4. Estratégia de serialização (decisão documentada)

**Overlay sobre clone do `rawOriginal` → formato legado atual.** Escolhida por ser a que melhor garante "nenhum campo descartado silenciosamente" e "consumidores continuam lendo o formato legado": partimos do payload legado original (ou esqueleto, em conteúdo novo) e sobrescrevemos só os caminhos do editor; efeitos preservados e campos bespoke/desconhecidos sobrevivem por construção. Efeitos editáveis são reserializados para o vocabulário legado + um blob `_editor` (anti-perda).

**Limitação assumida (round-trip de efeitos):** campos do editor sem equivalente no formato legado atual (ex.: `ignoraMit`, `danoPrincipalOuAdicional`, flags de acúmulo) são gravados no efeito publicado, incluindo o blob `_editor` completo — **não são descartados**. Porém o caminho de RE-edição (adapters da Etapa 1, que só leem chaves legadas conhecidas) ainda não relê `_editor`: um ciclo publicar→re-editar recupera fielmente os campos com equivalente legado; recuperar 100% dos campos exclusivos do editor exige estender os adapters (fora do escopo desta etapa). A ordem de efeitos preservados+editáveis segue a regra documentada (preservados primeiro, na ordem original; editáveis depois, em `ordem`) — reproduz exatamente a ordem original no caso comum (ex.: magia com `efeito_com_resistencia` seguido de dano/condição).

---

## 5. Persistência e transação

Atomicidade real dentro de **um** RPC (`publish_content_draft`) — a serialização/validação acontece no server action (TypeScript) e o RPC recebe o corpo já pronto, recomputando versão/status/hash e fazendo todas as mutações numa transação. Falha em qualquer passo reverte tudo (nada publicado pela metade, versão não incrementa parcialmente, changelog não fica órfão, rascunho não é consumido). **Não** é atomicidade simulada por várias chamadas de client.

---

## 6. Segurança

- Admin validado no servidor (server action) **e** dentro do RPC (`is_content_admin()`), reforçado pela RLS.
- Nenhuma policy de escrita genérica em `content_documents`; escrita só via SECURITY DEFINER.
- Client nunca decide versão/status/hash/autor — o SQL computa; server action re-serializa (não confia no corpo do client).
- Sem service role no runtime; sem escrita para `anon`; changelog não é público (policy admin).
- `content_changelog`/histórico só para admin. RLS de personagens/campanhas/mesa **não** alterada.

---

## 7. Verificações

### 7.1 Executadas (aprovadas)

- **`npx tsc --noEmit`** — sem erros.
- **`npm run build`** — sucesso; rotas novas presentes (`/admin/biblioteca/rascunhos/[id]/publicar`, `/admin/biblioteca/[contentType]/[slug]/historico`).
- **Núcleo transacional por SQL direto contra o banco** (bloco `DO` com rollback forçado, **zero resíduo** — confirmado por contagem depois):
  1. Publicar conteúdo novo → `1.0.0`, `status=published`, `published_by` setado, rascunho consumido, changelog `created`. **OK**
  2. Publicar edição (hash de base correto) → `1.0.1`, hash novo. **OK**
  3. Conflito de base (hash desatualizado) → **bloqueado**. **OK**
  4. Versão otimista errada → **bloqueado**. **OK**
  5. Arquivar → `status=archived` + changelog `archived`. **OK**
  6. Arquivar sem motivo → **bloqueado**. **OK**
  - `content_next_patch_version`: `1.4.9→1.4.10`, `1.0.0→1.0.1`. **OK**

### 7.2 Bloqueadas (não executadas — não alegadas como aprovadas)

- **Browser check** `scripts/dev/check-admin-publication.ts` (`npm run check:admin-publication`) — **bloqueado** pelo conflito de arquitetura do esbuild (mesmo das Etapas anteriores; `@esbuild/darwin-x64` vs `darwin-arm64`). Não foi executado; **não** se alega cobertura de browser. `next-env.d.ts` inalterado; nenhuma dependência reinstalada. O script cobre acesso bloqueado, publicação de novo (1.0.0), consumo do rascunho, edição (1.0.1), histórico, arquivamento e console limpo, com limpeza (exclui rascunhos; conteúdo publicado de teste é arquivado + snippet SQL para remoção definitiva).
- Serialização editável→legado ponta a ponta pela UI: verificada por `tsc` + build + revisão de código + a garantia estrutural (clone do `rawOriginal`); não exercida por browser nesta sessão.

---

## 8. Limitações reais

- Aceite de browser pendente (§7.2).
- Round-trip de campos de efeito exclusivos do editor não é 100% pelo caminho de re-edição (§4) — dados preservados no payload, mas não relidos pelos adapters ainda.
- Filtro de lista cobre `published`/`archived` (documentos); rascunhos seguem na sua própria tela (`/admin/biblioteca/rascunhos`).
- Restauração de arquivado não implementada (opcional nesta etapa).
- Impacto em instâncias é informativo/classificatório — não há migração automática (e a publicação nunca toca estado mutável).
- Conteúdo importado antes do editor não tem histórico retroativo (o changelog começa a partir da primeira publicação pelo editor).
- Sem rollback de versão (fora do escopo).
- A Etapa 4 permanece com **aceite operacional parcial** — não alterado retroativamente.

---

## 9. Próximos passos (não iniciados)

Etapa 6 conforme `docs/PLANO_IMPLEMENTACAO_EDITOR_UNIVERSAL.md`. **Não** iniciada. Sem conversão em massa de legados, importação/exportação ou homebrew.
