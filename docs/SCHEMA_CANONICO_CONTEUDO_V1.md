# PROPOSTA DE SCHEMA CANÔNICO DE CONTEÚDO — V1

**Projeto:** Ruptura VTT
**Data:** 14 de julho de 2026
**Status:** Implementado parcialmente na Etapa 1 (`src/lib/contentSchema/`) — ver `docs/CHECKPOINT_ETAPA1_SCHEMA_CANONICO.md` para o que foi construído de fato e os ajustes descritos em "Ajustes feitos durante a Etapa 1" ao final deste documento.
**Base:** achados de `docs/AUDITORIA_EDITOR_UNIVERSAL_CONTEUDO.md` e requisitos de `docs/ADITIVO_PRD_EDITOR_UNIVERSAL_CONTEUDO.md` §8–13.

Este documento propõe a estrutura canônica para o editor. Ele **não fixa nomes finais de tabela/coluna TypeScript** — define o formato conceitual, como pedido no aditivo §13.1, deixando a implementação concreta para a Etapa 1.

---

## 1. Princípio geral

O schema atual (`content_documents.payload`) já é adequado como **envelope de persistência**. A proposta não substitui `content_documents` — adiciona uma **camada de definição de tipos e efeitos** (metadados que descrevem o que cada `content_type` e cada `tipo` de efeito significa) e um **envelope canônico versionado** dentro do payload, coexistindo com o payload legado até a migração completa (Etapa 6 do aditivo).

Dois artefatos novos, complementares ao banco:

1. **Catálogo de tipos de conteúdo** (`content_type` → seções aplicáveis, campos comuns, campos específicos) — descrito na §2.
2. **Catálogo de efeitos** (`tipo` de efeito → campos, modo de automação, executor conhecido) — descrito na §3.

Ambos podem viver como dados versionados no próprio repositório (ex.: TypeScript com validação Zod, ou JSON Schema), consultados tanto pelo editor (para montar formulário) quanto pelo motor (para diagnosticar automação). Isso evita hardcode duplicado entre UI e engine.

---

## 2. Matriz tipo de conteúdo × seção do editor

Baseada nos perfis do aditivo §11 e nos campos reais encontrados na auditoria. `✓` = seção aplicável e com dado real hoje; `~` = seção aplicável mas hoje sem representação própria no schema atual (precisa de novo campo ou decomposição); `—` = não aplicável.

| Seção do editor | Perícia | Magia | Talento | Item/Equip. | Arma (item) | Condição | Runa | Escalpo | Propriedade | Ação | Regra/Master table |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Identificação | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ |
| Classificação | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ |
| Texto/apresentação | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Requisitos | — | ~ | ✓ | ~ | ~ | — | ✓ | ✓ | — | ~ | — |
| Ativação | — | ✓ | ✓ | ✓ | ✓ | — | ~ | ~ | ~ | ✓ | — |
| Alvo/alcance/área | — | ✓ | ~ | ~ | ✓ | — | — | — | ✓ | ~ | — |
| Duração | — | ✓ | ~ | ~ | — | ✓ | ~ | ~ | — | — | — |
| Usos/cadência | — | ~ | ✓ | ~ | ~ | — | — | — | — | — | — |
| Efeitos | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Relações | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ~ |
| Mercado/aquisição | — | — | — | ✓ | ✓ | — | ✓ | ✓ | — | — | — |
| Equipamento/instância | — | — | — | ✓ | ✓ | — | ~ | ✓ | — | — | — |

Notas de leitura da matriz:

- **Perícia** hoje não é registro próprio (vive dentro de `character_rule`) — colunas marcadas `~` indicam o que existiria *se* virasse content_type próprio (ver §4).
- **Regra/master table** hoje é um blob (`master_tables[]` dentro do singleton `master_table`) — precisa de decisão de produto sobre decompor em registros individuais antes do editor oferecer "criar/editar uma tabela mestra" isoladamente.
- **Talento** já tem `requisitos`, `usos`/cadência (via chave de uso, ex. `berserker_ultimo_folego:cena`) e efeitos ricos — é o tipo mais "pronto" para o editor depois de magia/item.
- **Runa/Escalpo/Propriedade** não têm conceito de "ativação"/"duração" tão explícito quanto magia/talento — geralmente é `sempre ativo enquanto instalado`, então a seção de Ativação, quando existir, deve ser simplificada (toggle simples), não o formulário completo de magia.

---

## 3. Matriz de efeitos × executor

Cobre os `tipo` mais frequentes (≥ 4 ocorrências reais, ver auditoria §3.1) mais os 6 do MVP do aditivo (§Etapa 4). "Modo de automação" segue a classificação do aditivo §5.3/§9.4.

| Efeito (tipo canônico proposto) | Ocorre em | Executor hoje | Modo de automação real hoje | Ação necessária |
|---|---|---|---|---|
| `dano` | magia, item, condição (`dano_fim_de_rodada`), runa (`dano_modificador`) | `spells.ts` (rola), `endRoundConditions.ts` (rola e aplica), `itemUse.ts` (rola, não aplica) | Parcial: automático só em condição de fim de rodada; assistido/lembrete no resto | Unificar aplicação de dano rolado via `attack.ts`/pipeline único |
| `cura` | item, magia | `itemUse.ts` (aplica PV/PE de verdade) | **Automático** | Nenhuma — já funciona, usar como caso de referência do MVP |
| `aplicar_condicao` | magia, runa, condição, propriedade | **Etapa 4**: `conditionEffectExecutor.ts` (`executarAplicarCondicao`), conectado ao fluxo manual de `/dev/table` | **Assistido** (era Lembrete — atualizado na Etapa 4, ver `docs/CHECKPOINT_ETAPA4_CONSTRUTOR_EFEITOS_MVP.md` §5) | Concluído para o fluxo manual; falta cobrir magia/item/runa automaticamente (exige resolver alvo/distância) |
| `remover_condicao` | item, condição, ação | `itemUse.ts`, `actionConsole.ts` | **Automático** quando a condição-alvo está ativa | Nenhuma — já funciona |
| `modificar_teste` / `modificador` | talento, condição, escalpo, runa | `activeEffects.ts`, `talents.ts`, `technicalEffects.ts` | **Automático** quando bônus numérico simples + `alvo_tags`; lembrete quando há `quando`/`restrito_a` | Consolidar em um único executor de modificador, hoje espalhado em 3 módulos quase idênticos |
| `alterar_recurso` (`recurso`) | talento, condição, propriedade | parcial (`reduzir_pa` em `endRoundConditions.ts`) | Parcial | Generalizar para PV/PE/Mana/Integridade/RAM/Sobrecarga/cargas/munição |
| `efeito_com_resistencia` (teste/resistência) | magia (72 ocorrências — o mais comum de todos), item, runa | `spells.ts` (só gera texto de CD, não resolve alvo) | **Assistido/lembrete** | Prioridade 2 — é o efeito mais comum do catálogo e ainda não resolve automaticamente |
| `dano_em_area` | item (granadas/explosivos) | `itemUse.ts` (rola, não aplica) | Assistido | Precisa de seleção de múltiplos alvos (fora do MVP, ver plano) |
| `promocao_margem` | talento | nenhum (fora de escopo documentado) | **Lembrete** | Fora do MVP — aditivo já lista margem como catálogo futuro (§10.10) |
| `penalidade_pericia` | item | nenhum | **Lembrete** | Candidato a generalizar como caso especial de `modificar_teste` (penalidade = modificador negativo) |
| `ataque_adicional`, `economia_pa`, `autorreparo`, `revelar`, `reacao`, `narrativo`, `protecao` (runas/escalpos) | runa, escalpo | nenhum | **Lembrete** | Fora do MVP — ver `docs/RELATORIO_AUTOMACAO_RUNAS.md` para classificação já feita |
| efeitos específicos de talento (companheiro/drone/robô/trama) | talento | `talentEngine.ts` (bespoke, não genérico) | Automático, mas **não reutilizável** — cada talento tem função própria | Não migrar agora; documentar como "automação legada aceita", fora do catálogo genérico até haver justificativa de reuso (2+ conteúdos precisando do mesmo efeito) |

**Regra de evolução aplicada:** seguindo o aditivo §20, nenhum `tipo` novo deve ser criado para servir um único conteúdo. A tabela acima já reflete isso — os efeitos de talento bespoke em `talentEngine.ts` ficam explicitamente fora do catálogo genérico até haver 2+ conteúdos precisando da mesma mecânica (ex.: "companheiro" hoje só serve drone/robô, mas se uma magia futura precisar de pet, aí sim vira efeito reutilizável).

---

## 4. Envelope canônico proposto

### 4.1 Estrutura conceitual (não nomes finais de coluna)

```
ConteudoCanonico {
  schema_version: string          // ex.: "content.v1"
  content_type: enum               // igual ao enum atual, + extensões futuras
  identificacao: {
    slug: string (estável, imutável após publicação)
    nome: string
    categoria?: string
    subtipo?: string
    descricao_curta?: string
    descricao_longa?: string
    tags: string[]
    origem: { pack_id, pack_version }
  }
  classificacao: { ... campos condicionais por content_type ... }
  ativacao?: { modo, custos: {pa, mana, reacao, sobrecarga, ram, carga, municao, item}, sustentacao? }
  alvo?: { tipo, quantidade, alcance: {valor, unidade}, area?, confirmacoes: {distancia, adjacencia, linha_de_visao} }
  duracao?: { tipo, valor?, unidade?, gatilho_expiracao?, encerramento_manual: bool }
  usos?: { possui_limite, quantidade, cadencia, escopo, chave_uso }
  requisitos: Requisito[]
  efeitos: Efeito[]
  relacoes: Referencia[]
  mercado?: { preco, moeda, raridade, disponibilidade, estoque, ... }
  equipamento?: { slots, dano_base, mit_base, pd_base, ... }  // só para item/arma/armadura
  status: 'rascunho' | 'publicado' | 'arquivado'
  versao: semver
  changelog_ref: string
  campos_desconhecidos: Record<caminho, valor>   // preservação — nunca some
}
```

### 4.2 Efeito canônico

```
Efeito {
  id: string (interno, estável por edição)
  tipo: enum do catálogo de efeitos       // única fonte de verdade de vocabulário
  nome_opcional?: string
  ordem: number
  habilitado: boolean
  gatilho: enum (catálogo de gatilhos, aditivo §9.2)
  alvo?: referência de alvo
  condicoes?: Condicao[]                  // combinação "todas" no MVP (aditivo §9.3)
  modo_automacao: 'automatico' | 'assistido' | 'lembrete' | 'narrativo_rastreado'  // derivado do executor conhecido, não editável livremente
  duracao?: ...
  usos_cadencia?: ...
  payload_especifico: Record<string, unknown>  // campos próprios do tipo (dado, formula, recurso, condicao_alvo, etc.)
  texto_log?: string
  texto_lembrete?: string
}
```

**Decisão de design:** `modo_automacao` não é um campo que a pessoa administradora escolhe livremente — é **derivado automaticamente** a partir de: (a) o `tipo` do efeito e (b) se existe executor registrado para ele no catálogo. Isso impede o erro que o aditivo quer prevenir em §14.3 ("automação marcada como automática sem executor disponível"). O catálogo de efeitos (não o registro de conteúdo) é quem declara "este tipo tem executor X" — a UI só reflete isso.

### 4.3 Referência (relação entre conteúdos)

```
Referencia {
  tipo: content_type alvo
  slug: string
  papel?: string   // ex.: "condicao_aplicada", "conteudo_pai", "conteudo_requerido"
}
```

Padronizando o achado da auditoria (referências hoje são strings soltas inconsistentes) numa forma única, usada tanto para novo conteúdo quanto para os adaptadores de leitura de conteúdo legado.

---

## 5. Estratégia de compatibilidade com conteúdo legado

Segue o fluxo já pedido no aditivo §13.2, aplicado aos dados reais:

1. **Adaptador de leitura por content_type** (não um adaptador genérico) — dado o formato heterogêneo real (cada tipo tem seu próprio vocabulário de `estatisticas`/`efeitos`), cada `content_type` precisa de um adaptador próprio que projeta o payload legado no envelope canônico da §4.
2. **Nenhuma conversão automática silenciosa.** Campos ambíguos identificados na auditoria (duração em 4 formatos, resistência em 2 formatos, bônus como `valor` vs `bonus`) exigem confirmação explícita ao salvar — não conversão automática.
3. **Classificação por content_type**, com base nos achados reais:
   - **Conversão direta** (mapeamento 1:1 sem ambiguidade): identificação, classificação, texto — em todos os tipos.
   - **Conversão com confirmação**: `duracao`, `resistencia`, referências soltas (decidir se viram `Referencia` tipada).
   - **Somente leitura no MVP**: `estatisticas` livre de itens (schema não tem sub-propriedades — não dá para gerar formulário confiável sem antes fixar um contrato por categoria de item), efeitos de runas com `additionalProperties: true`.
   - **Incompatível até novo tipo de efeito**: qualquer `tipo` sem executor (ver matriz §3) permanece editável como "lembrete" (texto), nunca fingindo automação.
   - **Inválido**: nenhum caso identificado hoje nos dados reais (todos os 12 arquivos passam na validação estrutural atual) — mas o editor deve prever esse estado para importações futuras.
4. **Campos desconhecidos**: qualquer chave do payload original que não mapear para o envelope canônico entra em `campos_desconhecidos` (caminho + valor), exibida só no modo avançado/diagnóstico, nunca descartada, nunca editável em texto livre no fluxo principal (aditivo §13.3).
5. **`schema_version` por registro**: novos registros nascem com `schema_version = "content.v1"`. Registros legados continuam com o `versao`/`_schema` original do arquivo até serem salvos pelo editor, momento em que ganham `schema_version` novo — conversão é lazy, nunca em lote, evitando o risco de mutar conteúdo publicado fora de uma ação editorial explícita (regra do checkpoint: nenhum conteúdo publicado é alterado nesta etapa nem nas seguintes sem ação humana).

---

## 6. Estratégia de preservação de campos desconhecidos

- Nível de implementação: ao carregar um documento, o adaptador produz `{ canonico, campos_desconhecidos }` — nunca `{ canonico }` sozinho.
- `campos_desconhecidos` é uma lista de `{ caminho: string (ex.: "estatisticas.slots_runa_max"), valor: unknown, motivo: string }`.
- Publicar um registro com `campos_desconhecidos` não vazio deve exigir confirmação explícita (aditivo §5.5) — o editor mostra a lista, a pessoa administradora decide se aceita perder aquele campo (raramente) ou se o campo precisa virar um campo canônico novo (caminho recomendado).
- Reexportar sempre reinclui os campos desconhecidos originais dentro do payload salvo — o editor nunca precisa "adivinhar" onde reinserir, porque o payload final é `merge(canonico_serializado, campos_desconhecidos)`, com o canônico tendo prioridade em caso de colisão de caminho (o que só acontece se a pessoa editou aquele campo via UI).

---

## 7. Itens em aberto para decisão de produto (não resolvidos nesta etapa)

1. Perícia/atributo/vertente/especialização viram `content_type` próprio (nova migration) ou continuam como sub-editor dentro do singleton `character_rule`? Recomendação técnica (não decisão): virar `content_type` próprio, pois o aditivo trata perícia como conteúdo administrável de primeira classe (§1) — ver proposta de migration no plano de implementação.
2. `master_table` — decompor os 50 registros em documentos individuais ou manter singleton com editor de lista embutida? Recomendação: manter singleton no MVP (baixo uso de automação, alto custo de migration) e revisitar se o volume de edição justificar.
3. `estatisticas` livre de item — vale a pena fixar um sub-schema por `categoria` (arma/armadura/consumível/...) agora, ou deixar como "somente leitura" no MVP e resolver na Etapa 3? Recomendação: Etapa 3, junto com item/equipamento entrando no editor básico.

---

## 8. Ajustes feitos durante a Etapa 1 (implementação real)

A implementação em `src/lib/contentSchema/` seguiu esta proposta com os ajustes abaixo, todos motivados por decisões concretas de código:

1. **`modo_automacao` ganhou um quinto estado.** A proposta original (e o aditivo) descrevem 4 modos (automático/assistido/lembrete/narrativo rastreado). A implementação distingue **`lembrete`** (efeito já canonicalizado e triado, sem executor por decisão de produto documentada — ex.: `aplicar_condicao`) de **`sem_executor`** (o `tipo` legado nem chegou a ser canonicalizado nesta etapa — cai no efeito-catálogo `outro`). Isso evita que os ~140 tipos legados ainda não analisados sejam confundidos com decisões de design já tomadas. Ver `src/lib/contentSchema/types.ts` (`ModoAutomacao`).
2. **`condition` entrou no escopo de adapters da Etapa 1**, além de magia/talento/item. Foi necessário porque o caso obrigatório 4 (dano no fim da rodada) e o caso 5 (referência a "Atordoado" em falha de resistência) exigem que `condition` seja pelo menos legível como alvo de referência e como origem de `dano_fim_de_rodada`. O MVP do editor (Etapa 3/4) continua magia/talento/item — `condition` tem adapter, mas não faz parte do recorte de UI ainda.
3. **Efeito canônico `outro`** foi adicionado como balde de escape explícito (não estava nomeado assim na proposta original) — cobre qualquer `tipo`/`familia` legado sem alias registrado no catálogo, preservando o efeito bruto inteiro em `payloadEspecifico.tipoLegado` em vez de lançar erro ou descartar.
4. **Talento é adaptado por nível**, não pelo documento inteiro — `adaptTalentLevel(talentoSlug, talentoNome, nivelRaw)` — porque `payload_automacao` vive em `talento.niveis[i]`, não no talento como um todo. `adaptarNiveisDeTalento` no dispatcher itera os níveis.
5. **Referências (`Referencia`) usam `tipoConteudo` do enum `ContentTypeId` real do banco** (importado de `src/lib/content/types.ts`), não um enum próprio duplicado — evita duas fontes de verdade para "quais content_types existem".

## 9. Ajustes feitos durante a Etapa 6 (edição de conteúdo legado)

1. **`ClassificacaoLegado` (§5) passou de por-documento para por-campo/efeito.** A Etapa 1 já usava as 5 categorias descritas em §5.3, mas cada adapter devolvia uma única classificação para o `ResultadoAdaptacao` inteiro. A Etapa 6 (`src/lib/contentSchema/legacyConversion.ts`) adiciona uma camada de classificação POR campo (`duracao`, `resistencia`) e POR efeito, em cima do resultado que os adapters já produzem — sem duplicar o parsing. A classificação por documento continua existindo (`ResultadoAdaptacao.classificacaoLegado`, usada na lista administrativa) como um resumo grosseiro; a granular vive no relatório de conversão.
2. **`incompativel` ganhou um critério concreto para talento**: a `familia` do efeito (enum real do schema, `schema_talentos_v1_3.json`) sinaliza quando o efeito pertence a um SISTEMA futuro (`companheiro`, `trama`, `propagacao_efeito`, `meta_talento`) em vez de simplesmente "ainda não canonicalizado" (`somente_leitura`). Essa distinção não existia na Etapa 1 — foi adicionada porque o pedido desta etapa exige diferenciar as duas categorias, e o schema real já nomeia essas famílias.
3. **`DraftEnvelope` ganhou o campo opcional `origemLegado`** (`draftTypes.ts`) — registra adapter+versão, classificação, decisões confirmadas, campos somente leitura/desconhecidos, efeitos preservados, data e administrador responsável, só quando o rascunho nasceu de uma conversão de legado (sem `content_editor_metadata` prévia). Nenhuma migration — `content_drafts.payload` já é JSONB livre.
4. **Nenhum sub-schema de `estatisticas` por categoria de item foi criado** — a recomendação de §7 item 3 ("Etapa 3, junto com item entrando no editor básico") foi adiada de novo: `estatisticas` continua somente leitura por inteiro também na Etapa 6, por decisão explícita desta etapa (fora de escopo criar um sub-schema completo para arma/armadura/escudo/munição/consumível agora).

## 10. Ajustes feitos durante a Etapa 7 (teste, resistência e efeitos compostos)

1. **`EfeitoEditavel` (Etapa 4, §4.2 aqui) ganhou 3 novos membros**: `teste_resistencia` (composto — raiz + `resultados: ResultadoTeste[]`), `modificar_margem` e `alterar_dano_recebido` (`src/lib/contentSchema/effectDraftTypes.ts`). O catálogo de tipos (`teste_resistencia`) já existia desde a Etapa 1 como classificação somente-leitura (`efeito_com_resistencia` legado) — a Etapa 7 o promove a EDITÁVEL, mas só para árvores construídas do zero no Construtor; conteúdo legado com esse tipo continua sempre preservado (ver checkpoint §5).
2. **Novo union `EfeitoFilho`** — o subconjunto de `EfeitoEditavel` que pode viver dentro de um `ResultadoTeste`, excluindo `teste_resistencia` por construção (o compilador rejeita recursão; não é uma regra de validação em runtime). Profundidade da árvore = 2 níveis, sempre.
3. **Faixas de resultado reusam `MARGEM_CLASSIFICACOES`** (`src/lib/dice/types.ts`, motor real de rolagem) — `FAIXAS_RESULTADO_TESTE` em `effectDraftTypes.ts` é literalmente esse enum + `"manual"`. Nenhuma faixa nova foi inventada.
4. **CD sem campo de fórmula livre**: `CdTesteResistencia` só aceita `{tipo:"fixa", valor:number}` ou `{tipo:"derivada", origem:"vertente"}` — a prevenção contra a fórmula legada `"5 + nivel_vertente"` é arquitetural (não existe onde digitá-la), não uma checagem de string.
5. **`content_changelog.impact`** (jsonb já existente da Etapa 5) ganhou a chave opcional `origemLegado` sendo reaproveitada também para efeitos compostos — nenhuma migration nova nesta etapa.
6. **Bug real corrigido de passagem**: `publishDiff.ts::compararEfeitos` comparava efeitos por um campo `_editor.id` que deixou de existir desde a correção pós-Etapa 5 (`docs/CHECKPOINT_CORRECAO_METADATA_EDITOR_PUBLICACAO.md`) — o diff estava, desde então, incapaz de detectar remoções e sempre reportava alterações como adições. Reescrito para comparar por assinatura estrutural (multiset), sem depender de id (que não existe mais no payload público por design).

## 11. Ajustes feitos durante a Etapa 8 (efeitos temporários, cadências, usos e consumos)

1. **`EfeitoFilho`/`EfeitoEditavel` ganharam 2 novos membros**: `efeito_temporario` (contêiner com duração/pilhas/política de reaplicação — mesmo vocabulário de `TemporaryEffect`, `character/types.ts` — e até 4 filhos do tipo `modificar_teste`, reaproveitado sem duplicar) e `acao_reacao_adicional` (sempre `lembrete`, sem executor real). Ambos incluídos em `TIPOS_EFEITO_FILHO` (podem ser filhos de um resultado de teste/resistência — nenhum dos dois contém uma árvore aninhada, então a exclusão estrutural de recursão da Etapa 7 continua valendo).
2. **`CamposEfeitoComuns` ganhou o campo opcional `usoLimitado`** (`{ usosMax, cadencia, chaveUso, compartilhado }`) — reutilizável em QUALQUER tipo de efeito, não um tipo novo. `cadencia` usa o mesmo vocabulário de `TALENT_CADENCES` (`talentEngine.ts`, 11 valores reais). Só serializável/automatizado para talento (`usos`/`cadencia` na raiz do efeito, lidos de verdade por `getTalentUsageState`); bloqueado para magia/item.
3. **`CamposAlterarRecurso` (Etapa 4) ganhou 2 campos opcionais**: `momentoConsumo` e `refundEmCancelamento` — nenhum tipo/executor novo; reaproveita o mesmo campo `recurso`/`operacao` já usado por PA/Reação/Mana/Sobrecarga/RAM/PV/PE/Integridade.
4. **Consumo de carga/munição/flecha da Aljava deliberadamente NÃO ganhou tipo de efeito** — já totalmente representado por `inventory.ts::consumeItemCharge` e `ammunition.ts::consumeAttackAmmo` (reais, genéricos, fora do catálogo `payload_automacao.efeitos`). Criar um tipo `consumo` paralelo duplicaria esses executores sem necessidade real.
5. **Nenhuma migration nova** — `content_editor_metadata`/`content_documents` (Etapa 5/6) armazenam os novos campos como JSONB livre, sem alteração de coluna.

## 12. Ajustes feitos durante a Etapa 9 (inventário, equipamentos, runas e mercado)

1. **`DraftContentType` ganhou um 4º membro: `"rune"`** (`draftTypes.ts`). `rune` já era um `content_type` real no banco desde a migration 0001 — esta etapa só o promoveu a EDITÁVEL no Editor Universal, com `CamposRuna` (identificação, `raridade`, `preco`, `slotsPossiveis`, `restricaoSubtipo`, `requisitoPericia`, `efeitos`) e um adapter dedicado (`adapters/rune.ts`, substituindo o fallback genérico). `categoria`/`categoria_label`/`custo_integridade` são fixados na serialização (sempre "runa"/"Runa"/0), nunca editáveis — o próprio conteúdo real nunca usa runa para custar Integridade.
2. **`CamposItem` ganhou 8 campos novos de defaults de modelo**: `mitBase`, `pdBase`, `tipoProtecao`, `regioes`, `slotsRunaMax`, `cargasMax`, `municaoMax`, `municaoCompativelSlug` — todos lendo/escrevendo as MESMAS chaves reais de `estatisticas.*` já usadas por `character/inventory.ts::normalizeItemContent` (`mit_base`, `pd_max`, `tipo_protecao`, `regioes`, `slots_runa_max`, `cargas_max`, `municao_max`, `municao_compativel`). `regioes` é o único sem leitor real ainda (preservado/editável, documentado).
3. **`EfeitoFilho`/`EfeitoEditavel` ganharam 5 novos membros**: `modificar_instancia` (operação enumerada — nunca caminho JSON arbitrário — mapeada 1:1 a executores reais: `setItemMitAtual`/`setItemPdAtual`, já existentes, e `setItemCargaAtual`/`setItemMunicaoAtual`, 2 funções novas espelhando o mesmo padrão de clamp), `conceder_item`, `consumir_item`, `alterar_preco` (as operações `desconto_percentual`/`permitir_compra_fiada` serializam exatamente nos formatos reais já lidos por `talentEngine.ts::getGarimpoDeRuaAvailability`/`getCadernetaDeDividaAvailability`), `alterar_disponibilidade`. Todos incluídos em `TIPOS_EFEITO_FILHO` (nenhum contém árvore aninhada).
4. **`legacyLossValidation.ts` refinado**: a checagem "estatisticas de item nunca muda" (Etapa 6) agora permite divergência SÓ nas 8 chaves que a Etapa 9 passou a editar de verdade — evita que editar MIT-base num item convertido de legado seja incorretamente bloqueado como "perda de dado".
5. **Instalação/remoção/ativação de runa NÃO ganharam código novo** — `installRuneOnItem`/`removeRuneFromItem`/`toggleInstalledRune`/`getRuneCompatibility` (`inventory.ts`) já implementavam o fluxo completo e genérico; esta etapa só os documenta e os torna alcançáveis a partir de conteúdo de runa agora editável.
6. **Nenhuma migration nova** — `rune` já existia no enum `content_type`; nenhuma tabela de estoque foi criada (auditoria confirmou que não existe estado real de campanha para isso).
