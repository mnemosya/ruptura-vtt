# Checkpoint — Fase 3: Navegação da campanha

**Data**: 2026-07-29
**Escopo**: implementação da Fase 3 (Navegação da campanha) do plano aprovado em `docs/relatorios/AUDITORIA_REFATORACAO_CONTAS_CAMPANHAS_CONVITES_PERSONAGENS.md`, seguindo o aditivo `docs/prd/ADITIVO_PRD_CONTAS_CAMPANHAS_CONVITES_PERSONAGENS.md` §4/§5.
**Pré-condição verificada**: Fases 1 e 2 confirmadas concluídas — 34/34 testes comportamentais re-executados contra o Supabase real nesta sessão (`validate-character-controllers-authorization.mjs` 19/19, `validate-campaign-invites-fase2.mjs` 9/9, `validate-post-destructive-migration.mjs` 3/3), working tree limpo antes de começar.

---

## 1. Achado de auditoria que motivou o tamanho do trabalho

O dashboard (`/mesas`) e a página de campanha (`/mesas/[campaignId]`) eram **100% exclusivos do narrador**:

- `/mesas` filtrava `todas.filter(m => m.owner_id === user.id)` — descartava as campanhas onde a conta é só participante, mesmo a RLS (`campaigns_owner_select` OR `campaigns_member_select`, migration 0043) já devolvendo as linhas certas.
- `/mesas/[campaignId]` bloqueava com "Acesso negado" qualquer conta que não fosse `owner_id`.

Ou seja: não existia experiência de jogador na campanha — só a tela pós-convite (`/join/[token]`) e a ficha (`/ficha`). Bando e Mercado já funcionavam para jogador, mas só embutidos nas abas da ficha (`MesaTab`/`InventoryTab`), nunca como áreas próprias da campanha.

## 2. Arquitetura final de navegação

```
Conta (fora de campanha)
├── Minhas Campanhas (/mesas) — narradora e jogadora, mesma lista
├── Criar Campanha (âncora #criar-campanha na mesma página)
├── Conta e preferências (/mesas/conta) — nome de exibição (autosave)
└── Sair

Campanha (/mesas/[campaignId], layout único)
├── JOGO (jogador e narrador)
│   ├── Mesa (/mesas/[id]) — rodada/cena, turnos, log; Resolver Ataque e Encerrar Rodada/Cena só narrador
│   ├── Personagens (/mesas/[id]/personagens) — placeholder honesto nesta fase (ver §5)
│   ├── Bando (/mesas/[id]/bando) — inventário compartilhado (reaproveita crewInventory.ts)
│   ├── Mercado (/mesas/[id]/mercado) — escolhe personagem → ficha, aba Inventário
│   └── Biblioteca (/mesas/[id]/livro) — leitura publicada (rota /livro já existente)
└── GERENCIAR (só narrador, checagem redundante no servidor)
    ├── Jogadores e convites (/mesas/[id]/jogadores-e-convites)
    └── Configurações (/mesas/[id]/configuracoes)
```

Decisão de nomenclatura registrada: o item de menu "Biblioteca" do aditivo (§5.1, "conteúdo publicado disponível") aponta para a rota já existente `/livro` (leitura, ambos os papéis) — não para `/biblioteca` (administração de homebrew/overrides, só narrador). `/biblioteca` continua existindo e funcionando, acessível por um link discreto a partir de `/livro` só para o narrador ("Gerenciar conteúdo da campanha →"). Nenhuma rota foi renomeada.

## 3. Autorização — sempre no servidor

`src/lib/campaign/access.ts` (novo) — `resolveCampaignAccess(campaignId)`:

- narrador = `campaigns.owner_id === user.id`;
- jogador = participação ativa (`is_campaign_member`, já existente da Fase 1) sem ser dono;
- nenhum dos dois = `no_access`.

Usado por `layout.tsx` (monta o menu certo) **e**, de novo, por cada página exclusiva do narrador (`requireNarratorAccess`) — a ausência do link no menu nunca é a única barreira. Confirmado em browser real: uma conta jogadora acessando `/jogadores-e-convites` e `/configuracoes` **diretamente pela URL** recebe "Área exclusiva do narrador" no servidor, não um link escondido.

Nenhuma migration, RLS ou policy foi alterada nesta fase — toda a autorização nova é composição do que a Fase 1 já expõe (`getCampaign`, `isCampaignMember`).

## 4. Divisão do antigo `MesaDetailClient.tsx` (1184 linhas, tela única)

| Antes (tudo em 1 arquivo, narrador-only) | Depois |
|---|---|
| Rodada/cena + Encerrar Rodada/Cena | `_mesa/RoundSceneSection.tsx` — leitura para jogador, ações só narrador |
| Trilha de turnos | `TurnTrackPanel` (já existia, já aceitava `isNarrator`) — reaproveitado sem mudança |
| Resolver Ataque | `_mesa/AttackResolutionSection.tsx` — só renderizado para narrador (ferramenta privilegiada, PRD §1.1) |
| Log da mesa | `_mesa/TableLogSection.tsx` — compartilhado, já vem filtrado do servidor (`listLogsForViewer`) |
| Personagens da mesa (criar/vincular/duplicar/arquivar/controle) | Sai da Mesa — vira a página **Personagens** (Fase 4) |
| Participantes + Convites (2 seções soltas) | Consolidado em **Jogadores e convites** (aditivo §8) |

Nenhuma regra de rodada/cena/combate/log foi reimplementada — os mesmos módulos (`endCampaignRound`, `endCampaignScene`, `resolveContestedRoll`, `applyAttackDamage`, `spendReactionForDefense` etc.) foram só realocados, com as mesmas chamadas.

**Código morto removido**: `formatCampaignRoundLog` (exportada por `MesaDetailClient.tsx`, nunca chamada por nenhuma tela real — superada por `formatTableLogEntry`, já em uso e já documentada como "para ser reaproveitada por qualquer outra tela", `MesaTab.tsx`). O teste que a exercitava (`scripts/test-realtime-minimal.ts`) foi atualizado para exercitar `formatTableLogEntry` (a função realmente usada), preservando a mesma cobertura de regressão (16 tipos de log, nenhum cai em fallback cru).

## 5. Personagens — placeholder deliberado desta fase

"Personagens" é item permanente do menu (aditivo §5.1/§5.2) e por isso precisa existir e ser navegável já na Fase 3 — mas a página em si (lista, filtros, atribuição de controle) é entrega da Fase 4, na ordem pedida ("conclua a Fase 3 antes de iniciar a Fase 4"). A rota `/mesas/[campaignId]/personagens` existe desde já com um estado claro ("Esta área ainda está sendo construída nesta etapa... chega na próxima parte desta implementação") — não é link morto (a rota resolve, autoriza e renderiza) nem simulação enganosa de funcionalidade. Será substituída pela página real na própria Fase 4.

## 6. Bando e Mercado — extração real, sem reimplementação

- **Bando**: nova página `/mesas/[campaignId]/bando` reaproveitando `src/lib/table/crewInventory.ts` tal como já existia (nenhuma função nova). Autorização inalterada desde a migration 0038: jogador lê e deposita (depósito continua sendo feito pela ficha, aba Mesa — não duplicado aqui); narrador também retira/remove. Testado em browser com as duas contas.
- **Mercado**: a loja já existe inteira dentro da ficha (`InventoryTab.tsx`, "Loja do Mercado Noturno") e opera sobre carteira/inventário de UM personagem — não duplicada. A página nova é só o ponto de entrada: com um personagem controlado, redireciona direto para `/ficha?...&tab=inventario` (aditivo §10.1, "sistema escolhe automaticamente quando só existe uma opção válida"); com vários, mostra uma lista para escolher; sem nenhum, orienta a criar. Confirmado em browser: com 1 personagem, o clique em "Mercado" leva direto à aba Inventário da ficha já aberta na Loja.
- **Deep-link de aba na ficha** (`?tab=inventario`): adição mínima e aditiva — `CharacterSheetClient` passou a aceitar `initialTab` como valor inicial do `useState` que já existia (`activeTab`), validado contra a lista real de abas antes de usar. Não é seletor de personagem, não é retorno de ficha, não é troca interna de personagem — nenhum item da Fase 5 foi antecipado.

## 7. Conta e preferências

Nova página `/mesas/conta`: e-mail (leitura) e nome de exibição, gravado em `user_metadata.display_name` do próprio Supabase Auth via `auth.updateUser` — sem tabela nova, sem migration, a própria conta autenticando a alteração em si mesma. Autosave com debounce de 700ms e estados discretos "Salvando…"/"✓ Salvo"/"Falha ao salvar" (aditivo §13.10) — sem botão genérico "Salvar". Mesmo padrão aplicado em "Configurações" (renomear campanha).

Avatar e demais preferências pessoais: sem lugar de armazenamento definido — pendência registrada, não bloqueia esta fase.

## 8. Jogadores e convites

Consolida em uma única área o que a Fase 1/2 deixou como "Participantes" e "Convites" soltos dentro da tela monolítica (decisão registrada no relatório de Fase 1/2, §10 item 5). Mesmas Server Actions já testadas (`createCampaignInvite`, `createCampaignEmailInvite`, `revokeCampaignInvite`, `removeCampaignMember`, `listCharacterControllers`) — nenhuma regra de convite/participação reimplementada. Atribuir/remover controle de personagem foi deixado para a página Personagens (Fase 4), evitando duplicar a mesma ação em dois lugares.

Limitação preservada (não é regressão): convites já existentes não podem ter o link "copiado de novo" (o token bruto só existe no momento da criação, nunca persistido em forma recuperável — decisão de segurança da própria Fase 2). "Reenviar" não existe como ação porque nunca existiu.

## 9. Configurações

Mínima e real: renomear a campanha (`renameCampaign`, nova função em `table/storage.ts`, autorizada pela mesma RLS `campaigns_owner_update` que já protege `endRound`/`endScene`). Permissões de criação de personagem e configuração de convites seguem como decisões de produto pendentes (auditoria §12) — não inventadas aqui.

## 10. UX/UI

- Tokens visuais compartilhados (`_shell/theme.ts`) — paleta escura já usada no projeto, nomeada e reaproveitada (não é um design system novo).
- Foco visível: `.rv-focusable:focus-visible` (outline 2px, cor de destaque) — confirmado via inspeção do elemento focado em navegador real (`matches(':focus-visible') === true`).
- Ordem de tabulação confirmada sequencial e lógica pelos itens do menu.
- Papel e campanha atual sempre visíveis (badge Narrador/Jogador + nome da campanha no cabeçalho).
- Estados vazios em todas as listas novas (Minhas Campanhas, Bando, Mercado, Personagens).
- Nenhuma tela nova depende só de cor (badges de papel usam texto + cor).

## 11. Testes

### Comportamental (Supabase real, contas reais criadas em browser)

| Cenário | Resultado |
|---|---|
| Conta autenticada acessa Minhas Campanhas (narradora e jogadora) | ✅ — corrigido o bug do filtro client-side; jogadora agora vê a campanha com badge "Jogadora" e contagem de personagens controlados |
| Narrador vê o menu completo (JOGO + GERENCIAR) | ✅ |
| Jogador vê somente o menu permitido (sem Gerenciar) | ✅ |
| Jogador não acessa Gerenciar por URL direta | ✅ — `/jogadores-e-convites` e `/configuracoes` mostram "Área exclusiva do narrador", servidor nega antes de renderizar conteúdo |
| Campanha atual permanece identificável | ✅ — nome + badge de papel no cabeçalho em toda página |
| Troca de campanha / volta a Minhas Campanhas | ✅ — link "← Minhas Campanhas" em toda página da campanha |
| Sair encerra a sessão | ✅ — testado como narrador, retorna a /login |
| Conta e preferências abre e salva (autosave) | ✅ |
| Mesa preserva rodada, cena, turnos e log | ✅ — dados idênticos aos da tela antiga, só reorganizados |
| Bando e Mercado acessíveis para os dois papéis | ✅ — Mercado com 1 personagem redireciona direto à Loja na ficha |
| Nenhum fluxo depende de Perfil | ✅ — busca textual confirma (seção 13) |
| Estados vazios compreensíveis | ✅ — Minhas Campanhas, Bando, Mercado, Personagens |
| Navegação por teclado | ✅ — tab order sequencial, foco visível confirmado via `:focus-visible` |

Console do navegador sem erros em nenhuma das duas sessões (narrador e jogador).

### Testes existentes (scripts pré-existentes)

| Script | Resultado | Observação |
|---|---|---|
| `test:realtime-minimal` | ✅ passou | Atualizado para exercitar `formatTableLogEntry` em vez do código morto removido — mesma cobertura |
| `test:realtime-publication` | ✅ passou | Sem relação com esta fase |
| `test:campaign-end-round` | ❌ falhou (pré-existente, mesma causa já documentada no relatório de Fase 1/2 — script usa service role no lugar de sessão real) | Não é regressão — `endCampaignRound`/`append_table_log` não foram tocados |
| `test:campaign-end-scene` | ❌ falhou (pré-existente, mesma causa) | Não é regressão |
| `test:character-storage` | ❌ falhou (pré-existente, mesma causa) | Não é regressão |

### Tipos, build e lint

- `npx tsc --noEmit`: limpo.
- `npm run build`: limpo, todas as rotas geradas (incluindo as novas: `bando`, `mercado`, `personagens`, `configuracoes`, `jogadores-e-convites`, `conta`).
- Lint: não há ESLint configurado no projeto (confirmado — nenhum `.eslintrc`/`eslint.config.*`).
- `next-env.d.ts`: revertido após cada build (alteração automática do Next.js, não editada manualmente).

## 12. Pendências reais (registradas, não bloqueiam a Fase 3)

1. Exibição de participantes por `user_id` bruto em "Jogadores e convites" — sem tabela/RPC de nome de exibição público ainda (mesma pendência já registrada no relatório de Fase 1/2).
2. "Reenviar" convite por e-mail não existe como ação (nunca existiu; limitação de segurança do token opaco, não desta fase).
3. Avatar e demais preferências pessoais além do nome de exibição.
4. Permissões de criação de personagem e configuração de convites em Configurações.
5. Quem pode criar personagem livremente — decisão de produto pendente da auditoria (§12), não bloqueada por esta fase.

## 13. Busca textual — sem residual proibido

Confirmado que a área tocada por esta fase não introduz `perfil`/`profile`/`membership`/`PNJ` na UI nova. Referências remanescentes no repositório (`MesaTab.tsx`, `TableClient.tsx`, `LogTab.tsx`) são exclusivamente formatação de **eventos históricos de log** (`type: "profile_event"` gravado antes da Fase 1) ou comentários documentando a remoção — não fluxo ativo.

## 14. Arquivos criados/removidos/modificados (destaques)

**Criados**: `src/lib/campaign/access.ts`; `src/app/mesas/[campaignId]/layout.tsx`, `_shell/*` (theme, CampaignShell, CampaignNav, NarratorOnlyDenied, CharacterPickerList), `_mesa/*` (RoundSceneSection, AttackResolutionSection, TableLogSection), `MesaClient.tsx`; `bando/`, `mercado/`, `personagens/page.tsx` (placeholder), `jogadores-e-convites/`, `configuracoes/`; `mesas/_account/AccountNav.tsx`, `mesas/conta/`.

**Removido**: `src/app/mesas/[campaignId]/MesaDetailClient.tsx` (dividido nos arquivos acima).

**Modificados**: `src/app/mesas/page.tsx`/`MesasDashboardClient.tsx` (fim do filtro por `owner_id`); `src/app/mesas/[campaignId]/page.tsx` (Mesa, busca dados por papel); `src/app/mesas/[campaignId]/livro/page.tsx` (link para `/biblioteca` só narrador); `src/lib/auth/session.ts`/`actions.ts` (nome de exibição); `src/lib/table/storage.ts` (`renameCampaign`); `src/app/CharacterSheetView.tsx`/`CharacterSheetClient.tsx`/`ficha/page.tsx` (`initialTab`); `src/app/globals.css` (classes utilitárias de foco/hover); `scripts/test-realtime-minimal.ts` (formatador atualizado).

## 15. Estado do working tree

Fixtures de teste (contas/campanha/personagem criadas em browser real) mantidas propositalmente no Supabase de desenvolvimento para reaproveitar na Fase 4 (mesma campanha, mesmo personagem já controlado) — serão limpas na validação final conjunta das duas fases. Nenhum arquivo temporário ou log sensível no repositório.

Commits desta fase seguem este checkpoint.
