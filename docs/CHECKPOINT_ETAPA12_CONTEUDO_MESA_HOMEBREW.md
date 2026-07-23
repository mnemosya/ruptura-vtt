# Checkpoint — Etapa 12: Conteúdo de mesa e homebrew

## Status

**Status geral da Etapa 12: Implementação parcial — autorização de leitura, referências de campanha e validação transacional/RLS pendentes.**

Esta é uma correção sobre a implementação anterior (commits `953612d`/`693aafd`). A auditoria desta correção encontrou uma **falha estrutural real**, não apenas uma validação ainda não executada: a leitura de `campaign_content_documents` publicado estava protegida só por `campaign_id` + a mesma policy permissiva (`anon, authenticated`) já usada por `characters`/`campaign_profiles`/`table_logs` — **conhecer o `campaign_id` nunca comprovou pertencimento à campanha**. Isso foi corrigido (migration `0026`): a leitura agora exige `can_read_campaign_content()` (membership real via `campaign_members`/`campaigns.owner_id`), nunca mais aberta por só conhecer o ID.

A Etapa 11 **permanece exatamente**: "Implementação parcial — integração editorial de drag pendente" — nada nesta correção altera esse status.

## 1. Auditoria de autorização (matriz completa desta correção)

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

- `0025_campaign_content_homebrew.sql` (não reescrita — commitada anteriormente): `campaign_content_documents`/`_drafts`/`_editor_metadata`/`_changelog` + RPCs de publicação/remoção/arquivamento.
- `0026_campaign_membership_authorization.sql` (nova, corretiva): `campaign_members` + backfill do owner; `is_campaign_member`/`can_manage_campaign_content`/`can_read_campaign_content`; RLS corrigida das 4 tabelas da Etapa 12; gatilho de limites.
- Nenhuma migration em massa do catálogo oficial; `content_documents.payload` inalterado; nenhum usuário migrado para campanha sem vínculo comprovável (só o `owner_id` já existente).

## 12. Modelo × instância

Inalterado desde a versão anterior — nenhuma função nova toca `characters`/inventário. O diagnóstico de impacto (§9) LÊ `characters.payload` (só leitura, heurística), mas nenhuma escrita.

## 13. Segurança (resumo)

- Autorização de leitura e escrita agora passa por relação real (`campaign_members`/`owner_id`), nunca por conhecimento do ID.
- Nenhuma policy genérica para `authenticated`; nenhum service role no client; nenhum `eval`/fórmula arbitrária.
- Admin global da Biblioteca oficial (`is_content_admin`) **nunca** é tratado como narrador de campanha — são checagens (`is_content_admin` vs. `is_campaign_owner`/`can_manage_campaign_content`) completamente separadas, confirmado por auditoria de código (nenhuma função de campanha chama `is_content_admin`).
- Limitação herdada e não resolvida por esta correção (fora de escopo): `characters`/`campaign_profiles`/`table_logs` continuam com RLS aberta — autenticação real de jogador não existe no projeto.

## 14. Cache

Confirmado (mesma auditoria da versão anterior): não existe camada de cache de conteúdo no projeto (leituras diretas ao Supabase, sem `fetch()`/`unstable_cache`) — "cache por campanha" não se aplica; nada para invalidar além do `revalidatePath` já usado.

## 15. Importação/exportação

Inalterado — fora de escopo desta correção.

## Verificações executadas

- `git status --short` — só os arquivos desta correção.
- `git diff --check` — sem problemas de espaço em branco.
- `npx tsc --noEmit` — sem erros.
- `npm run build` (Next.js/Turbopack) — sucesso; nova rota `/mesas/[campaignId]/biblioteca/comparar/[docId]` presente.
- `scripts/dev/validate-campaign-homebrew.mjs` (atualizado) — **15/15 verificações**: `classificarEstadoAtualizacao` (5, já existentes), `diffEstrutural`/`compararTresVias` (5, incluindo detecção de conflito real e não-detecção de reordenação de chaves), validadores de limite (5, incluindo os tetos de publicados/rascunhos).
- Validação estática da migration `0026`: contagem balanceada de blocos `$$` (8 = 4 funções), `begin`/`commit` únicos, revisão manual de cada `drop policy`/`create policy` contra a tabela-alvo.

## Verificações não executadas (SQL real)

- **Nenhuma verificação transacional contra Supabase real** — sem projeto conectado nesta sessão. Isso inclui, especificamente, os 15 cenários pedidos (owner lê próprio publicado; owner cria/publica; membro ativo lê publicado; membro NÃO lê rascunho/metadata; externo NÃO lê publicado; usuário de outra campanha NÃO lê; externo NÃO publica; override afeta só a campanha correta; fallback oficial funciona; remoção restaura oficial; conflito otimista bloqueia; referência cruzada bloqueia; falha não deixa histórico falso; zero resíduo). **Nenhum destes foi executado** — a lógica foi projetada e revisada estaticamente para satisfazê-los, mas isso não é o mesmo que prova de banco real. Não alego que a RLS "passou" — ela nunca rodou.
- **Browser check** — não executado (esbuild/`tsx` bloqueados neste ambiente, mesmo problema já registrado nos checkpoints anteriores).

## Limitações reais (gaps honestos que permanecem)

- Autorização de jogador real: arquitetura preparada (`campaign_members`), mas **inerte** até existir autenticação real de jogador — nenhuma leitura de conteúdo efetivo de campanha funciona hoje para um jogador anônimo (comportamento ANTES desta correção era inseguro, não "funcional"; agora é seguro e claramente bloqueado).
- Referência efetiva (override substituindo o oficial na resolução de dependência de outro documento) não implementada — só oficial-ou-homebrew-local.
- Detecção de impacto em personagens é heurística (substring), não uma varredura estruturada e exaustiva — documentado no próprio módulo.
- Diff de três vias é estrutural raso (profundidade 4), não um merge visual completo — atende ao pedido ("não precisa criar merge visual complexo"), mas não é uma comparação exaustiva de arrays item-a-item.
- Sem observabilidade dedicada (log estruturado) além dos erros já retornados.

## Encerramento

TypeScript e build passam; 15 verificações focadas em Node passam; nenhuma publicação automática no catálogo oficial; nenhuma escrita em `content_documents`/`content_drafts` oficiais; nenhuma tabela de marketplace criada; nenhuma instância de personagem é tocada ou apagada por nenhuma função. A Etapa 11 permanece "Implementação parcial — integração editorial de drag pendente", inalterada. **Não avancei para nenhuma etapa adicional.**

**Status geral da Etapa 12: Implementação parcial — autorização de leitura, referências de campanha e validação transacional/RLS pendentes.**
