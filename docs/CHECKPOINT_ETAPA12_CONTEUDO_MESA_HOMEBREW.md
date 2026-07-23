# Checkpoint — Etapa 12: Conteúdo de mesa e homebrew

## Status

**Status geral da Etapa 12: Implementação parcial — integração de jogadores, referências completas e validação transacional/RLS em Supabase pendentes.**

Este checkpoint acumula DUAS correções sobre a implementação original (commits `953612d`/`693aafd`):

- **Correção 1** (`4ff8081`/`e37495a`, migration `0026`): a leitura de `campaign_content_documents` publicado estava protegida só por `campaign_id` + a mesma policy permissiva (`anon, authenticated`) já usada por `characters`/`campaign_profiles`/`table_logs` — **conhecer o `campaign_id` nunca comprovou pertencimento à campanha**. Corrigida: leitura passou a exigir `can_read_campaign_content()` (membership real), mas só o DONO tinha um `auth.uid()` real para virar membro — não existia NENHUM caminho para um JOGADOR se tornar membro de verdade.
- **Correção 2** (esta sessão, migration `0027`): fecha esse caminho. `/join/[token]` agora exige uma sessão real do Supabase Auth (reaproveitando `LoginForm`/`signInWithPassword`/`signUpDevNarrator`, a MESMA infraestrutura já usada pelo narrador) e aceita o convite via `accept_campaign_invite` (RPC transacional), criando/ativando `campaign_members` com `role='player'`. Também adiciona o índice estruturado `campaign_content_references` (recalculado a cada publicação) e substitui a checagem ad-hoc de impacto por uma consulta a esse índice.

**Por que o status NÃO desce ainda para "só falta validar banco e browser"**: as referências estruturadas continuam PARCIAIS (cobrem requisitos/condição/propriedades — o que `coletarReferenciasBrutas`, Etapa 11, já extraía — mas não item concedido, runa referenciada explicitamente, efeitos compostos ou dependências companheiro/Trama), e NADA do fluxo de autenticação/membership/RLS/índice foi verificado contra um Supabase real nesta sessão. Os critérios do próprio pedido para baixar de status exigem referências completas E jogador lendo conteúdo efetivo comprovadamente — nenhum dos dois está satisfeito o bastante ainda.

A Etapa 11 **permanece exatamente**: "Implementação parcial — integração editorial de drag pendente" — nada nesta correção altera esse status.

## 0. Correção 2 — autenticação real de jogador (migration 0027)

### 0.1 Auditoria de autenticação (resumo)

| Item | Estado encontrado |
|---|---|
| Supabase Auth | JÁ EXISTE e funciona — `signInWithPassword`/`signUpDevNarrator` (`src/lib/auth/actions.ts`), cookie httpOnly (`session.ts`), `getCurrentUser()`. Usado até agora só pelo narrador (`/login`, `/dev/login`), mas a implementação não é narrador-específica — reutilizável tal qual para jogador. |
| `/join/[token]` (entrada por convite) | Inteiramente ANÔNIMA antes desta correção — nenhuma checagem de sessão, vai direto para `JoinClient` (escolha de perfil via `profile_sessions`, sem `auth.uid()`). |
| `campaign_invites` (migration 0008) | Multi-uso por design (sem `accepted_by`/`used_at`; `is_active` persiste até revogado) — um link é compartilhado pelo grupo inteiro. "Reutilização indevida" = usar um token revogado/expirado, NUNCA "duas pessoas diferentes usarem o mesmo link" (esse é o comportamento correto e intencional do produto). |
| `campaign_profiles`/`profile_sessions`/`characters` | Seguem SEM `user_id` — nenhum vínculo com `auth.users`. Não alterados nesta correção (ver §0.4). |
| Vínculo perfil/personagem ↔ usuário autenticado | **Não implementado** — decisão deliberada (ver §0.4), não uma omissão. |

### 0.2 Fluxo novo de aceite de convite

1. Visitante abre `/join/[token]` → convite resolvido normalmente (`resolveCampaignInvite`, inalterado).
2. Se não há sessão Supabase Auth (`getCurrentUser()` retorna `null`): a página mostra `<LoginForm redirectTo={"/join/"+token} context="prod" />` — MESMO componente do narrador, sem duplicar formulário. Login/cadastro bem-sucedido faz `router.push`/`refresh` de volta para o MESMO link de convite.
3. Com sessão confirmada: a página chama `acceptCampaignInvite(token)` (Server Action nova) → RPC `accept_campaign_invite` (`SECURITY DEFINER`): exige `auth.uid()`, valida hash do token/revogado/inativo/expirado, faz `upsert` em `campaign_members` (`role='player'`, `status='active'`, `invite_id`, `invited_by`, `joined_at`) — idempotente para o MESMO usuário (reaceitar só reativa).
4. Só então a página renderiza `JoinClient` (escolha/criação de perfil, fluxo INALTERADO) — o jogador agora tem tanto uma sessão Auth real (para RLS) quanto o perfil/personagem de sempre (para a mesa).

### 0.3 Consequência real

A partir de agora, um jogador que aceitou o convite tem `auth.uid()` real e é membro `active` de `campaign_members` — `can_read_campaign_content()` passa a autorizá-lo de verdade, e `listCampaignContentDocumentsPublic`/`getCampaignContentDocumentPublic` (que já usavam o client "scoped" desde a Correção 1) passam a devolver override/homebrew publicados para ele. **Isto não foi verificado contra um Supabase real nesta sessão** — a lógica foi revisada estaticamente, mas "o jogador lê conteúdo efetivo" continua uma afirmação de design, não uma prova de banco.

### 0.4 Limitação deliberada: sem associação de perfil/personagem

O pedido alertava explicitamente contra associar perfil/personagem "só por conhecer o ID" ou "assumir que o primeiro personagem pertence ao usuário". Como `campaign_profiles`/`characters` não têm `user_id` e não existe uma regra seguramente inferível de qual personagem pertence a qual usuário autenticado, **esta correção NÃO tenta essa associação** — `profile_sessions` continua exatamente como estado auxiliar (escolha de personagem dentro da aba/sessão do navegador), nunca autoridade de acesso. Documentado como gap real, não implementado.

### 0.5 Índice estruturado de referências (`campaign_content_references`, migration 0027)

- Nova tabela, recalculada a cada `publish_campaign_content_draft` (a função foi substituída — mesma migration — para, na MESMA transação da publicação, apagar as entradas antigas do documento e inserir as novas).
- Preenchida por `coletarReferenciasParaIndice` (`campaignContentReferences.ts`), que reaproveita `coletarReferenciasBrutas` (Etapa 11) — cobre requisitos de topo/nível (talento/magia/item) e `condicao`/`condicoes_possiveis` em efeitos e `estatisticas.propriedades` de item. **Não cobre ainda**: item concedido (`conceder_item`), runa referenciada fora de `estatisticas.propriedades`, efeitos compostos filhos, dependências companheiro/Trama — documentado como cobertura parcial, nunca alegado suporte universal.
- `avaliarImpactoRemocao` (`campaignContentImpact.ts`) foi reescrito para consultar este índice como fonte PRIMÁRIA (precisa, não heurística) — a varredura de personagens por substring continua como segundo sinal, auxiliar, nunca a prova principal.
- RLS: só quem gerencia a campanha (`can_manage_campaign_content`) lê o índice — jogador não acessa detalhe administrativo de dependências.

## 1. Auditoria de autorização (matriz completa da Correção 1)

| Tabela | Operação | Usuário esperado | Vínculo de autorização disponível | Policy ANTERIOR (0025) | Falha | Correção proposta (0026) | Compatibilidade | Risco de regressão |
|---|---|---|---|---|---|---|---|---|
| `campaign_content_documents` | SELECT `published` | Membro da campanha (hoje só o narrador dono, já que não há player real) | `campaigns.owner_id = auth.uid()` (único vínculo real) | `anon, authenticated USING(status='published')` — qualquer um com o ID | **Conhecer `campaign_id` ≠ autorização** | `can_read_campaign_content(campaign_id)` — membership real | Narrador continua lendo tudo (é membro `owner`) | Jogador anônimo deixa de ver override/homebrew — DEGRADAÇÃO INTENCIONAL, documentada |
| `campaign_content_documents` | SELECT `archived` | Só narrador/gestor | `owner_id` | `is_campaign_owner` (já correta) | Nenhuma | `can_manage_campaign_content` (mesma semântica, nome correto) | Sem mudança de comportamento | Nenhum |
| `campaign_content_drafts`/`_editor_metadata`/`_changelog` | SELECT/INSERT/UPDATE/DELETE | Só narrador/gestor | `owner_id` | `is_campaign_owner` (já correta) | Nenhuma | `can_manage_campaign_content` | Sem mudança | Nenhum |
| `campaign_members` (nova) | SELECT | O próprio usuário, ou o dono da campanha (todas as linhas) | `auth.uid()` | Não existia | — | `campaign_members_self_read`/`_owner_read_all` | Nova tabela, sem consumidor anterior | Nenhum |
| `campaign_members` | INSERT/UPDATE/DELETE | Fluxo de aceite de convite real (NÃO EXISTE hoje) | Nenhum vínculo real de jogador | — | Não há como autorizar com segurança sem auth real de jogador | **Nenhuma policy de escrita** — só backfill do owner via migration | — | Nenhum (recurso fica inerte até auth real existir) |
| `characters`/`campaign_profiles`/`table_logs` | (referência, não alteradas) | — | Nenhum (identidade por sessão opaca) | `*_dev_transition_*` aberta | Falha pré-existente, fora de escopo desta correção | Nenhuma nesta correção | — | — |

**Confirmação por auditoria de código** (não presumida): `resolveCampaignInvite` (`src/lib/table/storage.ts`) resolve um token e devolve a campanha para um visitante — nunca cria linha vinculada a `auth.uid()`. `campaign_profiles`/`characters` são identificados por `profile_sessions` (token opaco), nunca por `auth.users`. **Não existe autenticação real de jogador no projeto.**

## 2. Decisão de autorização (ordem de preferência aplicada)

1. **Reaproveitar membership real existente** — não há nenhuma para jogador.
2. **Reforçar relação existente que já vincula `auth.uid()` à campanha** — `campaigns.owner_id`, já usada.
3. **Criar estrutura mínima de membership** — feito: `campaign_members` (migration `0026`), mas **populada só com o dono** (backfill `insert ... select owner_id ... where owner_id is not null`). Nenhuma linha de jogador é inventada — não haveria `auth.uid()` de jogador para vincular.

Consequência assumida e documentada: **a leitura de conteúdo efetivo de campanha pelo jogador anônimo fica bloqueada** até existir autenticação real de jogador. `listCampaignContentDocumentsPublic`/`getCampaignContentDocumentPublic` passaram a usar `getScopedTableClient()` (antes usavam o client anon puro); sem sessão, a RLS devolve zero linhas — o resolvedor cai silenciosamente para o oficial puro (nunca lança, nunca vaza dado de campanha para quem não é membro). O narrador (sessão real) continua vendo/publicando tudo normalmente, porque é membro (`owner`) por backfill.

## 3. Funções de autorização (migration `0026`)

- `is_campaign_member(campaign_id, uid default auth.uid())`: owner OU linha ativa em `campaign_members`. `SECURITY DEFINER`, `search_path` explícito, nunca confia em argumento de uid vindo do client (default sempre `auth.uid()`).
- `can_manage_campaign_content(campaign_id, uid)`: hoje idêntica a `is_campaign_owner` (único papel de gestão real é o dono — nenhum papel "narrador convidado" existe no projeto).
- `can_read_campaign_content(campaign_id, uid)`: hoje idêntica a `is_campaign_member`.
- Todas revogadas de `public`, concedidas só a `authenticated` — `anon` não consegue nem executar a checagem.

## 4. RLS corrigida

- `campaign_content_documents_member_read`: SELECT `published` para `authenticated`, exige `can_read_campaign_content`. A policy anterior (`anon, authenticated` sem checagem) foi **removida** (`drop policy`).
- `campaign_content_documents_manager_read_all`: SELECT tudo (incl. `archived`) para quem gerencia a campanha.
- `campaign_content_drafts`/`_editor_metadata`/`_changelog`: realinhadas para `can_manage_campaign_content` (mesmo efeito de antes, nome semântico correto).
- Nenhuma policy de escrita ampla em nenhuma tabela — toda mutação continua só pelas funções `SECURITY DEFINER`.
- Catálogo oficial: **inalterado**.

## 5. Server Actions — autorização revisada

Todas (`criarRascunhoOverride`, `criarRascunhoCopiaHomebrew`, `criarRascunhoHomebrewNovo`, `atualizarRascunhoCampanha`, `publicarRascunhoCampanha`, `manterOverrideAposRevisao`, `criarRascunhoReconciliacao`, `adotarOficialAtual`, `removerOverrideCampanha`, `arquivarHomebrewCampanha`, `previewImpactoRemocao` novo) passam por `requireCampaignNarrator`: obtém o usuário no servidor (`getCurrentUser`), recarrega a campanha do banco (`getCampaign`), compara `owner_id` — nunca confia em `user_id`/autoridade vinda do client. A escrita real (RPC) reforça a MESMA checagem via `can_manage_campaign_content`. `publicarRascunhoCampanha` agora também recalcula limite de payload e de quantidade publicada antes de chamar o RPC (nunca só no client).

## 6. Resolução efetiva — corrigida

`resolveEffectiveContent.ts` não mudou sua lógica de composição (override > oficial, homebrew adicional), mas a fonte de dados (`campaignContentQueries.ts`) agora só devolve linhas de campanha para quem tem sessão autorizada — documentado explicitamente no cabeçalho do módulo. Nenhum cache/memoização existe no projeto para precisar de escopo adicional (ver §14).

## 7. Referências oficiais, locais e efetivas

- `validarCamposCampanha` (em `campaignContentValidation.ts`) ganhou `resolverReferenciaCampanha`: um requisito agora resolve primeiro contra o **oficial** (`content_documents`), e se ausente lá, contra o **conteúdo PUBLICADO da MESMA campanha** (`campaign_content_documents` filtrado por `campaign_id`) — homebrew pode ser dependência válida de outro homebrew/override da mesma mesa.
- **Bloqueio estrutural de referência cruzada entre campanhas**: a consulta de resolução só busca `campaign_id = <esta campanha>` — não existe caminho de código para resolver contra o conteúdo de OUTRA campanha, então uma referência para outra campanha nunca resolve (fica `referência inexistente`, bloqueando a publicação).
- Referência obrigatória ausente continua bloqueando (`erros.push`); referências continuam serializadas no formato legado (`{tipo_conteudo, slug}`) — **nenhuma mudança no contrato de schema canônico** (por isso `docs/SCHEMA_CANONICO_CONTEUDO_V1.md` não precisou de alteração de contrato, só uma nota factual).
- Conteúdo arquivado nunca satisfaz uma referência nova (as consultas de resolução filtram `status='published'`).
- **Limitação que permanece**: a resolução de referência efetiva (override substituindo o oficial na hora de resolver um requisito de OUTRO documento) não foi implementada — hoje um requisito resolve contra o payload oficial OU contra homebrew local, mas não troca automaticamente para o override quando um existir. Documentado como gap.

## 8. Comparação de três vias — implementada

Nova rota `/mesas/[campaignId]/biblioteca/comparar/[docId]` (`campaignContentDiff.ts`: `diffEstrutural`/`compararTresVias`, verificado por 5 casos em Node — ver §Verificações). Mostra:
- versão/hash de cada lado (oficial-base, oficial atual, versão local);
- mudanças do oficial (base → atual) e da campanha (base → override atual), caminho a caminho;
- conflitos reais (mesmo caminho alterado nos dois lados) destacados separadamente;
- as 3 ações: **manter override** (registra revisão no changelog, nunca muda o payload), **adotar oficial** (arquiva o override, nunca copia o oficial para uma linha nova), **criar rascunho de reconciliação** (reabre edição com o override atual como base, publica pelo fluxo normal). Nenhuma marca "revisado" só por abrir a tela — cada ação precisa ser clicada explicitamente. Nenhum merge automático.
- Não é um diff visual complexo (não pedido) — é um diff estrutural raso (profundidade 4), suficiente para decisão humana.

## 9. Diagnóstico de impacto ao remover homebrew — implementado

`campaignContentImpact.ts::avaliarImpactoRemocao`: verifica (1) outros conteúdos PUBLICADOS da mesma campanha que referenciam o slug em `requisitos` (estruturado, preciso) e (2) personagens da campanha — **heurística por substring** no `payload` serializado de `characters` (não há coluna/estrutura indexável de "quem conhece este modelo" — documentado como limitação real, não escondida). Classificação: `sem_impacto_detectado` / `impacto_informativo` / `remocao_bloqueada` / `impacto_nao_determinavel`.

- **`arquivarHomebrewCampanha` agora BLOQUEIA de verdade** quando há referência estruturada obrigatória ativa (nunca só avisa nesse caso) — recalculado no servidor, nunca confia em o client já ter mostrado o diagnóstico.
- **`removerOverrideCampanha` NÃO bloqueia por este diagnóstico** — remover um override nunca quebra uma referência (o slug volta a resolver contra o oficial), então o diagnóstico ali seria irrelevante; a UI ainda pede confirmação com motivo.
- `previewImpactoRemocao` (nova Server Action) expõe o diagnóstico para a UI mostrar ANTES do usuário confirmar.
- Nenhuma instância é apagada; nenhum modelo é substituído automaticamente por oficial.

## 10. Limites de segurança — implementados

`campaignContentLimits.ts` (constantes + validadores puros, verificados em Node): tamanho de payload (200 000 bytes), quantidade de efeitos (40), quantidade de referências (40), tamanho de texto longo (20 000 caracteres), quantidade de conteúdo publicado por campanha (300), quantidade de rascunhos ativos por campanha (50). Validados no SERVIDOR antes de persistir (`validarCamposCampanha`, `inserirRascunho`, `publicarRascunhoCampanha`) — nunca só na UI. Reforçados também no banco por um gatilho (`enforce_campaign_content_limits`, migration `0026`) como defesa em profundidade (nunca a única barreira).

## 11. Tabelas e migrations

- `0025_campaign_content_homebrew.sql` (não reescrita): `campaign_content_documents`/`_drafts`/`_editor_metadata`/`_changelog` + RPCs de publicação/remoção/arquivamento.
- `0026_campaign_membership_authorization.sql` (não reescrita): `campaign_members` + backfill do owner; `is_campaign_member`/`can_manage_campaign_content`/`can_read_campaign_content`; RLS corrigida das 4 tabelas da Etapa 12; gatilho de limites.
- `0027_campaign_invite_authentication.sql` (nova, desta sessão): `campaign_members` ganha `invite_id`/`invited_by`/`joined_at`; RPC `accept_campaign_invite`; tabela `campaign_content_references`; `publish_campaign_content_draft` substituída (assinatura antiga removida explicitamente com `drop function` — nunca deixada órfã) para recalcular o índice de referências na mesma transação.
- Nenhuma migration em massa do catálogo oficial; `content_documents.payload` inalterado; nenhum backfill especulativo de jogador (só o owner, que já tinha `auth.uid()` real).

## 12. Modelo × instância

Inalterado — nenhuma função nova toca `characters`/inventário. O diagnóstico de impacto (§9/§0.5) LÊ `characters.payload` e `campaign_content_references` (só leitura), nunca escreve.

## 13. Segurança (resumo)

- Autorização de leitura e escrita passa por relação real (`campaign_members`/`owner_id`), nunca por conhecimento do ID.
- Aceite de convite exige `auth.uid()` real no servidor (RPC `SECURITY DEFINER`) — nunca aceita identidade vinda do client.
- Nenhuma policy genérica para `authenticated`; nenhum service role no client; nenhum `eval`/fórmula arbitrária.
- Admin global da Biblioteca oficial (`is_content_admin`) **nunca** é tratado como narrador/membro de campanha — checagens completamente separadas.
- Limitação herdada e ainda não resolvida (fora de escopo): `characters`/`campaign_profiles`/`table_logs` continuam com RLS aberta; nenhuma associação seleção de perfil/personagem ↔ usuário autenticado existe (ver §0.4).

## 14. Cache

Inalterado — não existe camada de cache de conteúdo no projeto.

## 15. Importação/exportação

Inalterado — fora de escopo.

## Verificações executadas

- `git status --short` / `git diff --check` — limpos.
- `npx tsc --noEmit` — sem erros.
- `npm run build` (Next.js/Turbopack) — sucesso; rotas `/join/[token]` (com o novo gate de autenticação) e `/mesas/[campaignId]/biblioteca/comparar/[docId]` presentes. Um erro real de bundling foi encontrado e corrigido durante esta sessão: um `export type` residual em `campaignContentServerActions.ts` ("use server") quebrava o build assim que o módulo passou a ser importado diretamente por um Server Component (`/join/[token]/page.tsx`) pela primeira vez — removido (o tipo já era acessível via o barrel `campaignContentTypes.ts`).
- `scripts/dev/validate-campaign-homebrew.mjs` — **15/15 verificações** (inalteradas desde a Correção 1: `classificarEstadoAtualizacao`, `diffEstrutural`/`compararTresVias`, validadores de limite — nenhuma delas cobre autenticação/RLS/índice de referências, que exigem banco real).
- Validação estática da migration `0027`: contagem balanceada de blocos `$$` (4 = 2 funções), `begin`/`commit` únicos, `drop function` explícito da assinatura antiga de `publish_campaign_content_draft` conferido (evita função órfã por mudança de assinatura).

## Verificações não executadas (SQL real)

- **Nenhuma verificação transacional contra Supabase real** — sem projeto conectado nesta sessão. Isso inclui todos os cenários pedidos com identidades distintas (owner, membro ativo, invited, removed, outsider, outra campanha) e o fluxo completo de aceite de convite (aceite cria membership; convite inválido bloqueia; reaceite pelo mesmo usuário é idempotente). **Nenhum foi executado** — não alego que a autenticação/RLS/índice de referências "passaram"; nunca rodaram contra um banco real.
- **Browser check** — não executado (esbuild/`tsx` bloqueados neste ambiente).

## Limitações reais (gaps honestos que permanecem)

- **Referências ainda parciais**: cobertura real = requisitos (talento/magia/item) + condição em efeitos + propriedades de item (herdado de `coletarReferenciasBrutas`, Etapa 11). NÃO cobertos: item concedido, runa referenciada explicitamente, efeitos compostos filhos, companheiro/Trama.
- **Sem associação perfil/personagem ↔ usuário autenticado** — decisão deliberada (§0.4), documentada, não uma omissão silenciosa.
- **Referência efetiva** (override substituindo o oficial na resolução de dependência de OUTRO documento) continua não implementada — só oficial-ou-homebrew-local.
- Detecção de impacto em personagens continua heurística (substring) como sinal SECUNDÁRIO — o índice estruturado (§0.5) é a fonte primária agora, mas ele próprio só cobre as famílias de referência já listadas acima.
- Diff de três vias é estrutural raso (profundidade 4), não um merge visual completo.
- Sem observabilidade dedicada (log estruturado) além dos erros já retornados.
- **Nada disto foi comprovado contra Supabase real** — toda a autorização/aceite de convite/índice de referências existe só como código revisado estaticamente.

## Encerramento

TypeScript e build passam; 15 verificações focadas em Node passam (inalteradas — nenhuma cobre o que há de novo nesta correção, que é inerentemente dependente de banco); nenhuma publicação automática no catálogo oficial; nenhuma escrita em `content_documents`/`content_drafts` oficiais; nenhuma tabela de marketplace criada; nenhuma instância de personagem é tocada ou apagada por nenhuma função; nenhum backfill especulativo de jogador. A Etapa 11 permanece "Implementação parcial — integração editorial de drag pendente", inalterada. **Não avancei para nenhuma etapa adicional.**

**Status geral da Etapa 12: Implementação parcial — integração de jogadores, referências completas e validação transacional/RLS em Supabase pendentes.**
