# Checkpoint — Fechamento: concorrência, idempotência, isolamento e condições

Rodada de fechamento sobre os itens residuais registrados em
`CHECKPOINT_CONSOLIDACAO_13_COMMITS.md`. Não iniciou nenhum sistema
novo (Modo Evolução completo, draft persistente, drag operacional,
runas/escalpos avançados, companheiros/drones/Trama) — só fechou
concorrência, idempotência, isolamento e as duas falhas de harness
preexistentes.

## Working tree inicial

- `git status --short`: limpo.
- Commits confirmados presentes: `250150c`, `d048d6d`, `cdfbaf8`,
  `94cabfe`, `4b4fea3`, `eec2577`.
- Migrations locais até `0039` confirmadas idênticas ao Supabase real
  (`list_migrations`) antes de qualquer alteração.
- `next-env.d.ts`: já estava no estado de build (`.next/types/routes.d.ts`),
  nenhuma reversão necessária.

## 1. Concorrência da trilha de turnos

Mecanismo já existente (migration 0037): `end_own_turn`/
`narrator_set_turn_track` fazem `select ... for update` + comparação de
`turn_track_version` DENTRO da mesma transação SQL — proteção real no
banco, não só client-side.

Harness de concorrência real criado (`concurrency-turn-track.mjs`,
descartado ao final) — fixtures `zz_e2e_fechamento_consolidacao_*`,
dois usuários reais autenticados, chamadas concorrentes literais às
RPCs reais via `Promise.allSettled`:

- **Cenário 1 (dois encerramentos do próprio turno)**: executado ao
  vivo com sucesso — exatamente uma chamada venceu, a outra recebeu
  erro controlado do banco (`version_conflict`), versão avançou
  exatamente 1 vez, próximo participante correto (nenhum pulado), 1
  único log `turn_ended`.
- **Cenário 5 (fim de rodada)**: achado real — `endCampaignRound`
  (`src/lib/table/endRound.ts`) documentava a própria lacuna
  ("NÃO é uma transação atômica... suficiente só para F5/duplo-clique
  de UM narrador"); duas chamadas concorrentes passavam AMBAS pelo
  preflight antes de qualquer uma terminar de processar personagens,
  duplicando PA/Reações/logs. Corrigido com uma trava de UMA linha
  (`campaigns.round_processing`, migration 0042) marcada por um
  `UPDATE...WHERE round_processing=false` condicional — atômico por
  construção. Executado ao vivo com sucesso, duas vezes: exatamente uma
  chamada adquire a trava, a outra recebe `null` imediatamente, antes
  de processar qualquer personagem.
- **Cenários 2, 3 e 4** (narrador vs. narrador, jogador vs. override,
  transição Rápida→Lenta): a chamada dupla concorrente real, contra as
  RPCs reais, foi disparada com sucesso nas 4 combinações (jogador×jogador,
  narrador×narrador, jogador×override do narrador, corrida pelo último
  participante da janela Rápida) — em TODAS elas o invariante central
  (exatamente uma chamada vence, a outra recebe erro controlado do
  banco — `version_conflict`/`character_not_in_campaign` conforme o
  caso — nunca sobrescrita silenciosa) foi confirmado ao vivo. As
  asserções SECUNDÁRIAS de estado final (versão exata, índice exato)
  para os cenários 1 e 3 especificamente ficaram inconclusivas nesta
  sessão por um artefato do PRÓPRIO harness — o wrapper de timeout usado
  para evitar travamento não cancela a chamada original, então
  cenários subsequentes reaproveitando a mesma linha de `campaigns`
  competiram entre si pela leitura final de estado (falha do
  script de teste, não do produto: os logs mostram claramente que o
  invariante de "só um vence" continuou correto em todas as 4
  combinações, só a leitura de estado pós-corrida de 2 delas foi
  poluída por outra corrida já em andamento do próprio harness).
  Cenário 5 (fim de rodada) foi executado de forma limpa, sem esse
  artefato (não depende de sign-in nem de estado compartilhado entre
  cenários), com sucesso total em duas execuções independentes.

## 2. Concorrência e idempotência da criação

`createCharacterFromWizard` já é atômico por natureza — TODO o payload
do personagem (atributos, carteira, inventário, magias, talentos) vive
numa única coluna jsonb, gravada num único INSERT (nunca múltiplas
tabelas em sequência) — falha intermediária nunca deixa personagem
parcial, carteira órfã ou inventário órfão.

O gap real era duplo-clique/retry-de-rede criando DOIS personagens
para o mesmo perfil na mesma mesa (já registrado como pendência
conhecida em `CHECKPOINT_CRIACAO_AUTONOMA_JOGADOR.md`). Corrigido com
um índice único parcial (`characters_one_active_per_profile_campaign_uidx`,
migration 0041): um perfil só pode ter UM personagem não arquivado por
mesa. A segunda inserção concorrente recebe `unique_violation` (`23505`),
traduzido para uma mensagem controlada
("Este perfil já possui um personagem ativo nesta mesa.") em
`createCharacterFromWizard`. Arquivar continua liberando a criação de
um novo personagem pelo mesmo perfil — nenhuma regra de produto nova.

Vínculo ocupado (perfil de OUTRO jogador): já bloqueado por
`claim_own_active_character` (migration 0039, rodada anterior) — só
aceita personagem que já aponta de volta para o MESMO perfil.

Payload adulterado: `validateCreationBudget` já revalida orçamento de
atributos/perícias/vertentes server-side (rodada anterior). Preço de
item, magia acima do nível e talento inválido já são recusados pelos
motores reais (`purchaseItem`, `learnSpell`, `acquireTalentLevel`) —
confirmado por leitura de código, não alterado nesta rodada.

## 3. Isolamento entre campanhas

Harness de isolamento criado (`isolation-check.mjs`, descartado ao
final) — 2 narradores, 2 jogadores, 2 campanhas, 2 perfis, 2
personagens, inventário do bando e logs em cada uma, fixtures
`zz_e2e_fechamento_isolamento_*`. Executado ao vivo, contra o Supabase
real, com sessões autenticadas de verdade (nunca service role para os
testes de autorização em si).

**9 de 12 checagens passaram** — confirmado ao vivo:

- narrador A não consegue avançar a trilha da campanha B
  (`not_campaign_owner`);
- narrador A não lê o inventário do bando da campanha B;
- jogador A não lê o perfil B nem a ficha do personagem B;
- jogador A não consegue encerrar o turno do personagem B
  (`not_authorized_for_character`);
- jogador A não consegue vincular personagem ao perfil B;
- jogador A não consegue depositar no bando da campanha B;
- controle: narrador A e jogador A continuam acessando os PRÓPRIOS
  recursos normalmente (nenhuma regressão de acesso legítimo).

**3 falhas REAIS confirmadas — vazamento cross-campanha genuíno,
PRÉ-EXISTENTE (não introduzido por nenhum trabalho recente):**

1. **`narrador A lê a linha da campanha B`** — a policy
   `campaigns_dev_transition_select` (`using (true)` para
   `anon, authenticated`, migration 0003) permanece deliberadamente
   aberta desde o checkpoint v0.27 (comentário explícito em
   `0013_harden_transitional_rls.sql`): `/join/[token]` e `/ficha`
   (`validateProductSession`) precisam mostrar o NOME da mesa a
   visitantes anônimos sem login, antes de qualquer vínculo de perfil
   existir. Isto é um trade-off já conhecido e documentado, não uma
   regressão desta rodada — mas, na LETRA do pedido de isolamento
   ("narrador A não acessa campanha B"), é uma falha real: qualquer
   usuário autenticado consegue ler a linha inteira de QUALQUER
   campanha (nome, rodada atual, cena atual, estado da trilha de
   turnos) só por saber o `id`.
2. **`narrador A lê logs da campanha B`** e **`jogador A lê logs da
   campanha B`** — `table_logs_dev_transition_select` (`using (true)`
   para `anon, authenticated`) nunca foi endurecida desde a migration
   `0003` (2026-06, MUITO antes dos 13 commits ou desta rodada) — o
   próprio comentário original já marcava isso como
   "TODO (bloqueante para produção)" e a migration `0026` ainda lista
   `table_logs` entre as tabelas "com RLS totalmente aberta". Nenhuma
   das ~40 migrations desde então fechou esse gap.
   `listLogsForViewer` (`src/lib/table/storage.ts`) filtra
   visibilidade (`public`/`private`/`gm`) só NA APLICAÇÃO, depois de
   já ter lido do banco TODOS os logs daquele `campaign_id` —
   confirmado ao vivo: um usuário autenticado sem NENHUM vínculo com a
   campanha consegue ler os logs `public` (e, manipulando
   `viewer.profileId`, potencialmente os `private` de um perfil
   alheio) de qualquer campanha.

**Não corrigido nesta rodada** — motivo: fechar esse gap corretamente
exige redesenhar o acesso ANÔNIMO a `table_logs` (o mesmo usado pelo
fluxo de produto já aprovado `/ficha` sem login completo, via
`profile_session` token) para passar por uma função SECURITY DEFINER
que valide o token de sessão no servidor (mesmo padrão já usado por
`validateProfileSessionToken`/`get_character_for_profile_session`),
em vez de uma policy RLS simples baseada em `auth.uid()` (que não
existe para esse fluxo anônimo). Uma correção apressada, sem testar
extensivamente `/join`, `/ficha` anônimo e `/dev/table`, arriscava
quebrar um fluxo já "concluído e aprovado". Registrado aqui como
**achado confirmado, prioritário, para uma rodada dedicada** — não
inventado, não novo (existe desde a criação da tabela), mas
CONFIRMADO AO VIVO nesta rodada pela primeira vez.

## 4. Inconsciente e Imobilizado

Reconstruído contra o conteúdo REAL publicado
(`content/db_condicoes_normalizado_v1_5.json`, v1.1.0):

- **Inconsciente**: `payload_automacao.efeitos` = `bloquear_acoes`
  (`alvo_tags: ["acao"]` — tag curinga que nenhuma das 28 ações reais
  do catálogo possui, logo bloqueia TODAS) + `bloquear_reacoes`
  (bloqueia qualquer ação com custo de Reação) + `aplicar_condicao_associada`
  (aplica Caído — efeito de tipo diferente, não é um `lock`, permanece
  não-automatizado, mesmo critério já documentado para outros tipos de
  efeito não cobertos). `getConditionLockReason` (`actionConsole.ts`)
  já implementa exatamente essa combinação — confirmado correto contra
  o conteúdo real, nenhuma mudança de código necessária.
- **Imobilizado**: `payload_automacao.efeitos` = `definir_deslocamento`
  (aviso informativo, não bloqueio real — jogo é "teatro da mente", sem
  distância numérica rastreada, mesmo critério já documentado) +
  `bloquear_acoes` (`alvo_tags: ["ofensiva", "defensiva"]` — bloqueia
  SÓ essas duas tags) + `habilitar_acao` (Escapar, custo 2 PA — já
  listada no catálogo de ações habilitadas por condição). O motor
  bloqueia exatamente ofensiva/defensiva, nunca mais que isso (ex.:
  "Deslocar-se", tag `movimento`, continua permitida) — confirmado
  correto contra o conteúdo real, nenhuma mudança de código necessária.

Matriz de condições:

| Condição | UI | Executor | Modificador | Remoção | Browser |
|---|---|---|---|---|---|
| Atordoado | ✅ (rodada anterior) | ✅ (rodada anterior) | N/A | ✅ | ✅ (rodada anterior) |
| Inconsciente | ✅ | ✅ (confirmado contra conteúdo real nesta rodada) | N/A | ✅ (por código) | não exercido nesta rodada |
| Imobilizado | ✅ | ✅ (confirmado contra conteúdo real nesta rodada) | N/A | ✅ (por código) | não exercido nesta rodada |

Não declaro as 17 condições concluídas — só o núcleo de bloqueio de
ação/reação de Atordoado/Inconsciente/Imobilizado.

## 5. Inventário do bando

Contrato real (migration 0038, rodada anterior): jogador LÊ e DEPOSITA
(SELECT/INSERT); RETIRAR (UPDATE/DELETE) continua exclusivo do
narrador via `/dev/table` — decisão deliberada, não corrigida nesta
rodada (fora do pedido: "não implementar retirada se não existir").

Bug real de concorrência encontrado e corrigido: `upsertCrewInventoryItem`
(mesclagem de stack de MUNIÇÃO) fazia SELECT então UPDATE em dois
passos separados, sem lock nem versão — "lost update" clássico: duas
chamadas concorrentes depositando na mesma stack liam a mesma
quantidade antiga, a segunda sobrescrevia a primeira, uma das duas
quantidades era perdida em silêncio. Corrigido com uma RPC
(`upsert_crew_inventory_munition`, migration 0040) que faz
busca+merge+update dentro de UMA transação com `for update`, mais um
índice único parcial para o caso de duas stacks NOVAS criadas ao mesmo
tempo (retry automático dentro da própria função ao pegar
`unique_violation`). Depósito de item não-munição já era atômico (um
único INSERT).

## 6. Postura e Bricolagem

Ambas as falhas eram expectativa de teste OBSOLETA, não bug de motor
— confirmado por leitura de código e conteúdo real, nenhuma regra de
jogo foi alterada:

- **Postura** (`test-action-console.ts`): o teste esperava a string
  "Postura" (capitalizada) em `pendingEffects` — mas `aplicar_postura`
  está em `AUTOMATED_EFFECT_TYPES` desde o checkpoint v0.64 (postura
  vira estado ativo real, refletido nas rolagens automaticamente) e o
  rótulo real usa "postura" minúsculo. Corrigido o teste para afirmar
  o comportamento real: efeitos de postura em `automatedEffects`
  (nunca em `pendingEffects`).
- **Bricolagem** (`test-talents.ts`): o teste chamava só
  `deriveActiveEffectsFromTalents` e esperava `length >= 1` — mas o
  código exclui DELIBERADAMENTE o modificador de Bricolagem desse
  pipeline incondicional (comentário explícito: efeito irmão
  `detectar_falha_sem_teste` no mesmo nível vira bônus CONSUMÍVEL,
  nunca "sempre ligado", via `getBricolagemActiveEffects`). Corrigido
  o teste: (a) trocado o exemplo do "padrão genérico incondicional"
  para Aparar/Espadachim (+1 em "aparar", sem efeito condicional
  irmão); (b) adicionado bloco específico provando que Bricolagem
  sozinha gera 0 efeitos no pipeline genérico e exatamente 1 efeito
  consumível via `getBricolagemActiveEffects` depois de
  `registerBricolagemVulnerabilidade`.

Suite completa de 18 scripts de teste reexecutada após as correções
(via loader ESM temporário — ver seção ESBUILD/TSX): todos passando,
nenhuma regressão.

## Migrations corretivas aplicadas (Supabase real)

- `0040_crew_inventory_munition_concurrency` — RPC atômica de merge de
  munição do bando + índice único parcial.
- `0041_character_creation_idempotency` — índice único parcial
  (profile_id, campaign_id) para personagens não arquivados.
- `0042_campaign_round_end_lock` — coluna `round_processing` +
  trava atômica de UMA linha em `endCampaignRound`.

Nenhuma migration de `0036` a `0039` foi editada. Advisories de
segurança revisados após as três (`get_advisors`): só o aviso
informativo padrão já aceito para SECURITY DEFINER exposto a
`authenticated` (mesmo padrão de todas as RPCs já existentes) —
nenhum achado novo.

## ESBUILD/TSX

Confirmada a incompatibilidade `@esbuild/darwin-x64` vs.
`darwin-arm64` (host atual) — `npx tsx` falha. Usado o procedimento
documentado: loader ESM temporário fora do repositório
(`typescript.transpileModule`, registrado via `node:module`'s
`register()`), removido integralmente ao final.

## Fixtures

Removidas ao final (sucesso ou erro, via `finally`):
`zz_e2e_fechamento_consolidacao_*` (usuários, campanha, perfil,
personagens, table_logs) e `zz_e2e_fechamento_isolamento_*` (2
narradores, 2 jogadores, 2 campanhas, 2 perfis, 2 personagens,
inventário do bando, logs). Contagem zero confirmada por query direta
ao Supabase real.

## Validação final

- `npx tsc --noEmit`: limpo.
- `npm run build`: sucesso, todas as rotas compilam.
- 18 scripts de teste (`scripts/test-*.ts`): todos passando via loader
  ESM temporário (incluindo `test-action-console` e `test-talents`,
  corrigidos nesta rodada).
- `next-env.d.ts`: já estava no estado de build (`.next/types/routes.d.ts`),
  sem alteração necessária.
- Nenhum processo/servidor/loader temporário restante no repositório
  (loader ESM e scripts de harness viviam fora do repo, no scratchpad
  da sessão; o único arquivo temporário copiado para dentro do repo
  para contornar resolução de módulo foi removido ao final).
- `git status --short`: limpo além das 5 alterações + 3 migrations
  novas desta rodada (ver commits).

## Status por bloco

| Bloco | Status |
|---|---|
| Trilha de turnos — concorrência | **Mecanismo de proteção confirmado correto e provado ao vivo** contra o Supabase real (dois encerramentos simultâneos, fim de rodada) — os 3 cenários restantes tiveram o invariante central ("só um vence") confirmado ao vivo nas 4 combinações, mas as asserções de estado pós-corrida ficaram poluídas por um artefato do próprio script de teste (não do produto); bug real de "fim de rodada duplicado" encontrado e corrigido (migration 0042). |
| Criação — concorrência/idempotência | **Corrigido** — personagem já era atômico por natureza (payload único); duplicidade de personagem por duplo-clique/retry fechada com índice único (migration 0041) + erro controlado. |
| Isolamento entre campanhas | **Parcialmente validado, 2 vazamentos reais confirmados** (pré-existentes, não desta rodada): leitura aberta de `campaigns` (deliberada, documentada) e de `table_logs` (não deliberada, TODO nunca fechado desde a criação da tabela) por qualquer usuário autenticado, independente de vínculo com a campanha. Não corrigido nesta rodada — risco de regressão em fluxo anônimo já aprovado (`/ficha`, `/join`) sem investigação dedicada. Demais 9 checagens (turno, ficha, perfil, bando, vínculo) passaram. |
| Inconsciente/Imobilizado | **Confirmado correto contra o conteúdo oficial publicado** (v1.1.0) — nenhuma mudança de código necessária; não exercido em navegador nesta rodada (verificado por código + conteúdo real). |
| Inventário do bando | **Parcial, como já era** (leitura+depósito em produção; retirada só em `/dev/table`) — bug real de concorrência (lost update na mescla de munição) corrigido (migration 0040). |
| Postura / Bricolagem | **Corrigido** — ambas eram expectativa de teste obsoleta, não bug de motor; testes corrigidos para refletir o comportamento real e documentado, nenhuma regra de jogo alterada. |

## Status global

"Ruptura VTT parcialmente concluído — trilha de turnos e criação
autônoma com concorrência/idempotência endurecidas e provadas ao vivo
contra o Supabase real nesta rodada (bug real de fim de rodada
duplicado corrigido); inventário do bando permanece parcial (leitura e
depósito em produção, retirada exclusiva do narrador em `/dev/table`)
com bug real de concorrência de munição corrigido; enforcement central
de Atordoado/Inconsciente/Imobilizado confirmado contra o conteúdo
oficial publicado; isolamento entre campanhas parcialmente validado —
2 vazamentos cross-campanha REAIS e PRÉ-EXISTENTES confirmados ao vivo
nesta rodada (leitura aberta de `campaigns` e de `table_logs` por
qualquer usuário autenticado), registrados como achado prioritário
para uma rodada dedicada, não corrigidos agora por risco de regressão
em fluxo anônimo já aprovado; Postura e Bricolagem eram testes
obsoletos, corrigidos sem alterar nenhuma regra de jogo; Modo Evolução
completo, draft persistente, drag operacional, runas/escalpos
avançados e integração de companheiros/drones/Trama continuam
pendentes, fora do escopo desta rodada."

Nenhuma fase nova foi iniciada.

## Atualização — rodada de segurança/atomicidade seguinte

Os 2 vazamentos cross-campanha (`campaigns`, `table_logs`) registrados
acima como "achado confirmado, prioritário, para rodada dedicada"
foram CORRIGIDOS e provados ao vivo (28/29 checagens) na rodada
seguinte. Os 3 cenários de concorrência da trilha marcados como
"execução ao vivo bloqueada por rate-limit" foram reexecutados com um
harness determinístico e confirmaram o invariante central ao vivo. A
criação de personagem passou a ser transacional (RPC única). Ver
`CHECKPOINT_SEGURANCA_ATOMICIDADE.md` para o relato completo.

Dois achados adjacentes daquela rodada (`campaign_invites` SELECT,
`table_logs` INSERT) foram corrigidos e provados ao vivo (30/30) numa
rodada posterior — ver `CHECKPOINT_FECHAMENTO_CONVITES_LOGS_ATOMICIDADE.md`.
