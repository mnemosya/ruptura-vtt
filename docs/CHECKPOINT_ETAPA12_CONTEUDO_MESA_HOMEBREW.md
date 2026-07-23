# Checkpoint — Etapa 12: Conteúdo de mesa e homebrew

## Status

**Status geral da Etapa 12: Implementação parcial — integração de jogadores, referências completas e validação transacional/RLS em Supabase pendentes.**

Este checkpoint acumula QUATRO correções sobre a implementação original (commits `953612d`/`693aafd`):

- **Correção 1** (`4ff8081`/`e37495a`, migration `0026`): a leitura de `campaign_content_documents` publicado estava protegida só por `campaign_id` + a mesma policy permissiva (`anon, authenticated`) já usada por `characters`/`campaign_profiles`/`table_logs` — **conhecer o `campaign_id` nunca comprovou pertencimento à campanha**. Corrigida: leitura passou a exigir `can_read_campaign_content()` (membership real), mas só o DONO tinha um `auth.uid()` real para virar membro — não existia NENHUM caminho para um JOGADOR se tornar membro de verdade.
- **Correção 2** (`0840898`/`48413b3`, migration `0027`): fecha esse caminho. `/join/[token]` passou a exigir uma sessão real do Supabase Auth e aceitar o convite via `accept_campaign_invite` (RPC transacional), criando/ativando `campaign_members` com `role='player'`. Também adicionou o índice estruturado `campaign_content_references`.
- **Correção 3** (`93746d1`/`f7c3ac8`, migration `0028`): `campaign_members` prova pertencimento à CAMPANHA, mas nunca provou qual `campaign_profile`/`character` é do jogador. Adiciona `campaign_profiles.user_id` + RPCs de reivindicação transacional + funções de autorização (aditivas) + `item_slug` de `conceder_item`/`consumir_item` no índice.
- **Correção 4** (esta sessão, migration `0029`): auditoria completa de `character/storage.ts` (~15 funções) e das famílias de referência que restavam. Achado central sobre autorização: os dois caminhos REAIS de leitura/escrita de personagem pelo jogador (`get_character_for_profile_session`/`save_character_for_profile_session`) já eram `SECURITY DEFINER` protegidos por token de sessão real — nunca acesso anônimo aberto; a lacuna real era esse token não ter nenhum vínculo com `auth.uid()`. Corrigido: quando o perfil já foi reivindicado, as duas funções agora TAMBÉM exigem `auth.uid() = campaign_profiles.user_id`. Achado central sobre referências: "efeitos compostos/filhos", `modificar_instancia`, instalar/remover/ativar runa como efeito e `efeito_temporario` foram auditados um a um no código real — quase todos são AUSÊNCIAS REAIS de referência (nunca uma lacuna de extração), exceto os compostos, que JÁ eram cobertos (a árvore é achatada em irmãos no mesmo array antes de chegar ao payload público).

**Por que o status NÃO desce ainda para "só falta validar banco e browser"**: (1) a RLS de `campaign_profiles`/`characters` continua a mesma policy aberta herdada desde a migration 0013 — o reforço desta correção vive DENTRO das duas RPCs de sessão, nunca na tabela; um acesso direto via REST com a anon key ainda contorna qualquer coisa que dependa só de RLS de tabela (documentado, ver §0-4.4); (2) `profile_sessions` não foi estruturalmente subordinada ao Auth — só ganhou uma checagem adicional dentro das 2 RPCs que já a liam; (3) nada foi verificado contra Supabase real.

A Etapa 11 **permanece exatamente**: "Implementação parcial — integração editorial de drag pendente" — nada nesta correção altera esse status.

## 0-4. Correção 4 — auditoria de storage + reforço de autorização + referências (migration 0029)

### 0-4.1 Auditoria de `character/storage.ts` (matriz)

| Seção do arquivo | Client usado | Identidade real | Rotas que consomem | Risco | Ação desta correção |
|---|---|---|---|---|---|
| Seção 1 — produto/narrador (~6 funções: `createCharacterForCampaign`, `listCharactersForNarratorCampaign`, `assignCharacterToCampaign`, etc.) | `getScopedTableClient()` (JWT do narrador) | `auth.uid()` real, já autenticado desde sempre | `/mesas/[campaignId]` | Baixo — já autenticado | Nenhuma (já correto) |
| Seção 2 — jogador (`getCharacterForProfileSession`/`saveCharacterForProfileSession`) | `getScopedTableClient()`, mas a autorização real é feita DENTRO do RPC `SECURITY DEFINER` | Token de `profile_session` (hash SHA-256, `status='active'`) — **nunca teve vínculo com `auth.uid()`** até esta correção | `/ficha` (produto) | Médio — token válido de outro perfil (vazado/adivinhado) bastava, mesmo com perfil já reivindicado por outro usuário | **Corrigido**: RPCs agora também exigem `auth.uid() = campaign_profiles.user_id` quando o perfil foi reivindicado |
| Seção 3 — dev/diagnóstico (`listLegacyCharactersDev`, etc.) | `getContentClient()` (anon puro) | Nenhuma — deliberadamente global | `/dev/character-sheet`, `/dev/table`, `/dev/join/[campaignId]` | Aceito — rotas explicitamente marcadas dev, nunca produto | Nenhuma (fora de escopo, documentado desde sempre no cabeçalho do arquivo) |

**Conclusão da auditoria**: a alegação inicial de "~15 funções anônimas inseguras" não se confirmou como uma superfície de acesso cruzado real — a maioria já é autenticada (Seção 1) ou explicitamente dev-only (Seção 3); a lacuna real e concreta estava só nas 2 funções da Seção 2, e foi essa que esta correção fechou.

### 0-4.2 Dados dependentes do personagem (inventário, magias, talentos, runas, condições, efeitos temporários)

Auditados: todos vivem dentro de `characters.payload` (um único blob JSONB por personagem — não existem tabelas próprias por magia/talento/item/runa/condição). Isso significa que a autorização de "quem pode ler/escrever este personagem" (Seção 2, corrigida acima) já cobre TODOS esses dados dependentes de uma vez — não há uma superfície de acesso separada a fechar por dado (ex.: não existe uma tabela `character_inventory` com sua própria RLS a corrigir à parte).

### 0-4.3 `profile_sessions` — o que ela representa depois desta correção

Continua guardando: qual perfil está bloqueado (`is_locked`/`lock_session_id`), quando (`locked_at`/`last_seen_at`), e o hash do token real. **O que mudou**: quando o perfil correspondente já foi reivindicado, o token SOZINHO deixou de bastar — as duas RPCs de leitura/escrita agora também exigem que quem está chamando seja `auth.uid() = campaign_profiles.user_id`. Para perfis AINDA não reivindicados, nada mudou (compatibilidade com campanhas/perfis que não passaram pelo fluxo de convite autenticado). `profile_sessions` continua sendo estado auxiliar de navegação — a autoridade real, quando existe, é o par (token + `auth.uid()`), nunca o token sozinho.

### 0-4.4 Por que a RLS de tabela ainda não foi restringida

Repetido deliberadamente (é a limitação central que mantém o status parcial): restringir a RLS de `campaign_profiles`/`characters` para `authenticated` exigiria substituir a policy única `anon, authenticated USING(true)` por uma versão que separe os dois papéis — e isso só é seguro depois de confirmar, com um ambiente real, que TODA leitura/escrita legítima do narrador (que também é role `authenticated`, via `getScopedTableClient`) continua coberta por uma policy equivalente. Sem Supabase conectado para testar essa regressão, esta correção prefere o reforço dentro das RPCs (§0-4.1), que é real e não depende de mudar RLS de tabela, a arriscar quebrar o dashboard do narrador sem poder verificar.

### 0-4.5 Referências — auditoria final das famílias pendentes

Ver o cabeçalho atualizado de `campaignContentReferences.ts` para o detalhe técnico completo. Resumo:

| Família pedida | Achado da auditoria | Ação |
|---|---|---|
| Efeitos compostos/filhos (`teste_resistencia`) | A árvore é ACHATADA em objetos irmãos no mesmo `payload_automacao.efeitos[]` antes de virar payload público (`serializarArvoreTesteResistencia`) — não existe `resultados[].efeitos[]` aninhado no JSON final. | **Já coberta** pelo scan de topo existente — não era lacuna, era suposição incorreta sobre o formato. Nenhum código novo. |
| `modificar_instancia` | Só opera sobre a PRÓPRIA instância do item que carrega o efeito (MIT/PD/munição atual) — nunca referencia outro conteúdo por slug. | Confirmado: não é referência de conteúdo. |
| Instalar/remover/ativar runa como efeito | Não existe esse tipo no catálogo de efeitos — runas são instaladas via `installRuneOnItem`/etc. (`inventory.ts`), nunca por um efeito com slug de runa. | Confirmado ausente. |
| `efeito_temporario` | Só duração/acúmulo/modificadores simples — nenhum campo de slug. | Confirmado ausente. |
| Runa referenciada fora de propriedades / modelo de companheiro-Trama | Já auditados nas correções anteriores — texto livre / sem catálogo. | Confirmado ausente (repetido aqui por completude). |

**Conclusão**: a cobertura de `campaign_content_references` está completa no escopo que o schema real comporta hoje — requisitos, condição em efeitos (incluindo os que vêm de árvores de teste/resistência, já achatadas), propriedades de item, item concedido/consumido. Nenhuma família adicional de referência real foi encontrada.

## 0-3. Correção 3 — vínculo usuário↔perfil↔personagem (migration 0028)

### 0-3.1 Auditoria (resumo)

| Item | Estado |
|---|---|
| `campaign_profiles` | Sem `user_id` antes desta correção — perfil identificado só por ID/sessão opaca (`profile_sessions`), nunca por `auth.uid()`. |
| `characters.profile_id`/`owner_id` | Já existiam (migration 0011) — `profile_id` já é a fonte de verdade real de "personagem pertence a qual perfil"; `owner_id` é carimbado com o NARRADOR logado quando criado via dashboard, não com o jogador (fluxo de jogador usa `getCharacterForProfileSession`/`saveCharacterForProfileSession`, por `profile_id` + token de sessão, nunca `auth.uid()`). |
| RLS de `campaign_profiles`/`characters` | `*_dev_transition_*`, `anon+authenticated`, `USING(true)` — aberta desde sempre; já sinalizada como pendente de refactor desde a migration 0013 (v0.27). **Não alterada nesta correção** (ver §0-3.6). |

### 0-3.2 Estratégia adotada

Seguindo a preferência explícita do pedido: `campaign_profiles.user_id` NULLABLE (não uma tabela associativa nova — o perfil já é a entidade 1:1 certa). Propriedade de personagem é DERIVADA do perfil via `characters.profile_id` (já existente) — `characters` não ganhou coluna nova.

### 0-3.3 Reivindicação transacional

- `claim_campaign_profile(profile_id)`: exige `auth.uid()`, exige membership ativa na campanha do perfil, bloqueia se o perfil já pertence a OUTRO usuário (nunca sobrescreve — fecha a corrida de duas reivindicações simultâneas via `for update` + índice único parcial `(campaign_id, user_id) where user_id is not null`), idempotente para o mesmo usuário.
- `create_and_claim_campaign_profile(campaign_id, nickname)`: cria perfil NOVO já com `user_id` do requisitante.
- UI: `ClaimProfileClient.tsx`, inserida em `/join/[token]` ENTRE o aceite de convite e o `JoinClient` existente — lista perfis não reivindicados (reivindicáveis) e oculta os de outros jogadores; jogador escolhe explicitamente (nunca automático).

### 0-3.4 Funções de autorização (aditivas)

`can_access_campaign_profile`, `can_manage_campaign_profile` (só dono da campanha), `can_read_character`, `can_manage_character` — todas `SECURITY DEFINER`, `search_path` explícito, nunca confiam em `user_id` do client. **Não usadas em nenhuma policy de RLS ainda** — ver §0-3.6.

### 0-3.5 Referências — família adicional

`item_slug` de `conceder_item`/`consumir_item` (campo real confirmado em `effectLegacySerialization.ts`) passa a entrar no índice `campaign_content_references` como referência OPCIONAL a `item` (nunca bloqueia publicação sozinha — mesmo critério de propriedades de item). Runa referenciada por slug e `modeloReferencia` de companheiro/Trama foram auditados e CONFIRMADOS AUSENTES no runtime real (runas são instaladas via operação de inventário, nunca por um efeito com slug de outra runa; `modeloReferencia` é texto livre por design, auditoria da Etapa 10) — não são uma lacuna, são ausência real de referência a extrair. Efeitos compostos (filhos aninhados) e `modificar_instancia` continuam NÃO varridos — pendente real.

### 0-3.6 Por que a RLS de `campaign_profiles`/`characters` NÃO foi flipada

Fazer isso com segurança exige migrar as ~15 funções de `character/storage.ts` do client anon para o client "scoped" e provar que nenhum fluxo anônimo existente (mesas sem convite autenticado, `/dev/join`, testes) quebra — um refactor de storage inteiro, já sinalizado como fora de escopo desde a migration 0013 (v0.27), e arriscado demais para fazer sem essa auditoria completa dentro desta correção. As funções de autorização (§0-3.4) ficam prontas para quando esse refactor acontecer. Documentado como limitação real, não escondida.

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
- `0027_campaign_invite_authentication.sql` (não reescrita): `campaign_members` ganha `invite_id`/`invited_by`/`joined_at`; RPC `accept_campaign_invite`; tabela `campaign_content_references`; `publish_campaign_content_draft` substituída para recalcular o índice na mesma transação.
- `0028_campaign_profile_ownership.sql` (não reescrita): `campaign_profiles.user_id`/`claimed_at`; índice único parcial `(campaign_id, user_id) where user_id is not null`; RPCs `claim_campaign_profile`/`create_and_claim_campaign_profile`; funções `can_access_campaign_profile`/`can_manage_campaign_profile`/`can_read_character`/`can_manage_character` (aditivas).
- `0029_campaign_authorization_enforcement.sql` (nova, desta sessão): `can_read_campaign`/`can_manage_campaign` (aliases de `is_campaign_member`/`is_campaign_owner`); `get_character_for_profile_session`/`save_character_for_profile_session` substituídas (mesma assinatura) para também exigir `auth.uid() = campaign_profiles.user_id` quando o perfil já foi reivindicado.
- Nenhuma migration em massa do catálogo oficial; `content_documents.payload` inalterado; nenhum backfill especulativo de jogador, perfil ou personagem.

## 12. Modelo × instância

Inalterado — nenhuma função nova toca estado mutável de personagem. O reforço desta correção (§0-4) só ADICIONA uma condição de rejeição às duas RPCs existentes — a lógica de leitura/escrita do `payload` do personagem em si é byte-a-byte a mesma da migration 0016.

## 13. Segurança (resumo)

- Autorização de leitura/escrita de conteúdo de campanha passa por relação real (`campaign_members`/`owner_id`), nunca por conhecimento do ID.
- Reivindicação de perfil exige `auth.uid()` real + membership ativa, nunca inferida por nome/primeiro-perfil-livre; corrida de reivindicação dupla fechada por `for update` + índice único.
- **Leitura/escrita de personagem pelo jogador** (as 2 RPCs da Seção 2 de `character/storage.ts`) exige token de sessão real E (quando o perfil foi reivindicado) `auth.uid()` correspondente — dupla camada, nenhuma delas sozinha basta mais quando o perfil está reivindicado.
- Nenhuma policy genérica para `authenticated`; nenhum service role no client; nenhum `eval`/fórmula arbitrária.
- Admin global da Biblioteca oficial (`is_content_admin`) **nunca** é tratado como narrador/membro de campanha.
- **Limitação real e explícita, repetida por ser a que mantém o status parcial**: a RLS de tabela de `campaign_profiles`/`characters` continua aberta (`*_dev_transition_*`). O reforço desta correção protege os 2 RPCs que a aplicação realmente usa para essas operações — mas um acesso DIRETO via REST com a anon key (fora da aplicação) ainda não é bloqueado por RLS de tabela. Documentado em detalhe em §0-4.4.

## 14. Cache

Inalterado — não existe camada de cache de conteúdo no projeto.

## 15. Importação/exportação

Inalterado — fora de escopo.

## Verificações executadas

- `git status --short` / `git diff --check` — limpos.
- `npx tsc --noEmit` — sem erros.
- `npm run build` (Next.js/Turbopack) — sucesso; nenhuma rota nova nesta correção (só migration SQL + comentário/docstring em TS).
- `scripts/dev/validate-campaign-homebrew.mjs` — **18/18 verificações** (inalteradas desde a correção 3 — o reforço desta correção vive inteiramente em SQL/RPC, não testável sem banco real).
- Validação estática da migration `0029`: contagem balanceada de blocos `$$` (8 = 4 funções), `begin`/`commit` únicos; as duas funções de sessão foram comparadas linha a linha com a versão original (migration 0016) para confirmar que a ÚNICA mudança de comportamento é a nova checagem de `auth.uid()` — nenhuma regra de sessão/token/lock preexistente foi alterada.
- Auditoria de código de `character/storage.ts` (~15 funções, matriz completa em §0-4.1) — achado: a superfície de risco real era muito menor do que presumido (só 2 funções, já protegidas por token, precisavam do reforço de `auth.uid()`; o resto já era autenticado ou explicitamente dev-only).

## Verificações não executadas (SQL real)

- **Nenhuma verificação transacional contra Supabase real** — sem projeto conectado nesta sessão. Isso inclui todos os cenários com identidades distintas (owner; player A aceita convite, reivindica perfil A, não acessa perfil/personagem B; player B não consegue reivindicar o perfil de A; sessão adulterada rejeitada; invited/removed perdem acesso; outsider nunca lê nada). **Nenhum foi executado.**
- **Browser check** — não executado (esbuild/`tsx` bloqueados neste ambiente).

## Limitações reais (gaps honestos que permanecem)

- **RLS de tabela de `campaign_profiles`/`characters` continua aberta** — o reforço desta correção vive nas 2 RPCs de sessão (aplicação real), não na tabela; acesso direto via REST fora da aplicação ainda não é bloqueado por RLS. Flipar isso com segurança exige confirmar, com ambiente real, que a policy restritiva cobre 100% do acesso legítimo do narrador — não verificável nesta sessão.
- **Referências**: cobertura confirmada completa no escopo real do schema atual (requisitos, condição em efeitos, propriedades de item, item concedido/consumido) — nenhuma família adicional real foi encontrada nesta auditoria. "Referência efetiva" (override substituindo o oficial na resolução de dependência de OUTRO documento) continua não implementada.
- Detecção de impacto em personagens continua heurística (substring) como sinal SECUNDÁRIO.
- Diff de três vias é estrutural raso (profundidade 4), não um merge visual completo.
- Sem observabilidade dedicada (log estruturado) além dos erros já retornados.
- **Nada disto foi comprovado contra Supabase real.**

## Encerramento

TypeScript e build passam; 18 verificações focadas em Node passam; nenhuma publicação automática no catálogo oficial; nenhuma escrita em `content_documents`/`content_drafts` oficiais; nenhuma tabela de marketplace criada; nenhuma instância de personagem é tocada ou apagada por nenhuma função; nenhum backfill especulativo de jogador, perfil ou personagem; nenhuma regra mecânica (Aljava, MIT/PD, capacidade 15, etc.) foi alterada. A Etapa 11 permanece "Implementação parcial — integração editorial de drag pendente", inalterada. **Não avancei para nenhuma etapa adicional.**

**Status geral da Etapa 12: Implementação parcial — integração de jogadores, referências completas e validação transacional/RLS em Supabase pendentes.**
