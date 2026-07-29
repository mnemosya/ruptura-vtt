# CHECKPOINT — ETAPA 3: EDITOR UNIVERSAL DE CAMPOS BÁSICOS

**Projeto:** Ruptura VTT
**Data:** 14 de julho de 2026
**Checkpoint anterior:** `031ec85` — feat(dev): add reusable Playwright session for authenticated browser checks
**Escopo desta etapa:** criar/editar/duplicar rascunhos de magia, talento e item — sem publicação, arquivamento, changelog, construtor de efeitos ou edição de JSON.

---

## 1. Estratégia de persistência — decisão de arquitetura

**Decisão: tabela separada `content_drafts`**, não extensão de `content_documents`.

Motivos (documentados também no cabeçalho da migration):

1. `content_documents` tem `unique(content_type, slug)`. Um rascunho de **edição** de conteúdo publicado precisa necessariamente do **mesmo slug** do publicado (é o que estabelece o vínculo) — isso colidiria com essa constraint se vivessem na mesma tabela.
2. Toda leitura pública hoje já filtra `status='published'`, mas misturar rascunho e publicado na mesma tabela aumenta a superfície de um bug futuro expor rascunho incompleto a jogadores. Isolamento físico em outra tabela é uma garantia estrutural mais forte que uma cláusula `WHERE`.
3. `content_documents` é "estado atual de um pacote importado" (ver nota de política de versão em `0001_content_library.sql`) — não foi desenhado para edição incremental humana; misturar os dois conceitos complicaria o pipeline de seed existente.

### Migration `supabase/migrations/0021_content_drafts.sql` (aplicada ao banco real)

- `content_drafts(id uuid pk, content_type, slug, base_document_id, base_payload_hash, duplicated_from, payload jsonb, created_by, updated_by, created_at, updated_at, version int)`.
- `unique(content_type, slug)` — igual chave natural de `content_documents`, mas em tabela separada: garante que só existe **um** rascunho ativo por (tipo, slug) — "criar rascunho de edição" reabre o existente em vez de duplicar.
- `base_document_id` referencia `content_documents(id)` — vínculo com o publicado de origem (null para conteúdo novo/duplicado).
- `base_payload_hash` guarda o `payload_hash` do publicado no momento da criação — usado só para **avisar** (nunca bloquear nem fazer merge automático) se o publicado mudou desde então.
- **Controle de edição concorrente**: trigger `content_drafts_bump_version()` incrementa `version` a cada `UPDATE`. O client sempre envia a `version` que carregou; o `UPDATE` só aplica com `.eq("version", expectedVersion)` — zero linhas afetadas = conflito relatado ao admin, nunca sobrescreve silenciosamente.
- **RLS**: habilitada, uma única policy (`content_drafts_admin_all`, `for all to authenticated using (is_content_admin()) with check (is_content_admin())`) — reaproveita a função `is_content_admin()` da Etapa 2. **Nenhuma policy para `anon`. Nenhuma alteração em `content_documents`/`content_packs`/`content_changelog` ou em suas policies.**

---

## 2. Arquitetura do editor

```
src/lib/contentSchema/
├── draftTypes.ts        # DraftEnvelope, CamposMagia/Talento/Item, RequisitoSimples
├── slug.ts               # slugify/isValidSlug/slugDuplicadoSugerido
├── draftMapping.ts        # canônico (Etapa 1) → campos editáveis; inicializadores "vazio"
├── draftValidation.ts      # validação de campos + colisão de slug + referências obrigatórias
├── draftQueries.ts          # leitura de content_drafts (client "scoped", RLS admin)
├── draftView.ts              # monta o modelo de preview (re-adapta rawOriginal via Etapa 1)
└── draftServerActions.ts      # "use server" — as 5 mutações (ver §4)

src/app/admin/biblioteca/
├── rascunhos/
│   ├── page.tsx                     # lista de rascunhos ("reabrir rascunho salvo")
│   ├── novo/{page,NovoConteudoForm}.tsx
│   ├── [id]/{page,DraftEditorClient}.tsx
│   └── _shared/                      # CamposComunsSection, CamposMagiaSection,
│                                      # CamposItemSection, CamposTalentoSection,
│                                      # RequisitosEditor, StringListEditor, PreviewPreservado
└── [contentType]/[slug]/DraftActionsBar.tsx   # botões "Criar rascunho de edição" / "Duplicar"
```

**Decisão-chave de serialização** (o que garante round-trip sem perda, ver §5): o rascunho **não** guarda um payload no formato legado de `content_documents`. Guarda um `DraftEnvelope` com duas metades independentes:

- `camposEditaveis` — só os campos básicos do aditivo §Etapa 3, fonte de verdade do formulário.
- `preservado.rawOriginal` — o payload legado original inteiro (ou um esqueleto mínimo para conteúdo novo), **nunca reescrito** por esta etapa; sempre re-adaptado pelos adapters da Etapa 1 (`adaptSpell`/`adaptItem`/`adaptarNiveisDeTalento`) na hora de exibir efeitos/diagnóstico/campos desconhecidos.

Isso elimina a necessidade de um serializador canônico→legado (que seria significativo e arriscado) nesta etapa — cada metade tem sua fonte de verdade, nunca precisam ser reconciliadas.

**Reuso, não duplicação**: `EffectsPanel`/`DiagnosticsPanel` (Etapa 2) são reaproveitados literalmente pelo editor de rascunho (`PreviewPreservado.tsx`) — nenhuma UI de efeito/diagnóstico duplicada. `is_content_admin()`/`getContentAdminStatus` (Etapa 2) são reaproveitados por toda mutação. `getScopedTableClient` (pré-existente) é reaproveitado para toda leitura/escrita de `content_drafts`.

---

## 3. Campos disponíveis por tipo

**Comuns** (todos os tipos): nome*, slug* (gerado automaticamente do nome, editável, travado quando o rascunho tem `base_document_id`), categoria, subtipo, descrição curta, descrição completa, tags.

**Magia**: vertente, nível, tipo da magia, resolução, custo de PA/Mana/Sobrecarga, perícia de teste, alcance (valor + tipo), área (texto), alvo (campo descritivo — ver limitação abaixo), duração (texto), sustentável, resistência (perícia + CD/fórmula), requisitos simples.

**Talento**: identificação da árvore (nome/slug/tags/descrição) + 3 níveis, cada um com nome do nível, descrição curta/completa, requisitos simples. **Um documento inteiro por árvore, nunca 3 documentos** — `CamposTalento.niveis` é uma tupla fixa de 3.

**Item**: raridade, preço, moeda, quantidade padrão, cargas padrão, custo de PA, disponibilidade, aquisição, propriedades referenciadas (lista de slugs validada contra a Biblioteca real).

**Limitação documentada conscientemente**: `ativação/gatilho/usos/cadência/custo` de nível de talento **não** viram campos editáveis nesta etapa. Auditoria do schema real (`content/schema_talentos_v1_3.json`, `$defs.nivel_talento`) confirma que esses conceitos só existem dentro de `payload_automacao.efeitos[]`, com forma heterogênea por família de efeito — não há um campo único e seguro para editar sem fabricar uma estrutura que não existe no conteúdo real (isso seria "oferecer um controle falso", exatamente o que o checkpoint pede para evitar). Eles continuam visíveis, somente leitura, na seção de efeitos preservados de cada nível. O campo "Alvo" de magia é uma exceção deliberadamente diferente: é um campo **novo e puramente aditivo** (não existe estrutura legada concorrente para ele conflitar), documentado na UI como "descritivo — sem representação estrutural no schema legado ainda".

---

## 4. Fluxos e Server Actions (`draftServerActions.ts`, `"use server"`)

| Função | Fluxo | Resumo |
|---|---|---|
| `criarRascunhoNovo(contentType, nome, slug?)` | 1. Criar novo conteúdo | Valida slug/nome, checa colisão em `content_documents` E `content_drafts`, cria rascunho com `rawOriginal` esqueleto vazio (3 níveis vazios para talento). |
| `criarRascunhoDeEdicao(contentType, slugPublicado)` | 2. Editar conteúdo publicado | Se já existe rascunho para esse (tipo, slug), **reabre** em vez de duplicar. Senão, copia `payload` do publicado para `rawOriginal`, extrai `camposEditaveis` via os adapters da Etapa 1, grava `base_document_id`/`base_payload_hash`. |
| `duplicarConteudo(contentType, origem, novoNome, novoSlug?)` | 3. Duplicar | Origem pode ser publicado ou outro rascunho. Novo slug **obrigatoriamente diferente** (validado contra publicado + rascunhos). `rawOriginal` ajustado com o novo slug/nome antes de re-adaptar — como os `id`s de efeito são gerados a partir do slug pelos adapters da Etapa 1, a identidade interna dos efeitos já muda automaticamente, sem trabalho extra. `base_document_id` fica `null` (não é uma edição do original). |
| `atualizarRascunho(id, campos, expectedVersion)` | Editar rascunho | Reconfirma admin, recarrega o rascunho, compara `version` (conflito de concorrência), roda a validação de campos (`draftValidation.ts`), só então grava. |
| `excluirRascunho(id)` | Cancelar-e-descartar / limpeza de testes | Delete direto, sempre reconfirmando admin. |

Todas as cinco: revalidam admin no servidor (`getContentAdminStatus`), escrevem via `getScopedTableClient()` (sessão do admin anexada — a RLS de `content_drafts` reforça a mesma checagem no banco, nunca uma única camada), nunca confiam em `content_type` vindo do client para decidir permissão, e nunca usam a service role key.

**Cancelar**: navegar para longe com alterações pendentes dispara `window.confirm` (rastreamento de "sujo" client-side); se confirmado, nada é persistido — o estado em `content_drafts` continua exatamente como estava no último "Salvar". `beforeunload` também é armado enquanto há alterações não salvas.

---

## 5. Preservação de legados e round-trip

- `preservado.rawOriginal` nunca é escrito por esta etapa — só lido e re-adaptado a cada render (via Etapa 1). Reabrir um rascunho nunca "reconstitui" um payload legado a partir dos campos editados.
- `estatisticas` de item, `payload_automacao.efeitos[]` de todos os tipos, `familia`/campos bespoke de talento — tudo continua vindo do `rawOriginal`, mostrado somente leitura com o diagnóstico de automação da Etapa 1 (nenhum controle de edição falso oferecido para eles).
- Campos desconhecidos (`camposDesconhecidos`, computados pelo adapter no momento da criação/edição) continuam expostos na seção "Diagnóstico técnico" de cada nível/documento — nunca descartados.
- Divergência entre publicado e rascunho: se o rascunho tem `base_document_id`, a cada carregamento compara o `payload_hash` atual do publicado com o guardado em `base_payload_hash` — aviso visível ("O conteúdo publicado mudou desde a criação deste rascunho"), sem bloquear e sem fazer merge automático.

---

## 6. Validações

Camada nova (`draftValidation.ts`) complementa — nunca substitui — `validarConteudo` (Etapa 1, que continua validando os efeitos preservados/somente-leitura de cada nível).

**Bloqueantes**: nome ausente; slug ausente/inválido (regex); colisão de slug contra `content_documents` OU outro rascunho; custos negativos (PA, Mana, Sobrecarga, preço, quantidade, cargas); referência obrigatória inexistente (requisitos e propriedades de item, verificados contra a Biblioteca real via `getContentDocument`).

**Avisos**: sem descrição curta; sem vertente/nível (magia); nível de talento sem nome ainda.

O rascunho pode ser salvo incompleto (a estratégia de persistência permite isso — `content_drafts` não exige nenhum campo além de nome/slug para a linha existir); a tela deixa isso visível ("Rascunho — não disponível no jogo") e a futura publicação (Etapa 5) continuará bloqueada por essa mesma validação.

---

## 7. Preview

Mostra: nome, tipo, descrição curta, "Rascunho — não disponível no jogo" (sempre visível), e — por nível/documento — os efeitos preservados em cards somente leitura (reaproveitando `EffectsPanel`), com resumo de automação (✓ automático / ◐ assistido / ✎ lembrete / ▶ narrativo rastreado / ✕ sem executor) e um aviso explícito: *"Estes efeitos serão editáveis no Construtor de Automações (Etapa 4)"*. Diagnóstico técnico (validação + referências + campos desconhecidos) fica num `<details>` recolhido — nenhum JSON bruto aparece no fluxo principal.

---

## 8. Correção incidental na Etapa 1

Durante a extração de campos de magia, encontrei um bug latente no adapter da Etapa 1 (`src/lib/contentSchema/adapters/spell.ts`): `pericia_teste`/`atributo_ataque` estavam marcados como "campos conhecidos" (excluídos de `camposDesconhecidos`) mas nunca eram de fato copiados para `classificacao` — ficavam silenciosamente perdidos na leitura. Corrigido (agora `classificacao.periciaTeste`/`classificacao.atributoAtaque` são populados). Sem esse ajuste, o campo "Perícia de teste" do editor de magia não teria como funcionar. Reconfirmado com o script de verificação da Etapa 1 (`npm run test:canonical-schema`, ver §10) e com o browser check desta etapa.

---

## 9. Segurança

- Gate de admin da Etapa 2 (`src/app/admin/layout.tsx`) continua único ponto de entrada — reaproveitado sem alteração.
- `content_drafts` só é legível/gravável por `authenticated` + `is_content_admin()` — reforço de RLS independente da checagem em `getContentAdminStatus()` (defesa em profundidade).
- Toda mutação reconfirma admin no servidor antes de tocar o banco; nenhuma decide permissão com base em dado vindo do client.
- Nenhuma policy nova para `anon`. Nenhuma alteração nas policies existentes de `content_documents`/`content_packs`/`content_changelog`.
- Nenhum uso de service role no client ou em qualquer Server Action desta etapa.
- Nenhuma mutação de `content_documents` publicado é possível nesta etapa — confirmado pelo browser check (§11, item 7).

---

## 10. Mecanismo autenticado reutilizado (browser checks)

Reaproveitado integralmente, sem recriação: `scripts/dev/authSession.ts` (`BASE_URL`, `SESSION_FILE`, `withAuthenticatedPage`, `assertAdminSessionValid`, `requireSessaoSalva`, `sessaoSalvaExiste`), `.auth/admin-session.json`, `npm run auth:save-session`.

Novo script desta etapa: **`scripts/dev/check-admin-content-drafts.ts`** (`npm run check:admin-content-drafts`). Cria rascunhos de teste com prefixo inequívoco (`zz_e2e_etapa3_`) e sempre os remove ao final — inclusive em caso de falha (bloco de limpeza de emergência) e mesmo resíduos deixados por uma execução anterior que tenha travado (varredura prévia da lista de rascunhos). Se a sessão local não existir/tiver expirado, o script interrompe com a mensagem para rodar `npm run auth:save-session` — nunca inventa um bypass, nunca imprime cookie/token.

---

## 11. Resultado do browser check (rodado no terminal da proprietária da conta)

```
1. Acesso sem login bloqueado — OK
2. Usuário autenticado sem admin — PULADO (exigiria criar uma segunda credencial de teste; fora do escopo deste script)
3. Admin cria rascunho de magia — OK
   Admin edita o rascunho e salva — OK
4/5. Rascunho reaparece com a edição após reload — OK
6. Admin cria rascunho de edição a partir de conteúdo publicado — OK
7. Conteúdo publicado permanece inalterado depois de editar o rascunho — OK
8/9. Item duplicado como novo rascunho com novo slug/ID — OK
10/11. Rascunho de talento mantém os 3 níveis com efeitos/campos preservados — OK
12. Cancelar alterações não salva — OK
13. Preview mostra status de rascunho — OK
14. Console sem erros — OK (0 erros coletados)
15. Dados de teste removidos (4 rascunhos) — OK
```

O item 2 ("usuário sem admin bloqueado") foi deliberadamente pulado — o checkpoint só pede esse teste "quando houver forma segura de verificar sem criar credenciais", e criar uma segunda conta de teste estaria fora do escopo de um script que não deve inventar credenciais. A checagem de RLS + gate de layout para esse caso já está coberta estruturalmente (mesma função `is_content_admin()` testada e funcionando desde a Etapa 2).

Durante o desenvolvimento, uma execução do script revelou um bug real no **próprio script de teste** (verificava o slug via `textContent`, mas o valor só existe dentro de um `<input>`, que não aparece em `textContent`) — corrigido para usar `inputValue()`. Não era um bug do editor.

---

## 12. Limitações

- `ativação/gatilho/usos/cadência/custo` de nível de talento permanecem somente leitura (ver §3) — decisão deliberada, não pendência esquecida.
- `estatisticas` de item continua somente leitura (decisão já registrada desde o schema canônico, reconfirmada aqui).
- "Alvo" de magia é um campo novo puramente aditivo, sem representação estrutural no schema legado ainda.
- Nenhuma publicação, arquivamento, changelog, construtor de efeitos ou edição de JSON — fora de escopo desta etapa por definição.
- Checagem "usuário sem admin" não tem cobertura de browser check automatizado nesta etapa (ver §11).
- Validação de referências (`requisitos`/`propriedades`) depende de uma consulta de rede por item — aceitável para o volume de campos desta etapa, mas não otimizado (sem cache/batch).
- Duplicação de talento gera um novo rascunho com os mesmos 3 níveis do original (campos editáveis "resetados" para o nome/slug novo mas texto dos níveis preservado) — não foi testado exaustivamente com árvores parcialmente preenchidas; comportamento esperado, não coberto por asserção específica no browser check.

---

## 13. Validação técnica

- `npx tsc --noEmit` — sem erros.
- `npm run build` — sucesso; novas rotas registradas: `ƒ /admin/biblioteca/rascunhos`, `ƒ /admin/biblioteca/rascunhos/[id]`, `ƒ /admin/biblioteca/rascunhos/novo`.
- `next-env.d.ts` — inalterado.
- Round-trip verificado indiretamente pelo próprio browser check (criar → editar → reload → valor persistido idêntico ao editado, nunca ao original) e pela preservação confirmada de efeitos/campos desconhecidos do talento e da magia de origem.
- Um conflito de arquitetura do esbuild reapareceu brevemente durante o desenvolvimento (ambiente do agente vs. terminal local) — resolvido seguindo a instrução explícita: nenhuma reinstalação repetida, verificação feita via `tsc` (que não depende de esbuild) no ambiente do agente, e os comandos que dependem de `tsx`/Playwright rodados exclusivamente no terminal onde `npm install` e o Playwright já funcionavam.

---

## 14. Próximos passos (não iniciados nesta etapa)

Conforme `docs/PLANO_IMPLEMENTACAO_EDITOR_UNIVERSAL.md`, a **Etapa 4 — Construtor de Efeitos MVP** é o próximo passo natural: permitir adicionar/editar/remover os 6 efeitos do MVP (dano, cura, aplicar condição, remover condição, modificar teste, alterar recurso) dentro do rascunho, substituindo a seção "somente leitura" de efeitos por controles reais — o que finalmente exigirá um serializador canônico→legado (evitado nesta etapa por design). Esta etapa não inicia esse trabalho.
