# Checkpoint — Drag operacional Livro → ficha (não implementado nesta sessão)

## Estado

**Não implementado.** Decisão explícita de escopo, não uma tentativa
rasa deixada pela metade.

## Por que ficou de fora

O drag operacional (distinto do drag editorial já concluído na Etapa
11, que só liga capítulo↔conteúdo dentro do editor) exige, para ser
real e seguro — não um enfeite visual:

1. **Contexto de personagem na leitura do Livro.** As rotas
   `/mesas/[campaignId]/livro` e `/livro/[slug]` (Fase 10, esta sessão)
   não sabem qual personagem é o alvo — não têm `characterId`/
   `profileId` na URL nem seletor de personagem ativo. Sem isso, não
   há "ficha" concreta para receber o drop.
2. **Server Action de validação por destino.** Cada destino
   (inventário, magias, talentos, condições, runas) precisa de uma
   ação própria que confirme: conteúdo publicado, permissão do
   chamador sobre aquele personagem, compatibilidade de tipo,
   pré-requisitos (ex.: nível de vertente para magia), campanha
   correta, e que persista só uma referência seguro — nunca o payload
   inteiro vindo do cliente. Os motores de destino já existem
   (`learnSpell`, `acquireTalentLevel`, `purchaseItem`/
   `addInstanceToInventory` — todos já conectados na Fase 3), mas
   nenhum deles hoje é chamável a partir de um evento de drop na
   página do Livro.
3. **UI de alvo válido/inválido nos componentes de destino**
   (`InventoryTab`/`SpellsTab`/`TalentsTab`) — precisam aceitar um
   payload de drop e mostrar o preview/confirmação pedido, algo que
   não existe hoje.

Implementar só a metade visual (atributo `draggable`, `dataTransfer`)
sem o contexto de personagem nem a validação server-side seria
exatamente o tipo de "enfeite sem função real" que este projeto evita
— pareceria pronto sem ser seguro (um clique poderia tentar adicionar
conteúdo de outra campanha, sem checar pré-requisito, etc.).

## O que já está pronto para reaproveitar quando isso for atacado

- Payload canônico já tem um precedente direto: o drag EDITORIAL da
  Etapa 11 (`bookLinkServerActions.ts`/`bookLinksQueries.ts`) já usa
  `{ contentType, slug, capitulo }` validado server-side — o mesmo
  formato (mais `sourceDocumentId`/`campaignId`) serve de base para o
  operacional.
- Os motores de destino (`learnSpell`, `acquireTalentLevel`,
  `purchaseItem`) já são reais e já são usados pelo wizard (Fase 3) —
  só faltaria uma Server Action fina que os chama a partir de um
  payload de drop em vez de uma escolha de formulário.

## Recomendação para a próxima sessão

1. Adicionar `characterId`/`profileId` como query params opcionais nas
   rotas do Livro (mesmo padrão de `/ficha?campaignId=&profileId=`).
2. Uma Server Action por destino compatível (`addSpellFromBook`,
   `addTalentFromBook`, `addItemFromBook`), cada uma revalidando tudo
   listado no item 2 acima antes de chamar o motor real.
3. UI de drop + botão equivalente (nunca só drag) nos componentes de
   destino já existentes.
