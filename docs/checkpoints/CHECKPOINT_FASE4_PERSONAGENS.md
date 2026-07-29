# Checkpoint — Fase 4: Personagens

**Data**: 2026-07-29
**Escopo**: implementação da Fase 4 (Personagens) do plano aprovado, usando exclusivamente o modelo concluído nas Fases 1/2 (`character_controllers`, `campaign_members`, `campaigns.owner_id`). Iniciada só depois da Fase 3 completa, testada e commitada, conforme pedido.

---

## 1. Bug pré-existente encontrado e corrigido (aprovado pelo usuário antes de aplicar)

Ao implementar "Criar personagem" (narrador), o teste comportamental contra o Supabase real revelou que `createCharacterForCampaign`/`duplicateCharacter` (função interna `insertCharacterScoped`, `src/lib/character/storage.ts`) **sempre falhavam** com `"new row violates row-level security policy"` quando chamadas por uma conta narradora real (não service role) — um bug **pré-existente à Fase 3/4**, nunca exercitado antes por uma sessão autenticada real (o caminho já testado de criação usa o assistente completo, que passa por uma RPC, não por um `INSERT` direto).

**Causa raiz diagnosticada** (confirmada por SQL direto no projeto, isolando cada variável): `insertCharacterScoped` fazia `.insert(...).select().single()` — um único `INSERT ... RETURNING`. A policy de `SELECT` (`characters_authenticated_select` → `can_read_character`, migration 0052) é avaliada sobre a linha recém-criada antes do fim do comando. `can_read_character` é `STABLE` e resolve por uma subconsulta própria (`select 1 from characters where id = ...`) — funções `STABLE` congelam o snapshot no início do comando, então essa subconsulta nunca enxerga uma linha inserida pelo próprio comando ainda em andamento, mesmo para o dono da campanha. Confirmado que `UPDATE ... RETURNING` **não** tem o mesmo problema (a linha já existia antes do comando).

**Correção aplicada** (aprovada explicitamente pelo usuário antes de qualquer alteração): `insertCharacterScoped` passou a gerar o `id` no cliente (a coluna já aceita valor explícito, tem `default gen_random_uuid()`) e fazer o `SELECT` de confirmação como um **comando separado** — sem tocar em migration, RLS ou autenticação. Afeta só `createCharacterForCampaign` e `duplicateCharacter`; `createCharacter` (legado, usado só por `/dev/character-sheet`, fora do escopo desta fase) não foi tocado.

Confirmado corrigido: teste comportamental dedicado (script novo, seção 4) e verificação em navegador real (narrador criou e duplicou personagens com sucesso).

## 2. Decisão de implementação — classificação PN/Sem jogador

O modelo de dados (Fases 1/2) não tem um campo que distinga "personagem sem jogador ainda, mas destinado a um" de "PN por desenho" — só `character_controllers` (quem controla) e `archived_at`. Os filtros exigidos ("Todos, Jogadores, Sem jogador, PNs, Arquivados") precisam dessa distinção.

**Decisão**: campo aditivo `payload.metadados.tipo_personagem?: "jogador" | "pn"` (`src/lib/character/types.ts`) — vive no jsonb já existente, **sem migration**. Não é autorização (isso continua 100% em `character_controllers` + participação ativa); é só uma etiqueta de apresentação, escrita apenas quando o narrador marca "Marcar como PN" no formulário rápido de criação.

Lógica de classificação extraída para `src/lib/character/personagensFilter.ts` (funções puras `isPersonagemPn`/`personagemMatchesFiltro`) — usada pelo componente React **e** pelo script de validação, para o teste exercitar a regra real, não uma reimplementação:

- **Jogadores**: tem ao menos um controlador ativo.
- **PNs**: `tipo_personagem === "pn"`.
- **Sem jogador**: nenhum controlador e não é PN.
- **Arquivados**: `archived_at` preenchido — exclui dos demais filtros, aparece só aqui.

Um PN com controlador aparece em **Jogadores e PNs simultaneamente** (filtros são lentes independentes, não partição exclusiva) — confirmado em navegador (atribuir um jogador a um PN incrementa a contagem de "Jogadores" sem tirar de "PNs").

## 3. Páginas e comportamento por papel

`src/app/mesas/[campaignId]/personagens/page.tsx` decide o componente pelo papel já resolvido pelo layout (Fase 3):

- **Narrador** (`PersonagensNarradorClient.tsx`): todos os personagens da campanha (via `listCharactersForNarratorCampaign`), busca por nome, ordenação (recentes/nome), 5 filtros com contagem, criar (nome + "Marcar como PN"), abrir ficha, renomear, duplicar, arquivar/restaurar, atribuir jogador (dropdown de participantes ativos sem controle deste personagem), remover controle (por controlador). Link para o assistente completo como alternativa de criação mais completa.
- **Jogador** (`PersonagensJogadorClient.tsx`): só os personagens controlados, não arquivados (`listControlledCharacters` filtrado); só "Abrir ficha"; estado vazio com "Criar personagem" (aditivo §10.3).

Todas as ações reaproveitam funções já existentes desde a Fase 1 (`grantCharacterControl`, `revokeCharacterControl`, `archiveCharacter`, `restoreCharacter`, `duplicateCharacter`, `renameCharacter`, `createCharacterForCampaign`) — nenhuma reimplementada, só reunidas na página própria (antes viviam soltas na tela monolítica de Mesa).

Terminologia: "PN" (nunca "PNJ"), "Atribuir jogador"/"Remover controle" (nunca "Vincular personagem"/"Perfil") — confirmado por busca textual (seção 6).

## 4. Testes comportamentais (Supabase real)

Script novo `scripts/dev/validate-personagens-fase4.mjs` — cenário: U1 (narrador de A), U2 (narrador de B), U3/U4 (jogadores ativos de A); CJ (controlado por U3), CSJ (sem controlador), CPN (marcado PN), CARQ (arquivado), CB (em B). **17/17 testes aprovados**:

1. Jogador vê somente personagens controlados.
2. Jogador não lê personagem não controlado.
3. Narrador vê todos os personagens da própria campanha (incluindo arquivado).
4. Narrador não vê personagens de outra campanha.
5. Personagem sem controlador aparece em "Sem jogador" (lógica real, via `personagensFilter.ts`).
6. PN aparece em "PNs" (lógica real).
7. Arquivado aparece só no filtro correspondente, mesmo com controlador ou PN.
8. Busca + filtro combinados sem resultado incoerente.
9. Atribuir controle concede acesso ao jogador correto (e não a outro).
10. Remover controle revoga o acesso imediatamente.
11. Remover controle não apaga o personagem.
12. Participante removido não acessa mesmo com controle residual (defesa em profundidade da Fase 1, reconfirmada neste cenário).
13. Jogador não consegue atribuir ou remover controle (RPC rejeita).
14. Jogador não arquiva, restaura ou duplica por chamada direta (RLS rejeita).
15. Narrador executa criar/arquivar/restaurar/renomear (via sessão real, não admin) — este é o teste que capturou o bug da seção 1.
16. Abrir ficha respeita as permissões das Fases 1/2.
17. Extra: duplicar preserva `tipo_personagem` (a cópia de um PN continua PN).

Re-executada a suíte da Fase 1 (`validate-character-controllers-authorization.mjs`, 19/19) após o fix em `storage.ts` — sem regressão.

## 5. Browser check (contas reais, mesma campanha da Fase 3)

**Narrador**: Personagens mostra "Kael Teste" (criado na Fase 3) com jogador atribuído; criou "Guarda Sombria" marcado PN pelo formulário rápido (confirmando o fix do bug ao vivo); atribuiu e removeu jogador do PN (contagem "Jogadores"/"PNs" reagindo corretamente); duplicou ("Guarda Sombria (cópia)" nasceu também como PN); arquivou a cópia (some de "Todos", aparece só em "Arquivados" com "Restaurar"); restaurou; buscou "kael" combinado com filtro "Todos" (só Kael Teste) e com "Arquivados" (vazio, estado claro). Nenhum erro de console.

**Jogador**: Personagens mostra **só** "Kael Teste" — nenhum PN, nenhum outro personagem, nenhuma ação administrativa. "Abrir ficha" funciona. Tentativa de abrir a ficha do PN por URL direta (`/ficha?...characterId=<PN>`) é negada no servidor: *"Personagem não encontrado ou você não tem acesso a ele."* — sem distinguir "não existe" de "sem permissão".

## 6. Validação final conjunta (Fases 3+4)

- `npx tsc --noEmit`: limpo.
- `npm run build`: limpo, todas as rotas geradas.
- `next-env.d.ts`: revertido após cada build.
- Testes comportamentais: 19/19 (Fase 1) + 9/9 (Fase 2 convites) + 3/3 (pós-migration destrutiva) + 17/17 (Fase 4 Personagens) = **48/48**.
- Testes existentes pré-Fase3: `test:realtime-minimal` ✅ (atualizado para exercitar `formatTableLogEntry`, a função realmente em uso); `test:realtime-publication` ✅; `test:campaign-end-round`/`test:campaign-end-scene`/`test:character-storage` ❌ — mesma causa pré-existente já documentada no relatório de Fase 1/2 (scripts usam simulação de sessão que não fornece `auth.uid()` real), não é regressão desta sessão.
- Busca textual por `PNJ`, `Perfil`, `membership`, `Owner ID` nas áreas tocadas (Fase 3 e 4): sem ocorrência em UI ativa — os únicos resultados são formatação de eventos históricos de log (`type: "profile_event"`, anterior à Fase 1) e comentários documentando a remoção.
- Inspeção das rotas administrativas (`/jogadores-e-convites`, `/configuracoes`) com a conta jogadora: nega no servidor, sem depender da ausência do link.

## 7. Pendências reais (não bloqueiam a Fase 4)

1. Exibição de participantes/controladores por `user_id` bruto (truncado) — mesma pendência já registrada no checkpoint da Fase 3 e no relatório de Fase 1/2 (sem tabela/RPC de nome de exibição público).
2. "Renomear" usa `window.prompt` (nativo do navegador) — preserva o padrão já existente na tela antiga; não foi pedido como semântico obrigatório desta fase.
3. Quem pode criar personagem livremente continua uma decisão de produto pendente (auditoria §12) — a Fase 4 não decidiu isso, só manteve o comportamento já permissivo desde a Fase 1.
4. Limite de quantos personagens um narrador pode marcar como PN vs. Sem jogador — não há limite; é uma etiqueta livre.

## 8. Limite da ficha — respeitado

Nenhuma estrutura interna da ficha foi alterada. A única adição foi `initialTab` (Fase 3, já commitada) para deep-link — não é seletor de personagem, não é retorno de ficha, não é troca interna, não reorganiza a ficha em páginas.
