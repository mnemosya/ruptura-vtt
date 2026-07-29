# CHECKPOINT — ETAPA 6: ADAPTADORES E EDIÇÃO DE CONTEÚDO LEGADO

**Projeto:** Ruptura VTT
**Checkpoint anterior:** `911b9d8` — docs: document published payload compatibility fix (correção pós-Etapa 5)
**Escopo:** permitir que conteúdo publicado ANTES do Editor Universal (sem `content_editor_metadata`) seja convertido gradualmente para edição segura — magia, talento e item editáveis; condição/runa/escalpo/propriedade/ação de combate/regras de personagem/campo e fluxo de combate/tabelas mestras continuam **somente leitura e diagnóstico** (nenhum editor novo criado para eles).

**Status:** **Implementação concluída — aceite de browser parcial.** (Atualizado — ver seção "Aceite de browser" abaixo.) Núcleo de classificação/relatório e validação de perda verificados diretamente com `node` sobre código real compilado por `tsc`, usando cópias de registros reais. Núcleo transacional (rascunho de legado → publicação → metadata → changelog) verificado por SQL direto com rollback, zero resíduo.

> **Nota de referência (Etapa 7, sem alterar o status acima):** a Etapa 7 (`docs/CHECKPOINT_ETAPA7_EFEITOS_COMPOSTOS.md`) promoveu `teste_resistencia` (classificado aqui como somente leitura, §"Compatibilidade com legado") a um tipo EDITÁVEL do Construtor — mas só para árvores construídas do zero; `efeito_com_resistencia` legado continua sempre preservado e nunca é auto-convertido (a Etapa 7 confirmou pelo menos 3 estruturas reais incompatíveis entre spell/rune/property, reforçando a decisão desta etapa de nunca converter em massa). O restante da classificação por campo/efeito descrita aqui não foi alterado.

## Aceite de browser — rodada de auditoria formal do Editor Universal

**Data**: 24-25/07/2026. **Ambiente**: `next dev` local + Supabase real, ferramenta de browser. **Fixtures**: usuário admin temporário via cadastro real + `admin_users` via SQL.

Executado ao vivo contra `item:faca` (conteúdo oficial real, publicado antes do Editor Universal — nunca alterado, apenas lido e usado para criar um rascunho descartável):

- `/admin/biblioteca/rascunhos/legado/item/faca` (diagnóstico) → mostrou corretamente: `adapter: item.legacy.v1`, `classificação geral: Conversão com confirmação`, campos desconhecidos preservados (`estatisticas`, "Continuam associados ao caminho original — nunca descartados nem achatados").
- "Iniciar rascunho de edição" → rascunho de edição criado com o indicador "Conteúdo legado — convertido de conteúdo publicado antes do Editor Universal. Adapter: item.legacy.v1..." visível na UI; `nome`/`tags` (`arma`, ...) corretamente populados a partir do payload real; nota "Demais chaves de estatisticas (dano-base, perícia de ataque etc.) continuam somente leitura nesta etapa — ver diagnóstico técnico abaixo." confirmada.
- Rascunho **excluído sem salvar nem publicar** (para não tocar o conteúdo oficial real) — confirmado por consulta direta ao Supabase que `item:faca` manteve seu `payload_hash` original, intacto.

**Não executado nesta rodada** (por não haver como sem tocar conteúdo oficial real ou fabricar um cenário artificial): o ciclo completo salvar→revisar→publicar→republicar sobre um documento genuinamente legado. Criar um item de teste "fingindo" ser legado exigiria manipular `content_editor_metadata`/ausência dela de forma não realista — decidido não fazer. A classificação, o diagnóstico e a criação do rascunho de edição (com preservação confirmada) são o que foi exercitado ao vivo; o núcleo de salvar/publicar em si já foi confirmado em outras etapas (Etapa 5) para os mesmos content_types.

Console e rede: nenhum erro. Fixture (usuário admin) removida ao final.

**Status: "Implementação concluída — aceite de browser parcial."** Promovido de "pendente" — diagnóstico, classificação e criação de rascunho de edição com preservação de campos confirmados ao vivo contra conteúdo oficial real. Não promovido a "concluída — aceite de browser aprovado" porque o ciclo de salvar/publicar/republicar sobre um documento genuinamente legado não foi exercitado (por decisão deliberada de não tocar conteúdo oficial real).

## Rodada de conclusão do aceite (25/07/2026) — rodada acelerada, compartilhada com a Etapa 7

**Objetivo desta rodada**: fechar exatamente a lacuna registrada acima — o ciclo completo salvar→revisar→publicar→republicar sobre conteúdo genuinamente legado nunca havia sido exercitado, porque a rodada anterior decidiu não tocar `item:faca` (conteúdo oficial real) além do diagnóstico. Nesta rodada, o usuário autorizou explicitamente a técnica que resolve essa tensão: ler `item:faca` como referência (nunca alterado) e criar uma CÓPIA temporária com outro slug, inserida diretamente em `content_documents` via SQL (service role, sem passar pelo pipeline do Editor) — sem `content_editor_metadata`, portanto genuinamente legada do ponto de vista da classificação do app, mas isolada do conteúdo real.

### Matriz residual (Etapa 6)

| # | Cenário do checkpoint original | Evidência anterior | Motivo de estar pendente | Ação nesta rodada | Status |
|---|---|---|---|---|---|
| 1 | Diagnóstico de legado (adapter, classificação, campos desconhecidos) | §"Aceite de browser" (item:faca, só leitura) | — | Reconfirmado com a cópia `item:zz_e2e_editor_etapas6_7_item_legado`; `estatisticas` com 5 campos desconhecidos sintéticos (objeto aninhado, array, número, string, boolean) todos exibidos corretamente no diagnóstico | Aprovado anteriormente + reconfirmado nesta rodada |
| 2 | Criar rascunho de edição a partir de legado | §"Aceite de browser" (item:faca, descartado sem salvar) | — | Reconfirmado — indicador "Conteúdo legado — convertido..." visível, adapter `item.legacy.v1`, campos conhecidos (raridade, preço, tags) corretamente preenchidos | Aprovado anteriormente + reconfirmado |
| 3 | Alterar campo conhecido, salvar, recarregar, confirmar persistência | Nunca exercitado ao vivo | Decisão de não tocar conteúdo oficial real | `preco` 15→22 alterado, salvo (v2), recarregado, persistência confirmada via DOM | **Aprovado nesta rodada** |
| 4 | Revisar (diff), publicar, confirmar versão/changelog | Nunca exercitado ao vivo sobre legado genuíno | idem | Revisão mostrou diff correto (`~ preco 15→22`, sem falsa remoção de `estatisticas`); publicado 1.0.0→1.0.1; changelog `updated` confirmado via SQL | **Aprovado nesta rodada** |
| 5 | Consultar payload publicado — campo alterado mudou, desconhecidos idênticos | idem | idem | SQL: `preco=22`, `raridade_label` derivado corretamente, e os 5 campos desconhecidos sintéticos (incl. boolean `true`, array `["a","b","c"]`, objeto `{chave,numero}`) preservados **byte a byte** | **Aprovado nesta rodada** |
| 6 | Reedição do legado convertido — adapter ainda reconhece, campo diferente, republicar, sem acúmulo de metadata | Nunca exercitado | idem | Segunda edição (agora via fast-path, sem `origemLegado` — `content_editor_metadata` já existe) alterou `descricao_curta`, republicou (1.0.2); `content_editor_metadata` tem exatamente 2 linhas (uma por versão publicada, não acumulação indevida) | **Aprovado nesta rodada** |
| 7 | Conteúdo sem adapter semântico (fallback genérico) | Nunca verificado ao vivo | Não fazia parte do escopo anterior | `combat_action:deslocar` (real, publicado) — diagnóstico mostra payload inteiro sob `$` com motivo claro ("Adapter dedicado... ainda não implementado"), nenhum botão de criar rascunho, nenhum crash | **Aprovado nesta rodada** |
| 8 | Tipo somente leitura — UI e servidor coerentes | Nunca verificado ao vivo | idem | `condition:atordoado` (real) — só botão "Arquivar", sem "Criar rascunho de edição"; navegação direta a `/admin/biblioteca/rascunhos/legado/condition/atordoado` → **404 real** (gate server-side `isDraftContentType`, não só ocultação de botão) | **Aprovado nesta rodada** |
| 9 | Segundo/terceiro adapter (spell, talent) — não só item | Harness puro (`validate-legacy-conversion.mjs`) | Nunca visto ao vivo em browser | Diagnóstico ao vivo (somente leitura, sem tocar conteúdo real) de `spell:energetica_bola_de_fogo` (`spell.legacy.v1`, classificação mista: `dano`/`aplicar_condicao` editáveis + `efeito_com_resistencia` preservado) e `talent:pistoleiro` (`talent.legacy.v1`, 100% somente leitura — os 5 efeitos reais, nenhum MVP) | **Aprovado nesta rodada** (smoke — ciclo completo de escrita já provado para `item`, que compartilha exatamente `legacyConversion.ts`/`publishSerialization.ts`/`legacyLossValidation.ts` com spell/talent — ver equivalência abaixo) |

### Equivalência entre adapters (por que um ciclo completo + 2 smoke checks é suficiente)

`item`, `spell` e `talent` usam exatamente os mesmos arquivos de infraestrutura partilhada: `legacyConversion.ts` (classificação por campo/efeito), `criarRascunhoDeEdicaoLegado`/`legacyConversionServerActions.ts` (fluxo de criação de rascunho), `publishSerialization.ts` (serialização "overlay sobre clone"), `legacyLossValidation.ts` (bloqueio de perda). A única coisa que difere por tipo é o *adapter* de leitura (`adapters/item.ts` vs `spell.ts` vs `talent.ts`) — cada um só produz `CamposEditaveis`/`camposDesconhecidos`/`classificacaoLegado` a partir do payload real daquele tipo. O ciclo completo (criar→editar→salvar→revisar→publicar→reeditar→republicar) foi provado ponta a ponta para `item`; os smoke checks de `spell`/`talent` confirmam que os OUTROS dois adapters reconhecem corretamente conteúdo real e produzem a classificação esperada (inclusive a divergência real entre eles — `spell` tem efeitos mistos editáveis/preservados, `talent` é quase inteiramente bespoke, exatamente como a auditoria original documentou em §1.2) — o resto do pipeline (serialização/publicação/perda) é código 100% compartilhado, já provado pelo ciclo completo de `item`.

### Fixtures desta rodada (compartilhadas com a Etapa 7 — ver seção equivalente no checkpoint da Etapa 7)

Prefixo `zz_e2e_editor_etapas6_7_*`. Um narrador/admin único (`etapa67-aceite@ruptura-test.local`), um servidor único, uma cópia de item legado (`item:zz_e2e_editor_etapas6_7_item_legado`, clonada de `item:faca` só como referência de forma — nunca escreve em `item:faca`). Removidas ao final: documento, changelog, `content_editor_metadata`, usuário de fixture — confirmado por contagem zero. `item:faca`/`spell:energetica_bola_de_fogo`/`talent:pistoleiro`/`condition:atordoado`/`combat_action:deslocar` (conteúdo oficial real, usado só para leitura) confirmados com `payload_hash` inalterado.

### Console e rede

Sem erros em nenhum fluxo desta rodada (`read_console_messages`/`read_network_requests` verificados após cada ação de escrita).

**Status desta etapa, promovido**: **"Etapa 6 concluída — adaptadores e edição de legados aprovados."** Os 3 adapters editáveis (item/spell/talent) confirmados reconhecendo conteúdo real; fallback genérico confirmado sem crash e sem falsa promessa; tipo somente leitura confirmado coerente na UI e no servidor (404 real, não só botão oculto); campos desconhecidos preservados com igualdade profunda para objeto/array/número/string/boolean; publicação e reedição completas (incl. segunda reedição, sem acúmulo indevido de metadata); nenhuma perda de payload; fixtures removidas; console/rede limpos.

---

## 1. Auditoria inicial (dados reais)

### 1.1 O que já existia (Etapa 1) e foi reaproveitado, não recriado

- **`ClassificacaoLegado`** (`types.ts`) já tinha exatamente as 5 categorias pedidas (`conversao_direta`/`conversao_com_confirmacao`/`somente_leitura`/`incompativel`/`invalido`) — mas cada adapter (`spell.ts`/`item.ts`/`talent.ts`/`condition.ts`/`generic.ts`) retornava **UMA** classificação fixa para o documento inteiro (`ResultadoAdaptacao.classificacaoLegado`), nunca por campo/efeito. Essa granularidade documento-inteiro é exatamente o que o pedido desta etapa proíbe ("não classificar apenas o documento inteiro").
- **`coletarCamposDesconhecidos`/`marcarCampoSomenteLeitura`** (`unknownFields.ts`) já preservam campo por caminho original + motivo — reaproveitado sem alteração.
- **Normalizadores** (`fields/duracao.ts`, `fields/resistencia.ts`, `fields/referencia.ts`) já convergem os formatos legados reais para uma forma canônica — reaproveitados sem alteração; a Etapa 6 só ADICIONA um julgamento de ambiguidade em cima do que eles já normalizam.
- **`content_editor_metadata`** (migration 0023, Etapa 5-correção) já tem `efeitos jsonb` livre — comporta a metadata de conversão sem mudança de schema.
- **`content_drafts.payload`** é JSONB livre — comporta um novo campo opcional `origemLegado` sem migration.
- **`content_changelog.impact`** (jsonb, Etapa 5) já é o lugar onde informação administrativa extra de uma publicação vive — reaproveitado para registrar a origem da conversão, sem coluna nova.

**Nenhuma migration foi criada nesta etapa** — confirmado que a integridade/vínculo necessários já existem nas estruturas JSONB acima.

### 1.2 Efeitos legados reais encontrados (consulta direta ao catálogo publicado)

| Content type | Tipos legados reais (top) | Observação |
|---|---|---|
| spell | `efeito_com_resistencia` (60), `aplicar_condicao` (41), `dano` (36), `cura` (5), `teste_colateral` (4), `modificador` (3), `remover_condicao` (2), `recurso_temporario` (2) | Vocabulário fechado (9 tipos) — quase tudo cai nos 6 do MVP ou em `efeito_com_resistencia`/`teste_colateral` (preservados). |
| item | `penalidade_pericia` (12), `efeito_com_resistencia` (6), `buff_magia` (5), `dano_em_area` (5), `aplicar_condicao` (4), `cura` (4), `remover_condicao` (3), `modificador` (3), + 10 outros tipos únicos | Vocabulário aberto (~20 tipos no schema, mais na prática) — boa parte não-MVP. |
| talent | **~90 tipos únicos**, quase todos ocorrendo 1 vez (`promocao_margem` é o mais comum, 7×) | Vocabulário essencialmente bespoke por talento — confirma a decisão de manter praticamente tudo somente leitura, exceto quando reconhecidamente um dos 6 tipos do MVP (`modificador`, alguns `recurso`). |

Amostras reais usadas na auditoria e na verificação (§7): `spell:energetica_bola_de_fogo` (resistência + efeito preservado + 2 efeitos MVP), `talent:pistoleiro` (3 níveis, **todos** os 5 efeitos reais são bespoke — nenhum é um dos 6 tipos do MVP), `item:colete_reforcado` (`estatisticas` real + campo desconhecido real `ocultavel` + 2 efeitos `penalidade_pericia` não-MVP), `item:ansiolitico` (efeito MVP real: `cura 1d6 PE`).

### 1.3 Matriz de campos (resumo — ver código para o mapeamento completo)

| Caminho legado | Significado | Canônico | Editável | Serialização | Classificação típica | Risco de perda | Decisão |
|---|---|---|---|---|---|---|---|
| `estatisticas.duracao` (spell) | Duração da magia | `DuracaoCanonica` | Não (Etapa 6) | Overlay preservado | `conversao_direta` se padrão único bate; `conversao_com_confirmacao` se composta/desconhecida | Baixo | Preservado; confirmação quando ambíguo |
| `resistencia.{cd_formula,cd}` | CD de resistência | `ResistenciaCanonica` | Não | Overlay preservado | `conversao_direta`; `conversao_com_confirmacao` se fórmula E valor literal coexistem | Baixo | CD canônica = regra do motor, nunca sobrescrita por texto legado |
| `payload_automacao.efeitos[].tipo` ∈ 6 MVP | Efeito reconhecido | `EfeitoCanonico` | **Sim** | `effectLegacySerialization.ts` (Etapa 5) | `conversao_direta`; `conversao_com_confirmacao` se campo ambíguo (bonus/valor, múltiplos formatos de remover-condição, dano sem dado/valor) | Médio (campos sem lar legado vivem só em metadata — Etapa 5) | Editável; ambiguidade bloqueia até confirmar |
| `payload_automacao.efeitos[].tipo` ∉ MVP, família comum | Efeito bespoke reconhecido | `EfeitoCanonico` (tipo "outro") | Não | Nunca reescrito (clone) | `somente_leitura` | Nenhum (nunca tocado) | Preservado, resumo exibido |
| `payload_automacao.efeitos[].familia` ∈ {companheiro, trama, propagacao_efeito, meta_talento} | Sistema futuro (IA de companheiro, trama, propagação, meta-talento) | `EfeitoCanonico` (tipo "outro") | Não | Nunca reescrito | `incompativel` | Nenhum | Preservado; motivo explica que exige etapa futura |
| `estatisticas` (item, inteiro) | Ficha técnica variável por categoria | Campo desconhecido marcado | Não | Nunca reescrito | `somente_leitura` (decisão já registrada em `SCHEMA_CANONICO_CONTEUDO_V1.md` §7.3, mantida) | Nenhum | Sem promoção de sub-campos nesta etapa (ver §5) |
| Campo de topo não mapeado (ex.: `ocultavel` em item) | Metadado bespoke do conteúdo | Campo desconhecido | Não | Overlay preservado (clone) | `somente_leitura` | Nenhum | Preservado com caminho original |
| Efeito sem `tipo` | Payload corrompido | — | Não | Bloqueia | `invalido` | Bloqueia publicação | Nunca corrigido silenciosamente |

---

## 2. Classificação por campo/efeito (não por documento)

`src/lib/contentSchema/legacyConversion.ts` — **não** reimplementa parsing (chama os adapters da Etapa 1 e classifica em cima do resultado já adaptado). Funções puras, determinísticas (sem I/O, sem relógio):

- `classificarDuracao`: `conversao_direta` quando exatamente um padrão (rodada/turno/cena/combate/manual/instantâneo) bate; `conversao_com_confirmacao` quando composta ("_ou_"/"_e_") ou nenhum padrão bate.
- `classificarResistencia`: `conversao_com_confirmacao` só quando `cd_formula` E `cd` literal coexistem (ambiguidade real sobre qual é a fonte de verdade).
- `classificarEfeito`: usa o `tipo` canônico já resolvido pelo catálogo (Etapa 1); dentro dos 6 do MVP, `classificarAmbiguidadeEfeitoMvp` cobre os exemplos do pedido (`bonus` vs `valor`, múltiplos formatos de remover-condição, dano sem `dado`/`valor`); fora do MVP, `incompativel` quando a `familia` sinaliza um sistema futuro (enum real do schema de talento: `companheiro`/`trama`/`propagacao_efeito`/`meta_talento`), senão `somente_leitura`.

`RelatorioConversaoLegado` reúne: `campos[]`, `efeitos[]`, `referencias[]`, `camposDesconhecidos[]`, `classificacaoGeral` (pior caso, só informativo), `bloqueado`/`motivosBloqueio`.

---

## 3. Versão dos adapters

`ADAPTER_VERSIONS = { spell: "spell.legacy.v1", item: "item.legacy.v1", talent: "talent.legacy.v1" }`. Gravada em `DraftOrigemLegado.adapterVersion` no momento da conversão — uma mudança futura na lógica de classificação não altera silenciosamente um rascunho já iniciado (o rascunho continua com as decisões que valiam quando foi criado). Sem sistema de plugins — é uma constante versionada, nada mais.

---

## 4. Fluxo de criação de rascunho a partir de legado

1. `DraftActionsBar` chama `diagnosticarConversaoLegado(contentType, slug)` ao clicar "Criar rascunho de edição".
2. Se `content_editor_metadata` existe para a versão publicada atual → caminho rápido de sempre (Etapa 5, inalterado).
3. Se não existe → navega para `/admin/biblioteca/rascunhos/legado/[contentType]/[slug]`, que roda `montarRelatorioConversao` (via `gerarRelatorioSpell/Item/Talento`) + verifica referências contra o banco (`getContentDocument`, único ponto de I/O — os geradores de relatório continuam puros).
4. Tela de diagnóstico mostra: tipo/slug/versão/adapter/classificação geral, campos e efeitos que exigem confirmação (checkbox individual, nunca "aceito converter tudo"), efeitos editáveis/preservados/incompatíveis/inválidos, campos desconhecidos (só caminhos, sem JSON bruto), referências.
5. `criarRascunhoDeEdicaoLegado(contentType, slug, decisoes)` **RECALCULA** o relatório no servidor (nunca confia no que o client mandou), confere que toda pendência (`caminhosPendentesDeConfirmacao`) tem uma decisão, bloqueia se `relatorio.bloqueado` (perda inevitável/referência obrigatória quebrada), monta `camposEditaveis` reusando os extratores existentes (`extrairCamposMagia/Item/Talento`), e grava `origemLegado` no envelope do rascunho: adapter+versão, classificação, decisões confirmadas, campos somente leitura, campos desconhecidos, efeitos preservados, avisos, data, admin responsável.
6. Conteúdo publicado **nunca** é alterado neste fluxo.

---

## 5. Regras por tipo

- **Magia**: efeitos MVP editáveis com confirmação quando ambíguos; `teste_resistencia`/`efeito_com_resistencia` continuam somente leitura até a Etapa 7; CD canônica é sempre a regra do motor (nunca sobrescrita por texto legado desatualizado — decisão já registrada em `fields/resistencia.ts`, mantida).
- **Talento**: árvore nunca vira 3 documentos; efeitos bespoke somente leitura (a auditoria real confirma que **a esmagadora maioria** dos efeitos de talento é bespoke — `pistoleiro` não tem um único efeito MVP); `familia` obrigatória sempre preservada; requisitos (`talento_nivel_adquirido`) tratados como referência estruturada.
- **Item**: `estatisticas` continua somente leitura por inteiro nesta etapa — nenhum sub-campo foi promovido a editável. Motivo documentado (repetindo a decisão da Etapa 1, `SCHEMA_CANONICO_CONTEUDO_V1.md` §7.3): `estatisticas` varia por categoria sem um schema fixo comum, e criar um sub-schema completo por categoria (arma/armadura/escudo/munição/consumível) está fora do escopo desta etapa.

---

## 6. Preservação e round-trip

Publicação continua usando exatamente a estratégia da Etapa 5 (clone do `rawOriginal` + overlay só nos caminhos do editor) — a Etapa 6 não muda `publishSerialization.ts`. O que muda é **quem entra no rascunho**: quando a origem é legado, o rascunho carrega `origemLegado` e, antes de publicar, `validarPerdaConversaoLegado` (`legacyLossValidation.ts`) compara o `rawOriginal` preservado contra o corpo que seria republicado e **bloqueia** (erro, não aviso) quando:

- um campo registrado como `camposSomenteLeitura` mudou de conteúdo;
- `estatisticas` de item foi reescrito;
- a árvore de talento perdeu um nível;
- um efeito registrado como preservado desapareceu;
- um campo desconhecido registrado não foi reinserido.

Não exige igualdade byte a byte (versão/status/timestamps mudam legitimamente via RPC da Etapa 5).

---

## 7. Verificações

### 7.1 Executadas e aprovadas

- **`npx tsc --noEmit`** — sem erros. **`npm run build`** — sucesso, com a rota nova `/admin/biblioteca/rascunhos/legado/[contentType]/[slug]`.
- **Classificação + relatório com registros reais** (`scripts/dev/validate-legacy-conversion.mjs`, código real compilado por `tsc`, executado com `node` puro — sem `tsx`/esbuild), usando cópias estáticas de `spell:energetica_bola_de_fogo`, `talent:pistoleiro`, `item:colete_reforcado`, `item:ansiolitico`:

```
1-5.   Magia real: dano/aplicar_condicao diretos; efeito_com_resistencia somente leitura;
       referência "queimando" (string solta) normalizada; sem bloqueio — OK
6-9.   Talento real (pistoleiro): 3 níveis preservados; TODOS os efeitos reais são
       somente leitura (nenhum é MVP); família real citada; referência de requisito — OK
10-12. Item real (colete reforçado): estatisticas preservado; campo desconhecido real
       "ocultavel" com caminho original; penalidade_pericia (não-MVP) somente leitura — OK
13-14. Item real (ansiolítico): cura 1d6 PE é conversão direta e editável;
       sem pendência de confirmação — OK
15-17. Perda: republicação segura passa; reescrita de estatisticas E remoção de campo
       desconhecido são DETECTADAS — OK

=== TODOS OS CASOS PASSARAM ===
```

- **Núcleo transacional por SQL direto** (rollback forçado, zero resíduo confirmado por contagem depois): rascunho com `origemLegado` persistido → publicação grava payload sem `_editor`, `estatisticas` preservado → changelog registra a origem da conversão (`impact.origemLegado.adapterVersion`) → `content_editor_metadata` grava o `EfeitoEditavel[]` recuperável → rascunho consumido. **Nenhum registro real foi alterado** (as amostras usadas na verificação SQL usam o prefixo `zz_e2e_legado_*`, nunca os slugs reais).

### 7.2 Não executadas

- **Browser check** (`scripts/dev/check-admin-legacy-conversion.ts`, `npm run check:admin-legacy-conversion`) — bloqueado pelo conflito de arquitetura do esbuild (mesmo das etapas anteriores). Script criado, cobre acesso bloqueado, diagnóstico aparecendo, indicador "Conteúdo legado" no rascunho, console limpo e limpeza — **não executado, não alegado como aprovado**.
- O fluxo completo botão→diagnóstico→confirmação→rascunho→edição→publicação→nova edição recuperando metadata **não foi exercido via navegador real** nesta sessão — só via SQL direto (núcleo transacional) e via `node` (núcleo de classificação). `next-env.d.ts` inalterado; nenhuma dependência reinstalada.

---

## 8. Interface

- Diagnóstico de conversão (`LegadoConversaoClient.tsx`): sem JSON bruto no fluxo principal — só caminhos, valores curtos truncados e motivos em texto.
- Indicador "Conteúdo legado" no editor de rascunho quando `origemLegado` presente (adapter, data, quantidade de campos/efeitos preservados).
- Filtro "Metadata editorial" (com/sem) na lista administrativa — implementado sem migration (subconsulta simples contra `content_editor_metadata`, tabela pequena). Paginação e busca existentes preservadas (status/metadata agora também são levados adiante pelos links de paginação e pelo campo oculto do formulário de filtro, que antes se perdiam ao trocar de página — correção incidental, mesma superfície que já existia).

---

## 9. Segurança

- `diagnosticarConversaoLegado`/`criarRascunhoDeEdicaoLegado` reverificam admin no servidor; decisões de confirmação e classificação são **sempre recalculadas no servidor**, nunca aceitas do client.
- Nenhuma policy nova; nenhuma escrita pública; metadata/decisões continuam só-admin (RLS já existente da Etapa 5).
- RLS de personagens/campanhas/mesa não tocada. Nenhum código executável em campo de conteúdo (tudo é dado JSON tipado).

---

## 10. Limitações reais

- Nem todo conteúdo legado é editável — a maioria dos efeitos de talento reais é bespoke e permanece **"Inspeção disponível — edição ainda não suportada"**.
- `estatisticas` de item continua inteiramente somente leitura (nenhum sub-campo promovido).
- Classificação `incompativel` para talento usa a `familia` real do schema (`companheiro`/`trama`/`propagacao_efeito`/`meta_talento`) como sinal — é uma heurística honesta baseada em vocabulário real, não uma extração perfeita de "precisa de novo motor".
- Filtro de classificação por documento na lista administrativa não foi implementado (só "com/sem metadata editorial") — calcular a classificação completa para o catálogo inteiro a cada listagem exigiria computar o relatório para todas as linhas a cada página, o que degradaria a busca/paginação existente; a classificação detalhada fica no diagnóstico por documento (Etapa 6), não na lista.
- **Histórico (superado pela rodada de conclusão acima)**: até 25/07/2026, o ciclo salvar→publicar→republicar sobre conteúdo genuinamente legado nunca tinha sido exercitado ao vivo (decisão anterior de não tocar conteúdo oficial real). Fechado usando uma cópia temporária isolada, nunca conteúdo oficial real.
- Etapa 4 e Etapa 5 permanecem com seus status próprios (ver `docs/PLANO_IMPLEMENTACAO_EDITOR_UNIVERSAL.md`) — não alterados retroativamente por esta etapa.

---

## 11. Não incluído nesta etapa

Nenhuma migração em massa de conteúdo legado (cada conversão continua sendo uma ação explícita, um documento por vez). Nenhuma funcionalidade de importação/exportação/homebrew. Nenhum novo `content_type`. Nenhum editor novo para condição/runa/escalpo/propriedade/ação de combate/regras de personagem/campo e fluxo de combate/tabelas mestras.
