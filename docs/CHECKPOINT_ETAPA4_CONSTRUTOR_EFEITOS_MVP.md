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

---

## 10. Limitações

- Browser check não concluído 100% ponta a ponta em nenhuma sessão até agora (ver §9.1). Itens 1–12 e 18–20 confirmados de forma consistente; itens 13–17 confirmados em ao menos uma execução com o código atual (não na última); itens 21–23 (executor operacional de `aplicar_condicao` via `/dev/table`, incluindo persistência e bloqueio de segunda tentativa) nunca concluídos em execução alguma — os problemas de seletor que os bloqueavam foram corrigidos, mas isso não foi reverificado em uma execução completa. Testes encerrados por decisão explícita da proprietária da conta; verificação restante fica para o teste manual com jogadores, não para outra rodada de browser check.
- Item 2 do checkpoint anterior ("usuário sem admin bloqueado") continua sem cobertura automatizada (mesma decisão da Etapa 2/3 — exigiria criar uma segunda credencial de teste).
- `aplicar_condicao` só tem execução real automática através do fluxo manual de `/dev/table` — magia/item/runa continuam sem aplicação automática de condição (exigiria resolver alvo/distância, fora do teatro da mente de Ruptura).
- `alterar_recurso` só tem um caso realmente automático hoje (PA em fim de rodada) — os demais recursos ficam "assistido" mesmo bem configurados, refletindo a auditoria real do motor.
- Efeitos compostos, teste/resistência com ramificação, grupos lógicos, modificação de margem, ação/reação adicional, inventário/runas, mercado avançado, drones/robôs/Trama, importação/exportação, homebrew — todos fora de escopo, como definido.
- Publicação continua bloqueada (rascunho permanece "não disponível no jogo") — Etapa 5.

---

## 11. Próximos passos (não iniciados nesta etapa)

Conforme `docs/PLANO_IMPLEMENTACAO_EDITOR_UNIVERSAL.md`, a **Etapa 5 — Publicação, versões e changelog** é o próximo passo natural. Antes disso, recomenda-se fechar a lacuna de confirmação do browser check (§9.1).
