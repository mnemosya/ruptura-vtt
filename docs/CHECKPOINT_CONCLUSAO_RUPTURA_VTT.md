# Checkpoint — Conclusão do Ruptura VTT (status factual desta execução)

Registro final da execução única pedida para concluir o escopo
restante do produto atual. Não reescreve o histórico anterior — este
documento só consolida o que foi feito NESTA sessão, a partir do
estado já registrado em `CHECKPOINT_PROMOCAO_MESA_COMBATE_LOG_PRODUCAO.md`
e nos checkpoints anteriores do Editor Universal.

## Estado inicial

- Working tree limpa; commits consolidados confirmados intactos:
  `250150c`, `d048d6d`, `cdfbaf8`, `94cabfe`.
- `next-env.d.ts` sem alteração automática pendente.
- Documentos lidos: PRD (seções 3.2/3.3/4/6/9/10/16/18), checkpoints de
  promoção de mesa/combate, Etapa 9 (inventário/runas), Etapa 10
  (companheiros/Trama), Etapa 11 (Livro/drag editorial), além de
  leitura direta de código (`actionConsole.ts`, `activeEffects.ts`,
  `evolution.ts`, `talents.ts`, `spells.ts`, `inventory.ts`, RLS das
  migrations 0026-0032).

## Matriz de fases

| Fase | Status | Evidência |
|---|---|---|
| 1. Trilha de turnos | **Concluída** | Migrations 0036/0037 aplicadas no Supabase real; motor puro testado; RPCs com autorização revalidada; enforcement de PA no executor; UI na mesa e na ficha. |
| 2. Criação autônoma do jogador | **Concluída** | RLS já permitia; guard da página e ausência de link no fluxo de convite eram o bloqueio real; corrigidos. Draft persistente e trava de duplicidade ficam para a Fase 3+. |
| 3. Conclusão do wizard | **Concluída** | Vertentes/magias/talento/inventário reais via `learnSpell`/`acquireTalentLevel`/`purchaseItem`; testado contra fixtures reais de conteúdo. |
| 4. Ficha em Modo Jogo | **Concluída (parcial)** | Identidade exibida (gap real encontrado e corrigido); demais áreas auditadas sem gap adicional encontrado — não foi uma auditoria linha-a-linha completa. |
| 5. Modo Evolução | **Concluída (parcial)** | PM/vertentes/magias já existiam; talentos ganharam o gate de modo que faltava. Especializações e custo de PM fechado continuam pendentes (o segundo, deliberadamente — PRD autoriza placeholder). |
| 6. Inventário do bando em produção | **Concluída (parcial)** | RLS de membro para SELECT/INSERT (depositar); retirar continua exclusivo do narrador (decisão deliberada); merge de munição por jogador é gap conhecido. |
| 7. Enforcement de condições | **Concluída (parcial)** | Bloqueio real de ação para Atordoado/Inconsciente/Imobilizado; `falha_automatica`/deslocamento continuam só informativos (limitação de infraestrutura, documentada). |
| 8. Runas e escalpos | **Teto já atingido** | Auditoria pré-existente (v0.57) já cobre e bloqueia deliberadamente ~39/40 runas — automatizar mais exigiria sistemas novos (alvo, dano por região, gatilhos). Nenhuma mudança de código. |
| 9. Companheiros/drones/Trama | **Teto já atingido** | Separação bespoke vs. Editor Universal é decisão de design já auditada (Etapa 10) — unificar exigiria reimplementar motor ou generalizar regra hiper-específica. Nenhuma mudança de código. |
| 10. Biblioteca do Livro | **Concluída (parcial)** | Sumário + leitura + busca + navegação, com guard de acesso real. Sem ordem canônica de capítulo nem deep link para os outros 4 tipos de conteúdo. |
| 11. Drag operacional | **Não implementada** | Decisão explícita — exige contexto de personagem no Livro e Server Actions de validação por destino, nenhum dos dois existia; documentado com plano concreto. |
| 12. Fechamento de produção | **Concluída (parcial)** | `error.tsx`/`loading.tsx`/`not-found.tsx` raiz adicionados. Sem loading/error por rota, sem auditoria de acessibilidade/breadcrumbs completa. |
| 13. Observabilidade mínima | **Concluída (parcial)** | `.env.example` (só nomes) adicionado; error boundary loga sem dados sensíveis. Sem logging estruturado central. |

## Migrations aplicadas nesta sessão (Supabase real, `ruptura-vtt`/`yvxoijexyhjjipjktfuu`)

- `0036_turn_track` — `campaigns.turn_track`/`turn_track_version`.
- `0037_turn_track_rpc` — `narrator_set_turn_track`/`end_own_turn`.
- `0038_crew_inventory_member_access` — SELECT/INSERT de membro em `campaign_inventory_items`.

Advisories de segurança revisados após cada uma; nenhum achado novo
além do informativo esperado (SECURITY DEFINER exposto a
`authenticated`, mesmo padrão de funções já existentes).

## Testes

Sem harness de browser (`zz_e2e_vtt_final_*`) nesta sessão — nenhuma
fixture foi criada, logo não há nada a limpar. Verificação feita por:
`npx tsc --noEmit` e `npm run build` depois de CADA fase (sempre
limpos); scripts de asserts pontuais contra o conteúdo real
(`content/db_*.json`) via um loader ESM temporário — usado, verificado
e descartado a cada vez, nunca deixado no repositório.

## Bugs corrigidos

- Guard owner-only bloqueando qualquer jogador em
  `/mesas/[campaignId]/personagens/novo` apesar da RLS já permitir.
- `RARIDADES_PERMITIDAS_NA_CRIACAO` inicialmente esquecia
  `"muito_comum"` (abaixo de "comum" no enum real) — corrigido antes
  do commit, pego pela verificação contra o fixture real.
- `TalentsTab` sem nenhum gate de Modo Jogo/Evolução — talento podia
  ser adquirido/removido fora do Modo Evolução.
- "Enviar ao bando" visível na ficha do jogador mas sempre falhando
  por RLS (owner-only).

## Documentação criada

10 checkpoints novos em `docs/`, um por fase (ver commits). Este
documento consolida o status factual final.

## Limitações e itens futuros (fora do escopo desta execução, confirmados)

Tabuleiro tático, mapa, tokens, distância/alcance/linha de visão
automáticos, veículos com combate completo, importador completo do
Notion, app mobile nativo, voz/vídeo, integração externa, matchmaking,
marketplace público — nenhum tocado, como já era esperado.

## Working tree final

Limpa. 15 commits novos nesta sessão (1 fix inicial de escopo +
migrations + 10 checkpoints + fixes). Nenhum processo, loader ou build
temporário restante no repositório.

## Status global factual

**"Ruptura VTT parcialmente concluído — pendências exatas: draft
persistente do wizard, especializações de vertente, `falha_automatica`
bloqueando rolagem (não só a ação), deslocamento numérico real,
retirada de item do bando pelo jogador, unificação de
companheiros/drones/Trama (decisão de produto pendente, não técnica),
ordem canônica de capítulo no Livro, drag operacional completo
(Livro→ficha), loading/error por rota, logging estruturado,
auditoria de acessibilidade — nenhuma dessas pendências bloqueia o uso
do que já foi promovido a produção nesta sessão, mas nenhuma delas
deve ser contada como concluída sem verificação em navegador, que não
foi feita nesta sessão."**

Não uso a frase de conclusão total ("fluxo completo... disponível em
produção") porque isso exigiria o cenário integrado de 45 passos do
pedido rodando de ponta a ponta num navegador real, com fixtures
limpas ao final — não executado aqui.

## Atualização — rodada de fechamento (concorrência/isolamento)

Ver `CHECKPOINT_FECHAMENTO_CONCORRENCIA_ISOLAMENTO.md`: concorrência da
trilha e da criação endurecidas e provadas ao vivo; 2 vazamentos
cross-campanha reais e pré-existentes confirmados (leitura aberta de
`campaigns`/`table_logs`), registrados como prioridade para rodada
dedicada; Postura/Bricolagem eram testes obsoletos, corrigidos. VTT
continua **não concluído** — status global inalterado quanto a Modo
Evolução completo, draft persistente, drag operacional, runas/escalpos
avançados e companheiros/drones/Trama.

## Atualização — rodada de segurança/atomicidade

Ver `CHECKPOINT_SEGURANCA_ATOMICIDADE.md`: os 2 vazamentos de
`campaigns`/`table_logs` foram corrigidos e provados ao vivo (RLS
real, migration 0043); concorrência da trilha e atomicidade/
idempotência da criação de personagem concluídas e aprovadas
(transação real, migration 0044, provada em SQL e em navegador real);
Inconsciente/Imobilizado validados em navegador real. Dois achados
adjacentes (SELECT aberto em `campaign_invites`, INSERT aberto em
`table_logs`) ficam para rodada dedicada. VTT continua **não
concluído** — Modo Evolução completo, inventário do bando completo,
drag operacional, runas/escalpos avançados e integração de
companheiros/drones/Trama permanecem pendentes.

## Atualização — convites, logs e atomicidade integral

Ver `CHECKPOINT_FECHAMENTO_CONVITES_LOGS_ATOMICIDADE.md`: os 2
achados adjacentes acima foram corrigidos e provados ao vivo (30/30);
`complete_character_creation` confirmada como já transacional para
TODO o estado do personagem (arquitetura de payload único); validação
de legitimidade de conteúdo publicado (magia/talento/item/preço)
permanece um gap real e preciso, registrado para rodada dedicada. VTT
continua **não concluído** — Modo Evolução completo, inventário do
bando completo, drag operacional, runas/escalpos avançados e
integração de companheiros/drones/Trama permanecem pendentes.
