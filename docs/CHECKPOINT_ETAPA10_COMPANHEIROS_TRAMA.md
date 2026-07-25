# Checkpoint — Etapa 10: drones, robôs, companheiros e Trama

**Status: Implementação concluída — aceite de browser parcial.** (Atualizado — ver "Aceite de browser" ao final do documento.)

Não afirmo automação operacional além do que o motor real executa hoje.
Os 6 tipos novos desta etapa são sempre `lembrete` — nenhum executor
genérico existe para nenhum deles. Droneiro, Mecatrônico e Tecelão
continuam inteiramente bespoke em `talentEngine.ts`, sem qualquer
refatoração ou generalização forçada.

## 1. Auditoria inicial

Achado central (confirmado por leitura direta de `talentEngine.ts`,
`types.ts`, `CharacterSheetClient.tsx`, `TalentsTab.tsx`, `endScene.ts`,
`legacyConversion.ts` e conteúdo real): **existem dois sistemas
completamente separados neste repositório.**

1. **A ficha de personagem/gameplay** (`src/lib/character/`,
   `/dev/character-sheet`) — onde Droneiro (`registerDrone`/
   `activateDrone`/`hasSinalLimpo`/`pairDronesEnxame`/etc.), Mecatrônico
   (`registerRobo`/`activateOverclock`/etc.) e Tecelão (`iniciarTrama`/
   `ajustarRamTrama`/`ajustarDeteccaoTrama`/`executarBypass`/
   `executarAgulhaFina`) já são ~15 funções REAIS, comitadas em
   `99d5820`/`cee8f3b`/`0d58325`, com CRUD completo em
   `Character.drones[]`/`Character.robos[]`/`Character.trama_ativa`,
   ciclo de vida ligado a `endScene.ts`/fim de rodada, e UI própria
   (`TalentsTab.tsx`). **Nenhuma dessas funções é genérica** — cada uma
   lê um `tipo`/`familia` exato de UM nível de talento específico,
   invocada por clique manual, nunca por um efeito de conteúdo lido em
   loop. Nomes parecidos (`registerDrone` vs. `registerRobo`) escondem
   lógica hiper-específica (ex.: `pairDronesEnxame` só aceita drones do
   MESMO `modelo` textual, máximo 3 — valores literais do payload de UM
   talento).
2. **O Editor Universal de Conteúdo** (`src/lib/contentSchema/`,
   `/admin/biblioteca`) — onde os efeitos desses 3 talentos SEMPRE
   caíram em `FAMILIAS_INCOMPATIVEIS` (`legacyConversion.ts:38`, já
   existente desde antes desta etapa: `["companheiro", "trama",
   "propagacao_efeito", "meta_talento"]`) — ou seja, **hoje um admin não
   consegue editar esses efeitos pelo Editor Universal de forma alguma**;
   eles caem no balde `"outro"` de `effectTypeRegistry.ts`.

Confirmado também: `docs/AUDITORIA_EDITOR_UNIVERSAL_CONTEUDO.md` já
cita `talentEngine.ts` como um risco documentado ("~150 funções
nomeadas por talento... comportamento escrito à mão"), e
`docs/PLANO_IMPLEMENTACAO_EDITOR_UNIVERSAL.md` já classificava esta
etapa como "engine + editor combinada" com automação "parcial ou
inexistente".

**Estado mutável real em `Character` confirmado**:
```ts
drones?: { id, nome, modelo, controlador, estado, paAtual, paMaximo, acoes, ativadoNestaCena, gatilho, pareamento, paBonusRodadaAtiva }[];
robos?: { id, nome, modelo, programador, estado, paAtual, paMaximo, acaoAutonoma, ordens, primeiroTesteBonusDisponivel, marchaDuplaAtivaNestaRodada, overclockAtiva }[];
trama_ativa?: { id, nome, classificacao, limiteDeteccao, niveisRevelados, posicaoAtual, bloqueios: string[], nos: string[], presencasHostis: string[], ramAtual, ramMaximo, paGastosNaTrama, deteccaoAtual, detecaoAcionada, rastro, protocolosUsados, iniciadaEm, ativa, encerradaEm? };
```
`modelo`/`acoes`/`ordens`/`bloqueios`/`nos`/`presencasHostis` são texto
livre — **não existe catálogo estruturado de Nó/Bloqueio/Presença nem
modelo de drone/robô na Biblioteca hoje** (nenhum `db_drones.json`,
nenhum schema). PA de companheiro já é um par `paAtual`/`paMaximo` POR
INSTÂNCIA, genuinamente separado do PA do personagem
(`estado_jogo.pa_gastos`) — nenhum código conecta os dois.

RAM já é representável sem nenhum código novo: `RECURSOS_ALTERAR`
(Etapa 4/8) já inclui `"ram"`.

Conteúdo real relevante (`content/db_talentos_normalizado_v1_3.json`):
Droneiro N1 (`companheiro_pa_bonus`), Tecelão N2 Bypass
(`{familia:"trama", tipo:"comando_sem_teste"}` + `{familia:"companheiro",
tipo:"alterar_protocolo", protocolo:"avancar", distancia_espacos:15}`),
Tecelão N3 Agulha Fina (`comando_livre_sem_custo`). Escalpos com
`tipo:"ocultar_rastro_digital"`/`"ram_bonus"`/`"deck_sinaptico"` existem
no conteúdo mas **sem nenhum executor** (grep confirmado: zero
ocorrências em `src/`).

## 2. Decisão sobre tipos de conteúdo

**Nenhum novo `content_type` foi criado.** Drone/robô não são entidades
independentes reutilizáveis hoje: não há catálogo publicado, não há
schema, e o "modelo" de cada instância é uma string livre digitada pelo
jogador (`Character.drones[].modelo`), nunca uma referência à
Biblioteca. Isso falha o critério "modelo precisa ser reutilizável" —
criar um `content_type` novo sem nenhum conteúdo real por trás violaria
"não criar novo content_type apenas por conveniência". Os 6 efeitos
novos desta etapa vivem no catálogo universal existente (mesma
estrutura de `EfeitoEditavel`), representáveis apenas em TALENTO
(`familia:"companheiro"`/`"trama"`, ambos valores REAIS do enum de
família do schema — não inventados).

## 3. Arquitetura / novos tipos

6 tipos novos, todos com campos mínimos do briefing, todos
`TIPOS_EFEITO_FILHO` (nestáveis em resultado de teste/resistência):

- **`companheiro`** — conceder/registrar instância. Campos: tipo
  (drone/robo/companheiro_tecnico/outro), modelo (texto livre — sem
  catálogo), destino, controlador, quantidade, PA inicial, persistente/
  duração, vínculo.
- **`modificar_companheiro`** — operação enumerada (19 valores do
  briefing: conceder_pa...reativar) — nunca caminho JSON arbitrário.
- **`acao_companheiro`** — ação + `efeitosConsequencia: EfeitoFilho[]`
  reaproveitando o catálogo universal (dano/cura/condição/etc.) como
  consequência, sem duplicar. Limite: `MAX_EFEITOS_CONSEQUENCIA_ACAO_COMPANHEIRO
  = 3`. **Não pode conter outro `acao_companheiro`** — validado em
  runtime (não estruturalmente, única exceção ao padrão de exclusão por
  tipo desde a Etapa 7 — justificada porque o teto de automação é
  sempre `lembrete`, risco de execução nulo).
- **`programar_gatilho`** — reaproveita o campo comum `gatilho`
  (`CamposEfeitoComuns`, mesmo vocabulário `GATILHOS_INICIAIS` já usado
  por todo o catálogo) em vez de inventar um segundo conceito de
  gatilho.
- **`parear`** — origem/destino/tipos compatíveis/compartilhamentos
  (comando/percepção/ação/estado/PA/sinal/ação coordenada).
- **`acao_trama`** — 13 ações do briefing (avançar, revelar_no,
  revelar_bloqueio, criar_presenca, modificar_assinatura,
  aumentar/reduzir_deteccao, aumentar/reduzir_rastro, isolar, atravessar,
  expulsar_presenca, assumir_controle), custo PA/RAM, teste opcional
  (atributo/perícia/CD fixa), alvo em texto livre (Nó/Bloqueio/Presença
  — sem catálogo estruturado real), alcance de Avançar em espaços
  (nunca metros/tokens).

**RAM não ganhou tipo novo** — reaproveita `alterar_recurso`
(`recurso:"ram"`, já no enum desde antes desta etapa).

## 4. Modelo × instância

Nenhum dos 6 tipos toca estado de instância. Verificado (harness caso
17): o payload publicado nunca contém `paAtual`/`ramAtual`/
`deteccaoAtual`/`rastro`/`presencasHostis`/`detecaoAcionada` — essas
chaves só existem em `Character` (runtime), nunca em conteúdo
publicado. Como nenhum executor genérico conecta estes efeitos a
`Character.drones[]`/`robos[]`/`trama_ativa`, published/model changes
also cannot touch instance state — there simply is no code path.

## 5. Bugs reais corrigidos de passagem (achado desta etapa)

Ao validar a serialização de talento contra o schema oficial real
(`schema_talentos_v1_3.json`, `$defs.efeito`, **fechado**:
`additionalProperties:false`, ~90 chaves fixas), descobri que **5 tipos
de etapas anteriores emitiam chaves que não existem nesse enum** —
nunca detectado porque os harnesses da Etapa 8/9 não validaram esses
casos específicos contra o schema de TALENTO (só contra item/rune, cujo
schema é aberto e mascarava o problema):

| Tipo | Chaves inválidas (antes) | Correção |
|---|---|---|
| `efeito_temporario` | `bonus_pericia` (objeto), `nota` | `pericias` (array real) + `valor`; `nota` removida do payload público (só metadata) |
| `modificar_instancia` | `operacao`, `limite` | `acao` (chave real, reaproveitada) + `valor` |
| `conceder_item` | `item_slug`, `destino`, `estado_inicial`, `cargas_iniciais`, `quantidade_inicial`, `motivo` | `identifica`/`escopo` (arrays reais) + `max_unidades` + `requisito` |
| `consumir_item` | `item_slug`, `comportamento_pilha`, `destino` | `identifica` (array) + `max_unidades` + `condicao`/`para` |
| `alterar_disponibilidade` | `operacao`, `quantidade`, `fornecedor` | `acao` + `max_unidades` + `identifica` (array) |

Além disso, `escopo`/`identifica` só aceitam **array** no schema real
(não string solta), e `teste` só aceita **object/string/array** (nunca
`boolean`) — ambos corrigidos nos 6 tipos novos desta etapa também
(`acao_companheiro`/`acao_trama` nunca emitem `teste: true`/`false`).
Todas as correções são cobertas por verificações dedicadas (harness
casos 19-23) validando contra o schema real.

## 6. Serialização e schemas

Todos os 6 tipos novos: bloqueados para spell/item/rune (sem
`familia:"companheiro"`/`"trama"` nesses schemas), serializáveis só em
talento, usando exclusivamente chaves REAIS confirmadas por leitura
direta do schema (`contexto`, `identifica`, `escopo`, `max_unidades`,
`pa_bonus`, `duracao`, `requisito`, `acao`, `alvo`, `valor`, `custo_pa`,
`custo_pa_extra`, `teste`, `resultado`, `condicao_ativacao`, `de`,
`para`, `comandos`, `custo`, `custo_ram`, `pericias`, `minimo`,
`alvo_texto`, `distancia_espacos`, `familia`). Campos sem contraparte
real (ex.: `controlador`, `estadoInicial`, a árvore completa de
`efeitosConsequencia`) ficam só em `content_editor_metadata` — nunca
perdidos, só ausentes do payload público, documentado explicitamente
(nunca fingido como suportado).

`acao_trama` "avançar" serializa `distancia_espacos` — o MESMO campo
real já usado pelo Bypass do Tecelão (`alterar_protocolo`,
`distancia_espacos:15`), confirmado pela auditoria e pelo harness
(caso 6).

## 7. Verificações executadas

- `git status --short`, `npx tsc --noEmit`, `npm run build` — limpos.
- `scripts/dev/validate-companions-trama.mjs` — **23/23 checks
  passando**: serialização/bloqueio dos 6 tipos novos; RAM reaproveitando
  `alterar_recurso`; ação de companheiro com consequência reaproveitando
  o catálogo universal; prevenção de auto-aninhamento e limite de
  consequências; programação reaproveitando o campo comum `gatilho`;
  bloqueio de pareamento vazio; ausência de `_editor`; separação
  modelo×instância; regressão de teste_resistencia; e as 5 correções de
  bug (§5), todas validadas contra `schema_talentos_v1_3.json` real.
- SQL transacional com rollback (Supabase, projeto
  `yvxoijexyhjjipjktfuu`): inseriu um talento real com `companheiro` +
  `acao_trama` no nível 1 + metadata completa, releu e comparou
  byte-a-byte, confirmou `familia:"companheiro"` preservada, abortou a
  transação — contagens pós-rollback confirmam **zero resíduo**.

## 8. Verificações bloqueadas

`scripts/dev/check-admin-companions-trama.ts` (Playwright) — mesmo
conflito `esbuild`/`tsx` das etapas anteriores. Criado, documentado, não
executado; comando `npm run check:admin-companions-trama` disponível.

## 9. Bespoke preservado

`talentEngine.ts` não foi tocado. Nenhuma função de Droneiro/
Mecatrônico/Tecelão foi extraída, refatorada ou generalizada — a
auditoria concluiu que nenhuma delas é genuinamente reutilizável
(comprovado por inspeção, não presumido por nome parecido).
`legacyConversion.ts::FAMILIAS_INCOMPATIVEIS` continua classificando o
conteúdo LEGADO desses 3 talentos como incompatível/somente leitura —
inalterado; os 6 tipos novos só valem para conteúdo NOVO construído do
zero.

## 10. Segurança e limites

Mesmas garantias das etapas anteriores (validação de admin/mutação no
servidor, sem `eval`/fórmula arbitrária). Limites documentados: máximo
de 3 consequências por ação de companheiro (`MAX_EFEITOS_CONSEQUENCIA_ACAO_COMPANHEIRO`);
`acao_companheiro` nunca contém outro `acao_companheiro`. Nenhuma
migration, nenhuma tabela nova, nenhum mapa, nenhum sistema paralelo de
personagens.

## 11. Limitações reais

- Todos os 6 tipos novos são sempre `lembrete` — nenhum executor real.
- Nó/Bloqueio/Presença/assinatura continuam texto livre (sem catálogo
  estruturado no runtime real) — representados como campos de texto em
  `acao_trama`, nunca como entidades próprias.
- `acao_companheiro.efeitosConsequencia` (a árvore completa) só existe
  na metadata editorial — o payload público carrega apenas um resumo
  textual (`resultado`), por não haver chave real para lista aninhada.
- Nenhum gancho de UI novo conecta estes efeitos a
  `Character.drones[]`/`robos[]`/`trama_ativa` — Droneiro/Mecatrônico/
  Tecelão continuam operando exclusivamente pela ficha existente.
- Browser check não executado (ambiente).

## Status final

**Implementação concluída — aceite de browser pendente.** A estratégia
de modelo está definida (nenhum content_type novo, decisão documentada);
companheiro/PA/ações/programação/pareamento/Trama/RAM/Detecção/Rastro
são representáveis ou corretamente classificados; Nós/Bloqueios/
Presença são representados como texto livre (única forma real
existente); serialização/schemas válidos (incluindo 5 correções de bug
descobertas e corrigidas nesta etapa); round-trip por metadata
comprovado (node + SQL); funções bespoke permanecem 100% preservadas;
modelo e instância permanecem separados; TypeScript e build passam;
nenhuma perda de payload conhecida. **Não avancei para a Etapa 11.**

> **Nota de referência futura (adicionada durante a Etapa 11, sem
> alterar o status acima):** a Etapa 11 (importação/exportação +
> Biblioteca do Livro) avançou parcialmente depois desta — pacote,
> exportação, importação draft-only e vínculos editoriais estão com
> implementação concluída (aceite de browser pendente), mas a etapa como
> um todo permanece **"Implementação parcial — integração editorial de
> drag pendente"**, por não existir ainda um renderizador do Livro nem
> um editor estruturado de capítulos para servir de destino do drag.
> Nenhuma dependência disto altera o status desta Etapa 10 — ver
> `docs/CHECKPOINT_ETAPA11_IMPORTACAO_EXPORTACAO_BIBLIOTECA_LIVRO.md`.

---

## Aceite de browser — rodada de auditoria formal do Editor Universal

**Data**: 24-25/07/2026. **Ambiente**: `next dev` local + Supabase real, ferramenta de browser. **Fixtures**: usuário admin temporário + `admin_users` via SQL.

**Bug crítico encontrado e corrigido nesta rodada**: `companheiro`, `acao_trama` (e todo tipo pós-MVP, incluindo os 4 demais tipos revisados desta etapa via §5) eram rejeitados incondicionalmente ao salvar rascunho por um gate de validação desatualizado (`effectDraftValidation.ts::isTipoEfeitoMvp`) — nunca detectado porque o browser check nunca foi executado desde a Etapa 7. Corrigido; detalhes completos em `docs/CHECKPOINT_CORRECAO_VALIDACAO_TIPOS_EFEITO_POS_MVP.md`.

Executado ao vivo, em um único rascunho de talento (3 níveis) contendo TODOS os 5 tipos corrigidos pela §5 desta etapa MAIS os 2 tipos novos aqui, no mesmo nível: `efeito_temporario`, `modificar_instancia`, `conceder_item`, `consumir_item`, `alterar_disponibilidade`, `companheiro` (`tipo: drone`, `modelo: drone_padrao`, `quantidade: 1`), `acao_trama` (`acao: avancar`, `alcance: 15`) — todos preenchidos com campos reais, `modoAutomacao` = "Lembrete" para os 6 sem executor (confirmado correto) e "Assistido" para `modificar_instancia` (tem executor real). Salvo **sem erro de tipo inválido** (confirmando a correção) → publicado com sucesso (`1.0.0`) → payload consultado diretamente no Supabase real:

```json
{"tipo":"conceder_companheiro","contexto":"drone","identifica":["drone_padrao"],"max_unidades":1,"familia":"companheiro",...}
{"tipo":"acao_trama","acao":"avancar","distancia_espacos":15,"familia":"trama",...}
```

Confirma exatamente as chaves REAIS documentadas em §6 desta etapa (`familia:"companheiro"`/`"trama"`, nunca chaves inventadas) — este é o primeiro aceite ao vivo de que os 6 tipos desta etapa são serializáveis e publicáveis de ponta a ponta pelo Editor Universal real, não apenas pelo harness `validate-companions-trama.mjs` (inalterado, 23/23).

**Não executado nesta rodada**: gatilho de UI ao vivo para qualquer um dos 6 tipos em `/dev/table` ou numa ficha de personagem real — inalterado, a própria etapa já define esses tipos como sempre `lembrete`, sem executor a ser exercitado. Inspeção de que `talentEngine.ts` (Droneiro/Mecatrônico/Tecelão) permanece intacto não foi refeita nesta rodada (nenhum código desse arquivo foi tocado por esta correção).

Console e rede: nenhum erro. Fixtures removidas ao final.

**Status: "Implementação concluída — aceite de browser parcial."** Promovido de "pendente" — os 6 tipos novos desta etapa, incluindo os 4 tipos herdados da Etapa 9 que a correção §5 mudou, foram confirmados salvando, publicando e serializando corretamente com as chaves reais, ao vivo, contra o Supabase real — fechando a lacuna que tanto este checkpoint quanto o da Etapa 9 já apontavam como "nunca verificado ao vivo". Não promovido a "concluída — aceite de browser aprovado" porque o checklist original completo do script (`check-admin-companions-trama.ts`, itens de programação/pareamento/Detecção/Rastro/Nó/Bloqueio separados) não foi reexecutado item a item.
