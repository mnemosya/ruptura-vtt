# CHECKPOINT — ETAPA 4: CONSTRUTOR DE EFEITOS MVP

**Projeto:** Ruptura VTT
**Data:** 14 de julho de 2026
**Checkpoint anterior:** `d12be18` — docs: document basic content editor checkpoint (Etapa 3)
**Escopo desta etapa:** permitir montar/editar/organizar os 6 efeitos do MVP (dano, cura, aplicar condição, remover condição, modificar teste, alterar recurso) dentro dos rascunhos de magia/talento/item — sem publicação, sem efeitos compostos, sem construtor de JSON.

---

## 1. Arquitetura

### 1.1 Camada compartilhada (`src/lib/contentSchema/`)

Os 6 efeitos **não são 6 sistemas isolados** — compartilham um único envelope, um único mecanismo de diagnóstico e uma única validação:

```
src/lib/contentSchema/
├── effectDraftTypes.ts        # EfeitoEditavel (union discriminada sobre `tipo`) + CamposEfeitoComuns
│                               # (id estável, habilitado, ordem, gatilho, alvo, duração, textos de log/lembrete)
├── effectDraftMapping.ts        # canônico (Etapa 1) → editável, uma única vez (na criação do rascunho)
├── effectDiagnostics.ts          # deriva modoAutomacao — nunca escolhido pela pessoa administradora
├── effectDraftValidation.ts       # validação dos 6 tipos, reaproveitada por magia/item/talento
└── characterRuleOptions.ts         # tipos de dano/perícias/atributos reais da Biblioteca (nunca hardcoded)
```

`EfeitoEditavel` é uma união discriminada por `tipo`:

```ts
type EfeitoEditavel =
  | (CamposEfeitoComuns & { tipo: "dano"; campos: CamposDano })
  | (CamposEfeitoComuns & { tipo: "cura"; campos: CamposCura })
  | (CamposEfeitoComuns & { tipo: "aplicar_condicao"; campos: CamposAplicarCondicao })
  | (CamposEfeitoComuns & { tipo: "remover_condicao"; campos: CamposRemoverCondicao })
  | (CamposEfeitoComuns & { tipo: "modificar_teste"; campos: CamposModificarTeste })
  | (CamposEfeitoComuns & { tipo: "alterar_recurso"; campos: CamposAlterarRecurso });
```

`CamposEfeitoComuns` (id, habilitado, ordem, nomeOpcional, gatilho, alvo, duração, textoLog, textoLembrete) é a estrutura-base pedida no checkpoint — só `campos` varia por tipo. `GATILHOS_INICIAIS`/`ALVOS_INICIAIS` (também em `effectDraftTypes.ts`) são as listas únicas de gatilho/alvo — nenhum efeito redefine sua própria lista.

### 1.2 UI (`src/app/admin/biblioteca/rascunhos/_shared/`)

```
EffectsEditorSection.tsx   # lista: adicionar/duplicar/remover/reordenar/habilitar — um componente, não seis
EfeitoCamposPorTipo.tsx     # UM switch (nunca duplicado em outro arquivo) delegando a 6 funções de campo curtas
DuracaoEditor.tsx            # editor de duração compartilhado pelos 6 tipos
EffectsPreviewList.tsx        # preview compacto, em ordem, reaproveitado no bloco "Preview"
```

`EffectsEditorSection` é usada exatamente da mesma forma para magia, item (`DraftEditorClient.tsx`) e cada nível de talento (`CamposTalentoSection.tsx`) — não há três implementações.

### 1.3 Onde os efeitos vivem em cada tipo de conteúdo

- **Magia/Item**: `camposEditaveis.campos.efeitos: EfeitoEditavel[]` — direto no documento.
- **Talento**: `camposEditaveis.campos.niveis[i].efeitos: EfeitoEditavel[]` — por nível, nunca a árvore inteira vira 3 documentos (arquitetura da Etapa 3 mantida).
- `estatisticas` de item continua exatamente como preservado/somente-leitura era na Etapa 3 — o Construtor de Efeitos nunca grava nela.

---

## 2. Decisão de arquitetura: por que não precisou de migration

`content_drafts.payload` (JSONB, Etapa 3) já comporta o construtor sem alteração de schema — os 6 tipos de efeito só adicionam mais uma chave (`efeitos: EfeitoEditavel[]`) dentro do `DraftEnvelope` já existente, que é JSONB livre. **Nenhuma migration foi criada nesta etapa.**

## 3. Modelo de conversão: promoção de efeito, nunca reescrita do legado

Ao criar um rascunho de edição (ou duplicar), os efeitos canônicos (Etapa 1) do `rawOriginal` são classificados **uma única vez**:

- Se `tipo` ∈ {dano, cura, aplicar_condicao, remover_condicao, modificar_teste, alterar_recurso} → **promovido a editável** (`extrairEfeitosEditaveis`, `effectDraftMapping.ts`) — vira a fonte de verdade em `camposEditaveis.campos.efeitos`.
- Qualquer outro tipo (`teste_resistencia`, `outro`/bespoke) → **permanece somente leitura**, sempre re-derivado de `rawOriginal` pelos adapters da Etapa 1 (`filtrarEfeitosSomenteLeitura`) — nunca duplicado na tela (a seção "Efeitos ainda não editáveis" só mostra o que sobrou fora do MVP).

`rawOriginal` **nunca é reescrito** — a mesma garantia estrutural da Etapa 3. Isso significa que salvar edições no Construtor de Efeitos não tem como apagar `estatisticas`, campos bespoke ou efeitos fora do MVP: eles simplesmente não são tocados, sempre lidos direto do payload original.

**Identidade de efeito**: o `id` de um efeito editável nasce uma única vez (na promoção inicial, herdado do `id` gerado pelos adapters da Etapa 1, ou via `crypto.randomUUID()` para efeitos novos/duplicados) e nunca é recriado ao reordenar, habilitar/desabilitar ou salvar — reordenar é só um swap de posição no array, seguido de recomputar `ordem = índice` (a ordem persistida é sempre a ordem mostrada).

---

## 4. Modo de automação — derivado, nunca escolhido

`effectDiagnostics.ts::diagnosticarEfeitoEditavel` roda a cada render (client-side, síncrono, sem rede) e nunca deixa o resultado passar do teto estático do catálogo (`effectTypeRegistry.ts`, Etapa 1) para aquele `tipo`. Exemplos reais implementados:

| Situação | Resultado |
|---|---|
| Cura com fórmula + recurso + alvo definidos | **Automático** (`itemUse.ts::applyGmHealing` já existe) |
| Dano com fórmula/tipo completos | **Assistido** (rola, mas resolução em magia/item ainda depende de confirmação) |
| Aplicar condição com condição real + alvo resolvido, sem exigir confirmação | **Automático** (novo executor genérico, ver §5) |
| Aplicar condição com `confirmacaoManual` marcado ou alvo "selecionado manualmente" | **Assistido** |
| Aplicar condição sem `condicaoSlug` | **Sem executor** |
| Modificar teste "bônus"/"penalidade" sem valor numérico | **Sem executor** (configuração incompleta nunca aparece como automática) |
| Alterar recurso PA em "ao encerrar rodada" com operação "reduzir" | **Automático** (único caso real hoje, `endRoundConditions.ts`) |
| Alterar recurso em qualquer outro caso | **Assistido** (recurso reconhecido, sem executor automático genérico ainda) |

Dupla trava contra automação inventada: `EffectsEditorSection`/`EfeitoCamposPorTipo` nunca oferecem um controle de "modo de automação" editável — é sempre texto derivado; e `effectDraftValidation.ts` reconfirma, por efeito, que o modo mostrado bate com o que o catálogo permite, virando aviso quando incompleto.

### 4.1 Catálogo atualizado (`effectTypeRegistry.ts`)

`aplicar_condicao` teve seu teto elevado de **lembrete** (Etapa 1 — nenhum executor existia) para **assistido** (Etapa 4 — o executor genérico agora existe e está conectado a um fluxo real). O texto da entrada no catálogo documenta o porquê. Isso é uma mudança de dado partilhado — o mesmo campo já usado pela lista/detalhe administrativos (Etapa 2) e pelos exemplos permanentes (Etapa 1) — então o script `test-canonical-content-schema.ts` foi atualizado de acordo (rodado e confirmado passando, ver §9).

---

## 5. Executor genérico de `aplicar_condicao`

**`src/lib/character/conditionEffectExecutor.ts`** (`executarAplicarCondicao`, `"use server"`) — não exclusivo de nenhuma magia/talento/item. Passos, sempre nesta ordem:

1. valida que a condição existe e está **publicada** na Biblioteca (`getContentDocument("condition", slug)`) — nunca aceita texto livre;
2. resolve a duração (override do efeito > duração padrão da condição);
3. delega a mutação para `applyGmCondition` (já existente, usado por `/dev/table`) — que já trata "acúmulo": no modelo atual de `ActiveCondition` (sem campo de pilhas), a mesma condição não duplica enquanto ativa;
4. gera texto de log legível;
5. **nunca aplica parcialmente** — qualquer falha de validação retorna `{ ok: false }` sem tocar o personagem; a função é pura (não persiste sozinha), então nenhum recurso é consumido antes da validação rodar.

### 5.1 Fluxo operacional conectado

Escolhido após auditoria do código: `src/app/dev/table/TableClient.tsx::handleGmApplyCondition` — a ferramenta manual "Aplicar condição" do narrador em `/dev/table`, que já existia, já tinha seleção explícita de alvo (dropdown de personagem) e já persistia via `persistGmMutation` + log em `table_logs`. A troca foi cirúrgica: a chamada direta a `applyGmCondition` virou uma chamada a `executarAplicarCondicao` (validação primeiro), preservando toda a lógica de autoria (Praga) e duração estendida (Sangria Lenta) já existente. As dezenas de outras chamadas a `applyGmCondition` no mesmo arquivo (mecânica bespoke de talentos — Fincada, Muralha, etc.) **não foram tocadas** — não é um executor exclusivo por conteúdo, mas também não substitui mecânica bespoke já funcionando.

Isso satisfaz literalmente o requisito de não aplicar automaticamente as 51 ocorrências legadas de `aplicar_condicao` sem avaliar compatibilidade: o executor só é alcançável hoje por essa única ação manual do narrador, nunca disparado a partir de conteúdo publicado sem confirmação humana.

---

## 6. Campos por efeito (resumo)

Todos compartilham gatilho/alvo/duração/texto de log (estrutura comum, §1.1). Campos específicos:

- **Dano**: controle amigável (tipo de fórmula fixo/dados/dados+modificador, quantidade, seletor de dado d4–d100, modificador) que gera a fórmula internamente (`formatarFormulaDano`); tipo/subtipo de dano vindos **dinamicamente** da Biblioteca (`character_rule.tipos_dano`, nunca hardcoded); dano principal/adicional; ignora MIT/PD; metade em sucesso.
- **Cura**: mesmo controle amigável; recurso (PV/PE/Mana/Integridade/PD); limitar ao máximo; permitir valor temporário.
- **Aplicar condição**: `condicaoSlug` é uma referência estruturada (`<select>` populado com condições reais publicadas, nunca texto livre); intensidade/pilhas; acumulável + máximo de pilhas; autoria; confirmação manual.
- **Remover condição**: condição específica OU lista de condições possíveis OU seleção manual OU remover todas; quantidade removida; bloquear sem condição compatível (reaproveita a mesma detecção/remoção de `itemUse.ts`/`actionConsole.ts` — nenhuma lógica duplicada, o Construtor só monta os dados que esses executores já entendem).
- **Modificar teste**: modo (bônus/penalidade exigem valor numérico; vantagem/desvantagem não); atributo e perícia **vindos dinamicamente** de `character_rule` (nunca só "Luta" hardcoded); ação; defesa; tags; acumulável + máximo; consumir no próximo teste; confirmação de contexto.
- **Alterar recurso**: recurso (lista fechada aos recursos já reconhecidos pela auditoria — PV/PE/Mana/Integridade/PA/Reações/Sobrecarga/RAM/cargas/munição/dados de gatilho, nunca generalizado); operação (somar/reduzir/definir/conceder temporariamente); valor fixo ou fórmula; mínimo/máximo; bloquear por insuficiência.

---

## 7. Compatibilidade com legados — classificação real

Ao abrir um rascunho de edição, cada efeito do payload original é classificado exatamente uma vez:

- **editável**: tipo ∈ MVP, convertido para `EfeitoEditavel` (ex.: `dano`, `cura`, `aplicar_condicao`, `remover_condicao`, `modificar_teste`, `alterar_recurso` da magia/item/talento de origem).
- **somente leitura**: `teste_resistencia`, `outro`/bespoke — mostrados na seção "Efeitos ainda não editáveis", sempre re-derivados de `rawOriginal`, nunca convertidos nem perdidos.

Confirmado com conteúdo real: `energetica_bola_de_fogo` (spell publicada) tem `efeito_com_resistencia` (permanece somente leitura), `dano` e `aplicar_condicao` (ambos promovidos a editáveis) — o rascunho de edição mostra os três corretamente separados.

**Conversão só acontece dentro do rascunho** — `content_documents` nunca é escrito por esta etapa (mesma regra da Etapa 3).

---

## 8. Validação

`effectDraftValidation.ts::validarEfeitosEditaveis` (chamada por `validarCamposMagia`/`Item`/`Talento`, Etapa 3, com prefixo "Efeitos"/"Nível N — Efeitos"):

**Bloqueantes**: tipo fora do MVP; ID ou ordem duplicados; ordem inválida; gatilho/alvo ausentes; fórmula inválida (quantidade/faces não-positivos, valor fixo ausente/negativo); tipo de dano ausente; recurso de cura/alterar-recurso inválido; condição referenciada inexistente na Biblioteca (`aplicar_condicao`, `remover_condicao` — verificado via `getContentDocument`); modo "bônus"/"penalidade" sem valor numérico; nem tag/perícia/ação definidos em "modificar teste"; mínimo > máximo em "alterar recurso".

**Avisos**: modo vantagem/desvantagem com valor numérico definido (será ignorado); flags MIT+PD simultâneas; valor negativo com operação incompatível; efeito com configuração incompleta (diagnosticado como "sem executor"); efeito habilitado mas classificado como "lembrete".

"Perda de campo preservado" e "divergência entre modo de automação e executor" são estruturalmente impossíveis nesta arquitetura (rawOriginal nunca tocado; modoAutomacao sempre derivado, nunca lido de um campo editável) — não exigem checagem de runtime além da já existente.

---

## 9. Validação técnica

- `npx tsc --noEmit` — sem erros.
- `npm run build` — sucesso; rotas inalteradas desde a Etapa 3 (o Construtor de Efeitos vive dentro das rotas já existentes de rascunho).
- `npm run test:canonical-schema` (round-trip da Etapa 1, reexecutado por afetar o catálogo compartilhado) — **todos os testes passaram**, incluindo a asserção atualizada de `aplicar_condicao` (modoAutomacao agora "assistido").
- `next-env.d.ts` — inalterado.
- Um conflito de arquitetura do esbuild reapareceu durante o desenvolvimento (mesmo padrão das etapas anteriores) — resolvido sem reinstalar dependências, rodando os comandos `tsx`/Playwright exclusivamente no terminal onde já funcionavam.

### 9.1 Browser check (`scripts/dev/check-admin-effect-builder.ts`, `npm run check:admin-effect-builder`)

Reaproveita integralmente `scripts/dev/authSession.ts` (`withAuthenticatedPage`, `.auth/admin-session.json`, `npm run auth:save-session`) — nenhuma estrutura de sessão recriada.

**Rodada corretiva (julho/2026)** — revisão completa dos seletores do script, feita de uma vez (não um de cada vez), corrigindo 3 problemas reais encontrados em execuções ao vivo:

1. Colisão de prefixo `talento-nivel-N` vs `talento-nivel-N-nome` sob `[data-testid^="talento-nivel-"]` — renomeado o wrapper de seção para `talento-nivel-secao-N`.
2. `.filter({ hasText })` no painel de personagem de `/dev/table` resolvia para 2 elementos: o `<select>` de autoria de cada personagem lista o nome de **todos os outros** personagens como opção (`estado-condicao-autor-${characterId}`, `TableClient.tsx`), então o texto de "Personagem A" aparece dentro do painel de "Personagem B" e vice-versa. Trocado por localização exclusivamente pelo `id` real do personagem na fixture (`estado-personagem-<uuid>`) — nunca mais por nome.
3. **Bug real de comportamento, não só de seletor**: `page.reload()` zera `selectedCampaignId` (estado React puro, sem URL nem `localStorage`) — a seção "Estado dos personagens" fica condicionada a esse estado (`{selectedCampaignId && (...)}`), então qualquer reload precisa reselecionar a mesa antes de continuar. O script tinha um reload (para confirmar que a condição persiste no banco, não só na memória do client) sem essa reseleção — corrigido com um helper único (`selecionarMesaFixture`) usado nos 3 pontos que fazem `goto`/`reload`.

Também adicionada uma melhoria de diagnóstico: os erros de console coletados agora são sempre impressos ao final da execução, mesmo quando o script quebra antes do item 24 — antes, uma falha anterior ao ponto onde esse log era emitido escondia qualquer erro de JS real que pudesse explicar a falha.

**Confirmado passando, em execuções reais no terminal da proprietária da conta, após essas correções:**

```
1. Acesso sem login bloqueado — OK
0/0b. Limpeza prévia de resíduos (rascunhos + condição de teste na mesa compartilhada) — OK
2. Admin abre rascunho de magia — OK
3. Dano 1d8 (energético/ígneo) adicionado — OK
4/5. Salva e recarrega — efeito mantém ordem e campos (1 único card) — OK
6/7/8. Aplicar condição com condição real ('atordoado') — diagnóstico exibido — OK
9. Reordena os efeitos — OK
10. Duplica um efeito — OK
11. Remove um efeito — OK
12. Cancelar alterações não salva — OK
18. Efeito legado (teste_resistencia) permanece preservado — OK
19. Nenhum JSON bruto vazando no fluxo principal — OK
20. Preview reflete os efeitos configurados — OK
25. Limpeza final dos rascunhos criados — OK (confirmado em toda execução, inclusive as que falharam depois)
```

**Itens 13–17 (item com cura, item com remover condição, talento com +1 Luta e alterar recurso no nível 2)**: confirmados passando em pelo menos uma execução real desta sessão já com o código de seletor atual (`cura-recurso`, `talento-nivel-secao-N` etc.). Na última execução, porém, o script parou antes de chegar neles — travou aguardando o controle `novo-efeito-tipo-item` ao montar o rascunho de item, sem nenhum defeito de código correspondente identificado (o wiring de `escopoId="item"` em `DraftEditorClient.tsx` está correto e esse mesmo trecho já tinha passado antes na mesma sessão). Leitura mais provável: instabilidade pontual do ambiente local (servidor/Supabase), não um bug do editor ou do script.

**Itens 21–23 (fluxo operacional real do executor genérico de `aplicar_condicao` em `/dev/table` — aplicar condição, persistência após reload, segunda tentativa bloqueada sem duplicar)**: **não concluídos em nenhuma execução até agora**. As tentativas anteriores foram bloqueadas por dois problemas de seletor já corrigidos nesta rodada (colisão de `hasText` no painel do personagem; reload que zera a mesa selecionada sem reseleção) — mas depois dessas correções não houve uma execução que chegasse a rodar os itens 21–23 até o fim, porque a rodada seguinte parou antes, no item 13. Por decisão da proprietária da conta, os testes foram encerrados aqui — esses itens ficam para verificação manual com jogadores, não para mais uma rodada de browser check.

**Status desta etapa**: **"Implementação concluída — aceite operacional parcial."** Itens 1–12 e 18–20 do browser check confirmados de forma consistente em múltiplas execuções. Itens 13–17 confirmados em ao menos uma execução com o código atual, mas não na última. Itens 21–23 (executor operacional de condição) não concluídos — barrados pelo problema de seletor da mesa (corrigido no código, não reverificado em execução). Build e TypeScript aprovados. O aceite completo (25/25 numa única execução) **não** foi alcançado nesta sessão, e não haverá nova tentativa automatizada — a decisão foi encerrar os testes aqui e confirmar o restante manualmente com jogadores.

## 9.2 Aceite de browser — rodada de auditoria formal do Editor Universal (Etapas 4–10)

**Data**: 24-25/07/2026. **Ambiente**: `next dev` local + Supabase real (`yvxoijexyhjjipjktfuu`), via ferramenta de browser (não Playwright/`tsx` — mesmo bloqueio de arquitetura esbuild `darwin-x64` vs `arm64` confirmado ainda presente neste ambiente). **Fixtures**: usuário admin temporário criado via fluxo real de cadastro (`/login` → "Criar conta", já que a service role key local está desatualizada — chave de assinatura JWT do projeto rotacionada; achado registrado, não é um bug de código) + `admin_users` via SQL direto.

Reexecutados ao vivo, com evidência individual: criação de rascunho de magia; adição de efeito `dano` (1d8 energético) com `alvo`/`gatilho` corretos, `modoAutomacao` = "Assistido" confirmado; adição de `aplicar_condicao` referenciando a condição real "atordoado" (picker populado a partir da Biblioteca real), `modoAutomacao` = "Assistido"; validação bloqueante real capturada ("alvo obrigatório ausente") e corrigida; salvar com sucesso; reload confirmando persistência exata (ordem, IDs, campos); reordenar (▲); duplicar; remover (achado: `window.confirm()` é suprimido pela ferramenta de browser, retornando `false` — não é um bug do app, contornado sobrescrevendo `window.confirm` antes do clique); cancelar (descarta alteração não salva corretamente); preview reflete os 2 efeitos sem vazar JSON bruto; publicação bem-sucedida (1.0.0). Item com `cura` (2d6→1d4 conforme o teste, `modoAutomacao`="Automático") e `remover_condicao` (envenenado, "Automático"): criado, salvo, publicado com sucesso.

**Bug crítico encontrado e corrigido nesta rodada** (não é dos itens 21–23, é um achado novo): ao montar um rascunho de talento com efeitos pós-MVP (Etapa 7–10) para testar as etapas seguintes, "Salvar rascunho" rejeitou todos com `"tipo de efeito inválido para o Construtor de Efeitos (só os 6 tipos do MVP são suportados)"` — `effectDraftValidation.ts` ainda usava `isTipoEfeitoMvp` em vez de `isTipoEfeitoEditavel`. Corrigido (troca de 2 linhas); reexecutado com sucesso. Detalhes completos, causa raiz e impacto em `docs/CHECKPOINT_CORRECAO_VALIDACAO_TIPOS_EFEITO_POS_MVP.md`. Este bug não afeta os 6 tipos MVP desta etapa (por isso os itens 1–20 já testados antes continuavam passando) — só bloqueava tipos introduzidos a partir da Etapa 7.

**Itens 21–23 (executor operacional de `aplicar_condicao` via `/dev/table`)**: **não executados nesta rodada** — fora do escopo desta auditoria por decisão de tempo/risco (exigiria fixture completa de campanha/personagem/mesa e não é um item bloqueado por um defeito conhecido, apenas nunca verificado ao vivo; o próprio checkpoint original já havia decidido deferir isso para verificação manual com jogadores, não para uma nova rodada de browser check).

Console e rede: nenhum erro em nenhum passo verificado. Fixtures completamente removidas ao final (drafts, documentos publicados, changelog, usuário admin) — confirmado por contagem zero.

**Status permanece**: **"Implementação concluída — aceite operacional parcial."** Não promovido a "concluída — aceite de browser aprovado" porque os itens 21–23 (fluxo operacional real, não apenas editorial) continuam sem execução — critério explícito do aditivo para essa etapa. A correção do bug de validação de tipos pós-MVP é o achado principal desta rodada; não altera o status desta etapa especificamente (o bug não afetava os 6 tipos MVP), mas foi decisivo para destravar o aceite das Etapas 7–10.

## 9.3 Rodada de conclusão do aceite operacional (25/07/2026)

**Objetivo exclusivo desta rodada**: reconstruir o checklist original de 25 itens do browser check (`scripts/dev/check-admin-effect-builder.ts`), separar aprovado de pendente com evidência concreta, e executar especificamente os itens 21–23 — os únicos que nunca tinham sido concluídos em execução alguma (nem na sessão original, nem na auditoria formal §9.2). Não reabre Etapas 5–12, não repete importação/exportação, drag editorial, RLS, concorrência ou conteúdo de campanha, não implementa efeito novo.

### Checklist reconstruído (25 itens, fonte: `check-admin-effect-builder.ts`)

| # | Descrição original | Rota/componente | Classificação | Evidência |
|---|---|---|---|---|
| 1 | Acesso sem login bloqueado (`/admin/biblioteca/rascunhos/novo`) | `admin/layout.tsx` | Aprovado anteriormente | §9.1 (execução real do script) |
| 2 | Admin abre rascunho de magia | `rascunhos/novo` | Aprovado anteriormente | §9.1, reconfirmado nesta rodada (smoke, ver abaixo) |
| 3 | Dano 1d8 (energético/ígneo) adicionado | `EfeitoCamposPorTipo.tsx` (dano) | Aprovado anteriormente | §9.1, §9.2; reconfirmado nesta rodada |
| 4/5 | Salva e recarrega — mesmo ID/ordem/campos | `rascunho-salvar` + reload | Aprovado anteriormente | §9.1, §9.2; reconfirmado nesta rodada |
| 6/7/8 | Aplicar condição com condição real ("atordoado"); diagnóstico de automação exibido | `EfeitoCamposPorTipo.tsx` (aplicar_condicao) | Aprovado anteriormente | §9.1, §9.2 (modoAutomacao="Assistido" confirmado ao vivo) |
| 9 | Reordena os efeitos | `efeito-mover-baixo` | Aprovado anteriormente | §9.1, §9.2 |
| 10 | Duplica um efeito | `efeito-duplicar` | Aprovado anteriormente | §9.1, §9.2 |
| 11 | Remove um efeito | `efeito-remover` | Aprovado anteriormente | §9.1, §9.2 |
| 12 | Cancelar alteração não salva | `rascunho-cancelar` | Aprovado anteriormente | §9.1, §9.2 |
| 13 | Item com cura 2d6 PV, modo automático confirmado | `EfeitoCamposPorTipo.tsx` (cura) | Aprovado anteriormente | §9.1 (ao menos 1 execução); §9.2 confirmou cura "Automático" ao vivo (2d6→1d4 no teste) |
| 14 | Item que remove condição | `EfeitoCamposPorTipo.tsx` (remover_condicao) | Aprovado anteriormente | §9.1 (ao menos 1 execução); §9.2 confirmou "Automático" ao vivo (envenenado) |
| 15/16 | Talento com +1 Luta no nível 1; 3 níveis mantidos, sem vazamento entre níveis | `CamposTalentoSection.tsx` | Aprovado anteriormente | §9.1 (ao menos 1 execução com o código atual) |
| 17 | Alterar recurso no nível 2; nível 1 permanece intacto | `CamposTalentoSection.tsx` | Aprovado anteriormente | §9.1 (ao menos 1 execução com o código atual) |
| 18 | Efeito legado (`teste_resistencia`) permanece preservado | `efeitos-preservados-container` | Aprovado anteriormente | §9.1, §9.2 |
| 19 | Nenhum JSON bruto vazando no fluxo principal | — | Aprovado anteriormente | §9.1, §9.2 |
| 20 | Preview reflete os efeitos configurados, na mesma ordem | `EffectsPreviewList.tsx` | Aprovado anteriormente | §9.1, §9.2 |
| **21** | **Executor genérico aplica condição real em alvo real** | `/dev/table`, `executarAplicarCondicao` | **Aprovado nesta rodada** | Ver abaixo |
| **22** | **Condição aplicada persiste após reload (não é só estado de memória do client)** | `/dev/table` | **Aprovado nesta rodada** | Ver abaixo |
| **23** | **Segunda tentativa (já ativa) falha com erro visível, sem duplicar nem persistir** | `/dev/table` | **Aprovado nesta rodada** | Ver abaixo |
| 24 | Console sem erros | — | Aprovado nesta rodada (reconfirmado) | `read_console_messages` limpo em todos os fluxos desta rodada |
| 25 | Limpeza dos dados de teste | — | Aprovado nesta rodada | Fixtures removidas, contagem zero (ver abaixo) |

Nenhum item foi "substituído por fluxo equivalente" ou "removido do escopo por decisão formal" — a UI e a arquitetura descritas no checkpoint original (§1–§8) permanecem exatamente as mesmas; os `data-testid` usados pelo script de 2026-07 (`estado-personagem-`, `estado-condicao-select-`, `estado-aplicar-condicao-`, `estado-condicoes-`, `estado-remover-condicao-`, `estado-personagens-erro`) foram conferidos linha a linha contra `TableClient.tsx` antes de qualquer execução e **continuam presentes e idênticos** — não houve deriva de seletor desde a última tentativa.

### Significado exato dos itens 21–23

Não é só `aplicar_condicao` "em geral" — é especificamente o **consumo operacional real** do executor genérico (`src/lib/character/conditionEffectExecutor.ts::executarAplicarCondicao`, §5 deste checkpoint) através do único fluxo ao qual ele está conectado hoje: o botão "Aplicar condição" do narrador em `/dev/table` (`TableClient.tsx::handleGmApplyCondition`). Mapeia diretamente ao critério de aceite do aditivo "consumidores compatíveis interpretam o conteúdo" (`docs/ADITIVO_PRD_EDITOR_UNIVERSAL_CONTEUDO.md`, ETAPA 4). Não exige publicação de conteúdo novo — a condição consumida (`condition:atordoado`) já está publicada na Biblioteca desde antes desta etapa; o efeito `aplicar_condicao` em si não precisa ser criado/publicado em nenhuma magia/item/talento para este teste, porque o executor é chamado diretamente pela ferramenta manual do narrador, não por um efeito de conteúdo publicado. Exige, sim: uma mesa real, um personagem real vinculado a um perfil da mesa, e mutação persistida em `characters.payload` (não um objeto local do editor).

Nenhum documento posterior removeu esses itens do escopo — o próprio checkpoint original (§9.1) e a auditoria formal (§9.2) já registravam que eles continuavam pendentes, nunca que haviam sido descartados.

### Achado de ambiente (não é bug de código): `/dev/table` deixou de ser acessível sem login

Antes de qualquer execução, `/dev/table` sem sessão autenticada retornou **"Falha ao listar personagens: permission denied for table characters"** — investigado diretamente via SQL contra o Supabase real: a tabela `characters` só tem grants para as roles `authenticated`/`service_role`/`postgres` (nenhum grant para `anon`), e suas policies de RLS (`characters_authenticated_select` etc.) exigem `owner_id = auth.uid()` ou posse/membership da mesa — não existe mais nenhuma policy `USING (true)` tipo "dev-anon" nesta tabela especificamente (diferente de `campaigns`, que ainda tem `campaigns_dev_transition_select` aberta). Isso significa que o comentário "Sem autenticação" no cabeçalho de `TableClient.tsx`/`page.tsx` e no script original ("Não exige login") está **desatualizado** — em algum ponto posterior (mais provável: o trabalho de RLS real da Etapa 12) as policies de `characters` foram fechadas para exigir autenticação, sem atualizar essa documentação inline. Não é um bug funcional (a mutação em si funciona corretamente, corretamente autenticada) e não foi corrigido nesta rodada (comentário desatualizado é dívida cosmética, fora do escopo "corrigir apenas bugs concretos reproduzidos" — nenhuma correção de comentário foi feita). Contornado criando um narrador autenticado real (fluxo de cadastro `/login`, mesma técnica já usada nas rodadas anteriores) e atribuindo `owner_id` às fixtures.

### Execução real dos itens 21–23

**Fixtures preparadas** (prefixo `zz_e2e_etapa4_aceite_`, nunca reaproveitando a mesa/personagem compartilhados "Mesa CP7 Bando"/"Personagem A (CP7)" usados pelas rodadas anteriores — mesa e personagem próprios, criados e removidos integralmente nesta rodada):
- narrador autenticado (`etapa4-aceite@ruptura-test.local`, cadastro real via `/login`, `admin_users` concedido via SQL para a parte de smoke check editorial);
- mesa `zz_e2e_etapa4_aceite_mesa` (`owner_id` = narrador);
- personagem `zz_e2e_etapa4_aceite_personagem` (`owner_id` = narrador, vinculado à mesa);
- perfil de mesa `zz_e2e_etapa4_aceite_perfil`, com o personagem vinculado (`profile_id`) e definido como personagem ativo do perfil — passo necessário porque `characters_authenticated_select` só libera leitura por posse OU por `profile_id` + membership, e a seção "Estado dos personagens" de `/dev/table` só renderiza personagens com `active_character_id` de algum perfil da mesa (não todo personagem com `campaign_id` setado — achado de arquitetura confirmado lendo `refreshPersonagensAtivos` em `TableClient.tsx`, não um bug);
- condição real já publicada na Biblioteca (`condition:atordoado`) — nenhuma condição nova criada.

**Item 21** — selecionada "Atordoado" no `<select>` do painel do personagem (`estado-condicao-select-<characterId>`) e clicado "Aplicar condição" (`estado-aplicar-condicao-<characterId>`): painel passou de "Condições ativas: nenhuma" para exibir a tag "Atordoado" com botão "Remover" — confirmado por leitura do DOM (`estado-condicoes-<characterId>`), não por inspeção de código.

**Item 22** — página recarregada de fato (`navigate` com `force: true`, não só re-render client) e a mesa reselecionada (o estado de mesa selecionada é só React, some em qualquer reload — comportamento já documentado em §9.1, item 3 da lista de correções de seletor): "Atordoado" continuou presente no painel após o reload, confirmando persistência real em `characters.payload` via Supabase, não memória de client. Um log `character_state_change`/`apply_condition` também apareceu em "Log da mesa" (1/1).

**Item 23** — selecionada "Atordoado" de novo no mesmo personagem e clicado "Aplicar condição" outra vez: mensagem de erro exibida no painel — `"Atordoado" já está ativa neste alvo — o modelo atual não empilha a mesma condição.` (texto vindo diretamente de `executarAplicarCondicao`, §5) — nenhuma tag duplicada apareceu (continuou exatamente 1 "Atordoado"), e o contador de log da mesa permaneceu em 1/1 (a segunda tentativa não gerou nenhum novo log — confirma que a validação bloqueou ANTES de qualquer persistência, exatamente como `executarAplicarCondicao` documenta: "nunca aplica parcialmente").

**Remoção da condição** (parte do fluxo de `remover_condicao` operacional, verificado en passant): clicado "Remover" no chip da condição — a seção "Condições ativas" voltou a ficar vazia, sem crash, sem erro.

Console (`read_console_messages`) e rede (`read_network_requests`) verificados após cada ação: **nenhum erro, nenhuma resposta fora de 200/304/OK esperada**.

### Smoke check dos itens já aprovados

Um único fluxo completo reexecutado para reconfirmar a saúde do ambiente hoje (não os 20 itens individualmente, já fartamente evidenciados em §9.1/§9.2 no mesmo dia): magia nova → efeito `dano` 1d8 energético/`ao_acertar`/`alvo_principal` → salvar (v2) → reload → card preservado com mesmo ID/campos, modo "Assistido" — sem erros de console/rede.

### Nenhum bug encontrado

Nenhum defeito concreto foi reproduzido nesta rodada — nem nos itens 21–23 (o executor e o fluxo manual do narrador funcionaram exatamente como `docs/CHECKPOINT_ETAPA4...md` §5 já descrevia), nem no smoke check. Por isso, nenhuma correção de código e nenhum teste regressivo novo foram criados — só o achado de ambiente (RLS de `characters` exige login, comentário desatualizado) foi registrado como fato, sem alteração de código.

### Fixtures removidas

Confirmado por contagem zero contra o Supabase real ao final: rascunho de magia do smoke check (`content_drafts`), personagem `zz_e2e_etapa4_aceite_personagem` (`characters`), perfil `zz_e2e_etapa4_aceite_perfil` (`campaign_profiles`), mesa `zz_e2e_etapa4_aceite_mesa` (`campaigns`), logs da mesa (`table_logs`), narrador de fixture (`admin_users` + `auth.users`). Nenhuma mesa/personagem/conteúdo real ou de outra rodada (incluindo "Mesa CP7 Bando"/"Personagem A (CP7)", que não foram tocados nesta rodada) foi alterado ou removido.

### Verificação técnica

`git status --short` limpo antes de iniciar; `next-env.d.ts` revertido após um toque automático do `next dev`/`next build`; `npx tsc --noEmit` sem erros; `npm run build` sucesso (servidor parado antes). Nenhum arquivo de produção foi alterado nesta rodada (nenhum bug real encontrado) — logo nenhum harness precisou ser reexecutado por afetação direta (`effectDraftValidation.ts`, serializers e `publishReview.ts` não foram tocados); os harnesses de Etapa 11/12 também não se aplicam (nenhum código compartilhado alterado).

**Status desta etapa, promovido**: **"Etapa 4 concluída — aceite operacional e de browser aprovado."** Todos os 25 itens do checklist original têm evidência concreta de aprovação (itens 1–20 e 24 já documentados em §9.1/§9.2 mais os itens 21–23 e a limpeza fechados nesta rodada); nenhum item obrigatório permanece pendente; nenhuma falha crítica ou média foi encontrada.

**Etapas 5–12: não reabertas.** Etapa 5 permanece exatamente "Implementada — aceite de browser parcial."; Etapas 6–10 permanecem com implementação concluída e aceite de browser parcial/pendente conforme seus próprios checkpoints; Etapa 11 permanece exatamente "Etapa 11 concluída — integração editorial de drag aprovada."; Etapa 12 permanece exatamente "Etapa 12 concluída — validação integrada aprovada." — nenhum desses documentos foi alterado por esta rodada.

**Status global do Editor Universal**: **"Editor Universal parcialmente concluído — validações de browser das Etapas 5–10 pendentes."** Não declarado concluído.

---

## 10. Limitações

- **Histórico (superado pela §9.3)**: até 25/07/2026, o browser check nunca havia sido concluído 100% ponta a ponta numa única execução — itens 21–23 (executor operacional de `aplicar_condicao` via `/dev/table`) nunca tinham sido exercitados com sucesso. Ver §9.3 para a execução que fechou especificamente esses itens.
- Item 2 do checkpoint anterior ("usuário sem admin bloqueado") continua sem cobertura automatizada (mesma decisão da Etapa 2/3 — exigiria criar uma segunda credencial de teste).
- `aplicar_condicao` só tem execução real automática através do fluxo manual de `/dev/table` — magia/item/runa continuam sem aplicação automática de condição (exigiria resolver alvo/distância, fora do teatro da mente de Ruptura). Isso é uma limitação de PRODUTO conhecida e aceita, não uma pendência de aceite — o critério de aceite exige que o executor genérico funcione operacionalmente através de ALGUM consumidor real (§9.3), não que todo tipo de conteúdo o dispare automaticamente.
- `alterar_recurso` só tem um caso realmente automático hoje (PA em fim de rodada) — os demais recursos ficam "assistido" mesmo bem configurados, refletindo a auditoria real do motor.
- `/dev/table` exige narrador autenticado (achado de ambiente registrado em §9.3) — o comentário "sem autenticação" no cabeçalho de `TableClient.tsx`/`page.tsx` está desatualizado desde que as policies de RLS de `characters` deixaram de ter uma regra `USING (true)` para leitura anônima; não corrigido nesta rodada (dívida cosmética, fora do escopo desta correção pontual).
- Efeitos compostos, teste/resistência com ramificação, grupos lógicos, modificação de margem, ação/reação adicional, inventário/runas, mercado avançado, drones/robôs/Trama, importação/exportação, homebrew — todos fora de escopo, como definido.
- Publicação de conteúdo com `aplicar_condicao` continua exigindo revisão manual como qualquer outro efeito (Etapa 5) — o executor testado em §9.3 é a ferramenta MANUAL do narrador, não uma automação disparada por publicação.

---

## 11. Próximos passos

Etapa 4 concluída (§9.3). Conforme `docs/PLANO_IMPLEMENTACAO_EDITOR_UNIVERSAL.md`, as Etapas 5–10 seguem em "aceite de browser parcial" (não reabertas nesta rodada) e a Etapa 11/12 seguem concluídas — nenhuma dessas etapas foi tocada por esta rodada, cujo escopo foi exclusivamente fechar o aceite operacional da Etapa 4.
