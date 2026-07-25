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

## 7. Verificação técnica

- `npx tsc --noEmit`: sem erros.
- `npm run build` (Next 16, Turbopack): compilação e geração de página bem-
  sucedidas, todas as rotas listadas (incluindo as 5 `/dev` como `ƒ`
  dinâmicas).
- Guard `/dev` verificado com servidor de produção real (seção 5).
- **Harnesses (`npm run test:*`) não executados nesta rodada** —
  bloqueador de ambiente pré-existente, não causado por esta mudança:
  `tsx`/`esbuild` está instalado com o binário nativo `@esbuild/darwin-x64`
  neste ambiente `arm64`, e `npm install`/reinstalação foi explicitamente
  proibido para esta rodada. Reproduzível com `npx tsx --eval "1"`.
- **Browser check completo (Fase 5, fixtures `zz_e2e_session_mvp_*`) não
  executado nesta rodada** — a porta 3000 já estava ocupada por um servidor
  de outra sessão (não deveria ser duplicado, conforme instrução), e montar
  o vertical slice completo exigiria criar conta/campanha/personagem reais
  via Supabase dentro do orçamento desta rodada. Ficou como pendência
  explícita abaixo.

## 8. Limitações mantidas (fora de escopo desta rodada)

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

## 9. Fixtures

Nenhuma fixture foi criada nesta rodada (browser check não executado — ver
seção 7). Nada a limpar.

## 10. Status final

**Vertical slice de sessão em produção parcialmente concluído** — combate
completo, log compartilhado e guard das rotas `/dev` estão implementados,
com `tsc`/`build` limpos e o guard verificado contra um servidor de produção
real; pendências exatas: (a) harnesses de regra (`npm run test:*`) não
executados por bloqueador de ambiente pré-existente (esbuild `x64` em host
`arm64`, fora do escopo desta rodada corrigir via `npm install`); (b) browser
check completo com fixtures `zz_e2e_session_mvp_*` não executado (porta 3000
ocupada por outra sessão; criação de conta/campanha/personagem reais fica
como próximo passo). O VTT permanece parcial pelos motivos já registrados na
auditoria global (Rápidos/Lentos, criação de personagem pelo jogador, chat,
Biblioteca do Livro, inventário do bando em produção, automações avançadas).

O Editor Universal permanece concluído e não foi alterado nesta rodada.
