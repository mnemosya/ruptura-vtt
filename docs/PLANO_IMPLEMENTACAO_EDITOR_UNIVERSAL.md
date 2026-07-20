# PLANO DE IMPLEMENTAÇÃO — EDITOR UNIVERSAL DA BIBLIOTECA

**Projeto:** Ruptura VTT
**Data:** 14 de julho de 2026
**Status:** Plano técnico pós-auditoria (Etapa 0). Nenhuma etapa de construção autorizada por este documento — cada etapa segue exigindo checkpoint próprio, conforme `docs/ADITIVO_PRD_EDITOR_UNIVERSAL_CONTEUDO.md` §17/§22.
**Depende de:** `docs/AUDITORIA_EDITOR_UNIVERSAL_CONTEUDO.md`, `docs/SCHEMA_CANONICO_CONTEUDO_V1.md`.

---

## 1. Recorte exato do MVP

Confirmando e detalhando as decisões já consolidadas no aditivo §24, ajustadas aos achados reais da auditoria:

**Tipos de conteúdo no MVP:** magia, talento, item/equipamento (exatamente os três do aditivo §Etapa 3 — são os três com maior volume real: 132, 22/66, 120 registros, e os únicos com `estatisticas`/`efeitos` já ricos e testados por scripts existentes).

**Efeitos no MVP:** dano, cura, aplicar condição, remover condição, modificar teste, alterar recurso (exatamente os 6 do aditivo §Etapa 4). Da auditoria:
- `cura` e `remover_condicao` já têm executor real — são o caminho mais seguro para provar o fluend-to-end do editor sem esperar novo trabalho de engine.
- `dano` tem executor parcial (rola, nem sempre aplica) — o MVP do editor pode gerar o payload canônico mesmo que a aplicação em jogo ainda dependa de trabalho de engine already-scoped.
- `aplicar_condicao` **não tem executor hoje** apesar de ser o efeito mais comum do conteúdo — o MVP do editor deve deixar claro (diagnóstico técnico) que esse efeito nasce como "lembrete" até a Etapa 4 conectar um executor genérico.
- `modificar_teste`/`alterar_recurso` têm executor parcial e fragmentado em 3 módulos (`activeEffects.ts`, `talents.ts`, `technicalEffects.ts`) — o MVP do editor não precisa esperar a consolidação desses módulos, só precisa gerar o payload no formato que os três já entendem hoje (`valor` + `alvo_tags`).

**Fora do MVP** (explicitamente, para não gerar expectativa): condição, runa, escalpo, propriedade, ação como tipos editáveis; efeitos compostos (teste/resistência com ramificação), efeitos temporários, consumo, drone/robô/trama, mercado avançado, homebrew de mesa, importação/exportação completa, grupos lógicos E/OU de condição, editor de fórmula livre.

**Perfil de usuário no MVP:** só Administrador da Biblioteca Oficial (aditivo §6.2 já permite restringir o MVP a isso). Como hoje **não existe nenhuma camada de admin/permissão** (achado da auditoria §9), a Etapa 2 precisa necessariamente incluir a criação dessa camada — não é opcional, é pré-requisito de segurança antes de qualquer escrita.

---

## 2. Plano incremental (mapeado às etapas já definidas no aditivo)

O aditivo já define 13 etapas (0 a 12) com objetivo/critério de aceite próprios. Este plano não as reescreve — só anota, por etapa, o que a auditoria revelou que **muda o esforço esperado** em relação ao texto genérico do aditivo.

### Etapa 1 — Camada canônica de definições e validação — **CONCLUÍDA**
- Trabalho adicional revelado pela auditoria: como não existe hoje nenhuma taxonomia de efeito compartilhada (150 valores de `tipo` distintos, cada content_type com vocabulário próprio), a Etapa 1 precisa necessariamente incluir a criação do catálogo de efeitos (`docs/SCHEMA_CANONICO_CONTEUDO_V1.md` §3) como artefato de primeira classe, não como detalhe de implementação.
- Adaptadores de leitura precisam ser **um por content_type**, não genéricos — confirmado pela heterogeneidade real dos payloads (duração em 4 formatos, resistência em 2 formatos).
- Implementado em `src/lib/contentSchema/` — registro de tipos de conteúdo, catálogo de efeitos, normalizadores de duração/resistência/referência, validação, diagnóstico de automação, adapters para spell/talent/item/condition + fallback genérico para os 8 content_types restantes, e os 5 exemplos canônicos obrigatórios. Detalhes completos em `docs/CHECKPOINT_ETAPA1_SCHEMA_CANONICO.md`. Ajustes em relação a esta proposta estão documentados em `docs/SCHEMA_CANONICO_CONTEUDO_V1.md` §8.

### Etapa 2 — Lista administrativa e inspeção — **CONCLUÍDA**
- Pré-requisito de segurança descoberto na auditoria: **não existe hoje nenhum admin role**. Esta etapa precisa entregar, além da lista read-only, a própria noção de "quem é admin" (tabela/coluna de role, ou allowlist de e-mails autenticados via Supabase Auth) — sem isso, "acesso indevido é bloqueado" (critério de aceite do aditivo) não tem como ser verdadeiro.
- Diagnóstico técnico já tem um caso real para mostrar: a divergência de contagem de itens (120 real vs. 119 no manifesto) — bom teste de aceite orgânico, não fabricado.
- Implementado: migration `0020_content_admin_roles.sql` (tabela `admin_users` + função `is_content_admin()` SECURITY DEFINER, sem policy nova em `content_documents`), rota `/admin/biblioteca` (lista) e `/admin/biblioteca/[contentType]/[slug]` (detalhe), gate único em `src/app/admin/layout.tsx`. Detalhes completos, incluindo browser check confirmado, em `docs/CHECKPOINT_ETAPA2_ADMIN_BIBLIOTECA_READONLY.md`.

### Etapa 3 — Editor universal de campos básicos — **CONCLUÍDA**
- Já compatível com o recorte real: magia/talento/item são os três com `identificacao`/`classificacao`/`texto` mais uniformes (ver matriz §2 do schema canônico).
- Atenção: `estatisticas` de item é campo livre no schema atual — a Etapa 3 deve tratá-lo como somente leitura/técnico neste momento (não gerar formulário para um campo sem contrato), conforme decisão em aberto §7.3 do schema canônico.
- Implementado: rascunhos em tabela separada `content_drafts` (migration `0021_content_drafts.sql`, RLS admin-only via `is_content_admin()`), editor universal em `/admin/biblioteca/rascunhos/*`, Server Actions em `src/lib/contentSchema/draftServerActions.ts` (criar/editar/duplicar/atualizar/excluir), controle de concorrência otimista (coluna `version`). Detalhes completos e browser check confirmado em `docs/CHECKPOINT_ETAPA3_EDITOR_CAMPOS_BASICOS.md`. Ajuste incidental: corrigido um bug latente da Etapa 1 (spell adapter não copiava `pericia_teste`/`atributo_ataque` para `classificacao`).

### Etapa 4 — Construtor de efeitos MVP — **Implementação concluída — aceite operacional parcial (ver checkpoint §9.1)**
- `cura` e `remover_condicao` — caminho mais seguro para o primeiro efeito ponta a ponta (executor já existe).
- `aplicar_condicao` — maior valor de produto (é o efeito mais comum), mas exige construir o primeiro executor genérico novo (hoje não existe nenhum). Recomendação: tratar como o efeito "prova de conceito" desta etapa, já que o aditivo pede explicitamente que a magia `1d8` de fogo funcione fim a fim (critério §21) e ela tipicamente usa `aplicar_condicao` em resistência falha.
- `dano`/`modificar_teste`/`alterar_recurso` — gerar payload canônico compatível com os executores parciais já existentes, sem exigir refatorar `activeEffects.ts`/`talents.ts`/`technicalEffects.ts` nesta etapa (risco de regressão desnecessário fora de escopo).
- Implementado: `src/lib/contentSchema/effectDraft*.ts` (tipos/mapeamento/diagnóstico/validação compartilhados pelos 6 efeitos), UI em `rascunhos/_shared/EffectsEditorSection.tsx` + `EfeitoCamposPorTipo.tsx`, executor genérico `src/lib/character/conditionEffectExecutor.ts` conectado ao fluxo manual de `/dev/table`. Catálogo de `aplicar_condicao` (Etapa 1) atualizado de "lembrete" para "assistido". Detalhes completos, incluindo o que o browser check confirmou e o que ficou pendente de confirmação final, em `docs/CHECKPOINT_ETAPA4_CONSTRUTOR_EFEITOS_MVP.md`.

### Etapa 5 — Publicação, versões e changelog — **Implementação concluída — aceite de browser pendente (ver checkpoint §7)**
- `content_changelog` já existia mas **não** resolvia sozinho versões/comparação — foi **estendido** (versões, autor, resumo, caminhos, impacto, hashes, vínculo com rascunho), não recriado. Publicação/arquivamento passam por funções SECURITY DEFINER transacionais (`publish_content_draft`/`archive_content_document`, migration `0022_content_publishing.sql`); a versão (`+patch`, `1.0.0` para novo) é autoridade do SQL, sincronizando coluna `version`, `payload.versao` e changelog.
- Rascunho isolado em `content_drafts` (Etapa 3) permanece a fonte de rascunho — publicar consome o rascunho e escreve `content_documents` (published); arquivar usa `status='archived'`, que some do jogo por construção (todas as queries de consumo já filtram `published`). Detalhes, estratégia de serialização, segurança e limitações em `docs/CHECKPOINT_ETAPA5_PUBLICACAO_VERSIONAMENTO.md`.
- **Verificado**: TypeScript, build e o núcleo transacional (por SQL direto, com rollback e zero resíduo). **Pendente**: browser check (bloqueado pelo esbuild — não executado, não alegado como aprovado).
- **Correção de compatibilidade** (pós-aceite, mesma etapa): a serialização inicial embutia um blob `_editor` dentro de cada efeito publicado — inválido contra `additionalProperties: false` dos schemas oficiais de magia e talento. Corrigido: metadata do editor movida para tabela administrativa separada (`content_editor_metadata`), serialização reescrita para emitir só chaves confirmadas pelos schemas reais, validação bloqueante para configurações não representáveis no vocabulário legado, e round-trip completo preservado. Nenhum conteúdo real chegou a ser contaminado. Detalhes completos em `docs/CHECKPOINT_CORRECAO_METADATA_EDITOR_PUBLICACAO.md`.

### Etapa 6 — Adaptadores e edição de legados — **Implementação concluída — aceite de browser pendente (ver checkpoint)**
- A classificação de 5 estados (`conversao_direta`/`conversao_com_confirmacao`/`somente_leitura`/`incompativel`/`invalido`) já existia desde a Etapa 1, mas por DOCUMENTO inteiro — a Etapa 6 refinou para por CAMPO/EFEITO (`legacyConversion.ts`), reaproveitando os adapters e normalizadores existentes sem duplicar parsing.
- Fluxo de conversão explícito: diagnóstico (`/admin/biblioteca/rascunhos/legado/[contentType]/[slug]`) → confirmação de campos ambíguos → rascunho com `origemLegado` (adapter+versão, decisões, campos/efeitos preservados) → publicação com validação de perda (`legacyLossValidation.ts`) → changelog registra a origem da conversão. Nenhuma migration nova (reusa JSONB de `content_drafts`/`content_editor_metadata`/`content_changelog.impact`, todos já existentes).
- **Verificado**: TypeScript, build, classificação/relatório e validação de perda com cópias de registros reais (spell/talent/item), núcleo transacional por SQL direto com rollback. **Pendente**: browser check (bloqueado pelo esbuild). Detalhes completos em `docs/CHECKPOINT_ETAPA6_ADAPTADORES_LEGADO.md`.

### Etapa 7 — Teste, resistência e efeitos compostos — **Implementação concluída — aceite de browser pendente (ver checkpoint)**
- Novo tipo canônico `teste_resistencia` (raiz, com resultados/faixas reusando o enum real `MARGEM_CLASSIFICACOES` de `src/lib/dice/types.ts`) + `modificar_margem` (serializa exatamente o formato real já lido por `getMarginPromotions`/`talentEngine.ts`) + `alterar_dano_recebido` (novo, sempre `lembrete` — sem executor real no motor hoje). Profundidade limitada por CONSTRUÇÃO (o tipo `EfeitoFilho` exclui `teste_resistencia` — sem recursão possível, não só validada em runtime).
- Serialização legada auditada schema por schema: magia/item representam a árvore como o efeito-raiz de resistência + até 2 efeitos-filho *siblings* (mesma convenção real já usada em conteúdo publicado); além disso, ou talento, ou CD derivada em item, ficam bloqueados com mensagem clara — nunca "fingindo suporte". `efeito_com_resistencia` legado nunca é auto-convertido (3 estruturas reais incompatíveis encontradas entre spell/rune/property).
- **Verificado**: TypeScript, build, classificação/serialização contra os 3 schemas oficiais (14 casos reais), núcleo transacional por SQL com rollback. Corrigido de passagem um bug real em `publishDiff.ts` (comparava por um `_editor.id` que não existe mais desde a correção pós-Etapa 5). **Pendente**: browser check (esbuild) e um gatilho de UI ao vivo para o resolvedor genérico (`testResistanceTreeExecutor.ts`, real e testado, mas sem botão na mesa do narrador nesta sessão). Detalhes completos em `docs/CHECKPOINT_ETAPA7_EFEITOS_COMPOSTOS.md`.

### Etapa 8 — Efeitos temporários, cadências, usos e consumos — **Implementação concluída — aceite de browser pendente (ver checkpoint)**
- Novo tipo canônico `efeito_temporario` (duração/pilhas/política de reaplicação no mesmo vocabulário de `TemporaryEffect`, `character/types.ts`; modificadores filhos reaproveitam `modificar_teste`, limitados a 4, sem recursão) + `acao_reacao_adicional` (novo, sempre `lembrete` — nenhum executor real concede ação/reação/ataque adicional hoje). Uso/cadência NÃO é um tipo novo: campo `usoLimitado` reutilizável em qualquer efeito, serializando para o mesmo `usos`/`cadencia` real já lido por `talentEngine.ts`. Consumo de recurso (PA/Reação/Mana/Sobrecarga/RAM) reaproveita `alterar_recurso` (Etapa 4) com 2 campos novos (`momentoConsumo`/`refundEmCancelamento`) — nunca um tipo/executor duplicado. Consumo de carga/munição/flecha da Aljava NÃO ganhou tipo de efeito — já totalmente representado por `consumeItemCharge`/`consumeAttackAmmo` (reais, genéricos, fora do catálogo de efeitos).
- Serialização auditada schema por schema: item serializa `efeito_temporario` como `buff_temporario` real (mesmo shape já lido por `buildTemporaryEffectFromStructuredPayload`); talento serializa uso/cadência e ação adicional nos campos/família reais (`usos`/`cadencia`, `familia: "ataque_adicional"|"reacao"`); magia bloqueia os 3 tipos (schema fechado, sem campo de duração/buff/uso/cadência).
- **Verificado**: TypeScript, build, serialização/validação contra os 3 schemas oficiais (17 casos reais, incluindo round-trip pelo EXECUTOR REAL de efeito temporário e expiração/acúmulo de pilhas real), núcleo transacional por SQL com rollback. **Pendente**: browser check (esbuild) e um gatilho de UI ao vivo (reaproveita o fluxo de uso de item já existente, sem novo botão). Detalhes completos em `docs/CHECKPOINT_ETAPA8_TEMPORARIOS_CADENCIAS_CONSUMOS.md`.

### Etapa 9 a 10 (inventário/runas/mercado, drone/robô/trama)
- Confirmado pela auditoria: automação real hoje é parcial ou inexistente para quase todos esses efeitos. Essas etapas devem ser tratadas como "engine + editor" combinadas, não só editor — o aditivo já reconhece isso (§10.16/§Etapa 10: "nenhuma automação é anunciada como completa sem executor").
- `docs/RELATORIO_AUTOMACAO_RUNAS.md` já entrega boa parte do levantamento fino necessário para a Etapa 9 (grupos A/C/D de automatabilidade por runa) — reaproveitar em vez de reauditar.

### Etapa 11/12 (importação/exportação, homebrew de mesa)
- Sem achados novos da auditoria que mudem o texto do aditivo — permanece como está.

---

## 3. Migrations prováveis (NÃO aplicadas nesta etapa)

Listadas por probabilidade e ordem de necessidade real, com justificativa vinda da auditoria. Nenhuma delas deve ser criada ou aplicada até a etapa correspondente ser autorizada.

1. **Coluna(s) de rascunho/publicação em `content_documents`** — hoje `status` já existe mas só tem o valor `'published'` em uso; provavelmente só precisa de uma constraint/enum (`draft`/`published`/`archived`) e talvez `published_at`, `published_by`. Baixo risco — coluna já existe, é extensão de domínio de valor.
2. **Tabela/coluna de autorização admin** — algo como `admin_users` (ou uma claim/role em `profiles`, se existir tabela de perfil — verificar na Etapa 2) para suportar RLS de escrita em `content_documents`/`content_packs`. Sem isso, nenhuma policy de INSERT/UPDATE pode ser escrita com segurança.
3. **Policies de escrita em `content_documents`/`content_packs`** restritas ao novo papel de admin — hoje simplesmente não existem (só leitura pública + service role). Precisa ser cuidadosamente escrita para não abrir escrita a `anon`/`authenticated` genérico.
4. **Colunas para versionamento incremental** (`content_documents.editor_version` ou similar, distinto do `version`/`versao` do payload) — se a decisão de produto for versionar automaticamente a cada publicação pelo editor (Etapa 5).
5. **Possível nova tabela `content_drafts`** (alternativa à opção 1) — se a decisão de produto for **não** misturar rascunho e publicado na mesma linha de `content_documents` (evita rascunho aparecer em querys existentes por engano, já que todas as querys hoje filtram `status='published'` e um rascunho com outro status já ficaria automaticamente invisível — então a opção 1 provavelmente é suficiente e mais simples).
6. **Decomposição de singletons em coleções** (`character_rule` → tabelas/rows próprias de perícia/atributo/vertente, se a decisão do item em aberto §7.1 do schema canônico for por decompor) — a mais arriscada das seis, pois muda a forma como `getCharacterRules()` e consumidores atuais leem esses dados; exigiria também atualizar `src/lib/content/queries.ts` e qualquer consumidor de `character_rule` no app. Só fazer se houver necessidade real de editar perícia/atributo isoladamente — adiar até o produto pedir.
7. **Correção do drift item 119→120** no manifesto (`content/ruptura_core_manifest_v0_1.json`) — não é migration de banco, é atualização do arquivo fonte; mencionado aqui porque a Etapa 2 (diagnóstico) provavelmente vai expor esse caso e alguém vai perguntar "por que isso não foi corrigido" — resposta: fora do escopo desta auditoria (regra "não modificar conteúdos publicados / não reescrever payloads existentes").

Nenhuma migration acima foi criada nem aplicada. `list_migrations`/estado do banco não foi verificado via MCP nesta etapa por não ser necessário para a auditoria estática do repositório — se necessário confirmar o estado remoto do Supabase antes da Etapa 2, isso deve ser uma ação explícita e autorizada à parte.

---

## 4. Riscos

| Risco | Origem do achado | Mitigação proposta |
|---|---|---|
| Editor promete automação que o motor não entrega (ex.: publicar magia com `aplicar_condicao` parecendo "automática") | Auditoria §4.1 — `aplicar_condicao` é o efeito mais comum sem executor | `modo_automacao` derivado do catálogo de efeitos, nunca escolhido livremente (schema canônico §4.2) |
| Divergência silenciosa entre manifesto e dados (já aconteceu: item 119→120) | Auditoria §2 | Diagnóstico técnico da Etapa 2 deve comparar manifesto × contagem real e alertar, não silenciar |
| Falta de admin role bloqueia toda escrita seguramente | Auditoria §9 | Tratar como pré-requisito bloqueante da Etapa 2, não deixar para depois |
| Efeitos de talento bespoke (`talentEngine.ts`) tentados a entrar no catálogo genérico prematuramente | Auditoria §4 | Seguir regra do aditivo §20 — só generalizar quando 2+ conteúdos precisarem do mesmo efeito |
| `estatisticas` de item sem contrato pode gerar formulário instável por categoria | Auditoria §5.6 | Tratar como somente leitura até a Etapa 3 decidir sub-schema por categoria |
| Runas com `additionalProperties: true` podem esconder dados que o editor não preserva corretamente | Auditoria §3 | Preservação de campos desconhecidos (schema canônico §6) cobre isso desde a Etapa 1 |
| Decompor singletons (`character_rule`, `master_table`) pode quebrar consumidores existentes (`getCharacterRules()` etc.) | Schema canônico §7 | Adiar decomposição até haver necessidade de produto comprovada; não incluir no MVP |

---

## 5. Divisão das próximas etapas — resumo de decisão

Nenhuma etapa além da 0 está autorizada por este checkpoint. A ordem recomendada de execução, uma vez autorizada etapa a etapa, é a já definida no aditivo (1 → 12), com os ajustes de esforço anotados acima. O próximo passo, quando solicitado, é a **Etapa 1 — Camada canônica de definições e validação**, cujo primeiro artefato concreto deveria ser o catálogo de efeitos (não o formulário de UI), pois é a peça que mais acumula risco de retrabalho se adiada.
