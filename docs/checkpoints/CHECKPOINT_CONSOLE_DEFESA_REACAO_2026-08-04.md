# Checkpoint — Console do Personagem: "Rolar defesa" e economia de Reação

**Data**: 2026-08-04
**Commit-base**: `d02e9e7`
**Escopo**: botão "Rolar defesa" em Reações, fluxo de escolha de defesa, integração com a rolagem real de dados e com a regra de penalidade cumulativa por defender sem Reação disponível. Ver também o checkpoint de janela/modos para o contexto estrutural do Console.

---

## 1. Botão "Rolar defesa"

Adicionado logo abaixo do bloco de Reações em `IdentityAside.tsx` (componente `RecursoPontos`, usado tanto no Painel quanto na aba "Personagem" do Foco — ver checkpoint de janela). Especificação seguida à risca: 28px de altura, gap de 12px pro bloco de Reações (resultado de somar o `margin-top:6px` do botão ao `gap:6px` já existente em `.rc-npr`), ícone `Shield` do Lucide com `color`/`fill` fixos (`#0485A3` / `rgba(4,133,163,.33)`, não herdados via `currentColor` — spec pedia literalmente essas cores), fonte Rajdhani 13px/600, largura total do container. CSS em `.rc-npr-defesa` (`console.css`).

Prop nova em `RecursoPontos`: `onRolarDefesa?: () => void` — só passado no call-site de Reações, então o botão só existe ali (Pontos de Ação e Pontos de Magia, que reaproveitam o mesmo componente, não ganham o botão).

## 2. Fluxo de escolha de defesa

Não existia, em nenhum lugar do código, um fluxo de "escolher qual das defesas rolar" — busca confirmada em `src/app/mesas`, `src/lib/character/*` e nos JSONs de conteúdo antes de concluir isso. Construído do zero seguindo o padrão já estabelecido por `SurgePickerModal` (mesmo componente `Aux`, mesma classe `rc-aux-item`), em `panels/AuxModals.tsx`:

- **`DefensePickerModal`** — lista as 4 ações defensivas das regras reais (texto fornecido pelo usuário): Esquivar, Bloquear, Aparar, Resistir.
- **`ResistirAtributoModal`** — segundo passo, só para "Resistir": a regra deixa a critério do narrador se o teste é de Vigor (robustez/força) ou Mobilidade (agilidade) — não há perícia fixa, então abre essa escolha extra em vez de rolar direto.
- Mapeamento perícia fixa por tipo (`PERICIA_DEFESA` em `CharacterConsole.tsx`): Esquivar → Reflexos, Bloquear → Reflexos, Aparar → Luta — todas conferidas como ids reais existentes em `regras_personagem`.

Estado novo em `CharacterConsole.tsx` (`Aux` union): `{ tipo: "defesa" }` e `{ tipo: "resistir-atributo" }`, mais o campo opcional `defesa` em `{ tipo: "rolagem", resultado, defesa? }`. Handlers `onEscolherDefesa(tipo)` e `onEscolherResistir(periciaId)` chamam `api.rolarDefesa(...)` e abrem `RollResultModal` com o resultado.

## 3. Rolagem real + consumo de Reação

Primeira versão consumia Reação de forma ingênua (`api.ajustarReacoes(1)`). Ao receber a regra completa do usuário — cada defesa **sem** Reação disponível na mesma rodada ainda é permitida, mas soma **-1 cumulativo** por defesa nessas condições —, a busca revelou um módulo de domínio já pronto e não utilizado: `src/lib/character/reactions.ts` ("checkpoint v0.43"), implementando exatamente essa regra (`spendReactionForDefense`, `defesas_sem_reacao` em `CharacterGameState`, reset no início de rodada). A implementação ingênua foi substituída por essa infraestrutura real.

- **`ConsoleApi.rolarDefesa(periciaId)`** (novo método, `types.ts`) — retorna `ConsoleDefenseRollResult { resultado, usouReacao, penalidade, defesasSemReacao }`.
- Implementado em `CharacterSheetClient.tsx` (única implementação de `ConsoleApi`, compartilhada por `/dev/character-sheet` e a rota real `/ficha`): chama `spendReactionForDefense(characterRef.current, derivados.reacoes_por_rodada, reactionRules)`, aplica `spend.penaltyApplied` como `modificador` de `rollPericia(...)`, loga a ação, e devolve o resultado junto dos metadados de Reação.
- Aviso visual: `RollResultModal` (`AuxModals.tsx`) ganhou a prop opcional `defesa`; quando `!defesa.usouReacao`, mostra um banner âmbar (`.rc-aux-defesa-aviso`, ícone `TriangleAlert`) acima do resultado — "Sem Reação disponível — Nª defesa sem Reação nesta rodada, penalidade cumulativa de **X** já aplicada abaixo."

## 4. Reset do contador ao recuperar Reação

Pedido final do usuário: "tem que resetar quando ele recupera reação" — o contador `defesas_sem_reacao` mantinha seu valor mesmo depois de o jogador recuperar uma Reação manualmente (botão "+"/"Devolver" nos pips). A regra só previa reset no início da rodada.

Corrigido com uma nova função em `CharacterSheetClient.tsx`, **`ajustarReacoesConsole(delta)`**, que substitui a chamada direta a `adjustEstadoJogo("reacoes_usadas", delta)` em `ConsoleApi.ajustarReacoes`:
- Quando `delta < 0` (recuperando Reação) **e** `defesas_sem_reacao > 0`, monta uma única atualização combinada zerando `defesas_sem_reacao` junto com `reacoes_usadas`, atualiza `characterRef.current` e `setCharacter` juntos, e loga a mudança.
- Caso contrário, cai no comportamento antigo (`adjustEstadoJogo`).

Verificado ao vivo: acumulada uma penalidade de -2 (3 rolagens de defesa com só 1 Reação disponível), clicado em "Devolver 1 Reações", nova rolagem de defesa saiu sem penalidade e sem o banner.

## 5. Arquivos

**Alterados**: `panels/AuxModals.tsx` (novos exports `TIPOS_DEFESA`, `TipoDefesa`, `DefensePickerModal`, `ResistirAtributoModal`, prop `defesa` em `RollResultModal`), `panels/IdentityAside.tsx` (botão + prop `onRolarDefesa`), `CharacterConsole.tsx` (estado/handlers do fluxo), `types.ts` (`ConsoleApi.rolarDefesa`, `ConsoleDefenseRollResult`), `src/app/dev/character-sheet/CharacterSheetClient.tsx` (`ConsoleApi.rolarDefesa`, `ajustarReacoesConsole`), `src/app/_design/console.css` (`.rc-npr-defesa`, `.rc-aux-defesa-aviso`).
**Reaproveitado sem alteração**: `src/lib/character/reactions.ts`, `src/lib/character/types.ts` (`defesas_sem_reacao`).
