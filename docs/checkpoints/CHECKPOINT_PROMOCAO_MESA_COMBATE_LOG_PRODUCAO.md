# Checkpoint — Promoção de combate e log para produção

Rodada curta, pós-auditoria global (ver conversa de auditoria), estritamente
focada em promover para as rotas de produção (`/mesas/[campaignId]`,
`/ficha`) o que já funcionava só em `/dev/table`/`/dev/character-sheet`, e em
proteger as rotas `/dev` fora de desenvolvimento. Não altera o Editor
Universal, não implementa Rápidos/Lentos, não implementa criação de
personagem pelo jogador, não implementa chat/sussurro novos.

## 1. Escopo entregue

1. Resolução completa de combate em `/mesas/[campaignId]` (reação
   defensiva, margem → região, MIT/PD, dano, persistência, log).
2. Log da mesa reaproveitando o conjunto completo de formatadores já
   existentes (antes só um subconjunto pequeno em `MesaDetailClient.tsx`).
3. Guard central das 5 rotas `/dev`, bloqueadas fora de desenvolvimento.

## 2. Matriz de promoção (Fase 1)

| Capacidade | Existia em `/dev` | Existia em produção (antes) | Serviço compartilhado | Ação tomada |
|---|---|---|---|---|
| Ataque contestado | `TableClient.tsx` (completo, com ganchos de talento) | `MesaDetailClient.tsx` (totais manuais, MIT/PD já ligado) | `lib/character/attack.ts` (`resolveContestedRoll`, `applyAttackDamage`) | Mantido — já reusava o motor real |
| Reação defensiva | `handleRollDefense` (rolagem de perícia + talentos) | Ausente (só um checkbox "Bloqueou") | `lib/character/reactions.ts` (`spendReactionForDefense`, `getReactionAvailability`) | **Novo**: seletor de tipo de defesa + consumo real de Reação no passo 1 (`handleCalcularMargem`), sem os bônus de talento do console dev |
| Margem → região | `resolveMarginBand` + seletor de região travado pela banda | Só o número da margem, sem banda/região | `lib/character/attack.ts` (`resolveMarginBand`, `BODY_REGION_LABELS`) | **Novo**: passo 2 (`handleAplicarDano`) trava a escolha de região às regiões liberadas pela banda |
| MIT/PD | `resolveDamageWithMitPd` via `applyAttackDamage` | Já usava `applyAttackDamage`/`getEquippedDefenseProfile` | `lib/character/defense.ts` | Mantido; "Bloquear" agora deriva `wasBlocked` da reação escolhida em vez de checkbox solto |
| Dano + banda | Rolagem manual + ajuste de banda orquestrado no componente (`applyMarginBasedAttackDamage`, sem PD) | Fórmula direta sem ajuste de banda | `lib/character/attack.ts` (`rollDamageFormula`, `rollExtraMarginDie`) | **Novo**: dano bruto rolado, ajustado pela banda (flat/+1 dado) e repassado a `applyAttackDamage` como fórmula fixa (`0d4+N`) — reaproveita o MESMO parser/motor, sem duplicar cálculo |
| Log | `MesaTab.tsx` — ~35 formatadores por tipo de evento | `MesaDetailClient.tsx` usava só `formatCampaignRoundLog` (subconjunto pequeno) | `lib/table/storage.ts` (`addLog`, `listLogsForViewer`) | **Extraído** o dispatcher de `MesaTab.tsx` para uma função pura exportada (`formatTableLogEntry`), reusada por `MesaDetailClient.tsx`. `MesaTab` (aba "Mesa" da ficha) já rodava em produção via `CharacterSheetView`/`mode="product"` — não precisou de mudança de acesso |
| Realtime | `useCampaignRealtime`/`useTableLogsRealtime` já assinam `characters`/`campaigns`/`table_logs` | Mesmo hook já em uso em `MesaDetailClient.tsx` e `MesaTab.tsx` | `lib/realtime/*.ts` | Nenhuma mudança — já era real e compartilhado |

Nada foi copiado de arquivo inteiro; nenhuma lógica de autorização foi movida
das rotas de produção (Server Components) para componentes client.

## 3. Combate completo em produção (`MesaDetailClient.tsx`)

O painel "Resolver Ataque" virou um fluxo de 2 passos, sem duplicar motor:

1. **Calcular Margem** (`handleCalcularMargem`) — valida atacante/alvo/totais
   já rolados; se uma reação defensiva foi escolhida (Esquivar/Aparar/
   Bloquear/Resistir), consome 1 Reação do alvo via `spendReactionForDefense`
   (persistida no personagem, logada como `defense_reaction_used`,
   reaproveitando o formato já usado por `/dev/table`); calcula a margem
   (`resolveContestedRoll`); em empate/derrota do atacante, registra
   `attack_resolved` (sem dano) e encerra; em vitória, calcula a banda
   (`resolveMarginBand`) e aguarda a escolha de região.
2. **Aplicar Dano** (`handleAplicarDano`) — exige região escolhida dentro das
   liberadas pela banda; rola o dano bruto (`rollDamageFormula`), ajusta pela
   banda (`-1` flat na banda limitada, `+1` dado da mesma fórmula na banda
   crítica — `rollExtraMarginDie`), aplica via `applyAttackDamage` (MIT ou
   PD conforme a reação escolhida ter sido "Bloquear"), persiste o
   personagem e registra `attack_resolved` rico (mesmo formato estruturado
   que `formatAttackResolved` já sabia exibir, vindo de `/dev/table`).

Regras fixas preservadas e verificadas: ataque 2 PA (inalterado, já vinha do
catálogo de ações), margem 0–1 → Tronco/-1 dano, margem 2–4 → Corpo, margem
5+ → Cabeça/+1 dado, Reações/rodada = Mente, MIT/PD nunca aplicados juntos,
perfurante ignora 1 MIT, ácido conforme `defense.ts` (dobra a redução
absorvida no golpe — mesma implementação já existente, não alterada), Aljava
inalterada (não fazia parte do escopo desta rodada).

## 4. Log em produção

- `MesaDetailClient.tsx` (mesa, narrador) agora renderiza `formatTableLogEntry`
  (extraído de `MesaTab.tsx`) — cobre ataque, reação, dano, condição, uso de
  item, magia, encerramento de rodada/cena, efeito temporário, colapso,
  sobrecarga, ruptura, descanso, evolução, sem inventar formato novo.
- `/ficha` (jogador) **já** renderizava a aba "Mesa" (`MesaTab.tsx`) mesmo em
  `mode="product"` — só as abas "personagens" e "debug" são ocultadas nesse
  modo. Nenhuma mudança de acesso foi necessária; a rota de produção só
  ganhou a mesma qualidade de formatação que o narrador já tinha no dashboard.
- Realtime: `useCampaignRealtime` (mesa) e `useTableLogsRealtime` (ficha) já
  assinavam a mesma tabela `table_logs`; nenhuma infraestrutura nova.

## 5. Guard das rotas `/dev` (Fase 4)

Helper central em `src/lib/dev/guard.ts` (`assertDevRouteAllowed`), chamado
no topo de cada um dos 5 `page.tsx`:

- `/dev/login`
- `/dev/auth/status`
- `/dev/character-sheet`
- `/dev/join/[campaignId]`
- `/dev/table`

Comportamento: `NODE_ENV !== "production"` → acessível (dev normal); fora
disso, só acessível com `DEV_ROUTES_ENABLED=true` (feature flag server-side,
nunca lida no client); caso contrário, `notFound()` interrompe a
renderização do Server Component antes de qualquer busca de dado — sem UI
parcial, sem exposição de dados.

**Verificado com servidor de produção real** (`next build` + `next start`,
porta isolada 3001, processo encerrado ao final):

| Rota | `NODE_ENV=production` | `NODE_ENV=production` + `DEV_ROUTES_ENABLED=true` |
|---|---|---|
| `/dev/table` | 404 | 200 |
| `/dev/login` | 404 | (não testado individualmente, mesmo guard) |
| `/dev/auth/status` | 404 | — |
| `/dev/character-sheet` | 404 | — |
| `/dev/join/abc` | 404 | — |
| `/login` (controle, rota real) | 200 | — |

## 6. Autorização

Nenhuma lógica de autorização foi movida de Server Component para client.
`/mesas/[campaignId]/page.tsx` continua exigindo login + `owner_id === user.id`
antes de renderizar `MesaDetailClient`; a nova Server Action de reação/dano
roda dentro dos mesmos `updateCharacter`/`addLog` já protegidos por RLS e
pelas RPCs existentes (nenhuma RLS/migration foi alterada nesta rodada).
Jogador continua sem acesso ao painel de narrador (ele não existe na rota
`/ficha`); a única superfície nova do jogador é a leitura do log já existente.

## 7. Verificação técnica (rodada de implementação)

- `npx tsc --noEmit`: sem erros.
- `npm run build` (Next 16, Turbopack): compilação e geração de página bem-
  sucedidas, todas as rotas listadas (incluindo as 5 `/dev` como `ƒ`
  dinâmicas).
- Guard `/dev` verificado com servidor de produção real (seção 5).
- Harnesses (`npm run test:*`) e browser check completo ficaram pendentes
  nesta rodada — ver seção 11 (rodada de fechamento) para o resultado final.

## 8. Limitações mantidas (fora de escopo)

- Trilha Rápidos/Lentos, alternância PJ/PN, "Encerrar turno" pelo jogador.
- Criação/vínculo autônomo de personagem pelo jogador.
- Chat livre, sussurro, comandos `/r`, cartões clicáveis no log.
- Inventário do bando em produção.
- Automação adicional de condições, runas, escalpos, companheiros, drones,
  robôs, Trama.
- Biblioteca do Livro, drag operacional.
- Bônus de talento sobre a resolução de ataque (Fúria, Hemorragia, Fincada,
  Muralha, Golpe Cirúrgico etc.) — ficam só em `/dev/table`; o painel de
  produção resolve a regra base do PRD 8.1–8.7, sem os ganchos de talento
  daquele console.

## 9. Fixtures (rodada de implementação)

Nenhuma fixture foi criada na rodada de implementação (browser check não
executado nela). Ver seção 11 para as fixtures da rodada de fechamento.

## 10. Status ao final da rodada de implementação (histórico)

"Vertical slice de sessão em produção parcialmente concluído — implementação
pronta; regressões dos motores e aceite integrado de browser pendentes."
Superado pela rodada de fechamento — ver seção 12.

---

## 11. Rodada de fechamento — validações pendentes concluídas

Rodada curta, focada exclusivamente em: (1) rodar os harnesses reais dos
motores envolvidos, (2) validar no browser o fluxo integrado narrador↔jogador,
(3) corrigir bugs concretos (nenhum encontrado — ver seção 11.3), (4) limpar
fixtures, (5) atualizar esta documentação. Não implementou nada novo; não
alterou o Editor Universal; não tocou nos três commits anteriores
(`250150c`, `d048d6d`, `cdfbaf8`).

### 11.1 Harnesses — método e resultado

`tsx`/`esbuild` continua quebrado neste host (`@esbuild/darwin-x64` instalado
num `arm64`; `npm install` permanecia proibido). Contornado com um loader ESM
temporário (`--experimental-loader`, vivendo fora do repo, removido ao final)
que resolve imports extensionless/`.js`→`.ts` e transpila `.ts`/`.tsx` via
`ts.transpileModule` do pacote `typescript` já instalado (puro JS, sem
binário nativo) — nenhuma lógica de motor foi copiada para dentro do loader
ou dos testes; ele só resolve/compila o código real do repositório.

| Harness | Comando | Resultado | Casos |
|---|---|---|---|
| `test-attack-resolution.ts` | `node --experimental-loader=<loader> scripts/test-attack-resolution.ts` | OK | 9 |
| `test-defense.ts` | idem | OK | 9 |
| `test-reactions.ts` | idem | OK | todos |
| `test-ammunition.ts` | idem | OK | 24 |
| `test-collapse.ts` | idem | OK | 20 |
| `test-integrity-fallback.ts` | idem | OK | 4 |
| `test-campaign-end-round.ts` | idem (Supabase real, service role só para o próprio teste) | OK | 6 |
| `test-campaign-end-scene.ts` | idem | OK | 10 |
| `test-realtime-minimal.ts` | idem (import de `.tsx`, resolvido pelo mesmo loader) | OK | 7 + 1 extra |
| `test-realtime-publication.ts` | `node --experimental-strip-types scripts/test-realtime-publication.ts` (sem imports do repo, não precisou do loader) | OK — `characters`/`campaigns`/`table_logs` publicadas | 3 tabelas |
| `test-action-console.ts` | idem loader | **Falha funcional pré-existente, não relacionada a esta rodada** — ver 11.2 | — |
| `test-end-round-conditions.ts` | idem | OK | 11 |
| `test-end-round-indicators.ts` | idem | OK | 5 |
| `test-active-effects.ts` | idem | OK | 7 |

Todos os harnesses executados importam o código real de `src/lib/*`
(nenhuma lógica foi reimplementada para o teste passar). Reexecutados uma
segunda vez ao final da rodada (seção 11.5) para confirmar reprodutibilidade.

### 11.2 Achado incidental — `test-action-console.ts`

Falha (`assert.ok(postureItem?.pendingEffects.some(...includes("Postura")))`)
em `scripts/test-action-console.ts:124`. Confirmado por leitura do diff dos 3
commits desta feature: nenhum deles toca `actionConsole.ts`, conteúdo de
ações, ou qualquer arquivo relacionado a este teste — a falha já existia
antes desta rodada e desta feature, é sobre rótulos de Postura no console de
ação (fora do escopo de combate/log/guard desta rodada). **Não corrigida**,
por instrução explícita de só corrigir bugs que bloqueiem ataque, defesa,
reação, margem, região, MIT, PD, dano, logs, Realtime, rodada, cena,
autorização ou guard `/dev` — este não bloqueia nenhum desses.

### 11.3 Bugs encontrados que bloqueiam os motores listados

**Nenhum.** O único problema encontrado durante o browser check (MIT
aparecendo como 0 no primeiro ataque com armadura) foi diagnosticado como
erro de operação da fixture, não bug de produto: a ficha exibe o aviso
"Edição é local até clicar em 'Salvar personagem'" e a compra/equipagem da
armadura não tinha sido salva antes do ataque. Confirmado lendo
`characters.payload.inventario` direto no banco (vazio antes de "Salvar
personagem", com a instância completa depois). Refeito com o "Salvar
personagem" corretamente clicado, o MIT aplicou 4/4 como esperado (seção
11.4, Cenário D). Nenhuma correção de código foi necessária.

### 11.4 Browser check integrado — narrador + jogador

Fixtures com prefixo `zz_e2e_session_mvp_close_*`: 2 contas Supabase Auth
(`_narrador`, `_jogador`, pré-confirmadas via `auth.admin.createUser`),
1 campanha, 1 perfil, 2 personagens (`_jogador_char` vinculado ao perfil,
`_atacante_char` controlado pelo narrador), 1 convite, carteira/armadura do
jogador (financiadas via service role só como preparação de fixture — a
compra e o equipar em si ocorreram pela loja real da ficha).

Limitação de ambiente registrada: o Browser pane deste ambiente é um único
perfil de navegador com cookies compartilhados entre abas — não há duas
sessões HTTP verdadeiramente simultâneas com identidades diferentes. Narrador
e jogador foram operados na mesma aba/par de abas alternando login (cada
troca de conta reautentica o cookie httpOnly compartilhado). Onde isso
importa — Realtime — a limitação não compromete o resultado: a aba do
narrador ficou aberta e **não foi recarregada** enquanto o jogador agia em
outra aba, e a atualização chegou por Realtime de verdade (WebSocket via
anon key, independente do cookie de auth). Registrado explicitamente onde a
alternância de cookie foi necessária (ex.: a compra/equipagem da armadura
ocorreu com o cookie do narrador ainda ativo, que também tem permissão de
escrita sobre personagens da própria campanha — efeito colateral aceitável
para os fins desta validação, sem impacto no resultado mecânico).

| Cenário | Resultado |
|---|---|
| A — Acesso e isolamento | Narrador logado só vê a própria mesa; jogador autenticado tentando abrir `/mesas/[campaignId]` do narrador recebeu **"Acesso negado"** real (não é só UI escondida — é checagem server-side); ficha do jogador mostra só o personagem vinculado, sem abas de narrador/debug (`mode="product"` oculta "Personagens"/"Debug"); PV/PA/Reações iniciais conferem com as fórmulas (PV 12=10+Corpo 2, Reações 2=Mente 2, PA 3) |
| B — Teste + Realtime | Rolagem de Percepção na ficha do jogador criou 1 entrada `rolagem_pericia`; apareceu na mesa do narrador **sem reload** (aba já aberta, Realtime real); sem duplicação; persistiu após reload |
| C — Ataque defendido | Atacante (8) vs jogador com Esquivar (15) — margem -7, "defesa bem-sucedida, sem dano"; log `defense_reaction_used` mostrou "Reações 2 → 1" (exatamente 1 Reação consumida); PV não mudou; ambos os eventos (`defense_reaction_used` + `attack_resolved`) apareceram na mesa e, minutos depois, na aba "Mesa" da própria ficha do jogador, sem reload |
| D — Ataque com dano | Atacante (25) vs jogador (8) — margem 17 (crítica), região Cabeça liberada junto com Tronco/Braços/Pernas (conforme PRD margem 5+); dano bruto 8, sem armadura ainda: MIT 0, dano final 8, PV 12→4. Repetido com Colete Balístico (MIT 4/4) equipado e salvo: margem 15 (crítica), Tronco, dano bruto 10 (base + 1 dado extra da banda crítica), **MIT absorveu os 4 pontos completos, dano final 6, PV 12→6** — MIT nunca somado a PD, persistido no personagem (`mitAtual: 0` após esgotar) e confirmado direto no banco |
| E — Reação esgotada | Consumidas as 2 Reações (Mente=2) via Esquivar+Aparar; 3ª tentativa (Resistir) **não travou** — seguiu a regra do PRD 6.4 ("defesa ainda permitida com penalidade"), mostrou "Defesa sem Reação disponível — penalidade cumulativa de -1 nesta rodada", `reacoes_usadas` nunca passou de 2 (nunca negativo), `defesas_sem_reacao` foi a 1, e o log registrou fielmente "Reações 0 → 0" (sem fingir um consumo que não ocorreu) |
| F — Rodada | "Encerrar Rodada": Rodada 1→2, "2 personagem(ns) processado(s)"; `reacoes_usadas` e `defesas_sem_reacao` resetados a 0 no banco; log `round_end_processed` + `round_ended`, sem duplicação; persistiu após reload |
| G — Cena | "Encerrar Cena": Cena 1→2, "2 personagem(ns) processado(s)", "Nenhuma Ruptura pendente foi resolvida" (correto — ninguém chegou a 3 Sobrecargas); persistiu após reload de ambas as páginas — PV, campanha e personagem corretos |

Console/rede: nenhum erro inesperado observado (verificado via
`read_console_messages`/screenshots ao longo dos cenários); os únicos avisos
foram esperados (heartbeat expirado do perfil após inatividade >30s entre
passos manuais, "Sessão inválida ou expirada" ao tentar abrir `/ficha`
diretamente sem sessão local válida — comportamento de segurança correto,
não um erro).

Autorização (smoke checks): jogador não tem acesso a `/mesas/[campaignId]`
do narrador (bloqueado no servidor); ficha do jogador nunca expôs controles
de narrador; narrador só via a própria campanha na lista de `/mesas`; log da
mesa é sempre filtrado por `campaign_id` (`listLogsForViewer`); ficha só
carregou o personagem vinculado à sessão local válida.

Guard `/dev`: reconfirmado nesta rodada — as 5 rotas acessíveis em dev
(`curl` local, todas 200) e bloqueadas (404) num `next build && next start`
real fora de dev, com `/login` de controle em 200 e `DEV_ROUTES_ENABLED=true`
reabrindo o acesso.

### 11.5 Validação final

- `git status --short` inicial desta rodada: limpo (3 commits confirmados
  presentes: `250150c`, `d048d6d`, `cdfbaf8`); `next-env.d.ts` sem diff.
- Harnesses (11.1) reexecutados uma segunda vez após a limpeza de fixtures,
  todos OK novamente.
- `git diff --check`: sem problemas de whitespace.
- `npx tsc --noEmit`: sem erros.
- `npm run build`: sucesso, mesmas 27 rotas de antes.
- `git status --short` final: limpo — nenhum arquivo temporário, script
  auxiliar ou build artifact deixado no repositório; loader ESM e scripts de
  fixture viveram só no diretório de scratchpad da sessão e em
  `.tmp-fixture-scripts/` (removido antes do commit final).
- Fixtures: todas as tabelas (`campaigns`, `characters`, `campaign_profiles`,
  `campaign_invites`, `campaign_members`, `table_logs`,
  `campaign_inventory_items`, `profile_sessions`, `auth.users`) confirmadas
  em contagem zero para o prefixo `zz_e2e_session_mvp_close_*` após a
  limpeza.

## 12. Status final

**"Vertical slice de sessão em produção concluído — combate completo e log
compartilhado disponíveis sem rotas /dev."**

Critérios exigidos, todos atendidos: harnesses dos motores (11.1) ✓; ataque
defendido (Cenário C) ✓; ataque com dano (Cenário D) ✓; consumo de Reação
(Cenário C) ✓; bloqueio de Reação esgotada (Cenário E) ✓; margem ✓; região ✓;
MIT (Cenário D) ✓; persistência de PV (confirmada no banco e após reload) ✓;
log na mesa ✓; log na ficha via Realtime (Cenário B/C, sem reload) ✓; rodada
(Cenário F) ✓; cena (Cenário G) ✓; reload (todos os cenários) ✓; autorização
✓; guard `/dev` ✓; console/rede sem erro inesperado ✓; fixtures removidas
(11.5) ✓; TypeScript ✓; build ✓.

Permanecem fora do escopo, como já registrado: Rápidos/Lentos, alternância
PJ/PN, criação autônoma de personagem pelo jogador, chat/sussurro,
inventário do bando em produção, Biblioteca do Livro, drag operacional,
automações avançadas de condição/runa/escalpo/companheiro, mobile. O VTT
como um todo **não** está concluído — só este vertical slice específico de
combate + log em produção.

O Editor Universal permanece concluído e não foi alterado nesta rodada nem
na anterior. Nenhuma funcionalidade nova foi iniciada nesta rodada de
fechamento — só validação, um achado incidental não relacionado (11.2, não
corrigido por estar fora do escopo) e documentação.
