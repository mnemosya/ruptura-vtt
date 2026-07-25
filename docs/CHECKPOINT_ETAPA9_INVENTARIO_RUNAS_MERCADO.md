# Checkpoint — Etapa 9: inventário, equipamentos, runas e mercado

**Status: Implementação concluída — aceite de browser parcial.** (Atualizado — ver "Aceite de browser" ao final do documento.)

Não afirmo automação operacional além do que o motor real executa hoje.
Conceder/consumir item, alterar disponibilidade/estoque e a maioria das
operações de preço continuam sem executor real conectado — representáveis,
nunca fingidos como automatizados.

## 1. Auditoria inicial

Confirmado por leitura direta do código e do conteúdo real:

- **`rune` já era um `content_type` real desde a migration 0001**
  (`content_type` enum em `supabase/migrations/0001_content_library.sql`)
  e já tinha 40 documentos publicados (`content/db_runas_normalizado_v1_2.json`,
  schema `content/schema_runas_v1_2.json`). `contentTypeRegistry.ts` já
  sinalizava `statusAdapter: "planejado"` com a observação literal *"até
  Etapa 9"* — o próprio código já previa esta etapa.
- **`DraftContentType` era `"spell"|"talent"|"item"`** (3 valores) —
  tocado em 15 arquivos (`draftTypes.ts`, `publishSerialization.ts`,
  `legacyConversion.ts`, `effectLegacySerialization.ts`,
  `draftValidation.ts`, `draftServerActions.ts`, `draftMapping.ts`,
  `publishReview.ts`, `legacyLossValidation.ts`, UI de rascunhos) — todos
  atualizados para incluir `"rune"`.
- **`ItemContent`/`InventoryItemInstance`** (`character/inventory.ts`) já
  tinham os campos reais de MIT/PD/carga/munição/slots de runa
  (`mitMax`, `pdMax`, `slotsRunaMax`, `cargasMax`, `municaoMax`,
  `municaoCompativelSlug`), lidos de `estatisticas.*` — mas **`CamposItem`
  (Etapa 3) nunca expunha esses campos como editáveis**; `estatisticas`
  era 100% somente leitura (`adapters/item.ts`). Achado adicional: os
  campos `moeda`/`quantidadePadrao`/`cargasPadrao`/`custoPa`/
  `disponibilidade`/`aquisicao` de `CamposItem` já existiam desde a
  Etapa 3 mas **nunca tiveram leitor nem escritor real** (nem
  `normalizeItemContent`, nem `serializarItem`, nem qualquer conteúdo
  real usa esses nomes) — deixados como estavam, documentados como
  campos mortos (ver §14), nunca "consertados" silenciosamente (não é
  escopo desta etapa inventar uma semântica para eles).
- **MIT/PD já tinham executores reais e genéricos**: `setItemMitAtual`/
  `setItemPdAtual` (absolute-set com clamp `[0, max]`) — só faltava um
  ponto de integração no catálogo de efeitos. `equipDefensiveItem`/
  `getEquippedDefenseProfile` já resolvem MIT (armadura) vs. PD (escudo)
  sem somar os dois.
- **Runas: instalação/remoção/ativação/desativação já são reais e
  genéricas** — `installRuneOnItem`, `removeRuneFromItem`,
  `toggleInstalledRune`, `getRuneCompatibility`, `getSlotsRunaMaxEfetivo`
  (todas em `inventory.ts`) já implementam o fluxo completo (validar
  runa/item/compatibilidade/slots, persistir, nunca instalação parcial).
  **Nenhum código novo foi necessário para este fluxo** — é usado como
  está.
- **Aljava**: `createAljavaInstance`/`hasExistingAljava` já garantem que
  comprar um segundo arco NUNCA cria uma segunda Aljava (`purchaseItem`,
  `inventory.ts`) — o kit inicial de flechas vai para a Aljava já
  existente. Capacidade real: 15 (`ALJAVA_CAPACIDADE_PADRAO`).
- **Mercado/loja: não existe tabela de estoque nem "loja" no banco.**
  O catálogo (`content_documents`) é tratado como infinitamente
  disponível. **Dívida é real**: `Character.dividas_mercador` (campo
  real em `types.ts`), alimentado por `getCadernetaDeDividaAvailability`/
  `purchaseItem({ permitirSaldoInsuficiente })`. **Desconto é real**:
  `getGarimpoDeRuaAvailability` lê genericamente QUALQUER efeito
  `{ tipo: "desconto_loja", percentual }` de qualquer talento aprendido
  (não hardcoded ao talento "Garimpo de Rua" apesar do nome da função) —
  mesmo padrão para `compra_fiada`/`getCadernetaDeDividaAvailability`.
  `campaign_inventory_items` (migration 0019) é o inventário do **bando**
  (transferência personagem↔bando), não um estoque de loja.
- **`docs/RELATORIO_AUTOMACAO_RUNAS.md`** confirma: das 40 runas reais,
  1 já é automática (grupo A), ~35 precisam de sistemas ainda inexistentes
  (grupo C — inclui as 2 runas de autorreparo, citadas explicitamente
  como bloqueadas por "nenhum modelo de recurso MIT/PD existe"), ~4 são
  puramente narrativas (grupo D). Esta etapa não muda nenhuma
  classificação de runa individual (nenhuma automação nova foi conectada
  ao ponto de decidir "esta runa específica está automatizada" — o que
  mudou foi a REPRESENTABILIDADE editorial e o preenchimento do modelo
  de recurso MIT/PD que o relatório apontava como faltante).

## 2. Matriz real (resumo)

| Tipo legado | Content types | Executor atual | Automação real | Representação (Etapa 9) | Serializável | Escopo |
|---|---|---|---|---|---|---|
| `estatisticas.mit_base`/`pd_max`/`slots_runa_max`/`cargas_max`/`municao_max` | item | `normalizeItemContent`, `equipDefensiveItem`, `getEquippedDefenseProfile` (reais) | assistido (equipar/desequipar já real) | Campos novos em `CamposItem` | Sim (item) | Nesta etapa |
| `autorreparo` (runa) | rune | Nenhum (RELATORIO_AUTOMACAO_RUNAS: bloqueado por falta de modelo MIT/PD) | agora **assistido** (via `modificar_instancia`→`setItemMitAtual`/`setItemPdAtual`) | `modificar_instancia` | Sim (rune) | Nesta etapa |
| instalação/remoção/ativação de runa | item (instância) | `installRuneOnItem`/`removeRuneFromItem`/`toggleInstalledRune` (reais, genéricos) | assistido (já existia) | **Nenhuma mudança de código** — só documentado | — | Já existia |
| Aljava/munição/flecha | item | `consumeAttackAmmo`/`consumeFletchaFromAljava`/`createAljavaInstance` (reais) | assistido (já existia) | Campos de modelo expostos (`municaoMax`, `municaoCompativelSlug`) | Sim (item) | Nesta etapa |
| `desconto_loja`/`compra_fiada` | talent | `getGarimpoDeRuaAvailability`/`getCadernetaDeDividaAvailability` (reais, genéricos) | assistido | `alterar_preco` | Sim (talent, só essas 2 operações) | Nesta etapa |
| Conceder/consumir item | (nenhum) | Nenhum | — | `conceder_item`/`consumir_item` | Só talent (tipo livre) | Nesta etapa (sempre lembrete) |
| Disponibilidade/estoque | (nenhum) | Nenhum estado real de campanha | — | `alterar_disponibilidade` | Só talent (tipo livre) | Nesta etapa (sempre lembrete) |

## 3. Arquitetura

`rune` passou a ser o 4º `DraftContentType`. Reaproveita integralmente o
pipeline existente: mesmo `EfeitoEditavel`/catálogo universal, mesmo
`content_editor_metadata`, mesmo RPC de publicação, mesmo diff/histórico,
mesmo diagnóstico de automação. Nenhum content_type novo foi criado no
banco (já existia), nenhuma migration nova.

## 4. Novos tipos/campos

- **`CamposItem`**: `mitBase`, `pdBase`, `tipoProtecao`, `regioes`,
  `slotsRunaMax`, `cargasMax`, `municaoMax`, `municaoCompativelSlug` —
  todos escrevem/leem as chaves REAIS de `estatisticas.*` já usadas pelo
  motor (`mit_base`, `pd_max`, `tipo_protecao`, `regioes`,
  `slots_runa_max`, `cargas_max`, `municao_max`, `municao_compativel`).
  `regioes` é preservado/editável mas sem leitor real (documentado).
- **`CamposRuna`**: `raridade`, `preco`, `slotsPossiveis`,
  `restricaoSubtipo`, `requisitoPericia`, `efeitos`. `categoria`/
  `categoria_label`/`custo_integridade` são fixados na serialização
  (sempre "runa"/"Runa"/0 — nunca editáveis, coerente com o próprio
  conteúdo real, que nunca usa runa para custar Integridade).
- **`modificar_instancia`**: operação enumerada (nunca caminho JSON
  arbitrário) — `alterar_carga_atual`, `alterar_municao_carregada`,
  `recarregar`, `alterar_mit_atual`, `alterar_pd_atual`, `reparar_mit`,
  `reparar_pd`. Cada uma mapeia 1:1 a um executor real: `setItemMitAtual`/
  `setItemPdAtual` (já existiam) e `setItemCargaAtual`/
  `setItemMunicaoAtual` (2 funções novas, ~8 linhas cada, mirror exato do
  padrão de clamp já usado pelas duas primeiras — `inventory.ts`).
  Instalar/remover/ativar/desativar runa **não** entram neste tipo —
  já são um fluxo real e próprio (§1).
- **`conceder_item`**/**`consumir_item`**: campos mínimos do briefing
  (item/quantidade/destino/estado inicial/etc.). Sem executor conectado
  nesta etapa (deliberado — "não transformar esta etapa em um editor
  geral de inventário"). Sempre `lembrete`.
- **`alterar_preco`**: `desconto_percentual`→serializa exatamente no
  formato REAL já lido por `getGarimpoDeRuaAvailability`
  (`tipo:"desconto_loja"`, `familia:"economia_loja"`, `percentual`,
  reaproveita `usoLimitado` para `usos`/`cadencia`);
  `permitir_compra_fiada`→formato REAL de `getCadernetaDeDividaAvailability`
  (`tipo:"compra_fiada"`, `gera_divida:true`, `raridade_maxima`). As
  demais operações (`desconto_fixo`/`multiplicador`/`sobretaxa`/
  `preco_minimo`) não têm leitor real — bloqueadas na publicação.
- **`alterar_disponibilidade`**: sempre `lembrete` — auditoria confirmou
  que não existe nenhum estado real de estoque/disponibilidade de
  campanha hoje.

## 5. Modelo × instância

Confirmado e testado (harness caso 22): publicar um item nunca inclui
`mitAtual`/`pdAtual`/`cargasAtual`/`municaoAtual` — essas chaves só
existem em `InventoryItemInstance` (personagem), nunca no payload de
conteúdo. `installRuneOnItem`/`toggleInstalledRune` (reais) sempre atuam
sobre a instância, nunca sobre o modelo publicado — publicar um novo
modelo nunca desinstala runas de instâncias existentes (nenhuma mudança
de código toca `runasInstaladas` a partir da publicação).

## 6. MIT, PD, munição, Aljava

Regras canônicas respeitadas sem alteração: MIT (armadura) e PD (escudo)
nunca somados na mesma resolução (`equipDefensiveItem` já impõe isso);
MIT/PD atuais nunca ultrapassam o máximo do modelo, mesmo com valores
exagerados (harness casos 4-5); publicar um novo MIT-base nunca repara
instâncias existentes automaticamente (não há gancho de publicação →
instância, verificado por ausência de qualquer chamada). Aljava
permanece item independente, capacidade 15, nunca duplicada por arco
(harness caso 20, reaproveitando `hasExistingAljava` real).

## 7. Runas — instalação, ativação, compatibilidade

`getRuneCompatibility` (real) testado diretamente: runa restrita a
`armadura` é rejeitada em item `categoria:"arma"` e aceita em
`categoria:"armadura"` (harness casos 18-19). Slots (`slotsRunaMax`)
agora configuráveis no modelo do item. Nenhuma runa é auto-convertida em
massa — cada rascunho de runa nasce vazio ou de "criar rascunho de
edição" sobre uma runa publicada específica, mesmo padrão de
spell/item/talent.

## 8. Mercado — preço, desconto, disponibilidade, compra, dívida

Preço/raridade já eram reais e representáveis desde a Etapa 3 (sem
mudança). Desconto (`alterar_preco`) e dívida/compra-fiada reaproveitam
os 2 leitores reais e genéricos já existentes em `talentEngine.ts` —
nenhum executor novo, nenhuma regra econômica inventada. Disponibilidade/
estoque: sem estado real de campanha, então **nenhuma automação** —
representável só para documentação/preview. Não foi criada nenhuma
tabela de estoque (confirma a instrução "não criar tabela de estoque sem
confirmar que existe estado de campanha para isso" — não existe).

## 9. Serialização e schemas

- **Item**: novos campos escrevem em `estatisticas.*` (schema livre,
  `type:"object"`) usando as MESMAS chaves já lidas por
  `normalizeItemContent` — verificado round-trip completo (harness
  casos 1-3: serializar → `normalizeItemContent` real lê de volta os
  mesmos valores).
- **Runa**: schema `additionalProperties:true` no efeito, campos de topo
  fechados. `dano`→`dano_modificador`; `aplicar_condicao` direto;
  `modificar_teste`→`modificador`; `alterar_recurso`→`recurso`;
  `teste_resistencia`→`efeito_com_resistencia` (mesma árvore da Etapa 7,
  CD derivada bloqueada como em item); `alterar_dano_recebido`→`protecao`;
  `acao_reacao_adicional`→`ataque_adicional`/`reacao` (ambos reais no
  enum); `modificar_instancia`→`autorreparo`. `cura`/`remover_condicao`
  **bloqueados** (não existem no enum real de runa).
- **Talento**: `alterar_preco`/`conceder_item`/`consumir_item`/
  `alterar_disponibilidade` usam o `tipo` livre do schema; `alterar_preco`
  usa a família real `economia_loja`.
- **`legacyLossValidation.ts`**: a checagem "estatisticas de item nunca
  muda" (Etapa 6) foi refinada para permitir DIVERGÊNCIA só nas 8 chaves
  que esta etapa passou a editar de verdade — qualquer outra chave
  continua bloqueando a publicação como antes (bug latente evitado:
  sem esse ajuste, editar MIT-base num item convertido de legado
  quebraria a validação de perda).

## 10. Segurança

Mesmas garantias das etapas anteriores — validação de admin/mutação no
servidor, diagnóstico recalculado no servidor, sem `eval`/fórmula
arbitrária, operações de instância sempre por operação ENUMERADA (nunca
um caminho JSON livre). Nenhuma RLS de personagem/campanha/mesa tocada;
nenhuma tabela nova.

## 11. Migrations

Nenhuma. `rune` já existia no enum `content_type`; `content_editor_metadata`
já armazena JSONB livre; nenhuma tabela de estoque foi criada (deliberado).

## 12. Verificações executadas

- `git status --short`, `npx tsc --noEmit`, `npm run build` — limpos.
- `scripts/dev/validate-inventory-runes-market.mjs` — **22/22 checks
  passando**: defaults de item round-trip via `normalizeItemContent`
  REAL; reparo/recarga via `setItemMitAtual`/`setItemCargaAtual` REAIS
  (nunca ultrapassam o máximo); runa serializando/validando contra
  `schema_runas_v1_2.json` real; árvore de teste/resistência reaproveitada
  para runa; bloqueios de CD derivada/cura/remover_condicao em runa;
  desconto/dívida de talento no formato REAL de
  `getGarimpoDeRuaAvailability`/`getCadernetaDeDividaAvailability`,
  validado contra `schema_talentos_v1_3.json`; bloqueio de
  `conceder_item` fora de talento; compatibilidade de runa via
  `getRuneCompatibility` REAL; Aljava nunca duplicada via
  `hasExistingAljava` REAL; ausência de `_editor`; separação modelo×instância.
- SQL transacional com rollback (Supabase, projeto `yvxoijexyhjjipjktfuu`):
  inseriu um `content_document` real de runa (payload completo, incluindo
  `custo_integridade:0`) + `content_editor_metadata` com um
  `modificar_instancia`, releu e comparou byte-a-byte, confirmou os
  campos fixos, abortou a transação — contagens pós-rollback confirmam
  **zero resíduo**.

## 13. Verificações bloqueadas

`scripts/dev/check-admin-inventory-runes-market.ts` (Playwright) — mesmo
conflito `esbuild`/`tsx`. Criado, documentado, não executado; comando
`npm run check:admin-inventory-runes-market` disponível.

## 14. Limitações reais

- `conceder_item`/`consumir_item`/`alterar_disponibilidade` nunca são
  automáticos — sempre lembrete, por decisão deliberada de escopo.
- `alterar_preco` só automatiza 2 das 6 operações possíveis (as 2 com
  leitor real no conteúdo).
- `moeda`/`quantidadePadrao`/`cargasPadrao`/`custoPa`/`disponibilidade`/
  `aquisicao` em `CamposItem` continuam sem leitor/escritor real (achado
  da auditoria, pré-existente desde a Etapa 3) — não "consertados" nesta
  etapa por não haver conteúdo/schema real que dê semântica a eles.
- `regioes` de item é editável mas sem leitor real ainda.
- `requisito_pericia` de runa não é verificado pelo executor de
  instalação (`installRuneOnItem`) — narrador confirma manualmente.
- Nenhum gancho de UI novo em `/dev/table` (instalação de runa já existe
  nos fluxos atuais do personagem).
- Browser check não executado (ambiente).

## Status final

**Implementação concluída — aceite de browser pendente.** `rune` está
editável; item/equipamento têm defaults estruturados seguros; MIT-base/
PD-base representáveis com executor real; munição/carregador/Aljava
representáveis sem duplicar executores; compatibilidade/slots de runa
representáveis; instalação/ativação corretamente classificadas (já
reais); preço/disponibilidade representáveis; desconto representável
com executor real; serialização/schemas válidos; round-trip por
metadata comprovado (node + SQL); modelo e instância permanecem
separados; TypeScript e build passam; nenhuma perda de payload conhecida.
**Não avancei para a Etapa 10.**

> **Nota de referência (Etapa 10, sem alterar o status acima)**: a
> Etapa 10 encontrou e corrigiu 5 bugs reais nesta etapa — `efeito_temporario`/
> `modificar_instancia`/`conceder_item`/`consumir_item`/`alterar_disponibilidade`
> emitiam, quando serializados para TALENTO, chaves inexistentes no
> schema fechado de talento (só detectável validando contra
> `schema_talentos_v1_3.json`, nunca testado aqui). Corrigido em
> `effectLegacySerialization.ts` — ver
> `docs/CHECKPOINT_ETAPA10_COMPANHEIROS_TRAMA.md` §5. O status
> "Implementação concluída — aceite de browser pendente" acima permanece
> exatamente como registrado nesta etapa (a correção não afeta item/rune,
> onde esses tipos já validavam corretamente).

---

## Aceite de browser — rodada de auditoria formal do Editor Universal

**Data**: 24-25/07/2026. **Ambiente**: `next dev` local + Supabase real, ferramenta de browser. **Fixtures**: usuário admin temporário + `admin_users` via SQL.

**Bug crítico encontrado e corrigido nesta rodada**: `modificar_instancia`, `conceder_item`, `consumir_item`, `alterar_disponibilidade` (e todo tipo pós-MVP) eram rejeitados incondicionalmente ao salvar rascunho por um gate de validação desatualizado (`effectDraftValidation.ts::isTipoEfeitoMvp`) — este é exatamente o "nunca testado ao vivo" apontado pela nota de referência da Etapa 10 §5 sobre estes 5 tipos. Corrigido; detalhes completos em `docs/CHECKPOINT_CORRECAO_VALIDACAO_TIPOS_EFEITO_POS_MVP.md`.

Executado ao vivo:

- **Runa**: rascunho novo → `slotsPossiveis: [arma]` → efeito `modificar_teste` (+1 Precisão) → `modoAutomacao` = "Automático" → salvo → reload confirmou persistência exata (slot + perícia) → publicado com sucesso (`1.0.0`).
- **Item com defaults de modelo**: campos `MIT-base`/`PD-base`/slots de runa/cargas máximas/munição máxima confirmados presentes e preenchíveis na UI (via os itens já criados nesta rodada para as Etapas 4/5/8).
- **Os 5 tipos críticos, via talento** (não há UI de "instância de personagem de teste" no Editor Universal — a confirmação é de que o EDITOR os salva/serializa/publica corretamente, não de que um executor de jogo os aplica, o que já era documentado como "sempre lembrete" para 4 dos 5): `modificar_instancia` (`acao: alterar_carga_atual`, `valor: 1`, `modoAutomacao: "Assistido"` — tem executor real, confirmado), `conceder_item` (`slug: faca`, `quantidade: 1`, "Lembrete"), `consumir_item` (idem, "Lembrete"), `alterar_disponibilidade` (`acao: marcar_disponivel`, "Lembrete") — todos os 4 preenchidos, salvos **sem falsa colisão** (correção confirmada) e publicados com sucesso; payload consultado diretamente no Supabase real confirmou as chaves REAIS pós-correção da Etapa 10 (`acao`+`valor` para `modificar_instancia`; `identifica`+`max_unidades` para `conceder_item`/`consumir_item`; `acao` para `alterar_disponibilidade`) — **a correção da Etapa 10 §5 está confirmada funcionando no fluxo real de talento, não apenas no harness**, exatamente o item que este checkpoint e o da Etapa 10 marcavam como nunca verificado ao vivo.

**Não executado nesta rodada**: itens 10–21 do checklist original do script (bloquear Aljava duplicada, bloquear runa incompatível, instalar/ativar runa em instância de teste, reparar MIT, consumir carga, calcular desconto, impedir preço negativo, instância existente inalterada) — o próprio script original já os classificava como "cobertos pela suíte node (`validate-inventory-runes-market.mjs`), sem gancho de UI dedicado" — ou seja, não há como exercitá-los via browser além do que a suíte node já cobre (inalterada, 22/22).

Console e rede: nenhum erro. Fixtures removidas ao final.

**Status: "Implementação concluída — aceite de browser parcial."** Promovido de "pendente" — o achado mais importante desta rodada (confirmação ao vivo da correção da Etapa 10 §5 para os 5 tipos que afetam talento) foi comprovado. Não promovido a "concluída — aceite de browser aprovado" porque os itens sem UI dedicada (10–21) permanecem cobertos só pela suíte node, e nenhuma instância de personagem real foi usada para exercitar os executores operacionais (`setItemMitAtual` etc.) neste round.
