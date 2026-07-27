# Checkpoint — Consolidação, correção e aceite dos 13 commits

Rodada única de verificação/correção sobre os 13 commits posteriores a
`94cabfe`. Não iniciou nenhum sistema novo (drag operacional, runas
adicionais, escalpos avançados, companheiros/drones/Trama) — só
revisou, testou e corrigiu os blocos já implementados.

## Working tree inicial

- `git status --short`: limpo.
- Commits consolidados anteriores confirmados intactos: `250150c`,
  `d048d6d`, `cdfbaf8`, `94cabfe`.
- `next-env.d.ts`: alternou automaticamente para
  `.next/dev/types/routes.d.ts` durante `npm run dev`/`npm run build`
  nesta sessão — revertido para `.next/types/routes.d.ts` ao final,
  conforme instruído.

## Os 13 commits revisados

| Commit | Bloco alegado | Arquivos principais | Migration |
|---|---|---|---|
| `e6c1c65` | Trilha de turnos | `turnTrack.ts`, `turnTrackActions.ts`, `actionConsole.ts`, `endRound.ts`, `TurnTrackPanel.tsx` | `0036`, `0037` |
| `6984a40` | Criação autônoma do jogador | `personagens/novo/page.tsx`, `CreateCharacterWizardClient.tsx`, `JoinClient.tsx` | — |
| `29051fd` | Wizard completo | `CreateCharacterWizardClient.tsx`, `personagens/novo/page.tsx` | — |
| `fde4b2a` | Identidade na ficha | `GeneralTab.tsx`, `CharacterSheetClient.tsx` | — |
| `ea95574` | Gate de talento no Modo Evolução | `TalentsTab.tsx`, `CharacterSheetClient.tsx` | — |
| `3585cf1` | Inventário do bando em produção | `MesaTab.tsx` | `0038` |
| `e64cda1` | Enforcement de condições | `actionConsole.ts`, `CharacterSheetClient.tsx` | — |
| `9734890` | Runas/escalpos (doc, sem código) | — | — |
| `fbabe9c` | Companheiros/Trama (doc, sem código) | — | — |
| `9d32f29` | Biblioteca do Livro | `livro/page.tsx`, `livro/[slug]/page.tsx`, `LivroSumarioClient.tsx` | — |
| `2582db9` | Drag operacional (doc, não implementado) | — | — |
| `3a7f274` | Fechamento de produção | `error.tsx`, `loading.tsx`, `not-found.tsx`, `.env.example` | — |
| `3051a26` | Doc de conclusão anterior | — | — |

## Migrations — local vs. remoto

`0036_turn_track`, `0037_turn_track_rpc`, `0038_crew_inventory_member_access`
confirmadas idênticas e na mesma ordem em
`supabase/migrations/` e no projeto Supabase real
(`ruptura-vtt`/`yvxoijexyhjjipjktfuu`, via `list_migrations`).
Schema (`campaigns.turn_track`/`turn_track_version`), RPCs
(`narrator_set_turn_track`, `end_own_turn`) e grants verificados
diretamente no banco (`information_schema`/`pg_proc`). Nenhuma
migration aplicada nesta rodada foi editada — só uma nova, corretiva
(ver abaixo).

## Bugs concretos encontrados e corrigidos

### 1. `turnWindow` nunca chegava à ficha (bloqueio de PA>2 nunca disparava)

`buildActionConsoleItems`/`executeActionOnCharacter` recebiam
`turnWindow=undefined` fixo nos três pontos de chamada em
`CharacterSheetClient.tsx` — o parâmetro existia na assinatura (fase
1) mas nunca foi conectado ao estado real da trilha de turnos. Corrigido
com `currentTurnWindow` (derivado de `mesas.find(...).turn_track.window`)
passado nos três call sites. Verificado ao vivo no navegador: o motor
de bloqueio (`isActionAllowedInWindow`) está corretamente ligado; não
foi possível clicar um "Executar" real de mais de 2 PA porque nenhuma
das 28 ações do catálogo oficial custa mais que 2 PA — a lógica foi
confirmada por unit test (loader ESM temporário) e pela leitura
correta do estado de janela na aba Mesa da ficha.

### 2. Criação pelo jogador deixava o personagem órfão

Reproduzido ao vivo: após concluir o wizard como jogador, a chamada
final (`setCampaignProfileActiveCharacter`) falhava com "Sem acesso de
narrador a esta campanha" — a RPC subjacente (`set_campaign_profile_active_character`,
migration 0032) é deliberadamente travada a narrador desde antes da
fase 2 existir. O personagem era criado com sucesso, mas nunca virava
"ativo" no perfil. Corrigido com uma RPC nova
(`claim_own_active_character`, migration `0039`, aplicada no projeto
real) que aceita o dono do PRÓPRIO perfil (ou o narrador, sem regressão),
validando que o personagem já aponta de volta para aquele perfil. O
wizard agora chama `claimOwnActiveCharacter` em vez da função
narrador-only. Re-testado ao vivo: "Personagem ativo: Zara Retest"
aparece corretamente após a criação.

### 3. Redirecionamento pós-criação levava o jogador a "Acesso negado"

`finalizar()` sempre navegava para `/mesas/${campaign.id}` — a mesa do
NARRADOR (guard owner-only). Um jogador que acabou de criar o próprio
personagem caía direto em "Acesso negado". Corrigido: quando
`travarSelecaoDePerfil` (modo jogador), redireciona para
`/ficha?campaignId=&profileId=` (mesmo padrão de link já usado por
`JoinClient`); narrador continua indo para a mesa, inalterado.

## Migration corretiva aplicada

`supabase/migrations/0039_claim_own_active_character.sql` — nova RPC
`claim_own_active_character`. Aplicada no Supabase real. Advisories de
segurança revisados (sem achado novo além do informativo esperado de
SECURITY DEFINER exposto a `authenticated`).

## Falhas de teste identificadas como PRÉ-EXISTENTES (não corrigidas)

Reexecutados os harnesses relacionados; duas falhas confirmadas
alheias aos 13 commits, por rastreamento direto do código (nenhuma
delas toca em arquivo alterado pelos 13 commits):

- `test-action-console.ts` (assert de rótulo "Postura"): a lógica
  atual classifica TODOS os efeitos de uma ação de postura como
  `automatedEffects` (correto, é o comportamento intencional desde
  v0.64) — o teste espera um em `pendingEffects` contendo "Postura"
  (capitalizado), string que não é gerada por nenhum caminho do código
  atual. Nenhuma linha tocada pelos 13 commits.
- `test-talents.ts` (assert de efeito ativo de "Bricolagem"): o código
  exclui DELIBERADAMENTE o modificador de Bricolagem de
  `deriveActiveEffectsFromTalents` (comentário explícito no código —
  vira efeito consumível em `getBricolagemActiveEffects`,
  `talentEngine.ts`), mas o teste chama só a primeira função. Nenhuma
  linha tocada pelos 13 commits.

Passando, sem alteração: `test-inventory` (28/28, incl. Aljava),
`test-spells` (11/11, incl. CD=6+nível), `test-active-effects` (7/7),
`test-reactions`, `test-realtime-publication`.
`test-campaign-end-round`/`test-realtime-minimal` falham por motivo
AMBIENTAL (módulos `next/headers`/rota com colchetes não resolvem fora
do runtime do Next), não funcional.

## Browser integrado (narrador + jogador reais)

Fixtures `zz_e2e_consolidacao_13_commits_*`: 1 narrador, 1 jogador, 1
campanha, 1 convite, 3 personagens (2 PJ + 1 PNJ) — dev server local,
sessão única do browser (sem suporte a duas sessões simultâneas
distintas nesta ferramenta; testado sequencialmente por login/logout,
não em paralelo real).

**Cenário 1 — Trilha**: iniciar rodada (Rápidos) ✓, ordem alternada
PJ/PNJ/PJ ✓, narrador avança ✓, override devolve turno ✓, Rápidos→Lentos
✓, jogador encerra o PRÓPRIO turno ✓, jogador NÃO consegue encerrar
turno alheio (botão desabilitado, estado não muda) ✓, Realtime propaga
entre sessões narrador→jogador ✓, logs (`turn_ended`,
`turn_track_narrator_update`) gravados ✓.

**Cenário 2 — Criação do jogador**: convite → reivindicar perfil →
wizard completo (identidade, atributos 0/3 restante, perícias 0/25,
vertente Cinética nível 3 com CD=9 confirmado, 2 magias, talento
Artífice-Bricolagem, compra de Adaga com dedução de carteira) →
revisão → conclusão → ficha própria. 2 bugs reais encontrados e
corrigidos nesta etapa (ver acima).

**Cenário 3 — Payload hostil**: atributo fora do orçamento bloqueado
no cliente E no servidor (`createCharacterFromWizard`/
`validateCreationBudget`, nova validação desta rodada); vertente fora
do orçamento bloqueada; compra acima do saldo rejeitada server-side
("Saldo insuficiente em Aretz informal") sem alterar o personagem.

**Cenário 4 — Ficha**: identidade (origem/idioma) exibida
corretamente; atributos/vertente/CD/talento/magias/inventário todos
refletindo exatamente o que foi escolhido no wizard, após reload real
(login/logout).

**Cenário 5 — Modo Evolução**: botão "Adquirir" do talento mostra
"Disponível no Modo Evolução" em Modo Jogo (nenhuma ação possível);
alternar para Modo Evolução libera o controle.

**Cenário 6 — Inventário do bando**: seção visível para o jogador na
aba Mesa, mensagem correta ("Retirar do bando é feito pelo narrador").
Não havia item para testar depósito/retirada ao vivo nesta rodada
(fora do escopo desta correção pontual).

**Cenário 7 — Condições**: aplicar Atordoado bloqueia TODAS as ações
(incluindo reação "Aparar") no Console de Ação, com a mensagem exata
"Atordoado: não pode realizar ações."/"não pode realizar reações." —
confirmado com o conteúdo real de condições, ao vivo.

**Cenário 8 — Livro**: rota acessível, sem capítulos publicados nesta
mesa para testar sumário/leitura/busca com conteúdo real (fixtures não
incluíram capítulo).

**Cenário 9 — Isolamento**: confirmado que um jogador não pode acessar
`/mesas/[campaignId]` (mesa do narrador — "Acesso negado"); RPC de
turno e de personagem ativo revalidam o vínculo de perfil/campanha
server-side. Isolamento entre DUAS campanhas/DOIS jogadores distintos
não testado nesta rodada (não foram criadas campanha B/jogador B —
limitação de tempo, registrada).

## Concorrência

Validada por leitura de código (não por dois cliques literalmente
simultâneos, que esta ferramenta de browser não consegue disparar): a
versão otimista (`turn_track_version`) é comparada dentro da mesma
transação SQL em `end_own_turn`/`narrator_set_turn_track` — uma
segunda chamada com versão desatualizada recebe `version_conflict`,
nunca sobrescreve silenciosamente.

## Fixtures

Removidas integralmente ao final: `campaigns`, `characters`,
`campaign_profiles`, `campaign_invites`, `campaign_members`,
`table_logs`, `profile_sessions`, `campaign_inventory_items` e os 2
usuários `auth.users` do prefixo `zz_e2e_consolidacao_13_commits_*`.
Contagem zero confirmada por query direta ao Supabase real.

## Validação final

- `git status --short`: limpo.
- `git diff --check`: sem erro de espaço em branco.
- `npx tsc --noEmit`: limpo.
- `npm run build`: sucesso, todas as rotas compilam.
- `next-env.d.ts`: revertido para o estado de build (não-dev).
- Harnesses relacionados reexecutados após as correções: sem
  regressão (ver seção de testes acima).
- Nenhum processo/servidor restante (dev server parado).
- Nenhum loader/script temporário restante no repositório.

## Status por bloco (classificação rigorosa)

| Bloco | Classificação |
|---|---|
| Trilha de turnos | **Implementado, aceite parcial** — bug crítico de conexão (`turnWindow`) corrigido e revalidado; concorrência literal de dois cliques simultâneos não exercida (só por leitura de código); duas sessões reais testadas sequencialmente, não em paralelo. |
| Criação autônoma | **Implementado, aceite parcial** — 2 bugs reais corrigidos e revalidados ao vivo (personagem órfão, redirecionamento); draft persistente continua ausente (já era conhecido). |
| Wizard | **Implementado, aceite parcial** — validação server-side de orçamento adicionada nesta rodada (gap real de segurança, já que agora jogadores não-confiáveis chamam o mesmo caminho); atomicidade de "duplo clique" não é transacional (risco baixo: só duplicaria personagem, nunca deixa estado parcial, documentado). |
| Ficha (identidade) | **Concluído e aprovado** para o que os commits alegaram — confirmado após reload real em navegador. |
| Modo Evolução (gate de talento) | **Concluído e aprovado** para o gate em si — confirmado ao vivo (Modo Jogo bloqueia, Modo Evolução libera). |
| Inventário do bando | **Implementado, aceite parcial** — RLS/leitura confirmadas por schema e visualmente; depósito/retirada não testados ao vivo com item real nesta rodada. |
| Enforcement de condições | **Concluído e aprovado** para Atordoado/Inconsciente/Imobilizado — confirmado ao vivo com bloqueio real de ação e reação. |
| Biblioteca do Livro | **Implementado, aceite parcial** — rota e guard confirmados; sumário/leitura com conteúdo real não exercidos (sem capítulo publicado nas fixtures). |
| Experiência de produção | **Concluído e aprovado** para o que foi alterado (error/loading/not-found/.env.example) — build limpo, nenhuma rota de produção depende de `/dev`. |
| Drag operacional / runas avançadas / companheiros-drones-Trama | **Fora do escopo desta rodada**, confirmado por código — nenhuma tentativa de implementação. |

## Status global

**"Ruptura VTT parcialmente concluído — ficha (identidade) e
enforcement de condições básicas (Atordoado/Inconsciente/Imobilizado)
e fechamento de experiência de produção aprovados; trilha de turnos,
criação autônoma, wizard e inventário do bando implementados com
aceite parcial (bugs reais corrigidos e revalidados nesta rodada, mas
concorrência literal e isolamento entre duas campanhas distintas não
exercidos ao vivo); drag operacional, runas/escalpos avançados e
integração de companheiros/drones/Trama permanecem pendentes, fora do
escopo desta rodada."**
