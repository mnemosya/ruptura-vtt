# Checkpoint — Draft persistente do wizard de criação de personagem

Fecha a pendência "salvar e sair / retomar / cancelar" registrada em
`CHECKPOINT_CRIACAO_AUTONOMA_JOGADOR.md`. Commit da fase:
`9e73433` — *"feat: persist character creation wizard draft
(save/resume/cancel)"*.

## Escopo

- Nova tabela `character_creation_drafts` (migration `0047`), RPC
  `security definer` `save_character_creation_draft` (compare-and-swap
  por `revision`, rejeita perfil/campanha alheios, rejeita gravação se
  o perfil já tiver personagem), e limpeza atômica do draft dentro da
  própria transação de `complete_character_creation` (migration `0048`).
- Só o fluxo do jogador (perfil já reivindicado); narrador sem
  persistência de draft.
- Payload guarda só escolhas mínimas (nunca carteira/inventário
  derivados) — restauração faz replay de `purchaseItem` contra o
  conteúdo efetivo ATUAL, descartando e avisando sobre itens que não
  existem mais.

## Falhas encontradas e corrigidas durante a própria verificação

1. **RLS insuficiente por si só** — a policy original só provava
   `owner_id = auth.uid()`, não que o `profile_id`/`campaign_id`
   enviados pertenciam ao chamador. Corrigido antes de qualquer teste,
   exigindo `exists (... campaign_profiles ...)` na própria policy.
2. **Grants excessivos (migration 0049)** — a migration `0047`
   original concedia `insert, update` a `authenticated` na tabela,
   permitindo contornar a RPC (e suas checagens de negócio) com um
   INSERT/UPDATE direto que só precisasse satisfazer a RLS. Corrigido
   com `revoke insert, update on character_creation_drafts from
   authenticated` — confirmado por teste hostil (403 `permission
   denied`).
3. **Destino de navegação errado** — "Salvar e sair" e "Cancelar
   criação" navegavam sempre para `/mesas/[campaignId]` (owner-only),
   causando "Acesso negado" para o jogador. Corrigido para o dashboard
   geral (`/mesas`) quando `draftProfileId` está presente.

## Aceite funcional (12 cenários, login autenticado real)

Fixtures criadas via Admin API/SQL (service role só para
criar/limpar), toda a validação funcional feita com JWT real de
usuário autenticado (password grant) e, para os fluxos de UI, sessão
de browser real logada via `/login`. Todas as fixtures foram removidas
ao final (0 campanhas, 0 drafts, 0 personagens, 0 itens, 0 usuários
fixture confirmado por SQL).

1. Preencher + autosave + reload — confirmado (SQL + UI).
2. Restauração integral + mesmo `creationRequestId` após reload —
   confirmado.
3. "Salvar e sair" persiste a alteração mais recente — confirmado
   (achou e corrigiu o bug de destino do item 3 acima).
4. "Cancelar criação" remove o draft — confirmado (via override de
   `window.confirm`, já que o tooling do browser suprime o diálogo
   nativo).
5. Duas abas / conflito de revisão — reproduzido com duas abas reais
   na mesma sessão: a aba com revisão desatualizada recebeu
   `revision_conflict`, mostrou aviso e resincronizou sem sobrescrever
   a mais nova (confirmado nas duas direções).
6. RPC rejeita perfil/campanha alheios — 403 confirmado via HTTP
   direto (dois casos: profile_id alheio, campaign_id alheio).
7. INSERT/UPDATE diretos bloqueados — 403 `permission denied`
   confirmado (achou o bug do item 2 acima).
8. Finalizar cancela/aguarda autosaves — confirmado (personagem criado
   sem draft órfão).
9. `complete_character_creation` remove o draft na mesma transação —
   confirmado.
10. Autosave pós-conclusão rejeitado — confirmado (403, "perfil já tem
    personagem").
11. Item removido/arquivado entre save e load — confirmado com aviso
    exato ("1 item(ns) do rascunho não estão mais disponíveis...").
12. Migration `0048` preservou 100% das validações canônicas da `0046`
    — confirmado por **diff programático** da função
    `complete_character_creation`: só as 3 chamadas `delete from
    character_creation_drafts` foram adicionadas, nenhuma linha de
    validação alterada, removida ou reordenada.

## Verificação de regressão da suíte global (rodada separada, pós-commit)

Pedido explícito: comprovar se as 3 falhas remanescentes da suíte
`test:*` (`test:character-storage`, `test:campaign-end-round`,
`test:campaign-end-scene`) já existiam antes desta fase, sem alterar
código de produto nem os próprios testes.

- Commit atual: `9e73433` (`feat: persist character creation wizard
  draft (save/resume/cancel)`).
- Commit-base (pai imediato): `1fdb51b` (`docs: record resolver parity
  acceptance`).
- Baseline isolado via `git worktree add --detach <dir> 1fdb51b`
  (nunca alterou o branch principal); `node_modules`/`.env.local`
  reaproveitados por symlink (nenhum `npm install` rodado) — `diff
  package.json`/`package-lock.json` entre base e atual confirmou
  arquivos IDÊNTICOS antes de reaproveitar, validando a comparação.
- Os 3 testes rodaram no atual e no baseline; a saída (`stdout`+`stderr`
  combinados) de cada teste foi comparada com `diff` byte a byte entre
  os dois estados: **`diff` vazio (exit 0) nos três**, ou seja, mensagem
  de erro, asserção e stack de progresso são IDÊNTICOS em ambos os
  commits.
- `test:character-storage` — falha idêntica: `Falha ao listar
  personagens: permission denied for table characters`. Causa raiz já
  documentada no próprio topo do arquivo `scripts/test-character-storage.ts`
  ("depende de policies dev-transition"), removidas pela migration
  `0031` — 16 migrations antes desta fase.
- `test:campaign-end-round` — falha idêntica:
  `assert.ok(logsAfter3.some((l) => l.type ===
  "round_pa_reduced_by_condition"))` falso, nas duas execuções.
- `test:campaign-end-scene` — falha idêntica: `"Log deve registrar o
  nível 2 usado."`, nas duas execuções.
- **Classificação factual**: as 3 falhas **já existiam no baseline,
  IDÊNTICAS** ao estado atual — não mudaram nesta fase, não são
  regressão introduzida pelo commit `9e73433`.
- Worktree temporário removido (`git worktree remove --force`) e
  repositório restaurado exatamente ao commit `9e73433`; `git status`
  final limpo, confirmado antes e depois da comparação.

## Status

**Draft persistente do wizard concluído e aprovado; as três falhas da
suíte global são anteriores à fase e não constituem regressão.**
