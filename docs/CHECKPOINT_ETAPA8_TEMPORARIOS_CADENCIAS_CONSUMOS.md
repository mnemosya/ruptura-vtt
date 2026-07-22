# Checkpoint — Etapa 8: efeitos temporários, cadências, usos e consumos

**Status: Implementação concluída — aceite de browser pendente.**

Não afirmo automação operacional completa além do que o motor real
executa hoje. A criação de um efeito temporário, o gasto de uma Reação e
a concessão de ação/reação adicional continuam exigindo uma ação real da
mesa/jogador — nenhuma dessas é "automática" nesta etapa.

## 1. Auditoria inicial

Módulos lidos por completo antes de desenhar qualquer tipo novo:

- `src/lib/character/temporaryEffects.ts` — modelo REAL de efeito
  temporário: `TemporaryEffect` (duração `rounds|scene|rest|manual`,
  `stackingMode: replace|stack|ignore|manual`, `stacks`/`maxStacks`),
  `addTemporaryEffect` (aplica a política de stacking), `tickRoundTemporaryEffects`/
  `expireSceneTemporaryEffects`/`expireRestTemporaryEffects` (expiradores
  reais por evento), `deriveActiveEffectsFromTemporaryEffects` (só
  modificadores de rolagem entram na soma; o resto vira aviso),
  `buildTemporaryEffectFromStructuredPayload`/`extractModifiers`/
  `parseDuration` — o leitor genérico REAL do payload `buff_temporario`
  de item: lê exatamente UM modificador por-tags (`valor`+`alvo_tags`) e
  UM por-perícia (`bonus_pericia`), mais `pa_bonus`/`mit_bonus`/`pd_bonus`/
  `dano_extra` como lembrete, e a duração via `duracao` textual
  (`"N_rodadas"`) ou `cadencia` (`"rodada"|"cena"|"dia"`).
- `src/lib/character/activeEffects.ts` — pipeline de `ActiveEffect` que já
  soma modificadores de efeito temporário nas rolagens (`sourceType:
  "temporary"`).
- `src/lib/character/talentEngine.ts` — `TALENT_CADENCES` (catálogo REAL
  de 11 cadências: turno/rodada/cena/combate/dia/descanso_longo/sessao/
  sessao_malha/missao/permanente/ao_adquirir, com política de reset
  automática vs. manual e o evento canônico que dispara cada reset),
  `getTalentUsageState`/`canUseTalent`/`resetTalentCadence` (lêem
  `efeito.usos`/`efeito.cadencia` diretamente do payload — genérico, não
  um sistema por talento), `getMarginPromotions` (reaproveitado desde a
  Etapa 7).
- `src/lib/character/itemUse.ts` — `useItemOnCharacter`/`useItemOnAlly`:
  ponto real onde `buff_temporario` vira `TemporaryEffect` (via
  `canApplyTemporaryEffect`/`buildTemporaryEffectFromStructuredPayload`);
  também o ponto real de consumo de carga (`consumeItemCharge`) e de
  cura/estabilização/remoção de condição — nenhum executor genérico de
  "usos/cadência" para item (o modelo real de item é `cargasMax`/
  `quantidade`, não `usos`/`cadencia`).
- `src/lib/character/inventory.ts` — `ItemContent.cargasMax`,
  `InventoryItemInstance.cargasAtual`, `getItemChargesAtual`,
  `consumeItemCharge` (executor real e genérico de carga: nunca cria
  quantidade/carga negativa, reduz `cargasAtual` até 0 e então consome 1
  `quantidade`, resetando a carga da próxima unidade).
- `src/lib/character/ammunition.ts` — `Aljava`/`AljavaStack`
  (`ALJAVA_CAPACIDADE_PADRAO = 15`, independente do inventário do
  personagem, qualquer arco usa a mesma Aljava selecionada),
  `consumeAttackAmmo`/`consumeFletchaFromAljava` (executor real: consome
  a flecha ATIVA no ataque, nunca ao selecionar; carregador/virote
  reduzem `municaoAtual` da própria instância).
- `src/lib/character/actionConsole.ts` — `estado_jogo.pa_gastos`/
  `estado_jogo.reacoes_usadas`/`defesas_sem_reacao`: contadores reais já
  usados para PA/Reação gastos por AÇÃO — não há, em lugar nenhum, um
  ponto que CONCEDA uma ação/reação adicional (só consome as existentes).
- `src/lib/character/endRoundConditions.ts` — pontos reais de fim de
  rodada/cena que já disparam reset de cadências automáticas
  (`AUTO_RESET_CADENCES`/`cadencesForEvent`).
- `src/lib/character/types.ts` — `TemporaryEffect`/`TemporaryEffectModifier`
  (modelo de INSTÂNCIA no personagem — nunca confundido com o modelo de
  CONTEÚDO/editor).
- `content/schema_equipamentos_v1_2.json` — efeito de item tem
  `additionalProperties: true` e já inclui, no enum fechado de `tipo`:
  `buff_temporario`, `ataque_adicional`, `economia_pa`, `recurso`,
  `reduzir_pa`, `utilitario` (reaproveitados 1:1, nenhum bucket novo
  inventado).
- `content/schema_talentos_v1_3.json` — efeito de talento é
  `additionalProperties: false` mas com uma lista de ~90 propriedades
  genéricas já aceitas (`usos`, `cadencia`, `cadencia_recuperacao`,
  `max_pilhas`, `valor_por_pilha`, `buffs`, `duracao`, `custo_pa`,
  `custo_pa_extra`, `custo_ram`, `rodadas_extra`, `penalidade`, `recurso`)
  e `familia` fechada incluindo `buff_empilhavel`, `ataque_adicional`,
  `reacao`, `economia_pa`, `recurso`, `protecao` — todas reais e já
  usadas em conteúdo publicado.
- `content/schema_magias_v1_3.json` — efeito de magia é
  `additionalProperties: false` com só 15 chaves fixas e nenhum campo de
  duração/pilha/uso/cadência/custo — **schema fechado, sem qualquer
  gancho para os 3 novos tipos desta etapa.**

## 2. Matriz real (resumo)

| Tipo legado | Content types | Campos reais | Executor atual | Automação real | Representação canônica (Etapa 8) | Serializável | Confirmação | Escopo |
|---|---|---|---|---|---|---|---|---|
| `buff_temporario` | item | `valor`+`alvo_tags`, `bonus_pericia`, `pa_bonus`/`mit_bonus`/`pd_bonus`, `dano_extra`, `duracao`/`cadencia` | `temporaryEffects.ts` (real, genérico) | Modificador de rolagem: automático após criado. Criação: assistida. | `efeito_temporario` | Sim (item) | Não (reaproveita fluxo de uso existente) | Nesta etapa |
| `buff_empilhavel` (talento) | talent | `max_pilhas`, `valor_por_pilha`, `duracao` | Nenhum leitor genérico | lembrete | `efeito_temporario` | Sim (preserva estrutura) | — | Nesta etapa (sem automação) |
| `usos`/`cadencia` (qualquer efeito de talento) | talent | `usos`, `cadencia` | `talentEngine.ts` (real, genérico) | assistido | `usoLimitado` (campo reutilizável, não um tipo à parte) | Sim (talento) | — | Nesta etapa |
| `cargas_max`/`quantidade` (item) | item | `estatisticas.cargas_max` | `inventory.ts::consumeItemCharge` (real, genérico) | assistido | **Já representável — não duplicado** (ver §5) | — | — | Fora do catálogo de efeitos (é stat de item) |
| munição/flecha da Aljava | item (arma) | `usesAmmunition`, `municaoMax`, Aljava | `ammunition.ts::consumeAttackAmmo` (real, genérico) | assistido (no ataque) | **Já representável — não duplicado** (ver §5) | — | — | Fora do catálogo de efeitos |
| `ataque_adicional` | talent, item | `rodadas_extra`, `penalidade`, `custo_pa_extra` (talento); `tipo` fechado (item) | Nenhum executor real | lembrete | `acao_reacao_adicional` | Sim | — | Nesta etapa |
| `reacao` (família) | talent | `gatilho`, `custo_pa` | Nenhum executor real | lembrete | `acao_reacao_adicional` | Sim (talento) | — | Nesta etapa |
| Consumo de recurso (PA/Reação/Mana/Sobrecarga/RAM) | talent, item, spell | `recurso`, `valor` | `alterar_recurso` (Etapa 4, já existe) | assistido | **Reaproveitado** — `momentoConsumo`/`refundEmCancelamento` novos, mesmo campo/executor | Sim | — | Nesta etapa |

**Não assumido**: nem todo campo chamado `duracao`/`usos`/`cargas`/
`cadencia` tem o mesmo significado — `duracao` de magia (tempo de efeito
narrativo) ≠ `duracao` de `TemporaryEffect` (rastreada em rodadas/cena/
descanso); "1 uso por cena" (contador de ativação) ≠ "consome 1 carga"
(estado da instância do item) ≠ "até 3 pilhas" (intensidade do MESMO
efeito ativo). Os 3 tipos novos desta etapa mantêm essas distinções como
campos SEPARADOS, nunca fundidos.

## 3. Arquitetura / modelo

Três tipos canônicos novos em `EfeitoFilho`/`EfeitoEditavel`
(`effectDraftTypes.ts`), todos reutilizáveis em qualquer content type
(sujeitos às mesmas regras de bloqueio por schema da Etapa 7):

- **`efeito_temporario`** — contêiner com duração
  (`rounds`+rodadas|`scene`|`rest`|`manual`, mesmo vocabulário de
  `TemporaryEffect.durationType`), política de reaplicação (`substituir`/
  `acumular_pilha`/`ignorar`/`manual` — mapeando 1:1 para
  `TemporaryEffect.stackingMode`; **"renovar duração" e "manter o mais
  forte" NÃO são oferecidos** porque o runtime não os representa
  deterministicamente), `acumulavel`/`maximoPilhas`/`pilhasIniciais`, e
  até `MAX_MODIFICADORES_EFEITO_TEMPORARIO = 4` filhos do tipo
  `modificar_teste` — reaproveitado, nunca duplicado (campo E executor).
- **`acao_reacao_adicional`** — `tipo` (`acao|reacao|ataque`), quantidade,
  custo substituído/gratuito, `consomeReacao`/`consomePa`, janela, alvo,
  penalidade, limite de encadeamento (nunca permite loop). **Sempre
  `lembrete`** — a auditoria não encontrou nenhum executor real que
  CONCEDA ação/reação/ataque adicional (o console de ação só consome PA/
  Reações já existentes).
- **Consumo de recurso** — NÃO é um tipo novo: `CamposAlterarRecurso`
  (Etapa 4) ganhou dois campos opcionais, `momentoConsumo` (7 valores:
  antes/depois de validação/confirmação/resolução/acerto/conclusão/
  manual) e `refundEmCancelamento`, só relevantes quando
  `operacao === "reduzir"`. Reaproveita o MESMO campo `recurso`/executor
  já usado por PA/Reação/Mana/Sobrecarga/RAM/PV/PE/Integridade — nunca um
  sistema paralelo.
- **`usoLimitado`** — campo OPCIONAL em `CamposEfeitoComuns` (não um tipo
  à parte): `{ usosMax, cadencia, chaveUso, compartilhado }`, disponível
  em QUALQUER efeito, exatamente como o schema real de talento já permite
  (`usos`/`cadencia` na raiz de qualquer efeito). `cadencia` usa o mesmo
  vocabulário de `TALENT_CADENCES` (11 valores). `chaveUso` é derivada
  (usa o `id` estável do próprio efeito) — nunca livremente editável no
  fluxo principal, só mostrada em modo técnico somente leitura.

**Consumo de carga/munição/flecha NÃO ganhou um tipo de efeito novo.**
Já são totalmente representados por mecanismos EXISTENTES e reais
(`item.estatisticas.cargas_max`/`consumeItemCharge`;
`item.usesAmmunition`/Aljava/`consumeAttackAmmo`) que rodam
independentemente do catálogo de efeitos — criar um tipo `consumo`
paralelo duplicaria o executor sem necessidade real (violaria "não
duplicar lógica de recarga" / "reutilizar o sistema existente"). O
exemplo obrigatório "item que consome uma carga ao usar" já é satisfeito
pelo sistema atual, sem mudança nesta etapa.

## 4. Limites (documentados)

| Limite | Valor | Motivo |
|---|---|---|
| Modificadores por efeito temporário | 4 | Acima disso não há caso real auditado; UI cria um por vez, sem forçar. |
| Modificadores por-tags serializáveis (item) | 1 | `extractModifiers` só lê UM campo `valor`+`alvo_tags`. |
| Modificadores por-perícia serializáveis (item) | 1 | `extractModifiers` só lê UM campo `bonus_pericia`. |
| Ações adicionais encadeadas | `campos.limite` (obrigatório > 0 quando definido) | Impede loop de ação — validação bloqueante. |
| Cadências reconhecidas | 11 (`TALENT_CADENCES`) | Nenhuma cadência inventada além do catálogo real. |

## 5. CD/derivações — não aplicável nesta etapa (sem mudança desde a Etapa 7).

## 6. Modelo × instância

`efeito_temporario`/`usoLimitado`/`acao_reacao_adicional` vivem só no
MODELO (conteúdo publicado). Nada aqui grava/lê `stacks` atuais,
`remainingRounds`, `usosGastos`, cargas atuais, munição carregada,
Reações/PA atuais ou `efeitos_temporarios` do personagem — essas
instâncias continuam exclusivamente em `Character` (runtime), nunca no
payload de conteúdo. Publicar um novo modelo NUNCA muta uma instância já
ativa; verificado no harness (`validate-temporary-effects.mjs`, caso 17)
e por inspeção: `serializarRascunhoParaPublicacao` nunca lê `Character`.

## 7. Serialização e schemas (por content type)

- **Item** (`additionalProperties: true`, enum fechado): `efeito_temporario`
  → `buff_temporario` real (campos `duracao`/`max_pilhas`/`valor`/
  `alvo_tags`/`bonus_pericia`/`nota`, exatamente o que
  `buildTemporaryEffectFromStructuredPayload` já lê);
  `acao_reacao_adicional` → só `tipo === "ataque"` é serializável
  (`tipo: "ataque_adicional"`, único valor real do enum; `acao`/`reacao`
  em item são BLOQUEADOS — o enum não tem um valor equivalente).
  `usoLimitado` é BLOQUEADO em item (sem leitor genérico real).
- **Talento** (schema livre para `tipo`, familia fechada):
  `efeito_temporario` → `familia: "buff_empilhavel"`, `tipo:
  "buff_temporario"` (preserva estrutura, mas classificado `lembrete` —
  sem leitor genérico); `acao_reacao_adicional` → `familia:
  "ataque_adicional"` ou `"reacao"` conforme `campos.tipo`; `usoLimitado`
  → `usos`/`cadencia` reais na raiz do MESMO efeito (qualquer tipo),
  lidos de verdade por `getTalentUsageState`.
- **Magia** (schema fechado, sem campo de duração/buff/uso/cadência):
  **os 3 tipos + `usoLimitado` são BLOQUEADOS** — mesma decisão já
  tomada na Etapa 7 para `modificar_margem`/`alterar_dano_recebido`, pela
  mesma razão estrutural (schema fechado sem bucket genérico).

Toda serialização passa por `validarEfeitoParaPublicacao` — bloqueio
explícito com mensagem, nunca truncamento silencioso.

## 8. Automação agregada

- `efeito_temporario`: piso "assistido" sempre (criação exige uma ação);
  sobe o executor real quando ao menos um modificador é válido, mas nunca
  ultrapassa o teto do catálogo (`effectTypeRegistry.ts`). Agrega o pior
  caso entre os `modificadores` (reaproveita `diagnosticarEfeitoEditavel`
  recursivamente, mesmo padrão da árvore de teste/resistência da Etapa 7).
- `acao_reacao_adicional`: sempre `lembrete` (nenhum executor real).
- `alterar_recurso` com `momentoConsumo`: automação inalterada (mesma
  regra da Etapa 4) — os campos novos só enriquecem o log/preview.

## 9. Resolvedor/integração operacional

Nenhum resolvedor novo foi necessário: `efeito_temporario` reaproveita o
pipeline real e já ativo (`itemUse.ts` → `temporaryEffects.ts`); consumo
de carga/munição/flecha reaproveita `consumeItemCharge`/
`consumeAttackAmmo` sem nenhuma mudança; uso/cadência de talento
reaproveita `talentEngine.ts`. Nenhum executor foi refatorado — só
conectado via serialização.

## 10. Compatibilidade com legado

`legacyConversion.ts` classifica `buff_temporario`/`buff_empilhavel` e
`ataque_adicional`/`reacao` como `somente_leitura` (preservados, nunca
convertidos em massa), com motivo explicando que existe um tipo editável
equivalente para conteúdo NOVO, mas a instância legada específica não é
promovida automaticamente. Mecânicas bespoke de `talentEngine.ts` (ex.:
Mirar, Bricolagem, Executar) permanecem bespoke — nunca reclassificadas
como efeito universal.

## 11. Segurança

Mesmas garantias da Etapa 7 (validação de admin/mutação no servidor,
diagnóstico recalculado no servidor, sem `eval`/fórmula arbitrária, sem
service role no client) — nenhuma superfície nova de RLS ou de escrita
pública foi introduzida; nenhuma migração nova.

## 12. Verificações executadas

- `git status --short`, `npx tsc --noEmit`, `npm run build` — todos limpos.
- `scripts/dev/validate-temporary-effects.mjs` — **17/17 checks
  passando**, compilando os módulos reais via `tsc` e rodando com `node`
  puro: serialização item/talento, validação contra
  `schema_equipamentos_v1_2`/`schema_talentos_v1_3`, round-trip completo
  através do EXECUTOR REAL (`canApplyTemporaryEffect` +
  `buildTemporaryEffectFromStructuredPayload` sobre o payload
  REALMENTE publicado, nunca escrito à mão), expiração real
  (`tickRoundTemporaryEffects`), acúmulo de pilhas real
  (`addTemporaryEffect` com `stackingMode: "stack"`, nunca ultrapassa o
  máximo), bloqueios de magia/limite de modificadores/uso em item,
  separação modelo×instância, ausência de `_editor`.
- SQL transacional com rollback (Supabase, projeto `yvxoijexyhjjipjktfuu`):
  inseriu um `content_editor_metadata` real com um `efeito_temporario` +
  `usoLimitado` completos, releu e comparou byte-a-byte, confirmou o
  campo aninhado `usoLimitado.cadencia`, e abortou a transação — consultas
  de contagem pós-rollback confirmam **zero resíduo**.

## 13. Verificações bloqueadas

`scripts/dev/check-admin-temporary-effects.ts` (Playwright) — mesmo
conflito de arquitetura `esbuild`/`tsx` das etapas anteriores. Criado,
documentado, não executado; comando `npm run check:admin-temporary-effects`
disponível para quando o ambiente permitir.

## 14. Limitações reais

- `acao_reacao_adicional` nunca é automática — puro lembrete estruturado.
- `efeito_temporario` em talento é preservado mas sem leitor genérico —
  lembrete.
- Nenhum novo gancho de UI em `/dev/table` foi adicionado (reaproveita o
  fluxo de uso de item já existente).
- Browser check não executado (ambiente).

## Status final

**Implementação concluída — aceite de browser pendente.** TypeScript e
build passam, nenhuma perda de payload conhecida, round-trip por
metadata comprovado (node + SQL), modelo e instância permanecem
separados. **Não avancei para a Etapa 9.**

> **Nota de referência (Etapa 9, sem alterar o status acima)**: a
> Etapa 9 foi executada depois desta e adicionou `modificar_instancia`/
> `conceder_item`/`consumir_item`/`alterar_preco`/`alterar_disponibilidade`
> ao mesmo catálogo `EfeitoFilho` desta etapa, além de promover `rune` a
> content type editável — ver
> `docs/CHECKPOINT_ETAPA9_INVENTARIO_RUNAS_MERCADO.md`. O status
> "Implementação concluída — aceite de browser pendente" acima permanece
> exatamente como registrado nesta etapa.
