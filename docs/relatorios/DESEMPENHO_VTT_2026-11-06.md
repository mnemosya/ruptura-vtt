# Medição inicial de desempenho do VTT — 06/11/2026

## Como reproduzir

Com o app local em `http://localhost:3000`, rode `npm run bench:vtt-browser`.
O script cria uma conta e duas campanhas temporárias no Supabase configurado,
abre o VTT real no Chromium headless, mede repouso, pan e zoom, e remove as
fixtures mesmo quando ocorre erro. Não usa a sessão pessoal de `.auth`.
Com `VTT_CHAT_COUNT=800`, acrescenta uma terceira campanha, com a mesma
grade 60×40 e 800 mensagens de chat em ordem cronológica, para comparar o
custo do histórico na mesma execução.
Com `VTT_BACKGROUND_PX=2048` ou `4096`, acrescenta uma campanha com um
fundo WebP real dessa dimensão. O arquivo é reservado, enviado ao bucket
privado, colocado na cena e removido junto com as demais fixtures. O teste
aguarda a transferência e captura uma pintura do mapa antes de medir a RAM.
Com `VTT_DICE_CYCLES=10 VTT_SKIP_SWITCH=1`, lança dez d8 na mesa real,
aguarda a arena 3D desmontar após cada rolagem e mede também depois de
fechar o painel de dados.
Com `VTT_SHEET_CYCLES=5`, abre e fecha cinco vezes a ficha de um
personagem real. `VTT_COMBINED=1 VTT_DICE_CYCLES=5 VTT_SHEET_CYCLES=5`
combina fundo 4096², 800 mensagens, ficha, rolagens e trocas de cena.

## Ambiente e cenário

- Next.js 16.2.9 em `next dev` (Turbopack), Chromium headless via Playwright,
  viewport de 1600×950. Supabase remoto configurado no `.env.local`.
- Cena A: 26×18 = 468 células SVG, 20 tokens.
- Cena B: 60×40 = 2.400 células SVG, 20 tokens.
- Pan: botão direito, 30 movimentos de 5×2 pixels, separados por 16 ms.
- Zoom: 12 eventos de roda, separados por 50 ms.
- Uma execução por cenário. `p95` é o 95º percentil do intervalo entre quadros
  capturados por `requestAnimationFrame`. CPU é o delta dos contadores CDP
  `Performance.getMetrics` durante cada gesto.

| Cena | Gesto | Quadro p95 | Quadros >33 ms | Long tasks | Tempo de script |
| --- | --- | ---: | ---: | ---: | ---: |
| 26×18 | Repouso | 17,3 ms | 2/129 | 2 (pior 85 ms) | 160 ms / 2,25 s |
| 26×18 | Pan | 100,0 ms | 8/70 | 8 (pior 114 ms) | 1.084 ms / 1,84 s |
| 26×18 | Zoom | 65,6 ms | 4/74 | 4 (pior 91 ms) | 447 ms / 1,46 s |
| 60×40 | Repouso | 17,7 ms | 1/119 | 1 (pior 301 ms) | 341 ms / 2,26 s |
| 60×40 | Pan | 300,0 ms | 21/50 | 8 (pior 328 ms) | 2.464 ms / 2,96 s |
| 60×40 | Zoom | 166,2 ms | 6/78 | 4 (pior 287 ms) | 1.255 ms / 2,19 s |

O mapa ficou pronto em 12,6 s (26×18) e 11,0 s (60×40). Esses tempos incluem
compilação e carga em `next dev`, então **não** servem como comparação de
carregamento entre as duas cenas.

## Leitura dos dados

O aumento de 468 para 2.400 células, mantendo 20 tokens, coincidiu com mais
tempo de JavaScript e intervalos maiores entre quadros durante pan e zoom.
O mapa desenha um `<path>` com handlers por célula e percorre as células em
cada render (`_mapa/MapaHex.tsx`). Isso é uma hipótese forte para o custo
observado, mas o benchmark não atribui tempo a componentes específicos.

São números preliminares de um navegador headless em build de desenvolvimento,
com uma única amostra por gesto. A próxima comparação de desempenho deve usar
uma build de produção e repetir os mesmos cenários três vezes. Para explicar
uma lentidão percebida numa mesa específica, também é preciso medir essa cena
e a ação concreta (por exemplo chat, ficha, movimento ou troca de cena).

## Continuação em build de produção

Build de produção local, Chromium headless e as mesmas cenas sintéticas. O
benchmark já inclui a memoização dos limites do mapa, portanto esta coleta
não mede o efeito isolado dessa mudança. Houve duas execuções completas, cada
uma com uma amostra por gesto e cena. Em ambas, o p95 de pan e zoom ficou
entre 16,8 e 17,5 ms na cena de 60×40, sem long tasks durante os gestos.
O tempo de script do pan nessa cena foi de 144–156 ms. O perfil de CPU em
produção ficou distribuído em funções compiladas e minificadas, sem um
gargalo individual conclusivo. O custo muito maior de `jsxDEV` visto em
`next dev` explica por que aquele teste não representava a fluidez da build
publicada.

Uma terceira execução em produção alternou entre a cena grande e outra cena
da mesma campanha, cinco vezes, sem recarregar a página. Após cada retorno à
cena grande, o teste aguardou a grade correta, esperou 300 ms e solicitou
coleta de lixo pelo protocolo de diagnóstico. Resultados dos retornos:

| Retorno | RSS do renderer | Heap JS usado | Nós DOM | Listeners |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 279 MiB | 17 MiB | 3.513 | 3.250 |
| 2 | 252 MiB | 15 MiB | 3.513 | 3.250 |
| 3 | 264 MiB | 15 MiB | 3.513 | 3.250 |
| 4 | 247 MiB | 15 MiB | 3.513 | 3.250 |
| 5 | 244 MiB | 15 MiB | 3.513 | 3.250 |

Neste fluxo de troca de cena, não apareceu retenção progressiva de nós,
listeners ou heap. O RSS oscilou e terminou abaixo do primeiro retorno. A
medição inicial da cena grande, antes da coleta de lixo, variou entre
284 e 311 MiB nas execuções. Ela inclui objetos temporários de carregamento;
comparar esse número diretamente ao patamar após cada retorno daria uma
conclusão incorreta. Ainda faltam cenas com imagens, histórico longo de chat,
ficha e dados 3D para cobrir o uso representativo da mesa.

## Handlers compartilhados na grade

Os gestos das células SVG passaram a ser tratados no grupo da grade. Cada
`<path>` conserva o índice da célula e a aparência individual. A build de
produção passou, e os gestos de pan, zoom, pintura contínua de terreno e
medição passaram no navegador. O check de troca de ferramenta também passou
com 15 critérios e nenhuma falha.

Na cena 60×40, o p95 do pan em produção ficou em 16,8 ms nesta execução,
próximo dos 16,8–17,1 ms das execuções anteriores. Após alternar cenas e
solicitar coleta de lixo, a contagem de listeners no retorno à cena grande
caiu de 3.250 para 851, com 3.513 nós DOM nos dois casos. O heap usado ficou
em 14–15 MiB, ante 15–17 MiB. O RSS do renderer oscilou entre 286 e 330 MiB,
ante 244–279 MiB na coleta anterior. Esta amostra **não demonstra redução
de RAM total**. A contagem menor de listeners mostra menos estado de eventos
retido, mas o RSS precisa ser comparado em mais rodadas e em cenas com imagens.

## Histórico longo de chat

Em uma build de produção, com a mesma grade 60×40 e 20 tokens, acrescentei
800 mensagens públicas temporárias. Antes da mudança no chat, os 800 cartões
eram montados no DOM. O pan ficou perceptivelmente mais lento mesmo sem
alterar o mapa. O painel agora monta os 100 cartões mais recentes e oferece
“Carregar mensagens anteriores” em lotes de 100. Os dados continuam
disponíveis para cartões fixados, não lidos e carregamento anterior.

| Cena 60×40, 800 mensagens | Antes | Após limite de 100 |
| --- | ---: | ---: |
| Cartões montados inicialmente | 800 | 100 |
| Nós DOM, após GC | 13.829 | 4.722 |
| Listeners, após GC | 1.497 | 798 |
| Heap JS usado, após GC | 21 MiB | 14 MiB |
| RSS inicial do renderer, após GC | 360 MiB | 313 MiB |
| Pan, intervalo p95 entre quadros | 66,6 ms | 17,1 ms |
| Pan, tempo de script | 1.260 ms | 261 ms |
| Zoom, intervalo p95 entre quadros | 33,3 ms | 16,8 ms |

Na mesma execução após a mudança, a cena sem chat teve pan p95 16,8 ms e
heap de 13 MiB. O botão de carregar anteriores montou 200 cartões e revelou
mensagens do lote anterior. Depois de cinco trocas de cena, com 200 cartões
montados e coleta de lixo forçada após cada retorno, o heap ficou em
18, 16, 16, 16 e 16 MiB; os nós ficaram em 4.814 nos quatro primeiros
retornos e 4.821 no último. O RSS foi de 351, 323, 335, 314 e 301 MiB.
Não há crescimento progressivo nesse fluxo. A diferença de RSS inicial é
promissora, mas uma execução por versão não determina uma economia estável
de RAM.

O `ChatTab` também passou a ignorar renders do componente da mesa quando
suas props e o contexto de sessão não mudam. Numa execução posterior com os
mesmos 800 logs e 100 cartões montados, o tempo de script do pan caiu de
261 para 108 ms, próximo dos 112 ms da cena sem chat na mesma execução.
O p95 ficou em 16,8 ms. O heap inicial permaneceu em 14 MiB e os nós em
4.722. Isso indica menos trabalho durante o gesto, sem criar uma segunda
cópia do histórico. A medição de imagem de fundo está abaixo; ficha e
dados 3D ainda não foram ensaiados.

## Imagem de fundo real — 07/11/2026

Comparei a cena 60×40 sem fundo com a mesma cena contendo uma imagem WebP
temporária. A textura foi de fato transferida e pintada pelo Chromium antes
da coleta. O arquivo comprimido era pequeno, mas o raster RGBA de 2048²
pixels equivale a cerca de 16 MiB; o de 4096², a cerca de 64 MiB. Esse
custo não aparece no heap JavaScript.

| Execução | Sem fundo, RSS inicial | Com fundo, RSS inicial | Heap com fundo | Pan p95 com fundo |
| --- | ---: | ---: | ---: | ---: |
| WebP 2048×2048, 56 KiB | 271 MiB | 262 MiB | 15 MiB | 17,0 ms |
| WebP 4096×4096, 205 KiB | 268 MiB | 421 MiB | 15 MiB | 17,3 ms |

O RSS mede o processo renderer inteiro e oscila com o alocador e o cache do
navegador. Por isso a diferença entre execuções é sinal de pressão de
memória ao carregar o fundo grande, não uma medida precisa do custo de uma
imagem. O processo GPU foi medido separadamente e também oscilou; não o
somei ao RSS do renderer como se fosse memória exclusiva da aba.

Após cinco alternâncias entre a cena com fundo de 4096² e uma cena sem
fundo, o RSS do renderer nos retornos foi 311, 319, 295, 236 e 286 MiB.
Heap, nós DOM e listeners ficaram em 14–15 MiB, 3.513 e 851. Na cena sem
fundo, o RSS caiu de 372 MiB na primeira visita para 231 MiB na quinta.
Não surgiu crescimento progressivo nesse ensaio; parte da memória do raster
foi devolvida ou reutilizada. A amostra de 2048² também oscilou, sem
crescimento monotônico. O próximo teste de memória deve usar imagens reais
da mesa e mais ciclos, com cache frio e quente separados.

O preparo da imagem no browser agora zera o canvas temporário assim que
termina a codificação WebP. Isso antecipa a liberação do buffer de pixels
durante preview e upload; ainda não há medição antes/depois desse pico de
preparo. Um check no Chromium confirmou que o Blob continua decodificando
com as dimensões originais depois de zerar o canvas.

## Rolagens 3D repetidas — 08/11/2026

Na cena 60×40, a memória antes das rolagens era 287 MiB no renderer,
106 MiB no processo GPU, 13 MiB de heap JS e 3.420 nós DOM. A ferramenta
“Dados” lançou um d8 dez vezes; em cada ciclo a arena apareceu e depois
desmontou. Após a coleta de lixo de diagnóstico, o RSS da GPU foi 165,
149, 139, 145, 146, 139, 130, 136, 144 e 144 MiB. Após fechar o painel,
ficou em 145 MiB. O renderer terminou em 232 MiB e o heap em 17 MiB.

O processo GPU continuou acima da leitura anterior às rolagens, mas não
cresceu a cada nova arena. O navegador pode reter alocações para reutilizar;
este ensaio não demonstra vazamento. Os nós DOM cresceram até 4.276 após
dez resultados porque cada rolagem acrescentou um card ao chat; depois de
fechar o painel ficaram em 4.130. A arena 3D desmontou em todos os ciclos.
Para fechar o diagnóstico de sessões longas, ainda cabe medir mais ciclos
no hardware alvo e alternar entre abrir/fechar ficha e dados.

## Ficha e sessão combinada — 08/11/2026

Com um personagem real na cena 60×40, cinco aberturas e fechamentos da
ficha passaram. Depois de fechar, o RSS do renderer foi 286, 290, 290,
286 e 285 MiB; o heap ficou em 16–17 MiB. A contagem de nós voltou para
cerca de 3.761 em quatro dos cinco fechamentos. O segundo fechamento foi
medido enquanto a limpeza ainda se assentava; o benchmark agora espera
300 ms antes de solicitar GC. Não apareceu crescimento progressivo.

Na campanha combinada, a primeira leitura com imagem 4096², 800 mensagens
e 100 cartões montados foi 499 MiB de RSS no renderer, 17 MiB de heap e
4.748 nós DOM. O pan ficou em 17,3 ms no p95, sem quadros acima de 33 ms.
Depois de carregar mais 100 cartões, cinco rolagens 3D e cinco aberturas da
ficha, o heap com a ficha fechada ficou entre 20 e 22 MiB e os nós se
estabilizaram perto de 6.685. Após cinco retornos à cena grande, o heap foi
21, 20, 20, 21 e 21 MiB, e os nós ficaram perto de 5.116; o RSS oscilou
entre 359 e 492 MiB. O processo GPU caiu de 178 para 135 MiB entre o
primeiro e o quinto retorno. Todas as fixtures, inclusive o objeto no
Storage, foram removidas.

Esses resultados não apontam retenção progressiva de heap, DOM ou GPU nos
fluxos ensaiados. A RAM de processo continua alta e variável quando o fundo
grande está em uso. Para escolher um limite de resolução menor, falta
comparar a nitidez real em zoom e telas de maior densidade. Também falta
repetir o ensaio prolongado no computador dos jogadores, com cache frio e
quente, e registrar o pico durante o preparo e a entrada da imagem.
