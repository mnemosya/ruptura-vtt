# AUDITORIA — EDITOR UNIVERSAL DA BIBLIOTECA (ETAPA 0)

**Projeto:** Ruptura VTT
**Data:** 14 de julho de 2026
**Documento-base:** `docs/ADITIVO_PRD_EDITOR_UNIVERSAL_CONTEUDO.md`
**Status:** Auditoria — nenhuma migration aplicada, nenhum conteúdo alterado.

Este documento responde, com dados reais do repositório, às perguntas da Etapa 0 do aditivo. Ele não propõe schema nem plano — isso está em `docs/SCHEMA_CANONICO_CONTEUDO_V1.md` e `docs/PLANO_IMPLEMENTACAO_EDITOR_UNIVERSAL.md`.

---

## 1. Arquitetura atual da Biblioteca

A Biblioteca é **JSONB-first** (migration `supabase/migrations/0001_content_library.sql`):

- `content_packs` — um registro por pacote (hoje só `ruptura-core`), manifesto completo em `manifest` (jsonb).
- `content_documents` — um registro por item de conteúdo. `id = "<content_type>:<slug>"`. `payload` (jsonb) é a fonte de verdade; `nome/categoria/subtipo/status/version` são projeções escalares só para índice/filtro.
- `content_changelog` — trilha de auditoria (`created`/`updated`/`deleted`, `payload_before`/`payload_after`), gravada apenas quando o payload muda de fato.

Enum `content_type` (12 valores): `master_table, character_rule, combat_field, combat_flow, combat_action, condition, property, item, rune, escalpo, talent, spell`.

**Política de versão vigente:** "última versão vence" — `unique(content_type, slug)`, sem coexistência de versões. Reimportar sobrescreve; o payload anterior só é recuperável via `content_changelog`. Essa decisão já está documentada e teria uma migração conhecida para a "Opção B" (multi-versão) se necessário — ver comentário no topo da migration 0001.

**Origem dos dados:** arquivos em `/content` (12 arquivos `db_*_normalizado_*.json` + 12 `schema_*.json` + 1 manifesto `ruptura_core_manifest_v0_1.json`), carregados por `scripts/seed-content.ts` (usa a service role key, roda fora do Next.js, nunca no cliente) e checados por `scripts/validate-content-import.ts`. Leitura em runtime é 100% via `src/lib/content/{client.ts,queries.ts,technicalLibrary.ts,types.ts}`, sempre com a anon key e sempre filtrando `status = 'published'`.

**Não existe hoje nenhuma interface administrativa de escrita.** A única forma de alterar `content_documents` é rodar `seed-content.ts` manualmente/via CI com a service role key. Não há admin role, não há permissão diferenciada, não há rascunho/publicação — o "Editor Universal" descrito no aditivo é 100% a construir.

---

## 2. Tipos de conteúdo encontrados e contagem real

| `content_type` | Arquivo fonte | Chave de coleção | Modo | Contagem real (14/07/2026) | Contagem no manifesto |
|---|---|---|---|---|---|
| `spell` | db_magias_normalizado_v1_3.json | `magias` | collection | **132** | 132 (match) |
| `item` | db_equipamentos_normalizado_v1_2.json | `itens` | collection | **120** | **119 — DIVERGE** |
| `escalpo` | db_escalpos_normalizado_v1_3.json | `escalpos` | collection | **58** | 58 (match) |
| `rune` | db_runas_normalizado_v1_2.json | `runas` | collection | **40** | 40 (match) |
| `combat_action` | db_acoes_combate_normalizado_v1_1.json | `acoes` | collection | **28** | 28 (match) |
| `talent` | db_talentos_normalizado_v1_3.json | `talentos` | collection | **22** (66 níveis, 22×3) | 22 / 66 níveis (match) |
| `condition` | db_condicoes_normalizado_v1_5.json | `condicoes` | collection | **17** | 17 (match) |
| `property` | db_propriedades_normalizado_v1.json | `propriedades` | collection | **14** | 14 (match) |
| `character_rule` | db_regras_personagem_normalizado_v1_4.json | (arquivo inteiro) | singleton | **1** | 1 |
| `combat_field` | db_campo_combate_normalizado_v1_1.json | (arquivo inteiro) | singleton | **1** | 1 |
| `combat_flow` | db_fluxo_combate_normalizado_v1_1.json | (arquivo inteiro) | singleton | **1** | 1 |
| `master_table` | db_tabelas_mestre_normalizado_v1.json | (arquivo inteiro) | singleton | **1** | fora do manifesto (comentado explicitamente em `seed-content.ts`) |

**Divergência real encontrada:** `db_equipamentos_normalizado_v1_2.json` tem **120** itens hoje, mas o manifesto declara `119`. `validate-content-import.ts` só valida um piso mínimo (`>= 119`), então a divergência passa silenciosamente — é um exemplo real do tipo de drift que o editor precisa expor (diagnóstico técnico, §15 do aditivo).

Todos os 12 valores do enum `content_type` são populados 1:1 pelas 12 fontes — não há content_type sem dado.

### 2.1 Conteúdo que existe nos arquivos mas NÃO é um registro administrável próprio

Um achado central da auditoria: vários conceitos citados no aditivo como "conteúdo" (perícias, atributos, vertentes/especializações, regras estruturadas) **não têm hoje uma linha própria em `content_documents`** — vivem soterrados dentro do payload de um singleton, ou nem chegam a ser semeados:

- Dentro do singleton `character_rule` (1 linha só): `atributos` (3), `pericias` (21), `derivados` (8), `requisitos_vertentes` (6), `recursos_temporarios` (2), `tipos_dano` (6), `resistencia_vulnerabilidade`, `colapso`, `descansos` (2), `atendimentos` (3), `evolucao`, `reacoes`, `sobrecarga`, `ruptura`, `integridade`, `rolagem`, `criacao_personagem` — tudo embutido, nada endereçável individualmente.
- **`especializacoes` (13 registros, dentro de `db_magias`) nunca são semeadas** — nem como linha própria, nem embutidas em nenhum documento. Existem só no arquivo em disco. O mesmo vale para os blocos `contagem_por_*` de magias/equipamentos/runas/escalpos (apenas metadado do arquivo, descartado no seed).
- Dentro do singleton `combat_field`: `tamanhos`, `alcances`, `areas`, `terrenos`, `condicoes_ambientais`, `grade`, `cobertura`, `movimento` etc.
- Dentro do singleton `combat_flow`: `janelas_turno`, `pontos_de_acao`, `fragmentacao_pa`, `emboscada`, `tregua`, `reacoes`.
- Dentro do singleton `master_table`: os 50 `master_tables` e 11 `content_tables` são um array só, sem registro individual.

**Consequência para o editor:** perícias, vertentes/especializações, atributos, tipos de dano e tabelas mestras — todos citados no §1/§8.2 do aditivo como conteúdo administrável — hoje não são "um documento = um registro" no schema atual. Editá-los individualmente exige decompor os quatro singletons em coleções (ver plano de migration em `docs/PLANO_IMPLEMENTACAO_EDITOR_UNIVERSAL.md`), ou o MVP precisa aceitar editá-los como sub-blocos dentro de um editor de singleton dedicado.

---

## 3. Formatos de efeito encontrados (`payload_automacao.efeitos[]`)

Todo tipo de conteúdo mecânico usa a mesma convenção de topo — `payload_automacao.efeitos: Efeito[]`, cada efeito com um campo `tipo` — mas **cada content_type define seu próprio vocabulário fechado de `tipo`, sem taxonomia compartilhada**. Não existe um `$defs/efeito` comum entre os 7 `schema_*.json` que têm efeitos (magias, talentos, condições, equipamentos, runas, escalpos, propriedades).

Achados por tipo (schema + amostra real):

- **Magias** — `tipo` é um enum fechado de 9 valores (`efeito_com_resistencia, dano, aplicar_condicao, remover_condicao, cura, recurso, recurso_temporario, modificador, teste_colateral`), com `allOf`/`if-then` por tipo. `additionalProperties: false`. Dano usa `dado` (string tipo `"1d4"`) + `tipo_dano`/`subtipo_dano`.
- **Talentos** — `familia` + `tipo` (20 famílias de despacho: `modificador, dado_gatilho, buff_empilhavel, reacao, economia_pa, companheiro, runa, magia, ...`), com dezenas de campos opcionais quase todos tipados como "qualquer coisa" (`["string","number","integer","boolean","object","array","null"]`). É o schema mais permissivo do conjunto depois de runas.
- **Condições** — vocabulário próprio de 18 tipos (`definir_deslocamento, modificador, modificador_recebido, habilitar_acao, dano_fim_de_rodada, teste_fim_de_rodada, ...`), sem sobreposição com o vocabulário de magias.
- **Equipamentos/Itens** — 22 tipos possíveis (`ambiente, aplicar_condicao, ataque_adicional, buff_magia, cura, dano_em_area, recurso, modificador, efeito_com_resistencia, ...`). `estatisticas` (campo irmão de `payload_automacao`) é **totalmente livre** (`{"type":"object"}`, sem sub-propriedades no schema) — o campo mais "legado"/não tipado do conjunto.
- **Runas** — 13 tipos, mas **`additionalProperties: true`** (única exceção — todos os outros tipos proíbem campos extras). Runas podem carregar campos não documentados silenciosamente.
- **Escalpos** — `tipo` é `"string"` livre (não é enum no schema), embora o `$defs` documente ~26 valores descritivos (`abrir_pool_de_espaco, deck_sinaptico, traducao_neural, ...`).
- **Propriedades de arma** — 13 tipos bem específicos (`alterar_alcance_arma, habilitar_acao_defensiva, resistencia_critica_aplica_condicao, ignorar_mit, ...`).

### 3.1 Contagem real de `tipo` no conteúdo publicado

Contagem agregada de ocorrências de `payload_automacao.efeitos[].tipo` em todos os `db_*.json`: aproximadamente **150 valores distintos**. Os mais frequentes:

| tipo | ocorrências (aprox.) |
|---|---|
| `efeito_com_resistencia` | 72 |
| `modificador` | 52 |
| `aplicar_condicao` | 51 |
| `dano` | 36 |
| `penalidade_pericia` | 12 |
| `cura` | 9 |
| `remover_condicao` | 8 |
| `promocao_margem` | 7 |
| `recurso` | 6 |
| `habilitar_acao` | 5 |
| `dano_em_area` | 5 |
| `buff_magia` | 5 |

O restante (~130 tipos) aparece 1–3 vezes, em geral específico de um talento ou runa (drone, robô, trama, economia de PA, autorreparo, etc.).

---

## 4. Executores existentes (o que o motor realmente processa)

Não existe um "efeito × executor" genérico no código — cada módulo de domínio decide, por conta própria, quais `tipo` reconhece. Todos ficam em `src/lib/character/`:

| Módulo | Responsabilidade | `tipo` que executa de verdade |
|---|---|---|
| `endRoundConditions.ts` | fim de rodada de condições | `dano_fim_de_rodada` (rola e aplica PV), `teste_fim_de_rodada`, `teste_fim_de_rodada_para_remover_condicao`, `teste_apos_exposicao`, `reduzir_pa` |
| `activeEffects.ts` | modificadores de teste derivados de condições/talentos/escalpos/runas | `modificador` (bônus real), `falha_automatica`, `bloquear_acoes`/`bloquear_reacoes` (trava, informativo), `definir_deslocamento`/`multiplicar_deslocamento` (informativo) |
| `talents.ts` | passivos e usos/cadência de talento | só `modificador` vira bônus real; `toggle_condicional` e efeitos com `usos` viram apenas contadores de uso/PA — a mecânica em si permanece lembrete de texto |
| `technicalEffects.ts` | modificadores instalados de escalpo/runa | só `modificador` com `valor`/`bonus` numérico e `alvo_tags`, sem `quando`/`restrito_a`/`gatilho` |
| `itemUse.ts` | uso de consumíveis (farmácia/granadas) | `cura` (aplica PV/PE de verdade), `efeito_com_resistencia`/`dano_em_area` (rola mas não aplica), `remover_condicao` (aplica se a condição está ativa) |
| `spells.ts` | conjuração de magia | `dano` (rola formula), `efeito_com_resistencia` (só texto de CD); PA/Mana e ataque mágico são automáticos fora do array de efeitos |
| `actionConsole.ts` | execução de ações de combate | `remover_condicao(s)`, `remover_restricao_movimento`, `aplicar_postura` — todo o resto vira texto "(não automatizado)" |
| `attack.ts` | resolução de dano de arma (margem, MIT, crítico) | não lê `efeitos[]` — é o motor de fórmula chamado pelos outros |
| `gmActions.ts` | ferramentas manuais do narrador | não lê `efeitos[]` — edição direta de recurso/condição pelo narrador |
| `temporaryEffects.ts` | runtime genérico de buff/debuff (`TemporaryEffect`) | estrutura de dados compartilhada, alimentada por `talents.ts`/`itemUse.ts` |
| `talentEngine.ts` (3245 linhas) | mecânica específica de cada talento | **não é despacho genérico** — ~150 funções nomeadas por talento (`hasFuria`, `registerDrone`, `iniciarTrama`, etc.), cada uma reconhecendo seu efeito por `tipo`+`familia`/`gatilho` mas com comportamento escrito à mão |

**Achado central:** os commits "integrate X talent operations" (droneiro, mecatrônico, tecelão, rato de rua, mercador, pistoleiro, malabarista, totem, praga, paramédico, manipulador, estrategista, espadachim/guardião, berserker, dissecador, ...) não registram efeitos num catálogo reutilizável — eles adicionam **código bespoke por talento** em `talentEngine.ts`. Isso confirma o requisito §20 do aditivo ("evitar criar um tipo novo por conteúdo individual") ainda não é seguido pelo motor atual — é um risco a documentar, não a corrigir na Etapa 0.

### 4.1 Efeitos sem executor (automação "morta"/lembrete)

O `tipo` mais comum de todo o conteúdo, **`aplicar_condicao` (51 ocorrências)**, **não tem nenhum executor que de fato aplique a condição ao alvo automaticamente** — todo módulo que o encontra trata como texto manual/narrador. É a maior lacuna de automação hoje.

Também sem executor: `penalidade_pericia` (12, equipamentos), `buff_magia` (5), `promocao_margem`/`forcar_margem`/`piso_margem` (fora de escopo documentado em `talents.ts`), praticamente todos os tipos de runas exceto `modificador` puro (`dano_modificador, protecao, ataque_adicional, economia_pa, autorreparo, revelar, reacao, narrativo` — listados explicitamente como não automatizados no cabeçalho de `technicalEffects.ts`), `teste_colateral` (magias), `recurso_temporario` (itens/magias), e a maioria dos tipos de condição citados em `activeEffects.ts` como fora do escopo padrão (`habilitar_acao, modificador_recebido, manter_condicao_no_alvo, aplicar_condicao_associada, aplicar_condicao_apos_tempo, morte_apos_tempo, alterar_custo_mana, exigir_teste_conjuracao`).

Documentos já existentes confirmam esse padrão de forma independente: `docs/RELATORIO_AUTOMACAO_RUNAS.md` classifica as 40 runas em grupos de automação (~1 automatizável hoje, ~35 precisam de sistemas novos, ~4 só narrativas) e `docs/RELATORIO_AUDITORIA_V0_50.md` já apontava que `activeEffects.ts` duplica manualmente modificadores de condição em vez de derivar de `db_condicoes_normalizado_v1_5.payload_automacao` — ou seja, **editar uma condição na Biblioteca hoje não muda o comportamento da ficha**.

---

## 5. Payloads legados e inconsistências reais

Achados concretos (não hipotéticos — todos verificados nos arquivos):

1. **"Duração" tem 4 representações diferentes** entre content types: objeto em magias (`estatisticas.duracao = {texto, sustentavel}`), string|null em condições (`duracao_padrao`), e um campo "qualquer coisa" (string/objeto/array/null) dentro dos efeitos de talentos/equipamentos/runas/escalpos.
2. **"CD de resistência" tem 2 representações**: `{cd_formula: "5 + nivel_vertente", acoes[]}` em magias vs. `{pericia, cd: <inteiro literal>}` em equipamentos/runas/propriedades.
3. **Fórmula de CD armazenada está desatualizada**: `cd_formula` no conteúdo de magias ainda diz `"5 + nivel_vertente"`, mas `src/lib/character/spells.ts` ignora deliberadamente esse texto e usa a regra canônica atual (`6 + nível`, `VERTENTE_CD_BASE = 6`) — o conteúdo publicado está desalinhado com a regra vigente e o motor já corrige isso via hardcode, não via dado.
4. **Bônus numérico com nome diferente por catálogo**: talentos/condições usam `valor` + `alvo_tags`; runas usam `bonus` (às vezes `valor`) — `technicalEffects.ts` já normaliza com `efeito.bonus ?? efeito.valor`.
5. **Remoção de condição declarada de 3 formas** na mesma família de campo: `{tipo:"remover_condicao"}`, campo solto `remover_condicao` (string ou array, sem `tipo`), ou `condicoes_possiveis[]` — `itemUse.ts` já tem funções (`isConditionRemovalEffect`/`getEffectRemovalSlugs`) para normalizar as 3.
6. **`estatisticas` de item/equipamento é totalmente livre no schema** (`{"type":"object"}`, sem sub-propriedades) — é o campo menos tipado do conjunto, variando por categoria (arma tem `dado_dano/soma_atributo/pericia_teste/propriedades[]`; outras categorias têm outros campos, sem contrato formal).
7. **Runas são o único content_type com `additionalProperties: true`** no efeito — campos extras não documentados podem existir silenciosamente nesse catálogo.
8. **Referências entre conteúdos são sempre strings soltas** (bare id/slug), nunca um objeto `{tipo, slug}` — exceto em dois lugares que reinventam esse padrão de forma independente: `requisitos[]` de escalpos (`{"tipo":"escalpo_instalado","id":...}`) e `requisitos[]` de talentos (`{"tipo":"talento_nivel_adquirido","talento_id":...,"nivel":...}`). Não há um `$defs` compartilhado entre os dois.
9. **Validação de schema não é aplicada**: apesar do manifesto declarar `"schema_validation_required": true`, nada no código roda os `schema_*.json` contra os dados — `validate-content-import.ts` só confere contagem mínima, hash e integridade estrutural (id/payload/source_pack presentes), nunca a forma do payload.

---

## 6. Referências entre conteúdos

- Sempre por **string solta** (id ou slug), nunca wrapper tipado, exceto os dois casos citados acima.
- Exemplos reais: `estatisticas.propriedades: ["arremesso","silencioso"]` (item → propriedade), `condicao: "caido"` (magia/condição → condição), `acoes_habilitadas[].acao: "escapar"` (condição → ação de combate), `slot.pool: "neural"` (escalpo → pool de espaço).
- Não há nenhuma validação de integridade referencial hoje — nada impede publicar (ou, no caso, semear) um documento que referencia um slug inexistente. Isso é relevante para §13.4 do aditivo ("apagar conteúdo referenciado deve ser bloqueado").

---

## 7. Modelo × instância — como o estado atual já separa isso

O padrão já existe e é consistente, útil como base para o editor:

- `characters` (migration `0002_characters.sql`) e `campaign_inventory_items` (migration `0019_campaign_inventory.sql`) seguem o mesmo desenho: `payload jsonb` guarda a instância **inteira** em jogo (cargas, munição carregada, runas instaladas, PV atual etc.), com colunas escalares só de projeção (`item_name/item_slug/quantity`).
- O comentário da migration 0019 é explícito: *"O conteúdo OFICIAL de item continua vindo só da Biblioteca (content_documents) — esta tabela guarda ESTADO MUTÁVEL de instância pertencente ao bando, nunca uma cópia do catálogo."*
- Isso confirma que a arquitetura já respeita §5.6 do aditivo: o editor da Biblioteca só precisa se preocupar com `content_documents`/`content_packs`; instâncias (`characters.payload`, `campaign_inventory_items.payload`) são uma camada separada e já protegida por RLS restrita a `owner_id`/narrador autenticado.

---

## 8. Versões, publicação e changelog

- **Status**: hoje só existe a coluna `status` (default `'published'`), sem estado de rascunho real — tudo que é semeado já nasce publicado. Não existe fluxo rascunho → validação → publicação no app.
- **Versão**: cada registro tem `version`/`versao` (semver) no payload, e a tabela `content_documents` tem uma coluna `version` projetada — mas nada no código incrementa essa versão automaticamente ao editar; é só um campo do payload original.
- **Changelog**: `content_changelog` grava `created`/`updated` só quando `payload_hash` muda de fato (reimportar sem mudança não gera ruído). Não há RLS de leitura pública — só `service_role` lê/escreve. Não há hoje nenhuma UI que exiba changelog.
- **Nenhum mecanismo de "impacto em instâncias"** (§14.5 do aditivo) existe ainda — publicar uma mudança de modelo hoje é só rodar o seed de novo; não há aviso sobre efeito em instâncias existentes.

---

## 9. Permissões e riscos de segurança

- **Não existe hoje nenhum admin role nem checagem de autorização para mutação de conteúdo.** A única escrita em `content_documents`/`content_packs`/`content_changelog` é `scripts/seed-content.ts`, rodado manualmente/CI com a service role key, fora do Next.js.
- `src/lib/content/client.ts` já proíbe explicitamente uso de service role no cliente (lança erro se só a anon key estiver disponível) — bom precedente a manter no editor.
- `src/lib/auth/` hoje só identifica **quem** está logado (Supabase Auth email/senha, cookies httpOnly com `access_token`/`refresh_token`), sem nenhum conceito de **o que** essa pessoa pode fazer — não há tabela de roles, não há coluna `is_admin`.
- RLS de `content_documents`/`content_packs` hoje permite leitura pública (`anon`/`authenticated`) só de `status='published'`; não há nenhuma policy de escrita para essas roles — qualquer editor futuro precisará de uma rota server-side (Next.js Server Action ou Route Handler) que valide autorização antes de tocar o banco, e não pode expor a service role ao cliente em nenhuma hipótese (§6.4/§18.2 do aditivo).
- `docs/RELATORIO_AUDITORIA_V0_50.md` também registra RLS "de transição" permissiva (`*_dev_transition_*`, aberta a `anon`) em `characters`/`campaigns`/`table_logs` — não é escopo deste editor, mas é um risco de segurança pré-existente a não esquecer antes de produção real.

---

## 10. Documentos correlatos já existentes (não repetidos aqui)

- `docs/RELATORIO_AUDITORIA_V0_50.md` — auditoria geral de código, confirma arquitetura data-driven e aponta a lacuna de `activeEffects.ts` não derivar de `db_condicoes`.
- `docs/RELATORIO_AUTOMACAO_RUNAS.md` — classificação de automação das 40 runas (grupos A/C/D).
- `docs/checkpoints/AUDITORIA_TALENTOS_CANONICOS.md` — reconciliação dos 22 talentos/66 níveis contra a fonte editorial em markdown.
- `docs/checkpoints/CHECKPOINT_TALENTOS_COMPLETOS.md` — status de integração mecânica talento a talento (infraestrutura vs. mecânica conectada).

---

## 11. Resumo dos achados que mais importam para o schema/plano

1. Perícias, atributos, vertentes/especializações e tabelas mestras **não são registros próprios hoje** — decisão de escopo necessária antes de oferecer edição individual deles.
2. **Nenhuma taxonomia de efeito é compartilhada** entre content types — é o maior trabalho de design do schema canônico (Etapa 1 do aditivo).
3. `aplicar_condicao` é o efeito mais comum do conteúdo e **não tem executor automático** — é o primeiro alvo natural para provar o "grau de automação" descrito no aditivo, mas também o risco de o editor prometer automação que o motor ainda não entrega.
4. Não existe hoje **nenhuma camada de autorização/admin** — a Etapa 2+ do aditivo (interface administrativa) depende de construir isso do zero, não de adaptar algo existente.
5. Separação modelo/instância já é sólida e replicável (`characters`, `campaign_inventory_items`) — o editor não precisa reinventar esse padrão, só respeitá-lo.
6. Divergência real já encontrada (item: 119 manifesto vs. 120 dado) mostra que o diagnóstico técnico do editor (§15.2) tem valor imediato, não é feature especulativa.
