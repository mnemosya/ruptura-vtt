# CHECKPOINT — ETAPA 1: CAMADA CANÔNICA DE DEFINIÇÕES E VALIDAÇÃO

**Projeto:** Ruptura VTT
**Data:** 14 de julho de 2026
**Checkpoint anterior:** `a6b54a7` — docs: map universal content editor architecture (Etapa 0)
**Escopo desta etapa:** biblioteca técnica de leitura/diagnóstico (`src/lib/contentSchema/`). Nenhuma interface administrativa, nenhuma migration, nenhuma alteração de conteúdo publicado.

---

## 1. Arquitetura implementada

Novo módulo `src/lib/contentSchema/`, independente do cliente Supabase (`src/lib/content/`) e dos executores de jogo (`src/lib/character/`) — consome tipos de `src/lib/content/types.ts` (o enum `ContentType` real) mas não depende de rede/banco. É uma camada pura de transformação: `payload legado (JSON) → ConteudoCanonico + diagnóstico`.

```
src/lib/contentSchema/
├── types.ts                    # envelope canônico: ConteudoCanonico, EfeitoCanonico, Referencia, ModoAutomacao...
├── contentTypeRegistry.ts      # registro dos 12 content_type: seções aplicáveis, status do adapter
├── effectTypeRegistry.ts       # catálogo de efeitos canônicos + aliases legados + executor conhecido
├── diagnostics.ts              # deriva modoAutomacao a partir do catálogo (nunca aceita valor livre)
├── validation.ts                # erros/avisos/infos sobre um ConteudoCanonico
├── unknownFields.ts             # coleta/preserva campos legados não mapeados
├── fields/
│   ├── duracao.ts               # normaliza as 4 representações legadas de duração
│   ├── resistencia.ts           # normaliza as 2 representações legadas de CD/resistência
│   └── referencia.ts            # normaliza strings soltas em Referencia
├── adapters/
│   ├── common.ts                 # construção de EfeitoCanonico + diagnóstico (compartilhado)
│   ├── spell.ts, item.ts, talent.ts, condition.ts   # um adapter por content_type real
│   ├── generic.ts                 # fallback para os 8 content_types ainda sem adapter dedicado
│   └── index.ts                   # único ponto de despacho por content_type
├── examples/
│   └── canonicalExamples.ts      # os 5 exemplos obrigatórios, permanentes
└── index.ts                      # ponto único de import para consumidores futuros
```

**Por que essa divisão:** cada arquivo tem uma responsabilidade — nenhum arquivo decide sozinho "o que é automático" (isso é só `effectTypeRegistry.ts` + `diagnostics.ts`), nenhum arquivo duplica a lista de content_types (só `contentTypeRegistry.ts`), e cada adapter só sabe transformar o formato de UM content_type, sem condicionais gigantes por tipo espalhadas pelo código. `adapters/common.ts` concentra a única lógica de "como virar um efeito canônico + diagnosticar automação", para que os 4 adapters não repliquem essa parte.

---

## 2. Tipos de conteúdo registrados

Os 12 `content_type` do enum real (`supabase/migrations/0001_content_library.sql`) estão todos no `CONTENT_TYPE_REGISTRY`, com seções de editor aplicáveis (baseadas na matriz de `docs/SCHEMA_CANONICO_CONTEUDO_V1.md` §2) e status do adapter:

| content_type | statusAdapter | Observação |
|---|---|---|
| `spell` | implementado | |
| `talent` | implementado | Adapta por nível (`niveis[i]`), não pelo talento inteiro |
| `item` | implementado | `estatisticas` tratado como somente leitura (schema legado livre) |
| `condition` | implementado | Adicionado ao escopo por exigência dos casos obrigatórios 4/5 |
| `rune`, `escalpo`, `property`, `combat_action`, `character_rule`, `combat_field`, `combat_flow`, `master_table` | planejado | Usam o adapter genérico (`adapters/generic.ts`) — nunca quebram, preservam o payload inteiro como campo desconhecido |

Nenhum content_type quebra o pipeline: os 8 ainda não adaptados semanticamente passam pelo fallback genérico, que sempre produz um `ConteudoCanonico` mínimo válido + o payload inteiro preservado em `camposDesconhecidos`.

---

## 3. Tipos de efeito registrados (catálogo inicial)

7 efeitos canônicos, cobrindo os 6 do MVP (aditivo §Etapa 4) + `teste_resistencia` (necessário para o caso obrigatório 5), mais o balde de escape `outro`:

| Efeito canônico | Aliases legados reconhecidos | Modo de automação (derivado) |
|---|---|---|
| `dano` | spell.dano, item.dano/dano_em_area, condition.dano_fim_de_rodada | assistido |
| `cura` | item.cura, spell.cura | **automatico** |
| `aplicar_condicao` | spell/item/rune.aplicar_condicao, property.resistencia_critica_aplica_condicao | lembrete |
| `remover_condicao` | item.remover_condicao, condition.remover_ao_recuperar_pv, combat_action.remover_condicao(s) | **automatico** |
| `modificar_teste` | talent/rune/escalpo.modificador, condition.modificador/modificador_recebido | automatico (parcial) |
| `alterar_recurso` | talent.recurso, condition.reduzir_pa, spell.recurso/recurso_temporario, item.recurso | assistido (parcial) |
| `teste_resistencia` | spell/item/rune.efeito_com_resistencia | assistido |
| `outro` | (nenhum alias — captura os ~140 tipos legados restantes) | **sem_executor** |

Cada entrada carrega `camposEspecificos` (para o formulário futuro), `executor.modulo` (onde no motor real isso é processado hoje, quando existe) e `executor.observacao` (o porquê do modo de automação) — tudo em um único lugar (`effectTypeRegistry.ts`), consultado por `diagnostics.ts` e `validation.ts`, nunca duplicado.

---

## 4. Compatibilidade com legados

- **Nenhum arquivo `db_*.json` foi lido para escrita nem alterado.** Os adapters são funções puras `(raw) => ResultadoAdaptacao`; quem chama decide de onde vem o `raw` (arquivo, `content_documents`, fixture).
- **Todos os 4 adapters foram testados contra registros REAIS** (não só fixtures sintéticas) — `energetica_bola_de_fogo` (spell), `ansiolitico` (item), `queimando` (condition) — via `scripts/test-canonical-content-schema.ts`, provando que o parsing funciona no conteúdo publicado de verdade, sem exceções e sem descartar dados.
- **Classificação de legado** (`ClassificacaoLegado`) é atribuída por adapter conforme a proposta do schema canônico: `spell` → `conversao_direta` (schema já é o mais tipado); `item`/`talent`/`condition` → `conversao_com_confirmacao` (têm campos ambíguos ou não mapeados: `estatisticas` livre, `familia` de talento, `remove_por`/`acoes_habilitadas` de condição); content_types sem adapter dedicado → `somente_leitura`.

---

## 5. Preservação de campos desconhecidos

`unknownFields.ts` oferece duas funções:
- `coletarCamposDesconhecidos(raw, chavesMapeadas, prefixo)` — diff simples entre as chaves do objeto bruto e as chaves que o adapter efetivamente mapeou; cada sobra vira `{ caminho, valor, motivo }`.
- `marcarCampoSomenteLeitura(caminho, valor, motivo)` — para campos que o adapter decide conscientemente NÃO interpretar ainda (ex.: `item.estatisticas` inteiro).

Prova real (via `scripts/test-canonical-content-schema.ts`):
- `energetica_bola_de_fogo` (spell): **0 campos desconhecidos** — o schema de magia já é totalmente mapeado.
- `ansiolitico` (item): `estatisticas` preservado inteiro como somente leitura.
- `queimando` (condition): `acoes_habilitadas` preservado (ainda sem efeito canônico próprio).

Nenhum adapter descarta uma chave silenciosamente — o que não é mapeado sempre aparece em `camposDesconhecidos`, nunca em um `console.warn` perdido nem em um `delete`.

---

## 6. Diagnóstico de automação

Regra central desta etapa, imposta em dois lugares independentes (defesa em profundidade):
1. `adapters/common.ts::construirEfeitoCanonico` **sempre** deriva `modoAutomacao` chamando `diagnosticarEfeito(tipoCanonico)` — nenhum adapter escreve `modoAutomacao` manualmente.
2. `validation.ts::validarConteudo` **reconfirma** que `efeito.modoAutomacao` bate com o que o catálogo determina para aquele `tipo`, e gera erro bloqueante se divergir (`assertModoAutomacaoConsistente` em `diagnostics.ts` está disponível para checagem programática adicional, ex.: antes de persistir).

Isso implementa literalmente a regra desta etapa: **"não permitir que um payload declare automação completa quando não existe executor compatível"** — não é uma convenção de estilo, é impossível de violar sem passar por `EFFECT_TYPE_REGISTRY` primeiro.

`diagnosticarDocumento(doc)` soma, por documento, quantos efeitos caem em cada um dos 5 modos — insumo direto do "diagnóstico técnico" e do indicador de grau de automação do aditivo §5.3/§15.2.

---

## 7. Resultado dos 5 casos obrigatórios

Todos adaptados, validados (`validarConteudo` → `valido: true`) e com diagnóstico de automação coerente — ver `scripts/test-canonical-content-schema.ts` para a prova executável:

| # | Caso | Efeito canônico gerado | Modo de automação | Observação |
|---|---|---|---|---|
| 1 | Magia 1d8 de fogo | `dano` (dado="1d8", tipoDano="energetico", subtipoDano="igneo") | assistido | Rola, aplicação ao alvo ainda depende de fluxo manual (auditoria §4) |
| 2 | Item cura 2d6 PV | `cura` (dado="2d6", recurso="pv") | **automatico** | Executor real já existe (`itemUse.ts`) |
| 3 | Talento +1 Luta / 1 rodada | `modificar_teste` (valor=1, alvoTags=["luta"], duracao.tipo="rodadas") | **automatico** | Duração normalizada a partir da string legada `"1 rodada"` |
| 4 | Condição 1d4 fim de rodada | `dano` (dado="1d4", tipoDano="acido", gatilho="fim_de_rodada") | assistido | Mesmo efeito canônico do caso 1 — unifica "dano" entre magia e condição |
| 5 | Magia com resistência → Atordoado em falha | `teste_resistencia` (cdFormula="5 + nivel_vertente") + `aplicar_condicao` (condicao→"atordoado", referência registrada) | assistido / lembrete | `aplicar_condicao` aparece como lembrete — sem executor genérico ainda, conforme regra desta etapa |

---

## 8. Limitações restantes (deliberadas, não pendências esquecidas)

- **Só 4 de 12 content_types têm adapter semântico** (spell, talent, item, condition) — os outros 8 usam o fallback genérico até serem priorizados (nenhum deles está no MVP do aditivo).
- **`aplicar_condicao` continua sem executor genérico** — por decisão explícita desta etapa ("não implementar em massa os executores ausentes"). O schema já o representa e diagnostica corretamente como `lembrete`; o executor fica para a Etapa 4.
- **`estatisticas` de item permanece somente leitura** — decisão já registrada no schema canônico §7.3, não resolvida aqui.
- **Perícias, atributos, vertentes/especializações e tabelas mestras continuam soterrados em singletons** — não viraram content_type próprio (fora do escopo desta etapa; ver auditoria §2.1 e schema canônico §7.1).
- **Nenhuma integração com `content_documents`/Supabase** — os adapters recebem `Record<string, unknown>` puro; conectar a `getContentDocument()`/`listSpells()` etc. é trabalho de Etapa 2 (ou de quem for consumir esta camada primeiro).
- **`remove_por`/`acoes_habilitadas` de condição** e o `requisitos[]` de item/talento além de `talento_nivel_adquirido` ainda não têm representação canônica própria — ficam como campo desconhecido preservado.
- **Catálogo de efeitos cobre 7 tipos canônicos de ~150 valores legados reais** — os demais caem em `outro`, preservados mas não diagnosticados individualmente; expandir esse catálogo é trabalho incremental das Etapas 7–10.

---

## 9. Verificação local

`scripts/test-canonical-content-schema.ts` (novo, rodável via `npm run test:canonical-schema`) — sem Supabase, sem rede:
1. Roda os 5 exemplos obrigatórios e valida cada um (`validarConteudo`).
2. Faz asserções específicas de payload por caso (dado/recurso/duração/gatilho/referência).
3. Faz round-trip com 3 registros REAIS de `content/db_*.json` (não fixtures), provando compatibilidade com conteúdo publicado de verdade.

Não é uma bateria extensa de testes automatizados — é uma verificação única, no mesmo espírito dos demais `scripts/test-*.ts` já existentes no repositório.

---

## 10. Build e TypeScript

- `npx tsc --noEmit` — sem erros.
- `npm run build` — sucesso (Next.js 16.2.9 / Turbopack, TypeScript incluído no build).
- `next-env.d.ts` não foi tocado.
- Nenhum arquivo em `src/lib/content/` (cliente Supabase existente), `src/lib/character/` (executores existentes) ou `supabase/migrations/` foi alterado — a nova camada é aditiva.

---

## 11. Próximos passos (não iniciados nesta etapa)

Conforme `docs/PLANO_IMPLEMENTACAO_EDITOR_UNIVERSAL.md` §2, o próximo passo natural é a **Etapa 2 — Lista administrativa e inspeção**, que depende de criar a primeira camada de autorização/admin (hoje inexistente — achado da auditoria §9) antes de qualquer escrita. Esta etapa (1) não inicia isso; apenas entrega a base de leitura/diagnóstico que a Etapa 2 vai expor em uma tela read-only.
