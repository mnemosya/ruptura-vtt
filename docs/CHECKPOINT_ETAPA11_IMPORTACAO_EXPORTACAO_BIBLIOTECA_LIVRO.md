# Checkpoint — Etapa 11: Importação, exportação e Biblioteca do Livro

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

## 9. Drag-and-drop — bloqueado formalmente

Auditoria: zero código de drag-and-drop em qualquer parte do projeto (`draggable`, `dragstart`, `dataTransfer`, `onDrop`, `useDrag`, dnd — nenhuma ocorrência). O PRD (`docs/PRD Ruptura VTT.md` §2.1.9) já lista **"drag de todos os tipos de entidade"** explicitamente **fora da primeira entrega**, e a Biblioteca do Livro (destino do drag) é a própria feature adiada para depois da ficha estabilizar.

**Decisão**: implementado o contrato de vínculo (`content_book_links`) e a criação de vínculo via UI admin (formulário em `VinculosEditoriaisPanel.tsx`) — isso cobre o "round-trip entidade↔capítulo" na forma estrutural possível hoje. O drag-and-drop em si (arrastar um card da Biblioteca para dentro de um editor de capítulo) **não foi implementado** porque não existe destino editorial real para soltar a referência — implementá-lo exigiria construir um editor de capítulo do zero, fora do escopo desta etapa e do PRD para esta fase.

**Status desta etapa, por causa disso: "Implementação parcial — integração editorial de drag pendente."** Infraestrutura de vínculo pronta; drag em si bloqueado pela ausência formal de um editor/destino de capítulo real (não uma limitação de tempo, uma limitação estrutural já prevista pelo próprio PRD).

## 10. Segurança e limites

- Export/import: admin-only (`getContentAdminStatus`), reforçado por RLS em toda tabela nova.
- Import nunca confia em hash/classificação/diff vindo do client — tudo recalculado nas Server Actions a partir do banco.
- `officialSchemaValidator.ts` só roda em servidor (usa `node:fs`), nunca importado por Client Component (confirmado pelo build — ver §11).
- Limite de arquivo: 5 MB. Limite de documentos por pacote: 200. Limite de itens por exportação em lote: 200. Valores escolhidos para cobrir um catálogo real (spell+talent+item+rune reais somam poucas centenas) sem aceitar tamanho irrestrito.
- Import valida extensão (`.json`) e MIME como sinal (nunca única defesa) — o conteúdo real é sempre reparseado e validado estruturalmente, nunca executado (nenhum `eval`).
- Nenhuma policy nova de escrita direta — toda mutação nova passa por função SECURITY DEFINER (`import_content_drafts`) ou por Server Action que reverifica admin.

## 11. Verificações executadas vs. bloqueadas

**Executadas nesta sessão:**
- `npx tsc --noEmit` — sem erros.
- `npm run build` (Next.js/Turbopack) — sucesso, todas as rotas novas (`/admin/biblioteca/exportar`, `/admin/biblioteca/importar`, `/admin/biblioteca/importacoes`, `/admin/biblioteca/importacoes/[id]`) aparecem na árvore de rotas.
- Verificação focada em Node puro (mesmo padrão das etapas anteriores: compila os módulos reais com `tsc --module commonjs`, roda com `node`, nunca duplica lógica): `scripts/dev/validate-import-export-book.mjs` — **19/19 verificações passaram**, cobrindo hash determinístico (ordem de chave irrelevante, ordem de array significativa, detecção de alteração), validação de manifest (aceito, formato desconhecido rejeitado, versão futura rejeitada), `ehContentTypeEditavel`, coleta real de dependências (requisitos/condição/propriedades), resolução de dependência (nunca assume resolvida fora do pacote) e as 11 classificações de preview nos casos centrais.

**Bloqueadas nesta sessão (ambiente, não solicitado ao usuário):**
- `tsx`/esbuild continuam bloqueados neste ambiente (mesmo problema já registrado em checkpoints anteriores) — os scripts `check-admin-*.ts` (sessão de browser real) não puderam ser executados.
- Nenhuma verificação de round-trip completo via SQL real (INSERT/rollback do RPC `import_content_drafts` contra um Postgres de verdade) foi executada nesta sessão — não há acesso a um projeto Supabase provisionado e conectado a este repositório disponível para uso seguro nesta sessão. A migration 0024 segue exatamente o padrão transacional já testado das migrations 0021-0023 (mesmo estilo de SECURITY DEFINER + RLS + índice único), mas não foi exercitada em banco real aqui.
- Os 26 itens de checagem via browser (export/import reais na UI, drag, "Ver no livro") não foram executados — nenhum teste manual foi pedido ao usuário, conforme instrução.

**Status honesto**: "Implementação concluída — aceite de browser pendente" para import/export/vínculos; "Implementação parcial — integração editorial de drag pendente" para a peça de drag-and-drop especificamente (ver §9).

## 12. Limitações reais (resumo)

- Drag-and-drop não implementado — bloqueio estrutural documentado (§9), não fingido.
- "Ver no livro" mostra a citação estruturada, não um link navegável — não existe renderizador de Livro em runtime.
- Round-trip completo (export → import → publish → export → diff semântico) não foi exercitado contra um banco real nesta sessão — só a lógica pura (classificação/hash/dependências) foi verificada via Node.
- `origemLegado` (conversão de conteúdo legado, Etapa 6) não é recuperado no pacote de exportação — essa informação vive só no `content_drafts.payload.origemLegado` de quando o conteúdo foi convertido, e não é persistida em `content_documents` após a publicação; portanto o pacote nunca a fabrica (campo permanece ausente, nunca inventado).
- Tipos somente-leitura (condition, property, master_table etc.) podem ser incluídos num pacote para fins de dependência/preview, mas nunca geram rascunho — comportamento intencional, documentado como `tipo_nao_editavel`.

## Status final

**Implementação concluída — aceite de browser pendente** para o contrato de pacote, exportação unitária/em lote, importação draft-only, preview com as 11 classificações reais, detecção de conflito, idempotência por hash, preservação de metadata/campos desconhecidos/efeitos bespoke (reaproveitando os builders reais da Etapa 3/6, nunca duplicados), dependências estruturadas, vínculos editoriais (Biblioteca↔Livro) e histórico de importação.

**Implementação parcial — integração editorial de drag pendente**, formalmente aceita pelo próprio PRD (§2.1.9 já lista essa peça fora da primeira entrega) e pela ausência real de um editor de capítulo para servir de destino.

TypeScript e build passam; 19 verificações focadas em Node passam; nenhuma publicação automática existe em nenhum caminho de código novo; nenhuma escrita direta em `content_documents`; nenhuma tabela de homebrew/override/marketplace criada. **Não avancei para a Etapa 12.**
