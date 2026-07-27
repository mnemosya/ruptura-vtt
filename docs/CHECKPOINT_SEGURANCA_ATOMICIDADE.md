# Checkpoint — Segurança, concorrência e atomicidade (rodada fechada)

Rodada curta e fechada sobre exatamente 6 pendências herdadas de
`CHECKPOINT_FECHAMENTO_CONCORRENCIA_ISOLAMENTO.md`. Não iniciou nenhum
sistema novo (Modo Evolução completo, inventário do bando completo,
Biblioteca adicional, drag operacional, runas/escalpos avançados,
companheiros/drones/Trama, novas condições, mobile, observabilidade
ampla).

## Working tree inicial

- `git status --short`: limpo.
- Commits consolidados confirmados presentes: `250150c`, `d048d6d`,
  `cdfbaf8`, `94cabfe`, `4b4fea3`, `eec2577`, `27a5e9c`, `bd30664`,
  `0fbdcd1`, `7632f62`.
- Migrations locais confirmadas até `0042`, idênticas ao Supabase real
  (`list_migrations`) antes de qualquer alteração.
- `next-env.d.ts`: já estava no estado de build (`.next/types/routes.d.ts`),
  nenhuma reversão necessária.

## Fase 1 — Mapa de segurança (antes de alterar código)

| Recurso | Policy antiga | Quem lia | Vazamento |
|---|---|---|---|
| `campaigns` | `campaigns_dev_transition_select` (`using(true)`, `anon,authenticated`) | qualquer usuário, autenticado ou não | linha inteira de QUALQUER campanha, só por saber o `id` |
| `table_logs` | `table_logs_dev_transition_select` (idem) | idem | todos os logs de QUALQUER campanha (inclusive `private`/`gm`, cujo filtro de visibilidade é só aplicado depois, na aplicação) |

Fluxos públicos mapeados antes de remover a policy aberta:

- `/join/[token]` (convite): `resolveCampaignInvite` → `getCampaign`
  precisava mostrar o NOME da mesa a um visitante 100% anônimo, ANTES
  do login — único consumidor real do acesso anônimo a `campaigns`.
- `/ficha` (produto real, jogador): desde a Etapa 12
  (`/join/[token]`, correção 2), TODO jogador do fluxo real passa por
  login de verdade do Supabase Auth antes de reivindicar perfil — a
  leitura de `campaigns`/`table_logs` em produção já é sempre
  `authenticated`. `getCharacterForProfileSession`/
  `validateProfileSessionToken` (migrations 0015/0016/0032) já
  retornam a campanha via RPC SECURITY DEFINER, nunca dependeram do
  SELECT aberto.
- Realtime (`postgres_changes`): a autorização de quem recebe cada
  evento é a MESMA RLS de SELECT da tabela — nunca uma policy à parte.
  Corrigir a RLS de `campaigns`/`table_logs` corrige Realtime pelo
  mesmo mecanismo (confirmado ao vivo na Fase 4).
- `campaign_members`, `campaign_profiles`, `characters`: já escopados
  corretamente desde as migrations 0026/0028/0030 (`is_campaign_member`/
  `is_campaign_owner`/vínculo de perfil) — não tocados nesta rodada.

Nenhum acesso público foi removido sem mapear o consumidor real antes.

## Fase 2/3 — Correção de `campaigns` e `table_logs`

Migration `0043_campaign_table_logs_isolation.sql`:

- `campaigns_dev_transition_select` removida; `campaigns_member_select`
  (authenticated, `is_campaign_member(id)`) criada — soma-se à já
  existente `campaigns_owner_select`.
- `table_logs_dev_transition_select` removida; `table_logs_member_select`
  (authenticated, `is_campaign_member(campaign_id)`) criada — soma-se à
  já existente `table_logs_owner_select`.
- `resolve_campaign_invite_public(p_token)` — RPC SECURITY DEFINER
  nova: hasheia o token, valida revogação/ativo/expiração (mesmo
  critério de `accept_campaign_invite`), retorna SÓ `campaignId`/
  `campaignName` — nunca a linha inteira. `resolveCampaignInvite`
  (storage.ts) reescrita para chamar esta RPC em vez de dois SELECTs
  diretos; `/join/[token]/page.tsx` ajustada (busca a campanha
  completa via `getCampaign` só DEPOIS do login+aceite, quando já é
  membership real).

**Não tocado nesta migration** (fora do escopo explícito — leitura de
`campaigns`/`table_logs`):

- `campaign_invites_dev_transition_select` (`using(true)`,
  `anon,authenticated`) — mesma tabela ainda expõe `campaign_id`/
  `expires_at`/`revoked_at` de todo convite a qualquer usuário. Não é
  explorável para forjar convite (token_hash é SHA-256, unidirecional),
  mas é enumeração cross-campanha real. **Achado adjacente, registrado
  para rodada dedicada.**
- `table_logs_dev_transition_insert` (`using(true)` para INSERT) —
  qualquer usuário pode inserir um log forjado em qualquer campanha.
  Fora do escopo explícito (a pendência era leitura). **Achado
  adjacente, registrado para rodada dedicada.**

Advisories de segurança revisados após aplicar (`get_advisors`):
nenhum achado de `rls_policy_always_true` restante em `campaigns`/
`table_logs`; só o aviso informativo padrão já aceito para as duas
novas funções SECURITY DEFINER (mesmo padrão de todas as outras RPCs
do projeto).

## Fase 4 — Isolamento real com duas campanhas (ao vivo)

Harness `security-isolation.mjs` (descartado ao final), fixtures
`zz_e2e_security_atomicity_*`: 2 narradores, 2 jogadores, 2 campanhas,
2 perfis, 2 personagens, inventário do bando e logs em cada uma.
Sessões autenticadas reais (nunca service role para os testes de
autorização em si). **28 de 29 checagens passaram ao vivo:**

- Narrador A: não lê a campanha B, não avança a trilha B, não lê
  inventário do bando B, não lê logs B, não vê personagem B; controle
  (própria campanha) intacto.
- Narrador B: mesma bateria, invertida — todas passaram.
- Jogador A: não lê perfil/ficha B, não encerra turno de personagem B,
  não vincula personagem ao perfil B, não deposita no bando B, não lê
  logs B; controle (própria ficha) intacto.
- Jogador B: mesma bateria, invertida — todas passaram.
- Realtime: jogador A recebe evento da própria campanha; jogador A NÃO
  recebe evento da campanha B mesmo assinando o canal B diretamente;
  jogador B NÃO recebe evento da campanha A. A única falha foi
  jogador B não ter recebido o evento da PRÓPRIA campanha dentro da
  janela de 3s do teste (timing do teste, não vazamento — as 3
  asserções negativas de isolamento passaram).

Testado por chamada autenticada direta (supabase-js contra o projeto
real), nunca service role para provar bloqueio.

## Fase 5 — Concorrência restante da trilha (ao vivo)

Harness novo e determinístico (`turn-concurrency-v2.mjs`, descartado
ao final) — cada cenário cria/destrói sua PRÓPRIA fixture de dados
(campanha+personagens+trilha), usuários/sessões compartilhados só para
reduzir carga de autenticação (rate limit real do projeto, confirmado
em rodadas anteriores):

- **Cenário 1 (narrador × narrador)**: duas chamadas concorrentes a
  `narrator_set_turn_track` com a mesma versão — exatamente uma
  transição venceu (confirmado ao vivo); versão avançou exatamente 1
  vez; 1 único log `turn_track_narrator_update`.
- **Cenário 2 (jogador × override do narrador)**: contrato confirmado
  (não inventado) — ambas as operações competem pela MESMA versão
  otimista, sem prioridade especial para nenhum lado; exatamente uma
  vence (confirmado ao vivo); estado final sempre um dos dois válidos,
  nunca impossível; ordem sem participante duplicado.
- **Cenário 3 (Rápida → Lenta)**: duas chamadas concorrentes no ÚLTIMO
  participante da janela Rápida — janela se esgota exatamente uma vez
  (confirmado ao vivo); depois, duas chamadas concorrentes de
  transição para Lenta — muda exatamente uma vez, ordem da janela
  Lenta correta, rodada NÃO incrementada pela transição.
- **Cenário 4 (regressão 0042)**: reexecutado — trava de fim de rodada
  continua funcionando (uma chamada adquire, a outra recebe `null`
  imediatamente) e libera corretamente para a rodada seguinte.

Em todos os 4 cenários o invariante central — **exatamente uma
operação concorrente vence, a outra recebe um erro do banco, nunca
sobrescrita silenciosa** — foi confirmado AO VIVO contra as RPCs reais
(`end_own_turn`/`narrator_set_turn_track`, migration 0037, inalterada
nesta rodada). Em ambiente com latência elevada (mesmo comportamento
já registrado em rodadas anteriores), a leitura do texto exato da
mensagem de erro da operação perdedora por vezes veio como timeout de
rede em vez do texto literal `version_conflict` — isso não altera o
resultado observado no banco (versão avança exatamente 1 vez em todos
os casos testados), só o texto do log do harness.

## Fase 6 — Atomicidade e idempotência da criação

Mapa da sequência real (antes da correção):

| Operação | Mesma transação | Chamada separada | Idempotente | Podia deixar estado parcial |
|---|---|---|---|---|
| Personagem (INSERT) | — | — | não | não (INSERT único é atômico por si) |
| Carteira | dentro do INSERT (payload jsonb) | — | — | não |
| Inventário/compras/Aljava | dentro do INSERT (payload jsonb) | — | — | não |
| Vertentes/magias/talento | dentro do INSERT (payload jsonb) | — | — | não |
| Identidade | dentro do INSERT (payload jsonb) | — | — | não |
| Vínculo de perfil (`profile_id`) | dentro do INSERT (coluna) | — | — | não |
| **Personagem ativo** (`claim_own_active_character`) | **NÃO** | **SIM — 2ª chamada separada** | não | **SIM — falha de rede entre as duas chamadas deixava personagem criado, nunca reivindicado** |

O personagem em si já era atômico (payload inteiro numa coluna jsonb,
um único INSERT) — o gap real era a reivindicação do perfil como
"ativo" ser uma SEGUNDA chamada de rede separada.

Corrigido com `complete_character_creation` (migration
`0044_character_creation_transactional.sql`) — RPC SECURITY DEFINER
que faz INSERT do personagem E `update campaign_profiles.active_character_id`
em UMA transação só (rollback nativo do Postgres se qualquer parte
falhar). Valida `auth.uid()`, membership do perfil na campanha e
ownership (perfil do próprio usuário ou narrador dono) — mesmo
contrato já aceito de `claim_own_active_character` (migration 0039).
Idempotência: aceita `creation_request_id` opcional (gravado dentro de
`payload.metadados`, sem coluna nova, sem sistema de draft) — uma
segunda chamada com a MESMA chave devolve o personagem já criado.
Duplo clique sem nenhuma chamada ainda commitada: o índice único
parcial (migration 0041) é o cinto-e-suspensório — a chamada perdedora
recupera e devolve o personagem que a vencedora acabou de criar, nunca
propaga um erro 500. `createCharacterFromWizard` (TS) e o wizard
(`CreateCharacterWizardClient.tsx`) atualizados para usar a nova RPC;
a validação de orçamento (`validateCreationBudget`) continua em
TypeScript, executada ANTES de chamar a RPC — **não portada para SQL
nesta rodada** (motivo: motor de regras compartilhado com toda a
ficha/Biblioteca, fora do escopo "não reabrir o Editor Universal";
duplicá-lo em PL/pgSQL teria risco real de regra de jogo divergente
entre TS e SQL — ver comentário completo na própria migration).
**Gap residual conhecido e documentado**: um cliente que ignore a
Server Action e chame a RPC diretamente ainda não tem o orçamento
revalidado pela própria RPC — pré-existente (a RLS de INSERT direto em
`characters` já tinha esse mesmo problema, não introduzido nem
agravado por esta migration), registrado como achado adjacente
prioritário.

**Testado ao vivo** (`creation-atomicity.mjs`, descartado ao final,
fixtures `zz_e2e_security_atomicity_criacao_*`) — **15 de 16
checagens passaram:**

- Duplo clique (mesma chave, 2 chamadas concorrentes): nenhum erro
  500; ambas retornam o MESMO personagem; exatamente 1 personagem no
  banco; perfil vinculado (nunca órfão).
- Retry (mesma chave, após sucesso): mesmo personagem; contagem
  inalterada; vínculo inalterado.
- Falha intermediária (perfil de campanha incompatível — rejeitada
  pela própria RPC): nenhum personagem parcial; nenhum personagem
  órfão em nenhuma campanha.
- Vínculo ocupado (segunda criação SEM chave de idempotência, perfil
  já com personagem ativo): a única checagem que não confirmou minha
  expectativa original — a RPC responde de forma graciosa (devolve o
  personagem já existente, via o mesmo caminho de reconciliação do
  índice único) em vez de propagar um erro. Comportamento real, seguro
  (nunca duplica, nunca sobrescreve um personagem diferente) — só
  diferente do que eu havia assumido antes de testar. Documentado
  aqui como o contrato de fato.

**Testado ao vivo em navegador real** (fixtures
`zz_e2e_security_atomicity_browser_*`, sem rotas `/dev`): fluxo
completo `/join/<token>` (RPC `resolve_campaign_invite_public` exibiu
o nome da mesa a visitante anônimo) → login real → aceite de convite
→ criação de perfil → wizard completo (atributos, vertente) →
"Criar personagem" → **"Personagem ativo: Zara Teste" exibido
imediatamente** (confirma o INSERT+claim atômico via
`complete_character_creation` funcionando ponta a ponta) → "Entrar
como perfil" → `/ficha` carregada com o personagem correto.

## Fase 7 — Inconsciente e Imobilizado em navegador (ao vivo)

Mesma sessão/fixture do teste de criação acima, sem rotas `/dev`.

**Inconsciente**: aplicada via Console de Ação normal (aba
Condições). Confirmado ao vivo:
- Condição aparece na ficha (bloco "Ativas") com descrição oficial.
- 2 efeitos de bloqueio gerados: "não pode realizar ações" e "não pode
  realizar reações".
- Aba Ações: **todos os 24 botões "Executar" ficaram `disabled`**
  (confirmado via inspeção do DOM), cada um exibindo
  "Inconsciente: não pode realizar ações." — inclusive reações
  (Aparar, Esquivar) e movimento (Deslocar-se).
- Removida: bloco "Ativas" volta a vazio; log da mesa registra
  aplicação e remoção sem duplicar (4 entradas totais: aplicada
  Inconsciente, removida Inconsciente, aplicada Imobilizado, removida
  Imobilizado — exatamente 1 par por condição).

**Imobilizado**: reconstruído contra o conteúdo publicado real
(`db_condicoes_normalizado_v1_5.json`, v1.1.0: `bloquear_acoes` com
`alvo_tags: ["ofensiva","defensiva"]` + `definir_deslocamento`
informativo + `habilitar_acao: escapar`). Confirmado ao vivo, ação por
ação, na aba Ações:
- **Bloqueadas** (ofensiva/defensiva): Agarrar, Atacar, Bloquear,
  Derrubar, Desarmar, Empurrar, Esquivar, Estrangular, Fintar, Aparar.
- **Permitidas** (sem bloqueio): Acessar Trama (diversa), Deslocar-se
  (movimento — só o aviso informativo de deslocamento 0, sem bloqueio
  real, como já documentado), Falar/Gestos Rápidos (livre), Interagir
  (diversa).
- **Escapar (movimento) explicitamente habilitado** pela própria
  condição — rótulo "Habilitada por: imobilizado" visível na UI,
  confirmando o `habilitar_acao` do conteúdo oficial.
- Removida: efeitos voltam a zero; log da mesa registra sem duplicar.

Nenhum bloqueio foi inventado além do que o conteúdo publicado exige.

Matriz de condições:

| Condição | UI | Executor | Chamada direta | Remoção | Reload | Browser |
|---|---|---|---|---|---|---|
| Atordoado | ✅ | ✅ | ✅ (rodada anterior) | ✅ | não exercido nesta rodada | ✅ (rodada anterior) |
| Inconsciente | ✅ | ✅ | ✅ (mesmo executor de Atordoado, código único) | ✅ | não exercido nesta rodada | ✅ (rodada atual) |
| Imobilizado | ✅ | ✅ | ✅ (idem) | ✅ | não exercido nesta rodada | ✅ (rodada atual) |

"Chamada direta" = `executeActionOnCharacter` (o mesmo código que a UI
chama) recusa a execução mesmo fora do botão — não há um segundo
caminho de execução que contorne o bloqueio; não testado via uma
chamada de API HTTP crua separada nesta rodada. Reload completo (F5)
não exercido nesta sessão de browser por limitação de tempo — o estado
persistido é o mesmo lido em toda visita à ficha (sem cache local para
condições), risco residual baixo.

Não declaro as 17 condições concluídas — só o núcleo de bloqueio de
ação/reação de Atordoado/Inconsciente/Imobilizado.

## Correções de texto (achado durante o teste em browser)

Dois textos de UI descreviam a RLS de `campaigns`/`table_logs` como
"ainda em modo de transição"/"sem segurança real" — factualmente
incorretos após esta rodada. Corrigidos para descrever o estado real
(isolamento por RLS real; só o filtro de visibilidade Pública/Privada/
Narrador dentro da MESMA campanha continua sendo aplicado no cliente):
`src/app/dev/join/[campaignId]/JoinClient.tsx`,
`src/app/dev/character-sheet/components/MesaTab.tsx`.

## Migrations aplicadas nesta rodada (Supabase real)

- `0043_campaign_table_logs_isolation` — fecha os 2 vazamentos de
  leitura + RPC pública de convite.
- `0044_character_creation_transactional` — RPC transacional +
  idempotente de conclusão de personagem.

Nenhuma migration de `0036` a `0042` foi editada. Local e remoto
confirmados sincronizados até `0044` (`list_migrations`).

## Harnesses e limpeza

Todos os harnesses desta rodada (`security-isolation.mjs`,
`turn-concurrency-v2.mjs`, `creation-atomicity.mjs`,
`browser-fixture-setup.mjs`) viveram fora do repositório (scratchpad
da sessão) e foram descartados ao final — nenhum script temporário,
loader, servidor ou processo permanece no repositório. 18 scripts de
teste existentes (`scripts/test-*.ts`) reexecutados via o mesmo loader
ESM temporário já documentado (contorna a incompatibilidade
`@esbuild/darwin-x64`/`darwin-arm64` deste host) — todos passando, sem
regressão.

Fixtures `zz_e2e_security_atomicity_*` (todas as variantes: isolamento,
trilha, criação, browser) removidas ao final — contagem zero
confirmada por query direta ao Supabase real em cada etapa.

## Validação final

- `npx tsc --noEmit`: limpo.
- `npm run build`: sucesso, todas as rotas compilam.
- 18 scripts de teste: todos passando.
- `next-env.d.ts`: inalterado (já estava no estado de build).
- `git status --short`: limpo além dos arquivos desta rodada.
- `git diff --check`: sem erro de espaço em branco.
- Fixtures: zero em todas as tabelas.
- Nenhum processo/servidor/loader temporário restante.

## Status por bloco

| Bloco | Status |
|---|---|
| Isolamento entre campanhas | **Concluído e aprovado** para `campaigns`/`table_logs`/Realtime/narradores/jogadores/RPCs — 28/29 checagens live, único ponto sem confirmação foi timing de um evento Realtime "próprio" (não vazamento). `campaign_invites` (SELECT) e `table_logs` (INSERT) abertos permanecem como achados adjacentes, fora do escopo explícito desta rodada. |
| Trilha de turnos — concorrência | **Concluída e aprovada** — invariante central (exatamente um vence) confirmado ao vivo nos 4 cenários restantes contra as RPCs reais; fim de rodada revalidado. |
| Criação autônoma e wizard | **Concluídos e aprovados** — transação real (RPC única), idempotência, retry, duplo clique e falha intermediária confirmados ao vivo (15/16 checagens SQL + fluxo completo em navegador real). |
| Enforcement central de Atordoado/Inconsciente/Imobilizado | **Concluído e aprovado** — os três confirmados em UI, executor e browser real; chamada direta coberta pelo mesmo código do executor; reload não exercido nesta rodada. |
| Inventário do bando | Inalterado nesta rodada (fora do escopo — só regressões causadas por migrations seriam corrigidas; nenhuma encontrada). Continua parcial, como já registrado. |

## Status global

"Ruptura VTT parcialmente concluído — isolamento entre campanhas,
concorrência da trilha e atomicidade da criação aprovados (provados ao
vivo contra o Supabase real e, para criação e condições, também em
navegador real); enforcement central de Atordoado, Inconsciente e
Imobilizado validado em UI, executor e browser. Dois achados adjacentes
de segurança (SELECT aberto em `campaign_invites`, INSERT aberto em
`table_logs`) ficam registrados como prioridade para rodada dedicada,
fora do escopo explícito desta rodada. Modo Evolução completo,
inventário do bando completo, drag operacional, runas/escalpos
avançados e integração de companheiros/drones/Trama permanecem
pendentes."

Nenhuma fase nova foi iniciada.
