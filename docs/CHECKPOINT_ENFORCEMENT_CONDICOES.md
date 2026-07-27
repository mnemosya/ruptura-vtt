# Checkpoint — Enforcement das 17 condições (parcial)

## Achado

`deriveActiveEffectsFromConditions` (`activeEffects.ts`, checkpoint
v0.51) já interpretava `payload_automacao.efeitos` de TODAS as 17
condições publicadas e já classificava corretamente
`bloquear_acoes`/`bloquear_reacoes` como `kind: "lock"` — mas o
próprio comentário do código documentava a lacuna: *"hoje só
informativo na UI, o Console de Ação não impede a ação sozinho"*.

## Correção

Nova função pura `getConditionLockReason(action, activeEffects)` em
`actionConsole.ts`: dado o resultado JÁ computado por
`deriveActiveEffectsFromConditions` (nenhuma releitura de payload,
nenhuma duplicação de regra), decide se algum efeito `kind==="lock"`
bloqueia a ação em questão —

- `affectedTags` vazio → `bloquear_reacoes`: bloqueia qualquer ação
  com custo de Reação.
- `affectedTags` contém `"acao"` → curinga (Atordoado/Inconsciente
  usam essa tag, que não existe em nenhuma das 28 ações reais do
  catálogo) → bloqueia QUALQUER ação.
- Caso contrário → bloqueia só se a ação tiver alguma tag em comum
  (ex.: Imobilizado bloqueia `ofensiva`/`defensiva`, não uma ação sem
  essas tags).

Ligado em **dois pontos** de `actionConsole.ts` (mesma dupla camada já
usada para o limite de PA em Turnos Rápidos, fase 1):
`buildActionConsoleItems` (desabilita o botão com o motivo exato — "X:
não pode realizar ações.") e `executeActionOnCharacter` (recusa a
execução mesmo que a chamada não passe pela UI). Os dois pontos de
chamada em `CharacterSheetClient.tsx` (preview + execução real) passam
o `activeEffects` que a ficha já calculava para outros fins (RollsTab,
ConditionsTab) — nenhum novo cálculo duplicado.

## Cobertura real das 17 condições

Verificado contra o conteúdo publicado
(`content/db_condicoes_normalizado_v1_5.json`):

- **Bloqueiam ação de verdade agora**: Atordoado e Inconsciente
  (bloqueiam tudo + Reações), Imobilizado (bloqueia ofensiva/
  defensiva).
- **Só modificador de rolagem** (já automatizado desde v0.51, sem
  mudança nesta sessão): Cego, Ofuscado, Lento, Caído, Agarrado,
  Contundido.
- **Sem automação de bloqueio de ação** (não têm `bloquear_acoes`/
  `bloquear_reacoes` no payload — corretamente tratadas como
  "assistida"/lembrete): Agarrando, Queimando, Sangrando, Envenenado,
  Saturado, Insaturado, Surdo, Sufocando.

## Limitações conhecidas (não implementadas nesta sessão)

- **`falha_automatica`** (Cego em testes de visão): já vira `kind:
  "auto_fail"` em `activeEffects.ts`, mas o `RollsTab` ainda não
  IMPEDE a rolagem sozinho (só mostra o aviso) — bloquear rolagens é
  um ponto de integração diferente do Console de Ação, fora do escopo
  desta correção.
- **`definir_deslocamento`/`multiplicar_deslocamento`** (Imobilizado/
  Lento/Agarrando bloqueando ou reduzindo deslocamento): o catálogo de
  28 ações não tem nenhuma ação além de "Deslocar-se" com a tag
  `movimento`, e não há distância numérica rastreada (jogo é "teatro
  da mente") — continua aviso informativo, não bloqueio real.
- Condições totalmente manuais/fora da Biblioteca continuam caindo no
  aviso genérico (`fallbackWarning`), como já era — nenhuma
  interpretação nova inventada para elas.

## Validação

- `npx tsc --noEmit` e `npm run build`: limpos.
- Suite de asserts contra o conteúdo real de condições/ações
  (`content/db_condicoes_normalizado_v1_5.json` e
  `db_acoes_combate_normalizado_v1_1.json`, via loader ESM temporário,
  descartado): confirma que Atordoado bloqueia ataque/deslocamento/
  reação, Imobilizado bloqueia só ofensiva/defensiva (não uma ação sem
  essas tags), Cego não produz nenhum `lock` (só penaliza rolagem),
  personagem sem condição não é bloqueado.
- Não verificado em navegador nesta sessão.

## Atualização — Inconsciente e Imobilizado (rodada de fechamento)

Reconstruídos e confirmados corretos contra o conteúdo REAL publicado
(`db_condicoes_normalizado_v1_5.json`, v1.1.0) — nenhuma mudança de
código necessária, `getConditionLockReason` já implementava exatamente
o payload real de ambas. Ver
`CHECKPOINT_FECHAMENTO_CONCORRENCIA_ISOLAMENTO.md` para a matriz
completa. Não declaro as 17 condições concluídas.
