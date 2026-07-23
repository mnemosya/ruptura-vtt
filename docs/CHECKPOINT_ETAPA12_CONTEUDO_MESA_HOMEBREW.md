# Checkpoint — Etapa 12: Conteúdo de mesa e homebrew

## Status

**Status geral da Etapa 12: Implementação parcial — validação transacional e de RLS em Supabase pendente.**

Esta é a SÉTIMA correção, e é ela — não a correção 6 — que efetivamente permite este status hoje. Uma auditoria estática posterior à correção 6 encontrou DUAS falhas críticas que a correção 6 não tinha fechado, e que exigiram reabrir o status para **"Implementação parcial — correções críticas de autorização de sessões e vínculo de personagem pendentes."** por uma sessão inteira antes desta correção existir:

1. **`profile_sessions` nunca teve `anon` removido** — as policies `profile_sessions_dev_transition_{select,insert,update,delete}` (migration 0009, CRUD completo, `USING(true)`) nunca foram tocadas por nenhuma correção anterior (1 a 6). Como as RPCs de personagem confiam em `session_token_hash` como autoridade (migration 0016), qualquer client com a anon key podia gravar o hash de um token escolhido por ele mesmo e passar no "hard check".
2. **`active_character_id` gravável pelo próprio jogador sem checar a quem o personagem pertence** — a policy `campaign_profiles_authenticated_update` (0030/0031) permitia ao jogador atualizar a própria linha inteira, sem restrição por coluna; nada impedia apontar `active_character_id` para o personagem de outro perfil (ou de outra campanha) e, com o TOKEN REAL da própria sessão, ler/escrever esse personagem alheio pelas RPCs.

Esta correção 7 fechou as duas, e a reauditoria feita ANTES de escrever a migration encontrou uma **terceira falha crítica, não relatada antes**: `campaign_profiles` nunca teve, de fato, sua policy `anon` removida. A migration 0004 criou `campaign_profiles_dev_anon_*`; a migration 0007 as RENOMEOU para `campaign_profiles_dev_transition_*` (esse passou a ser o nome REAL em vigor desde então); as migrations 0030 e 0031 tentaram remover o acesso anônimo desta tabela, mas erraram o nome — fizeram `drop policy if exists campaign_profiles_dev_anon_select` (e variantes), um NO-OP porque esse nome não existe mais desde 0007, e criaram/removeram policies NOVAS com esse nome antigo, sem nunca tocar as que de fato estavam ativas. Ou seja: apesar de toda a narrativa das correções 5/6 sobre "remover anon de `campaign_profiles`", a tabela continuou com CRUD completo aberto a `anon` até a migration `0032` desta correção 7 corrigi-la pelo nome certo.

Migration `0032` (esta correção): (1) dropa `campaign_profiles_dev_transition_*` e `profile_sessions_dev_transition_*` pelos nomes REAIS (confirmados por leitura do histórico de renomeações, não presumidos); (2) revoga `anon` de ambas as tabelas; (3) reescreve `campaign_profiles_authenticated_update` para owner-only (jogador perde UPDATE direto por completo — toda escrita legítima de jogador passa a ser por RPC); (4) cria 7 RPCs novas orientadas a uma operação concreta cada (`enter_campaign_profile`, `heartbeat_profile_session`, `leave_campaign_profile`, `validate_profile_session_token`, `expire_stale_profile_sessions`, `force_release_campaign_profile`, `set_campaign_profile_active_character`); (5) `set_campaign_profile_active_character` estabelece o modelo canônico de propriedade (`characters.profile_id` = perfil-alvo, mesma campanha, não arquivado) e é a ÚNICA forma de gravar `active_character_id`; (6) `get_character_for_profile_session`/`save_character_for_profile_session` passam a revalidar `characters.profile_id = p_profile_id` também, nunca confiando só em `active_character_id`. O que resta agora é exclusivamente **aplicar a migration contra um Supabase real e comprovar a matriz de RLS/ataques específicos + aceite de browser**.

Este checkpoint acumula SETE correções sobre a implementação original (commits `953612d`/`693aafd`):

- **Correção 1** (`4ff8081`/`e37495a`, migration `0026`): a leitura de `campaign_content_documents` publicado estava protegida só por `campaign_id` + a mesma policy permissiva (`anon, authenticated`) já usada por `characters`/`campaign_profiles`/`table_logs` — **conhecer o `campaign_id` nunca comprovou pertencimento à campanha**. Corrigida: leitura passou a exigir `can_read_campaign_content()` (membership real), mas só o DONO tinha um `auth.uid()` real para virar membro — não existia NENHUM caminho para um JOGADOR se tornar membro de verdade.
- **Correção 2** (`0840898`/`48413b3`, migration `0027`): fecha esse caminho. `/join/[token]` passou a exigir uma sessão real do Supabase Auth e aceitar o convite via `accept_campaign_invite` (RPC transacional), criando/ativando `campaign_members` com `role='player'`. Também adicionou o índice estruturado `campaign_content_references`.
- **Correção 3** (`93746d1`/`f7c3ac8`, migration `0028`): `campaign_members` prova pertencimento à CAMPANHA, mas nunca provou qual `campaign_profile`/`character` é do jogador. Adiciona `campaign_profiles.user_id` + RPCs de reivindicação transacional + funções de autorização (aditivas) + `item_slug` de `conceder_item`/`consumir_item` no índice.
- **Correção 4** (esta sessão, migration `0029`): auditoria completa de `character/storage.ts` (~15 funções) e das famílias de referência que restavam. Achado central sobre autorização: os dois caminhos REAIS de leitura/escrita de personagem pelo jogador (`get_character_for_profile_session`/`save_character_for_profile_session`) já eram `SECURITY DEFINER` protegidos por token de sessão real — nunca acesso anônimo aberto; a lacuna real era esse token não ter nenhum vínculo com `auth.uid()`. Corrigido: quando o perfil já foi reivindicado, as duas funções agora TAMBÉM exigem `auth.uid() = campaign_profiles.user_id`. Achado central sobre referências: "efeitos compostos/filhos", `modificar_instancia`, instalar/remover/ativar runa como efeito e `efeito_temporario` foram auditados um a um no código real — quase todos são AUSÊNCIAS REAIS de referência (nunca uma lacuna de extração), exceto os compostos, que JÁ eram cobertos (a árvore é achatada em irmãos no mesmo array antes de chegar ao payload público).

- **Correção 5** (migration `0030`): fecha a lacuna central que a correção 4 deixou explícita — a RLS de TABELA de `campaign_profiles`/`characters` continuava aberta (`anon, authenticated USING(true))`). Narrowed o papel `authenticated` para fora das policies `anon` (mantendo `anon` **intacto**, justificado por 5 funções legado/dev supostamente nunca chamadas por rota de produto) e implementou o SELECT de `campaign_profiles` para `authenticated` como "owner OU qualquer membro ativo lê TODOS os perfis" (justificado por `ClaimProfileClient`). **Ambas as justificativas foram reabertas e rejeitadas na correção 6** — ver abaixo. Corrigiu, à parte, dois helpers (`can_read_character`/`can_manage_character`/`can_access_campaign_profile`) que não confirmavam membership `active` antes de aceitar `profile.user_id = auth.uid()`.
- **Correção 6** (migration `0031`): reabre a correção 5 função a função (não por nome/comentário do arquivo). Achado central: `updateCharacter` (chamada por `MesaDetailClient.tsx`, `table/endRound.ts`, `table/endScene.ts` — dashboard REAL do narrador) e `listCharactersForCampaign` (chamada por `/join/[token]/page.tsx` DEPOIS de exigir login e aceitar convite) NÃO são "só dev" como a correção 5 presumiu — são produto real, sempre em contexto autenticado. Exatamente **6 funções** tiveram o client trocado de `getContentClient()` (anon puro) para `getScopedTableClient()` no commit `0958192`: `createCharacter`, `updateCharacter`, `getCharacter`, `listCharacters`, `deleteCharacter`, `listCharactersForCampaign`. Dessas 6, **4 são genuinamente dev-only** (`createCharacter`/`getCharacter`/`listCharacters`/`deleteCharacter`) e **2 são produto real** (`updateCharacter`/`listCharactersForCampaign`). `listLegacyCharactersDev` NÃO é uma 7ª função migrada — é um wrapper fino sem client próprio (`return listCharacters()`), que só herda o novo comportamento de forma transitiva; só seu comentário foi atualizado no diff, não uma linha de client. Consequência aceita para as 4 dev-only e para o wrapper: sem sessão real, passam a ver listas vazias / falhar por RLS — ver `## 0-6.8` (retificação) para o detalhe exato do que isso significa para rotas `/dev` vs. scripts. A policy `anon` foi REMOVIDA por completo de `characters` — confirmado correto. **Sobre `campaign_profiles`, esta afirmação estava ERRADA (corrigido na correção 7 — ver `## 0-7.1`)**: a migration 0031 dropou `campaign_profiles_dev_anon_*`, mas esse nome já não existia desde a migration 0007 (renomeado para `campaign_profiles_dev_transition_*`) — a policy realmente ativa nunca foi removida. O SELECT de `campaign_profiles` para `authenticated` foi reescrito: owner vê tudo; jogador lê SOMENTE o próprio perfil — essa parte era e continua correta (é uma policy ADICIONAL; o problema era a permissiva de `anon` continuar coexistindo por trás dela). `ClaimProfileClient`/`/join/[token]/page.tsx` migrados para consumir uma RPC mínima nova (`list_claimable_campaign_profiles`/`listClaimableCampaignProfiles`, `SECURITY DEFINER`, exige `auth.uid()` + membership ativa, devolve só id+nickname dos perfis NÃO reivindicados) em vez do SELECT amplo removido — essa parte também continua correta.
- **Correção 7** (migration `0032`, esta sessão): fecha as duas falhas críticas relatadas pela auditoria pós-correção-6 (`profile_sessions` com CRUD aberto a `anon`/`authenticated`; `active_character_id` gravável pelo jogador sem checar propriedade do personagem-alvo) e uma terceira encontrada só agora, na reauditoria obrigatória desta correção: `campaign_profiles_dev_transition_*` (o nome REAL, pós-rename da migration 0007) nunca foi removida por nenhuma correção anterior — `campaign_profiles` continuou com CRUD completo aberto a `anon` até agora. Ver `## 0-7` para a auditoria completa, a decisão de modelo canônico de propriedade de personagem, e a lista das 7 RPCs novas.

**Por que o status não sobe além disto**: as três falhas críticas acima estão corrigidas NO CÓDIGO desta migration — `anon` sem nenhuma policy permissiva em `campaign_profiles`/`profile_sessions`, jogador sem UPDATE direto em `campaign_profiles`, `active_character_id` só gravável por uma RPC que valida `characters.profile_id`/`campaign_id`/`archived_at`, e as RPCs de leitura/escrita de personagem revalidando esse mesmo vínculo. Mas **nada disto foi executado contra um Supabase real** — nenhuma prova de que owner/player A/player B/outsider/anon/membro removido se comportam como desenhado, nenhum dos dois "ataques específicos" pedidos (forjar `session_token_hash`; redirecionar `active_character_id` para personagem alheio) foi executado contra um banco real, nenhum browser check. TypeScript, build e a validação estática (18 verificações da Etapa 12 + 48 verificações estruturais novas desta correção) passam. É exatamente o critério de "Implementação parcial — validação transacional e de RLS em Supabase pendente" — faltando só aplicar/comprovar em banco real e o aceite de browser.

A Etapa 11 **permanece exatamente**: "Implementação parcial — integração editorial de drag pendente" — nada nesta correção altera esse status.

## 0-7. Correção 7 — fechamento de `profile_sessions` e proteção de `active_character_id` (migration 0032)

### 0-7.1 Auditoria inicial obrigatória — achado 0 (não relatado antes)

Antes de escrever qualquer código, foi revalidado o histórico completo de policies de `campaign_profiles` migration a migration (0004 → 0006 → 0007 → 0013 → 0030 → 0031), em vez de confiar na narrativa das correções anteriores. Achado:

- Migration 0004 cria `campaign_profiles_dev_anon_{select,insert,update,delete}` (`anon, authenticated`, `USING(true)`).
- Migration 0007 executa `alter policy campaign_profiles_dev_anon_select on campaign_profiles rename to campaign_profiles_dev_transition_select` (e as 3 variantes) — a partir daqui, **o nome real em vigor no banco é `campaign_profiles_dev_transition_*`, não mais `campaign_profiles_dev_anon_*`**.
- Migration 0030 faz `drop policy if exists campaign_profiles_dev_anon_select` — um **NO-OP silencioso** (`if exists` não falha quando o nome não existe), porque esse nome já tinha sido renomeado 23 migrations antes. Em seguida, a mesma migration 0030 **cria uma policy NOVA com esse nome antigo** (`create policy campaign_profiles_dev_anon_select ... to anon ...`), uma policy DIFERENTE e ADICIONAL às `_dev_transition_*`, que nunca existiu antes.
- Migration 0031 remove essa policy nova (`campaign_profiles_dev_anon_*`, criada por engano pela 0030) — mas nunca toca `campaign_profiles_dev_transition_*`, que continuou existindo o tempo todo, sem nenhuma migration jamais ter tentado removê-la pelo nome certo.

**Conclusão**: `campaign_profiles` nunca teve, de fato, nenhuma correção real de acesso `anon` — a tabela continuou com CRUD completo (`select`/`insert`/`update`/`delete`) aberto a `anon` E a `authenticated` genérico, por baixo de toda a narrativa das correções 5/6 sobre "narrow"/"remoção completa". As policies `campaign_profiles_authenticated_*` (0030/0031, corretas em si) sempre foram só uma policy ADICIONAL — como policies `PERMISSIVE` se combinam por `OR`, a permissiva `campaign_profiles_dev_transition_*` bastava sozinha para conceder acesso total, independente de quão restritiva a outra fosse.

`profile_sessions_dev_transition_*` não tem esse problema de nome — foi criada com esse nome diretamente na migration 0009 (nunca teve fase `dev_anon`) — mas nunca foi removida nem renarrowed por nenhuma correção, o que é o achado 1 já relatado na auditoria anterior.

### 0-7.2 Auditoria de consumidores diretos de `profile_sessions`/`campaign_profiles`

Revalidado `src/lib/table/storage.ts` função a função (não presumido do relatório anterior):

| Função | Tabela(s) tocada(s) direto | Consumidor real | Papel esperado | Substituível por RPC? |
|---|---|---|---|---|
| `createCampaignProfile`, `listCampaignProfiles`, `setCampaignProfileLocked` | `campaign_profiles` | `MesaDetailClient.tsx`/`/dev/table` (narrador) | Owner | Não precisa — já coberto por `campaign_profiles_authenticated_{insert,select,update}` (owner-only) |
| `setCampaignProfileActiveCharacter` | `campaign_profiles` | `MesaDetailClient.tsx` — ÚNICO consumidor (confirmado por grep), sem nenhum caminho de jogador | Owner | **Sim — migrado para `set_campaign_profile_active_character`** (fecha o achado 2) |
| `enterCampaignProfile`, `heartbeatCampaignProfile`, `leaveCampaignProfile` | `campaign_profiles` + `profile_sessions` | `/join/[token]`, `/ficha`, `/dev/join`, `/dev/table` (jogador, com ou sem `auth.uid()`) | Jogador (token de sessão, não necessariamente `auth.uid()`) | **Sim — migradas para `enter_campaign_profile`/`heartbeat_profile_session`/`leave_campaign_profile`** |
| `validateProfileSessionToken` | `campaign_profiles` + `profile_sessions` | `/ficha` (via `getCharacterForProfileSession`/`saveCharacterForProfileSession`) | Jogador | **Sim — migrada para `validate_profile_session_token`** |
| `expireStaleProfileSessions` | `profile_sessions` + `campaign_profiles` + `table_logs` | `/mesas/[campaignId]`, `/join/[token]`, `/ficha`, `/api/internal/expire-profile-sessions` (cron) | Qualquer (não exige identidade específica) | **Sim — migrada para `expire_stale_profile_sessions`** |
| `forceReleaseCampaignProfile` | `campaign_profiles` + `profile_sessions` | `/dev/table` (narrador) | Owner | **Sim — migrada para `force_release_campaign_profile`** (agora exige `auth.uid()` = owner; antes não exigia NADA além da RLS aberta) |
| `listProfileSessions`, `getActiveProfileSession` | `profile_sessions` (leitura) | `MesaDetailClient.tsx`/`/dev/table` (narrador); `getActiveProfileSession` **sem nenhum consumidor** (confirmado por grep — código morto, não alterado nesta correção) | Owner | Não precisa — `profile_sessions_owner_all` já cobre |

### 0-7.3 Modelo canônico de propriedade de personagem (decisão)

A migration 0015 dizia explicitamente: "a autoridade real de 'qual personagem esta sessão pode tocar' é `campaign_profiles.active_character_id`, não `characters.profile_id`". Esta correção NÃO perpetua essa formulação, porque ela permitia atravessar a propriedade real: **`characters.profile_id` (migration 0011) passa a ser o vínculo canônico** — já é a base das policies `characters_authenticated_*` (migration 0030) e dos helpers `can_read_character`/`can_manage_character`. `active_character_id` continua existindo (é o ponteiro de conveniência "qual dos personagens do perfil está em uso agora"), mas só pode ser gravado (via `set_campaign_profile_active_character`) apontando para um personagem cujo `profile_id` já é esse mesmo perfil, `campaign_id` é a mesma campanha, e `archived_at is null`.

### 0-7.4 Diagnóstico de dados legados (documentado, não executado)

Sem Supabase conectado nesta sessão, não foi possível rodar o diagnóstico. A consulta abaixo (também comentada no cabeçalho da migration 0032) deve ser executada ANTES de aplicar `0032` em produção, para encontrar personagens ativos cujo vínculo já está inconsistente com o modelo canônico (o que só pode ter acontecido por um bug/ataque anterior a esta correção):

```sql
select p.id as profile_id, p.campaign_id, p.active_character_id,
       c.id as character_id, c.profile_id as character_profile_id,
       c.campaign_id as character_campaign_id
from campaign_profiles p
join characters c on c.id = p.active_character_id
where c.profile_id is distinct from p.id
   or c.campaign_id is distinct from p.campaign_id;
```

Se retornar linhas, a decisão é manual (religar via `assignCharacterToProfile` ou limpar `active_character_id`) — a migration 0032 não faz esse backfill automaticamente.

### 0-7.5 RPCs novas (todas `SECURITY DEFINER`, `search_path` explícito, `revoke all from public` + `grant` mínimo)

- `enter_campaign_profile(profile_id, session_id, invite_id)` — gera o token bruto DENTRO do banco (`extensions.gen_random_bytes`, nunca escolhido pelo cliente); `anon, authenticated`.
- `heartbeat_profile_session(profile_id, profile_session_id, raw_token)` — hard check de token; `anon, authenticated`.
- `leave_campaign_profile(profile_id, profile_session_id, raw_token)` — idem; `anon, authenticated`.
- `validate_profile_session_token(campaign_id, profile_id, profile_session_id, raw_token)` — nunca devolve `session_token_hash` (removido do jsonb com o operador `-`); `anon, authenticated`.
- `expire_stale_profile_sessions(campaign_id, stale_after_seconds)` — corrige um bug latente da versão TypeScript (comparava `sha256(lock_session_id)` com `session_token_hash`, valores sem relação alguma desde a migration 0016 — a nova versão libera o lock quando a sessão que expira é a última `active` do perfil); `anon, authenticated` (mantém alcance de antes — a rota `/api/internal/expire-profile-sessions` chama sem sessão de usuário).
- `force_release_campaign_profile(profile_id)` — agora exige `auth.uid()` = owner da campanha (antes não exigia nada); `authenticated`.
- `set_campaign_profile_active_character(profile_id, character_id)` — fecha o achado 2; exige `auth.uid()` = owner, valida `characters.campaign_id`/`profile_id`/`archived_at`; `authenticated`.

`get_character_for_profile_session`/`save_character_for_profile_session` (mesma assinatura da migration 0029) reforçadas: acrescentam `and profile_id = p_profile_id` na consulta/UPDATE de `characters`, além do `campaign_id` já existente — nunca mais confiam só em `active_character_id`. `save_character_for_profile_session` repete a validação dentro da mesma transação, imediatamente antes do `UPDATE` (evita TOCTOU entre a leitura de `get_character_for_profile_session` e o salvamento).

### 0-7.6 Fluxos preservados

- **Narrador**: dashboard, criação/edição de perfil, criação/edição de personagem, seleção de personagem ativo (agora validada), Encerrar Rodada/Encerrar Cena, convites, publicação de conteúdo, comparação de três vias, diagnóstico de impacto, limites — nenhum desses caminhos foi alterado além de `setCampaignProfileActiveCharacter`/`forceReleaseCampaignProfile` passarem a chamar RPC em vez de tabela direta (mesma assinatura TypeScript exportada, nenhum caller precisou mudar).
- **Jogador**: login, aceite de convite, listagem de perfis reivindicáveis, reivindicação, entrar em perfil, heartbeat, sair, abrir/salvar o próprio personagem, leitura de conteúdo efetivo — todos preservados via as RPCs novas, mesma assinatura TypeScript exportada (`enterCampaignProfile`/`heartbeatCampaignProfile`/`leaveCampaignProfile`/`validateProfileSessionToken`/`expireStaleProfileSessions` mantêm os mesmos parâmetros e tipo de retorno).
- **Perfis não reivindicados (Opção B, preservada)**: continuam funcionando só por token de sessão (sem exigir `auth.uid()`), porque ainda há consumidor legítimo real. A diferença desta correção: o token só pode ser criado/rotacionado pelas RPCs (nunca INSERT/UPDATE direto), `session_token_hash` nunca é lido por ninguém (nem pelo jogador — as RPCs nunca o devolvem), a sessão continua vinculada a uma campanha/perfil reais validados a cada chamada.

### 0-7.7 Possível regressão do roster no join — não alterado nesta correção

A auditoria confirmou que `JoinClient` (usado também em `/join/[token]`, variant `"invite"`) recebe `perfisIniciais` já limitado a 0-1 linha para um jogador não-owner (efeito colateral da correção 6, não desta). Como a intenção original do componente ("Perfis (N)" como roster completo da mesa) não está inequivocamente documentada como um requisito de produto ainda válido, e o pedido desta correção era fechar as duas (agora três) falhas críticas de autorização, **esta regressão NÃO foi tratada aqui** — permanece registrada como débito não bloqueante (ver `## Limitações reais`), à espera de uma decisão de produto explícita antes de criar uma RPC de roster mínima.

### 0-7.8 Débitos não bloqueantes (não tratados nesta correção, por instrução explícita)

- Duplicação entre `can_read_character()` e a policy inline `characters_authenticated_select`.
- `can_read_campaign`/`can_manage_campaign`/`can_manage_campaign_profile` — helpers SQL órfãos (nunca referenciados em nenhuma policy/RPC/código).
- `enforce_campaign_content_limits()` sem `search_path` explícito (não é `SECURITY DEFINER`, risco baixo).
- Policies `characters_owner_*` (migration 0014) redundantes com `characters_authenticated_*` (0030) — inofensivas (`OR`), não removidas.
- Ausência de UI para `campaign_members.status = 'removed'` — o estado existe no schema, mas nenhuma rota de produto o produz hoje.

## 0-6. Correção 6 — remoção completa do acesso anônimo e SELECT de perfil auto-escopado (migration 0031)

### 0-6.1 Auditoria função-a-função (não por nome) das "5 funções dev/legado"

A correção 5 presumiu, com base no comentário do próprio arquivo (`character/storage.ts`), que `createCharacter`/`updateCharacter`/`getCharacter`/`listCharacters`/`deleteCharacter` eram usadas só por `scripts/test-character-storage.ts` e `/dev/character-sheet`. Um grep global (`createCharacter\b|updateCharacter\b|\bgetCharacter\b|\blistCharacters\b|deleteCharacter\b`) e a leitura de cada arquivo apontado (não só o nome do arquivo) mostrou:

| Função | Caller real | Client hoje (pré-correção) | Classificação real |
|---|---|---|---|
| `createCharacter` | `/dev/character-sheet/CharacterSheetClient.tsx`, `scripts/test-character-storage.ts` | `getContentClient()` | Dev/script only — confirmado |
| `getCharacter` | `/dev/table/TableClient.tsx`, `/dev/character-sheet/CharacterSheetClient.tsx`, `scripts/test-*.ts` | `getContentClient()` | Dev/script only — confirmado |
| `listCharacters` | só via `listLegacyCharactersDev` (gated por `mode==="dev"` em `CharacterSheetView.tsx`) e `scripts/test-character-storage.ts` | `getContentClient()` | Dev/script only — confirmado |
| `deleteCharacter` | `/dev/character-sheet/CharacterSheetClient.tsx`, `scripts/test-*.ts` | `getContentClient()` | Dev/script only — confirmado |
| **`updateCharacter`** | `/dev/table`, `/dev/character-sheet` **E** `MesaDetailClient.tsx` (linha 329, dano direto), `table/endRound.ts`, `table/endScene.ts` (chamadas pelos botões reais "Encerrar Rodada"/"Encerrar Cena" do dashboard do narrador) | `getContentClient()` | **PRODUTO REAL** — a premissa da correção 5 estava errada para esta função |
| **`listCharactersForCampaign`** | `/join/[token]/page.tsx`, linha 124, chamada DEPOIS de `getCurrentUser()` (linha 93) e `acceptCampaignInvite` (linha 107) | `getContentClient()` | **PRODUTO REAL, pós-login** — o comentário do arquivo ("visitante anônimo") estava errado |

`gmActions.ts` e `useCharacterRealtime.ts`/`tableRealtime.ts`, que apareceram no grep inicial, são falsos positivos (menções em comentário/nome de variável, sem chamada real às 5 funções) — confirmados por leitura direta.

### 0-6.2 Decisão sobre as funções

Exatamente **6 funções** tiveram o client trocado de `getContentClient()` para `getScopedTableClient()` no diff do commit `0958192` (confirmado por `git show`): as 5 originais da premissa da correção 5 (`createCharacter`, `updateCharacter`, `getCharacter`, `listCharacters`, `deleteCharacter`) mais `listCharactersForCampaign`. `listLegacyCharactersDev` **não** é uma 7ª função migrada — seu corpo é só `return listCharacters();`, sem `client = ...` próprio; o diff mexeu apenas no comentário dela (ver `## 0-6.8` para a retificação completa desta contagem). Para `updateCharacter`/`listCharactersForCampaign`, a migração é a correção de um bug de autorização real (produto rodando como `anon`). Para as outras 4 (`createCharacter`/`getCharacter`/`listCharacters`/`deleteCharacter`), é a aceitação explícita de que "função de desenvolvimento não justifica policy aberta" — nenhuma delas fazia parte de `scripts/dev/validate-campaign-homebrew.mjs`.

### 0-6.3 `campaign_profiles`/`characters` — policies `anon` removidas por completo

Migration `0031`: `drop policy` (não narrow) de todas as `campaign_profiles_dev_anon_*`/`characters_dev_transition_*`, mais `revoke all ... from anon` nas duas tabelas (defesa em profundidade além da RLS, já que RLS sem nenhuma policy permissiva nega por padrão).

### 0-6.4 `campaign_profiles` SELECT — auto-escopado

Antes (0030): `is_campaign_owner(campaign_id) or is_campaign_member(campaign_id)` — qualquer membro ativo lia TODOS os perfis. Agora: `is_campaign_owner(campaign_id) or user_id = (select auth.uid())` — jogador lê SOMENTE o próprio perfil. `characters_authenticated_*` (0030) usam `exists (select 1 from campaign_profiles p where p.id = profile_id and p.user_id = auth.uid())` como subquery direta (não via helper `SECURITY DEFINER`) — verificado que isso continua resolvendo sob a nova policy, porque o próprio jogador ainda pode ler sua própria linha (`user_id = auth.uid()` está coberto pela nova policy) — sem regressão.

### 0-6.5 `list_claimable_campaign_profiles` — RPC mínima nova

`SECURITY DEFINER`, `search_path` explícito, `stable`. Exige `auth.uid() is not null` e `is_campaign_member(p_campaign_id, auth.uid())` (membership ativa); devolve `(id, nickname)` só dos perfis com `user_id is null` da MESMA campanha. Nunca retorna `user_id` de terceiros, payload completo, dado de sessão ou de outra campanha. `revoke all from public` + `grant execute to authenticated`. Consumida por `listClaimableCampaignProfiles` (novo server action em `campaignProfileServerActions.ts`, mesmo padrão de `claimCampaignProfile`/`createAndClaimCampaignProfile`: reforça `getCurrentUser()` no servidor antes de chamar a RPC).

### 0-6.6 `ClaimProfileClient`/`/join/[token]/page.tsx` — migrados

`ClaimProfileClient` deixou de receber `perfis: CampaignProfile[]` (lista completa) e passou a receber `perfilProprio: CampaignProfile | null` (o próprio perfil, resolvido por `listCampaignProfiles` — que agora, sob a nova SELECT, já devolve no máximo 1 linha para um jogador não-owner) e `perfisReivindicaveis: PerfilReivindicavel[]` (via `listClaimableCampaignProfiles`). O contador "N perfis de outros jogadores" foi removido da UI (substituído por uma frase genérica) — exigiria expor contagem/identidade de terceiros, fora do contrato mínimo da RPC.

### 0-6.7 O que NÃO mudou nesta correção (auditado, confirmado correto)

- `claim_campaign_profile`/`create_and_claim_campaign_profile` (0028) — `SECURITY DEFINER`, transacionais, idempotentes, `FOR UPDATE` — inalteradas, seguem corretas.
- `profile_sessions` e as RPCs `get_character_for_profile_session`/`save_character_for_profile_session` (0016/0029) — inalteradas; token + `auth.uid()` quando reivindicado já fechado na correção 4.
- `characters_authenticated_*` (0030) — inalteradas; confirmado nesta correção que não dependem do SELECT amplo removido (0-6.4).
- `campaign_content_references`/comparação de três vias/limites — não reabertos; nenhuma lacuna nova encontrada ou alegada nesta correção.

### 0-6.8 Retificação factual da Correção 6 (auditoria de contagem, sessão posterior)

O relatório original de fechamento da Correção 6 continha uma inconsistência de contagem, identificada por reauditoria dos diffs reais (`git show --stat`/`git show` dos commits `0958192`/`186d1d2`/`7673b8b`, mais busca global por `getContentClient`/`getScopedTableClient`/cada nome de função). Nenhum código foi alterado por esta retificação — só a contagem e a redação eram imprecisas; o comportamento em produção já era o descrito abaixo desde o commit `0958192`.

**Contagem anterior (inconsistente)**: uma frase dizia "as outras 4" listando 5 nomes (`createCharacter`/`getCharacter`/`listCharacters`/`deleteCharacter`/`listLegacyCharactersDev`); outra dizia "6 funções migradas" listando implicitamente 7 nomes (as 5 + `listCharactersForCampaign` + `listLegacyCharactersDev` de novo).

**Contagem correta**: o diff do commit `0958192` (`git show 0958192 -- src/lib/character/storage.ts`) muda a linha `const client = getContentClient()` para `const client = await getScopedTableClient()` em exatamente **6 funções**:

| Função | Arquivo | Client antes | Client depois | Alterada no diff de `0958192`? |
|---|---|---|---|---|
| `createCharacter` | `character/storage.ts:562` | `getContentClient()` | `getScopedTableClient()` | Sim |
| `updateCharacter` | `character/storage.ts:595` | `getContentClient()` | `getScopedTableClient()` | Sim |
| `getCharacter` | `character/storage.ts:625` | `getContentClient()` | `getScopedTableClient()` | Sim |
| `listCharacters` | `character/storage.ts:636` | `getContentClient()` | `getScopedTableClient()` | Sim |
| `deleteCharacter` | `character/storage.ts:647` | `getContentClient()` | `getScopedTableClient()` | Sim |
| `listCharactersForCampaign` | `character/storage.ts:666` | `getContentClient()` | `getScopedTableClient()` | Sim |
| `listLegacyCharactersDev` | `character/storage.ts:540` | (nenhum — `return listCharacters();`) | (nenhum — inalterado) | **Não** — só o comentário JSDoc foi tocado no diff |

`listLegacyCharactersDev` não é uma 7ª função migrada nem um alias de outra: é um **wrapper fino** — seu corpo inteiro é `return listCharacters();`, sem `client = ...` próprio — que herda o novo comportamento **transitivamente**, através de `listCharacters()`. Contá-la junto das 6 funções com client trocado (ou junto das "outras 4" dev-only, como peer) inflava a contagem para 7/5.

**Motivo da divergência**: o relatório original enumerou os arquivos/funções mencionados na auditoria narrativa sem separar "função com `client = ...` trocado no diff" de "função que apenas chama outra função migrada". `listLegacyCharactersDev` pertence à segunda categoria.

**Lista exata e classificação correta**:
- **6 funções com o client efetivamente trocado** (commit `0958192`): `createCharacter`, `updateCharacter`, `getCharacter`, `listCharacters`, `deleteCharacter`, `listCharactersForCampaign`.
- **2 são produto real** (a exceção que motivou toda a correção 6): `updateCharacter`, `listCharactersForCampaign`.
- **4 são genuinamente dev/script-only**: `createCharacter`, `getCharacter`, `listCharacters`, `deleteCharacter`.
- **1 função adicional existe e é afetada só transitivamente, não deve ser contada nem nos "6" nem nos "4"**: `listLegacyCharactersDev` (wrapper de `listCharacters()`).

**Call sites revalidados (produto vs. dev vs. diagnóstico vs. sem uso)**:

| Consumidor | Função(ões) chamadas | Classificação |
|---|---|---|
| `src/app/mesas/[campaignId]/MesaDetailClient.tsx:329` | `updateCharacter` | Produto/narrador |
| `src/lib/table/endRound.ts:188` | `updateCharacter` | Produto/narrador (Server Action acionada pelo dashboard) |
| `src/lib/table/endScene.ts:153,190` | `updateCharacter` | Produto/narrador (idem) |
| `src/app/join/[token]/page.tsx:136` | `listCharactersForCampaign` | Produto/jogador (pós-login, pós-aceite) |
| `src/app/dev/table/TableClient.tsx` | `updateCharacter`, `getCharacter` | Desenvolvimento |
| `src/app/dev/character-sheet/CharacterSheetClient.tsx` | `createCharacter`, `updateCharacter`, `getCharacter`, `deleteCharacter`, `listLegacyCharactersDev` | Desenvolvimento |
| `src/app/dev/table/page.tsx`, `src/app/dev/join/[campaignId]/page.tsx`, `src/app/CharacterSheetView.tsx` (`mode==="dev"` apenas) | `listLegacyCharactersDev` | Desenvolvimento/diagnóstico |
| `scripts/test-character-storage.ts` | `createCharacter`, `updateCharacter`, `getCharacter`, `listCharacters`, `deleteCharacter` | Diagnóstico (script, sem contexto de request) |
| `scripts/test-campaign-end-scene.ts`, `scripts/test-campaign-end-round.ts` | `updateCharacter` (via `endCampaignScene`/`endCampaignRound`), `getCharacter`, `deleteCharacter` | Diagnóstico (script, sem contexto de request) |
| `src/lib/character/gmActions.ts`, `src/lib/realtime/useCharacterRealtime.ts`, `src/lib/realtime/tableRealtime.ts` | nenhuma chamada real — só menção em comentário/JSDoc | Sem uso (falso positivo do grep original, confirmado por leitura direta) |

**Comportamento real das rotas `/dev` e dos scripts (frase ambígua corrigida)**: a frase original "rotas /dev/\* e scripts de teste que rodam sem sessão real deixam de funcionar" tratava dois casos estruturalmente diferentes como se fossem o mesmo. Auditado em `src/lib/auth/scopedClient.ts`:

- **Scripts** (`scripts/test-character-storage.ts`, `scripts/test-campaign-end-scene.ts`, `scripts/test-campaign-end-round.ts`): rodam via `node`/`tsx`, fora de qualquer contexto de request HTTP. `getScopedTableClient()` tenta `readAuthTokens()` (lê cookie via `next/headers`), que lança fora desse contexto; o `catch` interno cai para um client `anon` puro — **sempre**, nunca há como esses scripts carregarem uma sessão real, porque não existe cookie de request para ler. Com `anon` sem nenhuma policy (migration 0031), essas 6 chamadas (leitura ou escrita) falham por RLS de forma permanente nesse formato de execução. **Formulação correta**: "os scripts ficaram estruturalmente incompatíveis com a tabela — não é uma falta de login pontual, é a ausência estrutural de qualquer mecanismo de sessão nesse contexto de execução; exigiriam reescrita (ex.: client com service role só para setup de teste) para voltar a funcionar, fora do escopo desta correção."
- **Rotas `/dev/table`, `/dev/character-sheet`, `/dev/join/[campaignId]`**: são Server Components/Server Actions renderizados dentro de uma request HTTP real — o cookie da sessão (se o navegador que as visita estiver logado via `/login`) **é lido normalmente** por `getScopedTableClient()`, que anexa o JWT e faz as 6 funções se comportarem como `authenticated` (RLS resolve pela mesma regra de owner/próprio perfil já usada pelo dashboard de produto). Nenhuma dessas 3 rotas exige login para CARREGAR a página (confirmado em `/dev/table/page.tsx`: `getCurrentUser()` é buscado "só informativo"). **Formulação correta**: "as rotas `/dev` continuam alcançáveis sem login, mas sem uma sessão autenticada as leituras dessas 6 funções voltam listas vazias (RLS filtra silenciosamente, sem erro) e as escritas (criar/atualizar/apagar) falham com erro de RLS; com uma sessão real (visitante logado via `/login`), as rotas voltam a funcionar plenamente, herdando a mesma autorização de produto." Não foram abandonadas nem removidas do código — permanecem presentes e utilizáveis por um desenvolvedor logado.

**Impacto na Etapa 12**: nenhum. A contagem estava errada, não a implementação — o código já fazia exatamente o descrito acima desde o commit `0958192`; esta seção só corrige a descrição. Nenhuma policy, RPC, migration ou fluxo de convite foi alterado por esta retificação.

## 0-5. Correção 5 — RLS restritiva de perfis e personagens (migration 0030)

> **Nota da correção 6**: esta seção é o registro histórico do que a correção 5 fez e concluiu. A classificação de `character/storage.ts` Seção 3/4 como "só dev" (0-5.1) e a policy de SELECT "qualquer membro ativo" (0-5.3) foram REABERTAS e SUBSTITUÍDAS pela migration `0031` — ver `## 0-6` acima para o que está em vigor agora.

### 0-5.1 Auditoria revalidada (matriz de acessos reais)

| Arquivo/função | Client | Role resultante | Rotas | Classificação |
|---|---|---|---|---|
| `character/storage.ts` Seção 1 (`createCharacterForCampaign`, `listCharactersForNarratorCampaign`, `assignCharacterToCampaign`, `assignCharacterToProfile`, `archiveCharacter`, `restoreCharacter`, `duplicateCharacter`, `renameCharacter`, `listCharactersForNarratorProfile`, `listUnassignedCharactersForNarrator`, `listArchivedCharactersForNarratorCampaign`) | `getScopedTableClient()` | `authenticated` (narrador logado) | `/mesas/[campaignId]` | Legítimo — coberto pela nova policy owner |
| `character/storage.ts` Seção 2 (`getCharacterForProfileSession`/`saveCharacterForProfileSession`) | RPC `SECURITY DEFINER` (bypassa RLS de tabela como dono da função) | Indiferente à RLS de tabela | `/ficha` | Legítimo — já reforçado na correção 4, RLS de tabela não afeta |
| `character/storage.ts` Seção 3/4 (`createCharacter`, `updateCharacter`, `getCharacter`, `listCharacters`, `deleteCharacter`, `listLegacyCharactersDev`) | `getContentClient()` (**anon puro, sempre**, confirmado por leitura direta do código) | `anon` (nunca muda, mesmo com sessão) | `/dev/character-sheet`, `scripts/test-character-storage.ts` | Só dev — preservado via policy `anon`, inalterada |
| `table/storage.ts` (todas as funções de `campaign_profiles`: `createCampaignProfile`, `listCampaignProfiles`, `setCampaignProfileLocked`, `setCampaignProfileActiveCharacter`, `enterCampaignProfile`, `heartbeatCampaignProfile`, `leaveCampaignProfile`, `forceReleaseCampaignProfile`) | `getScopedTableClient()` | `authenticated` quando há sessão (narrador OU jogador autenticado); `anon` quando não há (ex.: `/dev/join`) | `/mesas/[campaignId]`, `/join/[token]`, `/dev/join/[campaignId]` | Legítimo — coberto pelas novas policies `authenticated`; fluxo `/dev/join` sem sessão continua coberto por `anon` |

**Conclusão**: nenhuma função de produto legítima usa `getContentClient()` para estas duas tabelas — a restrição de `authenticated` é segura no nível de código. O que falta é a prova em banco real (ver §Verificações não executadas).

### 0-5.2 Estratégia de policies

Narrow (não remoção total): as policies antigas (`campaign_profiles_dev_anon_*`, `characters_dev_transition_*`) tiveram o papel `authenticated` REMOVIDO da lista de roles (`to anon, authenticated` → `to anon`), preservando 100% do comportamento para `anon` (dev/legado). As policies aditivas antigas para `authenticated` (`campaign_profiles_owner_all`, `characters_owner_*`) foram removidas e substituídas por um conjunto explícito de 4 policies por tabela (`select`/`insert`/`update`/`delete`), cada uma usando os helpers de autorização.

### 0-5.3 Semântica final das policies `authenticated`

**`campaign_profiles`**:
- SELECT: owner da campanha OU qualquer membro ATIVO da própria campanha (ver desvio documentado abaixo).
- INSERT: só owner (jogador cria/reivindica só via RPC, que bypassa RLS).
- UPDATE: owner administra qualquer perfil da campanha; o próprio jogador atualiza seu perfil reivindicado.
- DELETE: só owner.

**`characters`**:
- SELECT/UPDATE: owner da campanha, OU `owner_id = auth.uid()` (personagem narrador-autorado legado), OU personagem vinculado ao perfil do próprio jogador (membership ativa + `profile.user_id = auth.uid()`).
- INSERT: mesma regra — jogador só pode inserir vinculado ao PRÓPRIO perfil.
- DELETE: só owner.

**Desvio documentado do pedido original**: o pedido especificava "player ativo lê o próprio perfil" (não todos). A tela de reivindicação já entregue (`ClaimProfileClient`, correção 3) precisa listar TODOS os perfis da campanha (inclusive os de outros jogadores, para marcá-los "indisponíveis") ANTES de qualquer reivindicação — restringir a SELECT a "só o próprio" quebraria essa tela já em produção. `campaign_profiles` não guarda nenhum segredo (o segredo de sessão vive em `profile_sessions.session_token_hash`, tabela separada, não tocada) — por isso a decisão foi permitir leitura por qualquer membro ativo da própria campanha, nunca de outra.

### 0-5.4 Helpers corrigidos

`can_read_character`/`can_manage_character`/`can_access_campaign_profile` (originalmente da correção 3) tinham uma falha: aceitavam `profile.user_id = auth.uid()` sem confirmar que a membership da campanha ainda estava `active`. Um jogador removido (`campaign_members.status = 'removed'`) que já tivesse um perfil reivindicado continuaria passando nesses helpers. Corrigido: agora todos exigem `is_campaign_member()` (que já checa `status='active'`) também.

### 0-5.5 `profile_sessions` — inalterada nesta correção

Não foi tocada — o mecanismo de autoridade real (token + `auth.uid()` quando reivindicado) já foi fechado na correção 4, dentro das 2 RPCs. Esta correção trata do isolamento de TABELA para acesso direto (fora da aplicação), que é um problema diferente e complementar.

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
- `0029_campaign_authorization_enforcement.sql` (não reescrita): `can_read_campaign`/`can_manage_campaign` (aliases); `get_character_for_profile_session`/`save_character_for_profile_session` substituídas (mesma assinatura) para também exigir `auth.uid() = campaign_profiles.user_id` quando o perfil já foi reivindicado.
- `0030_campaign_profile_character_rls.sql` (nova, desta sessão): `can_read_character`/`can_manage_character`/`can_access_campaign_profile` corrigidas (exigem membership `active`, não só `user_id` batendo); policies antigas de `campaign_profiles`/`characters` narrowed para `anon` (dev/legado preservado) + policies novas restritivas para `authenticated` (owner + jogador via ownership real).
- Nenhuma migration em massa do catálogo oficial; `content_documents.payload` inalterado; nenhum backfill especulativo de jogador, perfil ou personagem.

## 12. Modelo × instância

Inalterado — nenhuma função nova toca estado mutável de personagem. Esta correção só altera QUEM pode fazer SELECT/INSERT/UPDATE/DELETE nas linhas de `campaign_profiles`/`characters` — nunca a lógica de leitura/escrita do `payload` em si.

## 13. Segurança (resumo)

- Autorização de leitura/escrita de conteúdo de campanha passa por relação real (`campaign_members`/`owner_id`), nunca por conhecimento do ID.
- Reivindicação de perfil exige `auth.uid()` real + membership ativa; corrida de reivindicação dupla fechada por `for update` + índice único.
- **Leitura/escrita de personagem pelo jogador via RPC** exige token de sessão real E (quando reivindicado) `auth.uid()` correspondente (correção 4).
- **RLS de tabela de `campaign_profiles`/`characters` agora restritiva** (correção 5): a policy `anon, authenticated USING(true)` foi substituída — `anon` preservado (dev/legado), `authenticated` agora exige ownership real (owner da campanha, ou jogador para seu próprio perfil/personagem, com membership `active` confirmada).
- Nenhuma policy genérica para `authenticated` restante; nenhum service role no client; nenhum `eval`/fórmula arbitrária.
- Admin global da Biblioteca oficial (`is_content_admin`) **nunca** é tratado como narrador/membro de campanha.
- **Desvio documentado**: SELECT de `campaign_profiles` para `authenticated` permite qualquer MEMBRO ATIVO ler todos os perfis da própria campanha (não só o próprio) — necessário para a tela de reivindicação já entregue (`ClaimProfileClient`) funcionar; tabela não guarda segredos (token vive em `profile_sessions`, separada).
- **Limitação real que mantém o status parcial**: nada disto foi aplicado nem comprovado contra um Supabase real.

## 14. Cache

Inalterado — não existe camada de cache de conteúdo no projeto.

## 15. Importação/exportação

Inalterado — fora de escopo.

## Verificações executadas

- `git status --short` / `git diff --check` — limpos (correção 7).
- `npx tsc --noEmit` — sem erros (correção 7, após reescrever `enterCampaignProfile`/`heartbeatCampaignProfile`/`leaveCampaignProfile`/`validateProfileSessionToken`/`expireStaleProfileSessions`/`forceReleaseCampaignProfile`/`setCampaignProfileActiveCharacter` em `table/storage.ts` para chamar as RPCs novas).
- `npm run build` (Next.js/Turbopack) — sucesso; nenhuma rota nova nesta correção (só migration SQL + refactor de client). `next-env.d.ts` verificado sem diff após o build.
- `scripts/dev/validate-campaign-homebrew.mjs` — **18/18 verificações** (inalteradas — nada nesta correção toca `campaignContent*`).
- `scripts/dev/validate-profile-session-lockdown.mjs` (NOVO, desta correção) — **48/48 verificações estruturais**: confirma, por análise de texto da migration `0032` (não execução de SQL), que as policies `*_dev_transition_*` são dropadas pelo nome CORRETO (o achado 0 desta correção), que `revoke all ... from anon` existe para as duas tabelas, que `campaign_profiles_authenticated_update` não contém mais `user_id = ` (só owner), que as 7 RPCs novas existem com `security definer`+`search_path`+`revoke`/`grant` mínimos, que `set_campaign_profile_active_character` valida `campaign_id`/`profile_id`/`archived_at`, e que `get/save_character_for_profile_session` exigem `characters.profile_id = p_profile_id`. Esta verificação NÃO prova comportamento de RLS real — só que o texto da migration contém as cláusulas esperadas (rede de segurança contra o exato tipo de erro — nome de policy errado — que causou o achado 0).
- Auditoria função-a-função (não por nome) de `table/storage.ts`: cada consumidor de `profile_sessions`/`campaign_profiles` foi revalidado individualmente (matriz completa em §0-7.2) — `setCampaignProfileActiveCharacter` confirmado como único consumidor de `MesaDetailClient.tsx` (owner-only, sem caminho de jogador); `getActiveProfileSession` confirmado como código morto (nenhum consumidor).
- Releitura completa do histórico de renomeação de policies (`0004`→`0006`→`0007`→`0013`→`0030`→`0031`) que revelou o achado 0 (`campaign_profiles_dev_transition_*` nunca removida pelo nome certo) — não presumido do relatório da auditoria anterior.

## Verificações não executadas (SQL real)

- **Nenhuma verificação transacional contra Supabase real** — sem projeto conectado nesta sessão. Isso inclui TODOS os cenários pedidos com identidades distintas: owner, Player A, Player B, invited, removed, outsider, anon, perfil não reivindicado — e os DOIS ataques específicos pedidos: (1) tentar gravar `session_token_hash` de um token escolhido pelo atacante diretamente em `profile_sessions` e confirmar que a RPC de personagem rejeita; (2) tentar apontar `active_character_id` do perfil A para o personagem de B (via RPC e, administrativamente, via UPDATE direto simulando dado legado inconsistente) e confirmar que `get/save_character_for_profile_session` rejeitam mesmo assim. **Nenhum destes foi executado** — a migration `0032` foi escrita e revisada estaticamente, nunca aplicada.
- **Diagnóstico de dados legados** (`## 0-7.4`) — não executado (sem Supabase conectado). Deve rodar ANTES de aplicar `0032` em produção.
- **Browser check** — não executado (sem ambiente de browser com sessão Supabase real disponível nesta sessão).

## Limitações reais (gaps honestos que permanecem)

- **RLS restritiva e sem `anon` escrita, não comprovada** — é a única coisa que falta para o próximo nível de status; sem Supabase conectado, não há como aplicar a migration `0032` nem rodar os cenários/ataques específicos pedidos.
- **Diagnóstico de dados legados não executado** (`## 0-7.4`) — se existirem personagens cujo `active_character_id` já aponta para um vínculo inconsistente com o modelo canônico (`characters.profile_id`), aplicar a migration não corrige isso automaticamente; precisa ser resolvido manualmente antes/depois de aplicar.
- **Roster do `/join` não tratado** (`## 0-7.7`) — `JoinClient` continua recebendo `perfisIniciais` limitado a 0-1 linha para jogador (efeito da correção 6); não restaurado nem substituído por RPC de roster nesta correção, por não haver intenção de produto inequívoca documentada.
- **Consequência aceita da migração de client (correção 6, redação precisa em `## 0-6.8`)**: scripts de teste ficaram estruturalmente incompatíveis com `campaign_profiles`/`characters` (rodam fora de contexto de request); rotas `/dev/*` continuam alcançáveis sem login mas degradam sem sessão real.
- **Débitos não bloqueantes** (`## 0-7.8`): duplicação `can_read_character`/policy inline; helpers órfãos `can_read_campaign`/`can_manage_campaign`/`can_manage_campaign_profile`; `enforce_campaign_content_limits()` sem `search_path`; policies `characters_owner_*` redundantes; ausência de UI para `status='removed'`.
- **Referências**: cobertura confirmada completa no escopo real do schema atual — nenhuma família adicional real foi encontrada em nenhuma das correções anteriores. Não reaberto nesta correção (nenhuma lacuna concreta nova foi encontrada, nem alegada). "Referência efetiva" continua não implementada.
- Detecção de impacto em personagens continua heurística (substring) como sinal SECUNDÁRIO.
- Diff de três vias é estrutural raso (profundidade 4), não um merge visual completo.
- Sem observabilidade dedicada (log estruturado) além dos erros já retornados.
- Sem projeção pública dedicada para "informações resumidas de outros personagens".
- **Nada disto foi comprovado contra Supabase real.**

## Encerramento

TypeScript e build passam; 18 verificações focadas da Etapa 12 passam; 48 verificações estruturais novas desta correção passam; nenhuma publicação automática no catálogo oficial; nenhuma escrita em `content_documents`/`content_drafts` oficiais; nenhuma tabela de marketplace criada; nenhuma instância de personagem é tocada ou apagada por nenhuma função; nenhum backfill especulativo de jogador, perfil ou personagem; nenhuma regra mecânica (Aljava, MIT/PD, capacidade 15, etc.) foi alterada; nenhuma policy `anon` remanescente em `campaign_profiles`/`profile_sessions`/`characters` (confirmado pelos NOMES REAIS desta vez, não pelos nomes presumidos das correções 5/6); jogador sem UPDATE direto em `campaign_profiles`; `active_character_id` só gravável por RPC que valida propriedade real do personagem. A Etapa 11 permanece "Implementação parcial — integração editorial de drag pendente", inalterada. **Não avancei para nenhuma etapa adicional.**

**Status geral da Etapa 12: Implementação parcial — validação transacional e de RLS em Supabase pendente.**
