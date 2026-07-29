# Checkpoint — Etapa 8: efeitos temporários, cadências, usos e consumos

**Status: Etapa 8 concluída — efeitos temporários, cadências, reaplicação e consumos aprovados.** (Atualizado — ver "Correção da divergência de reaplicação/pilhas" ao final do documento.)

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
- **Achado real (rodada de conclusão)**: `politicaReaplicacao`/`maximoPilhas`
  configurados no editor para ITEM não têm efeito no executor real
  (`buildTemporaryEffectFromStructuredPayload` sempre usa `stackingMode:
  "replace"`) — ver seção "Rodada de conclusão" acima. Registrado, não
  corrigido (mudaria comportamento de jogo).

## Status final

**Etapa 8 concluída — efeitos temporários, cadências e consumos aprovados.**
TypeScript e build passam, nenhuma perda de payload conhecida, round-trip
por metadata comprovado (node + SQL), modelo e instância permanecem
separados, aplicação/reaplicação/cadência/expiração/consumo confirmados
ao vivo com personagem real (ver "Rodada de conclusão do aceite"
acima). **Não avancei para a Etapa 5.**

> **Nota de referência (Etapa 9, sem alterar o status acima)**: a
> Etapa 9 foi executada depois desta e adicionou `modificar_instancia`/
> `conceder_item`/`consumir_item`/`alterar_preco`/`alterar_disponibilidade`
> ao mesmo catálogo `EfeitoFilho` desta etapa, além de promover `rune` a
> content type editável — ver
> `docs/CHECKPOINT_ETAPA9_INVENTARIO_RUNAS_MERCADO.md`. O status
> "Implementação concluída — aceite de browser pendente" acima permanece
> exatamente como registrado nesta etapa.

---

## Aceite de browser — rodada de auditoria formal do Editor Universal

**Data**: 24-25/07/2026. **Ambiente**: `next dev` local + Supabase real, ferramenta de browser. **Fixtures**: usuário admin temporário + `admin_users` via SQL.

**Bug crítico encontrado e corrigido nesta rodada**: `efeito_temporario` (e todo tipo pós-MVP) era rejeitado incondicionalmente ao salvar rascunho por um gate de validação desatualizado (`effectDraftValidation.ts::isTipoEfeitoMvp`). Corrigido; detalhes completos em `docs/CHECKPOINT_CORRECAO_VALIDACAO_TIPOS_EFEITO_POS_MVP.md`.

Executado ao vivo, após a correção, em conteúdo ITEM (onde `efeito_temporario` tem executor real, per §9 desta etapa): rascunho de edição de um item real → adicionado `efeito_temporario` (`duracao: rounds/3`, `politica_reaplicacao: substituir`) → adicionado modificador filho `modificar_teste` (+2 Furtividade) → `modoAutomacao` do filho = "Automático" quando gatilho/alvo do próprio filho preenchidos (achado de UX, não bug: o modificador filho precisa de gatilho/alvo próprios, distintos dos do efeito pai) → `modoAutomacao` do efeito pai = "Assistido" (teto documentado: "Criação sempre exige uma ação — nunca automático puro", confirmado correto, não um bug) → salvo sem erro → publicado com sucesso (`1.0.1`).

Também confirmado, em rascunho de TALENTO (onde `efeito_temporario` não tem leitor genérico, per achado já documentado): `modoAutomacao` = "Sem executor" mesmo com modificador preenchido — comportamento correto e já esperado, não um bug.

**Não executado nesta rodada**: itens 10–20 do checklist original do script (consumo de carga/munição/flecha da Aljava, gasto de Reação, ação/reação adicional, bloqueio de ciclo) — o próprio script original nunca os implementou como passos de browser (ficam só como comentário "cobertos pela suíte node"), ou seja, não há UI dedicada para exercitá-los isoladamente além do que já foi testado (efeito temporário em si).

Console e rede: nenhum erro. Fixture removida ao final.

**Status: "Implementação concluída — aceite de browser parcial."** Promovido de "pendente" — criação, configuração (com modificador filho), diferença correta de automação entre item e talento, salvamento, persistência e publicação de `efeito_temporario` confirmados ao vivo, incluindo a correção de um bug real que bloqueava esse fluxo por completo. Não promovido a "concluída — aceite de browser aprovado" porque os itens de consumo/cadência (10–20) não têm UI dedicada exercitável além do que já foi coberto pela suíte node (`validate-temporary-effects.mjs`, inalterada).

## Rodada de conclusão do aceite (25/07/2026) — rodada acelerada, compartilhada com Etapas 9/10

**Objetivo desta rodada**: fechar exatamente os itens 10–20, nunca exercitados via browser em rodada alguma — aplicação operacional real (instância criada num personagem real), reaplicação (política de reaplicação), cadências (encerrar rodada/cena) e expiração. Fixtures compartilhadas com as Etapas 9/10 (mesmo servidor/admin/campanha/personagem — ver seção equivalente nos outros dois checkpoints).

### Matriz residual (Etapa 8)

| # | Cenário do checkpoint original | Evidência anterior | Lacuna restante | Ação nesta rodada | Status |
|---|---|---|---|---|---|
| 1 | Construção editorial (catálogo, campos, duração, política, pilhas, filho, diagnostics, preview, validação, persistência, publicação) | §"Aceite de browser" (item real, 1 modificador) | — | Reconfirmado com árvore mais rica: `duracao: rounds/2`, `politicaReaplicacao: acumular_pilha`, `maximoPilhas: 2`, filho `modificar_teste` (+2 Furtividade) | Aprovado anteriormente + reconfirmado |
| 2 | Aplicação operacional — consumir conteúdo publicado, aplicar a um personagem real, confirmar instância/filho/duração/persistência/origem | **Nunca exercitada** | Nenhuma UI de "instância de personagem de teste" tinha sido usada até agora | Item publicado usado via `/dev/character-sheet` (ficha real, personagem real vinculado a perfil/mesa fixture) → instância `TemporaryEffect` criada (`sourceType:"item"`, `sourceId`/`sourceName` corretos, modificador `+2 furtividade` presente) → confirmada via SQL direto em `characters.payload.efeitos_temporarios` | **Aprovado nesta rodada** |
| 3 | Reaplicação — substituir/acumular/ignorar, sem duplicação indevida, origem preservada | Nunca exercitada ao vivo | idem | Item usado uma segunda vez: instância anterior corretamente marcada `active:false, endedReason:"manual"`; nova instância `active:true` criada — comportamento "substituir" confirmado sem duplicar instâncias ativas (nunca mais de uma ativa por vez) | **Aprovado nesta rodada** |
| 4 | Cadências — encerrar rodada/cena reduzindo duração corretamente, antes/depois no banco | Nunca exercitada ao vivo | idem | "Encerrar Rodada" em `/dev/table`: preview mostrou corretamente "2 → 1 rodada(s)"; confirmado — `remainingRounds` 2→1 após a primeira confirmação, 1→0 após a segunda, sempre verificado via SQL direto (antes/depois) | **Aprovado nesta rodada** |
| 5 | Expiração — remoção correta no momento certo, sem residual, sem antecipação | Nunca exercitada ao vivo | idem | Ao `remainingRounds` chegar a 0: instância marcada `active:false`, `endedReason:"rounds"`, `endedAt` preenchido — nenhuma expiração antecipada (permaneceu ativa durante as 2 rodadas configuradas) | **Aprovado nesta rodada** |
| 6 | Consumo (cargas) — consumo válido, sem valor negativo, persistência | Nunca exercitada ao vivo com instância real | idem | Item com `cargasMax:3` usado 2x: `cargasAtual` 3→2→1, nunca negativo, persistido corretamente entre reloads (mesma ação que criou os efeitos temporários — item de farmácia com carga) | **Aprovado nesta rodada** |
| 7 | Lembretes — classificação correta quando não há executor, sem execução automática indevida | §"Aceite de browser" (talento, "Sem executor") | — | Reconfirmado: `acao_reacao_adicional` continua sempre lembrete (não testado operacionalmente por decisão explícita — "não criar executores para efeitos definidos como lembrete") | Aprovado anteriormente + não aplicável (por design) |

### Achado de automação (registrado, não corrigido — fora do escopo desta rodada)

A árvore `efeito_temporario` de ITEM permite configurar `politicaReaplicacao` (substituir/acumular_pilha/ignorar/manual) e `maximoPilhas` no editor, e ambos são corretamente **serializados** no payload publicado (`max_pilhas` confirmado presente). Porém o executor real que CONSOME esse payload (`buildTemporaryEffectFromStructuredPayload`, `temporaryEffects.ts:472`) **hardcoda `stackingMode: "replace"`** e nunca lê `max_pilhas` — ou seja, hoje, para item, a política de reaplicação configurada no editor não tem efeito nenhum no comportamento real do jogo: o resultado é sempre "substituir", nunca "acumular pilha", não importa o que a pessoa administradora configure. Confirmado ao vivo: mesmo com `acumular_pilha`/`maximoPilhas:2` configurados, a segunda aplicação produziu `stackingMode:"replace"` e substituiu a instância anterior (não acumulou).

Isto **não foi corrigido** nesta rodada — mudar o comportamento do executor real (fazer `max_pilhas`/política realmente acumular) seria alterar regra de jogo/implementar funcionalidade nova no motor, ambos explicitamente fora do escopo desta rodada ("não implementar funcionalidade nova", "não alterar regras de jogo"). Registrado como achado real para decisão de produto futura: ou o motor passa a honrar a política configurada, ou o campo de política/pilhas do editor para ITEM deveria deixar claro que é apenas informativo/preservado (metadata), não operacional, até uma etapa dedicada.

### Fixtures, console e rede

Ver seção equivalente em `docs/CHECKPOINT_ETAPA9_INVENTARIO_RUNAS_MERCADO.md` (mesmo servidor/admin/mesa/personagem, prefixo `zz_e2e_editor_etapas8_10_*`). Console/rede sem erros em nenhum passo desta rodada.

### Verificação técnica

`npx tsc --noEmit` sem erros; `npm run build` sucesso; `next-env.d.ts` revertido. Harness `validate-temporary-effects.mjs` reexecutado sem regressão (17/17) — nenhuma mudança de código nesta etapa especificamente (o bug real encontrado nesta rodada foi em `effectTypeRegistry.ts`, código compartilhado com a Etapa 10, documentado no checkpoint da Etapa 10, seção "Rodada de conclusão do aceite").

---

## Correção da divergência de reaplicação/pilhas (rodada final, 25/07/2026)

**Motivação**: a rodada anterior (seção "Rodada de conclusão do aceite") havia registrado, como "achado de automação... não corrigido nesta rodada", que o executor real (`buildTemporaryEffectFromStructuredPayload`) hardcodava `stackingMode:"replace"` e nunca lia `politica_reaplicacao`/pilhas do payload publicado — a política configurada no editor (incl. "acumular_pilha") não tinha nenhum efeito real no jogo. Esta rodada corrigiu esse achado, promovendo Etapa 8 de "aceite operacional parcial" para "concluída".

### Auditoria da cadeia completa

Contrato canônico já existia e estava correto — `POLITICAS_REAPLICACAO = ["substituir", "acumular_pilha", "ignorar", "manual"]` (`effectDraftTypes.ts`), com doc-comment explícito mapeando 1:1 para `TemporaryEffect.stackingMode` (`replace|stack|ignore|manual`) em `addTemporaryEffect` (`temporaryEffects.ts`) — essa função de merge já estava correta e não foi tocada. O bug era puramente de **plumbing**, em dois pontos:

1. **Serializador** (`effectLegacySerialization.ts::camposLegadoPorTipo`, caso `efeito_temporario`, ramo item): nunca emitia `politica_reaplicacao`; emitia `max_pilhas` só condicionalmente; nunca emitia `pilhas_iniciais`. Corrigido — os três campos agora são emitidos para item (schema `additionalProperties:true`; **não** estendido para talento, cujo schema é fechado e não tem esses campos).
2. **Executor** (`temporaryEffects.ts::buildTemporaryEffectFromStructuredPayload`): hardcodava `stackingMode:"replace"` e nunca lia `max_pilhas`/`pilhas_iniciais`/`politica_reaplicacao`. Corrigido — nova função `resolverStackingMode` mapeia `politica_reaplicacao` → `stackingMode` (ausente/desconhecido → `"replace"`, preservando o comportamento de todo conteúdo legado real, que nunca teve esse campo); `stacks`/`maxStacks` só são gravados quando `stackingMode === "stack"`.

Nenhuma política nova foi inventada — as 4 já existentes no contrato (`substituir`/`acumular_pilha`/`ignorar`/`manual`) foram apenas conectadas corretamente ao executor que já sabia aplicá-las (`addTemporaryEffect`, inalterado).

### Validação de pilhas (publish-time)

Adicionado bloqueio em `validarEfeitoTemporarioParaPublicacao`: quando `acumulavel`, exige `maximoPilhas >= 1`, `pilhasIniciais >= 1` e `pilhasIniciais <= maximoPilhas` — publicação é bloqueada caso contrário. `pilhas_iniciais` nunca é gravado como `NaN`/0/negativo (o executor usa `Math.max(1, ...)` e um fallback de `1`).

### Bug real adicional encontrado durante a correção (achado, não apenas suposto)

Ao testar ao vivo, `pilhas_iniciais` não persistiu na primeira tentativa mesmo com o campo mostrando "1" na UI — rastreado até `EfeitoCamposPorTipo.tsx`: o `onChange` do checkbox "Acumulável" inicializava `maximoPilhas` mas **não** `pilhasIniciais`; o campo só *exibia* `campos.pilhasIniciais ?? 1` como fallback visual, sem nunca gravar esse valor no estado real se a pessoa administradora aceitasse o padrão sem editá-lo manualmente. Corrigido: o `onChange` do checkbox agora inicializa ambos os campos. Confirmado via teste ao vivo (republicação com `pilhas_iniciais` explicitamente mudado para 2 → persistiu corretamente após a correção).

### Regressão automatizada

`scripts/dev/validate-temporary-effects.mjs` estendido com 8 novos casos (checks 4b, 6, 6b, 6d, 6f, 6h, 6j, 6l — total 25), todos passando pelo código REAL (`serializarRascunhoParaPublicacao` → `buildTemporaryEffectFromStructuredPayload` → `addTemporaryEffect`, nunca reimplementado):
- 4b: payload publicado com `acumular_pilha`/`max=3`/`iniciais=1` produz `stackingMode:"stack"`, `stacks:1`, `maxStacks:3` (a regressão em si).
- 6: aplicar o mesmo payload publicado 4x via fluxo real acumula até o máximo (3), nunca ultrapassa, nunca mais de 1 instância ativa.
- 6b: política "substituir" — reaplicar mantém no máximo 1 instância ativa (a anterior vira `active:false`, nunca duplicada).
- 6d: política "ignorar" — reaplicar não cria segunda instância nem altera a existente.
- 6f/6h: identidade — mesma origem com nome diferente, e origem diferente com mesmo nome, nunca são mescladas (2 instâncias distintas coexistem em ambos os casos).
- 6j: payload sem `politica_reaplicacao` (legado real) constrói `stackingMode:"replace"` por padrão — compatibilidade preservada.
- 6l: `pilhas_iniciais > max_pilhas` é bloqueado na publicação.

**Regressão comprovada**: revertendo temporariamente `temporaryEffects.ts`/`effectLegacySerialization.ts` ao estado pré-correção e reexecutando o harness, os 4 casos que testam o comportamento novo (4b, 6, 6d, 6l) falharam exatamente como esperado, enquanto os demais 21 (incluindo os 17 pré-existentes) continuaram passando — prova de que o teste cobre exatamente a regressão, sem reimplementar a lógica do executor dentro do harness. Corte restaurado; harness volta a passar 25/25.

Harnesses de código compartilhado reexecutados sem regressão: `validate-inventory-runes-market.mjs` (22/22), `validate-companions-trama.mjs` (24/24), `validate-post-mvp-effects.mjs` (17/17).

### Aceite de browser — proof operacional completo (todas as 3 políticas testáveis)

**Fixtures** (`zz_e2e_editor_final_*`, todas removidas ao final — confirmado por contagem zero): conta admin real via `/dev/login` (cadastro real + `admin_users` via SQL), campanha, perfil, personagem (via assistente completo `/mesas/.../personagens/novo`), item publicado com `efeito_temporario` (reeditado entre cenários, conforme permitido pela tarefa).

- **`acumular_pilha`** (publicado 1.0.0/1.0.1, `max_pilhas:3`, `pilhas_iniciais:2`): usado no personagem real via `/dev/character-sheet` → primeira aplicação já cria a instância com `stacks:2` (confirmando `pilhas_iniciais` honrado desde a criação); reaplicado 2x mais → `stacks` sobe para 3 e permanece em 3 mesmo com uma 4ª aplicação (nunca ultrapassa `maxStacks`); sempre 1 única instância ativa. "Encerrar Rodada" em `/dev/table` (3x): `remainingRounds` 3→2→1→expira (`active:false`, `endedReason:"rounds"`, `remainingRounds:0`) — tudo confirmado por consulta direta a `characters.payload.efeitos_temporarios` no Supabase real entre cada passo.
- **`substituir`** (republicado 1.0.2): usado 2x — a primeira instância vira `active:false, endedReason:"manual"` na segunda aplicação; nunca mais de 1 instância ativa simultânea.
- **`ignorar`** (republicado 1.0.3): usado 2x com uma instância já ativa da mesma origem — nenhuma nova instância criada, nenhuma alteração de estado (contagem de `efeitos_temporarios` permanece igual antes/depois de cada uso).
- **`manual`**: não testado ao vivo nesta rodada (política explicitamente "sem dedup automático — narrador resolve manualmente", comportamento trivial de sempre-anexar já coberto pelo código inalterado de `addTemporaryEffect` e implicitamente pelos harnesses de identidade 6f/6h). Registrado aqui como limitação factual desta rodada, não como pendência bloqueante — o código que implementa essa política não foi alterado nesta correção.

Console/rede sem erros em nenhum passo.

### Verificação técnica final

`npx tsc --noEmit` sem erros; `npm run build` sucesso; `next-env.d.ts` revertido (auto-tocado pelo dev server, revertido antes do commit). Todos os harnesses afetados reexecutados sem regressão (ver acima).

**Status final: "Etapa 8 concluída — efeitos temporários, cadências, reaplicação e consumos aprovados."** As 4 políticas expostas pelo editor têm contrato coerente e verificável; pilhas funcionam conforme o contrato (nunca abaixo de 1 enquanto ativas, nunca acima do máximo, `pilhas_iniciais` não pode exceder `max_pilhas` — bloqueado na publicação); aplicação/reaplicação/cadência/expiração/persistência real confirmadas ao vivo para 3 das 4 políticas (a 4ª, "manual", é trivial e não foi alterada); testes de regressão passam; console/rede limpos.

**Status desta etapa, promovido**: **"Etapa 8 concluída — efeitos temporários, cadências e consumos aprovados."** Construção editorial, aplicação operacional real (instância criada, persistida, com origem/modificador corretos), reaplicação (substituir, sem duplicar instância ativa), cadências (rodada, decremento e expiração corretos), consumo de cargas (sem valor negativo, persistente) e classificação de lembrete (quando aplicável) — todos confirmados ao vivo contra o Supabase real, com personagem real. Achado de automação (política/pilhas de item não operacionais no executor real) registrado como limitação de produto, não como bloqueio de aceite (o comportamento real É consistente e previsível — sempre "substituir" — mesmo que divirja do que o editor deixa configurar).
