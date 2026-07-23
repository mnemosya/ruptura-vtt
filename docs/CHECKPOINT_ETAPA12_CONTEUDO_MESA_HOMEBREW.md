# Checkpoint — Etapa 12: Conteúdo de mesa e homebrew

## Status

**Status geral da Etapa 12: Implementação parcial — validação transacional e de RLS em Supabase pendente.**

A implementação (migration, resolvedor, Server Actions, validação, UI de narrador, integração com os 4 catálogos consumidos pelos jogadores) está completa e `tsc`/`build` passam. O que falta para "concluída" é exclusivamente a verificação contra um projeto Supabase real: não há projeto conectado disponível nesta sessão, então a migration `0025`, as 4 funções `SECURITY DEFINER` e as policies de RLS novas seguem o mesmo padrão já testado das migrations 0020-0024, mas **nunca foram executadas** (nenhum INSERT, nenhum rollback, nenhuma prova de isolamento entre campanhas em banco real).

A Etapa 11 **permanece exatamente como estava**: "Implementação parcial — integração editorial de drag pendente" — nada nesta etapa altera esse status (ver nota factual em `docs/CHECKPOINT_ETAPA11_IMPORTACAO_EXPORTACAO_BIBLIOTECA_LIVRO.md`).

## 1. Auditoria inicial (resumo — matriz completa)

| Componente | Estrutura atual | Tabela/arquivo | Comportamento | Contexto de campanha | Consumidor | Risco | Adaptação | Decisão desta etapa |
|---|---|---|---|---|---|---|---|---|
| Campanhas | `campaigns.owner_id` (uuid, FK auth.users) = autoridade real de "narrador" | migration 0006/0013 | RLS owner-scoped ENDURECIDA (0013) | — | `table/storage.ts` | Baixo | Nenhuma — reaproveitada como está | `is_campaign_owner()` reusa exatamente essa autoridade, nenhum papel novo |
| Membership/papéis | **Não existe** tabela de membros/papéis de campanha | — | — | — | — | Alto (ambiguidade de "quem é jogador") | — | Documentado como limitação herdada (ver §Segurança) |
| `characters` | RLS `characters_dev_transition_*` — **anon+authenticated, USING(true)**, nunca endurecida (nota F da 0013: exige refactor de storage/auth de jogador) | migration 0002/0011/0013 | Aberta | `campaign_id`/`profile_id`/`owner_id` existem (0011) mas RLS não os usa | `character/storage.ts` | Alto (pré-existente, não desta etapa) | Nenhuma nesta etapa (fora de escopo — auth real de jogador) | Herdado; conteúdo de campanha usa o MESMO piso de confiança |
| `campaign_profiles`/`table_logs` | Anon-aberta, jogador identificado só por sessão/token, não Supabase Auth | 0004/0009/0013 | Aberta | Sim (`campaign_id`) | `enterCampaignProfile`, etc. | Alto (pré-existente) | Nenhuma | Mesmo modelo de confiança reaproveitado para leitura pública de conteúdo de campanha |
| `content_documents`/`content_drafts`/`content_editor_metadata`/`content_changelog` | Globais, admin-only (Etapas 1-11) | 0001/0021/0023/0022 | Sem `campaign_id` | Nenhum | Editor Universal | Médio se reaproveitado incorretamente | **Não reaproveitados** — tabelas novas isoladas | Ver §3 |
| `content_import_sessions`/`content_book_links` | Globais, admin-only/público (Etapa 11) | 0024 | Sem `campaign_id` | Nenhum | Import/export | Baixo | Nenhuma | Fora de escopo desta etapa (ver §Importação/exportação) |
| Consumidores reais de conteúdo | Só 4 pontos de chamada em toda a app: `CharacterSheetView.tsx` (spell/talent/item/rune), `mesas/[campaignId]/page.tsx` (item/rune), `mesas/[campaignId]/personagens/novo/page.tsx` (talent), `dev/table/page.tsx` (dev, sem campanha) | — | `listX()` direto, sem escopo | 3 dos 4 JÁ têm `campaignId` em escopo | ver acima | Baixo (poucos pontos, bem isolados) | Trocar por `listXEffective(campaignId)` | Feito nos 3 com campanha real; `dev/table` mantido oficial (não tem campanha) |
| Conceito de homebrew/override/fork | **Zero ocorrências** em código/banco (grep completo) | — | — | — | — | — | — | Contrato novo, isolado (esta etapa) |

## 2. Decisões arquiteturais (15)

1. **Onde vivem conteúdos de campanha**: tabela nova `campaign_content_documents` (nunca `content_documents` + `campaign_id`).
2. **Onde vivem rascunhos**: tabela nova `campaign_content_drafts` (nunca `content_drafts`).
3. **Onde vive metadata editorial**: tabela nova `campaign_content_editor_metadata`, separada do payload (nunca `_editor` no payload).
4. **Onde vive histórico**: tabela nova `campaign_content_changelog`, separado de `content_changelog` oficial (evita confundir escopo/autoridade).
5. **Como um override referencia o oficial**: `official_document_id` + `official_version_base` + `official_hash_base` + `official_snapshot` (payload completo no momento da base) em `campaign_content_documents`.
6. **Como homebrew independente é identificado**: `origin_type = 'homebrew'`, sem `official_document_id` obrigatório; identidade = `(campaign_id, content_type, slug)`.
7. **Slugs locais**: únicos por `(campaign_id, content_type)`; para operações não-override, bloqueados contra colisão com slug oficial OU outro conteúdo da mesma campanha (nunca contra o catálogo global de outra campanha).
8. **Referências internas**: requisitos continuam resolvidos contra o catálogo OFICIAL (`getContentDocument`) — esta etapa não introduz um segundo grafo de referências internas ao homebrew (ver limitações).
9. **Conteúdo efetivo**: `resolveEffectiveList`/`resolveEffectiveOne` (`resolveEffectiveContent.ts`) — override > oficial, homebrew como entradas adicionais.
10. **Jogadores leem a versão correta**: os mesmos 4 catálogos já consumidos pela ficha/mesa passam a chamar `listXEffective(campaignId)` em vez de `listX()` quando há campanha em escopo.
11. **Detecção de atualização**: comparação de versão E hash da base contra o oficial atual (`classificarEstadoAtualizacao`) — nunca só por número de versão.
12. **Conflitos**: nunca merge automático; 3 decisões explícitas implementadas (manter override, adotar oficial, criar rascunho de reconciliação).
13. **Remoção de override restaura oficial**: arquivamento (nunca DELETE), fallback automático porque a resolução efetiva simplesmente para de encontrar uma linha `published` para aquele slug.
14. **Preservação de instâncias**: nenhuma função desta etapa toca `characters`/inventário/personagem — só `campaign_content_*` (ver §Modelo×instância).
15. **Tipos editáveis**: spell/talent/item/rune (os mesmos 4 do Editor Universal) — os demais tipos não têm homebrew/override nesta etapa (nem inspeção dedicada, já que não há UI de biblioteca de campanha para tipos somente-leitura — ver limitações).

## 3. Tabelas e migration (`0025_campaign_content_homebrew.sql`)

- `campaign_content_documents`: conteúdo efetivo publicado (override ou homebrew), `unique(campaign_id, content_type, slug)`, `status published|archived`.
- `campaign_content_drafts`: rascunhos, `unique(campaign_id, content_type, slug)`, gatilho de versão reaproveitado de `content_drafts_bump_version()` (função genérica já existente, não duplicada).
- `campaign_content_editor_metadata`: efeitos completos por `(campaign_content_document_id, local_version)`.
- `campaign_content_changelog`: histórico, nunca misturado com `content_changelog` oficial.
- Função `is_campaign_owner(campaign_id, uid)`: reaproveita `campaigns.owner_id` — nenhum papel novo.
- Funções `SECURITY DEFINER`: `publish_campaign_content_draft`, `remove_campaign_content_override`, `archive_campaign_homebrew` — cada uma valida narrador + versão otimista + hash de base antes de escrever, tudo em transação única (Postgres garante atomicidade da função).

**Não verificado em banco real** — ver §Verificações não executadas.

## 4. RLS

- `campaign_content_documents`: leitura de `status='published'` aberta a `anon, authenticated` — **mesmo modelo de confiança já usado por `characters`/`campaign_profiles`/`table_logs`** (conhecer o `campaign_id` é o que protege a mesa hoje; não há autenticação real de jogador no projeto — ver auditoria). Leitura de `archived` só para o narrador dono. **Nenhuma policy de insert/update/delete** — toda escrita passa pelas funções `SECURITY DEFINER`.
- `campaign_content_drafts`/`campaign_content_editor_metadata`/`campaign_content_changelog`: só o narrador dono (`is_campaign_owner`) lê ou escreve — nunca `anon`.
- Catálogo oficial (`content_documents` etc.): policies das Etapas 1-11 **preservadas**, nenhuma alteração.

## 5. Homebrew, cópia, override, rascunho, publicação

- `criarRascunhoOverride`: carrega oficial + metadata editorial (quando existe, via `getEditorMetadataAtual`/`sobreporMetadataEditorial` — reaproveitados, nunca duplicados) → rascunho `novo_override`, slug = slug oficial.
- `criarRascunhoCopiaHomebrew`: carrega oficial, gera novo slug/nome, reaproveita `montarCamposECamposDesconhecidosIniciais` (Etapa 3/11) → rascunho `copia_homebrew`; `official_document_id` só como proveniência, nunca vínculo de substituição.
- `criarRascunhoHomebrewNovo`: campos vazios (reaproveita `vazioCamposX`/`rawOriginalXVazio` da Etapa 3).
- `atualizarRascunhoCampanha`: valida via `validarCamposCampanha` (módulo NOVO — ver §8) + optimistic lock.
- `publicarRascunhoCampanha`: reaproveita `serializarRascunhoParaPublicacao` (Etapa 3/5, mesmo formato de envelope) para gerar o payload público final, depois chama o RPC transacional. Nunca publica no catálogo oficial; nunca escreve em `content_documents`/`content_changelog`.
- Botão da UI diz explicitamente **"Publicar na campanha"** (nunca só "Publicar").

## 6. Resolução efetiva (`resolveEffectiveContent.ts`)

`resolveEffectiveList(campaignId, contentType)`: busca oficiais publicados + `campaign_content_documents` publicados da campanha; overrides substituem pelo slug oficial correspondente; homebrews viram entradas adicionais. `resolveEffectiveOne` idem, unitário. Nunca deixa um homebrew substituir um oficial por coincidência de slug (só overrides, vinculados explicitamente por `official_document_id`).

`listSpellsEffective`/`listTalentsEffective`/`listItemsEffective`/`listRunesEffective`: wrappers usados pelos consumidores reais — quando `campaignId` é `null`, caem para o catálogo oficial puro (comportamento idêntico ao anterior a esta etapa).

## 7. Integração com consumidores reais

Só os 3 pontos que já tinham `campaignId` real em escopo foram alterados:
- `CharacterSheetView.tsx` (a ficha de produto `/ficha` e a dev) — talentos, itens, magias, runas.
- `mesas/[campaignId]/page.tsx` (dashboard do narrador) — itens, runas.
- `mesas/[campaignId]/personagens/novo/page.tsx` (assistente de criação) — talento inicial.

`dev/table/page.tsx` (dev, sem campanha real) **não foi alterado** — continua 100% oficial, por decisão explícita (nunca escolher campanha por inferência).

## 8. Validação de campanha (`campaignContentValidation.ts`)

Não reaproveita `validarCamposMagia`/etc. da Etapa 3 diretamente — a checagem de colisão de slug delas rejeitaria incorretamente um override (que precisa ter o MESMO slug do oficial, por design). `validarCamposCampanha` reimplementa a checagem estrutural (nome/slug/custos/requisitos) com uma regra de slug própria de escopo de campanha, e reaproveita `validarEfeitosEditaveis` (Etapa 4) sem duplicar.

## 9. Jogadores leem a versão correta / permissões

- UI de narrador (`/mesas/[campaignId]/biblioteca`): exige login + `owner_id = auth.uid()` (mesmo guard de `/mesas/[campaignId]`).
- Jogadores: nunca acessam esta rota (não há link nem policy que permita insert/update/delete); leem o conteúdo efetivo através dos MESMOS catálogos que já consumiam antes (ficha), agora servidos por `listXEffective`.
- Indicador de origem implementado na UI do narrador (texto, não só cor): "Oficial" / "Modificado pela mesa" / "Homebrew da mesa". **Não implementado no lado do jogador** (a ficha em si não expõe essa distinção visualmente ainda — ver limitações).

## 10. Atualização do oficial / comparação de três vias / conflitos

- `classificarEstadoAtualizacao`: `atualizado` (versão E hash batem) / `oficial_alterado` (versão ou hash diferem) / `oficial_arquivado` (oficial não existe mais) / `base_ausente`. Nunca depende só do número de versão (verificado — ver §Verificações executadas).
- Badge exibido na tabela da Biblioteca da campanha.
- Resolução: **manter override** (`manterOverrideAposRevisao`, só registra changelog), **adotar oficial** (`adotarOficialAtual`, remove/arquiva o override), **criar rascunho de reconciliação** (`criarRascunhoReconciliacao`, reabre edição com o override atual como base). Nenhum merge automático de caminhos conflitantes.
- **Comparação de três vias real (diff estruturado lado a lado oficial-base/oficial-atual/campanha-atual) não tem UI dedicada** — os dados (payload, `official_snapshot`, oficial atual) já existem e são suficientes para construir essa tela, mas a tela em si não foi construída nesta sessão (ver limitações). A UI atual mostra só o estado (badge) e as 3 ações.

## 11. Remoção e restauração

- `removerOverrideCampanha`: exige `origin_type='override'`, exige oficial ainda existir (bloqueia se ausente/arquivado, nunca deixa conteúdo efetivo inexistente silenciosamente), arquiva (nunca apaga), registra changelog `restauracao_oficial`.
- `arquivarHomebrewCampanha`: arquiva homebrew independente (nunca apaga), registra changelog `arquivamento`.
- **Detecção de impacto/referências antes de remover não foi implementada** — o aditivo pede "detectar personagens que conhecem a magia/talento, itens/runas em instâncias" antes de bloquear a remoção; esta etapa NÃO construiu esse detector (ver limitações — é um gap real, documentado, não fingido).

## 12. Modelo × instância

Nenhuma função desta etapa (rascunho, publicação, remoção, arquivamento) toca `characters`, inventário, ou qualquer estado mutável — todas operam exclusivamente sobre `campaign_content_*`. Não há código nesta etapa que leia ou escreva PV/PE/Mana/cargas/MIT/PD/munição/condições/efeitos ativos. Isso é garantido por construção (as funções SQL/TS novas simplesmente não têm acesso a essas tabelas), não apenas por convenção.

## 13. Segurança

- Toda escrita reverifica `is_campaign_owner`/`campaigns.owner_id = auth.uid()` no servidor (Server Action) E no banco (RLS + checagem redundante dentro das funções `SECURITY DEFINER`).
- **Limitação herdada, não introduzida por esta etapa**: não existe autenticação real de jogador nem tabela de membership no projeto — a leitura pública de conteúdo de campanha usa o MESMO piso de confiança que já protege (ou não) `characters`/`campaign_profiles`/`table_logs` desde sempre (conhecer o `campaign_id`). Corrigir isso de verdade exigiria autenticação real de jogador, fora de escopo desta etapa (ver auditoria §1).
- Nenhum service role no client; nenhuma policy genérica para `authenticated`; nenhum `eval`/fórmula arbitrária; nenhum editor de JSON.

## 14. Limites

- Reaproveita os mesmos limites de efeitos/campos já vigentes no Editor Universal (Etapas 4/7/8/9/10) — nenhum limite numérico novo de "quantidade de homebrews/overrides por campanha" foi implementado nesta sessão (não há enforcement de teto — ver limitações).

## 15. Importação/exportação

Não ampliada. O contrato v1 da Etapa 11 não foi alterado; conteúdo de campanha não pode ser exportado/importado por aquele fluxo nesta etapa (documentado como futuro, não implementado).

## Verificações executadas

- `git status --short` — só os arquivos desta etapa.
- `npx tsc --noEmit` — sem erros.
- `npm run build` (Next.js/Turbopack) — sucesso; rotas novas (`/mesas/[campaignId]/biblioteca`, `/mesas/[campaignId]/biblioteca/rascunho/[draftId]`) presentes na árvore.
- Verificação focada em Node puro (mesmo padrão das etapas anteriores): `scripts/dev/validate-campaign-homebrew.mjs` — **5/5 verificações passaram**, cobrindo `classificarEstadoAtualizacao` (atualizado/oficial_alterado por versão/oficial_alterado por hash/oficial_arquivado/base_ausente).

## Verificações não executadas

- **Nenhuma verificação SQL contra Supabase real** (INSERT/UPDATE/rollback das 4 funções `SECURITY DEFINER`, das policies de RLS novas, do isolamento real entre duas campanhas) — sem projeto conectado nesta sessão. É por isso que o status geral é parcial.
- **Browser check** (26 itens equivalentes ao pedido: narrador cria homebrew/override, jogador vê versão efetiva, outra campanha isolada, etc.) — não executado (mesmo bloqueio de `tsx`/esbuild já registrado nos checkpoints anteriores).
- **`resolveEffectiveList`/`resolveEffectiveOne`/Server Actions** não têm verificação executável nesta sessão além do `tsc`/build — dependem de dados reais em `content_documents`/`campaign_content_documents`, que exigem banco conectado.

## Limitações reais (gaps honestos, não escondidos)

- **Detecção de impacto/referências antes de remover homebrew não implementada** — pedido explicitamente no aditivo, não construído nesta sessão.
- **Comparação de três vias com diff estruturado lado a lado não tem UI dedicada** — os dados existem (`official_snapshot`), a tela não foi construída.
- **Indicador de origem (Oficial/Modificado/Homebrew) só existe na UI do narrador**, não na ficha do jogador.
- **Sem teto de quantidade de homebrews/overrides/rascunhos por campanha** — nenhum limite numérico novo aplicado nesta etapa.
- **Sem observabilidade dedicada** (log estruturado de falhas de acesso negado/schema inválido/conflito) além dos erros já retornados pelas Server Actions.
- **Referências internas do homebrew continuam resolvidas só contra o catálogo oficial** — um homebrew que quisesse referenciar outro homebrew da mesma campanha não é suportado nesta etapa (o campo `requisitos` só resolve contra `content_documents`).
- **Cache**: o projeto não tem uma camada de cache de conteúdo dedicada (leituras são diretas ao Supabase, sem `fetch()`/`unstable_cache`), então "invalidação por campanha" não se aplica — não há nada para invalidar além do `revalidatePath` do Next, já usado nas Server Actions.

## Encerramento

TypeScript e build passam; 5 verificações focadas em Node passam; nenhuma publicação automática no catálogo oficial existe em nenhum caminho novo; nenhuma escrita em `content_documents`/`content_drafts` oficiais; nenhuma tabela de marketplace/homebrew público criada; nenhuma instância de personagem é tocada por nenhuma função nova. A Etapa 11 permanece "Implementação parcial — integração editorial de drag pendente", inalterada. **Não avancei para nenhuma etapa adicional** (não existe Etapa 13 neste aditivo).

**Status geral da Etapa 12: Implementação parcial — validação transacional e de RLS em Supabase pendente.**
