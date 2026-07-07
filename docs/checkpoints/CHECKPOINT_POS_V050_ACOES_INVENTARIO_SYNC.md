# Checkpoint documental — pós v0.50 (munição, Aljava, sync, narrador, Console de Ação)

**Data:** 2026-07-06
**Branch:** `main`
**Tipo:** Só documentação — nenhum código, migration, RLS ou seed alterado neste checkpoint.

## Commits relevantes cobertos aqui

```
a768767 fix: persist connected action console executions
5d19cdb feat: complete theater-of-mind action console
613ee75 feat: add narrator character state tools
09f5a14 feat: auto-sync character sheet with table state
b88ed20 fix: align initial ammo and quiver purchase state
cc24799 fix: support multiple quivers and isolated weapon ammo
34c9878 fix: per-bow arrow selection UX and Aljava double-grant bug
bf0398a fix: unify ammunition stacks on repeat purchase
2313eaa fix: align shared quiver with content library
2f9d4ed fix: make quiver shared across bows
baf5b6a feat: add manual quiver transfers
589eb86 feat: allow manual quantity adjustment per arrow stack in aljava
5837b56 test: cover ammunition reload and attack consumption
aa41723 fix: require arrow selection for bow attacks and block empty-ammo attacks
989594c fix(content): align ammunition catalog with PRD
3ad8450 feat: consume ammunition on attacks
2a013af feat: reload weapons from compatible ammunition
a6a4296 feat: add ammunition stock and quivers
1f86bf1 feat: normalize ammunition types
```

**Relatório anterior defasado:** `docs/RELATORIO_AUDITORIA_V0_50.md` (HEAD `cfc9d22`, v0.50.2) não menciona munição/Aljava/Realtime/Console de Ação/postura — todo esse escopo foi implementado depois daquele HEAD. Achado A1 daquele relatório (modificadores de condição hardcoded) segue parcialmente válido: posturas já leem `payload_automacao.efeitos` data-driven (confirmado no código), mas os modificadores das 17 condições da Biblioteca continuam hardcoded em `activeEffects.ts` — não confirmado que isso mudou.

---

## 1. Munição e Aljava (confirmado no código)

- Não existe munição genérica — tipos mínimos publicados na Biblioteca: `flecha_simples`/`flecha_flamejante`/`flecha_toxica`/`flecha_eletrica`/`flecha_explosiva`, `virotes`, `mun_pistola`, `mun_fuzil`, `mun_escopeta`, `mun_precisao`.
- Estoque de munição é compartilhado por tipo (mesmo `itemSlug`, categoria `municao`) — comprar o mesmo tipo duas vezes unifica a mesma instância de estoque (`purchaseItem`, `src/lib/character/inventory.ts`).
- Munição carregada é estado isolado por instância de arma (`municaoAtual` na própria `InventoryItemInstance`) — nunca compartilhado entre duas armas do mesmo tipo.
- Recarregar (`reloadMagazineWeapon`) segue regra FPS: só recarrega se houver estoque compatível; consome exatamente o que couber (`faltante = max - atual`, `carregada = min(faltante, estoque)`); recarga parcial é permitida; arma já cheia não consome PA nem estoque (retorna `motivoFalha: "ja_cheio"` sem mutar nada).
- Armas de fogo/bestas compradas nascem com `municaoAtual: 0`, salvo o modelo declarar `inclui_na_compra` explícito (ex.: besta_leve vem com kit de 6 virotes — 1 carregado, 5 no estoque).
- Arcos usam Aljava, nunca `municaoAtual` própria.
- Aljava é instância de item solo (`itemSlug: "aljava"`), independente — um personagem pode ter múltiplas Aljavas simultâneas.
- Cada arco (instância) guarda `selectedAljavaInstanceId` — escolhe qual Aljava usa.
- Ataque com arco lê a flecha selecionada (`selectedFlechaSlug`) dentro da Aljava escolhida e consome exatamente 1 unidade no disparo, independente de acerto/erro (a resolução de acerto/dano não é automatizada — `resolver_ataque` continua "efeito pendente"; o consumo de munição roda sempre que a ação com esse efeito é executada).
- Aljava solta comprável na loja custa 50 Ⱥ e nasce vazia (0/15) — confirmado no catálogo (`content/db_equipamentos_normalizado_v1_2.json`, item `aljava`) e no fluxo de compra.
- Comprar o primeiro arco (personagem sem nenhuma Aljava) cria uma Aljava automática e deposita o kit inicial do arco nela (ex.: arco_curto/arco_longo → 10 flechas simples cada, capacidade 15 — dois arcos enchem 15/15 e o excedente vira estoque solto).

## 2. Sync ficha/mesa (confirmado no código)

- Ficha conectada a mesa/perfil recebe mudanças do personagem via Supabase Realtime real (`useCharacterRealtime`, canal `postgres_changes` em `characters`) — não é polling.
- Log da mesa (aba Mesa e `/dev/table`) atualiza via Realtime próprio (`useTableLogsRealtime`, canal em `table_logs`).
- Se há edição local pendente (comparação contra `lastSyncedCharacterRef`), a ficha **não sobrescreve silenciosamente** — mostra banner "Há uma versão mais recente no servidor" com os botões "Recarregar do servidor" e "Manter minha versão".
- Sem mesa/personagem conectado, não há tentativa de sync nem erro — os hooks de Realtime retornam `"disabled"` de forma limpa quando `characterId`/`campaignId` são nulos.

## 3. Ferramentas do narrador (confirmado no código)

- `/dev/table` tem a seção "Estado dos personagens", visível quando uma mesa está selecionada.
- Por perfil com personagem ativo, o narrador pode: aplicar dano (PV/PE, clamp em 0), aplicar cura (PV/PE/Mana, clamp no máximo, com remoção automática de Contundido/Envenenado/Sangrando quando cura PV), definir valor direto de qualquer recurso (override manual), aplicar condição publicada da Biblioteca (sem duplicar a mesma condição já ativa) e remover condição ativa.
- Cada ação chama `updateCharacter` (mesmo storage da ficha) e registra `table_logs` com `type: "character_state_change"`.
- A ficha recebe essas mudanças pelo mesmo Realtime do item 2 — nenhum canal novo foi criado para a ferramenta do narrador.

## 4. Console de Ação em teatro da mente (confirmado no código)

- Decisão de escopo mantida: sem mapa, token, alvo estruturado, distância/adjacência/linha de visão automática, sem iniciativa por janelas rápida/lenta.
- Ações derivadas de condição própria implementadas e automatizadas: **Escapar** (Agarrado/Imobilizado, 2 PA), **Soltar alvo** (Agarrando, livre), **Apagar fogo** (Queimando, 1 PA). **Levantar** (remove Caído) já usa o mesmo mecanismo de remoção de condição (`getActionRemovalEffects`/`removeConditionsBySlug`) — confirmado no código, mas não foi um item explicitamente testado em browser nos checkpoints anteriores.
- PA só é cobrado nessas ações se a condição-alvo realmente existia e foi removida (nunca cobra por um clique que não fez nada).
- Escapar/Soltar alvo geram lembrete textual no log ("remova Agarrando/Agarrado dela/dele manualmente") — sem alvo estruturado, o outro lado do vínculo precisa ser resolvido manualmente pelo narrador.
- Postura Ofensiva e Postura Defensiva são estados ativos reais: armazenadas como `ActiveCondition` (`conditionId: "postura_ofensiva"/"postura_defensiva"`, `origem: "action_console"`) — mesmo array/formato de qualquer condição, sem estrutura paralela.
- Posturas aparecem em "Efeitos ativos gerados" (ConditionsTab) e nos chips de modificador da aba Rolagens — confirmado no código e em browser: ativar Postura Ofensiva gera chips reais `+1 [ofensiva, conjuracao]` e `-1 [defensiva]`, consumidos pelo mesmo pipeline `deriveActiveEffectsFromConditions` já usado por condições normais (via um adaptador leve que expõe o `payload_automacao` da ação de postura no mesmo formato de `ConditionContent`).
- Ativar uma postura desliga a outra automaticamente, sem custo extra.
- Remover Postura pela aba Condições continua possível (override manual, sem custo de PA) — a UI mostra aviso discreto ("Remoção manual — não executa o custo de PA nem o log de 'Encerrar Postura'") ao lado do botão Remover quando a condição ativa é uma postura.

## 5. Persistência automática do Console (confirmado no código)

- Ações do Console que automatizam remoção de condição própria ou toggle de postura (mesma condição: `removedConditions.length > 0 || postureChange`) persistem sozinhas quando a ficha está conectada a mesa/perfil/personagem salvo — sem exigir clique em "Salvar personagem".
- Reaproveita o mesmo par storage já usado por "Salvar personagem" (`saveCharacterForProfileSession` em modo produto, `updateCharacter` em modo dev) — nenhum caminho de persistência novo.
- Gera o mesmo log persistente (`type: "action_used"`) já usado por qualquer execução de ação do Console — **confirmado no código como tipo canônico único**; nenhum `character_action` foi criado.
- Sem mesa/personagem salvo conectado, o Console continua 100% local (estado local + log local), sem tentativa de persistência e sem erro.
- Se a persistência falhar: a mudança local **não é revertida** (já tinha acontecido antes da chamada de persistência); aparece um aviso discreto (`ficha-erro-persistencia`, visível em qualquer aba, não só Geral); "Salvar personagem" continua disponível para tentar de novo manualmente. Este é o comportamento real implementado — não foi testado um cenário de falha real de rede em browser (só o caminho de sucesso foi validado ponta a ponta).

---

## 7. Pendências reais

### Bloqueantes
- RLS de `characters`/`campaigns`/`table_logs` ainda tem policies `*_dev_transition_*` abertas para `anon` (herdado do relatório anterior, não confirmado que mudou) — precisa cair antes de expor a jogadores reais fora do ambiente dev.

### Funcionais
- Ataque ainda precisa ser conectado melhor a arma equipada/dano/região do corpo/MIT — hoje `resolver_ataque` é só "efeito pendente" textual; só o consumo de munição foi automatizado.
- Defesa/reação ainda precisa fluxo operacional completo — `spendReactionForDefense`/penalidade por defesa sem Reação existem, mas "Aparar"/"Bloquear" seguem como "Defesa ativa (não automatizada)".
- Armaduras/MIT/PD por região do corpo ainda precisam fechamento — hoje MIT/PD são valores globais do equipamento ativo, sem sobreposição por região.
- Fim de rodada/cena ainda pode precisar de preview antes de aplicar efeitos (aplicação hoje é direta).
- Itens usáveis (farmácia/granadas/vertinas) ainda precisam automação de efeito — hoje são só itens de inventário sem ação de uso automatizada.
- Talentos ainda precisam de uma segunda camada de padrões (além do que já está data-driven).
- Magia ainda precisa resistência/prompt/sobrecarga mais integrado ao fluxo de ataque/condições.

### UX
- "Levantar" não foi validado explicitamente em browser check nos checkpoints recentes (só confirmado por leitura de código) — vale um teste rápido antes de contar como coberto.
- Cenário de falha real de persistência automática (rede indisponível durante execução de ação conectada) não foi reproduzido em browser — só o código do caminho de erro foi revisado.

### Técnicas
- A1 do relatório anterior (modificadores de condição hardcoded em `activeEffects.ts` para as 17 condições da Biblioteca) segue como dívida não confirmada como resolvida — só as posturas (ações, não condições da Biblioteca) ganharam o tratamento data-driven neste ciclo.
- Verificação de Realtime entre duas telas simultâneas nos checkpoints recentes foi feita via releitura sequencial de banco (sandbox de navegador de aba única), não uma prova visual de duas abas ao vivo — o mecanismo em si foi validado ponta a ponta uma vez e reaproveitado sem mudança nos checkpoints seguintes.

### Decisões de produto/regra adiadas
- Iniciativa por janelas rápida/lenta e alternância PJ/PN — adiado deliberadamente (decisão de produto já registrada nos checkpoints anteriores).
- Mapa/token/alvo estruturado/distância/adjacência/linha de visão automática — adiado deliberadamente; ações continuam em teatro da mente.
- RLS final de produção — decisão adiada até playtest externo (mencionado no relatório anterior, não confirmado que já foi decidido).

## 8. Próxima ordem recomendada

1. Conectar Atacar a armas equipadas (dano básico, sem região do corpo ainda).
2. Região do corpo + mitigação básica (MIT/PD aplicando dano de fato).
3. Reações defensivas (Aparar/Bloquear operacionais).
4. Preview de fim de rodada/cena antes de aplicar efeitos.
5. Itens usáveis (farmácia/granadas/vertinas).
6. Padrões extras de talentos.
7. Magia/resistência/sobrecarga mais integrados.
