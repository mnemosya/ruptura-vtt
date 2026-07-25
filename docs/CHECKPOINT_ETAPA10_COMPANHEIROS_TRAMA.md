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
- **Corrigido na rodada de conclusão (25/07/2026)**: reeditar um talento
  publicado com qualquer um destes 6 tipos (ou `efeito_temporario`/
  `modificar_instancia`/`conceder_item`/`consumir_item`/
  `alterar_disponibilidade`/`alterar_dano_recebido`) duplicava a entrada
  a cada republicação, e um tipo removido no editor podia "ressuscitar"
  no payload publicado — ver seção "Rodada de conclusão do aceite" acima.

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

## Rodada de conclusão do aceite (25/07/2026) — rodada acelerada, compartilhada com Etapas 8/9

**Objetivo desta rodada**: fechar a reedição dos 6 tipos novos (nunca exercitada em rodada alguma) e uma validação negativa ao vivo. Mesmo servidor/admin/mesa/personagem das Etapas 8/9.

### Matriz residual (Etapa 10)

| # | Cenário do checkpoint original | Evidência anterior | Lacuna restante | Ação nesta rodada | Status |
|---|---|---|---|---|---|
| 1 | Catálogo e formulários — os 6 tipos aparecem, campos corretos, sem JSON bruto | §"Aceite de browser" (talento único com os 6 tipos) | — | Reconfirmado com um talento de fixture próprio: `companheiro` (drone), `modificar_companheiro` (19 operações confirmadas no select), `acao_companheiro` (+ consequência `dano` reaproveitando o catálogo universal), `programar_gatilho`, `parear` (7 compartilhamentos reais confirmados no formulário), `acao_trama` (alcance de avançar) | Aprovado anteriormente + reconfirmado |
| 2 | Automação declarada — Lembrete correto para os 6, sem falso Automático | §"Aceite de browser" | — | Reconfirmado: os 6 tipos mostraram "Lembrete" (`acao_companheiro` com consequência dano mostra a automação da CONSEQUÊNCIA, não do tipo pai) | Aprovado anteriormente + reconfirmado |
| 3 | Persistência e publicação — payload real, chaves corretas, versão, changelog | §"Aceite de browser" | — | Reconfirmado: publicado `1.0.0`, payload real com as 6 chaves corretas (`conceder_companheiro`/`modificar_companheiro`/`acao_companheiro`/`programar_gatilho`/`parear`/`acao_trama`, todas `familia:"companheiro"` ou `"trama"`) | Aprovado anteriormente + reconfirmado |
| 4 | Reedição — alterar um tipo, remover/reordenar outro, republicar sem perda nem duplicação | **Nunca exercitada** | Nenhuma rodada anterior tinha tentado reeditar um talento já publicado com estes tipos | Ver "Bug crítico encontrado" abaixo — a primeira tentativa **duplicou 5 dos 6 tipos e "ressuscitou" o tipo removido** (`parear`); corrigido; reexecutado com sucesso (payload colapsou de 11 para 5 entradas corretas) | **Aprovado nesta rodada** (após correção) |
| 5 | Composição — `acao_companheiro` com consequência reaproveitando o catálogo universal | §"Aceite de browser" (não testado com consequência) | Consequência `dano` nunca configurada ao vivo | Efeito filho `dano` (1d6 físico) adicionado como consequência de `acao_companheiro`; serializado corretamente como resumo textual (`resultado: "1 consequência(s): dano"`) — a árvore completa fica só na metadata, exatamente como documentado em §11 | **Aprovado nesta rodada** |
| 6 | Validações negativas — campo obrigatório ausente bloqueia a publicação | Nunca exercitada ao vivo | idem | Achado ao vivo, orgânico (não fabricado): `programar_gatilho` sem o campo `acao` (ação associada) bloqueou a publicação com `"programação precisa de gatilho e ação associada"`; preenchido o campo, publicação passou a suceder | **Aprovado nesta rodada** |

### Bug crítico encontrado, corrigido e testado (reedição duplicava/ressuscitava efeitos de companheiro/Trama)

Ao reeditar o talento publicado (recuperando os 6 tipos de `content_editor_metadata`), alterar `modificar_companheiro` (`conceder_pa`→`reparar`), reordenar `acao_trama` e **remover** `parear`, e então republicar: o payload real passou a ter **11 entradas** em vez de 5 — as 6 antigas (incluindo o `parear` recém-REMOVIDO no editor, e o `modificar_companheiro` com o valor ANTIGO `conceder_pa`) permaneceram todas, e as 5 novas (a árvore atual, sem `parear`) foram simplesmente somadas ao lado.

**Causa raiz** (mesma classe de bug do commit `f896b43`, desta vez numa camada mais profunda): `ehEfeitoLegadoSubstituivel` (`publishSerialization.ts`, corrigido em `f896b43` para ser sensível a `origemLegado`) decide corretamente ENTRE duas regras — mas a regra em si, para o caminho "reedição normal" (`origemLegado` ausente), depende de `resolverTipoCanonico` reconhecer o `tipo` legado já publicado como correspondente a um tipo editável, via `aliasesLegado` (`effectTypeRegistry.ts`). **`aliasesLegado.talent` de `companheiro`, `acao_companheiro`, `programar_gatilho`, `parear` estava VAZIO (`{}`)**, e o de `modificar_companheiro`/`acao_trama` tinha só aliases de conteúdo GENUINAMENTE legado (`companheiro_pa_bonus`; `comando_sem_teste`/`comando_livre_sem_custo`/`alterar_protocolo`) — nenhum dos 6 tipos tinha o PRÓPRIO `tipo` legado que ELE MESMO produz (`conceder_companheiro`/`modificar_companheiro`/`acao_companheiro`/`programar_gatilho`/`parear`/`acao_trama`, confirmado em `TIPO_LEGADO.talent`, `effectLegacySerialization.ts`) listado em seu próprio `aliasesLegado.talent`. Sem essa entrada, `resolverTipoCanonico` caía no balde `"outro"` para essas entradas, `isTipoEfeitoEditavel("outro")` = falso, e a entrada antiga NUNCA era considerada substituível — permanecia para sempre, se somando a cada republicação (e nunca sendo removida, mesmo quando o tipo era explicitamente excluído no editor).

Uma auditoria dos demais tipos revelou o MESMO problema em mais 4 combinações não relacionadas a companheiro/Trama: `efeito_temporario` (faltava `"buff_temporario"` em `aliasesLegado.talent`), `modificar_instancia` (faltava `"modificar_instancia"` para talent), `conceder_item`/`consumir_item`/`alterar_disponibilidade` (`aliasesLegado` vazio) e `alterar_dano_recebido` (faltava `"reduzir_dano_recebido"` para talent).

**Correção**: adicionado, para cada uma das 9 combinações (tipo, content_type) afetadas, o próprio `tipo` legado real (de `TIPO_LEGADO.talent`) ao `aliasesLegado.talent` daquele tipo — preservando, lado a lado, qualquer alias GENUINAMENTE legado pré-existente (ex.: `companheiro_pa_bonus` continua listado para `modificar_companheiro`, já que é um conteúdo real e diferente). Arquivo alterado: `src/lib/contentSchema/effectTypeRegistry.ts` (só a estrutura de dados `aliasesLegado` — nenhuma lógica nova).

**Teste regressivo**: `scripts/dev/validate-companions-trama.mjs`, caso novo #24 — simula `rawOriginal` já contendo a saída de uma publicação anterior de todos os 6 tipos, reedita removendo `parear` e alterando `modificar_companheiro`, e confirma exatamente 1 de cada tipo restante e 0 de `parear`. **Reproduzido rigorosamente contra o código pré-fix real** (arquivo restaurado via backup local, nunca `git checkout` destrutivo): caso #24 falha (`{"conceder_companheiro":2,...,"parear":1}` — o removido reaparece!), os outros 23 continuam passando; registro corrigido restaurado, 24/24 voltam a passar.

**Provado ao vivo, não só por harness**: republicação real do talento de fixture confirmou a duplicata real no Supabase (`jsonb_array_length` = 11, incluindo o `parear` "ressuscitado"); após a correção, uma nova reedição (sem mudança de conteúdo, só para forçar nova serialização) colapsou de volta a exatamente 5 entradas corretas (`v1.0.2`).

### Fixtures, console e rede

Ver seção equivalente em `docs/CHECKPOINT_ETAPA9_INVENTARIO_RUNAS_MERCADO.md` (mesmo admin/mesa/personagem). Talento de fixture (`talent:zz_e2e_editor_etapas8_10_talento`) removido ao final — documento, changelog, `content_editor_metadata` — confirmado por contagem zero. Console/rede sem erros em nenhum passo.

### Verificação técnica

`npx tsc --noEmit` sem erros; `npm run build` sucesso; `next-env.d.ts` revertido. Harnesses reexecutados sem regressão: `validate-companions-trama.mjs` (24/24, novo caso), `validate-composite-effects.mjs` (15/15), `validate-temporary-effects.mjs` (17/17), `validate-inventory-runes-market.mjs` (22/22), `validate-post-mvp-effects.mjs` (17/17), `validate-item-schema-roundtrip.mjs` (12/12), `validate-slug-collision.mjs` (46/46), `validate-import-export-book.mjs` (19/19) — todos afetados por `effectTypeRegistry.ts` ser código compartilhado. Nenhuma migration.

**Status desta etapa, promovido**: **"Etapa 10 concluída — companheiros, drones, robôs e Trama aprovados."** Os 6 tipos, formulários, validação (incl. bloqueio orgânico de `programar_gatilho` sem ação associada), diagnostics, preview, persistência, publicação, reedição (incluindo a correção de um bug real de duplicação/ressurreição de efeitos removidos, com teste de regressão provado contra o código anterior) e composição (consequência de `acao_companheiro` reaproveitando o catálogo) — todos confirmados ao vivo contra o Supabase real.

**Etapas 4–9, 11, 12: não reabertas.** Etapa 4 permanece exatamente "Etapa 4 concluída — aceite operacional e de browser aprovado."; Etapa 5 permanece "Implementada — aceite de browser parcial." (não reaberta, não tocada); Etapas 6/7 permanecem exatamente "Etapa 6 concluída — adaptadores e edição de legados aprovados."/"Etapa 7 concluída — testes, resistências e efeitos compostos aprovados."; Etapa 11 permanece exatamente "Etapa 11 concluída — integração editorial de drag aprovada."; Etapa 12 permanece exatamente "Etapa 12 concluída — validação integrada aprovada." — nenhum desses documentos foi alterado por esta rodada.

**Status global do Editor Universal, atualizado**: com Etapas 8, 9 E 10 concluídas nesta mesma rodada, e restando apenas a Etapa 5 (implementada, aceite de browser parcial, não reaberta), **"Editor Universal parcialmente concluído — aceite residual da Etapa 5 pendente."** Não declarado concluído.
