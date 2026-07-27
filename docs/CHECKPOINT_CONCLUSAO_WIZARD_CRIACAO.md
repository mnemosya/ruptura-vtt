# Checkpoint — Conclusão do wizard de criação (vertentes, magias, talento, inventário)

Substitui os três placeholders estruturados do wizard
(`CreateCharacterWizardClient.tsx`) por chamadas reais aos motores já
existentes — **nenhum motor foi reimplementado**, só conectado:

- **Etapa 4 (Vertentes)**: `3 pontos entre as 6 vertentes` (PRD 3.2,
  literal — não há contrato em `regras.criacao_personagem` para esse
  número ainda, por isso a constante `PONTOS_VERTENTE_CRIACAO=3` vive
  no componente com essa ressalva documentada). As vertentes em si nunca
  são listadas hardcoded — vêm dos slugs distintos de `magia.vertente`
  entre as magias publicadas na mesa (`listSpellsEffective`), porque
  "vertente" não é um content type próprio no Editor Universal, só uma
  tag em `spell`. Persistido em `character.niveis_vertente`; CD de
  resistência exibida como `6 + nível` (mesma regra já documentada em
  `types.ts`).
- **Etapa 4b (Magias)**: elegibilidade = `estatisticas.nivel <=`
  nível investido na vertente (nunca permite magia acima do nível).
  Escolha real vira `learnSpell(character, slug, nowIso)` — a magia é
  efetivamente aprendida, não um rótulo.
- **Etapa 5 (Talento inicial)**: `acquireTalentLevel(character, {talentoId, nivelId, nivel: 1, nowIso})`
  — grava o registro real de aquisição (`character.talentos_adquiridos`),
  que já alimenta `deriveActiveEffectsFromTalents`/`talentEngine.ts` no
  resto do app.
- **Etapa 6 (Inventário)**: loja real via `purchaseItem` — desconta
  `carteira.aretz_informal`, cria a instância em `inventario[]`, recusa
  compra sem saldo (sem `permitirSaldoInsuficiente`). Restrita a
  raridade `muito_comum`/`comum`/`incomum` (PRD: "até incomum" — o enum
  real do conteúdo tem `muito_comum` abaixo de `comum`, incluído
  corretamente). "Remover" (desfazer compra) devolve o valor pago via
  `removeItemFromInventory` + reembolso manual no componente.
- **Etapa 7 (Revisão)**: mostra vertentes investidas, magias
  conhecidas, talento e inventário reais (não mais rótulos soltos).

## Decisões e limitações conhecidas

- Orçamento de "3 pontos entre 6 vertentes" tratado como obrigatório
  distribuir por inteiro (mesmo padrão de atributos/perícias no mesmo
  wizard) — não há opção de personagem sem nenhuma vertente investida.
  Se o design pretende permitir personagens não-conjuradores, isso
  precisa de uma regra explícita (não inventada aqui).
- Não há limite de "quantidade de magias conhecidas" na criação — o
  PRD não define um número; o jogador pode escolher todas as magias
  elegíveis pelo nível investido.
- `PONTOS_VERTENTE_CRIACAO` é uma constante local, não vem de
  `regras.criacao_personagem` (que não tem esse campo ainda) — se o
  valor mudar, precisa editar código, não conteúdo.
- Draft persistente do wizard continua pendente (Fase 2 já documentou
  isso) — as escolhas de vertente/magia/talento/inventário também se
  perdem se a aba fechar antes de "Criar personagem".

## Validação

- `npx tsc --noEmit` e `npm run build`: limpos.
- Integração dos três motores testada com as fixtures reais de
  conteúdo (`content/db_magias_normalizado_v1_3.json`,
  `db_talentos_normalizado_v1_3.json`,
  `db_equipamentos_normalizado_v1_2.json`) via loader ESM temporário
  (descartado, fora do repo): confirma ≥6 vertentes distintas,
  `learnSpell`/`getKnownVertentes` corretos, `acquireTalentLevel` com o
  mapeamento real `talento_id → talentoId`, `purchaseItem` deduzindo
  carteira e recusando compra sem saldo, `removeItemFromInventory`
  limpando a instância.
- **Não verificado em navegador** nesta sessão (wizard completo ponta
  a ponta com um usuário real) — pendência explícita.

## Atualização — atomicidade e verificação em navegador (rodada de segurança/atomicidade)

Pendência acima fechada: fluxo completo do wizard (identidade,
atributos, vertente) verificado ponta a ponta em navegador real,
incluindo a criação efetiva do personagem via a nova RPC transacional
`complete_character_creation` (migration 0044) — "Personagem ativo"
confirmado imediatamente após "Criar personagem", sem passo
intermediário separado. Ver `CHECKPOINT_SEGURANCA_ATOMICIDADE.md`.
