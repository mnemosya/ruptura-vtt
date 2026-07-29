# Checkpoint — Fase 6: correções curtas de usabilidade e integridade

**Data**: 2026-07-29
**Escopo**: rodada curta de correção sobre as páginas de participantes e personagens (Jogadores e convites, Personagens do narrador) já entregues nas Fases 3/4/5 — sem módulos novos, sem redesenho da ficha. Três correções independentes: (1) nomes de exibição em vez de `user_id` bruto; (2) proteção server-side de `tipo_personagem`; (3) correção dos filtros de personagem.

---

## 1. Estado encontrado antes das correções

Confirmado por leitura do código atual (não só dos checkpoints anteriores):

- `JogadoresConvitesClient.tsx` e `PersonagensNarradorClient.tsx` exibiam `user_id` bruto (às vezes truncado com `.slice(0, 8)…`) em toda parte onde um participante/controlador aparecia — linha de jogador, "Jogador(es): ...", botão "Remover controle de ...", `<option>` de "Atribuir jogador". Pendência já registrada explicitamente no checkpoint da Fase 4 (§7.1).
- Não existia nenhuma tabela/RPC de nome de exibição público — decisão pendente também registrada.
- `update_character_sheet_payload` (migration 0054/0052) escrevia `payload` inteiro sem qualquer proteção de `tipo_personagem` — um jogador controlador podia enviar qualquer payload, inclusive criando, alterando ou removendo `metadados.tipo_personagem`.
- `complete_character_creation` (migration 0054) concedia controle automático ao criador **sempre**, inclusive quando o criador era o próprio narrador (dono da campanha) criando pelo assistente completo — gerando uma linha redundante em `character_controllers` que inflava a contagem de "Jogadores".
- `createCharacterForCampaign` (criação rápida da página Personagens, `src/lib/character/storage.ts`) já **não** concedia controle ao narrador — conferido no código, sem alteração necessária aqui.
- `personagensFilter.ts`/`PersonagensNarradorClient.tsx` calculavam a contagem de controladores a partir de **todas** as linhas de `character_controllers` da campanha, sem checar se o `user_id` tinha participação ativa com função Jogador — um controle residual de participante removido, ou uma linha redundante do narrador, contava indevidamente para o filtro "Jogadores".

## 2. Correção 1 — nomes de exibição, sem IDs internos

**Decisão de solução**: RPC restrita `get_campaign_participant_info(p_campaign_id uuid)` (migration `0060_display_names_tipo_personagem_protection.sql`), `SECURITY DEFINER`, que:

- só devolve linhas quando quem chama é o **narrador** (`is_campaign_owner`) daquela campanha — para qualquer outra conta, devolve zero linhas (nunca lança erro nem vaza dado de outra campanha);
- lê `auth.users` só dentro do banco (nunca do frontend, nunca com service role no cliente);
- `display_name` com fallback em cadeia: `raw_user_meta_data->>'display_name'` → `raw_user_meta_data->>'full_name'` → parte local do e-mail → `"Conta sem nome"` — nunca UUID;
- `email` só é lido (a função já exige ser o narrador para retornar qualquer linha, então o e-mail nunca aparece para quem não é narrador).

Frontend: `getCampaignParticipantInfo(campaignId)` (`src/lib/table/storage.ts`) chama a RPC e devolve um `Map<user_id, {display_name, email}>`. Consumida por:

- `src/app/mesas/[campaignId]/jogadores-e-convites/page.tsx` → `JogadoresConvitesClient.tsx`: nome em negrito como informação principal, e-mail como linha secundária (só aparece nesta área exclusiva do narrador).
- `src/app/mesas/[campaignId]/personagens/page.tsx` → `PersonagensNarradorClient.tsx`: nome em "Jogador(es): ...", "Remover controle de ...", `<option>` de "Atribuir jogador" — nenhum desses pontos mostra e-mail (não é o propósito ali) nem `user_id`.

`user_id` continua existindo só como chave interna (`key={ctrl.user_id}`, valor do `<option>`) — nunca renderizado como texto visível.

## 3. Correção 2 — proteção de `tipo_personagem`

**Solução adotada**: reescrita de `update_character_sheet_payload` (mesma migration 0060) — continua sendo o único caminho de escrita do jogador controlador (nenhuma mudança de contrato para o narrador, que continua usando o `UPDATE` direto administrativo). Dentro da RPC, depois de revalidar controle+participação ativa (inalterado), um bloco novo roda **só quando quem chama não é o narrador da campanha** (`not is_campaign_owner(...)`):

1. Lê o valor atual de `payload.metadados.tipo_personagem` já persistido no banco (nunca confia no que o cliente mandou).
2. Reescreve `metadados.tipo_personagem` no payload final de volta a esse valor — incondicionalmente. Se não havia valor antes, o campo é removido do payload final (nunca fica com algo que o jogador inventou); se havia, o valor antigo é restaurado por cima de qualquer coisa que o jogador tenha enviado (incluindo ausência total do campo, quando o jogador manda um payload novo inteiro sem `metadados`).

Bug encontrado e corrigido durante os testes: `jsonb_set` com caminho aninhado (`'{metadados,tipo_personagem}'`) **não cria o objeto intermediário `metadados`** quando ele está ausente do payload enviado — só cria o último nível do caminho, então a chamada não tinha efeito quando o jogador mandava um payload sem `metadados` nenhum. Corrigido garantindo `metadados` como objeto (mesmo vazio) antes de qualquer `jsonb_set`/`delete` aninhado — confirmado pelo Teste D do script de validação (ver seção 6).

O jogador continua podendo alterar livremente qualquer outro campo da ficha (nome, atributos, recursos, inventário etc.) — só `tipo_personagem` é protegido, e só quando quem chama não é o narrador.

## 4. Correção 3 — filtros de personagem

**`createCharacterForCampaign`** (criação rápida pela página Personagens): já não concedia controle ao narrador — nenhuma mudança necessária.

**`complete_character_creation`** (assistente completo, usado por narrador e jogador): passou a só inserir a linha de `character_controllers` quando quem criou **não** é o narrador da própria campanha (`not is_campaign_owner(p_campaign_id, v_uid)`). Jogador continua recebendo controle automático normalmente (aditivo §11.2); narrador criando pelo assistente na própria campanha não gera mais controle redundante.

**Contagem de controladores para os filtros**: `PersonagensNarradorClient.tsx` passou a calcular `activeJogadorControllerCount` — para cada personagem, só conta controladores cujo `user_id` está em `jogadoresAtivos` (participantes com `role !== "owner"` e `status === "active"`, já calculado no server component). Essa contagem, não a bruta de `character_controllers`, é a que alimenta `personagemMatchesFiltro` (filtros e contagens da barra de abas) e o badge "Sem jogador". A lista de "quem controla"/"Remover controle" continua mostrando **todos** os controladores (inclusive um residual, por transparência administrativa — o narrador precisa poder limpar isso), só os *filtros* é que usam a contagem restrita.

Comportamento final confirmado (testes e browser check, seção 6):

| Situação | Resultado |
|---|---|
| sem controlador, não PN | **Sem jogador** |
| PN, sem jogador | **PNs**, não **Jogadores** |
| atribuído a jogador ativo | **Jogadores** |
| PN atribuído a jogador ativo | **PNs** e **Jogadores** simultaneamente |
| arquivado | só em **Arquivados** (regra já existente, inalterada) |
| controlador com participação removida (controle residual) | **não** conta em **Jogadores** |
| narrador cria personagem pelo assistente na própria campanha | **sem** controle redundante |
| jogador cria personagem pelo assistente | controle automático normal |

## 5. Decisão de produto registrada nesta versão

> Nesta versão privada do Ruptura VTT, jogadores podem criar personagens livremente nas campanhas das quais participam.

Sem configuração por campanha, sem aprovação do narrador, sem sistema adicional de permissões — comportamento já existente desde a Fase 1 (`complete_character_creation` exige só participação ativa), preservado nesta rodada. Registrado aqui como fechamento do item pendente §12.2 do relatório de auditoria (`AUDITORIA_REFATORACAO_CONTAS_CAMPANHAS_CONVITES_PERSONAGENS.md`).

## 6. Migration aplicada

`supabase/migrations/0060_display_names_tipo_personagem_protection.sql` — aplicada ao projeto Supabase real (`yvxoijexyhjjipjktfuu`, único projeto da organização — não há projeto de desenvolvimento separado):

- `get_campaign_participant_info(uuid)` — nova função, `SECURITY DEFINER`, `EXECUTE` só para `authenticated` (revogado de `public`/`anon`).
- `update_character_sheet_payload(uuid, jsonb)` — recriada com a proteção de `tipo_personagem` (contrato de assinatura inalterado).
- `complete_character_creation(uuid, jsonb, text, text)` — recriada com o controle automático condicional ao papel (contrato de assinatura inalterado).

`get_advisors` (security) rodado após a migration: os únicos avisos novos são do tipo esperado "função `SECURITY DEFINER` executável por `authenticated`" para as três funções acima — mesmo padrão intencional já usado por todas as RPCs de autorização do projeto desde a Fase 1 (`grant_character_control`, `revoke_character_control` etc.), não uma regressão.

## 7. Testes comportamentais (Supabase real)

Script novo `scripts/dev/validate-fase6-usabilidade-integridade.mjs` — cenário: U1 (narrador de A), U2 (narrador de B, só para isolamento), U3 (jogador com `display_name` definido), U4 (jogador sem `display_name`, para testar o fallback). **15/15 testes aprovados**:

1. Narrador vê nome + e-mail de participante, com fallback humano (parte local do e-mail, nunca UUID) quando não há `display_name`.
2. Jogador não recebe dados de participantes pela RPC (só narrador).
3. Isolamento: narrador de outra campanha não vê participantes de A.
4. Jogador controlador altera campos normais da ficha.
5. Jogador não consegue marcar o próprio personagem como PN.
6. Jogador não consegue remover a classificação PN já existente.
7. Payload completo novo enviado pelo jogador (sem `metadados`) não apaga `tipo_personagem` por omissão — este é o teste que capturou o bug do `jsonb_set` aninhado (seção 3).
8. Narrador continua podendo definir/remover a classificação pelo caminho administrativo.
9. Narrador criando personagem pelo assistente na própria campanha não gera controle redundante.
10. Jogador criando personagem pelo assistente recebe controle automaticamente.
11. Sem controlador e não PN → Sem jogador, não Jogadores.
12. PN e sem jogador → PNs, não Jogadores.
13. Atribuído a jogador ativo → Jogadores.
14. PN atribuído a jogador ativo → PNs e Jogadores simultaneamente.
15. Controlador com participação removida não mantém o personagem em Jogadores (controle residual ignorado pelo filtro).

Re-executada a suíte da Fase 4 (`validate-personagens-fase4.mjs`) após as mudanças — **17/17**, sem regressão (inclui o teste 15 dela, que já cobria criação pelo narrador via `INSERT` direto — caminho diferente de `complete_character_creation`, não afetado por esta correção).

## 8. Browser check

Servidor local iniciado via `next start` (build de produção) na porta 3100 — a porta 3000/`next dev` já estava em uso por outra sessão neste mesmo diretório; evitou o lock de `.next/dev` que dev servers concorrentes no mesmo projeto disparam. Duas contas fixture criadas no Supabase real (`browsercheck-narrador-fase6@…`, sem `display_name`; `browsercheck-jogador-fase6@…`, sem `display_name`) e removidas ao final.

**Narrador**: em **Jogadores e convites**, a linha do jogador mostra o nome (fallback = parte local do e-mail, já que a fixture não tinha `display_name`) em negrito e o e-mail completo como linha secundária — nenhum UUID visível. Criou "Guarda Sem Jogador" pela criação rápida — apareceu em **Sem jogador**, contagem "Jogadores (0)"; o `<option>` de "Atribuir jogador" já mostrava o nome, não o UUID. Atribuiu o jogador — a linha passou a mostrar "Jogador: browsercheck-jogador-fase6" e "Remover controle de browsercheck-jogador-fase6" (nome, não `user_id`), e as contagens da barra de filtros atualizaram imediatamente para "Jogadores (1)"/"Sem jogador (0)".

**Jogador**: login e navegação para **Personagens** redirecionou direto para a ficha do único personagem controlado ("Guarda Sem Jogador") — comportamento da Fase 5, inalterado. Console do navegador sem erros.

## 9. Tipos e build

- `npx tsc --noEmit`: limpo.
- `npm run build`: limpo, todas as rotas geradas.
- `next-env.d.ts`: revertido após o build (`git checkout -- next-env.d.ts`).

## 10. Arquivos principais alterados

- `supabase/migrations/0060_display_names_tipo_personagem_protection.sql` (novo).
- `src/lib/table/storage.ts` — `getCampaignParticipantInfo`, tipo `CampaignParticipantInfo`.
- `src/app/mesas/[campaignId]/jogadores-e-convites/page.tsx`, `JogadoresConvitesClient.tsx`.
- `src/app/mesas/[campaignId]/personagens/page.tsx`, `PersonagensNarradorClient.tsx`.
- `src/lib/character/personagensFilter.ts` — comentário atualizado sobre a semântica de `controllerCount` (sem mudança de assinatura).
- `scripts/dev/validate-fase6-usabilidade-integridade.mjs` (novo).

## 11. Pendências reais (fora de escopo desta rodada, não bloqueiam)

1. `window.prompt` para "Renomear" — preservado, fora de escopo (pedido original excluiu explicitamente).
2. Sistema completo de perfil público (avatar, preferências) — não criado, conforme pedido; a RPC desta rodada é deliberadamente mínima e restrita ao narrador.
3. `PersonagensJogadorClient.tsx` e `FichaHeader.tsx` já não exibiam `user_id` (confirmado por grep) — nenhuma mudança necessária ali.
4. `display_name` só existe hoje se a conta tiver `user_metadata.display_name`/`full_name` preenchido (ex.: via "Conta e preferências", fora desta rodada) — sem isso, o fallback é a parte local do e-mail, nunca UUID, o que já satisfaz o requisito de "nunca UUID" mesmo sem um formulário de nome de exibição dedicado.

## 12. Working tree final

```
 M src/app/mesas/[campaignId]/jogadores-e-convites/JogadoresConvitesClient.tsx
 M src/app/mesas/[campaignId]/jogadores-e-convites/page.tsx
 M src/app/mesas/[campaignId]/personagens/PersonagensNarradorClient.tsx
 M src/app/mesas/[campaignId]/personagens/page.tsx
 M src/lib/character/personagensFilter.ts
 M src/lib/table/storage.ts
?? scripts/dev/validate-fase6-usabilidade-integridade.mjs
?? supabase/migrations/0060_display_names_tipo_personagem_protection.sql
?? docs/checkpoints/CHECKPOINT_FASE6_USABILIDADE_INTEGRIDADE.md
```

Fixtures de browser check (2 contas, 1 campanha) criadas e removidas via Supabase real ao final da sessão — nenhum dado de teste permanece no banco.
