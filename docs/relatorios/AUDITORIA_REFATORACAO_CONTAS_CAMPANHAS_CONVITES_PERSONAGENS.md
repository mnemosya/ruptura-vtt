# Auditoria e Plano de Refatoração — Contas, Campanhas, Convites, Participantes, Personagens e Navegação

**Data**: 2026-07-28 (revisão 2: 2026-07-29; revisão 3: 2026-07-29; revisão 4: 2026-07-29)
**Escopo**: adequação do Ruptura VTT ao modelo definido em `ADITIVO_PRD_CONTAS_CAMPANHAS_CONVITES_PERSONAGENS.md` (autoritativo onde conflita com `PRD Ruptura VTT.md`).
**Natureza deste documento**: auditoria + plano + desenho técnico da Fase 1. Nenhum código, migration ou dado foi alterado para produzi-lo.
**Revisão 2**: reescreveu o plano (remoção definitiva de `campaign_profiles`/`profile_sessions`, reordenação de fases, testes comportamentais obrigatórios).
**Revisão 3**: corrigiu o tratamento de participações pendentes, garantiu `/ficha` funcional entre as Fases 1 e 5, registrou a ordem interna segura de implantação, resolveu a redundância de `campaign_id` em `character_controllers`, e acrescentou o desenho técnico da Fase 1.
**Revisão 4** (esta): fecha quatro lacunas de autorização identificadas na revisão do desenho técnico — controle exige participação ativa; `owner_id` não contorna controle em personagens de campanha; escopo de escrita do jogador é restrito por coluna via RPC dedicada, não por policy genérica; migration destrutiva remove objetos explicitamente listados, sem `CASCADE` amplo, com inspeção de dependências prévia. Também revê a API pública dos helpers de autorização. Ver changelog ao final.

---

## 1. Resumo executivo

O código atual implementa um modelo de acesso **anterior** ao aditivo: jogadores não têm conta própria obrigatória — eles entram por um link de convite, "reivindicam" (ou criam) um **`campaign_profile`** (um assento dentro da mesa, não uma identidade), e operam a ficha por um **token de sessão de perfil** (`profile_sessions`) guardado no `localStorage`, sem necessariamente ter feito login no Supabase Auth. Só o narrador (dono da campanha, `campaigns.owner_id`) usa autenticação real (Supabase Auth + cookie `ruptura_auth`) de ponta a ponta.

Isso diverge do aditivo em quatro pontos estruturais:

1. **Não existe login único para jogador e narrador.** Hoje, o jogador só é forçado a logar no Supabase Auth para *aceitar o convite*; depois disso a operação da ficha roda inteiramente sobre o token de `profile_sessions`.
2. **"Perfil" é uma entidade central e visível**, termo que o aditivo proíbe. Existe uma etapa obrigatória de "reivindicar ou criar um perfil" antes de acessar campanha ou personagem.
3. **Personagem não está desacoplado de "perfil"** — hoje o vínculo é 1:1 perfil↔personagem-ativo, reforçado por índice único em banco, em vez do modelo N:N (`character_controllers`) pedido pelo aditivo.
4. **Convite tem só um tipo hoje**, sem os dois modos exigidos (e-mail com auto-ativação; limpo, reutilizável, só Jogador).

Por outro lado, a fundação técnica é sólida e reaproveitável: autorização é sempre validada no servidor, tokens são opacos com hash no banco, e o narrador já acessa qualquer personagem da própria campanha via RLS direta.

**Decisão de produto que orienta as revisões 2–4**: `campaign_profiles`/`profile_sessions` não são preservados como implementação interna nem como compatibilidade de produto. A autorização do jogador depende exclusivamente de: conta autenticada → `campaign_members` (participação **ativa** de uma conta existente) → `character_controllers` (controle de personagem) → `characters.campaign_id` (pertencimento à campanha). Dados de desenvolvimento são descartados; a **implantação** segue ordem interna segura (seção 13.7).

**Participação pendente (revisão 3)**: convite (e-mail ou limpo) nunca cria `campaign_members` por si só. `campaign_members.user_id` permanece `NOT NULL`. O estado "pendente" de convite por e-mail vive em `campaign_invites`, ativado só após autenticação com o e-mail correspondente.

**Ficha (revisão 3)**: a Fase 1 entrega o caminho mínimo de abertura de ficha por `campaignId`+`characterId`, sem UX completa (isso é Fase 5).

**Autorização (revisão 4 — nesta revisão)**: a revisão do desenho técnico identificou quatro lacunas que este documento fecha antes de aprovar a implementação:
1. Controle de personagem (`character_controllers`) só concede acesso quando combinado com **participação ativa** em `campaign_members` para a mesma campanha — um jogador removido da campanha perde acesso imediatamente, mesmo com linha residual de controle.
2. `characters.owner_id` só concede acesso independente para personagens **sem campanha** (`campaign_id is null`). Para personagens de campanha, a autorização vem exclusivamente de `is_campaign_owner`, controle + membership ativa — nunca de `owner_id` isolado, mesmo em dados antigos/de desenvolvimento onde essa coluna ainda esteja preenchida.
3. Leitura e edição deixam de ser autorizadas pela mesma regra genérica: o jogador controlador escreve exclusivamente por uma RPC dedicada com whitelist de colunas (conteúdo da ficha), nunca por `UPDATE` direto de tabela; metadados administrativos (`campaign_id`, `owner_id`, `archived_at`, controle) só são alteráveis pelo narrador.
4. A migration destrutiva da Fase 1 remove uma lista explícita e nomeada de objetos, sem `DROP ... CASCADE` amplo, precedida de inspeção de dependências no catálogo do Postgres — se algo inesperado depender de um objeto a remover, a migration falha para auditoria manual, em vez de apagar silenciosamente.

Não existe suíte de testes automatizada (nem CI). Toda fase que toque autenticação/RLS/convites/controle usa exclusivamente teste comportamental contra Supabase real (duas contas, duas campanhas) — checagem estática de texto de migration não é aceita como prova de comportamento.

---

## 2. Descrição do fluxo atual

*(inalterado — auditoria factual aprovada)*

### 2.1 Narrador
1. `/login` → `LoginForm` → `signInWithPassword`/`signUpDevNarrator` → Supabase Auth real → tokens regravados no cookie httpOnly `ruptura_auth`.
2. `/mesas` → `getCurrentUser()` obrigatório → lista todas as campanhas do banco, filtra em memória por `owner_id === user.id`.
3. `createCampaign` → `owner_id` da campanha.
4. `/mesas/[campaignId]` → guard `campaign.owner_id !== user.id`.
5. `MesaDetailClient.tsx` (~1160 linhas, tela única): rodada/cena, personagens, "Resolver Ataque", **perfis**, **convites**, log.
6. Sub-áreas: `biblioteca` (narrador), `livro` (leitura, narrador ou jogador com perfil reivindicado), `personagens/novo` (wizard).

### 2.2 Jogador (via convite)
1. `/join/{token}` → `resolveCampaignInvite` (RPC pública) → valida hash/revogação/ativo/expiração.
2. Login inline se necessário.
3. `acceptCampaignInvite` (RPC) → cria/ativa `campaign_members`.
4. **Etapa obrigatória: "Reivindicar perfil"** (`ClaimProfileClient`) — proibida pelo aditivo.
5. `JoinClient` → "Entrar como perfil" → `enter_campaign_profile` → token salvo em `localStorage`.
6. "Criar personagem" → wizard restrito ao próprio perfil.
7. "Abrir ficha" → `/ficha?campaignId=...&profileId=...` → resolve **um único personagem** via token.
8. Sem link de volta para a campanha em uso normal.

### 2.3 Rotas `/dev/*`
Bloqueadas por ambiente, não por identidade. `/dev/join`, `/dev/table`, `/dev/character-sheet` reaproveitam componentes de produto sem controle de convite/sessão.

---

## 3. Modelo de dados e permissões atuais

*(inalterado — auditoria factual aprovada)*

| Tabela | Papel real hoje | Observação-chave |
|---|---|---|
| `auth.users` | Identidade Supabase Auth | |
| `campaigns` | Campanha | `owner_id` único (nullable) |
| `campaign_members` | Membership real por conta | `user_id uuid not null`; `role`∈{owner,player}; `status`∈{active,invited,removed} |
| `campaign_invites` | Convite único por link | multi-uso por design |
| `campaign_profiles` | "Perfil" | `user_id` nullable, `active_character_id`, `is_locked` |
| `profile_sessions` | Sessão de token do jogador | `session_token_hash` |
| `characters` | Personagem | `campaign_id`, `profile_id`, `owner_id` nullable, `on delete set null`; `archived_at` |
| `character_creation_drafts` | Rascunho do wizard | compare-and-swap por `revision` |

RLS resumida: `campaigns` (dono/membro leem, só dono escreve); `campaign_members` (própria linha/dono leem, só RPC escreve); `campaign_invites` (só dono, leitura pública via RPC); `campaign_profiles`/`profile_sessions` (mecanismo de perfil, alvo de remoção); `characters` (dono da campanha, `owner_id` próprio, ou perfil reivindicado + membership — **é aqui que as lacunas 1 e 2 desta revisão se aplicam**, ver seção 13).

---

## 4. Diferenças entre implementação e PRD/aditivo

*(inalterado — auditoria factual aprovada)*

| Área | Aditivo exige | Implementação atual | Severidade |
|---|---|---|---|
| Identidade do jogador | Conta obrigatória, sem etapa de perfil | Conta só para aceitar convite | **Alta** |
| Entidade "perfil" | Não deve existir | Etapa obrigatória | **Alta** |
| Múltiplos narradores | Suportado | `owner_id` único | **Fora de escopo** — §12 |
| Dois tipos de convite | E-mail + Limpo | Um tipo só | **Média-Alta** |
| Participação | Pendente/Ativo/Removido | Pendência não modelada | **Baixa-Média** |
| Controle de personagem desacoplado | N:N, controle ≠ propriedade | 1:1 perfil↔personagem | **Alta** |
| Narrador acessa qualquer personagem | Sim | Já conforme via RLS | **Conforme** ✅ |
| Navegação estruturada | Estrutura fixa | Tela monolítica | **Alta** |
| Segurança: autorização no servidor | Exigido | Já conforme | **Conforme** ✅ |
| **Controle exige participação ativa** (achado desta revisão) | Implícito no modelo de participação do aditivo (remover jogador revoga acesso — §14) | Não avaliado nas revisões anteriores; corrigido nesta revisão antes da implementação | **Alta — corrigido no desenho, seção 13** |
| **`owner_id` não deve contornar controle** (achado desta revisão) | Implícito (controle é a única fonte de autorização de jogador) | Risco identificado no desenho da revisão 3; corrigido nesta revisão | **Alta — corrigido no desenho, seção 13** |
| **Escopo de escrita por coluna** (achado desta revisão) | Implícito (autorização de servidor granular, jogador só opera a própria ficha) | Risco identificado no desenho da revisão 3; corrigido nesta revisão | **Alta — corrigido no desenho, seção 13** |

---

## 5. Elementos a remover, reaproveitar, renomear ou recriar

*(inalterado em relação à revisão 3, ver seção 13 para o detalhamento técnico atualizado dos itens de banco)*

### 5.1 Princípio orientador
`campaign_profiles`/`profile_sessions` não sobrevivem como implementação interna nem como compatibilidade de produto. O personagem atualmente aberto é estado de navegação, nunca mecanismo de autorização.

### 5.2–5.6
Ver seção 13 (desenho técnico) para a lista completa e atualizada de objetos a remover/criar, agora incluindo os ajustes de autorização das lacunas 1–4 desta revisão.

---

## 6. Arquitetura-alvo mínima

```
auth.users (Supabase Auth = "Conta")
  └── campaign_members (participação de uma CONTA EXISTENTE: campaign_id, user_id NOT NULL,
                         role[owner|player], status[active|removed])

campaign_invites (campaign_id, token_hash, kind[email|clean], email nullable, is_active, expires_at, revoked_at)
  — estado "Pendente" de convite por e-mail vive aqui, não em campaign_members.

campaigns (campanha; owner_id = único narrador nesta versão — §12)
  ├── campaign_invites (acima)
  ├── characters (pertence à campanha; sem profile_id)
  │    └── character_controllers (character_id, campaign_id, user_id, granted_by, granted_at)
  │         — controle N:N; campaign_id íntegro via FK composta (§13.1)
  │         — NUNCA suficiente sozinho: autorização real = controle ∧ membership ATIVA (§13.3, lacuna 1)
  └── table_logs / turn_track / etc. (fora de escopo)
```

Pontos centrais, atualizados nesta revisão:

1. Toda operação de jogador exige sessão de conta validada a cada request.
2. **Controle de personagem exige, simultaneamente**: linha em `character_controllers`, participação com `status='active'` em `campaign_members` para a mesma campanha, e `characters.campaign_id` correspondente. Nenhuma dessas três condições sozinha autoriza (lacuna 1).
3. **`characters.owner_id` só autoriza personagens sem campanha** (`campaign_id is null`). Para personagens de campanha, `owner_id` é ignorado na autorização — mesmo que a coluna ainda contenha um valor herdado de dados antigos (lacuna 2).
4. Convite tem dois modos; nenhum cria `campaign_members` no ato de convidar.
5. **Escrita do jogador é restrita por coluna**: o controlador nunca tem `UPDATE` direto de tabela liberado por RLS; escreve exclusivamente via RPC com whitelist de colunas de conteúdo de ficha (ex.: `payload`). Metadados administrativos (`campaign_id`, `owner_id`, `archived_at`, tabela de controle) só são alteráveis pelo narrador, por caminho separado (lacuna 3).
6. Nenhuma tela de produto expõe "perfil".
7. Personagem "atualmente aberto" é estado de navegação.
8. Único narrador por campanha nesta versão, helpers isolados para não bloquear expansão futura.
9. Ficha funcional desde a Fase 1 por caminho mínimo `campaignId`+`characterId`.
10. **Helpers de autorização não expõem API pública mais ampla do que o necessário** — variante pública usa `auth.uid()` implícito; variante com usuário arbitrário é interna, sem `EXECUTE` para `authenticated`/`anon` (lacuna 6 do pedido de revisão, detalhada em §13.3).

---

## 7. Arquitetura de navegação

*(inalterada em relação à revisão 2/3 — aprovada)*

Estrutura de nomenclatura/organização de UI, não requisito de renomear URLs.

```
Pós-login → "Minhas Campanhas" (rota pode continuar /mesas)
  ├── Criar Campanha
  ├── Conta e preferências (nova)
  └── Sair

Campanha (rota pode continuar /mesas/[campaignId])
  ├── Mesa / Personagens / Bando / Mercado / Biblioteca
  └── [Narrador] Gerenciar → Jogadores e convites / Configurações

Ficha ("Console do Refratário"; rota pode continuar /ficha)
  ├── Caminho mínimo campaignId+characterId — Fase 1
  └── Lista/retorno/troca — Fase 5

Narrador: acesso a qualquer ficha — caminho mínimo Fase 1, UI de entrada Fase 5
```

---

## 8. Plano de implementação em fases pequenas

### Fase 1 — Fundação de identidade e autorização (escopo atualizado nesta revisão)

- **Objetivo**: eliminar `campaign_profiles`/`profile_sessions` do caminho de autorização. Autorização de jogador = conta autenticada ∧ `campaign_members.status='active'` ∧ `character_controllers` ∧ `characters.campaign_id` correspondente. `characters.owner_id` só autoriza personagens sem campanha. Escrita do jogador restrita a uma RPC de colunas de conteúdo de ficha; metadados administrativos só pelo narrador. `/ficha` continua funcional por caminho mínimo.
- **Banco**: desenho técnico completo na seção 13 — inclui, além do já descrito nas revisões anteriores, os ajustes das quatro lacunas (helpers exigindo membership ativa; `owner_id` condicionado a `campaign_id is null`; RPC de escrita com whitelist; migration destrutiva sem `CASCADE` amplo, com inspeção de dependências prévia).
- **Backend**: `grantCharacterControl`/`revokeCharacterControl`/`listControlledCharacters`/`getCharacterForCampaign`; nova `updateCharacterSheetPayload` (RPC dedicada de escrita do jogador, whitelist de colunas); comportamento administrativo ao remover participante (revogação de controles associados — automática ou transacional, ver §13.3).
- **Frontend**: remoção da etapa de perfil; `/ficha` resolve por `campaignId`+`characterId`; escrita da ficha pelo jogador passa a chamar a RPC dedicada, não mais um `update` genérico.
- **Testes**: comportamentais contra Supabase real — lista ampliada na seção 13.8 (11 testes da revisão 3 + 9 novos testes desta revisão).
- **Riscos**: maior impacto estrutural do plano; a separação de caminhos de escrita (narrador vs jogador) precisa ser auditada em todo call-site que hoje faz `UPDATE` de personagem, para não deixar nenhum caminho residual que burle a whitelist.
- **Critério de conclusão**: lista objetiva ampliada na seção 13.9.

### Fase 2 — Convites e entrada
*(inalterada em relação à revisão 3)* — convite por e-mail e limpo, nenhum cria `campaign_members` antes da autenticação; pendência visível via `campaign_invites`; dashboard mostra campanhas associadas à conta.

### Fase 3 — Navegação da campanha
*(inalterada)* — menu geral, menu de campanha, "Gerenciar" exclusivo do narrador, divisão de `MesaDetailClient.tsx` sem perda funcional.

### Fase 4 — Personagens
*(inalterada, com um ajuste)* — página de personagens do jogador (só controlados, respeitando a exigência de membership ativa desta revisão) e do narrador (todos, com filtros); criação; atribuição/remoção de controle via as RPCs já existentes desde a Fase 1.

### Fase 5 — Integração da ficha
*(inalterada)* — UX completa (seletor, retorno, entrada pela lista, troca) sobre o caminho mínimo e a separação de escrita já entregues na Fase 1.

---

## 9. Impactos de autosave e desfazer

*(inalterado em relação à revisão 2/3)* — identificador de sessão de edição futuro deve ser novo, desacoplado de autorização; autorização sempre via conta e `character_controllers` + membership ativa (reforço desta revisão). A futura RPC de autosave deve seguir o mesmo princípio de whitelist de colunas já estabelecido nesta revisão para a escrita do jogador (seção 13.4), não abrir um caminho de escrita mais amplo do que o hoje desenhado.

---

## 10. Plano de testes

*(reforçado — detalhamento completo na seção 13.8)* Toda fase que altere autenticação, RLS, convites ou controle de personagens é validada por teste comportamental contra Supabase real, com pelo menos duas contas e duas campanhas distintas. Esta revisão adiciona explicitamente testes de: perda de acesso por remoção de participação (mesmo com controle residual), não contorno via `owner_id` residual, bloqueio de escrita em colunas administrativas, e verificação de que a migration destrutiva não remove nada fora da lista aprovada.

---

## 11. Arquivos e migrations provavelmente afetados

*(resumo — detalhamento exaustivo na seção 13.6)*

- **Fase 1**: ver seção 13.6/13.7 — inclui agora a nova RPC `update_character_sheet_payload`, o ajuste de `can_read_character`/`can_manage_character`/`is_character_controller`, e a rotina de revogação de controles ao remover participante.
- **Fase 2**: `ALTER TABLE campaign_invites ADD COLUMN email, kind`; RPC de ativação por e-mail.
- **Fases 3–5**: sem migration de schema.

---

## 12. Decisões de produto ainda pendentes

*(inalterado, com um item adicional)*

1. Múltiplos narradores — fora de escopo nesta versão.
2. Jogador pode criar personagem livremente/com aprovação/só se permitido — decisão antes da Fase 4.
3. Controle simultâneo por mais de um jogador — schema já suporta N:N; política é decisão de produto.
4. Papéis intermediários — modelo binário hoje.
5. Expiração de convite por e-mail — default provisório na Fase 2.
6. Limite de usos do convite limpo — default provisório na Fase 2.
7. Política de edição concorrente — não bloqueia Fases 1–5.
8. Descarte de dados de desenvolvimento — autorizado, seguindo ordem segura §13.7.
9. **(novo)** Quais colunas de `characters`, além de `payload`, entram na whitelist de escrita do jogador (ex.: `name`) — não bloqueia a Fase 1, que pode nascer só com `payload`; ampliar a whitelist é mudança aditiva de baixo risco em qualquer fase futura.

---

## 13. Desenho técnico da Fase 1

### 13.1 Schema de `character_controllers`

*(inalterado em relação à revisão 3 — aprovado)*

```sql
create table character_controllers (
  character_id uuid not null,
  campaign_id  uuid not null,
  user_id      uuid not null references auth.users(id) on delete cascade,
  granted_by   uuid references auth.users(id) on delete set null,
  granted_at   timestamptz not null default now(),
  primary key (character_id, user_id),
  foreign key (character_id, campaign_id)
    references characters (id, campaign_id)
    on delete cascade
);

create index character_controllers_user_idx on character_controllers (user_id);
create index character_controllers_campaign_idx on character_controllers (campaign_id);
```

Requer `create unique index characters_id_campaign_id_uidx on characters (id, campaign_id);` para permitir a FK composta. `campaign_id` é armazenado (não derivado por join a cada leitura de RLS), com integridade garantida pela FK composta — nunca um dado solto.

### 13.2 Correção da lacuna 1 — controle exige participação ativa

**Problema identificado**: o desenho da revisão 3 autorizava um jogador a ler/editar um personagem apenas por existir uma linha em `character_controllers`, sem checar se aquele jogador ainda é membro ativo da campanha. Isso permite que um jogador removido de uma campanha (`campaign_members.status='removed'`) continue acessando personagens que já controlava, caso a linha de `character_controllers` não seja apagada no mesmo instante — violação direta do aditivo §14 ("Remover jogador da campanha revoga seu acesso aos personagens daquela campanha").

**Correção**: toda checagem de controle passa a exigir, na mesma condição, `is_campaign_member(campaign_id, user_id)` com `status='active'` — não basta a linha de `character_controllers` existir.

```sql
-- Variante interna (não pública — ver lacuna 6, seção 13.3): checa controle para um usuário arbitrário.
create or replace function is_character_controller_for(
  p_character_id uuid,
  p_campaign_id uuid,
  p_user_id uuid
) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from character_controllers cc
    where cc.character_id = p_character_id
      and cc.campaign_id = p_campaign_id
      and cc.user_id = p_user_id
  )
  and is_campaign_member(p_campaign_id, p_user_id); -- exige membership ATIVA (já checa status='active' internamente)
$$;
-- Sem GRANT EXECUTE para anon/authenticated — só chamável por outras funções SECURITY DEFINER
-- do mesmo dono (ver 13.3).
```

**Comportamento administrativo ao remover participante** (pedido explícito de definição): a remoção de um participante (`campaign_members.status` → `'removed'`, ação do narrador) **não depende de apagar `character_controllers` para já cortar o acesso** — a checagem acima já nega o acesso no mesmo instante, porque `is_campaign_member` passa a retornar falso. Ainda assim, para não acumular lixo de controle órfão indefinidamente:

- A função `remove_campaign_member(campaign_id, user_id)` (RPC já existente conceitualmente na Fase 2/3 do fluxo de gestão de participantes — nesta fase, se ainda não existir, a Fase 1 introduz a versão mínima) passa a fazer, **na mesma transação**, `DELETE FROM character_controllers WHERE campaign_id = $1 AND user_id = $2`.
- Isso é limpeza de dados, **não** o mecanismo de autorização em si — mesmo que essa limpeza falhe ou seja pulada por algum caminho não previsto, a RLS/helpers continuam exigindo membership ativa de qualquer forma (defesa em profundidade: dois mecanismos independentes chegam ao mesmo resultado de negar acesso).

### 13.3 Correção da lacuna 2 — `owner_id` não contorna controle em personagens de campanha

**Problema identificado**: o desenho da revisão 3 incluía `c.owner_id = check_user_id` como condição de autorização independente, válida mesmo para personagens com `campaign_id` preenchido. Isso permite que um personagem de campanha, cujo `owner_id` ainda aponte para uma conta antiga (ex.: o próprio jogador que o criou antes de ter seu controle revogado, ou dado herdado de desenvolvimento), continue acessível por essa conta mesmo depois de `character_controllers` ser esvaziado para ela.

**Correção**: `owner_id` só autoriza quando `campaign_id is null` (personagem "solto", sem campanha — caso de uso hoje usado por ferramentas dev/diagnóstico e por personagens ainda não vinculados a nenhuma mesa). Para personagens de campanha, a autorização vem exclusivamente de `is_campaign_owner` (narrador) ou de controle + membership ativa (jogador).

```sql
create or replace function can_read_character(
  p_character_id uuid,
  check_user_id uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from characters c
    where c.id = p_character_id
      and (
        -- narrador dono da campanha do personagem
        (c.campaign_id is not null and is_campaign_owner(c.campaign_id, check_user_id))
        -- personagem sem campanha: owner_id vale como antes (uso dev/diagnóstico e personagens soltos)
        or (c.campaign_id is null and c.owner_id = check_user_id)
        -- jogador controlador com participação ativa na campanha do personagem
        or (c.campaign_id is not null and is_character_controller_for(c.id, c.campaign_id, check_user_id))
      )
  );
$$;
revoke all on function can_read_character(uuid, uuid) from public;
grant execute on function can_read_character(uuid, uuid) to authenticated;

-- can_manage_character: mesmo corpo nesta fase (a distinção entre "ler" e "gerenciar amplamente"
-- deixa de ser relevante para o jogador, porque a escrita do jogador não passa mais por
-- can_manage_character — ver 13.4). can_manage_character continua existindo para uso do narrador
-- (RLS de UPDATE/DELETE administrativos), com o mesmo corpo de can_read_character.
create or replace function can_manage_character(
  p_character_id uuid,
  check_user_id uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select can_read_character(p_character_id, check_user_id);
$$;
```

**Sobre dados antigos/de desenvolvimento com `owner_id` preenchido em personagens de campanha**: como a condição de `owner_id` só é avaliada quando `campaign_id is null`, um `owner_id` residual num personagem que já tem `campaign_id` **nunca é lido para fins de autorização** — não é necessário limpar essa coluna para a correção ser efetiva, embora seja aceitável (e opcional) fazer uma limpeza de dados de desenvolvimento como parte do descarte geral já previsto (§12.8).

### 13.4 Correção da lacuna 3 — escopo de escrita do jogador restrito por coluna

**Estratégia escolhida**: **separação total dos caminhos de escrita por papel**, não uma policy genérica de `UPDATE` condicionada só por `can_manage_character`. Concretamente:

- **RLS de `UPDATE` em `characters` autoriza só o narrador** (`is_campaign_owner`) ou o caso de personagem solto (`campaign_id is null and owner_id = auth.uid()`, mesmo raciocínio da lacuna 2) — nunca o controlador comum.
- **O jogador controlador nunca recebe `GRANT UPDATE` na tabela `characters`.** Toda escrita de jogador passa por uma RPC `SECURITY DEFINER` dedicada, que:
  1. Revalida `is_character_controller_for(character_id, campaign_id, auth.uid())` internamente (não confia em nenhum dado do cliente além do `character_id`).
  2. Só permite alterar uma whitelist fixa de colunas — nesta fase, apenas `payload` (conteúdo da ficha). Qualquer tentativa de alterar `campaign_id`, `owner_id`, `archived_at`, ou qualquer coluna fora da whitelist é estruturalmente impossível, porque a RPC nem aceita esses parâmetros — não é uma checagem condicional que pode ter uma lacuna, é a ausência do parâmetro na assinatura da função.

```sql
create or replace function update_character_sheet_payload(
  p_character_id uuid,
  p_payload jsonb
) returns characters
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
  v_result characters;
begin
  select campaign_id into v_campaign_id from characters where id = p_character_id;
  if v_campaign_id is null then
    raise exception 'character has no campaign; use narrator update path' using errcode = 'check_violation';
  end if;
  if not is_character_controller_for(p_character_id, v_campaign_id, auth.uid()) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  update characters
     set payload = p_payload,
         updated_at = now()
   where id = p_character_id
  returning * into v_result;
  return v_result;
end;
$$;
revoke all on function update_character_sheet_payload(uuid, jsonb) from public;
grant execute on function update_character_sheet_payload(uuid, jsonb) to authenticated;
```

- **Narrador continua com poderes administrativos amplos** — via a `UPDATE` direta autorizada por `is_campaign_owner` na RLS (inalterado das revisões anteriores), cobrindo `campaign_id` (mover personagem entre campanhas — hoje já existente como `assignCharacterToCampaign`), `archived_at` (arquivar/restaurar), `owner_id` e qualquer campo de conteúdo.
- **`character_controllers` em si**: escrita só via `grant_character_control`/`revoke_character_control` (já desenhado na revisão 3, mantido). Jogador nunca tem `INSERT`/`UPDATE`/`DELETE` diretos nessa tabela.

**Por que RPC de whitelist, e não `WITH CHECK` comparando colunas antigas/novas**: o Postgres RLS não permite comparar diretamente a linha antiga com a nova dentro de uma única cláusula de policy (`USING` vê a linha visível antes da operação, `WITH CHECK` vê a linha resultante — não há acesso simultâneo às duas dentro da mesma cláusula sem um trigger auxiliar). Usar um trigger `BEFORE UPDATE` para comparar `OLD`/`NEW` e rejeitar mudança de colunas administrativas seria uma alternativa tecnicamente válida, mas exigiria manter essa lista de colunas protegidas sincronizada em dois lugares (trigger e a superfície de API) e ainda deixaria a policy de `UPDATE` "genérica" habilitada para o jogador — exatamente o que o pedido de revisão rejeita explicitamente. A RPC com whitelist fixa evita essa classe de erro por construção: a coluna que não está na assinatura da função não pode ser alterada por aquele caminho, ponto final.

### 13.5 Acesso mínimo à ficha (atualizado)

- **Leitura**: `getCharacterForCampaign(campaignId, characterId)` — `select * from characters where id=$characterId and campaign_id=$campaignId`, autorizado por `can_read_character` (já corrigida nas lacunas 1 e 2). Devolve `null` tanto para "não encontrado" quanto para "sem autorização".
- **Escrita (jogador)**: exclusivamente via `update_character_sheet_payload(characterId, payload)` — nunca um `update` genérico a partir do frontend.
- **Escrita (narrador)**: mantém o caminho de `UPDATE` direto já existente hoje (via `getScopedTableClient()` + RLS `is_campaign_owner`), sem mudança de contrato — o narrador continua podendo editar qualquer campo, incluindo os administrativos.
- **Acesso do narrador à ficha**: mesma rota `campaignId`+`characterId`; autorizado por `is_campaign_owner`, sem depender de `character_controllers`.

### 13.6 Lista exaustiva de call-sites afetados (atualizada)

Além de tudo já listado nas revisões anteriores (remoção de `campaign_profiles`/`profile_sessions`, `ClaimProfileClient`, funções de sessão em `storage.ts`, etc. — inalterado), esta revisão acrescenta:

- **Banco**: nova função `is_character_controller_for` (interna, sem `EXECUTE` público); `can_read_character`/`can_manage_character` reescritas (lacunas 1–2); nova RPC `update_character_sheet_payload` (lacuna 3); RLS de `UPDATE` em `characters` restrita a `is_campaign_owner`/`campaign_id is null and owner_id=auth.uid()` (remove qualquer clause de controlador do `UPDATE` direto); ajuste de `remove_campaign_member` (ou introdução da versão mínima, se ainda não existir antes da Fase 3) para apagar `character_controllers` da conta removida na mesma transação.
- **`src/lib/character/storage.ts`**: nova função `updateCharacterSheetPayload(characterId, payload)` chamando a RPC acima; qualquer função de escrita de personagem hoje usada pelo caminho do jogador (ex.: dentro de `CharacterSheetClient`) precisa ser auditada para não fazer mais `update` genérico de tabela — call-sites a revisar: todo ponto em `src/app/dev/character-sheet/components/*.tsx` e em `CharacterSheetClient.tsx` que hoje grava alterações de ficha do jogador.
- **`src/lib/character/gmActions.ts`**: funções usadas pelo narrador continuam no caminho de `UPDATE` direto (via `updateCharacter` administrativo) — confirmar que esse caminho nunca é chamado a partir do contexto de jogador.
- **Frontend**: `CharacterSheetClient.tsx` precisa diferenciar, na hora de salvar, se está operando como narrador (caminho administrativo existente) ou como jogador controlador (nova RPC de payload) — hoje o componente é compartilhado entre `/ficha` (produto) e `/dev/character-sheet` (dev, sem essa distinção); a Fase 1 precisa introduzir esse branch mínimo (mesmo que a UX completa de "estou vendo como narrador vs. como jogador" só seja polida na Fase 5).

### 13.7 Ordem interna segura de implantação da Fase 1 (atualizada com inspeção de dependências)

1. **Criar o novo schema, helpers e RLS** — `character_controllers`, `characters_id_campaign_id_uidx`, `is_character_controller_for` (interna), `can_read_character`/`can_manage_character` (versão corrigida), `grant_character_control`/`revoke_character_control`, `update_character_sheet_payload`, RLS de `character_controllers`, RLS de `UPDATE` em `characters` restrita ao narrador. `campaign_profiles`/`profile_sessions` continuam existindo e funcionando.
2. **Adaptar backend e frontend** para usar exclusivamente o novo caminho — incluindo a separação de escrita narrador/jogador (13.4) e o branch mínimo em `CharacterSheetClient.tsx` (13.6). Neste ponto, `campaign_profiles`/`profile_sessions` já não são mais lidas/escritas pelo código, mas ainda existem no banco.
3. **Adaptar e executar os testes** — lista completa em 13.8, contra Supabase real, **antes** de remover qualquer coisa do banco.
4. **Remover todas as referências antigas do código** — nenhuma linha do repositório menciona mais `campaign_profiles`, `profile_sessions`, `profile_id`, ou as RPCs de perfil/sessão.
5. **Inspecionar dependências no catálogo do Postgres antes de qualquer drop** (passo novo desta revisão) — para cada objeto da lista aprovada em 13.2 (revisão 3) — tabelas `campaign_profiles`/`profile_sessions`, coluna `characters.profile_id`, índice `characters_one_active_per_profile_campaign_uidx`, as 13 RPCs e 2 helpers de perfil/sessão — consultar `pg_depend`/`information_schema.view_column_usage`/`information_schema.routine_routine_usage` (conforme o tipo de objeto) para listar tudo que depende deles. Qualquer dependência **fora da lista aprovada** (ex.: uma view, uma função, um trigger não previstos nesta auditoria) interrompe a migration para auditoria manual — não é removida automaticamnete.
6. **Remover explicitamente, objeto por objeto, sem `CASCADE` amplo** — nesta ordem, cada `DROP` nomeando exatamente o objeto:
   - `DROP POLICY` de cada policy de `campaign_profiles`/`profile_sessions` (nomeadas individualmente).
   - `DROP TRIGGER campaign_profiles_set_updated_at ...`.
   - `DROP FUNCTION` de cada uma das 13 RPCs e 2 helpers listados em 13.2 (revisão 3) — cada `DROP FUNCTION` nomeado com assinatura completa, sem `CASCADE`.
   - `DROP INDEX characters_one_active_per_profile_campaign_uidx` e demais índices próprios de `campaign_profiles`/`profile_sessions` (removidos individualmente antes do `DROP TABLE`, não deixados para o `CASCADE`).
   - `ALTER TABLE characters DROP CONSTRAINT` de qualquer FK que aponte para `campaign_profiles` (ex.: a FK antiga de `characters.profile_id`), depois `ALTER TABLE characters DROP COLUMN profile_id`.
   - Só então `DROP TABLE campaign_profiles` e `DROP TABLE profile_sessions`, **sem `CASCADE`** — se ainda houver qualquer dependência remanescente (prova de que o passo 5 ou 6 anterior deixou algo para trás), o `DROP TABLE` falha com erro do Postgres em vez de apagar silenciosamente algo não revisado.
7. **Executar busca textual exaustiva** no repositório por `campaign_profile`, `profile_session`, `profileId`, `perfil` (fora de comentários de changelog).
8. **Validar build e comportamento contra Supabase real** — build limpo e reexecução completa da suíte de testes comportamentais da seção 13.8, incluindo o teste de que a migration destrutiva não removeu nada fora da lista aprovada (13.8, teste 20).

### 13.8 Testes comportamentais — lista completa (11 da revisão 3 + 9 novos desta revisão)

Cenário base: contas `U1` (dono da Campanha A), `U2` (dono da Campanha B), `U3` (jogador, sem campanha própria). Personagem `C1` pertence à Campanha A.

**Da revisão 3 (mantidos)**:
1. Isolamento entre campanhas: `U2` não lê/edita `C1`.
2. Narrador acessa sem ser controlador: `U1` lê/edita `C1` sem linha em `character_controllers`.
3. Controle concede acesso: `grant_character_control(C1, U3)` (com `U3` membro ativo de A) → `U3` acessa `C1`.
4. Revogação remove acesso sem apagar personagem.
5. Integridade de `campaign_id` via FK composta.
6. Grant exige membership ativa do alvo.
7. Grant exige que o chamador seja dono.
8. Ficha — caminho do jogador funciona.
9. Ficha — caminho do narrador funciona.
10. Ficha — acesso negado para conta sem relação, resposta indistinguível de "não existe".
11. Remoção definitiva de `campaign_profiles`/`profile_sessions` confirmada (consulta direta falha com "relation does not exist").

**Novos desta revisão (lacunas 1–4)**:
12. **Participante removido perde acesso mesmo com controle residual**: `U3` tem `character_controllers` para `C1`; `U1` marca `campaign_members` de `U3` em A como `status='removed'` (sem apagar a linha de `character_controllers`, simulando o caso em que a limpeza automática não rodou); `U3` tenta ler/editar `C1` e é negado — prova que a checagem de membership ativa é o mecanismo real, não a limpeza best-effort.
13. **Revogar controle remove acesso mesmo com `owner_id` residual**: `C1` tem `owner_id = U3` (dado herdado, por exemplo de quando o personagem foi criado antes de ter `campaign_id`, ou de um cenário de dados de desenvolvimento); `C1.campaign_id` é preenchido com A; controle de `U3` é revogado; `U3` tenta ler/editar `C1` e é negado — prova que `owner_id` não é lido para personagens de campanha.
14. **Personagem sem campanha ainda respeita `owner_id`**: um personagem `C2` com `campaign_id is null` e `owner_id = U3` continua acessível por `U3` — confirma que a correção da lacuna 2 não quebrou o caso de uso legítimo (personagem solto/dev).
15. **Controlador não consegue alterar `campaign_id`**: `U3` (controlador de `C1`) tenta mover `C1` para a Campanha B via qualquer caminho disponível ao jogador (a RPC de escrita do jogador nem aceita esse parâmetro; uma tentativa de `UPDATE` direto na tabela é rejeitada pela RLS) — ambos os caminhos falham.
16. **Controlador não consegue alterar `owner_id`**: mesma lógica do teste 15, para a coluna `owner_id`.
17. **Controlador não consegue arquivar nem excluir personagem**: `U3` tenta `archived_at`/`DELETE` em `C1` — negado (RLS de `UPDATE`/`DELETE` exige `is_campaign_owner`, nunca controlador).
18. **Controlador não consegue mover personagem para outra campanha nem ler/editar personagens da campanha para onde tentou mover** — reforço do teste 15 do ponto de vista de `C1` continuar íntegro em A após a tentativa falhar.
19. **Narrador continua executando todas as operações administrativas**: `U1` altera `campaign_id`, `owner_id`, `archived_at` e `payload` de `C1` livremente pelo caminho de `UPDATE` direto — confirma que a restrição de coluna é só para o jogador, não uma regressão para o narrador.
20. **Migration destrutiva não remove nada fora da lista aprovada**: antes de rodar os `DROP`s do passo 6 (seção 13.7), inserir um objeto de teste que dependa deliberadamente de uma das RPCs/tabelas a remover (ex.: uma view de teste) e confirmar que a inspeção de dependências (passo 5) detecta e interrompe a migration; depois, remover o objeto de teste e confirmar que a migration completa normalmente. Confirmar também, por introspecção do catálogo (`information_schema`), que nenhum objeto **fora** da lista de 13.2 foi removido como efeito colateral.

### 13.9 Critérios objetivos de conclusão da Fase 1 (atualizados)

- [ ] `character_controllers` existe, com FK composta contra `characters(id, campaign_id)`.
- [ ] `is_character_controller_for` existe, sem `EXECUTE` concedido a `anon`/`authenticated` — só usada internamente por outras funções `SECURITY DEFINER`.
- [ ] `can_read_character`/`can_manage_character` exigem, para personagens de campanha, `is_campaign_owner` OU (controle **e** membership ativa) — nunca `owner_id` isolado.
- [ ] `characters.owner_id` só é considerado para autorização quando `campaign_id is null`.
- [ ] Não existe nenhuma `GRANT UPDATE` em `characters` para `authenticated` fora da condição de narrador (`is_campaign_owner`) ou personagem solto (`owner_id`) — o jogador controlador não tem caminho de `UPDATE` direto de tabela.
- [ ] `update_character_sheet_payload` existe, aceita só `character_id`+`payload`, e é o único caminho de escrita do jogador.
- [ ] Remover participante (`campaign_members.status='removed'`) apaga `character_controllers` correspondente na mesma transação (limpeza) **e** a checagem de membership ativa nega acesso independentemente disso (defesa em profundidade, comprovada pelo teste 12).
- [ ] `campaign_profiles`, `profile_sessions`, `characters.profile_id`, `characters_one_active_per_profile_campaign_uidx` não existem mais.
- [ ] As 13 RPCs e 2 helpers de perfil/sessão da revisão 3 não existem mais.
- [ ] A migration destrutiva foi executada por `DROP`s nomeados individualmente (policies, trigger, funções, índices, constraint/coluna, e só então as tabelas), **sem `CASCADE`**, precedida de inspeção de dependências que teria interrompido a migration caso algo fora da lista aprovada dependesse desses objetos.
- [ ] Busca textual no repositório por `campaign_profile`, `profile_session`, `profileId` não retorna ocorrência em código ativo.
- [ ] `/ficha?campaignId=...&characterId=...` funciona para jogador controlador (com membership ativa) e narrador dono; nega acesso para conta sem relação, jogador removido da campanha, e jogador com controle revogado (mesmo com `owner_id` residual).
- [ ] Todos os 20 testes comportamentais da seção 13.8 passam contra Supabase real.
- [ ] `scripts/dev/validate-campaign-session-concurrency.mjs` reescrito e passando.
- [ ] Build limpo, sem referências quebradas.

---

## Recomendação de primeira fase a implementar

Recomenda-se iniciar exclusivamente pela **Fase 1 — Fundação de identidade e autorização**, com o desenho técnico da seção 13 (agora incluindo as correções das quatro lacunas de autorização), seguindo a ordem de implantação de 13.7. Ao final, `campaign_profiles`/`profile_sessions` deixam de existir por completo, `character_controllers` combinado com participação ativa é a única fonte de controle de personagem, `owner_id` nunca contorna esse modelo para personagens de campanha, a escrita do jogador é estruturalmente limitada a conteúdo de ficha, e a migration destrutiva é auditável e segura por construção.

Aguardando aprovação final do desenho técnico da Fase 1 antes de qualquer implementação.

---

## Changelog

### Revisão 4 (esta)
- **Lacuna 1**: `is_character_controller`/`can_read_character`/`can_manage_character` passam a exigir participação ativa (`campaign_members.status='active'`) além da linha em `character_controllers`. Definido comportamento administrativo de limpeza de controles ao remover participante, como defesa em profundidade (não como único mecanismo de negação de acesso).
- **Lacuna 2**: `characters.owner_id` só autoriza quando `campaign_id is null`; para personagens de campanha, autorização vem só de `is_campaign_owner` ou controle+membership ativa. Documentado que dados residuais de `owner_id` em personagens de campanha não afetam a autorização.
- **Lacuna 3**: escrita do jogador deixa de depender de policy genérica de `UPDATE`; passa a usar RPC dedicada `update_character_sheet_payload` com whitelist fixa de colunas (`payload` nesta fase). RLS de `UPDATE` em `characters` restrita ao narrador/personagem solto. Justificativa técnica de por que RPC com whitelist foi escolhida em vez de `WITH CHECK` comparando old/new.
- **Lacuna 4**: ordem de implantação (13.7) ganhou um passo de inspeção de dependências no catálogo do Postgres antes de qualquer `DROP`, e os drops passam a ser nomeados individualmente (policies, trigger, funções, índices, constraint/coluna, tabelas), sem `CASCADE` amplo — falha em vez de remover algo inesperado.
- **Lacuna 6 (API dos helpers)**: `is_character_controller` original (pública, com `check_user_id` livre) substituída por `is_character_controller_for` interna (sem `EXECUTE` para `anon`/`authenticated`), usada só dentro de outras funções `SECURITY DEFINER`. `can_read_character`/`can_manage_character` continuam com a assinatura `check_user_id default auth.uid()` (necessária para o narrador consultar sobre outro usuário em contexto administrativo), mas com `EXECUTE` restrito a `authenticated`.
- Testes comportamentais ampliados de 11 para 20 casos, cobrindo as quatro lacunas e a auditoria da própria migration destrutiva.
- Critérios de conclusão ampliados com as verificações correspondentes.

### Revisão 3
- Corrigido o tratamento de participação pendente (nenhum convite cria `campaign_members` antecipadamente).
- Garantido caminho mínimo de `/ficha` já na Fase 1.
- Registrada ordem interna segura de implantação (versão inicial, refinada na revisão 4).
- Resolvida redundância de `campaign_id` em `character_controllers` via FK composta.
- Adicionado desenho técnico completo da Fase 1 (schema, RLS, RPCs, call-sites, testes, critérios).

### Revisão 2
- `campaign_profiles`/`profile_sessions`: remoção definitiva, não compatibilidade.
- Fases reordenadas: Fundação → Convites e entrada → Navegação → Personagens → Ficha.
- `profile_session_id` descartado como candidato a identificador de sessão de edição futuro.
- Testes comportamentais contra Supabase real exigidos em toda fase relevante.
- Múltiplo-narrador registrado como fora de escopo nesta versão.
