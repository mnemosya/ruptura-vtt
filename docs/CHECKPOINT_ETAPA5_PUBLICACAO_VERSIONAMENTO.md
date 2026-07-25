# CHECKPOINT — ETAPA 5: PUBLICAÇÃO, VERSÕES E CHANGELOG

**Projeto:** Ruptura VTT
**Checkpoint anterior:** `14e5285` — docs: record Etapa 4 as partial operational acceptance
**Escopo desta etapa:** fechar o ciclo editorial administrativo — validar rascunho, comparar com o publicado, publicar transacionalmente, versionar, registrar histórico, arquivar, consultar/comparar versões e informar impacto em instâncias. **Sem** avançar para a Etapa 6, sem conversão em massa de legados, sem importação/exportação/homebrew.

**Status:** **Implementada — aceite de browser parcial.** (Atualizado — ver seção "Aceite de browser" abaixo para o ciclo completo de edição/publicação e a importação de atualização, confirmados via browser real nesta rodada.) O núcleo transacional foi verificado por SQL direto contra o banco; TypeScript e build passam.

> **Nota de correção posterior (mesma etapa, sem alterar o acima retroativamente):** a estratégia de serialização de efeitos descrita neste documento (§4) foi corrigida logo depois — o blob `_editor` embutido em cada efeito publicado se mostrou inválido contra `additionalProperties: false` dos schemas oficiais de magia e talento. A correção completa (auditoria, nova tabela `content_editor_metadata`, serialização reescrita, validação de schema) está documentada em `docs/CHECKPOINT_CORRECAO_METADATA_EDITOR_PUBLICACAO.md`. Nenhum conteúdo real foi contaminado. As seções abaixo (§4, exemplos de payload) refletem a implementação ORIGINAL desta etapa — a versão corrigida é a que está em produção.
>
> **Nota de referência (Etapa 6, sem alterar o status acima):** a Etapa 6 (`docs/CHECKPOINT_ETAPA6_ADAPTADORES_LEGADO.md`) estendeu o fluxo de "criar rascunho de edição" para conteúdo publicado SEM `content_editor_metadata` (conteúdo legado, anterior ao Editor Universal) — adiciona um diagnóstico de conversão e confirmação antes de criar o rascunho, e reusa `content_changelog.impact` (§ acima) para registrar a origem da conversão na publicação. O núcleo transacional/versionamento desta Etapa 5 não foi alterado.
>
> **Nota de correção crítica (auditoria formal do Editor Universal, rodada posterior):** `existeSlugColidindo` bloqueava "Salvar rascunho" em toda edição de conteúdo já publicado, para os 5 tipos editáveis — bug independente desta etapa original, corrigido em `docs/CHECKPOINT_CORRECAO_COLISAO_SLUG_PUBLICACAO.md`. Ver §"Aceite de browser" abaixo para a validação completa do ciclo editar/salvar/revisar/republicar após a correção.

## Aceite de browser — rodada de auditoria formal do Editor Universal

**Data**: 24-25/07/2026. **Ambiente**: `next dev` local + Supabase real, ferramenta de browser (Playwright/`tsx` seguem bloqueados pelo mesmo conflito de arquitetura esbuild já documentado nas etapas anteriores — confirmado ainda presente). **Fixtures**: usuário admin temporário via cadastro real + `admin_users` via SQL.

Executado ao vivo, com evidência individual, para o checklist completo pedido nesta rodada:

- **Rascunho novo → validação → revisão → publicação inicial**: item completo (`categoria`/`raridade`/`preço`/descrições/efeito `cura`) criado, salvo, revisado (sem erros bloqueantes, avisos esperados) e publicado (`1.0.0`).
- **Versionamento e changelog**: `content_changelog` confirmado com 1 entrada `created` (`—→1.0.0`) e, após a edição abaixo, 1 entrada `updated` (`1.0.0→1.0.1`) — consultado diretamente no Supabase real.
- **Edição de conteúdo publicado, salvar mantendo slug, revisão da edição, republicação, versão incremental**: rascunho de edição criado a partir do item publicado; campo alterado mantendo o slug (campo de slug já vem travado na UI); "Salvar rascunho" **sem falsa colisão** (a correção da §"Nota de correção crítica" acima confirmada no fluxo real); revisão mostrou `base: base atual (sem conflito)`; republicado com sucesso (`1.0.1`); reload confirmou persistência do campo alterado e da versão, tanto na UI quanto por consulta direta ao `content_documents`.
- **Arquivamento**: `Arquivar` → campo de motivo obrigatório preenchido → confirmação (achado: o `window.confirm()` nativo do navegador de "Arquivar ... ?" é suprimido pela ferramenta de browser, retornando `false` — não é um bug do app; contornado sobrescrevendo `window.confirm` antes do clique) → `status: archived` confirmado.
- **Importação classificada como `atualizacao` — end-to-end obrigatório**: executado via a UI real de exportar/importar (não apenas harness): (1) item de fixture publicado; (2) exportado via `/admin/biblioteca/exportar` (resposta de rede real interceptada, contendo o pacote `ruptura-content-package` completo); (3) campo `descricao_curta` alterado no pacote; (4) hash canônico recomputado com a função REAL (`canonicalHash.ts`, compilada via `tsc` e executada em Node — nunca reimplementada); (5) arquivo injetado no `<input type="file">` de `/admin/biblioteca/importar` via `DataTransfer` (a ferramenta de browser não tem upload de arquivo do disco nativo — técnica padrão de teste headless, nunca contornando a leitura real do arquivo pelo app); (6) preview classificou corretamente **"Atualização de conteúdo publicado"**; (7) confirmado — **1 rascunho criado**; (8) `base_document_id` confirmado correto (`item:<slug>`) por consulta direta ao banco; (9) rascunho aberto na UI real; (10) salvo **sem falsa colisão**; (11) revisão sem conflito; (12) republicado (`1.0.1`); (13-16) changelog e persistência confirmados por consulta direta ao Supabase.
  - **Achado real, não corrigido nesta rodada**: o primeiro pacote de teste (item criado só com nome/slug mínimos) falhou a classificação com **"Inválido contra o schema oficial"** — `serializarItem` (`publishSerialization.ts`) nunca emite `categoria_label`/`raridade_label`, exigidos pelo schema oficial de equipamentos (`schema_equipamentos_v1_2.json`), e o campo `categoria` do editor é texto livre (não restrito ao enum oficial de 10 valores). Isso significa que **qualquer item publicado via Editor Universal falha a revalidação de schema oficial usada na importação**, mesmo sendo publicável normalmente pelo fluxo de edição. Contornado para este teste construindo um pacote com `categoria`/`categoria_label`/`raridade_label` corretos manualmente. **Não corrigido** — fora do escopo desta correção pontual (exigiria decidir uma fonte de verdade para os rótulos e possivelmente restringir o campo `categoria` a um select, mudança maior que "minimamente"). Registrado aqui como achado real para uma correção futura dedicada; não bloqueia nenhum fluxo central hoje (a maior parte do conteúdo real já tem esses campos desde o seed original).
- **Pacote idêntico**: coberto pelo harness `validate-import-export-book.mjs` (verificação "identico" — hash bate, classificação correta, `podeConfirmar:false`), não repetido manualmente nesta rodada.
- **Conflito real / hash inválido / referência ausente / rascunho conflitante**: cobertos pelo harness puro (19/19, casos "conflito_com_publicado", "conflito_com_rascunho", "referencia_ausente", "schema_invalido"), não repetidos manualmente nesta rodada — o objetivo desta rodada era comprovar o caminho feliz de "atualização" via UI real, que nunca tinha sido exercitado.
- **`expectedVersion`/conflito de edição concorrente**: **não testado nesta rodada** (exigiria 2 sessões simultâneas editando o mesmo rascunho) — pendência remanescente, não um defeito conhecido.

Console e rede: nenhum erro em nenhum passo. Fixtures completamente removidas ao final (documentos, drafts, changelog, sessão de importação, usuário admin) — confirmado por contagem zero.

**Status: "Implementada — aceite de browser parcial."** Promovido de "aceite de browser pendente" — o ciclo completo de criação/publicação/edição/salvamento/revisão/republicação/changelog/arquivamento e a importação de atualização (item antes só citado como pendência) foram confirmados via browser real contra o Supabase real. Não promovido a "Etapa 5 concluída" porque o teste de conflito de versão otimista (`expectedVersion`) concorrente não foi executado nesta rodada, e o checklist original de 20 itens do script antigo não foi reexecutado item a item (script em si segue bloqueado pelo mesmo conflito de esbuild).

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
