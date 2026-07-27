# Checkpoint — Inventário do bando em produção (parcial)

## Achado

`InventoryTab.tsx` já tinha "Enviar ao bando" (`onSendToCrew` →
`handleSendItemToCrew` → `upsertCrewInventoryItem`) ligado na ficha de
produção (`/ficha`) — mas a RLS de `campaign_inventory_items`
(migration 0019) só tinha uma policy `for all` owner-only. Resultado:
o botão aparecia para o jogador e sempre falhava silenciosamente por
RLS — exatamente o padrão "backend correto acessível só via /dev"
citado no pedido.

## Correção

`supabase/migrations/0038_crew_inventory_member_access.sql` (aplicada
no projeto real): duas policies novas, restritas por
`is_campaign_member(campaign_id)` —

- **SELECT**: jogador pode LER o bando da própria mesa.
- **INSERT**: jogador pode DEPOSITAR (ação aditiva, sem risco de
  tirar item de outro jogador).

**UPDATE/DELETE continuam exclusivos do narrador** (política
`_owner_all` já existente) — decisão deliberada, não uma omissão: o
pedido pedia explicitamente para não assumir que todo jogador tem
controle total, e retirar item do bando é uma decisão melhor deixada
com o narrador por enquanto.

Também adicionada uma lista somente-leitura do bando na aba Mesa
(`MesaTab.tsx`, compartilhada entre `/dev/character-sheet` e
`/ficha`) — antes o jogador não tinha nenhuma visão do que existe no
bando, só o botão de depositar.

## Limitação conhecida

Depositar **munição** que precisa mesclar com um stack já existente
(`upsertCrewInventoryItem`, ramo `categoria === "municao"`) faz um
UPDATE na linha existente — isso ainda falha por RLS para um jogador
(só SELECT/INSERT foram liberados, não UPDATE). Depositar munição
nova (sem stack prévio) ou qualquer item não-munição funciona. Não
foi resolvido agora porque liberar UPDATE de linha existente para
jogador reabre a pergunta de "jogador pode alterar item que não é
dele" sem uma regra de produto definida — fica documentado, não
consertado às pressas.

Transferência bando→personagem (retirar) e a UI completa de split de
quantidade (`/dev/table`) não foram portadas para a mesa de produção
nesta sessão — permanece uma ferramenta de narrador em `/dev/table`,
o que é consistente com "retirar é decisão do narrador" acima.

## Validação

- `npx tsc --noEmit` e `npm run build`: limpos.
- `get_advisors` (security): nenhum novo achado para
  `campaign_inventory_items`.
- Não verificado em navegador nesta sessão.
