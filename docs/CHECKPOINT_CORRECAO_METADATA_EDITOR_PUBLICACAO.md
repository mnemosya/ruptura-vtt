# CHECKPOINT — CORREÇÃO: METADATA DO EDITOR NA PUBLICAÇÃO (Etapa 5)

**Projeto:** Ruptura VTT
**Checkpoint anterior:** `e2bd27c` — docs: document publication and versioning checkpoint (Etapa 5)
**Escopo:** correção pontual da Etapa 5 — remover o blob `_editor` do payload público, garantir que o conteúdo publicado é válido contra os schemas oficiais, e preservar o round-trip editorial sem perda através de uma tabela administrativa separada. **Não é a Etapa 6.**

**Status desta correção:** compatibilidade comprovada — ver §7. O status da Etapa 5 volta a **"Implementação concluída — aceite de browser pendente"** (nunca chegou a ser marcada "aceite de browser concluído"; o browser check segue bloqueado pelo mesmo conflito de arquitetura do esbuild das etapas anteriores).

---

## 1. Auditoria — evidência concreta

### 1.1 Onde `_editor` era persistido

`effectLegacySerialization.ts::serializarEfeitoLegado` (versão anterior) embutia `_editor: efeito` (o `EfeitoEditavel` completo) dentro de CADA objeto de efeito, que `publishSerialization.ts::aplicarEfeitos` gravava em `payload_automacao.efeitos[]` — **dentro do JSONB público** `content_documents.payload`, sem nenhuma outra cópia.

### 1.2 Quais schemas permitem/rejeitam `_editor`

Leitura direta dos 3 arquivos oficiais em `content/`:

| Content type | Schema | `additionalProperties` no objeto de efeito | `_editor` é válido? |
|---|---|---|---|
| Magia | `schema_magias_v1_3.json` (linha ~411) | **`false`** | **NÃO** — chave rejeitada |
| Talento | `schema_talentos_v1_3.json` (`$defs.efeito`, linha ~330) | **`false`** | **NÃO** — chave rejeitada |
| Item/equipamento | `schema_equipamentos_v1_2.json` (linha ~530) | **`true`** | Tecnicamente aceito pela chave livre, mas **não pertence ao contrato publicado** (critério do pedido de correção) |

Ou seja: **conteúdo publicado como magia ou talento pela Etapa 5 era estruturalmente INVÁLIDO contra o próprio schema oficial.** Item não quebrava tecnicamente (schema permissivo), mas ainda assim vazava metadado administrativo — corrigido por igual, para nunca depender de uma permissividade que pode mudar.

### 1.3 Descoberta adicional — não só `_editor`

A auditoria (necessária para responder "o payload passa pelos schemas") revelou que a serialização anterior também emitia, para magia e item, chaves **sem nenhum lar no schema** mesmo sem contar `_editor`: `gatilho`, `alvo`, `duracao`, `habilitado`, `nome`, `texto_log`, `valor_fixo` (schema usa `valor`), `dano_adicional`, `ignora_mit`, `ignora_pd`. Para talento, faltava a chave **`familia`**, obrigatória (`required: ["familia","tipo"]`) e nunca emitida — um talento publicado pela Etapa 5 já teria falhado a validação por esse motivo, independente do `_editor`. Essas chaves foram corrigidas junto (mesma correção, mesmo risco: "payload publicado deve conter somente dados do contrato").

### 1.4 O conteúdo publicado pela Etapa 5 passava pelos schemas oficiais?

**Não, para magia e talento.** Testado diretamente (ver §7.1): a serialização anterior, se fosse usada para publicar, geraria um documento inválido contra `schema_magias_v1_3.json`/`schema_talentos_v1_3.json` — `additionalProperties: false` rejeitaria `_editor` e as demais chaves sem lar, e talento adicionalmente falharia por `familia` ausente. Para item, o payload seria estruturalmente "válido" (schema permissivo) mas ainda carregava metadado administrativo dentro do contrato.

### 1.5 Informações que seriam perdidas ao remover `_editor` sem substituto

O `EfeitoEditavel` completo: `id` estável do editor, `habilitado`, `nomeOpcional`, `textoLog`, `textoLembrete`, e campos por tipo sem equivalente legado — `ignoraMit`/`ignoraPd`/`danoPrincipalOuAdicional` (dano), `autoria`/`confirmacaoManual`/`maximoDePilhas` (aplicar condição), `atributo`/`acao`/`defesa`/`maximo`/`consumirNoProximoTeste`/`confirmacaoDeContexto` (modificar teste), `minimo`/`maximo`/`bloquearPorInsuficiencia`/`formula` (alterar recurso). Sem um lugar para viver, um ciclo publicar→reabrir perderia essas configurações exatas, mesmo que a mecânica básica (tipo, fórmula, recurso, condição) sobrevivesse via re-adaptação do payload legado.

### 1.6 Como um novo rascunho recupera essas informações sem poluir o payload público

Nova tabela `content_editor_metadata` (migration `0023`, ver §3): guarda o `EfeitoEditavel[]` completo (ou, para talento, por nível) — **nunca no payload público**. `criarRascunhoDeEdicao` (ver §5) busca a metadata da versão publicada atual e, quando existe, a usa como fonte de verdade dos efeitos editáveis do novo rascunho — round-trip sem perda, sem tocar `content_documents.payload`.

---

## 2. Conteúdo real contaminado?

**Não.** Consulta direta:

```sql
select id from content_documents where payload::text like '%_editor%';
-- 0 linhas
```

Nenhum conteúdo real foi publicado com `_editor` — as únicas publicações feitas durante a Etapa 5 foram os testes transacionais via SQL, sempre com rollback forçado (documentado no checkpoint da Etapa 5, §7.1), e o browser check nunca chegou a rodar. **Nenhuma migração de dados foi necessária.**

---

## 3. Estratégia adotada

**Tabela administrativa separada** (`content_editor_metadata`), entre as opções aceitáveis listadas no pedido — escolhida por ter vínculo estável e por já ser exatamente o padrão usado pelo `content_changelog` estendido na Etapa 5.

```sql
content_editor_metadata (
  id uuid pk,
  document_id text references content_documents(id) on delete cascade,
  version text,                              -- versão publicada correspondente
  changelog_id uuid references content_changelog(id) on delete set null,
  source_draft_id uuid,                       -- rascunho de origem
  efeitos jsonb,                              -- EfeitoEditavel[] (ou por nível, no talento)
  created_by uuid, created_at timestamptz,
  unique (document_id, version)
)
```

- RLS habilitada; **única policy é SELECT para `is_content_admin()`** — sem policy de escrita (grava-se só dentro do RPC `SECURITY DEFINER`, que ignora RLS por ser dono da tabela).
- Não é necessária para o funcionamento do jogo — só para a interface administrativa (revisão/histórico/round-trip).
- Uma linha por `(document_id, version)`: permite abrir histórico completo (todas as versões já publicadas mantêm sua própria metadata), não só a mais recente.

---

## 4. Serialização corrigida (`effectLegacySerialization.ts`)

Reescrita para emitir **só chaves confirmadas por leitura direta dos schemas**, por `(content_type, tipo canônico)`:

- **Nunca** emite `_editor`, `habilitado`, `nomeOpcional`, `textoLog`, `textoLembrete`, ou o `id` interno do editor, para nenhum content_type.
- **Magia**: `tipo`, `dado`/`valor`, `tipo_dano`/`subtipo_dano` (livres, sem enum), `sucesso`, `condicao` (enum de 17 slugs), `recurso` (enum `pv`/`pe`/`mana`), `alvo_tags`/`pericia` (enum de 21 perícias). `gatilho`/`alvo`/`duracao` **não têm lar** no schema de magia — vivem só em `content_editor_metadata`.
- **Item**: `tipo` mapeado ao enum real (**"dano" vira "dano_em_area"** — o enum de `schema_equipamentos_v1_2.json` não tem um "dano" genérico), `tipo_dano`/`subtipo_dano` restritos a enum próprio (diferente do de magia — 6 valores), `condicao`/`condicoes_possiveis` (enum), `recurso` (livre, sem enum). `additionalProperties: true` no efeito, mas a política é a mesma: nada de metadado administrativo ali.
- **Talento**: `familia` (obrigatório — enum fixo sem opção "dano"/"cura" dedicada; mapeado para `"regra_especial"` quando não há categoria melhor, `"aplicar_condicao"`/`"modificador"`/`"recurso"` quando há). `tipo` é string livre (sem enum). `gatilho`/`alvo`/`duracao`/`condicao`/`recurso`/`valor` são tipados livremente no schema (`type: [string, number, ..., object, null]`) — únicos content_types onde esses conceitos têm lar legado.
- **`validarEfeitoParaPublicacao(contentType, efeito)`**: nova checagem BLOQUEANTE quando o efeito configurado não é representável no vocabulário legado daquele content_type (ex.: `alterar_recurso` com recurso `pa` numa magia, `remover_condicao` com "remover todas" numa magia/item, condição fora do enum de 17 slugs, tag de perícia fora do enum). Testado (§7.2): bloqueia corretamente, sem publicar payload inválido.

---

## 5. Round-trip (criar rascunho de edição a partir do publicado)

`criarRascunhoDeEdicao` (`draftServerActions.ts`) busca `content_editor_metadata` pela versão publicada atual (`getEditorMetadataAtual`, `editorMetadataQueries.ts`). Quando existe, `sobreporMetadataEditorial` substitui os efeitos re-derivados dos adapters legados (que perderiam os campos sem lar legado) pelo `EfeitoEditavel[]` exato da metadata — **fidelidade total**: tipo, id estável, ordem, gatilho, alvo, duração, fórmula, recurso, referência de condição, flags específicas do tipo. Quando NÃO existe (conteúdo seedado antes desta correção, ou nunca publicado por esta via), cai no comportamento anterior (re-adaptação dos adapters legados) — **fallback seguro, nunca inventa dado ausente**.

IDs internos do editor (o `id` de cada `EfeitoEditavel`) **não vazam** para o payload publicado — só existem em `content_editor_metadata` e no rascunho em edição.

---

## 6. Migration e função transacional (`0023_editor_metadata_separation.sql`)

- Cria `content_editor_metadata` + policy de leitura admin.
- `publish_content_draft` ganha o parâmetro `p_efeitos_editaveis` (default `[]`) e, na MESMA transação: grava o payload público (sem `_editor`), grava o changelog, e grava a metadata vinculada ao `changelog_id` recém-criado — `on conflict (document_id, version) do update` evita duplicar linha se a mesma versão for regravada.
- **Correção adicional descoberta durante a auditoria** (não relacionada a `_editor`, mas ao mesmo RPC): o schema de talento exige `status`/`versao`/`updated_at`/`created_at` **também em cada nível** (`$defs.nivel_talento`), não só no topo do documento. A versão anterior do RPC só atualizava esses campos no topo — os níveis ficavam com a versão antiga. Corrigido: o RPC agora sincroniza `status`/`versao`/`updated_at` (e `created_at`, quando ausente) em cada `niveis[i]` também.
- `archive_content_document` não precisou mudar (não grava efeitos).

---

## 7. Verificações

### 7.1 Validação de schema — payload real produzido pela serialização

Script `scripts/dev/validate-published-schema.mjs`: compila `publishSerialization.ts` + `effectLegacySerialization.ts` (e dependências puras, sem I/O) com `npx tsc` para um diretório temporário, roda o JS **real e compilado** com `node` puro (sem `tsx`/esbuild), e valida o resultado com um avaliador mínimo de JSON Schema (subconjunto: `type`, `enum`, `const`, `pattern`, `required`, `properties`, `additionalProperties`, `items`, `allOf`/`if-then`, `anyOf`, `$ref` local) contra os 3 schemas oficiais reais. **O payload validado é o que a serialização produz — não uma fixture escrita à mão para passar.**

Executado e **aprovado**:

```
OK  — 1. Magia — dano 1d8 de fogo válido contra schema_magias_v1_3
OK  — 4. Efeito legado preservado (efeito_com_resistencia) presente
OK  — 2. Item — cura 2d6 PV válido contra schema_equipamentos_v1_2
OK  — 5. Item — estatisticas preservado
OK  — 3. Talento — +1 em Luta válido contra schema_talentos_v1_3
OK  — 6. Talento — três níveis preservados

=== TODOS OS CASOS PASSARAM ===
```

Confirmado especificamente: nenhuma chave `_editor` (nem qualquer outra chave administrativa inesperada) aparece no payload produzido; `additionalProperties: false` respeitado (magia/talento); campos obrigatórios presentes (inclusive `familia` no talento); efeitos preservados permanecem na ordem correta (`[preservado, editável]`); `estatisticas` do item preservado; os 3 níveis do talento preservados.

**Achado colateral do teste**: o schema de talento exige `payload_automacao.efeitos` com `minItems: 1` em CADA nível — um nível sem nenhum efeito (editável nem preservado) nunca seria publicável pelo contrato oficial. É uma restrição **preexistente** do schema, não introduzida por esta correção; registrada aqui como limitação (§9).

### 7.2 Validação bloqueante (representabilidade)

```
validarEfeitoParaPublicacao("spell", { alterar_recurso, recurso: "pa" })
  → ["Efeito ... recurso \"pa\" não é compatível com o contrato de magias (aceita apenas pv/pe/mana)."]
validarEfeitoParaPublicacao("spell", { alterar_recurso, recurso: "pe" })
  → [] (representável, publica normalmente)
```

### 7.3 Verificação transacional com rollback (SQL direto, zero resíduo)

Bloco `DO` com `raise exception` final forçando rollback total — nada persiste:

1. Publicar novo conteúdo → payload público **sem** `_editor`. **OK**
2. Metadata gravada em `content_editor_metadata`, vinculada a `document_id`+`version`+`changelog_id` válido (linha existe em `content_changelog`). **OK**
3. Nova edição → incrementa patch (`1.0.0→1.0.1`) e grava **nova linha** de metadata para a nova versão, **preservando o histórico** da versão anterior (não sobrescreve). **OK**
4. Falha por versão otimista incorreta → bloqueada. **OK**
5. Depois da falha, número de linhas de metadata **inalterado** (nenhum resíduo órfão da tentativa que falhou). **OK**

Confirmado por contagem após o rollback: `content_documents`/`content_drafts`/`content_changelog`/`content_editor_metadata` com resíduo de teste = 0; `content_documents` com `_editor` em qualquer lugar = 0.

### 7.4 Técnicas

- `git status --short`, `npx tsc --noEmit`, `npm run build` — todos aprovados.
- `next-env.d.ts` inalterado. Nenhum `npm install`.

### 7.5 Não executadas

- **Browser check** (`npm run check:admin-publication` e o novo `validate-published-schema.mjs` fora do modo compilado-por-tsc) seguem bloqueados pelo conflito de arquitetura do esbuild — não reabertos, não executados, não alegados como aprovados.

---

## 8. Segurança

- `content_editor_metadata`: RLS habilitada, única policy é SELECT para `is_content_admin()` — sem policy de escrita (só via `SECURITY DEFINER`). Nenhuma policy genérica para `authenticated`.
- Admin validado no servidor (`requireAdmin`) e dentro do RPC (`is_content_admin()`).
- Nenhum código executável armazenado (só JSON de configuração de efeito). Nenhum token/cookie/secret registrado.
- RLS de personagens/campanhas/mesa **não** alterada.

---

## 9. Limitações

- Round-trip via `content_editor_metadata` cobre conteúdo publicado **por esta via** (Etapa 5 em diante). Conteúdo seedado antes da correção cai no fallback de re-adaptação dos adapters legados (sem os campos sem lar legado) — comportamento pré-existente, não uma regressão desta correção.
- Talento: `dano`/`cura`/`remover_condicao` não têm uma `familia` dedicada no schema oficial — mapeados para `"regra_especial"` (documentado em `effectLegacySerialization.ts`). É uma limitação semântica do vocabulário legado real, não uma decisão arbitrária desta correção.
- Descoberta durante a auditoria: nível de talento sem nenhum efeito (nem editável, nem preservado) não é publicável pelo contrato oficial (`minItems: 1`) — pré-existente, fora do escopo desta correção.
- Aceite de browser da Etapa 5 continua pendente (nunca foi diferente).

---

## 10. Não incluído nesta correção

Etapa 6 não iniciada. Nenhuma migração em massa de conteúdo legado. Nenhuma funcionalidade de importação/exportação/homebrew.
