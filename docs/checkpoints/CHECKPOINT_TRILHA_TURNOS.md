# Checkpoint — Trilha de turnos (Rápidos/Lentos)

Implementa o primeiro sistema real de turno da PRD seção 6 ("Combate e
iniciativa por janelas"). Antes deste checkpoint só existia o contador
simples `campaigns.current_round`/`current_scene` (migration 0017) — a
própria UI (`TurnCounters.tsx`) documentava explicitamente que rodada,
janela Rápida/Lenta e ações não estavam implementadas.

## Escopo entregue

- **Schema** (`supabase/migrations/0036_turn_track.sql`): `campaigns.turn_track`
  (jsonb) + `campaigns.turn_track_version` (concorrência otimista).
- **Motor puro** (`src/lib/table/turnTrack.ts`): ordem alternada PJ/PNJ
  com desempate por Reflexos (`buildTurnOrder`), início de rodada
  (`startRound`, sempre abre em Rápidos — PRD 6.2), avanço para Lentos
  (`advanceToLenta`), encerrar turno (`endTurn`), avanço/override do
  narrador (`narratorAdvance`/`narratorOverrideToParticipant`), e o
  enforcement do limite de PA em Rápidos (`isActionAllowedInWindow`,
  PRD 6.1/6.2/6.3 — bloqueia >2 PA na janela Rápida exceto override).
- **RPCs** (`supabase/migrations/0037_turn_track_rpc.sql`):
  `narrator_set_turn_track` (dono da mesa, mesmo padrão de confiança de
  `endCampaignRound`) e `end_own_turn` (SECURITY DEFINER que revalida
  dentro da transação: personagem pertence ao chamador via
  `can_manage_character`, pertence à mesa, versão bate, e É REALMENTE a
  vez dele no estado atual — nunca confia em blob de estado vindo do
  jogador).
- **Server Actions** (`src/lib/table/turnTrackActions.ts`):
  `startTurnRound`, `advanceTurnWindowToLenta`, `narratorAdvanceTurn`,
  `narratorOverrideTurn`, `endOwnTurn`, `getTurnTrackState`.
- **Enforcement no executor** (`src/lib/character/actionConsole.ts`):
  `canPayActionCost`/`executeActionOnCharacter`/`buildActionConsoleItems`
  aceitam `turnWindow`/`narratorOverride` opcionais — o bloqueio de PA
  em Rápidos acontece no motor de execução, não só num botão desabilitado.
- **Reset por rodada** (`src/lib/table/endRound.ts`): "Encerrar Rodada"
  volta a trilha para `window: null` (narrador precisa "Iniciar rodada"
  de novo) — best-effort, não desfaz o avanço de rodada se falhar.
- **UI**: `src/app/components/TurnTrackPanel.tsx`, reutilizado na mesa
  (`MesaDetailClient.tsx`, controles completos de narrador) e na ficha
  (`CharacterSheetClient.tsx`, aba Mesa — "Encerrar meu turno" habilitado
  só quando é a vez do personagem do jogador).
- **Realtime**: reaproveita a assinatura já existente de `campaigns`
  UPDATE (`subscribeToCampaignRealtime`) — nenhum canal novo necessário,
  `turn_track` já está em `campaigns`.

## Decisões e limitações conhecidas

- **PJ vs. PNJ**: não existe campo dedicado no schema de personagem.
  Usa-se `profile_id != null` (PJ) / `profile_id == null` (PNJ) —
  mapeamento de engenharia, não uma regra nova.
- **Reflexos de desempate**: usa `pericias.reflexos` (valor investido),
  sem somar o atributo ligado (este módulo não resolve qual atributo
  cada perícia usa — isso vem do payload de regras da Biblioteca).
  Suficiente para um desempate determinístico; não é usado para
  nenhum outro cálculo mecânico.
- **Sem tabuleiro/alvo estruturado**: segue o padrão "teatro da mente"
  já adotado no resto do app.
- **Ficha (`mesas` local)**: o array de mesas carregadas pela ficha não
  tem uma assinatura Realtime própria de `campaigns` — a atualização
  após ações do próprio jogador é local (otimista); um F5 sempre
  reflete o estado real. Pendência conhecida, não bloqueante.
- **Não verificado neste checkpoint**: fluxo em navegador (dois
  perfis reais disputando turno), harness dedicado além do teste
  local do motor puro (rodado via loader ESM temporário, descartado).

## Validação

- `npx tsc --noEmit`: sem erros.
- `npm run build`: sucesso (todas as rotas compilam).
- Motor puro (`turnTrack.ts`): suite de asserts cobrindo ordem
  alternada/desempate, encerrar turno (aceita/rejeita quem não é a
  vez), avanço para Lentos com recomputação de participantes, override
  do narrador, e enforcement de PA — todos passando.
- Migrations `0036`/`0037` aplicadas no projeto Supabase real
  (`ruptura-vtt`, `yvxoijexyhjjipjktfuu`); advisories de segurança
  revisados (só o aviso informativo esperado de SECURITY DEFINER
  exposto a `authenticated`, mesmo padrão de funções já existentes).

## Atualização — fechamento de concorrência (rodada seguinte)

Concorrência literal (dois cliques simultâneos, contra o Supabase
real) provada ao vivo para "encerrar próprio turno" e para "fim de
rodada" (bug real de duplicação encontrado e corrigido); as demais
combinações (narrador×narrador, jogador×override, transição de
janela) confirmaram o invariante central ao vivo mas tiveram
asserções secundárias poluídas por um artefato do harness de teste.
Ver `CHECKPOINT_FECHAMENTO_CONCORRENCIA_ISOLAMENTO.md` para o relato
completo.

## Atualização — trilha concluída e aprovada (rodada de segurança/atomicidade)

Os 3 cenários pendentes acima foram reexecutados com um harness
determinístico (fixture isolada por cenário) — invariante central
("exatamente uma operação vence") confirmado ao vivo nos 4 cenários,
incluindo narrador×narrador, jogador×override e transição Rápida→Lenta.
Ver `CHECKPOINT_SEGURANCA_ATOMICIDADE.md`.
