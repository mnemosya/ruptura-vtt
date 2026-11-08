# Plano de desempenho e memória do VTT

**Objetivo:** mover o mapa e os tokens com fluidez e manter uma sessão longa dentro da memória disponível no computador dos jogadores. Acompanhar três problemas separadamente: demora para entrar, demora para responder a um gesto e consumo de RAM enquanto se joga.

O [benchmark inicial](../relatorios/DESEMPENHO_VTT_2026-11-06.md) mostrou, em desenvolvimento, que passar de 468 para 2.400 células com os mesmos 20 tokens levou o p95 do intervalo entre quadros no pan de 100 para 300 ms. Em repouso, ambos ficaram perto de 17 ms. Ainda falta uma comparação com uma revisão anterior em build de produção.

**Atualização após iniciar o plano.** Na build de produção, as duas cenas
sintéticas tiveram pan e zoom próximos de 17 ms no p95. Cinco alternâncias
entre cenas da mesma campanha não mostraram crescimento progressivo de heap,
nós DOM ou listeners após coleta de lixo. O histórico longo de chat e um
fundo WebP de 4096² px, ficha e dados 3D já foram medidos; o próximo
cenário prioritário é uma sessão prolongada no hardware dos jogadores. Os números
estão no relatório ligado acima.

Os gestos da grade agora compartilham handlers. A cena 60×40 teve 851
listeners após voltar à mesma cena, ante 3.250 na coleta anterior. O RSS do
renderer ainda não mostrou redução confiável. Com 800 mensagens, o chat
montava 13,8 mil nós e o pan tinha p95 de 66,6 ms. O limite inicial de
100 cartões reduziu os nós para 4,7 mil e o pan para 17,1 ms; o heap usado
após GC caiu de 21 para 14 MiB nas execuções comparadas. O cenário com
imagens de fundo reais começou em 07/11/2026. Isolar o `ChatTab` dos
renders da câmera reduziu o tempo de script do pan com esse histórico de
261 para 108 ms, próximo dos 112 ms da cena sem chat na mesma execução.

Um fundo WebP de 4096² px manteve pan p95 em 17,3 ms, mas a primeira
medição do RSS do renderer chegou a 421 MiB, ante 268 MiB na cena sem
fundo da mesma execução. Após cinco alternâncias não apareceu crescimento
progressivo. O canvas de preparo agora libera seu buffer ao terminar o
WebP; falta medir o pico durante upload. Antes de reduzir a resolução
permitida, comparar nitidez nos níveis de zoom usados pelos jogadores.

Dez rolagens 3D na mesma cena desmontaram a arena a cada ciclo. O RSS da
GPU variou de 130 a 165 MiB depois das rolagens, sem crescimento contínuo,
e ficou em 145 MiB após fechar o painel. O chat recebeu dez resultados e
explica o aumento de nós DOM. Cinco aberturas da ficha real também não
mostraram crescimento progressivo. Numa sessão combinada com 800 mensagens,
fundo 4096², cinco rolagens, cinco aberturas da ficha e cinco trocas de
cena, o heap voltou a 20–21 MiB e os nós a cerca de 5,1 mil após cada
retorno à cena grande. O RSS do renderer variou entre 359 e 492 MiB. A
próxima leitura deve durar mais e ocorrer no computador usado pelos
jogadores, separando cache frio, quente e pico de preparo da imagem.

## 1. Construir a referência de produção

Estender o [benchmark existente](../../scripts/dev/benchmark-vtt-browser.ts). Usar build de produção local, viewport, navegador e máquina fixos; registrar revisão do código, resolução e escala de pixels. Manter as duas cenas atuais e adicionar uma mesa representativa com mapa de fundo, áreas, histórico de chat e ficha. Anotar dimensões das imagens, número de tokens e tamanho do histórico. Usar contas descartáveis. Onde houver um computador representativo dos jogadores, validar também com navegador visível e aceleração gráfica habitual.

| Pergunta | Procedimento | Medida |
| --- | --- | --- |
| Quando dá para jogar? | Entrar com cache frio e voltar com cache quente. Esperar a cena correta, os tokens e a cortina de entrada desaparecer; executar um gesto e conferir o resultado. | Tempo até a mesa aceitar o gesto; duração e volume das requisições no caminho. |
| O mapa acompanha a mão? | Repetir pan, zoom e arrasto sobre o mapa visível. Verificar que a transformação mudou e o token chegou ao destino. Comparar os mesmos gestos, incluindo repouso como controle. | p95 do intervalo entre quadros, quadros acima de 33 ms, tempo de script, layout e pintura. |
| É o cliente ou a sincronização? | Mover um token e enviar uma mensagem com dois clientes. Cronometrar no mesmo controlador de teste. | Tempo até a resposta local e, separadamente, até o resultado visível no segundo cliente. |
| Quanto a mesa ocupa? | Em um navegador dedicado, medir aba vazia, cena estabilizada, pico durante uso, retorno à mesma cena e saída da mesa. | Memória do processo de renderização em MB, heap JS usado e contagem de nós DOM e listeners. Observar processo GPU separadamente: ele pode ser compartilhado. |

Fazer ao menos três rodadas por cenário, alternando a ordem das cenas; publicar a mediana e a faixa entre rodadas. Coletar perfis detalhados e snapshots de memória em execuções separadas, pois a própria captura altera os tempos. Guardar as medidas por revisão: se a pergunta for “piorou desde quando?”, executar a mesma rotina em uma revisão anterior compatível.

## 2. Reduzir o custo da câmera e da grade

Começar em `VttClient.tsx` e `_mapa/MapaHex.tsx`. Hoje pan/zoom passam pelo estado do componente da mesa; o mapa calcula os limites a partir das células e produz um elemento SVG interativo por hexágono. Capturar um perfil de pan na cena 60×40 para distinguir tempo no React, cálculo de geometria e pintura.

1. Se o custo estiver na reconstrução da grade, calcular os limites só quando as dimensões mudarem e separar a camada estática da transformação da câmera. Um pan muda a posição do grupo; não precisa recalcular o desenho de cada célula. Evitar guardar uma segunda cópia da cena para obter esse ganho.
2. Se a quantidade de elementos continuar dominando tempo ou RAM, prototipar uma grade SVG repetida e desenhar individualmente apenas realces, terreno e células interativas necessárias. Converter a posição do ponteiro para hexágono no mapa; medir o protótipo antes de substituir a grade.
3. Aceitar cada mudança isoladamente depois de comparar quadros **e** MB na mesma cena. Validar zoom sob o cursor, seleção, pintura, régua, arrasto em grupo e posição exibida ao segundo jogador. Meta inicial para o cenário de referência a 60 Hz: p95 de pan/zoom até 33 ms, sem aumento de memória além da variação observada no controle.

## 3. Medir e reduzir a RAM da sessão longa

Esta frente começa junto com o perfil da câmera. Distinguir **pico** (por exemplo, carregar uma imagem grande), **consumo estável alto** (uma cena aberta custa muito) e **retenção** (cada visita deixa mais recursos vivos). Cada um pede uma correção diferente.

- Aquecer a mesa; depois repetir 20 vezes: alternar entre duas cenas, abrir/fechar a ficha e voltar ao mesmo ponto. Em testes separados, repetir rolagens 3D e abrir/fechar imagens e chat. Manter uma aba parada pelo mesmo período como controle. Registrar pico e memória após estabilização nos ciclos 1, 5, 10 e 20.
- Se a memória continuar subindo, comparar snapshots do heap após coleta de lixo **somente no diagnóstico**. Seguir as referências que mantêm nós removidos, dados de tokens, callbacks ou assinaturas de cenas antigas vivos. Se o heap estabilizar e a memória do processo crescer, investigar imagens decodificadas, canvas e recursos WebGL. RSS alta sozinha não prova vazamento.
- Escolher a correção a partir do recurso dominante. Em imagens, medir dimensões decodificadas e usar miniaturas para listas; em caches de tokens, definir descarte por cena ou limite de entradas. No painel, abas ocultas preservam scroll e notificações por projeto: se forem caras, manter esse estado pequeno e limitar a lista montada. Nos dados 3D e previews já há descarte de recursos; verificar os caminhos de fechar, cancelar e trocar de cena antes de adicionar mais limpeza.
- **Aceite:** após o aquecimento, o patamar de memória ao voltar à mesma cena deve permanecer dentro da faixa de variação do controle, sem acúmulo por ciclo de cenas antigas, listeners, texturas ou nós desconectados. Fixar um teto absoluto para pico e uso estável em MB **após** medir a mesa representativa no hardware alvo. Revalidar também a velocidade de reabertura: um cache menor pode aumentar espera e tráfego.

## 4. Evitar regressões

Entregar a referência e o primeiro perfil antes das otimizações. Depois, uma mudança por vez, com tabela antes/depois e teste da interação afetada. Se o atraso principal estiver em abrir a mesa ou em receber ações remotas, priorizar as requisições lentas ou duplicadas identificadas na etapa 1. Manter um teste curto de pan/zoom em mudanças de mapa e rodar o ensaio longo de memória antes de releases que alterem mapa, imagens, chat ou dados 3D. Fixar limites de regressão só quando a variação natural das execuções for conhecida.
