# CHECKPOINT — ETAPA 7: TESTE, RESISTÊNCIA E EFEITOS COMPOSTOS

**Projeto:** Ruptura VTT
**Checkpoint anterior:** `99bca16` — docs: document legacy adapter checkpoint (Etapa 6)
**Escopo:** suporte reutilizável (não exclusivo de nenhuma magia/talento/item) para teste/resistência com resultados condicionais e efeitos filhos, modificação de margem e alteração de dano recebido.

**Status:** **Implementação concluída — aceite de browser parcial.** (Atualizado — ver "Aceite de browser" abaixo.) Classificação, serialização, validação de schema e o núcleo transacional foram verificados diretamente com `node` sobre código real compilado por `tsc`, e por SQL direto com rollback (zero resíduo). **Não afirmo automação operacional completa**: a árvore de teste/resistência tem um resolvedor genérico real, mas sem gatilho de UI ao vivo na mesa do narrador (ver §6 e limitações) — inalterado por esta rodada.

## Aceite de browser — rodada de auditoria formal do Editor Universal

**Data**: 24-25/07/2026. **Ambiente**: `next dev` local + Supabase real, ferramenta de browser. **Fixtures**: usuário admin temporário + `admin_users` via SQL.

**Bug crítico encontrado e corrigido nesta rodada**: `teste_resistencia` (e todo tipo pós-MVP) era rejeitado incondicionalmente ao salvar rascunho por um gate de validação desatualizado (`effectDraftValidation.ts::isTipoEfeitoMvp`) — nunca detectado porque o browser check nunca tinha sido executado desde a Etapa 7. Corrigido; detalhes completos em `docs/CHECKPOINT_CORRECAO_VALIDACAO_TIPOS_EFEITO_POS_MVP.md`.

Executado ao vivo, após a correção: rascunho de edição de uma magia real → adicionado efeito `teste_resistencia` (`quem_testa: usuario`, `pericia: vontade`, `cd_tipo: fixa`, `cd_valor: 14`) → 2 resultados adicionados (`falha_limitada`, `sucesso_padrao`) → efeito filho `dano` (1d4 ácido) adicionado ao resultado de falha → salvo com sucesso (sem erro de tipo inválido, confirmando a correção) → publicado com sucesso (`1.0.1`) → payload consultado diretamente no Supabase real: serializado corretamente como `efeito_com_resistencia` com `resistencia.pericias`/`cd_formula`, seguido do efeito-filho `dano` como sibling no mesmo array — exatamente a convenção documentada em §"Serialização legada" desta etapa.

**Não executado nesta rodada** (mantendo a limitação já documentada): gatilho de UI ao vivo do resolvedor em `/dev/table`/mesa do narrador — segue fora do escopo desta rodada (a própria etapa já define a aceitação como editorial, não operacional).

Console e rede: nenhum erro. Fixture removida ao final.

**Status: "Implementação concluída — aceite de browser parcial."** Promovido de "pendente" — criação, configuração (incluindo resultado + efeito filho), salvamento, persistência e publicação de `teste_resistencia` confirmados ao vivo contra o Supabase real, incluindo a correção de um bug real que bloqueava esse fluxo por completo. Não promovido a "concluída — aceite de browser aprovado" porque o resolvedor operacional na mesa do narrador continua sem gatilho de UI (limitação já conhecida, não corrigida nesta rodada) e o checklist original completo do script (`check-admin-composite-effects.ts`) não foi reexecutado item a item.

---

## 1. Auditoria inicial

### 1.1 Motor real (fatos, não redesenho)

- **Margem** — dois sistemas distintos e NÃO unificados: `MARGEM_CLASSIFICACOES` (`src/lib/dice/types.ts`) é o enum real de bandas de teste-vs-CD (`falha_critica/falha/falha_limitada/sucesso_limitado/sucesso_padrao/sucesso_critico`), computado por `classificarMargem` (`rollRuptura.ts`); `MarginBand` (`attack.ts`) é um enum DIFERENTE, específico de banda de dano em ataque contestado (`miss/limited/standard/critical`). Usei o primeiro (`MARGEM_CLASSIFICACOES`) como o único vocabulário de faixas do novo tipo canônico — nunca inventei uma faixa nova.
- **`promocao_margem`** já é um mecanismo REAL, genérico e funcionando: `getMarginPromotions` (`talentEngine.ts`) lê `{pericias[], de, para, contexto}` de qualquer efeito `tipo: "promocao_margem"` sem hardcoding por talento; a aplicação real acontece em `rollRuptura.ts::rollPericia` via `promocaoMargem`. Os 7 usos reais no catálogo usam sempre `de: "falha_limitada" → para: "sucesso_limitado"`. Meu novo `modificar_margem` serializa EXATAMENTE nesse formato para talento — reuso, não reimplementação.
- **CD de vertente**: `getVertenteCd(nivel) = VERTENTE_CD_BASE(6) + nivel` (`spells.ts`) é a regra real; a fórmula legada `"5 + nivel_vertente"` só existe como texto preservado no payload, nunca usada para calcular (o código só verifica `.includes("nivel_vertente")` para decidir SE aplica a regra de 6, ignorando o número literal da string).
- **Ordem de dano/MIT/PD**: existem DOIS pipelines paralelos e não totalmente unificados — `resolveDamageWithMitPd` (`defense.ts`, com flags de subtipo perfurante/ácido, MIT XOR PD nunca os dois) e `applyMarginBasedAttackDamage` (`attack.ts`, banda de margem + MIT flat, sem subtipo). Não refatorei o motor de combate (fora de escopo) — documentado como limitação conhecida pré-existente.
- **Nenhum resolvedor genérico de teste/resistência existia.** Spells/itens só produzem TEXTO (CD + perícia) via `describeSpellManualEffects`/equivalente em `itemUse.ts` — nunca resolvem o alvo. O único fluxo estruturado real (pendente → narrador confirma → aplica consequência) é `endRoundConditions.ts::buildConditionResistanceCheck`/`resolveConditionResistanceCheck`, mas é específico de condições de fim de rodada, não genérico.
- **`teste_colateral`**: zero executor no motor — só texto (`spells.ts::describeSpellManualEffects`). Confirmado sem mudança nesta etapa (continua somente leitura/lembrete).
- **`temporaryEffects.ts` documenta explicitamente** que `target: "damage"/"defense"` (alteração de dano recebido) só vira texto/lembrete — sem ponto de integração real. Confirma que `alterar_dano_recebido` deve nascer como `lembrete`, nunca automático.

### 1.2 Efeitos reais relacionados (amostras usadas na verificação, §7)

- `spell:energetica_bola_de_fogo`: `efeito_com_resistencia` (siblings soltos: `dano{sucesso:"metade"}`, `aplicar_condicao`).
- `rune` (não editável, só diagnóstico): `efeito_com_resistencia` com `condicao_falha` EMBUTIDA no próprio objeto (estrutura diferente da de magia); `protecao` com `efeito:"reduz_dano_recebido"`/`"reduz_dano_antes_do_pd"` (confirma o conceito real de "alterar dano recebido", vocabulário usado nos rótulos do novo tipo).
- `property` (não editável): `resistencia_critica_aplica_condicao` com `margem_minima: "sucesso_critico"` — TERCEIRA estrutura distinta.
- **Confirma literalmente**: `efeito_com_resistencia` tem pelo menos 3 formatos reais incompatíveis entre si — nenhuma conversão automática de legado para a nova árvore foi implementada (ver §5).

### 1.3 Matriz (resumo)

| Tipo legado | Content types | Executor atual | Representação canônica nova | Serialização | Confirmação | Escopo desta etapa |
|---|---|---|---|---|---|---|
| `efeito_com_resistencia` | spell/item/rune | Texto (spells.ts) | `teste_resistencia` (raiz) + resultados | spell/item, ≤2 resultados/≤2 filhos (ver §4) | — (legado sempre preservado) | Editável só para árvores NOVAS; legado nunca auto-convertido |
| `teste_colateral` | spell | Texto | — | — | — | Inalterado (somente leitura) |
| `promocao_margem` | talent | `getMarginPromotions` (real) | `modificar_margem` | talent (formato real) | assistida (contexto) | Editável, real |
| `protecao`/`ignorar_mit` | rune/property | Nenhum | `alterar_dano_recebido` | item (bucket `utilitario`) | sim | Editável só para item; spell bloqueado (schema fechado) |

---

## 2. Modelo da árvore

`src/lib/contentSchema/effectDraftTypes.ts` — `CamposTesteResistencia` (raiz) + `ResultadoTeste[]` (cada um com `id` estável, `ordem`, `faixa`, `textoResultado`, `efeitos: EfeitoFilho[]`).

**Profundidade limitada por CONSTRUÇÃO, não só validação**: `EfeitoFilho` é um union type que **exclui `teste_resistencia`** — o compilador rejeita qualquer tentativa de aninhar uma árvore dentro de um resultado (`tsc` já provou isso ao recusar um cast direto durante a implementação, exigindo o cast explícito `as ResultadoTeste["efeitos"]` só possível porque `tiposPermitidos={TIPOS_EFEITO_FILHO}` na UI garante que nunca se cria um filho `teste_resistencia`). **Zero ciclos possíveis** — não há como uma árvore referenciar a si mesma.

Faixas: reusa `MARGEM_CLASSIFICACOES` real (`falha_critica/falha/falha_limitada/sucesso_limitado/sucesso_padrao/sucesso_critico`) + `"manual"` (escape hatch para resolução fora dessas 6). Nunca inventei uma faixa nova.

**CD**: `{tipo:"fixa", valor}` (número validado, sem string) ou `{tipo:"derivada", origem:"vertente"}` — só uma origem derivada, a única determinística encontrada na auditoria. **Nunca há campo de fórmula livre na UI** — impossível a pessoa administradora digitar `"5 + nivel_vertente"` ou qualquer outra fórmula arbitrária (a prevenção é arquitetural, não uma checagem de texto).

## 3. Limites

- **Resultados por árvore**: no máximo 7 (um por faixa, incluindo "manual") — garantido estruturalmente pela UI (`faixasDisponiveis` esgota antes de permitir duplicata; `adicionar`/`duplicar` resultado ficam desabilitados quando não sobra faixa livre). Nenhuma faixa duplicada é possível de criar pela UI.
- **Efeitos filhos por resultado**: sem teto rígido na EDIÇÃO (uma árvore pode ser esboçada com mecânica mais rica que o formato legado atual comporta) — mas só até 2 (1 dano + 1 outro) são **publicáveis** para spell/item nesta etapa (ver §4); acima disso, a publicação é bloqueada com mensagem explícita, nunca silenciosamente truncada.
- **Textos**: `textoResultado` e `contextoTexto` (modificar margem) limitados a 500/300 caracteres na UI (`maxLength`).
- **Profundidade**: 2 níveis (raiz teste/resistência → efeitos filhos), garantida pelo próprio sistema de tipos — documentado em §2.

## 4. Serialização (legado) — o que é representável, e por quê

Auditoria direta dos 3 schemas oficiais (`schema_magias_v1_3.json`, `schema_equipamentos_v1_2.json`, `schema_talentos_v1_3.json`) definiu exatamente o que cada content_type consegue representar:

- **Magia**: `resistencia` exige `cd_formula` (string — CD fixa vira o número como string; CD derivada vira sempre `"6 + nivel_vertente"`, nunca `"5 +"`) e aceita `pericias[]` opcional. Como `payload_automacao.efeitos` é uma lista PLANA (sem aninhamento pai/filho no schema), a árvore serializa como o efeito-raiz `efeito_com_resistencia` **mais** até 1 efeito de dano + 1 outro efeito como *siblings* — reproduzindo a mesma convenção real já usada em `energetica_bola_de_fogo` (dano com `sucesso:"metade"` quando existe também um resultado de sucesso). Árvores maiores (mais de 2 resultados, faixas fora de sucesso/falha, mais de 1 dano ou de 1 outro efeito por resultado, filhos `modificar_margem`/`alterar_dano_recebido`/`modificar_teste`/`alterar_recurso` dentro de um resultado) são **bloqueadas** com mensagem explícita — nunca truncadas silenciosamente.
- **Item**: mesma estratégia; `resistencia` exige `pericia` + `cd` **literais** (não há campo de fórmula) — **CD derivada é sempre bloqueada para item** (não há como resolver "nível de vertente" num contrato sem contexto de personagem).
- **Talento**: o schema não tem uma propriedade `resistencia`/`resultados` no objeto de efeito — `teste_resistencia` é **sempre bloqueado** para talento (mensagem explícita, nunca uma tentativa parcial).
- **`modificar_margem`**: só representável em talento (formato real `promocao_margem`/família `margem`, lido por `getMarginPromotions`); bloqueado para magia/item (sem leitor equivalente).
- **`alterar_dano_recebido`**: só representável em item (o enum de `tipo` do schema de equipamentos não tem uma categoria dedicada — usei `"utilitario"`, um valor genérico já existente no enum real, com os campos específicos como chaves extras permitidas pelo `additionalProperties: true` do efeito de item); bloqueado para magia (schema fechado, sem categoria genérica) e para talento (sem chave livre óbvia sem risco de colidir com outro conceito real).

Todos os bloqueios acima produzem mensagens de erro claras (`validarEfeitoParaPublicacao`) — a publicação nunca "finge suporte".

## 5. Compatibilidade com legado

`efeito_com_resistencia`/`teste_colateral`/efeitos de margem/proteção continuam **preservados e somente leitura** quando vêm de conteúdo legado — a auditoria confirmou pelo menos 3 estruturas reais incompatíveis entre si (spell: siblings soltos; rune: `condicao_falha` embutida; property: `margem_minima`), então **nenhuma conversão automática** foi implementada (risco real de interpretar errado). O relatório de conversão (`legacyConversion.ts`) agora explica isso explicitamente: *"pode ser reconstruído manualmente como um novo efeito Teste ou resistência no Construtor — a conversão automática não é oferecida"*. Conversão só acontece quando a pessoa administradora constrói a árvore do zero no rascunho — nunca em massa.

## 6. Resolvedor genérico e integração operacional

`src/lib/character/testResistanceTreeExecutor.ts::prepararResolucaoArvoreTesteResistencia` — reutilizável, não exclusivo de nenhuma magia/talento/item. Segue os 13 passos pedidos: valida a árvore, valida ator/alvo (conforme `quemTesta`), identifica o ramo pela faixa **informada pela mesa** (nunca resolvido sozinho — teatro da mente preservado), prepara todos os efeitos filhos, e só então retorna um preview + o personagem-alvo mutado **em memória** (nunca persiste sozinho). Para `aplicar_condicao`, reusa `executarAplicarCondicao` (Etapa 4, já validado) — se falhar, aborta a preparação inteira sem aplicar nada (sem estado parcial). Para dano/cura/remover_condicao/modificar_margem/alterar_dano_recebido, prepara uma descrição textual (mesmo padrão que magias/itens já usam hoje — rolar/descrever, aplicar manualmente).

**Limitação honesta**: este resolvedor **não tem um botão ao vivo em `/dev/table`** nesta sessão — é um módulo real, testado (ver §7), pronto para ser conectado, mas a integração de UI na mesa do narrador não foi construída por restrição de tempo/risco (evitar mexer num arquivo de ~3900 linhas sem tempo para revisão cuidadosa). **Não afirmo automação operacional completa** por causa disso.

## 7. Verificações

### 7.1 Executadas e aprovadas

- `npx tsc --noEmit` / `npm run build` — sem erros.
- **Classificação/serialização/validação de schema** (`scripts/dev/validate-composite-effects.mjs`, código real compilado por `tsc`, `node` puro, sem `tsx`): 14 casos — magia com árvore completa (CD derivada, sucesso metade + falha completo + condição, válida contra `schema_magias_v1_3`), legado antigo preservado ao lado da árvore nova, bloqueio de árvore excedente/`modificar_margem` em magia/`alterar_dano_recebido` em magia/`teste_resistencia` em talento/CD derivada em item, `modificar_margem` em talento serializando exatamente como `promocao_margem`/família `margem` (formato real de `getMarginPromotions`), `alterar_dano_recebido` em item válido contra `schema_equipamentos_v1_2`. **Todos os 14 passaram.**
- **Núcleo transacional por SQL direto** (rollback forçado, zero resíduo): publica magia com árvore completa (raiz + dano + condição) → payload público sem `_editor` e sem `"5 + nivel_vertente"` → `content_editor_metadata` preserva a árvore inteira com IDs estáveis de resultados e efeitos filhos, recuperável para nova edição.
- Diff estruturado (`publishDiff.ts`) corrigido: a versão anterior comparava por `_editor.id`, que não existe mais desde a correção pós-Etapa 5 — ficava permanentemente incapaz de detectar remoções/alterações (bug real, não introduzido por esta etapa, mas só notado e corrigido agora). Agora compara por assinatura estrutural (multiset), detectando adicionados/removidos corretamente (uma alteração aparece como remoção+adição, honesto dado que não há id estável no payload público).

### 7.2 Não executadas / não verificadas ao vivo

- **Browser check** (`scripts/dev/check-admin-composite-effects.ts`) — bloqueado pelo esbuild, não executado, não alegado como aprovado.
- **Resolvedor conectado à mesa do narrador** — não exercido ao vivo (sem UI de gatilho nesta sessão, ver §6).
- O caminho `aplicar_condicao` dentro do resolvedor reusa `executarAplicarCondicao` (já verificado na Etapa 4) — não foi re-executado nesta sessão (sem ambiente para rodar "use server" fora do Next.js).

---

## 8. Segurança

Toda validação roda no servidor (a UI só espelha `diagnosticarEfeitoEditavel`/`validarEfeitoParaPublicacao`, nunca decide sozinha); nenhuma fórmula arbitrária é aceita (sem campo de texto livre para CD); profundidade/ciclo impossíveis por tipo; metadata editorial continua só em `content_editor_metadata` (nunca no payload público); RLS de personagens/campanhas/mesa não tocada.

## 9. Limitações reais

- Conversão automática de `efeito_com_resistencia` legado para a nova árvore **não existe** (decisão deliberada — real estrutura varia demais). Sempre preservado, sempre reconstruível manualmente.
- `alterar_dano_recebido` nunca é automático (sem executor real no motor hoje) — sempre `lembrete`.
- `modificar_margem` só é automatizável (via `getMarginPromotions`) em talento.
- `teste_resistencia` só é publicável para magia/item, e só até 2 resultados (sucesso/falha) com no máximo 1 dano + 1 outro efeito cada — árvores mais ricas ficam bloqueadas (mensagem clara) ou só no rascunho.
- Resolvedor genérico real, mas sem gatilho de UI ao vivo nesta sessão.
- Dois pipelines de dano/MIT/PD do motor continuam não-unificados (achado da auditoria, fora do escopo — nenhum refactor de combate foi feito).
- Aceite de browser pendente (mesma limitação estrutural desde a Etapa 4).
- Etapas 4/5/6 permanecem com seus status registrados — não alterados retroativamente.

---

## 10. Não incluído nesta etapa

Etapa 8 não iniciada. Nenhuma migração em massa de conteúdo legado. Nenhuma refatoração do motor de combate.

> **Nota de referência (Etapa 8, sem alterar o status acima)**: a Etapa 8
> foi executada depois desta e adicionou `efeito_temporario`/
> `acao_reacao_adicional`/`usoLimitado` ao mesmo catálogo `EfeitoFilho`
> desta etapa — ver `docs/CHECKPOINT_ETAPA8_TEMPORARIOS_CADENCIAS_CONSUMOS.md`.
> O status "Implementação concluída — aceite de browser pendente" acima
> permanece exatamente como registrado nesta etapa.
