# Prompt de implementação — Terreno e Objetos táticos (VTT)

> Documento escrito para ser **colado como prompt inicial** numa sessão nova.
> Já contém os fatos verificados no código; não re-derive, mas **confirme** os
> que estiverem marcados com ⚠ antes de escrever código (o repositório muda).

---

## Estado da implementação

- **Fase B1 (schema + fiscalização no servidor) — CONCLUÍDA.** Migration
  `0085_vtt_objetos_taticos` aplicada: `vtt_objects` + `vtt_object_cells`
  (células NORMALIZADAS, D2), RLS de leitura, realtime, e
  `read_vtt_scene_objects`. A precedência de bloqueio virou o helper único
  `vtt_celula_bloqueada(scene_id,q,r)`, que substituiu as DUAS cópias inline
  que existiam (`vtt_validar_pegada_em` e `rotacionar_vtt_token`).
  Verificado por `scripts/dev/check-vtt-objetos-servidor.ts` (13 ok).

- **Fase B2 (leitura no cliente) — CONCLUÍDA.** `ObjetoVtt` +
  `linhaParaObjeto` + `carregarObjetosDaCena` em `sceneStorage`; `objetos`
  entrou em `EstadoCena` (via RPC `read_vtt_scene_objects`, junto das
  outras leituras); `lerObjetosCenaAction` em `sceneActions`; `VttClient`
  alimenta `objetos:` em `montarMapaTatico` — **o bloqueio por objeto agora
  vale em movimento, pathfinding, posicionamento e rotação no cliente**.
  Realtime: `onObjetosInvalidados` (sinal SEM payload, `vtt_objects` por
  campanha + `vtt_object_cells` por cena) dispara releitura da lista — um
  objeto vive em duas tabelas, remontar o agregado de eventos soltos daria
  estados incoerentes.

- **Fase B3 (RPCs de escrita) — CONCLUÍDA.** Migration
  `0086_vtt_objetos_escrita`: `create/update/move/damage/delete_vtt_object`,
  todas `security definer`, **narrador-only** (`is_campaign_owner`, mesma
  categoria de `vtt_terrain`) e com `revision` otimista (`check_violation`,
  convenção das RPCs de token). Helpers: `vtt_objeto_json` (projeção única,
  mesmo formato da leitura), `vtt_definir_celulas_objeto` (valida limites do
  mapa + teto de 64 células) e `vtt_exigir_narrador_do_objeto`.
  `travado` bloqueia mover/excluir mas NÃO `update` — é por lá que se
  destrava (cinto de segurança, não autorização). PD em 0 **não** remove o
  objeto: virar entulho/sumir é decisão de cena, fica com a regra de
  destruição. Verificado em `check-vtt-objetos-servidor.ts` (**28 ok**).

- **Fase C1 (presets + objetos visíveis) — CONCLUÍDA.**
  `_dominio/presetsObjeto.ts` com os 10 presets ancorados nos **valores
  oficiais do livro** (`16 COMBATE` → COBERTURA): graus vêm dos exemplos
  nomeados (parede sólida = total, coluna larga = maior, mesa/balcão =
  parcial, barricada alta = total) e o PD de cada preset cai dentro da
  faixa da tabela de durabilidade (Frágil 2–5, Média 6–15, Resistente 16+).
  `scripts/test-vtt-presets-objeto.ts` (**19 ok**) trava esse invariante.
  Objetos persistidos agora RENDERIZAM, reaproveitando o renderizador que
  já existia (sombra, faces, rachadura de dano, hint) via mapeamento
  preset → aparência. `ObjetoCena.pd/pdMax` viraram anuláveis: objeto sem
  durabilidade não mostra "PD 0/0", a linha some.

  Transitório: enquanto a cena não tiver NENHUM objeto persistido, seguem
  os decorativos de `CENA_DEMO` (só aparência, não bloqueiam). Assim que
  houver um objeto real, a demo some por inteiro — misturar os dois faria
  o narrador não saber qual bloqueia.

- **Fase C2 (interface mínima de criação) — CONCLUÍDA.** Ferramenta
  **"Objetos" (O)** nova, ao lado de Terreno, narrador-only
  (`_ferramentas/controlador.ts`: `FerramentaId`, `ROTULO_FERRAMENTA`,
  `ATALHO_FERRAMENTA`, `TECLA_PARA_FERRAMENTA`, `ferramentasParaPapel`).
  Submenu (mesmo padrão visual do de Terreno) com `<select>` dos 10
  presets + nota explicativa do preset ativo + contador de células
  selecionadas + "Criar objeto"/"Cancelar". Gesto de seleção reaproveita a
  MESMA dupla de callbacks de Terreno (`onPressCelula`/
  `onEntrarCelulaPintando`, habilitados em `MapaHex.tsx` também pra
  `ferramenta === "objetos"`), mas com semântica distinta: clique
  ALTERNA a célula (tira uma errada sem recomeçar), arrastar só
  ADICIONA. A seleção é rascunho 100% LOCAL — nenhuma RPC roda até
  confirmar; trocar de ferramenta descarta (mesmo `trocarFerramenta`,
  mesma regra do cancelamento de posicionamento de token). Confirmar
  chama a RPC de verdade (`criarObjetoAction` → `criarObjeto` em
  `sceneStorage.ts` → `create_vtt_object`), com os valores do preset via
  `valoresIniciaisDoPreset`. Criação **não entra em undo/redo** — mesma
  decisão documentada em `criarTokenAction` (id nasce no servidor; um
  "redo" criaria outro id, quebrando qualquer referência ao original).
  Destaque visual da seleção pendente é um novo `tipoRealce: "objeto"` em
  `MapaHex.tsx` (`.rv-celula--objeto` em `vtt.css`), reaproveitando o
  mesmo mecanismo de `celulasRealce` que já existia (sempre `[]`/`null`
  até agora). `removerObjetoAction`/`removerObjeto` (→ `delete_vtt_object`)
  também foram escritos, mas **sem UI ainda** — só a RPC/Server Action.
  Testado manualmente end-to-end na campanha real (`Doca 7`): objeto
  criado sobrevive a reload de página (confirmado por SQL direto em
  `vtt_objects`).

- **Fase C3 (editar/mover/travar objeto existente) — CONCLUÍDA.**
  `atualizarObjeto`/`moverObjeto` em `sceneStorage.ts` (→
  `update_vtt_object`/`move_vtt_object`) + `atualizarObjetoAction`/
  `moverObjetoAction` em `sceneActions.ts`, narrador-only, revisão
  otimista. No submenu de Objetos, selecionar um objeto agora mostra
  Mover/Editar/Travar(-Destravar)/Excluir/Desmarcar:
  - **Mover** reaproveita o MESMO rascunho local de células da criação
    (`celulasObjetoPendente`) — semeado com as células atuais do objeto,
    editável com o mesmo gesto clique-alterna/arrasto-adiciona, confirmado
    por "Confirmar novo local" → `move_vtt_object`.
  - **Bug real encontrado e corrigido durante o teste manual**: o objeto
    sendo movido continua RENDERIZADO na posição antiga (rascunho ainda
    não confirmado), então um clique ali pra tirar aquela célula do
    rascunho acertava o objeto por cima (reabria seleção) em vez da célula
    embaixo. Corrigido com um prop novo (`objetoEmMovimentoId` em
    `MapaHex.tsx`): SÓ o objeto sendo movido vira "fantasma" —
    `pointer-events: none` + opacidade 0.35 — pra o clique atravessar até
    a célula. Documentado como exceção deliberada e estreita à regra
    "objeto nunca é `pointer-events: none`" que já existia ali.
  - **Editar** abre formulário inline no mesmo submenu (nome, bloqueia
    movimento, terreno difícil, cobertura, categoria+PD, visível) —
    `update_vtt_object` substitui TODOS os campos de uma vez, então o
    rascunho nasce com os valores atuais do objeto, nunca em branco.
  - **Travar/Destravar** é um botão de um clique só (não abre o
    formulário) que muda só `travado`, mantendo os outros campos como
    estão. `delete_vtt_object` recusa objeto travado — confirmado ao vivo
    (mensagem "Objeto travado — destrave antes de excluir." veio do
    servidor, não do cliente).
  Testado ao vivo, ponta a ponta, contra a campanha real (`Doca 7`):
  criar → editar PD → mover (com o bug do fantasma corrigido no meio) →
  travar → excluir recusado → destravar → excluir aceito, cada passo
  conferido por SQL direto (`revision` incrementando, célula mudando,
  linha sumindo).

- **Fase C4 (pincel de terreno com tamanho + undo por gesto) —
  CONCLUÍDA.** Terreno ganhou seletor de raio (`hexNoRaio`, já existente
  em `_mapa/hex.ts` — base de Esfera/Domo/Aura): **1** (raio 0), **7**
  (raio 1), **19** (raio 2) células por toque de pincel, com contador
  visível ("N células alteradas") durante o gesto. `pintarCelula` virou
  `pintarComPincel`: cada TICK (pressão ou entrada arrastando) escreve na
  hora — arrasto contínuo, sem esperar soltar —, filtrando só as células
  que REALMENTE mudam de valor (evita reenviar o que já está pintado) e
  as que caem `dentroDoMapa`.
  **Undo por gesto inteiro** (também resolvia o pendente antigo "undo/redo
  nunca uma entrada por célula"): `gestoTerrenoRef` acumula, por célula
  tocada nesta pincelada, o valor de ANTES (só na 1ª vez que ela é
  tocada). Um listener de `pointerup` GLOBAL fecha o gesto e registra
  UM `Comando` combinado — `desfazer` restaura cada célula ao seu
  próprio valor anterior (agrupando por valor pra minimizar chamadas,
  já que uma pincelada pode cruzar terreno normal/difícil/bloqueado
  misturado), `executar` (redo) reaplica o tipo final a todas de uma vez.
  Testado ao vivo: pincel 19 pintou 16 células novas (34 no total, 18 já
  existiam), Ctrl+Z desfez as 16 numa tacada só, Ctrl+Shift+Z refez,
  confirmado por `count(*)` direto em `vtt_terrain` a cada passo.

- **Fase C5 (balde de tinta — preenchimento de região contígua) —
  CONCLUÍDA.** Nova função PURA `regiaoContiguaDeTerreno` em
  `_dominio/movimento.ts` (BFS sobre `vizinhosValidos`, já existente —
  reaproveitado, não duplicado): a partir de uma célula, preenche toda a
  região CONTÍGUA que compartilha o MESMO valor de terreno PINTADO
  (`null` = normal conta como valor), parando numa borda de valor
  diferente ou no limite do mapa. Sem teto artificial de células — o
  teto natural já é `largura × altura` da cena. 6 testes puros em
  `scripts/test-vtt-balde-terreno.ts` (mapa vazio preenche tudo, borda
  contém, células isoladas, nunca sai do mapa, manchas não-adjacentes
  não se fundem).
  UI: botão "Balde" (ícone `PaintBucket`, o mesmo da ferramenta) no
  submenu de Terreno, ao lado do seletor de raio do pincel (some
  enquanto Balde está ativo — é irrelevante nesse modo). Balde só reage
  ao CLIQUE inicial (`onPressCelula`), nunca a arrastar
  (`onEntrarCelulaPintando`) — permitir arrasto disparar um balde por
  célula tocada faria uma pincelada virar dezenas de preenchimentos
  empilhados. Reaproveita o MESMO `pintarConjunto` (extraído de dentro
  do antigo `pintarComPincel`) que já fazia gesto→UM-comando-de-desfazer
  pro pincel — balde e pincel são só duas formas diferentes de calcular
  a LISTA de células, a lógica de escrita/undo é uma só.

  ⚠ **Quase-incidente durante o teste ao vivo, registrado pra quem ler
  depois:** testei o balde na campanha real (`Doca 7`) mirando um clique
  na mancha de terreno difícil já existente, mas o clique caiu fora dela
  — resultado, o balde preencheu a maior região contígua "normal" do
  mapa inteiro (431 células) com "bloqueado" de uma vez. Um Ctrl+Z
  desfez tudo corretamente, mas `pintarTerrenoLote` apaga célula por
  célula num laço (`for` de deletes sequenciais, não um DELETE em lote —
  limitação PRÉ-EXISTENTE, o balde só foi o primeiro chamador a expor
  batches desse tamanho), então o desfazer levou vários segundos pra
  terminar e uma conferência por SQL feita CEDO DEMAIS (antes do laço
  acabar) mostrou uma contagem intermediária enganosa, quase levando a
  uma segunda ação desnecessária em cima do incidente. Conferido de novo
  depois de esperar: voltou exatamente ao estado anterior (18 difícil +
  5 bloqueado pré-existentes, isolados, sem sobra). Lição: **testar
  balde em manchas PEQUENAS e conferidas por SQL ANTES do clique**, e
  **esperar o undo de um lote grande assentar** antes de reconferir.
  Fica como pendência técnica separada (não bloqueia esta fase): trocar
  o laço de deletes de `pintarTerrenoLote` por uma escrita em lote de
  verdade quando o preenchimento for grande.

- **Fase C6 (converter gesto de terreno em objeto) — CONCLUÍDA.**
  Atalho "Converter N células em objeto" no submenu de Terreno, visível
  logo após qualquer pintura de verdade (nunca depois de "Apagar" — não
  há o que promover). `ultimoGestoTerrenoCelulas` guarda as células do
  ÚLTIMO gesto finalizado (`finalizarPincelTerreno`), sobrescrito a cada
  gesto novo e descartado ao trocar de ferramenta por qualquer caminho
  que não seja o próprio atalho. Clicar nele semeia
  `celulasObjetoPendente` com essas células e troca pra ferramenta
  Objetos — o narrador ainda escolhe o preset e confirma "Criar objeto"
  normalmente; o atalho só poupa redesenhar a mesma forma, nunca
  adivinha preset a partir do tipo de terreno pintado.
  ⚠ **Caveat deliberado, não um bug**: converter NÃO apaga a pintura de
  terreno subjacente — a célula fica com o terreno pintado (ex.:
  "bloqueado") E o objeto novo por cima, ambos bloqueando de forma
  redundante (mas nunca contraditória: se algum dia um preset SEM
  bloqueio for convertido em cima de terreno "bloqueado", o bloqueio do
  terreno continua valendo — decisão consciente de não tentar adivinhar
  "o narrador queria apagar o terreno também?"). Testado ao vivo:
  1 célula pintada → convertida → objeto "Muro" criado na célula certa,
  confirmado por SQL, depois removido (objeto e terreno de teste) sem
  deixar sobra.

  **Fase C dada por ENCERRADA aqui, de propósito** — ver decisão abaixo
  sobre semear `CENA_DEMO`. `damage_vtt_object` (Fase D) segue sem
  Server Action.

  ### ⚠ Decisão: semear `CENA_DEMO` como dados reais fica DE FORA (por ora)

  Avaliado e conscientemente ADIADO, não esquecido. Motivo:

  1. **Valor imediato ≈ zero pra esta campanha.** `garantirCenaSemente`
     só semeia UMA vez, na primeira carga (idempotente — nunca resemeia
     por cima de progresso real). A campanha real (`Doca 7`) já tem cena
     ativa com objetos DE VERDADE (nascidos pela interface nesta mesma
     entrega) — semear CENA_DEMO não alteraria nada nela. Só afetaria
     campanhas NOVAS, ainda sem nenhuma cena.
  2. **Exigiria migration nova** (`seed_vtt_objects`, espelhando
     `seed_vtt_scene`/`seed_vtt_tokens` da 0068) — mudança de schema em
     produção, categoria de risco mais alta que tudo mais desta entrega
     (que só usou RPCs já existentes).
  3. **Uma decisão de design real, sem resposta óbvia**: dos 8 objetos
     decorativos de `CENA_DEMO`, 7 mapeiam limpo pra um preset existente
     por aparência (`conteiner`→caixa/barricada, `veiculo`→veiculo,
     `banca`→mesa, `muro`→muro, `grade`→grade). O 8º, "Barris de
     reagente" (`tipo: "barril"`), **não tem preset nenhum com essa
     aparência** — `APARENCIA_OBJETO` em `MapaHex.tsx` já sabe desenhar
     "barril" (cor própria, distinta), mas nenhum dos 10 presets de
     `PRESETS_OBJETO` a usa. Semear teria três saídas, nenhuma óbvia:
     criar um 11º preset só pra isso (quebra a lista fechada,
     book-grounded, de 10 da Fase C1), re-pintar o barril como
     caixa/entulho (perde a aparência distinta sem necessidade), ou
     deixar esse objeto de fora do seed (semente incompleta, some 1 dos
     8). Nenhuma dessas é claramente "a certa" sem confirmar com quem
     pediu.

  Dado o valor baixo e o risco/decisão pendente mais altos que o resto
  desta entrega, a chamada de julgamento foi **não fazer agora**. Fica
  registrado aqui pronto pra retomar: a migration seria idêntica em
  espírito a `seed_vtt_tokens` (0068) — narrador-only, idempotente,
  inserindo em `vtt_objects`+`vtt_object_cells` via
  `vtt_definir_celulas_objeto` (já existe, reaproveitável) — chamada a
  partir de `garantirCenaSemente` logo após `seed_vtt_tokens`.

- **Fase D1 (painel de PD: dano/reparo/destruição) — CONCLUÍDA.**
  `danificarObjeto` em `sceneStorage.ts` (→ `damage_vtt_object`, já
  existia desde a 0086, só sem Server Action até agora) +
  `danificarObjetoAction`, narrador-only. No painel do objeto
  selecionado (ferramenta Objetos), quando o objeto tem categoria (logo,
  PD): mostra "PD atual/máximo", campo de quantidade + botões
  "Dano"/"Reparar" — manda a MAGNITUDE com o sinal certo
  (`sinal * Math.abs(...)`), o servidor quem clampa entre 0 e o máximo
  (nunca o cliente). Chegar a 0 PD mostra "— Destruído" junto do PD, mas
  **não remove nem transforma nada sozinho** (D8) — aparece um botão
  extra "Virar entulho", atalho de um clique pro que "Editar" já
  permitiria campo a campo (`bloqueiaMovimento: false`,
  `terrenoProjetado: "dificil"`, os mesmos valores mecânicos do preset
  `entulho`). Não muda a aparência (preset é imutável após criado) — é
  só o comportamento que vira entulho; o narrador decide se aciona,
  nunca é automático. Testado ao vivo: objeto PD 5/5 → dano 5 → "PD
  0/5 — Destruído" → Virar entulho → `bloqueia_movimento=false`,
  `terreno_projetado='dificil'` confirmados por SQL, revisão
  incrementando a cada passo, depois removido sem deixar sobra.

- **Fase D2 (linha de medição sugere cobertura) — CONCLUÍDA.** A
  ferramenta Medir (já existente, arrastar entre dois pontos) ganhou uma
  segunda função sem virar outra ferramenta: junto do rótulo de
  distância/custo, se a régua cruzar um objeto com grau de cobertura,
  aparece um rótulo próprio — "Possível {grau}: {nome}, {pd}/{pdMax}
  PD" — no MESMO formato do exemplo do plano original. Implementado em
  `MapaHex.tsx`, dentro do bloco que já desenha a régua: `hexLinha`
  (`_mapa/hex.ts`, já existia, usada por `montarRota`/`expandirRota` mas
  nunca exposta pra medição) dá as células cruzadas; as DUAS PONTAS são
  excluídas (`.slice(1,-1)`) — atacante e alvo não são cobertura de si
  mesmos; entre os objetos cruzados, o de MAIOR grau (total > maior >
  parcial) é o sugerido, já que é o que mais importa destacar quando há
  mais de um no caminho. **Puramente informativo — nunca aplica nada
  sozinho**: não existe "aceitar" nem escrita no banco, é só um texto
  que aparece e some com a régua (D8/"nunca decidir sozinho" cumprido
  por construção, não por checagem: a função só lê `cena.objetos` e
  devolve texto). Rótulo desenhado SEM rotação (mesmo padrão do aviso de
  bloqueio no arrasto de token), acima do marcador de destino, pra ficar
  sempre legível independente do ângulo da régua.
  Testado ao vivo contra a campanha real: criei um "Muro" (cobertura
  total, PD 20/20) numa célula calculada pra cair exatamente na reta
  entre duas outras (mesmo `r`, `q` no meio — replicei `hexParaPixel` +
  a transform do SVG num script à parte pra converter hex→tela com
  precisão, depois de duas tentativas por estimativa visual terem
  errado o alvo), medi entre elas e vi aparecer "Possível cobertura
  total: Muro, 20/20 PD" acima do destino, com o "10 m · custo 11" da
  régua normal do lado. Removido depois sem deixar sobra.

  **Fase D dada por CONCLUÍDA nesta entrega.** O único item que sobra —
  registro de dano/reparo/destruição no log da mesa — depende do chat
  do VTT virar real primeiro (ver nota abaixo); sem essa base, não há
  onde registrar. Sinalizado como tarefa à parte, não implementado aqui.

  ### ⚠ Revisão geral pós-entrega (`/code-review`) — 9 achados corrigidos

  Rodada de revisão (7 agentes de busca + 11 verificações independentes) sobre
  toda a entrega de terreno/objetos confirmou 10 achados reais; 9 foram
  corrigidos nesta mesma sessão (o 10º — revisão lida na hora de salvar em vez
  de capturada quando o rascunho abre — foi investigado e decidido DEIXAR
  como está, porque tokens já fazem exatamente a mesma coisa hoje,
  deliberadamente; corrigir só objetos criaria inconsistência sem resolver o
  problema de verdade em nenhum outro lugar do app).

  Corrigidos, todos testados ao vivo contra a campanha real e por SQL direto:
  1. **Gesto de pincel/balde podia perder o undo ou misturar duas
     pincéis**: `finalizarPincelTerreno` agora lê tudo via ref
     (`estadoCenaRef`/`usuarioIdRef`/novo `modoTerrenoRef`), filtra
     `e.button`, escuta `pointercancel` também, e descarrega qualquer
     gesto pendente no cleanup do efeito. **Nunca usar
     `setPointerCapture` aqui** — quebraria o `pointerenter` por célula
     de que a pintura por arrasto depende (confirmado lendo o único
     outro uso de capture no arquivo, que é pra arrasto de UM elemento
     só, área/alça — não serve pro caso de terreno).
  2. **Mover/editar/travar/danificar/virar-entulho objeto agora entram
     no undo/redo** (`executarComando`, mesmo padrão de
     `rotacionarTokenHandler`/`confirmarEdicaoToken`). Dano/reparo usa o
     delta EFETIVO (`pdDepois − pdAntes`), não o nominal digitado —
     senão desfazer um dano que bateu no teto do PD reparava PD que
     nunca existiu. Testado ao vivo: travar→Ctrl+Z→Ctrl+Shift+Z, dano
     10 num objeto de PD 5/5 (clampa em 0)→Ctrl+Z (volta pra 5, não
     baseado no 10 nominal), mover→Ctrl+Z — todos com `revision`
     incrementando a cada chamada real ao servidor.
  3. Objeto excluído por outra sessão durante um "mover" agora cancela
     e avisa (`useEffect` que observa `objetoMovendoId`/
     `estadoCena.objetos`) em vez de silenciosamente criar um objeto
     fantasma.
  4. Limpar a categoria no formulário de editar agora limpa `pd`/`pdMax`
     junto — não deixa mais PD órfão, persistido mas sem controle na
     UI pra ver/zerar depois.
  5. Teto de 64 células agora também vale pra seleção só-por-clique
     (`alternarCelulaObjeto`), não só pro arrasto.
  6. `pintarTerrenoLote` apaga terreno em paralelo (`Promise.all`), não
     mais um DELETE sequencial por célula.
  7. Sugestão de cobertura na régua de medir virou `useMemo` — não
     recalcula mais em re-renders não relacionados (outro jogador
     movendo token, etc.).
  8. `restaurarMisto` (undo de pincel/balde) também virou `Promise.all`
     — grupos de terreno restaurados em paralelo, não em série.
  9. Novo helper `payloadDeObjeto` elimina a duplicação de 9 campos à
     mão em `alternarTravamentoObjetoSelecionado`/
     `virarEntulhoObjetoSelecionado`.

  ### ⚠ Achado fora do escopo: o chat do VTT é 100% mockado

  Investigando "registro no log da mesa" (Fase D), confirmei que o
  painel de Chat em `VttClient.tsx` (a lista de mensagens "Narrador:
  ...", "Percepção 7 3 6...") é **dado estático hardcoded** — não lê de
  banco nenhum, e o formulário de enviar mensagem não tem `onSubmit`
  (só `preventDefault`). O sistema de log real do projeto (`table_logs`,
  usado por `endRound`/`endScene`/`narrator_set_turn_track` em
  `src/lib/table/storage.ts` e migrations do Mesa dashboard) existe e
  tem um padrão estabelecido, mas **nenhuma RPC do VTT** (token, área,
  objeto) escreve nele. Ou seja: "registrar dano de objeto no log da
  mesa" depende de uma peça de infraestrutura MAIOR e completamente
  separada (conectar o Chat do VTT de verdade a `table_logs`) que não
  faz parte deste plano de terreno/objetos. Sinalizado como tarefa à
  parte — não implementado aqui pra não misturar um refactor grande e
  não relacionado dentro desta entrega.

  ### ⚠ CORREÇÃO da decisão D1 (o plano original estava errado)

  D1 dizia "a RPC de movimento precisa consultar objetos". **Não deve.** A
  migration `0080_vtt_move_token_bloqueio_consultivo` removeu de propósito a
  recusa de bloqueio em `move_vtt_token` ("habilidades, voo, teleporte e
  decisão do narrador podem ignorar uma restrição normal — não adianta
  permitir no cliente e a RPC recusar depois").

  A regra correta é: **objeto que bloqueia produz o MESMO fato mecânico que
  uma célula pintada, em todo lugar** — logo recusa em criação/edição/
  posicionamento (`vtt_validar_pegada_em`) e em `rotacionar_vtt_token`, e
  segue CONSULTIVO em `move_vtt_token`. O teste 8 de
  `check-vtt-objetos-servidor.ts` existe para impedir que alguém "conserte"
  isso por engano.

- **Fase A — CONCLUÍDA.** `_dominio/mapaTatico.ts` (precedência num lugar só) +
  `scripts/test-vtt-mapa-tatico.ts` (18 testes). `VttClient` deriva
  `terrenoReal` de `montarMapaTatico`. Sem objetos, devolve o mapa pintado **por
  referência** — fase provadamente sem mudança de comportamento; os 16 suites
  puros passaram sem uma linha de teste alterada. `movimento.ts` e
  `pathfindingHex.ts` ficaram intocados de propósito (ver decisão de desenho
  abaixo). Ponto de entrada da Fase B: passar `objetos:` nessa chamada.

## ⚠ Pendência conhecida — FORA do escopo deste plano

`scripts/dev/check-vtt-areas.ts` fica **intermitente** (falha ~1 em 4, em
`26f`, com `element detached` / `click timeout`). É do **lápis de edição
rápida de áreas**, não de terreno/objetos.

Dois bugs reais já foram corrigidos nessa investigação e reduziram muito a
frequência, mas **não a eliminaram**:

1. A posição do lápis de A mudava quando o de B aparecia (o resolvedor
   recolocava todos do zero). Corrigido: posição fixa por id enquanto a âncora
   daquela área não mudar — `usePosicoesEdicaoRapida` /
   `resolverPosicoesEdicaoRapidas` (`_shell/AcoesAreaFlutuantes.tsx`).
2. O timer de 180 ms agendado ao sair da área **não era cancelado** ao chegar
   no botão (o cancelamento só olhava seleção e hover-na-área, nunca
   hover-no-próprio-botão), então o lápis sumia com o cursor em cima.
   Corrigido no efeito de `idsExibidosEdicaoRapida` (`VttClient.tsx`).

Se voltar a incomodar: **instrumentar o ciclo de vida do botão** (quando entra
em `idsExibidosEdicaoRapida`, quando o timer é agendado/cancelado, quando o
`onMouseEnter` dispara) em vez de continuar por hipótese. Suspeita restante:
sensibilidade a carga com as 14+ áreas sobrepostas que só a suíte cria.

---

## Objetivo

Transformar a ferramenta de pintar células num **construtor tático de cena**: o
narrador monta um mapa rápido em que cada elemento declara a regra oficial que
aplica — "esse objeto obstrui o caminho", "esse trecho é terreno difícil",
"esse muro dá cobertura e tem PD".

## Escopo desta entrega (MVP)

1. Domínio tático unificado: uma única fonte de "como esta célula se comporta".
2. **Objetos persistentes com identidade** (nome, presets, PD, cobertura,
   bloqueio de movimento), substituindo os objetos decorativos de `CENA_DEMO`.
3. Presets de criação rápida + conversão de seleção de células em objeto.
4. Cobertura **consultiva** (informa, não decide).

### Não-objetivos explícitos (não implementar agora)

- **Elevação / `elevation_m`.** Fica fora até existir a regra de altura que a
  consome — ver "Princípio do vocabulário" abaixo.
- Resolução automática de linha de visão / grau de cobertura.
- Portas, plataformas, escadas, objetos com estados.
- Altura de objeto como **superfície pisável** (ver decisão D5).

---

## Fatos verificados do código (base para as decisões)

⚠ Reconfirme caminhos e números de linha antes de editar.

- `TipoTerreno = "dificil" | "bloqueado"` e
  `MapaTerreno = ReadonlyMap<string, TipoTerreno>` —
  `src/app/mesas/[campaignId]/vtt/_dominio/movimento.ts` (~L33/L36).
  É o **único** insumo de terreno de: `terrenoEm`, `estaBloqueada`,
  `custoDeEntrada`, `pegadaBloqueada`, `custoDePassoPegada`, `montarRota`,
  `validarMovimento`, `medir`, `alcancaveis`. Costura pequena e limpa.
- **O servidor valida bloqueio.** A RPC de movimento percorre a rota célula a
  célula e recusa contra o banco:
  ```sql
  select 1 from vtt_terrain t
  where t.scene_id = ... and t.q = v_cell.q and t.r = v_cell.r
    and t.tipo = 'bloqueado'
  ```
  Padrão presente em `supabase/migrations/0066`, `0067`, `0069`, `0071`,
  `0072` (ex.: `0072_vtt_pegada_reparo_pre_aprovacao.sql` ~L274).
- A célula de **origem** é pulada no loop (`if i > 0`): um token que já está
  dentro de célula bloqueada consegue sair. Não "conserte" isso.
- `vtt_terrain`: PK `(scene_id, q, r)`, colunas `campaign_id`, `tipo`
  (`check tipo in ('dificil','bloqueado')`), `updated_at`, `updated_by` —
  `0065_vtt_scene_state.sql` (~L96).
- **Princípio do vocabulário** (comentário no próprio schema, `0065` ~L101):
  > `elevado`, `zona_morta` e cobertura ficam FORA do enum de propósito:
  > reservar valor que nenhuma regra consome ainda seria abstração sem uso —
  > o check é fácil de ampliar na migration que trouxer a regra junto.

  Respeite isso. É a razão de elevação estar fora do MVP.
- `ObjetoCena` (decorativo, vindo de `CENA_DEMO`) —
  `src/app/mesas/[campaignId]/vtt/_dados/cenaDemo.ts` (~L90):
  `{ id, nome, celulas: Hex[], grau, categoria, pd, pdMax, tipo, rotacao? }`.
  Já quase o shape final: faltam `bloqueiaMovimento` e `alturaM`.
  `GrauCobertura`, `CategoriaCobertura`, `CATEGORIA_COBERTURA` e
  `GRAU_COBERTURA` já são exportados de lá — reaproveite, não recrie.
- Precedente mais próximo = **Áreas** (`vtt_areas`, migrations `0081`–`0083`):
  params em jsonb, `revision` com concorrência otimista, RPCs estreitas
  `pode_criar_vtt_area` / `pode_editar_vtt_area`, RLS por campanha.
- Realtime: `postgres_changes` filtrado por `campaign_id` para `vtt_terrain`,
  `vtt_marks` e `vtt_areas` —
  `src/app/mesas/[campaignId]/vtt/_realtime/vttRealtime.ts`.
  (Tokens migraram para broadcast `tokens_changed` na `0084`.)
- `VttClient` já tem `historico.desfazer/refazer` — reaproveite.

---

## Decisões já tomadas (constraints, não opções)

**D1 — Bloqueio de objeto é validado no servidor.**
A RPC de movimento **precisa** consultar objetos, não só `vtt_terrain`. Sem
isso o bloqueio por objeto vira só cliente e quebra a disciplina do projeto
("o servidor é quem decide").

**D2 — Células de objeto normalizadas desde o início.**
Criar `vtt_object_cells (object_id, scene_id, q, r)` com índice em
`(scene_id, q, r)`. **Não** usar só `cells jsonb`: a checagem de D1 acontece
dentro de um loop por célula de rota, e containment jsonb ali é caminho quente.
(Em `vtt_areas` o jsonb funciona porque área é *lida como forma*, não
*consultada por célula* em validação.)

**D3 — A precedência mora em SQL, uma vez.**
Expor algo como `vtt_celula_bloqueada(scene_id, q, r)` (ou view de células
efetivas) consumida pela RPC de movimento. O `MapaTaticoEfetivo` em TS existe
para **preview/UX**; a verdade é do servidor. Precedência:
1. objeto que bloqueia movimento → bloqueada;
2. senão, qualquer fonte de terreno difícil → custo 2;
3. senão → custo 1.
Para pegada multicélula, manter a regra atual: o passo usa a **pior** célula da
nova pegada.

**D4 — Não renomear `vtt_terrain.tipo`.**
`t.tipo = 'bloqueado'` aparece em ≥5 migrations. Renomear para `movement_kind`
não compra nada e obriga a reescrever todas as RPCs de movimento. Só amplie o
`check` quando a regra nova chegar.

**D5 — `altura_m` de objeto NÃO é superfície pisável.**
Serve só como insumo de cobertura/LoS. Se um dia existir plataforma, será flag
própria (`superficie_pisavel`), nunca inferência da altura.

**D6 — Objeto oculto (`visivel = false`) bloqueia mesmo assim.**
Bloqueia no servidor (verdade mecânica); o cliente mostra "caminho inválido"
**sem dizer o motivo**. Preserva o segredo do narrador sem mentir na regra.

**D7 — Colocar objeto bloqueador sobre token é permitido** (autoridade do
narrador). O token consegue sair por causa do `if i > 0` já existente.

**D8 — Dano/destruição é RPC restrita ao narrador.** Jogador não escreve em
objeto. Coerente com "a interface informa a regra, não decide pelo grupo".

**D9 — Presets hardcoded em TS nesta entrega**, espelhando o estilo de
`PRESETS_POR_CATEGORIA` (`_dominio/pegada.ts`), mas com shape **serializável** —
se os valores forem oficiais, migram depois para `content_documents` (o projeto
já lê regras canônicas de lá).

---

## Ordem de implementação

**Fase A — Domínio tático (sem mudança de UI)**
- Separar "terreno pintado" de "bloqueio produzido por objeto".
- Criar `MapaTaticoEfetivo` (custo, bloqueio, objetos por célula) e fazer
  movimento/pathfinding/posicionamento/rotação consumirem só ele.
- **Preservar exatamente** o comportamento atual de difícil e bloqueado.
- Critério: suíte de movimento/áreas passa sem alteração de teste.

**Fase B — Objetos persistentes**
- Migration `0085` (⚠ confirmar o próximo número livre): `vtt_objects` +
  `vtt_object_cells` + RLS + RPCs estreitas
  (`create/update/move/damage/delete_vtt_object`), com `revision` otimista.
- **Estender a RPC de movimento para consultar objetos** (D1/D3).
- Carregar objetos em `sceneStorage`; realtime via `postgres_changes` por
  `campaign_id` (padrão de `vtt_areas`).
- Migrar os objetos de `CENA_DEMO` para seed/preset real.
- Criar, selecionar, mover, rotacionar, duplicar, excluir.

**Fase C — Criação rápida**
- Presets (parede, porta, caixa/entulho, mesa, veículo, barricada, coluna,
  personalizado). Nota: **entulho não bloqueia** — projeta terreno difícil.
- Pincel de terreno com tamanho 1/3/7, arrasto contínuo e preenchimento de
  região contígua, com contagem visível ("12 células alteradas").
- Converter seleção de células em objeto.
- Undo/redo por **gesto inteiro**, nunca uma entrada por célula.

**Fase D — Cobertura consultiva + PD**
- Painel de PD: aplicar dano, reparar, destruir (D8).
- Ao chegar a 0 PD: remover ou virar entulho (transição no servidor).
- Linha atacante–alvo destacando objetos cruzados + sugestão
  ("Possível cobertura maior: coluna, 12/12 PD"), com o narrador confirmando
  ou substituindo. **Nunca** decidir sozinho.
- Registro no log da mesa.

---

## Convenções do projeto (seguir sem exceção)

- Migrations são arquivos **não versionados** em `supabase/migrations/`,
  aplicadas manualmente. Projeto Supabase: `yvxoijexyhjjipjktfuu`.
  Aplicar via MCP `apply_migration`, ou via `pg` (8.22 está em `node_modules`;
  **`psql` não está instalado**; scripts node precisam rodar a partir da raiz
  do projeto para resolver `pg`; connection string em `SUPABASE_DB_URL`).
  Registrar em `supabase_migrations.schema_migrations` para o registro não
  ficar com lacuna. ⚠ Confirmar a última aplicada antes de numerar.
- RPCs `security definer`, `search_path = public, pg_temp`,
  `revoke ... from public, anon` + `grant execute ... to authenticated`.
- Concorrência otimista por `revision`; recusar revisão desatualizada com
  `errcode = 'serialization_failure'`.
- Testes: `scripts/dev/check-*.ts` com Playwright, **mouse/teclado reais**
  (nunca `dispatchEvent`), fixtures via client `service_role`, contra o dev
  server em `localhost:3000`.
- Camada visual desligada **nunca** desliga a regra mecânica.

## Verificação obrigatória

```bash
npx tsc --noEmit
npm run build
npx tsx scripts/dev/check-vtt-areas.ts     # regressão do VTT (baseline: 114 ok)
```
Mais um `scripts/dev/check-vtt-objetos.ts` novo cobrindo, no mínimo:
bloqueio por objeto recusado **pelo servidor** (chamando a RPC direto, não só
pela UI), pegada multicélula contra objeto, objeto oculto bloqueando sem
vazar o motivo, destruição atualizando o mapa sem reload, e undo de um gesto
inteiro de pincel.

## Critérios de aceite

- Cena funcional criada **sem depender de `CENA_DEMO`**.
- Terreno difícil criado num gesto contínuo; distância e custo mostrados
  separadamente.
- Objeto bloqueador altera pathfinding e posicionamento **imediatamente**, e a
  recusa acontece **no servidor** mesmo se o cliente for adulterado.
- Destruir objeto atualiza o mapa mecânico sem recarregar a página.
- Jogador enxerga propriedades; só narrador altera terreno e objetos.
- Escritas simultâneas não sobrescrevem revisão mais nova em silêncio.
- Tudo continua correto para tokens Grande, Enorme e Colossal.
