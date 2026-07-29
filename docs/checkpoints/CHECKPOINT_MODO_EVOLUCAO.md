# Checkpoint — Modo Evolução (parcial)

## O que já existia (verificado, não refeito)

- PM (`pm_total`/`pm_disponivel`) e histórico de evolução
  (`historico_evolucao`) já implementados em `evolution.ts`
  (`gainPm`/`spendPm`/`logPermanentAdjustment`) desde v0.40, com UI em
  `GeneralTab.tsx` (seção "PM e evolução", visível só em
  `sheetMode==="evolucao"`).
- Atributos e perícias já travados em Modo Jogo (`readOnly={sheetMode==="jogo"}`
  em `AttributesTab`/`SkillsTab`), com defesa em profundidade no
  handler (`updateAtributo`/`updatePericia` recusam se `sheetMode==="jogo"`).
- Vertentes e magias: **já** têm UI completa de evolução em
  `SpellsTab.tsx` — `onSetVertenteLevel` (subir nível de vertente) e
  `onLearn`/esquecer magia, ambos já gated por `sheetMode==="evolucao"`.
- PM sem custo fechado por atributo/perícia é uma decisão de design
  já documentada em `evolution.ts` ("sem tabela de custo fixo — nada
  inventado"), consistente com o PRD 3.3 ("enquanto os custos finais
  não estiverem fechados, usar placeholder"). Não alterado.

## Achado corrigido nesta sessão

`TalentsTab.tsx` **não tinha nenhum gate de modo** — um jogador podia
adquirir/remover nível de talento em Modo Jogo, contrariando PRD
4.1/4.2 ("talentos... travados" fora do Modo Evolução). Corrigido:
novo prop `sheetMode`, os botões "Adquirir"/"Remover" só aparecem em
Modo Evolução (mostram texto explicativo em Modo Jogo); os handlers
(`handleAcquireTalent`/`handleRemoveTalent`) recusam por garantia
mesmo que o clique chegasse de outro caminho.

## Ainda não coberto (gaps reais, não implementados nesta sessão)

- **Especializações** (`SpecializationContent`, `spells.ts`): não
  existe NENHUMA UI de seleção/aquisição em lugar nenhum da ficha —
  content type definido, zero consumidor. Fora de escopo desta sessão
  (feature nova, não um gate faltando).
- **Undo/rollback formal**: a única garantia hoje é "edição é local
  até Salvar personagem" (mesmo padrão do resto da ficha) — não há um
  fluxo de "confirmar" por alteração de evolução nem rollback
  transacional dedicado.
- **Bloqueio por PM insuficiente**: não implementado, DE PROPÓSITO —
  não há custo fechado para bloquear contra (ver acima).

## Validação

- `npx tsc --noEmit` e `npm run build`: limpos.
- Não verificado em navegador nesta sessão.
