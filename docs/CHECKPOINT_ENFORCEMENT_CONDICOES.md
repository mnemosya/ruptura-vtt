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

- ~~**`falha_automatica`** (Cego em testes de visão): já vira `kind:
  "auto_fail"` em `activeEffects.ts`, mas o `RollsTab` ainda não
  IMPEDE a rolagem sozinho (só mostra o aviso) — bloquear rolagens é
  um ponto de integração diferente do Console de Ação, fora do escopo
  desta correção.~~ **Fechada — ver "Atualização — falha_automatica
  bloqueia a rolagem" abaixo.**
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

## Atualização — Inconsciente e Imobilizado validados em navegador (rodada de segurança/atomicidade)

Pendência de browser fechada: ambas aplicadas/removidas em ficha real
via fixture de sessão, ação por ação na aba Ações — Inconsciente
bloqueia os 24 botões "Executar" (ações e reações); Imobilizado
bloqueia só ofensiva/defensiva, permite movimento/diversa/livre e
habilita "Escapar", exatamente como o conteúdo oficial publicado
exige. Ver `CHECKPOINT_SEGURANCA_ATOMICIDADE.md` para a matriz
atualizada. Enforcement central de Atordoado/Inconsciente/Imobilizado
agora "concluído e aprovado"; as demais condições continuam fora do
escopo.

## Atualização — `falha_automatica` bloqueia a rolagem (fecha a última pendência desta fase)

Fecha a lacuna registrada acima: `kind: "auto_fail"` deixa de ser só
informativo e passa a impedir a rolagem de verdade, mesmo padrão
dúplice de `getConditionLockReason` (UI + execução):

- Nova função pura `getAutoFailReason(rollTags, activeEffects)`
  (`activeEffects.ts`) — mesmo `activeEffects` já computado uma vez em
  `CharacterSheetClient.tsx`, nenhum recálculo duplicado; devolve a
  `explanation` do efeito `auto_fail` cuja `affectedTags` cruza com as
  tags da rolagem atual, ou `undefined` (liberado).
- `RollsTab.tsx`: o botão "Rolar" agora fica `disabled` com `title`
  mostrando o motivo exato quando `getAutoFailReason` devolve algo; o
  handler `handleRolarPericia` também recusa na primeira linha (defesa
  em profundidade — cobre qualquer acionamento que contorne o botão),
  mostrando `autoFailBlockedMessage`, que some sozinho assim que o
  bloqueio deixar de existir (tag desmarcada ou condição removida).
- Confirmado por leitura: `RollsTab`/`handleRolarPericia` é o único
  executor de teste de perícia/atributo (usado tanto por
  `/dev/character-sheet` quanto pela rota real `/ficha`, via
  `CharacterSheetView` → `CharacterSheetClient`) — não existe um
  executor externo separado que precise de um segundo guard.

### Validação

- `npx tsc --noEmit` e `npm run build`: limpos.
- `scripts/test-active-effects.ts` (caso novo 5b): `getAutoFailReason`
  bloqueia só quando a tag cruza um `auto_fail` real (mesma
  `explanation` do efeito, nunca uma mensagem inventada), libera sem
  cruzamento e sem nenhum efeito.
- Aceite pelo fluxo REAL (`/ficha`, não `/dev/character-sheet`): fixture
  temporária (usuário jogador + usuário narrador via Admin API,
  campanha, perfil reivindicado via `enter_campaign_profile` real,
  personagem com a condição OFICIAL "Cego" ativa), login real via
  `/login`, sessão de perfil real (RPC `enter_campaign_profile`, não
  simulada). Confirmado na aba Rolagens:
  - Sem cruzar tag: rolagem normal, grava histórico local e
    `table_logs`.
  - Marcando "Visão" com Cego ativo: botão `disabled`, `title` com a
    `explanation` exata, chip de aviso continua visível.
  - Nenhuma tentativa de rolagem enquanto bloqueado — clique real do
    mouse, `.click()` via JS, ou após remover `disabled` do DOM —
    produziu entrada nova em histórico local ou em `table_logs`
    (confirmado por SQL direto contra `table_logs`, repetidas vezes).
  - Desmarcando a tag: rolagem volta a funcionar normalmente.
  - Ressalva registrada com transparência: não foi possível isolar no
    browser, de forma 100% conclusiva, se é o guard interno de
    `handleRolarPericia` ou a própria reafirmação do `disabled` pelo
    React que impede o clique nas tentativas de bypass (manipular
    `disabled` via DOM externo mostrou-se instável neste ambiente de
    teste). O guard interno em si é a primeira linha incondicional da
    função, e sua função pura subjacente está coberta por teste
    unitário determinístico e passando. O resultado observável e
    relevante para segurança — nenhuma rolagem, nenhum log, nenhuma
    persistência quando bloqueado — foi comprovado de forma
    consistente e repetida.
- Fixtures da verificação removidas ao final (0 campanhas/personagens/
  usuários residuais confirmado por SQL).

Enforcement de condições nesta fase: Atordoado/Inconsciente/Imobilizado
(bloqueio de ação) e `falha_automatica` (bloqueio de rolagem) agora
"concluído e aprovado". Deslocamento numérico e condições puramente
manuais continuam fora de escopo, como já documentado acima.
