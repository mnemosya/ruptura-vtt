# Checkpoint — Reestrutura da área de campanha: Fases −1, 0 e 1

**Data**: 2026-08-13
**Commit-base**: `d44435d`
**Escopo**: as três primeiras fases de um plano de reestruturação geral da área de campanha (`/mesas/[campaignId]/...`), adotando padrões de UX de VTTs como Roll20/Foundry (chat/log persistente, rastreador de turno sempre visível, roster de participantes) e a linguagem HUD já estabelecida em auth/dashboard/Console. Cobre especificação de UX, os contratos de dados que a sustentam (roster seguro, identidade de sessão) e o provider de Realtime que os mantém vivos entre rotas. **Não inclui nenhuma mudança visual ainda** — isso começa na Fase 2. Plano completo em `/Users/gabi/.claude/plans/peppy-rolling-valiant.md`.

---

## 1. Contexto e processo

O pedido original — "desenvolva um plano de redesign da área da campanha" — passou por uma etapa extensa de planejamento colaborativo antes de qualquer código: duas explorações paralelas (vocabulário de design das três áreas já feitas; mapeamento da área de campanha atual), uma primeira proposta de plano, e **três rodadas de revisão do usuário**, cada uma corrigindo suposições contra o código real (contrato de roster inseguro, canal Realtime que ficaria órfão, `TurnTrackPanel` que não sustenta uma variante compacta só com uma prop, ficha que já tinha infraestrutura de modal pronta e não precisava de decisão nova, semântica ARIA errada no trilho de navegação, entre outras). O plano final incorpora todas essas correções.

Decisão de escopo tomada na aprovação: **reestruturação geral, não reskin** — pode mudar navegação e composição de páginas, não só CSS. **Mobile foi removido do escopo** ao aprovar a Fase −1 (só amplo ≥1280px e intermediário 768–1279px).

## 2. Fase −1 — Especificação de UX

Wireframes entregues como artifact interativo (dessaturado de propósito: cyan marca só o que persiste entre rotas, cinza é conteúdo roteado, âmbar é exclusivo do narrador — a cor codifica a decisão da fase, não decora) e aprovados pelo usuário.

Definido:
- Layout amplo e intermediário para os dois papéis (narrador/jogador).
- **Composição própria da Mesa do jogador** — sem "Resolver Ataque", ela ganha conteúdo dedicado (cena/rodada em leitura, personagens controlados, resumo do turno, atividade recente), em vez de ser "a Mesa do narrador com menos coisa".
- `TurnTrackDock` compacto/expandido com 5 estados mapeados diretamente sobre os campos reais de `TurnTrackState` (`round`, `window`, `order[]`, `currentIndex`, `side`, `reflexos`, `actedRapida`/`actedLenta`) — nada inventado.
- `SessionPanel` com abas Log/Participantes: autoscroll condicional (não arranca o scroll de quem rolou pra ler algo), contador de não lidos, recolhido por padrão em telas de foco (Conteúdo da campanha, editor de rascunho, wizard), sem badge de presença falsa antes da Fase 3b.
- Dois indicadores de sincronização separados (sessão vs. personagens) em vez de um agregado.
- Navegação: "Livro" movido para o grupo Jogo do trilho (é leitura para os dois papéis — deixá-lo perto de Configurações sugeria erroneamente que era coisa de narrador), deixando "Gerenciar" puramente administrativo.

## 3. Fase 0 — Contratos de dados

### RPC de roster (`supabase/migrations/0061_campaign_roster.sql`)

Nova função `list_campaign_roster(campaign_id)`, `security definer`, legível por qualquer participante ativo — diferente das duas leituras que já existiam e que **nenhuma** servia para um roster de sessão:
- `listCampaignMembers` tem RLS que restringe jogador a ver só a própria linha;
- `getCampaignParticipantInfo` só responde ao narrador e inclui e-mail.

Dois achados de exploração mudaram o desenho da função:

1. **O narrador não está em `campaign_members` nas campanhas criadas depois da migration 0026.** O backfill que inseriu o dono como membro (`role='owner'`) foi único, e `createCampaign` (`src/lib/table/storage.ts`) só insere em `campaigns`, sem trigger. Ler membros e confiar em `role='owner'` faria o narrador sumir nas campanhas novas e aparecer duplicado nas antigas. A RPC deriva o narrador sempre de `campaigns.owner_id`, e exclui esse id do lado dos jogadores (`m.user_id is distinct from c.owner_id`) — testado nos dois cenários (campanha com e sem a linha de backfill).
2. **O fallback de nome não deriva do e-mail.** `get_campaign_participant_info` usa `split_part(email,'@',1)` como fallback, mas só responde ao narrador (que já vê o e-mail inteiro por outro caminho). Como o roster é lido por qualquer participante, esse fallback vazaria o local-part do e-mail de um jogador para os colegas de mesa — trocado por um rótulo genérico ("Jogador sem nome"). Custo aceito conscientemente: como `display_name` é opcional no cadastro, várias contas sem nome ficam indistinguíveis no painel; o caminho de correção é a própria pessoa preencher o nome em "Conta e preferências".

`listCampaignRoster` + tipo `CampaignRosterEntry` em `src/lib/table/storage.ts` — mapeamento de papel **fail-closed**: uma linha com `role` fora de `"narrator"`/`"player"` é descartada, não promovida ao papel mais permissivo.

**`scripts/dev/validate-campaign-roster.mjs`** — 10 critérios de segurança testados contra o Supabase real (clients autenticados de verdade, service role só para fixtures), fixtures autolimpantes:
1. participante ativo vê o roster · 2. externo não vê nada · 3. removido/convidado não aparecem · 4. removido não consegue ler · 5. nenhum e-mail retornado · 6. narrador 1× (campanha sem linha de dono) · 7. narrador 1× (campanha com linha de dono, pós-backfill) · 8. isolamento entre campanhas · 9. nome de exibição, nunca UUID · 10. conta sem nome não vaza local-part do e-mail.

Todos os 10 passam contra o banco real; migration aplicada no projeto `ruptura-vtt` (Supabase).

### Identidade de sessão (`src/lib/campaign/session.ts`)

`CampaignSessionViewer { userId, controlledCharacterIds }` — base de "é a minha vez" e "meus personagens" no dock de turno e na Mesa do jogador. `resolveCampaignSessionViewer(campaignId, userId)` reaproveita `listControlledCharacters` (já existente), mas aplica uma garantia que a fonte original **não** dava: filtra personagens arquivados explicitamente (cada chamador filtrava por conta própria antes; agora é parte do contrato). Falha na leitura degrada para "não controla ninguém" — o dock fica só em leitura em vez de oferecer uma ação que o servidor recusaria depois.

Recebe `userId` já resolvido em vez de chamar `getCurrentUser()` de novo (que não é memoizado) — evita uma segunda validação de token por request, já que quem chama isto (`layout.tsx`) acabou de rodar `resolveCampaignAccess`.

## 4. Fase 1 — Provider persistente

### `CampaignRealtimeProvider` (`_shell/CampaignRealtimeProvider.tsx`, novo)

Context montado no `layout.tsx` da campanha, envolvendo `CampaignShell` — expõe `{campaign, setCampaign, logs, roster, viewer, sessionSyncStatus, sessionError, reloadCampaign, reloadLogs, reloadMembers}` para qualquer painel que precise, inclusive os que ainda não existem (Fase 3).

**Achado que mudou o desenho**: `useCampaignRealtime` (hook original) sempre abria os três canais (`campaigns`, `characters`, `table_logs`) e agregava os três status num só. Passar um no-op pro callback de personagens no provider ainda deixaria o canal aberto em toda rota da campanha, e o status dele entraria no agregado — destruindo a separação de indicadores que a Fase −1 já tinha definido. O hook foi **dividido em dois** (`src/lib/realtime/useCampaignRealtime.ts`, reescrito):
- `useCampaignSessionRealtime` — só `campaigns` + `table_logs`, usado pelo provider.
- `useCampaignCharactersRealtime` — só `characters`, usado localmente pela Mesa do narrador (única coisa que depende da lista de personagens, e ela vem com payload pesado que nenhuma outra rota deveria pagar).

O hook combinado original foi removido (não só deprecado) — `MesaClient.tsx` era o único outro consumidor, então a divisão foi segura e evita reintroduzir o bug de canal duplicado no futuro.

### `layout.tsx`

Ganhou dois fetches: `resolveCampaignSessionViewer` (viewer) e, via `Promise.allSettled`, log inicial (`listLogsForViewer`, já filtrado por visibilidade) e roster inicial. `campaign` não custou consulta extra — `resolveCampaignAccess` já a busca inteira (com `turn_track`) e é memoizada por request. Nenhuma dessas leituras pode derrubar a campanha inteira: falha em log/roster degrada para painel vazio, recuperável pelo botão de recarregar.

### `MesaClient.tsx` (reescrito)

Consome `campaign`/`logs` do contexto em vez de gerenciar estado próprio; mantém `personagensAtivos` e o canal `characters` localmente, com indicador de sync **próprio** (`mesa-sync-status-personagens`, novo `data-testid`) ao lado do indicador de sessão (`mesa-sync-status`).

### `page.tsx`

Parou de buscar campanha/log — evita fetch duplicado do que subiu para o layout.

## 5. Verificação e ferramentas de suporte novas

**`scripts/dev/refresh-admin-session.ts`** (novo) — o cookie de sessão salvo por `save-admin-session.ts` vale 7 dias, mas o JWT dentro dele expira em ~1h (limitação dev já documentada em `src/lib/auth/session.ts`: sem rotação de refresh token no servidor). Sem isso, todo browser check autenticado feito mais de uma hora depois do login falha caindo na tela de login — fácil de confundir com regressão real. O script troca o refresh token que já está salvo no arquivo pelo mesmo endpoint de Auth, sem nunca ler ou pedir senha; falha explicitamente (nunca finge sucesso) se o refresh também tiver expirado.

**`scripts/dev/check-campanha-provider-fase1.ts`** (novo) — browser check headless autenticado, 9 critérios: Mesa sem regressão visual/funcional; dois indicadores de sync distintos e ambos conectando; navegação client-side Mesa→Personagens sem quebrar a casca; **entrada direta** numa rota que não é a Mesa hidratando o provider corretamente (prova de que log/roster realmente vivem no layout, não emprestados da Mesa); volta pra Mesa íntegra; console limpo nas rotas da campanha. Todos os 9 passam.

Achado de passagem, não relacionado a esta reestrutura: `mesas/_global/parts.tsx:63` referencia `/brand/app-hud.png`, mas o arquivo em disco é `app-hud.jpg` — 404 em todo load do dashboard `/mesas`, cards caindo só no gradiente sem a imagem de fundo. Fora do escopo desta fase (é o dashboard "minhas campanhas", já redesenhado antes); sinalizado como task separada, não corrigido aqui.

`npx tsc --noEmit` e `npm run build` limpos em todas as fases.

## 6. Arquivos

**Criados**: `supabase/migrations/0061_campaign_roster.sql`, `src/lib/campaign/session.ts`, `src/app/mesas/[campaignId]/_shell/CampaignRealtimeProvider.tsx`, `scripts/dev/validate-campaign-roster.mjs`, `scripts/dev/refresh-admin-session.ts`, `scripts/dev/check-campanha-provider-fase1.ts`.
**Reescritos**: `src/lib/realtime/useCampaignRealtime.ts` (dividido em dois hooks), `src/app/mesas/[campaignId]/MesaClient.tsx`.
**Alterados**: `src/lib/table/storage.ts` (`listCampaignRoster`), `src/app/mesas/[campaignId]/layout.tsx`, `src/app/mesas/[campaignId]/page.tsx`.

## 7. Próximo passo

Fase 2 — casca visual: `src/app/_design/mesa.css` (nova folha, namespace `rm-*`), `CampaignShell`/`CampaignNavRail` (trilho de ícones com `aria-current="page"`, não `aria-selected` — o rail representa rotas reais, diferente do `rc-tabrail` do Console que é tabs), cursor HUD, infraestrutura genérica de drawer. Primeira fase com mudança visual de verdade.
