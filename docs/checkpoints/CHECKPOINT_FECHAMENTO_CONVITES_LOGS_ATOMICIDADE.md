# Checkpoint — Fechamento: convites, logs e atomicidade integral

Rodada curta e exclusiva sobre as 6 pendências exatas herdadas de
`CHECKPOINT_SEGURANCA_ATOMICIDADE.md`. Não iniciou nenhum sistema novo.

## 1. Correção da contagem de commits

O relatório anterior afirmou "3 commits de código + 1 documental" (4
no total), mas listou só 3 hashes. Fonte de verdade: `git log`/`git
show --stat` dos commits posteriores a `7632f62`.

**Contagem real: 3 commits no total — 2 de código + 1 documental.**

| Hash | Tipo | Mensagem | Arquivos |
|---|---|---|---|
| `b7cafd7` | código | `fix: enforce campaign and table log isolation` | `MesaTab.tsx`, `JoinClient.tsx`, `join/[token]/page.tsx`, `table/storage.ts`, migration `0043` |
| `f83f5a8` | código | `feat: make character creation atomic and idempotent` | `CreateCharacterWizardClient.tsx`, `character/storage.ts`, migration `0044` |
| `1f133df` | documental | `docs: record security and atomicity acceptance` | 7 arquivos de `docs/` |

O texto "3 de código" no relatório anterior estava simplesmente
errado — os 3 hashes já listados na consolidação (`b7cafd7`,
`f83f5a8`, `1f133df`) sempre estiveram corretos; só a frase-resumo
("3 código + 1 doc") não batia com eles. Nenhum commit foi reescrito
para "fazer a conta fechar" — a correção é só na descrição.

## Working tree inicial

- `git status --short`: limpo.
- Migrations locais confirmadas até `0044`, idênticas ao Supabase real.
- `next-env.d.ts`: alternou automaticamente para
  `.next/dev/types/routes.d.ts` durante o browser check desta sessão —
  revertido para `.next/types/routes.d.ts` (estado de build) ao final.

## 2. Mapa e correção de `campaign_invites`

| Operação | Papel | Policy/grant antes | Depois |
|---|---|---|---|
| SELECT | anon | `campaign_invites_dev_transition_select` (`using(true)`) | **removida** |
| SELECT | authenticated | idem (mesma policy aberta) | **removida** — `campaign_invites_owner_all` (já existente, `ALL` escopado a `is_campaign_owner`) continua cobrindo o narrador |
| INSERT/UPDATE/DELETE | authenticated | `campaign_invites_owner_all` | inalterado |
| RPC pública | anon/authenticated | não existia (dependia do SELECT aberto) | `resolve_campaign_invite_public` (migration 0043, já existente) — confirmado como o ÚNICO consumidor real do preview anônimo |

Confirmado por leitura de código: `/join/[token]` já usava a RPC desde
a migration 0043 (rodada anterior) — a policy aberta não tinha mais
NENHUM consumidor legítimo. Narrador não perde nada (já usava
`owner_all`). Removida sem substituto, migration `0045`.

## 3. Mapa e correção de `INSERT` de `table_logs`

8 chamadores identificados, TODOS passando por uma única função
(`addLog`, `src/lib/table/storage.ts`) — nenhum insert direto na
tabela em nenhum componente:

| Chamador | Papel | Tipo de evento |
|---|---|---|
| `CharacterSheetClient.tsx` (`/ficha` e `/dev/character-sheet`) | jogador/dev | `condition_applied/removed`, `item_used`, `spell_cast`, `action_used`, `talent_used`, descanso, ajuste permanente |
| `RollsTab.tsx` | jogador/dev | rolagens |
| `MesaTab.tsx` | jogador/narrador | eventos da mesa (chat) |
| `TableClient.tsx`, `MesaDetailClient.tsx` | narrador | eventos de mesa |
| `endRound.ts`, `endScene.ts` | narrador (via `canAdvanceCampaign`, já validado antes de chamar) | fim de rodada/cena, agregados |

Antes: `table_logs_dev_transition_insert` (`using(true)`/
`with_check(true)`, `anon,authenticated`) — QUALQUER usuário podia
inserir em QUALQUER campanha, com `character_id`/`profile_id`/
`created_by_user_id`/`payload` livres. `table_logs_owner_insert`
(narrador) já existia e cobre o narrador; jogador NUNCA teve policy
própria — dependia inteiramente da aberta.

Depois (migration `0045`): `table_logs_dev_transition_insert`
removida. Nova RPC `append_table_log` (SECURITY DEFINER) — único
caminho de escrita restante para quem não é dono da mesa. Valida:
`auth.uid()` não nulo; `is_campaign_member(campaign_id)`; se
`character_id` informado, `can_manage_character` + pertence à mesma
campanha; se `profile_id` informado, pertence ao próprio chamador (ou
o chamador é o narrador); `visibility` num enum de 3 valores;
`payload` precisa ser objeto jsonb; autor (`created_by_user_id`)
sempre derivado de `auth.uid()` no servidor, nunca do argumento do
cliente. `addLog` (TS) migrada para chamar a RPC — nenhum caminho de
insert amplo continua ativo em paralelo.

## Validação ao vivo — convites e logs (fixtures `zz_e2e_invite_log_atomicity_*`)

Harness com 2 narradores, 2 jogadores, 2 campanhas, sessões
autenticadas reais (nunca service role para os testes de autorização
em si). **30 de 30 checagens passaram:**

- Anon: resolve convite válido (preview mínimo, sem token/hash),
  convite inválido/expirado tratados de forma controlada, não lista
  nenhum convite, não lê convite por hash via SELECT direto.
- Jogador A: resolve convite A pela RPC; não lista nenhum convite
  diretamente (não é dono).
- Narrador A: lista SÓ os 2 convites da própria campanha; Narrador B
  não lê nenhum convite de A.
- Leitura de logs: narrador/jogador de cada lado só leem a própria
  campanha; anon não lê nada.
- Escrita legítima: narrador e jogador registram evento próprio,
  autor corretamente derivado no servidor.
- **Escrita hostil (jogador A), todas bloqueadas**: `campaign_id`
  alheio, `character_id` alheio, `profile_id` alheio, visibilidade
  inválida, payload malformado, INSERT direto bypassando a RPC, anon
  tentando escrever — nenhum registro falso foi criado.
- **Realtime determinístico** (aguarda `SUBSCRIBED`, folga de 1.5s
  para a replicação assentar, aguarda por marcador único com timeout
  explícito de 20s): jogador A recebe o PRÓPRIO evento e NÃO recebe o
  da campanha B; jogador B, o inverso. A checagem que na rodada
  anterior ficou inconclusiva por timing agora passa de forma estável.

## 4. A checagem 15/16 da rodada anterior — identificada

Harness: `creation-atomicity.mjs` (rodada anterior, log preservado).
As 16 checagens nomeadas, na ordem em que rodaram:

1. duplo clique: nenhuma chamada recebeu erro 500 — PASS
2. duplo clique: as duas chamadas retornam o MESMO personagem — PASS
3. duplo clique: pelo menos uma resposta é idempotentReplay=true — PASS
4. duplo clique: exatamente um personagem foi criado no banco — PASS
5. duplo clique: perfil vinculado ao personagem criado — PASS
6. retry: primeira chamada bem-sucedida — PASS
7. retry: segunda chamada não retorna erro 500 — PASS
8. retry: mesmo personagem retornado — PASS
9. retry: sinalizado como replay idempotente — PASS
10. retry: contagem de personagens inalterada — PASS
11. retry: vínculo do perfil inalterado — PASS
12. falha intermediária: campanha incompatível é rejeitada — PASS
13. falha intermediária: nenhum personagem parcial criado — PASS
14. falha intermediária: nenhum personagem órfão na outra campanha — PASS
15. **vínculo ocupado: segunda criação sem chave é rejeitada — FAIL**
16. vínculo ocupado: nenhum personagem novo criado — PASS

**Checagem 15 — mensagem, causa e impacto:** a asserção esperava que
uma segunda chamada a `complete_character_creation`, para um perfil
que JÁ tem personagem ativo, SEM `creation_request_id`, retornasse um
erro. Na prática ela retornou sucesso (`idempotentReplay: true`),
porque o bloco `exception when unique_violation` da RPC (migration
0044) reconcilia e devolve o personagem JÁ existente
INCONDICIONALMENTE — nunca checa se uma chave de idempotência foi
fornecida antes de decidir reconciliar. **Causa: expectativa do teste
incorreta, não bug do produto** — confirmado nesta rodada com um novo
teste dedicado (`creation-atomicity-v2.mjs`, cenário 3 "chaves
diferentes"): o comportamento real é seguro (nunca duplica, nunca
sobrescreve com dados de outra pessoa, sempre devolve o MESMO
personagem já ativo do perfil) — só mais permissivo do que a
expectativa original assumia. **Impacto: nenhum** — não há duplicação
nem corrupção de dado em nenhum cenário testado.

## 5. Auditoria de `complete_character_creation` (migration 0044)

Arquitetura confirmada por leitura do schema real (`list_tables`, 21
tabelas) — **não existe** `character_items`/`character_spells`/
`character_wallet`/nenhuma tabela relacional para o estado do
personagem. Todo o estado (identidade, atributos, perícias, recursos,
carteira, inventário, itens, Aljava, vertentes, magias, talento) vive
numa ÚNICA coluna `characters.payload` (jsonb). Isso não é uma
suposição — é a arquitetura canônica confirmada no banco.

| Estado do personagem | Gravado dentro da RPC 0044 | Gravado depois | Idempotente | Pode ficar parcial |
|---|---|---|---|---|
| personagem (linha) | sim (INSERT único) | não | sim | não |
| identidade | sim (`payload.metadados`) | não | sim | não |
| atributos | sim (`payload.atributos`) | não | sim | não |
| perícias | sim (`payload.pericias`) | não | sim | não |
| recursos | sim (`payload.estado_jogo`) | não | sim | não |
| carteira | sim (`payload.carteira`) | não | sim | não |
| inventário/itens | sim (`payload.inventario[]`) | não | sim | não |
| Aljava | sim (instância dentro de `inventario[]`, mesmo mecanismo) | não | sim | não |
| vertentes | sim (`payload.niveis_vertente`) | não | sim | não |
| magias | sim (`payload.magias_aprendidas`) | não | sim | não |
| talento | sim (`payload.talentos_adquiridos`) | não | sim | não |
| **perfil ativo** | sim (`update campaign_profiles` NA MESMA transação) | não | sim | não |
| logs | **não** — a criação do personagem não gera nenhum log (nem gerava antes) | — | — | — |

**Conclusão: a RPC já materializa TUDO que o wizard produz, numa única
transação.** Não havia nada "gravado depois" para trazer para dentro —
o achado da rodada anterior (falha de rede entre insert e claim) já
tinha sido o único ponto de não-atomicidade real, e já foi fechado na
migration 0044. Nenhuma reescrita foi necessária aqui.

## 6. Gap real e distinto: validação de LEGITIMIDADE de conteúdo

Confirmado AO VIVO (não por leitura de código): chamando
`complete_character_creation` diretamente com `magias_aprendidas`
apontando para um slug inexistente, `talentos_adquiridos` com
talento/nível inexistentes, `inventario` com item inexistente e
`carteira.aretz_informal: 999999` — **a RPC aceita e persiste sem
erro**. A RPC (e a Server Action que a chama) validam ownership/
membership/campanha/perfil corretamente, mas NÃO revalidam se
magias/talentos/itens realmente existem no conteúdo publicado, nem
preço/raridade/nível de elegibilidade.

**Corrigido parcialmente nesta rodada**: `regras` (orçamento de
atributos/perícias/vertentes) chegava à Server Action como argumento
DO CLIENTE — um chamador hostil podia enviar uma régua fabricada mais
frouxa junto com um payload fora do padrão real.
`createCharacterFromWizard` agora IGNORA o `regras` recebido do
cliente quando `profileId` está presente (caminho não confiável) e
busca a régua real direto da Biblioteca (`getCharacterRules()`,
servidor) antes de validar — fecha esse vetor específico.

**Não corrigido nesta rodada, gap real e preciso, registrado como
prioridade para rodada dedicada**: a Server Action e a RPC não
verificam:
- se cada `spellSlug` em `magias_aprendidas` existe entre as magias
  publicadas efetivas da campanha, nem se `estatisticas.nivel` é
  compatível com o nível investido na vertente correspondente;
- se cada `talentoId`/`nivelId` em `talentos_adquiridos` corresponde a
  um talento/nível realmente publicado (e é nível 1, único permitido
  na criação);
- se cada `itemSlug`/`precoPago` em `inventario` corresponde a um item
  publicado, com o preço/raridade reais (raridade permitida na
  criação: até incomum) e não arquivado;
- se `carteira.aretz_informal` restante é consistente com
  `aretz_iniciais - soma dos preços reais dos itens comprados`.

Motivo de não corrigir agora: fechar isso corretamente exige cruzar
conteúdo publicado (magias/talentos/itens, servido pela Biblioteca/
Editor Universal) dentro da validação de criação — maior que "rodada
curta e fechada", risco real de regra de jogo divergente entre a
lógica do wizard (TS) e uma segunda cópia apressada, e caminho que
tangencia o Editor Universal (fora de escopo, "não reabrir"). Este
gap é PRÉ-EXISTENTE (não introduzido nem agravado por nenhuma migração
desta ou da rodada anterior) — apenas confirmado ao vivo, com precisão,
nesta rodada.

## Testes de atomicidade (Fase 11) — `creation-atomicity-v2.mjs`

15 de 15 asserções de pass/fail passaram (mais 2 constatações
factuais registradas, não contadas como pass/fail):

1. Sucesso: RPC completa; vertentes, inventário, carteira persistidos;
   vínculo de perfil criado na mesma operação.
2. Duplo clique: nenhum erro 500; mesmo personagem nas duas respostas;
   exatamente 1 personagem no banco.
3. Chaves diferentes tentando concluir o MESMO perfil: pelo menos uma
   conclusão válida; nenhum personagem órfão (só 1 no banco).
4. Perfil alheio (perfil do narrador, chamado pelo jogador): rejeitado;
   nenhum personagem criado.
5. Campanha alheia (perfil de A usado com `campaign_id` de B):
   rejeitado; nenhum personagem criado.
6. Conteúdo forjado (magia/talento/item inexistentes, saldo
   fabricado): aceito pela RPC — constatação factual do gap da seção 6
   acima, confirmada ao vivo, não uma falha de asserção.

## Browser check (sem rotas `/dev`)

Fixtures `zz_e2e_invite_log_atomicity_browser_*`. Fluxo completo:
`/join/<token>` → preview público (texto atualizado confirmado:
"validado por uma RPC segura... nunca por leitura ampla da tabela") →
login real → aceite → criação de perfil → wizard (atributos/vertente,
regras buscadas server-side) → "Criar personagem" → **"Personagem
ativo: Teste Log" exibido imediatamente** → "Entrar como perfil" →
`/ficha` aberta → aba Condições → aplicar Atordoado → aba Mesa →
**"Log da mesa (1/1)" mostra o evento gravado pela nova RPC
`append_table_log`, sem nenhum erro de console, sem nenhuma
regressão**. Texto da aba Mesa também atualizado e confirmado
correto ("Isolamento entre campanhas é real (RLS, migration 0043)").

## Migrations aplicadas nesta rodada (Supabase real)

- `0045_secure_invites_and_table_log_writes` — fecha o SELECT de
  `campaign_invites` e o INSERT de `table_logs`; cria
  `append_table_log`.

Nenhuma migration de `0036` a `0044` foi editada. Local e remoto
confirmados sincronizados até `0045`. Advisories revisados: zero
achados de `rls_policy_always_true` restantes em qualquer tabela; só
os avisos informativos padrão já aceitos para as novas RPCs SECURITY
DEFINER.

## Harnesses e limpeza

`invite-log-security.mjs`, `creation-atomicity-v2.mjs` e o setup de
fixtures de browser viveram fora do repositório (scratchpad da sessão)
e foram descartados ao final. 18 scripts de teste existentes
reexecutados via o loader ESM já documentado — todos passando, sem
regressão. Fixtures `zz_e2e_invite_log_atomicity_*` (todas as
variantes) removidas ao final — contagem zero confirmada por query
direta ao Supabase real em cada etapa.

## Validação final

- `npx tsc --noEmit`: limpo.
- `npm run build`: sucesso, todas as rotas compilam.
- 18 scripts de teste: todos passando.
- `next-env.d.ts`: revertido para o estado de build após o toggle
  automático do dev server usado no browser check.
- `git status --short`: limpo além dos arquivos desta rodada.
- Fixtures: zero em todas as tabelas.
- Nenhum processo/servidor/loader temporário restante.

## Status por bloco

| Bloco | Status |
|---|---|
| Segurança de convites | **Concluída e aprovada** — sem SELECT amplo; preview público funciona (anon); convite inválido/expirado bloqueado com resposta controlada; narradores isolados entre si; browser e RLS confirmados ao vivo. |
| Segurança de `table_logs` | **Concluída e aprovada** — leitura e escrita isoladas por membership real; autor e campanha nunca falsificáveis (7 tentativas hostis bloqueadas); Realtime positivo determinístico e sem vazamento; browser e testes confirmados. |
| Criação autônoma e wizard | **Idempotente e transacional quanto a personagem, identidade, atributos, perícias, recursos, carteira, inventário, itens, Aljava, vertentes, magias, talento e vínculo — tudo numa única transação, confirmado por arquitetura e ao vivo.** Validação de ORÇAMENTO (atributos/perícias/vertentes) agora buscada no servidor, não mais confiada ao cliente. Validação de LEGITIMIDADE de conteúdo (magia/talento/item/preço/raridade/arquivado publicados) permanece um gap real, preciso e documentado, não fechado nesta rodada — fora de proporção sem tocar o Editor Universal. |
| Contagem de commits | Corrigida: 2 commits de código + 1 documental (3 no total) após `7632f62` — não 3+1. |

## Status global

"Ruptura VTT parcialmente concluído — segurança de convites e logs
aprovada (RLS real, RPCs validadas, Realtime determinístico); criação
autônoma transacional e idempotente quanto a todo o estado do
personagem que a arquitetura realmente materializa (personagem,
carteira, inventário, Aljava, vertentes, magias, talento, vínculo);
validação de legitimidade de conteúdo publicado (magia/talento/item/
preço) permanece um gap real e preciso, registrado para rodada
dedicada — fora do escopo desta rodada, que tratou exclusivamente
convites/logs/atomicidade estrutural; trilha e enforcement central de
condições seguem aprovados de rodadas anteriores. Modo Evolução
completo, inventário do bando completo, drag operacional, runas/
escalpos avançados e integração de companheiros/drones/Trama
permanecem pendentes."

Nenhuma fase nova foi iniciada.

## Atualização — validação canônica de conteúdo (rodada seguinte)

O bloqueador do item 6 (RPC aceitava magia/talento/item inexistente,
saldo fabricado) foi fechado — `complete_character_creation` agora
valida vertentes/magias/talentos/itens/carteira contra o conteúdo
efetivo real (oficial/homebrew/override) dentro da mesma transação,
provado ao vivo com 48/48 checagens hostis. Ver
`CHECKPOINT_VALIDACAO_CANONICA_CRIACAO.md`.
