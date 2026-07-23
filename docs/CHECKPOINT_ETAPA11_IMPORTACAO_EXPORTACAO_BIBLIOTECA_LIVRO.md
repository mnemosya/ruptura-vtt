# Checkpoint — Etapa 11: Importação, exportação e Biblioteca do Livro

## Status

**Status geral da Etapa 11: Implementação parcial — integração editorial de drag pendente.**

Este é o status ÚNICO e final da etapa como um todo — não "concluída com pendências menores". O motivo é estrutural, não uma questão de tempo: o drag-and-drop editorial exigido pelo aditivo não pôde ser implementado porque não existe (e não foi criado nesta etapa, por estar fora de escopo) nenhum renderizador do Livro nem editor estruturado de capítulos para servir de destino real de um drop. O aditivo da própria Etapa 11 previa exatamente este cenário e determinava que, nele, a etapa não poderia ser marcada como totalmente concluída.

Os blocos internos abaixo têm estados DIFERENTES entre si — o status geral acima nunca deve ser lido como se cada bloco individualmente estivesse "parcial": a maior parte do trabalho está de fato pronta, só falta aceite de browser; um bloco específico (drag) está bloqueado por infraestrutura ausente; e a verificação transacional contra um banco real não foi executada.

| Bloco | Estado |
|---|---|
| Pacote JSON (contrato, hash, manifest) | Implementação concluída — aceite de browser pendente |
| Exportação (unitária e em lote) | Implementação concluída — aceite de browser pendente |
| Importação (draft-only, preview, conflitos, idempotência) | Implementação concluída — aceite de browser pendente |
| Vínculos editoriais (Biblioteca↔Livro, sem navegação clicável) | Implementação concluída — aceite de browser pendente |
| Drag-and-drop editorial | Não implementado — bloqueado pela ausência de renderizador do Livro e de editor estruturado de capítulos |
| Round-trip e atomicidade em Supabase real | Não verificados — migration e RPC implementadas, nenhuma execução contra projeto Supabase conectado |
| Verificações puras (TypeScript, build, harness Node) | TypeScript aprovado; build aprovado; harness Node 19/19 aprovado |

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

## 11. Verificações não executadas

Nomeado deliberadamente "não executadas" em vez de "bloqueadas vs. executadas" — a seção a seguir é a lista do que NÃO foi verificado, para que a lacuna fique impossível de perder.

- **Browser check real** (os 26 itens do aditivo: export/import reais na UI, criação de vínculo, drag, "Ver no livro"): não executado. `tsx`/esbuild continuam bloqueados neste ambiente (mesmo problema já registrado em checkpoints anteriores) — os scripts `check-admin-*.ts` (sessão de browser real) não puderam rodar. Nenhum teste manual foi pedido ao usuário.
- **Round-trip e atomicidade transacional em Supabase real**: não executado. Não há projeto Supabase provisionado e conectado a este repositório disponível para uso nesta sessão. A migration 0024 e o RPC `import_content_drafts` seguem exatamente o padrão transacional já testado das migrations 0021-0023 (mesmo estilo de SECURITY DEFINER + RLS + índice único) — mas isso é similaridade de padrão, não verificação: nenhum INSERT, nenhum rollback, nenhum teste de concorrência ou de falha-no-meio foi exercitado contra um Postgres real.
- **Drag-and-drop editorial**: não implementado, portanto não há nada para verificar (ver §9 e a seção dedicada abaixo).

### O que FOI verificado nesta sessão

- `npx tsc --noEmit` — sem erros.
- `npm run build` (Next.js/Turbopack) — sucesso, todas as rotas novas (`/admin/biblioteca/exportar`, `/admin/biblioteca/importar`, `/admin/biblioteca/importacoes`, `/admin/biblioteca/importacoes/[id]`) aparecem na árvore de rotas.
- Verificação focada em Node puro (mesmo padrão das etapas anteriores: compila os módulos reais com `tsc --module commonjs`, roda com `node`, nunca duplica lógica): `scripts/dev/validate-import-export-book.mjs` — **19/19 verificações passaram**, cobrindo hash determinístico (ordem de chave irrelevante, ordem de array significativa, detecção de alteração), validação de manifest (aceito, formato desconhecido rejeitado, versão futura rejeitada), `ehContentTypeEditavel`, coleta real de dependências (requisitos/condição/propriedades), resolução de dependência (nunca assume resolvida fora do pacote) e as 11 classificações de preview nos casos centrais. Esta verificação cobre exclusivamente lógica pura (sem I/O) — não substitui nem o browser check nem a verificação transacional contra banco real.

## 12. Limitações reais (resumo)

- Drag-and-drop não implementado — bloqueio estrutural documentado (§9), não fingido.
- "Ver no livro" mostra a citação estruturada, não um link navegável — não existe renderizador de Livro em runtime.
- Round-trip completo (export → import → publish → export → diff semântico) não foi exercitado contra um banco real nesta sessão — só a lógica pura (classificação/hash/dependências) foi verificada via Node.
- `origemLegado` (conversão de conteúdo legado, Etapa 6) não é recuperado no pacote de exportação — essa informação vive só no `content_drafts.payload.origemLegado` de quando o conteúdo foi convertido, e não é persistida em `content_documents` após a publicação; portanto o pacote nunca a fabrica (campo permanece ausente, nunca inventado).
- Tipos somente-leitura (condition, property, master_table etc.) podem ser incluídos num pacote para fins de dependência/preview, mas nunca geram rascunho — comportamento intencional, documentado como `tipo_nao_editavel`.

## Entregas concluídas

Implementação concluída — aceite de browser pendente — para:

- contrato de pacote versionado `ruptura-content-package` v1, com manifest, versionamento e rejeição de versão futura desconhecida;
- hash canônico determinístico (`canonicalHash.ts`), verificado por Node puro;
- exportação administrativa unitária e em lote (`packageExport.ts`), sempre por seleção explícita, nunca "exportar tudo" implicitamente;
- importação **exclusivamente como rascunho** (`packageImport.ts` + RPC `import_content_drafts`) — nenhum caminho de código criado nesta etapa publica automaticamente, nenhum escreve direto em `content_documents`, nenhum sobrescreve um rascunho existente silenciosamente;
- preview com as 11 classificações reais, sempre recalculado no servidor (nunca confia em hash/classificação vindos do client);
- detecção de conflito (publicado mudou, rascunho já existe) e idempotência por hash (reimportar o mesmo pacote não duplica);
- preservação de metadata editorial, campos desconhecidos e efeitos bespoke, reaproveitando os builders reais da Etapa 3/6 (nunca duplicados);
- dependências estruturadas e vínculos editoriais Biblioteca↔Livro (`content_book_links`), com histórico de importação (`content_import_sessions`).

## Pendências de aceite

- **Browser check**: nenhum dos 26 itens do aditivo foi verificado na UI real (esbuild/`tsx` bloqueados neste ambiente).
- **Round-trip e atomicidade em Supabase real**: migration 0024 e RPC `import_content_drafts` foram implementadas seguindo o mesmo padrão transacional já testado nas migrations 0021-0023, mas **não foram executadas contra um projeto Supabase conectado** nesta sessão — nenhuma prova de rollback correto, nenhuma prova de que a transação é realmente atômica em produção.

## Bloqueio estrutural do drag-and-drop

O drag-and-drop editorial **não foi implementado**. Isto não é uma lacuna de tempo ou de esforço: não existe, em nenhuma parte do código deste projeto, um renderizador do Livro nem um editor estruturado de capítulos que possa servir de destino real para um drop. O PRD (`docs/PRD Ruptura VTT.md` §2.1.9) já classifica "drag de todos os tipos de entidade" como fora da primeira entrega, e a própria Biblioteca do Livro é adiada para depois da ficha de personagem estabilizar.

Construir esse destino (um editor/renderizador de capítulos) está fora do escopo desta etapa e não foi tentado nesta correção — fazê-lo exigiria uma etapa própria, com sua própria auditoria e decisão de produto. O que foi entregue (`content_book_links`, criação de vínculo via UI admin) cobre o registro estrutural do vínculo entidade↔capítulo, mas sem drag e sem navegação clicável real ("Ver no livro" mostra a citação, não abre nada).

**É este bloqueio, sozinho, que impede a Etapa 11 de ser marcada como concluída.**

## Verificações não executadas

Ver §11 para a lista completa e o detalhamento de cada item. Resumo:

- Browser check real (26 itens do aditivo) — não executado (ambiente).
- Round-trip/atomicidade transacional contra Supabase real — não executado (sem projeto conectado).
- Nada relacionado a drag foi verificado, por não ter sido implementado.

## Critérios para conclusão futura

A Etapa 11 só poderá ser marcada como concluída quando **todos** os itens abaixo forem satisfeitos — nenhum prazo ou próxima etapa é assumido aqui, esta lista não implica agenda:

- existir um renderizador ou editor estruturado de capítulos real, capaz de receber uma referência de conteúdo da Biblioteca;
- o drag-and-drop seguro (transportando só uma referência — tipo, slug estável, versão de protocolo — nunca o payload completo) puder ser integrado a esse destino editorial real;
- o drop for validado no servidor (admin, documento, tipo, destino, duplicidade) antes de persistir qualquer vínculo;
- o vínculo criado pelo drop puder abrir corretamente tanto a entidade quanto o trecho do livro correspondente (round-trip de navegação real, não citação textual);
- esse comportamento for verificado operacionalmente (browser check real, não simulado);
- a migration 0024 e a RPC `import_content_drafts` forem verificadas contra um projeto Supabase real (não apenas por semelhança de padrão com migrations anteriores);
- o round-trip transacional completo de importação (incluindo atomicidade e ausência de resíduo em caso de falha no meio) for comprovado contra esse banco real;
- o browser check aplicável a export/import/vínculos for executado, ou formalmente substituído por um aceite equivalente documentado.

## Encerramento

TypeScript e build passam; 19 verificações focadas em Node passam; nenhuma publicação automática existe em nenhum caminho de código novo; nenhuma escrita direta em `content_documents`; a importação continua exclusivamente criando rascunhos; nenhuma tabela de homebrew/override/marketplace foi criada. **Não avancei para a Etapa 12.**

**Status geral da Etapa 11: Implementação parcial — integração editorial de drag pendente.**

> **Nota de referência futura (adicionada durante a Etapa 12, sem
> alterar o status acima):** a Etapa 12 (conteúdo de mesa e homebrew)
> foi implementada depois desta e não depende de nenhuma mudança neste
> checkpoint. Ela criou tabelas e Server Actions próprias e isoladas
> (`campaign_content_documents`/`campaign_content_drafts`/etc., migration
> 0025) — nenhuma delas reaproveita `content_import_sessions`/
> `content_book_links` ou qualquer estrutura desta etapa. Ver
> `docs/CHECKPOINT_ETAPA12_CONTEUDO_MESA_HOMEBREW.md`.
