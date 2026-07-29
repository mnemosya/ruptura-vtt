# Checkpoint — Criação autônoma de personagem pelo jogador (parcial)

## Achado

A RLS de `characters` (migration 0030) **já permitia** um jogador
inserir um personagem vinculado ao próprio perfil reivindicado — mas
duas travas de aplicação impediam qualquer jogador de chegar lá:

1. `/mesas/[campaignId]/personagens/novo/page.tsx` negava acesso a
   qualquer usuário que não fosse `campaign.owner_id` (o narrador).
2. O fluxo real de entrada do jogador (`/join/[token]` →
   `ClaimProfileClient` → `JoinClient`) não tinha nenhum link para a
   página de criação — mesmo sem personagem ativo, o jogador só via
   "Personagem ativo: nenhum", sem next step.

## O que foi corrigido

- `page.tsx`: acesso liberado para o narrador OU para um usuário com
  perfil já reivindicado nesta mesa (`campaign_profiles.user_id`).
  Sem perfil reivindicado, mensagem explica o motivo real ("entre por
  convite e reivindique um perfil"), não mais "mesa não pertence a
  você".
- A lista de perfis passada ao wizard, para um jogador, é restrita ao
  próprio perfil (nunca a lista completa da mesa) — a seleção fica
  travada (`travarSelecaoDePerfil`), sem opção de escolher perfil
  alheio (defesa em profundidade: a RLS de `campaign_profiles`/
  `characters` já bloqueava a gravação, mas a UI não devia nem oferecer).
- `JoinClient.tsx`: link "Criar personagem" aparece no próprio perfil
  do jogador quando ele não tem personagem ativo (só na variante
  `invite`, nunca no `/dev/join` legado do narrador).

## Ainda NÃO coberto neste checkpoint (fases seguintes)

- **Draft persistente** (PRD "salvar e sair / retomar / cancelar"): o
  wizard continua em `useState` puro — fechar a aba perde tudo. Exige
  schema novo (rascunho por usuário+mesa) — fica para quando a Fase 3
  (conclusão do wizard) for atacada, para não duplicar o desenho do
  draft antes de saber o formato final dos dados de vertentes/magia/
  inventário que ele precisa guardar.
- **Detecção de duas abas/conflito**: não implementada (consequência
  direta de não haver draft persistente ainda).
- **Personagem duplicado**: nenhuma trava explícita impede um jogador
  de criar um segundo personagem para o mesmo perfil — falta decidir
  a regra de produto (permitir vários? bloquear um segundo enquanto o
  primeiro está ativo?) antes de implementar enforcement.

## Validação

- `npx tsc --noEmit`: sem erros.
- `npm run build`: sucesso.
- **Não verificado em navegador** nesta sessão (dois usuários reais,
  um convite de verdade) — pendência explícita.

## Observação de segurança (fora de escopo desta correção)

`characters_authenticated_insert` (migration 0030) aceita
`owner_id = auth.uid()` como condição alternativa independente de
`campaign_id`/membership — como `insertCharacterScoped` sempre grava
`owner_id` do usuário logado, qualquer usuário autenticado pode inserir
um personagem apontando para um `campaign_id` de UMA CAMPANHA QUE NÃO
É SUA (não é impedido pela RLS, só não é feito porque a UI de produto
não oferece esse caminho hoje). Não foi alterado nesta sessão — mudar
essa policy tem risco de quebrar fluxos legados que dependem dela
(personagens sem mesa, migração de personagens antigos). Recomendo
auditoria dedicada antes de mexer.

## Atualização — idempotência (rodada de fechamento)

"Personagem duplicado" (pendência acima) fechado: índice único parcial
(`profile_id`, `campaign_id`) para personagens não arquivados
(migration 0041) — duplo-clique/retry-de-rede agora recebe erro
controlado em vez de criar um segundo personagem órfão. Ver
`CHECKPOINT_FECHAMENTO_CONCORRENCIA_ISOLAMENTO.md`.

## Atualização — atomicidade transacional (rodada de segurança/atomicidade)

Criação+vínculo ativo agora é UMA transação SQL só
(`complete_character_creation`, migration 0044) — nunca mais duas
chamadas separadas. Idempotência real via chave de requisição
opcional. Provado ao vivo (SQL + navegador real). Ver
`CHECKPOINT_SEGURANCA_ATOMICIDADE.md`.

## Atualização — auditoria de materialização (rodada de fechamento seguinte)

Confirmado por leitura do schema real (sem tabelas relacionais para
itens/magias/talentos/carteira — tudo em `characters.payload` jsonb):
a RPC `complete_character_creation` já materializa 100% do estado do
personagem numa única transação; nenhuma gravação acontece depois.
`regras` (orçamento) agora é buscado no servidor, não mais confiado ao
argumento do cliente. Gap real e distinto, não fechado: validação de
LEGITIMIDADE de conteúdo (magia/talento/item/preço publicados) — a RPC
aceita slugs inexistentes e saldo fabricado, confirmado ao vivo. Ver
`CHECKPOINT_FECHAMENTO_CONVITES_LOGS_ATOMICIDADE.md`.

## Atualização — validação canônica fechada (rodada seguinte)

O gap acima foi fechado: `complete_character_creation` (migration
0046) resolve cada magia/talento/item pelo MESMO resolvedor efetivo já
usado pelo wizard/ficha (`resolveEffectiveOne`, réplica SQL fiel) e
rejeita qualquer referência inexistente, arquivada, de outra campanha,
com preço/saldo adulterados. Provado ao vivo (48/48 checagens hostis +
browser real). Ver `CHECKPOINT_VALIDACAO_CANONICA_CRIACAO.md`.
