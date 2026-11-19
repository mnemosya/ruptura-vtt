/**
 * Fichas das propostas — o texto do índice `/dev/rolagem`.
 * Dado puro: quem desenha é `Indice.tsx`.
 */

export interface Ficha {
  letra: "A" | "B" | "C" | "D" | "E";
  nome: string;
  /** 1: a partir da janela "Rolar Dados"; 2: superfície desenhada do zero. */
  rodada: 1 | 2;
  rota: string;
  ideia: string;
  /** Linhas da comparação (mesmas chaves nas três). */
  eixos: {
    troca: string;
    segundoDado: string;
    preco: string;
    espaco: string;
    arremesso: string;
    ambar: string;
    mesaNaTroca: string;
    console: string;
  };
  referencias: string[];
  pontoFraco: string;
  linhaDoTempo: string[];
}

export const EIXOS: { chave: keyof Ficha["eixos"]; rotulo: string }[] = [
  { chave: "troca", rotulo: "Onde se troca" },
  { chave: "segundoDado", rotulo: "O dado não usado" },
  { chave: "preco", rotulo: "Como o preço aparece" },
  { chave: "espaco", rotulo: "Espaço quando ignorado" },
  { chave: "arremesso", rotulo: "O arremesso" },
  { chave: "ambar", rotulo: "Colisão do âmbar" },
  { chave: "mesaNaTroca", rotulo: "A mesa 3D na troca" },
  { chave: "console", rotulo: "Console da ficha" },
];

export const FICHAS: Ficha[] = [
  {
    letra: "A",
    rodada: 1,
    nome: "Reserva",
    rota: "/dev/rolagem-a",
    ideia:
      "O Dado de Sobrecarga cai junto como uma brasa: aceso por dentro, guardado numa linha de reserva logo abaixo do veredito, com o preço escrito no próprio botão. Trocar é um clique ali; o chat registra a troca e também oferece o desfazer.",
    eixos: {
      troca: "Na janela: a linha de reserva inteira é o botão.",
      segundoDado: "Recolhido numa linha: ficha do dado, o veredito que daria e o preço.",
      preco: "No próprio botão, na cor da consequência: âmbar (ponto), magenta (Ruptura), vermelho (Integridade, Última Vontade).",
      espaco: "Uma linha de 52 px em toda rolagem de magista; nada para quem não é magista. No contestado o corpo da janela rola (o botão de rolar fica fixo).",
      arremesso: "Normal em metal ciano (o de hoje). Sobrecarga em aço enfumaçado com as quinas em brasa: acende com a força da carga, gira 20% mais, assentado respira devagar.",
      ambar: "Âmbar vira identidade exclusiva do Sobrecarga. As faixas limitadas passam para o gelo (o meio da régua, sem cor de estado). A rampa da carga não muda: mede força, vive no botão e acaba antes de existir veredito.",
      mesaNaTroca: "Com os dados ainda na mesa, a brasa acende (pulso de 160 ms) e os números do Normal apagam. Se já saíram, nada: o registro carrega a troca.",
      console: "Serve igual: a reserva mora no corpo da janela que o Console reaproveita.",
    },
    referencias: [
      "Deus Ex: Mankind Divided — o custo como rótulo do próprio item escolhido (COST: AMMO) e o hack como ação alternativa num aviso lateral discreto.",
      "Cyberpunk 2077 — Breach Protocol: o buffer mostra as casas do que vai ser gasto antes de confirmar.",
      "Valorant — relatório de combate: número grande e ícone do que foi usado, lidos de relance.",
    ],
    pontoFraco:
      "Mexe na paleta das faixas, e isso vaza para o Console e para o chat. A reserva ocupa 52 px em toda rolagem de magista, inclusive nas que ignoram o Sobrecarga.",
    linhaDoTempo: [
      "Carga: a do RollButton real (0–100% em 2 s, anéis de 700→140 ms, clarão de 380 ms); os dois ícones tremem juntos e a brasa ganha luz com a força.",
      "Queda: resultado do Normal legível em ~1,5–2,1 s; o Sobrecarga avisa quando assenta (às vezes antes, às vezes depois).",
      "Veredito: entra em 180 ms (opacidade + 4 px, curva de saída forte) no instante em que o Normal assenta; a reserva entra em 180 ms quando o Sobrecarga assenta.",
      "Cartão no chat: 200 ms, quando os dois assentam.",
      "Troca: faixa e linha de reserva trocam em 180 ms; na mesa, pulso de luz de 160 ms e escala 1,09 → 1 em ~300 ms; os números do Normal apagam em ~250 ms.",
      "Saída dos dados: a da mesa real — 1,8 s de leitura, os últimos 320 ms apagando.",
    ],
  },
  {
    letra: "B",
    rodada: 1,
    nome: "Registro",
    rota: "/dev/rolagem-b",
    ideia:
      "A janela segue como hoje: rola e mostra o veredito do Normal, com a ficha apagada do Sobrecarga ao lado. A decisão mora no cartão do Chat Log, o registro que a mesa inteira lê; a cor do Sobrecarga é o preço da próxima troca, e acima do limite os d4 da perda de Integridade caem na mesa diante de todos.",
    eixos: {
      troca: "No cartão do Chat Log, só para quem rolou. A ficha do Sobrecarga na janela leva o foco até o botão do cartão.",
      segundoDado: "Ficha apagada ao lado do Normal, com o losango na cor do preço. O bloco de decisão vai só no cartão mais recente; nos anteriores vira uma linha (\"Sobrecarga 8 → 13\") que abre num clique.",
      preco: "Num selo que muda por faixa: violeta (+1 Sobrecarga), magenta (Ruptura), vermelho (excedentes, Última Vontade).",
      espaco: "Zero na janela. No chat, ~80 px no cartão mais recente de quem rolou; os antigos recolhem.",
      arremesso: "Normal em metal ciano (o de hoje). Sobrecarga em vidro aceso por dentro, na cor do preço; quanto mais caro, mais rápido pulsa na mesa (0,35, 0,8 e 1,3 Hz).",
      ambar: "Fica onde está: faixas limitadas e rampa da carga, sem recolorir nada. O Sobrecarga usa cores que já significam isso no VTT: violeta (magia), magenta (Ruptura), vermelho (dano e Integridade).",
      mesaNaTroca: "Com os dados na mesa, o Sobrecarga acende e o Normal apaga. Acima do limite, os d4 vermelhos da perda caem na mesa: o resultado vale na hora e a Integridade só cai quando eles assentam (desfazer no meio cancela).",
      console: "Não serve sozinha: no Console fora da campanha (/ficha) não há chat, e a decisão precisaria de um equivalente dentro dele.",
    },
    referencias: [
      "Valorant — relatório de combate: um registro compacto, lido de relance; aqui o cartão vira a superfície da decisão.",
      "Deus Ex: Mankind Divided — o custo escrito colado na ação (o selo junto do \"Usar\").",
      "Destiny 2 — a cor do elemento é a identidade do poder; aqui a cor do dado é o preço.",
      "Control — avisos que dizem o fato e param (\"zera com 5+\", \"Última Vontade\").",
    ],
    pontoFraco:
      "A decisão fica longe do olho de quem rolou: com o chat recolhido é um passo a mais. No cartão estreito (316 px), selo e botão ficam empilhados.",
    linhaDoTempo: [
      "Carga: a do RollButton real; o ícone do Sobrecarga brilha na cor do preço conforme a força, tremendo junto com o Normal.",
      "Queda: a da base; na mesa, o Sobrecarga respira no ritmo do preço.",
      "Faixa da janela: entra e troca em 180 ms. Cartão: entra em 200 ms; o veredito do cartão só anima quando muda (180 ms).",
      "Decisão e consequência no cartão: 180 ms. Perda pendente: um ponto pulsa (900 ms) enquanto os d4 rolam; a perda entra quando assentam.",
      "Hover: 120 ms; o \"Usar\" sobe 1 px em 160 ms.",
    ],
  },
  {
    letra: "C",
    rodada: 1,
    nome: "Mesa",
    rota: "/dev/rolagem-c",
    ideia:
      "Os dois dados são protagonistas na mesa: o Normal é matéria (aço sem cor), o Sobrecarga é luz (cristal ciano que acende com a força). A troca é oferecida onde todos olham, num rótulo junto do dado assentado e, na janela, lado a lado; quando acontece, a mesa reencena os dois dados e o Sobrecarga toma o lugar do Normal diante de todos.",
    eixos: {
      troca: "Na mesa (o rótulo junto do cristal é um botão; o ponteiro em cima segura os dados) e na janela (a coluna do Sobrecarga é o botão).",
      segundoDado: "Lado a lado com o Normal, mesmo tamanho, esmaecido até a troca, já com o total e a faixa que daria.",
      preco: "Numa barra de carga do conduto: células até o limite, a da Ruptura no limite e os excedentes com 1d4, 2d4, 3d4; a célula que a troca preencheria pulsa.",
      espaco: "O maior: duas colunas (~100 px) e a barra (~60 px) em toda rolagem de magista; no contestado o corpo da janela rola (o botão de rolar fica fixo).",
      arremesso: "Normal em aço sem cor. Sobrecarga em cristal ciano, mais leve e mais vivo (massa 0,8, quica e gira mais): tende a assentar depois do Normal. Uma etiqueta \"Ilya · Corpo + Mobilidade\" acompanha os dados para quem observa.",
      ambar: "\"Luz, não âmbar\": o Sobrecarga é ciano-luz; âmbar fica só nas faixas limitadas e na carga, sem recolorir nada. A colisão migra para o ciano (cromo e Sucesso Padrão) e é separada por luz e pela marca ✦.",
      mesaNaTroca: "Com os dados na mesa, a troca acontece no lugar. Se já saíram, a mesa reencena os dois parados onde assentaram por 1,3 s (atravessável) e o Sobrecarga acende no lugar do Normal; o desfazer reencena ao contrário.",
      console: "A janela serve (colunas e barra moram no corpo que o Console reaproveita); os rótulos dependem do palco, que no /ficha é o de reserva, em tela cheia.",
    },
    referencias: [
      "Cyberpunk 2077 — Breach Protocol: o buffer mostra as casas do que vai ser gasto; aqui a célula da troca pulsa na barra antes do clique.",
      "Control — a linha de marcos com o custo em cada nó; aqui a Ruptura e os excedentes marcados na barra.",
      "Deus Ex: Mankind Divided — o hack como ação alternativa num aviso lateral, junto do objeto; aqui o rótulo junto do dado.",
      "Destiny 2 — a luz do elemento como identidade do poder; aqui o Sobrecarga é o único dado que emite luz.",
    ],
    pontoFraco:
      "Ocupa mais espaço em toda rolagem de magista, e no contestado a janela passa do teto de 660 px (rola, com o botão fixo). Ciano sobre ciano é mais fraco de relance. O rótulo na mesa só vale enquanto os dados estão lá (1,8 s, ou enquanto o ponteiro segura).",
    linhaDoTempo: [
      "Carga: a do RollButton real; as duas colunas tremem juntas e o cristal ganha luz com a força.",
      "Queda: a etiqueta de quem rolou segue os dados e some 500 ms depois de assentarem (200 ms). Cada coluna recebe o valor em 180 ms quando o seu dado assenta.",
      "Rótulos na mesa: entram ao assentar; com o ponteiro em cima os dados não saem; ao sair, eles vão 900 ms depois.",
      "Troca com os dados na mesa: pulso de luz de 160 ms e escala 1,09 → 1 em ~300 ms no cristal; o Normal apaga em ~250 ms.",
      "Troca ou desfazer com os dados fora: reencenação de 1,3 s (entra em 140 ms, troca aos 160 ms, apaga nos últimos 320 ms), sem bloquear nada.",
      "Barra: a célula da troca pulsa num ciclo de 1,1 s; parada sob movimento reduzido.",
    ],
  },
  {
    letra: "D",
    rodada: 2,
    nome: "Régua",
    rota: "/dev/rolagem-d",
    ideia:
      "Sem janela: a rolagem é uma barra de ação no pé do palco. A régua mostra as dez faces do d10 já pintadas pela faixa que cada uma daria contra a CD. Antes de rolar, é a chance; depois, o Normal acende a sua casa e o Sobrecarga marca a dele, com o preço pendurado. Trocar é levar a luz de uma casa para a outra.",
    eixos: {
      troca: "Na etiqueta pendurada sob a casa do Sobrecarga. Com o ponteiro em cima, a casa nova aparece tracejada, a leitura mostra o veredito que daria e a casa do conduto que vai encher pisca.",
      segundoDado: "Um losango violeta sob a casa em que caiu, na mesma régua do Normal: a distância entre os dois é a distância entre os resultados.",
      preco: "Na etiqueta, na cor do preço (violeta, magenta, vermelho), e no conduto ao lado: casas até o limite, a da Ruptura em magenta e os excedentes em vermelho.",
      espaco: "Altura fixa: ~240 px, ~265 no contestado, com a largura do palco. O resultado não faz nada crescer. Não magista: sem losango e sem conduto.",
      arremesso: "Normal em metal ciano (o de hoje). Sobrecarga em vidro violeta aceso por dentro: acende com a força, gira 15% mais e, assentado, respira devagar.",
      ambar: "Fica onde está (faixas limitadas e carga). O Sobrecarga é violeta, a cor de magia do VTT, e se separa também pela forma: é losango, não casa.",
      mesaNaTroca: "Com os dados na mesa, o Sobrecarga acende e o Normal apaga. Se já saíram, nada: a régua e o chat carregam a troca.",
      console: "A régua serve em qualquer largura acima de ~380 px e caberia no corpo da janela do Console; a barra larga é só do palco.",
    },
    referencias: [
      "XCOM 2 — a chance aparece antes do clique, com o detalhamento do que soma; aqui as dez faces já mostram onde cada uma cai.",
      "Into the Breach — a prévia de tudo antes de confirmar; aqui o ponteiro no Usar mostra a casa nova e a casa do conduto que enche.",
      "Darkest Dungeon — o estresse como barra de casas, com um limiar que muda tudo; aqui o conduto com a casa da Ruptura.",
      "Balatro — o resultado como soma de partes à vista; aqui a conta sob o total e a casa acesa.",
    ],
    pontoFraco:
      "É a mais analítica: lê como painel, não como momento. Num palco estreito a conta trunca, e a etiqueta se afasta do losango quando a casa está na borda.",
    linhaDoTempo: [
      "Carga: a do RollButton real; os dois dados da barra tremem juntos e o violeta ganha luz com a força.",
      "Queda: as casas varrem da esquerda para a direita (ciclo de 1 s) até o Normal assentar.",
      "Normal assentou: a casa acende em 200 ms (escala vertical e opacidade); a leitura entra em 180 ms.",
      "Sobrecarga assentou: o losango cai em 220 ms e a etiqueta entra em 200 ms.",
      "Prévia: tracejado em 140 ms. Troca: a luz desliza até a casa nova em 260 ms.",
    ],
  },
  {
    letra: "E",
    rodada: 2,
    nome: "Carta",
    rota: "/dev/rolagem-e",
    ideia:
      "Sem janela: o teste é uma carta. Na frente ela se monta: a perícia como título, o atributo, a conta e a CD. Ao rolar, ela vira e mostra o Dado Normal, e a carta do Sobrecarga desliza de trás dela, com o preço num selo no canto. A carta que vale fica levantada; trocar é levantar a outra.",
    eixos: {
      troca: "Clicando na carta do Sobrecarga, que é o botão inteiro. Desfazer é clicar na carta do Normal baixada (ou no chat).",
      segundoDado: "Uma carta do mesmo tamanho, baixada e apagada ao lado, já com o total e a faixa que daria.",
      preco: "No selo do canto, o que se perde: +1 (violeta), −N de Integridade (magenta, Ruptura) ou kd4 (vermelho, excedente). O rodapé da carta explica.",
      espaco: "O maior momento: ~420 px no centro do palco enquanto a carta está virada; montando, uma carta de 292 px. Não magista: uma carta só.",
      arremesso: "Normal em metal ciano. Sobrecarga em brasa na cor do preço da próxima troca, respirando mais rápido quanto mais cara. Acima do limite, os d4 vermelhos da perda caem na mesa.",
      ambar: "Fica onde está. O Sobrecarga não tem cor fixa: tem a cor do preço, cores que já significam isso no VTT (magia, Ruptura, dano).",
      mesaNaTroca: "Com os dados na mesa, a brasa acende e o Normal apaga. Acima do limite, os d4 caem, e a Integridade só cai quando eles assentam.",
      console: "A carta cabe como peça (292 px), mas no Console substituiria o corpo inteiro da janela: seria refazer o Console.",
    },
    referencias: [
      "Slay the Spire — o custo num selo no canto da carta; aqui o selo diz o que se perde.",
      "Hades — a escolha entre opções lado a lado, com o ganho escrito; aqui as duas cartas, cada uma com o seu veredito.",
      "Baldur's Gate 3 — o teste como momento no centro da tela, com a CD em destaque; aqui a gema da CD no canto.",
      "Inscryption — o preço pago com algo seu, à vista na mesa; aqui os d4 da perda caindo diante de todos.",
    ],
    pontoFraco:
      "Ocupa o centro do palco por mais tempo, e os dados 3D assentam por cima do topo das cartas. É a que mais se afasta do Console. Quem observa recebe as cartas de outra pessoa na própria tela (elas recolhem sozinhas em 6 s).",
    linhaDoTempo: [
      "Carga: a do RollButton real; os dois dados da faixa de ações tremem juntos.",
      "Lance: a carta vira em 300 ms (meio giro), e a do Sobrecarga desliza de trás em 280 ms.",
      "Cada dado assentou: o total da carta entra em 220 ms (8 px e escala 0,94 → 1).",
      "Troca: as cartas trocam de altura em 260 ms (a que vale sobe 6 px; a outra desce 20 px e apaga); a fita Vale entra em 180 ms.",
      "Quem observa: as cartas recolhem para uma pílula depois de 6 s sem mudança.",
    ],
  },
];
