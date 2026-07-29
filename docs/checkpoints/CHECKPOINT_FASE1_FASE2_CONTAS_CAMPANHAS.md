# Relatório de Implementação — Fase 1 e Fase 2

**Data**: 2026-07-29
**Escopo**: implementação da Fase 1 (Fundação de identidade e autorização) e Fase 2 (Convites e entrada) do plano aprovado em `docs/relatorios/AUDITORIA_REFATORACAO_CONTAS_CAMPANHAS_CONVITES_PERSONAGENS.md` (revisão 4).
**Branch**: `main`. Sem remote configurado — nada foi enviado para fora da máquina local.

---

## 1. Migrations aplicadas (Supabase real, projeto `ruptura-vtt` / `yvxoijexyhjjipjktfuu`)

Todas aplicadas via `apply_migration` contra o projeto real, na ordem abaixo, e persistidas em `supabase/migrations/`. Nota de numeração: `0056` foi pulada por um lapso meu ao nomear os arquivos — não há impacto funcional (cada migration foi aplicada e registrada individualmente pelo nome, não por sequência estrita), mas registro aqui para transparência.

| Arquivo | Objetivo |
|---|---|
| `0051_character_controllers.sql` | Cria `character_controllers`, índice único `characters(id, campaign_id)`, RLS, `is_character_controller_for` (interna), `is_character_controller` (pública), `grant_character_control`, `revoke_character_control`, `update_character_sheet_payload`. |
| `0052_character_authorization_via_controllers.sql` | Reescreve `can_read_character`/`can_manage_character` (lacunas 1 e 2: exige controle **e** participação ativa; `owner_id` só autoriza personagem sem campanha). Reescreve RLS `SELECT`/`INSERT`/`UPDATE`/`DELETE` de `characters` (lacuna 3: `UPDATE` direto só para o narrador). |
| `0053_character_creation_drafts_decouple_profile.sql` | Remove `profile_id` de `character_creation_drafts`; nova chave (`campaign_id`, `owner_id`); reescreve `save_character_creation_draft`. |
| `0054_complete_character_creation_without_profile.sql` | Reescreve `complete_character_creation` sem `p_profile_id`; concede controle automaticamente ao criador via `character_controllers`. |
| `0055_remove_campaign_member.sql` | Nova RPC `remove_campaign_member` — marca participação como `removed` e limpa `character_controllers` na mesma transação. |
| `0057_table_logs_decouple_profile.sql` | Remove `profile_id`/`profile_session_id` de `table_logs`; reescreve `append_table_log` sem esses parâmetros. |
| `0058_drop_campaign_profiles_and_profile_sessions.sql` | **Migration destrutiva** — remove definitivamente `campaign_profiles`, `profile_sessions` e os 15 objetos do modelo de perfil (lista completa na seção 2), sem `CASCADE`, precedida de inspeção de dependências via `pg_depend`. |
| `0059_campaign_invites_email_kind.sql` | Fase 2 — `campaign_invites` ganha `kind`/`email`/`activated_by`/`activated_at`; reescreve `accept_campaign_invite` e `resolve_campaign_invite_public`; nova RPC `activate_pending_email_invites`. |

Correção de segurança aplicada durante o processo (achado do advisor, não fazia parte do plano original): `is_character_controller` estava sem `revoke ... from anon` explícito logo após a migration 0051 — corrigido imediatamente com uma migration corretiva de uma linha antes de qualquer teste comportamental rodar. Confirmado via `get_advisors` que não há mais nenhum aviso de `EXECUTE` indevido para `anon` em nenhuma função nova.

---

## 2. Objetos removidos definitivamente (migration 0058)

**Tabelas**: `campaign_profiles`, `profile_sessions`.

**Coluna**: `characters.profile_id` (+ índice `characters_one_active_per_profile_campaign_uidx`).

**Colunas** (achado durante a inspeção de dependências, fora da lista original do relatório de auditoria — tratado como dependência externa real e removido na Fase 1, migration 0057): `table_logs.profile_id`, `table_logs.profile_session_id`.

**RPCs** (13): `get_character_for_profile_session`, `save_character_for_profile_session`, `enter_campaign_profile`, `heartbeat_profile_session`, `leave_campaign_profile`, `validate_profile_session_token`, `expire_stale_profile_sessions`, `force_release_campaign_profile`, `set_campaign_profile_active_character`, `claim_own_active_character`, `claim_campaign_profile`, `create_and_claim_campaign_profile`, `list_claimable_campaign_profiles`.

**Helpers** (2): `can_access_campaign_profile`, `can_manage_campaign_profile`.

**Policies, trigger, índices**: todas as policies de `campaign_profiles`/`profile_sessions`, o trigger `campaign_profiles_set_updated_at`, e os índices próprios de ambas as tabelas — removidos nomeadamente antes do `DROP TABLE` (sem `CASCADE`).

**Confirmação pós-drop** (script `validate-post-destructive-migration.mjs`): consulta direta a `campaign_profiles`/`profile_sessions` falha com "relation does not exist" (não retorna vazio — a tabela realmente não existe); todos os objetos que deveriam sobreviver (`characters`, `campaign_members`, `campaign_invites`, `character_controllers`, `character_creation_drafts`, `table_logs`, `is_campaign_owner`, `is_campaign_member`, `can_read_character`, `grant_character_control`, `complete_character_creation`) continuam funcionais.

---

## 3. Arquivos alterados

### Fase 1 (commit `b6cc5e6`) — 45 arquivos, +2842/−3514 linhas

**Removidos por completo**: `scripts/dev/expire-profile-sessions.ts`, `scripts/dev/validate-profile-session-lockdown.mjs`, `src/app/api/internal/expire-profile-sessions/route.ts`, `src/app/dev/join/[campaignId]/JoinClient.tsx`, `src/app/join/[token]/ClaimProfileClient.tsx`, `src/lib/campaignContent/campaignProfileServerActions.ts`, `src/lib/internal/cron-secret.ts`, `src/lib/table/browserSession.ts`, `src/lib/table/profileStatus.ts`.

**Criados**: `scripts/dev/validate-character-controllers-authorization.mjs`, `scripts/dev/validate-post-destructive-migration.mjs`, as 7 migrations da Fase 1, e este conjunto de relatórios em `docs/relatorios/`.

**Modificados** (destaques): `src/lib/character/storage.ts` e `src/lib/table/storage.ts` (reescrita do contrato de backend), `src/app/dev/character-sheet/CharacterSheetClient.tsx` (−581 linhas líquidas — remoção de toda a lógica de sessão de perfil, ligação ao caminho mínimo `campaignId`+`characterId`), `src/app/dev/table/TableClient.tsx` (−272 linhas — remoção da aba "Perfis"), `src/app/mesas/[campaignId]/MesaDetailClient.tsx` (seção "Perfis" → "Participantes" + controle por personagem), `src/app/join/[token]/page.tsx` (fluxo sem etapa de perfil), `src/app/mesas/[campaignId]/personagens/novo/CreateCharacterWizardClient.tsx` (wizard sempre self-service).

### Fase 2 (commit `c15df95`) — 7 arquivos, +636/−25 linhas

`src/app/LoginForm.tsx` (prop `lockedEmail`, ativação pós-login), `src/app/join/[token]/page.tsx` (passa `lockedEmail`), `src/app/mesas/[campaignId]/MesaDetailClient.tsx` (UI de convite por e-mail), `src/lib/table/storage.ts`/`types.ts` (novo contrato de convites), migration `0059`, script `validate-campaign-invites-fase2.mjs`.

---

## 4. Testes comportamentais contra Supabase real

Três suítes, todas rodadas contra o projeto real (não simulação), com criação/limpeza de contas e campanhas reais via `auth.admin` (service role só para fixtures — nunca como identidade testada):

| Script | Testes | Resultado |
|---|---|---|
| `validate-character-controllers-authorization.mjs` | 19 (18 da seção 13.8 da auditoria + 1 extra) | **19/19 aprovados** |
| `validate-campaign-invites-fase2.mjs` | 9 (convite por e-mail/limpo, ativação automática, revogação, idempotência) | **9/9 aprovados** |
| `validate-post-destructive-migration.mjs` | 3 (testes 11 e 20 da auditoria, pós-drop) | **3/3 aprovados** |
| `validate-campaign-session-concurrency.mjs` (reescrito) | 3 cenários de concorrência real (`Promise.allSettled`, dois clientes simultâneos) | **3/3 aprovados** |

**Total: 34/34 testes comportamentais aprovados**, incluindo os quatro achados críticos da revisão 4 (controle exige participação ativa mesmo com linha residual; `owner_id` nunca contorna controle em personagem de campanha; jogador não altera `campaign_id`/`owner_id`/arquivamento; narrador mantém poderes administrativos completos) e a confirmação de que a migration destrutiva não removeu nada fora da lista aprovada.

Todas as fixtures (contas de teste, campanhas, personagens) foram limpas ao final de cada execução — confirmado por contagem zero após cada rodada.

---

## 5. Testes existentes (scripts `test:*` pré-existentes)

| Script | Resultado | Observação |
|---|---|---|
| `test:realtime-minimal` | ✅ passou | Sem relação com o refactor; roda offline. |
| `test:realtime-publication` | ✅ passou | Confirma `characters`/`campaigns`/`table_logs` publicadas para Realtime. |
| `test:canonical-schema` | ✅ passou | Validação de schema de conteúdo — não tocada pela Fase 1/2. |
| `test:character-storage` | ❌ falhou (pré-existente) | `permission denied for table characters` — script não tem sessão real (usa `SUPABASE_ANON_KEY` sem login). Confirmado via `git show HEAD` que esse comportamento já era documentado no próprio `storage.ts` **antes** desta sessão começar ("deixam de funcionar sem uma sessão real" — achado de uma correção anterior, não regressão da Fase 1/2). |
| `test:campaign-end-round` | ❌ falhou (pré-existente) | Mesma causa raiz: script usa a service role key no lugar da anon key para simular sessão, mas `auth.uid()` fica `null` sob esse truque — `append_table_log` sempre exigiu `auth.uid()` não-nulo, **antes e depois** desta sessão (corpo da função inalterado nesse ponto). O teste avança pelas etapas 1-2 e só falha na asserção de um log específico, consistente com essa causa. |
| `test:campaign-end-scene` | ❌ falhou (pré-existente) | Mesma causa raiz do item acima. |

As 3 falhas são um limite conhecido e documentado do próprio harness de teste (não uma regressão): eles dependem de uma sessão autenticada real que o truque "service role no lugar da anon key" não fornece, e essa exigência já existia antes desta sessão. Não alterei a lógica de autenticação desses scripts porque não fazia parte do escopo pedido — sinalizo aqui para que a equipe decida se vale a pena migrá-los para um padrão de fixture com login real (como os scripts `validate-*.mjs` novos já fazem).

---

## 6. Tipos e build

- `npx tsc --noEmit`: **limpo** (zero erros) em ambos os pontos de checkpoint (fim da Fase 1 e fim da Fase 2).
- `npm run build` (`next build`, produção): **limpo** em ambos os pontos — build completo, todas as rotas geradas, sem warnings de tipo.

---

## 7. Verificação em browser (dev server real, contas reais criadas e depois removidas)

**Fase 1**: cadastro → criação de campanha → assistente de criação de personagem (sem nenhuma etapa de perfil) → redirecionamento automático para `/ficha?campaignId=...&characterId=...` → ficha carrega via `getCharacterForCampaign` → edição salva via `update_character_sheet_payload` (confirmado "✓ Salvo" na UI) → dashboard do narrador mostra "Personagens da mesa" com "Controlado por: `<user_id>`" e "Participantes (0)" corretamente (sem quebrar).

**Fase 2**: narrador cria convite por e-mail na UI → link gerado uma única vez → em sessão sem login, o link mostra e-mail pré-preenchido e **travado** (não editável) com o aviso "Este convite pertence a este e-mail" → cadastro com esse e-mail → entrada automática na campanha, direto em "Você entrou em 'Campanha...'" com "Você ainda não controla um personagem nesta campanha" — **sem nenhuma etapa de perfil**. Tentativa de aceitar o mesmo link com uma conta de e-mail diferente (a do narrador) foi corretamente rejeitada com "Este convite pertence a outro e-mail — entre com a conta correspondente para aceitá-lo."

Nenhum erro de console ou de servidor em nenhuma das duas verificações. Todas as contas/campanhas de teste do browser foram removidas do banco ao final.

---

## 8. Commits

```
c15df95 feat: Fase 2 — convite por e-mail com ativação automática, convite limpo
b6cc5e6 feat: Fase 1 — conta como identidade única, character_controllers substitui perfil
```

Ambos na branch `main`, local (sem remote configurado — nada foi enviado para fora desta máquina). Nenhum outro commit foi criado ou alterado.

---

## 9. Estado do working tree

```
$ git status
On branch main
nothing to commit, working tree clean
```

Nenhum arquivo pendente, nenhum artefato de teste esquecido (`.next/` foi limpo e regenerado pelo build; nenhum dado de teste restou no Supabase — confirmado por contagem zero em todas as limpezas).

---

## 10. Decisões de implementação não explicitadas letra-por-letra no plano aprovado (documentadas para revisão)

Durante a implementação, encontrei alguns pontos que o desenho técnico da revisão 4 não especificava no nível de código e que exigiram uma decisão minha, sempre seguindo os princípios já aprovados:

1. **`table_logs.profile_id`/`profile_session_id`**: dependência externa descoberta durante a inspeção via `pg_depend` que a auditoria original não havia listado explicitamente (só previa `characters.profile_id`). Removidas na migration 0057, com `created_by_user_id` (já existente) assumindo o papel de identificar o autor de um log — inclusive para o filtro de "log privado" em `listLogsForViewer`, que antes usava `profile_id`.
2. **`assignCharacterToCampaign` e a FK composta**: mover ou desvincular um personagem de campanha exigiria revogar seus controladores primeiro (a FK composta de `character_controllers` bloqueia mudar `campaign_id` enquanto há controladores apontando para a campanha antiga). Resolvido revogando automaticamente todos os controladores antes de trocar `campaign_id` — narrador precisa reconceder controle na nova campanha (ou na mesma, se só desvinculou e revinculou).
3. **`createCharacterFromWizard` deixou de aceitar `profileId`**: já que não há mais perfil, o wizard agora sempre concede controle à própria conta que está criando (narrador ou jogador). Isso muda um comportamento sutil: o narrador criando um PNJ "solto" pelo assistente completo (não pela criação rápida do dashboard) agora recebe controle automaticamente sobre ele — se isso não for desejado, é simples de ajustar numa fase futura (bastaria não conceder controle quando o criador for o dono da campanha).
4. **Limite de "um personagem por perfil por campanha" foi removido, não substituído**: como a auditoria já previa, isso é uma mudança de comportamento pretendida (permite múltiplos personagens por conta na mesma campanha) — não implementei nenhum novo limite, porque a política final é uma decisão de produto pendente (§12 do relatório de auditoria).
5. **Painel "Jogadores e convites" não foi consolidado numa única área**: mantive "Participantes" e "Convites" como duas seções separadas dentro do dashboard atual do narrador (ainda a mesma tela monolítica) — a consolidação visual e a divisão em sub-rotas de menu são explicitamente escopo da Fase 3/4, não desta rodada.
6. **Exibição de participantes por `user_id` bruto**: como não há uma forma segura de resolver e-mail/nome de exibição de outra conta a partir do client (isso exigiria acesso administrativo a `auth.users`, que corretamente não está disponível fora de service role), a seção "Participantes" mostra o UUID da conta em vez de um nome amigável. Resolver isso é matéria de uma fase futura (provavelmente exigindo uma tabela de perfil público ou uma RPC dedicada).

Nenhuma dessas decisões contraria os princípios aprovados (conta como identidade única, sem "perfil", controle desacoplado via `character_controllers`, autorização sempre no servidor) — são preenchimentos de lacunas de nível de implementação que o desenho técnico não cobria em detalhe.

---

## Próximos passos sugeridos (não implementados nesta rodada)

Conforme o plano aprovado, seguem as Fases 3 (Navegação da campanha), 4 (Personagens) e 5 (Integração da ficha) — nenhuma foi iniciada. As decisões de produto pendentes listadas na seção 12 do relatório de auditoria (múltiplos narradores fora de escopo, política de criação livre de personagem pelo jogador, papéis intermediários, expiração de convite por e-mail, limite de usos do convite limpo, política de edição concorrente) continuam em aberto.
