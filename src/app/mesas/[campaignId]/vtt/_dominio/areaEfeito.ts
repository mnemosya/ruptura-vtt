/**
 * Áreas de efeito de Ruptura — domínio PURO (sem React, DOM, banco ou
 * estado global). Fonte da regra: `docs/fontes/16 COMBATE` → "ÁREA".
 *
 * O QUE ESTE MÓDULO FAZ: descreve a REGIÃO GEOMÉTRICA CONTÍNUA de cada
 * formato e deriva dela (a) quais células o efeito afeta e (b) quais
 * tokens o efeito afeta. O que ele NÃO faz — de propósito, e é
 * requisito da entrega: nada de dano, cura, condição, vantagem, teste,
 * salvamento, bloqueio de movimento, bloqueio de ataque ou qualquer
 * outra consequência mecânica. O VTT mostra a geometria e diz quem
 * está dentro; quem decide o efeito é a mesa.
 *
 * ── AS DUAS REGRAS ──────────────────────────────────────────────────
 *
 * CÉLULA AFETADA (regra do livro, textual): "uma célula é afetada
 * quando a área cobre pelo menos metade dela".
 *
 *     área(polígono_da_célula ∩ região) / área(polígono_da_célula) ≥ 0,5
 *
 * Medida contra o HEXÁGONO REAL da célula (`poligonoDaCelula`), nunca
 * contra o centro, a distância entre centros, uma caixa retangular, a
 * contagem de vértices dentro ou um arredondamento visual. 50%
 * exatamente CONTA (ver `TOLERANCIA_FRACAO` em `geometria.ts`).
 *
 * TOKEN AFETADO: a mesma fração, mas sobre a PEGADA COMPLETA:
 *
 *     área(pegada ∩ região) / área(pegada) ≥ 0,5
 *
 * A pegada é a união dos hexágonos efetivamente ocupados
 * (`_dominio/pegada.ts` — categoria, orientação atual, pegada
 * personalizada, irregular). Como esses hexágonos são disjuntos e têm
 * todos a MESMA área, a fração da pegada é exatamente a MÉDIA das
 * frações das células que ela ocupa — identidade exata, não
 * aproximação, e é o que permite reaproveitar as frações por célula já
 * calculadas em vez de refazer a conta.
 *
 * As duas listas são calculadas e expostas SEPARADAMENTE: "o token
 * está numa célula afetada" NÃO é convertido automaticamente em "o
 * token está afetado", porque um Colossal pode ocupar ao mesmo tempo
 * células dentro e fora da região.
 *
 * EXCEÇÃO DA LINHA (a única exceção do livro): no modo `traco_fino` a
 * linha é um traço geométrico sem área — então a regra dos 50% não se
 * aplica. Vale a regra textual: "qualquer criatura ocupando uma célula
 * atravessada pela linha pode ser afetada". Atravessar é cruzar o
 * INTERIOR da célula; tocar um vértice ou correr rente a uma aresta
 * não conta (`segmentoCruzaInteriorDoConvexo`).
 *
 * ── TRIDIMENSIONALIDADE ─────────────────────────────────────────────
 * Esfera, Domo, Parede e Cubo são volumes. O mapa é uma projeção
 * superior e o projeto NÃO tem coordenada vertical — então a altura
 * (`alturaM`) e o nível de origem (`nivelOrigemM`) são PRESERVADOS no
 * modelo e mostrados na interface, sem nenhum motor 3D e sem nenhuma
 * regra derivada deles nesta rodada. Esfera e Domo têm a MESMA
 * projeção superior e continuam tipos SEMANTICAMENTE distintos (tipo
 * persistido, ícone, descrição e estilo próprios) — nunca colapsados
 * num só por terem o mesmo desenho 2D.
 */

import { type Hex, hexKey } from "../_mapa/hex";
import { dentroDoMapa } from "./movimento";
import {
  type Caixa, type Ponto, type Poligono,
  TOLERANCIA_FRACAO, areaDiscoPoligono, areaPoligono, areaUniaoConvexosEm, caixaDe, caixasSeparadas,
  clipPorSemiPlanos, poligonoSimples, segmentoCruzaInteriorDoConvexo, temPontosDuplicadosConsecutivos, triangular,
} from "./geometria";
import { type PontoAxial, areaDaCelula, axialParaMundo, metrosParaMundo, mundoParaAxial, poligonoDaCelula } from "./escalaMapa";

export type { PontoAxial } from "./escalaMapa";

export type TipoArea =
  | "esfera" | "domo" | "aura" | "linha" | "faixa" | "parede" | "cubo" | "cone" | "personalizada";

export const TIPOS_AREA: readonly TipoArea[] = [
  "esfera", "domo", "aura", "linha", "faixa", "parede", "cubo", "cone", "personalizada",
];

/** Modo da Linha — `uma_celula` é o padrão do livro; `traco_fino` é a exceção explícita. */
export type ModoLinha = "uma_celula" | "traco_fino";

/** Abertura do Cone — REGRA CANÔNICA, fixa. Não vira 60° por a grade ser hexagonal. */
export const ABERTURA_CONE_GRAUS = 45;
/** Largura da Parede — REGRA CANÔNICA, fixa em 1 metro. */
export const LARGURA_PAREDE_M = 1;
/** Largura da Linha no modo `uma_celula` — "o efeito mais estreito possível", 1 célula = 1 metro. */
export const LARGURA_LINHA_M = 1;

/** Abaixo disto, um gesto é clique, não arraste: nunca vira geometria (evita área degenerada). */
export const MINIMO_DIMENSAO_M = 0.25;

export const MAXIMO_RAIO_M = 60;
export const MAXIMO_COMPRIMENTO_M = 120;
export const MAXIMO_LARGURA_M = 60;
export const MAXIMO_ALTURA_M = 60;
/** Teto de vértices de Parede/Personalizada — protege o servidor e o cálculo por quadro. */
export const MAXIMO_PONTOS = 64;

/**
 * Magnitude máxima (em unidades axiais, |q| e |r| independentemente)
 * de uma ORIGEM ou de um PONTO de Parede/Personalizada — mesmo limite
 * de `vtt_areas_origem_q_magnitude`/`vtt_area_pontos_validos` no banco
 * (migration 0082), nunca um segundo número escolhido em paralelo. O
 * mapa mais largo permitido (`vtt_scenes.largura/altura`, migration
 * 0065) é 200 células; 1000 dá 5× de folga pra uma origem ficar um
 * pouco fora da borda visível sem se aproximar de um valor que
 * comprometa `celulasCandidatas` (que, além disso, já recorta contra o
 * tamanho REAL da cena antes de iterar — este limite é a segunda
 * camada, não a única).
 */
export const MAGNITUDE_MAXIMA_COORDENADA = 1000;

export const CORES_AREA = ["ciano", "ambar", "verde", "vermelho", "roxo", "branco"] as const;
export type CorArea = (typeof CORES_AREA)[number];

export const HEX_COR_AREA: Record<CorArea, string> = {
  ciano: "#00d4ff", ambar: "#f5a200", verde: "#22d3aa", vermelho: "#ff5f74", roxo: "#8b5cf6", branco: "#eafcff",
};

export interface MetaTipoArea {
  rotulo: string;
  glifo: string;
  /** Instrução curta mostrada no painel enquanto o tipo está escolhido. */
  instrucao: string;
  descricao: string;
  /** O formato representa volume? (só informativo — nenhuma regra 3D é aplicada nesta rodada) */
  tridimensional: boolean;
  /** Interação: arraste contínuo, ou percurso por cliques. */
  gesto: "arraste" | "pontos" | "token";
}

export const META_AREA: Record<TipoArea, MetaTipoArea> = {
  esfera: {
    rotulo: "Esfera", glifo: "◎", instrucao: "Arraste para definir o raio.", gesto: "arraste", tridimensional: true,
    descricao: "Parte de um ponto de origem e se estende em todas as direções até o raio indicado, formando um volume. Pode atingir quem não está no chão.",
  },
  domo: {
    rotulo: "Domo", glifo: "◯", instrucao: "Arraste para definir o raio.", gesto: "arraste", tridimensional: true,
    descricao: "Meia-esfera a partir de um ponto de origem: cobre apenas a região acima da superfície escolhida. Mesma projeção superior de uma esfera, formato diferente.",
  },
  aura: {
    rotulo: "Aura", glifo: "⊙", instrucao: "Escolha um token e arraste para definir o raio.", gesto: "token", tridimensional: false,
    descricao: "Projeta-se a partir da área ocupada pelo próprio personagem e acompanha o token quando ele se move, gira ou muda de pegada.",
  },
  linha: {
    rotulo: "Linha", glifo: "—", instrucao: "Arraste da origem na direção do efeito.", gesto: "arraste", tridimensional: false,
    descricao: "O efeito mais estreito possível: segue reto a partir da origem. Normalmente ocupa uma célula de largura; em efeitos específicos, um traço fino que atravessa o centro das células.",
  },
  faixa: {
    rotulo: "Faixa", glifo: "═", instrucao: "Arraste para definir direção e comprimento.", gesto: "arraste", tridimensional: false,
    descricao: "Como a linha, mas com largura declarada — um corredor reto de efeito.",
  },
  parede: {
    rotulo: "Parede", glifo: "▭", instrucao: "Adicione os pontos da parede e conclua.", gesto: "pontos", tridimensional: true,
    descricao: "Barreira contínua de 1 metro de largura, com comprimento e altura declarados. Nesta versão é apenas representação — não bloqueia movimento, ataque nem visão automaticamente.",
  },
  cubo: {
    rotulo: "Cubo", glifo: "▢", instrucao: "Arraste para definir o tamanho da base.", gesto: "arraste", tridimensional: true,
    descricao: "Volume de lados iguais: a base é um quadrado de lado L e a altura também é L.",
  },
  cone: {
    rotulo: "Cone", glifo: "◢", instrucao: "Arraste para definir direção e alcance.", gesto: "arraste", tridimensional: false,
    descricao: "Parte da origem e abre na direção escolhida com abertura fixa de 45°, até o alcance indicado.",
  },
  personalizada: {
    rotulo: "Personalizada", glifo: "⬟", instrucao: "Clique para adicionar pontos e fechar a área.", gesto: "pontos", tridimensional: false,
    descricao: "Não é um formato oficial do livro — é apoio ao narrador para efeitos incomuns. Polígono livre, inclusive côncavo.",
  },
};

/**
 * Parâmetros CANÔNICOS de uma área — o que é persistido e o que
 * renderização e cálculo consomem, os dois, sem nenhuma segunda
 * verdade. Coordenadas em axial FRACIONÁRIO (independente de zoom,
 * pan e do raio de hexágono usado no desenho), distâncias em METROS,
 * direção em GRAUS no plano do mapa.
 */
export type ParametrosArea =
  | { tipo: "esfera"; origem: PontoAxial; raioM: number; alturaM: number | null; nivelOrigemM: number | null }
  | { tipo: "domo"; origem: PontoAxial; raioM: number; alturaM: number | null; nivelOrigemM: number | null }
  | { tipo: "aura"; origem: PontoAxial; raioM: number; tokenId: string }
  | { tipo: "linha"; origem: PontoAxial; direcaoGraus: number; comprimentoM: number; modo: ModoLinha }
  | { tipo: "faixa"; origem: PontoAxial; direcaoGraus: number; comprimentoM: number; larguraM: number }
  | { tipo: "parede"; pontos: PontoAxial[]; alturaM: number }
  | { tipo: "cubo"; origem: PontoAxial; direcaoGraus: number; ladoM: number }
  | { tipo: "cone"; origem: PontoAxial; direcaoGraus: number; alcanceM: number }
  | { tipo: "personalizada"; pontos: PontoAxial[] };

/**
 * A REGIÃO contínua resolvida em unidades do mundo. Uma única
 * construção alimenta desenho E cálculo:
 *
 *  - `disco`/`setor` continuam círculo/setor VERDADEIROS (arco de
 *    verdade no SVG, interseção analítica no cálculo) — nunca
 *    poligonizados;
 *  - `poligono` traz `contorno` (o que se desenha) e `pecas` (partição
 *    convexa disjunta usada pra medir área — para formas convexas as
 *    duas são a mesma coisa);
 *  - `corredor` é a Parede: traçado de largura fixa com junção em
 *    BISEL. É desenhado como um `<path>` com `stroke-width` e
 *    `stroke-linejoin="bevel"`, e medido como a união dos retângulos
 *    por segmento mais os triângulos de bisel nas junções — a MESMA
 *    região, derivada dos MESMOS parâmetros (pontos + largura + bisel);
 *  - `segmento` é a Linha em traço fino: área zero por definição, e
 *    por isso o único caso que usa a exceção da Linha.
 */
export type RegiaoArea =
  | { forma: "disco"; centro: Ponto; raio: number }
  | { forma: "setor"; centro: Ponto; raio: number; direcaoRad: number; meiaAberturaRad: number }
  | { forma: "poligono"; contorno: Poligono; pecas: Poligono[] }
  | { forma: "corredor"; pontos: Ponto[]; largura: number; pecas: Poligono[] }
  | { forma: "segmento"; a: Ponto; b: Ponto };

const GRAUS = Math.PI / 180;

function versor(grausAngulo: number): Ponto {
  const a = grausAngulo * GRAUS;
  return { x: Math.cos(a), y: Math.sin(a) };
}

/** Perpendicular no sentido do "lado direito" do vetor, na convenção de tela (y para baixo). */
function perpendicular(u: Ponto): Ponto {
  return { x: -u.y, y: u.x };
}

/** Retângulo a partir de uma origem, com direção, comprimento e largura CENTRADA no eixo. */
function retanguloDoEixo(origem: Ponto, u: Ponto, comprimento: number, largura: number): Poligono {
  const n = perpendicular(u);
  const meia = largura / 2;
  const fim = { x: origem.x + u.x * comprimento, y: origem.y + u.y * comprimento };
  return [
    { x: origem.x + n.x * meia, y: origem.y + n.y * meia },
    { x: fim.x + n.x * meia, y: fim.y + n.y * meia },
    { x: fim.x - n.x * meia, y: fim.y - n.y * meia },
    { x: origem.x - n.x * meia, y: origem.y - n.y * meia },
  ];
}

/**
 * Traçado de largura fixa com junção em BISEL, como união de peças
 * convexas: um retângulo por segmento e, em cada vértice interno, os
 * dois triângulos de bisel (o do lado externo da curva preenche a
 * falha; o do lado interno já está coberto e o cálculo de união
 * absorve a sobreposição sem contar duas vezes).
 */
function pecasDoTracado(pontos: readonly Ponto[], largura: number): Poligono[] {
  const pecas: Poligono[] = [];
  const meia = largura / 2;
  const dirs: Ponto[] = [];
  for (let i = 0; i < pontos.length - 1; i++) {
    const dx = pontos[i + 1].x - pontos[i].x;
    const dy = pontos[i + 1].y - pontos[i].y;
    const comprimento = Math.hypot(dx, dy);
    if (comprimento < 1e-12) { dirs.push({ x: 0, y: 0 }); continue; }
    const u = { x: dx / comprimento, y: dy / comprimento };
    dirs.push(u);
    pecas.push(retanguloDoEixo(pontos[i], u, comprimento, largura));
  }
  for (let i = 1; i < pontos.length - 1; i++) {
    const a = dirs[i - 1];
    const b = dirs[i];
    if ((a.x === 0 && a.y === 0) || (b.x === 0 && b.y === 0)) continue;
    const na = perpendicular(a);
    const nb = perpendicular(b);
    const p = pontos[i];
    pecas.push([p, { x: p.x + na.x * meia, y: p.y + na.y * meia }, { x: p.x + nb.x * meia, y: p.y + nb.y * meia }]);
    pecas.push([p, { x: p.x - na.x * meia, y: p.y - na.y * meia }, { x: p.x - nb.x * meia, y: p.y - nb.y * meia }]);
  }
  return pecas.filter((peca) => areaPoligono(peca) > 1e-12);
}

/**
 * Constrói a região contínua de uma área. `null` quando os parâmetros
 * ainda não descrevem geometria válida (menos de 2 pontos, polígono
 * inválido, dimensão degenerada) — quem chama trata isso como "ainda
 * não dá pra concluir", nunca desenha algo degenerado.
 */
export function regiaoDaArea(params: ParametrosArea, tamanhoCelula: number): RegiaoArea | null {
  const m = (metros: number) => metrosParaMundo(metros, tamanhoCelula);

  switch (params.tipo) {
    case "esfera":
    case "domo":
    case "aura": {
      const raio = m(params.raioM);
      if (raio <= 0) return null;
      return { forma: "disco", centro: axialParaMundo(params.origem, tamanhoCelula), raio };
    }
    case "cone": {
      const raio = m(params.alcanceM);
      if (raio <= 0) return null;
      return {
        forma: "setor",
        centro: axialParaMundo(params.origem, tamanhoCelula),
        raio,
        direcaoRad: params.direcaoGraus * GRAUS,
        meiaAberturaRad: (ABERTURA_CONE_GRAUS / 2) * GRAUS,
      };
    }
    case "linha": {
      const origem = axialParaMundo(params.origem, tamanhoCelula);
      const u = versor(params.direcaoGraus);
      const comprimento = m(params.comprimentoM);
      if (comprimento <= 0) return null;
      if (params.modo === "traco_fino") {
        return { forma: "segmento", a: origem, b: { x: origem.x + u.x * comprimento, y: origem.y + u.y * comprimento } };
      }
      const ret = retanguloDoEixo(origem, u, comprimento, m(LARGURA_LINHA_M));
      return { forma: "poligono", contorno: ret, pecas: [ret] };
    }
    case "faixa": {
      const origem = axialParaMundo(params.origem, tamanhoCelula);
      const comprimento = m(params.comprimentoM);
      const largura = m(params.larguraM);
      if (comprimento <= 0 || largura <= 0) return null;
      const ret = retanguloDoEixo(origem, versor(params.direcaoGraus), comprimento, largura);
      return { forma: "poligono", contorno: ret, pecas: [ret] };
    }
    case "cubo": {
      // CONVENÇÃO DE ORIGEM (o livro não define): origem num CANTO da
      // base. O arraste define o PRIMEIRO LADO (direção + comprimento)
      // e o quadrado cresce para o lado direito desse vetor, na
      // convenção de tela. Fica explícito na interface e é editável
      // pela direção e pelo lado — nunca uma escolha escondida.
      const origem = axialParaMundo(params.origem, tamanhoCelula);
      const lado = m(params.ladoM);
      if (lado <= 0) return null;
      const u = versor(params.direcaoGraus);
      const n = perpendicular(u);
      const quadrado: Poligono = [
        origem,
        { x: origem.x + u.x * lado, y: origem.y + u.y * lado },
        { x: origem.x + (u.x + n.x) * lado, y: origem.y + (u.y + n.y) * lado },
        { x: origem.x + n.x * lado, y: origem.y + n.y * lado },
      ];
      return { forma: "poligono", contorno: quadrado, pecas: [quadrado] };
    }
    case "parede": {
      if (params.pontos.length < 2) return null;
      const pontos = params.pontos.map((p) => axialParaMundo(p, tamanhoCelula));
      const largura = m(LARGURA_PAREDE_M);
      const pecas = pecasDoTracado(pontos, largura);
      if (pecas.length === 0) return null;
      return { forma: "corredor", pontos, largura, pecas };
    }
    case "personalizada": {
      if (params.pontos.length < 3) return null;
      const contorno = params.pontos.map((p) => axialParaMundo(p, tamanhoCelula));
      if (!poligonoSimples(contorno) || temPontosDuplicadosConsecutivos(contorno) || areaPoligono(contorno) <= 1e-9) return null;
      const pecas = triangular(contorno);
      if (pecas.length === 0) return null;
      return { forma: "poligono", contorno, pecas };
    }
  }
}

/**
 * Ponto de ancoragem de UI contextual (botões de confirmar/descartar,
 * e o atalho de edição rápida) — um ponto LÓGICO da forma, fora do
 * preenchimento quando há espaço, coerente por tipo: borda do disco
 * (Esfera/Domo/Aura), aresta na direção do setor (Cone), último ponto
 * do corredor (Parede/Faixa), último vértice do polígono (Cubo/
 * Personalizada), destino do segmento (Linha em traço fino).
 *
 * Extraída pra ser a MESMA função usada pela âncora da prévia em
 * criação/edição e pela âncora de cada área JÁ PERSISTIDA — nunca duas
 * contas que podem divergir.
 */
export function ancoraDaRegiao(regiao: RegiaoArea): { x: number; y: number } {
  switch (regiao.forma) {
    case "disco":
      return { x: regiao.centro.x, y: regiao.centro.y + regiao.raio };
    case "setor": {
      const a = regiao.direcaoRad + regiao.meiaAberturaRad;
      return { x: regiao.centro.x + Math.cos(a) * regiao.raio, y: regiao.centro.y + Math.sin(a) * regiao.raio };
    }
    case "poligono": {
      const ultimo = regiao.contorno[regiao.contorno.length - 1];
      return { x: ultimo.x, y: ultimo.y };
    }
    case "corredor": {
      const ultimo = regiao.pontos[regiao.pontos.length - 1];
      return { x: ultimo.x, y: ultimo.y };
    }
    case "segmento":
      return { x: regiao.b.x, y: regiao.b.y };
  }
}

/** Caixa envolvente da região, em unidades do mundo — pré-filtro barato antes do cálculo exato. */
export function caixaDaRegiao(regiao: RegiaoArea): Caixa {
  switch (regiao.forma) {
    case "disco":
    case "setor":
      return {
        minX: regiao.centro.x - regiao.raio, maxX: regiao.centro.x + regiao.raio,
        minY: regiao.centro.y - regiao.raio, maxY: regiao.centro.y + regiao.raio,
      };
    case "poligono":
      return caixaDe([...regiao.contorno, ...regiao.pecas.flat()]);
    case "corredor": {
      const c = caixaDe(regiao.pontos);
      const meia = regiao.largura / 2;
      return { minX: c.minX - meia, maxX: c.maxX + meia, minY: c.minY - meia, maxY: c.maxY + meia };
    }
    case "segmento":
      return caixaDe([regiao.a, regiao.b]);
  }
}

function pontoNoPoligono(p: Ponto, contorno: readonly Ponto[]): boolean {
  let dentro = false;
  for (let i = 0, j = contorno.length - 1; i < contorno.length; j = i++) {
    const a = contorno[i], b = contorno[j];
    const cruza = (a.y > p.y) !== (b.y > p.y)
      && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

function distanciaAoSegmento(p: Ponto, a: Ponto, b: Ponto): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const comprimento2 = dx * dx + dy * dy;
  if (comprimento2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / comprimento2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distanciaAoPercurso(p: Ponto, pontos: readonly Ponto[]): number {
  let menor = Infinity;
  for (let i = 0; i < pontos.length - 1; i++) menor = Math.min(menor, distanciaAoSegmento(p, pontos[i], pontos[i + 1]));
  return menor;
}

/**
 * `p` (unidades do mundo) está dentro da região — teste de HOVER/HIT
 * (botão de edição rápida no mapa), nunca a regra dos 50%: aqui é
 * "o ponteiro está sobre a forma", binário, sem fração de célula. Usa
 * a geometria REAL de cada tipo (arco do disco/setor, polígono do
 * cubo/personalizada, faixa do corredor com sua largura), nunca a
 * caixa envolvente — um clique no canto vazio da caixa de uma esfera
 * não conta como "sobre a área".
 *
 * Linha em traço fino (`segmento`) não tem preenchimento nenhum —
 * `toleranciaMundo` dá uma faixa fina em volta do próprio traço pra
 * ainda ser possível passar o mouse sobre ela.
 */
export function pontoDentroDaRegiao(p: Ponto, regiao: RegiaoArea, toleranciaMundo = 0): boolean {
  switch (regiao.forma) {
    case "disco":
      return Math.hypot(p.x - regiao.centro.x, p.y - regiao.centro.y) <= regiao.raio + toleranciaMundo;
    case "setor": {
      const dx = p.x - regiao.centro.x, dy = p.y - regiao.centro.y;
      const dist = Math.hypot(dx, dy);
      if (dist > regiao.raio + toleranciaMundo) return false;
      if (dist < 1e-9) return true;
      const angRelativo = Math.atan2(dy, dx) - regiao.direcaoRad;
      const normalizado = Math.atan2(Math.sin(angRelativo), Math.cos(angRelativo));
      return Math.abs(normalizado) <= regiao.meiaAberturaRad;
    }
    case "poligono":
      return pontoNoPoligono(p, regiao.contorno);
    case "corredor":
      return distanciaAoPercurso(p, regiao.pontos) <= regiao.largura / 2 + toleranciaMundo;
    case "segmento":
      return distanciaAoSegmento(p, regiao.a, regiao.b) <= toleranciaMundo;
  }
}

/** Semiplanos da cunha do cone (abertura < 180°, portanto convexa). */
function semiPlanosDoSetor(regiao: Extract<RegiaoArea, { forma: "setor" }>) {
  const a1 = regiao.direcaoRad - regiao.meiaAberturaRad;
  const a2 = regiao.direcaoRad + regiao.meiaAberturaRad;
  const u1 = { x: Math.cos(a1), y: Math.sin(a1) };
  const u2 = { x: Math.cos(a2), y: Math.sin(a2) };
  const c = regiao.centro;
  // Dentro da cunha: à esquerda do raio inicial E à direita do final.
  return [
    { nx: u1.y, ny: -u1.x, c: u1.y * c.x - u1.x * c.y },
    { nx: -u2.y, ny: u2.x, c: -u2.y * c.x + u2.x * c.y },
  ];
}

/**
 * Fração (0–1) da área de UM polígono de célula coberta pela região.
 * É a conta única da regra dos 50% — tudo mais neste módulo consome
 * este número.
 */
export function fracaoDeCobertura(regiao: RegiaoArea, celula: Poligono, areaTotal: number): number {
  if (areaTotal <= 0) return 0;
  switch (regiao.forma) {
    case "disco":
      return areaDiscoPoligono(regiao.centro, regiao.raio, celula) / areaTotal;
    case "setor": {
      // Setor = disco ∩ cunha. A cunha é convexa (45° < 180°), então
      // recortar a célula por ela primeiro mantém tudo exato.
      const recortada = clipPorSemiPlanos(celula, semiPlanosDoSetor(regiao));
      if (recortada.length < 3) return 0;
      return areaDiscoPoligono(regiao.centro, regiao.raio, recortada) / areaTotal;
    }
    case "poligono":
    case "corredor":
      return areaUniaoConvexosEm(celula, regiao.pecas) / areaTotal;
    case "segmento":
      return 0; // traço sem área: quem decide é a exceção da Linha
  }
}

/** A regra: 50% exatamente CONTA (comparação com a tolerância documentada). */
export function celulaAfetadaPelaFracao(fracao: number): boolean {
  return fracao >= 0.5 - TOLERANCIA_FRACAO;
}

export interface ContextoMapaArea {
  tamanhoCelula: number;
  largura: number;
  altura: number;
}

/** Células candidatas: as da grade cuja caixa envolvente encosta na caixa da região. */
function celulasCandidatas(regiao: RegiaoArea, ctx: ContextoMapaArea): Hex[] {
  const caixa = caixaDaRegiao(regiao);
  const cantos = [
    { x: caixa.minX, y: caixa.minY }, { x: caixa.maxX, y: caixa.minY },
    { x: caixa.minX, y: caixa.maxY }, { x: caixa.maxX, y: caixa.maxY },
  ].map((p) => mundoParaAxial(p.x, p.y, ctx.tamanhoCelula));

  // Defensivo: uma região com coordenada não-finita (dado corrompido,
  // origem de aura órfã que escapou de `regiaoDaArea`, bug futuro)
  // não pode virar um laço sem limite — sem candidatos, sem célula
  // afetada, nunca um travamento.
  if (cantos.some((p) => !Number.isFinite(p.q) || !Number.isFinite(p.r))) return [];

  const qMinRegiao = Math.floor(Math.min(...cantos.map((p) => p.q))) - 1;
  const qMaxRegiao = Math.ceil(Math.max(...cantos.map((p) => p.q))) + 1;
  const rMinRegiao = Math.floor(Math.min(...cantos.map((p) => p.r))) - 1;
  const rMaxRegiao = Math.ceil(Math.max(...cantos.map((p) => p.r))) + 1;

  // Recorta a caixa da REGIÃO contra a caixa do MAPA antes de iterar —
  // não confia só no filtro `dentroDoMapa` dentro do laço. Sem isto,
  // uma coordenada de origem ou um vértice de Parede/Personalizada
  // com magnitude grande (bug de cliente, dado histórico, ou qualquer
  // valor que escape ao limite do servidor) faz o laço abaixo tentar
  // milhões de iterações rejeitadas uma a uma — o mapa tem no máximo
  // 200×200 células (`vtt_scenes.largura/altura`, migration 0065), e é
  // ESSE tamanho, não o da região, que deve limitar o trabalho. `q`
  // varia com `r` numa grade axial (`dentroDoMapa`: `qMin(r) =
  // -floor(r/2)`), então o limite de `q` usado aqui é o pior caso
  // entre todas as linhas válidas — ainda assim ordens de grandeza
  // menor que uma região sem limite.
  const rMin = Math.max(rMinRegiao, 0);
  const rMax = Math.min(rMaxRegiao, ctx.altura - 1);
  if (rMin > rMax) return [];
  const qMinMapa = -Math.floor((ctx.altura - 1) / 2) - 1;
  const qMaxMapa = ctx.largura;
  const qMin = Math.max(qMinRegiao, qMinMapa);
  const qMax = Math.min(qMaxRegiao, qMaxMapa);
  if (qMin > qMax) return [];

  const out: Hex[] = [];
  for (let r = rMin; r <= rMax; r++) {
    for (let q = qMin; q <= qMax; q++) {
      const h = { q, r };
      if (!dentroDoMapa(h, ctx.largura, ctx.altura)) continue;
      out.push(h);
    }
  }
  return out;
}

export interface TokenParaArea {
  id: string;
  /** Células ABSOLUTAS ocupadas — a pegada já projetada por quem chama (`projetarPegada(pos, pegadaEfetiva(...))`). */
  celulas: readonly Hex[];
}

export interface TokenAfetado {
  id: string;
  /** Fração da PEGADA COMPLETA dentro da região (0–1). `null` quando a regra aplicada foi a exceção da Linha. */
  fracao: number | null;
  afetado: boolean;
  /** `true` quando o veredito veio da exceção da Linha (traço fino), não da regra dos 50%. */
  porExcecaoDaLinha: boolean;
}

export interface ResultadoArea {
  /** Células que cumprem a regra dos 50% (ou, em traço fino, as atravessadas). */
  celulas: Hex[];
  /** Fração exata por célula candidata — a interface pode explicar POR QUE uma célula entrou ou ficou de fora. */
  fracaoPorCelula: Map<string, number>;
  tokens: TokenAfetado[];
}

/**
 * Resolve, de uma vez, células afetadas e tokens afetados de uma
 * região. Ponto ÚNICO de consumo por quadro (memoizável por
 * geometria + revisão) — nunca duas varreduras separadas que possam
 * divergir.
 */
export function resolverArea(entrada: {
  regiao: RegiaoArea;
  ctx: ContextoMapaArea;
  tokens: readonly TokenParaArea[];
}): ResultadoArea {
  const { regiao, ctx } = entrada;
  const areaCelula = areaDaCelula(ctx.tamanhoCelula);
  const fracaoPorCelula = new Map<string, number>();
  const celulas: Hex[] = [];

  const caixaRegiao = caixaDaRegiao(regiao);

  if (regiao.forma === "segmento") {
    // ── Exceção da Linha ──────────────────────────────────────────
    for (const c of celulasCandidatas(regiao, ctx)) {
      const poli = poligonoDaCelula(c, ctx.tamanhoCelula);
      if (caixasSeparadas(caixaDe(poli), caixaRegiao)) continue;
      if (segmentoCruzaInteriorDoConvexo(regiao.a, regiao.b, poli, ctx.tamanhoCelula)) {
        celulas.push(c);
        fracaoPorCelula.set(hexKey(c), 1);
      }
    }
    const atravessadas = new Set(celulas.map(hexKey));
    const tokens = entrada.tokens.map<TokenAfetado>((t) => ({
      id: t.id,
      fracao: null,
      afetado: t.celulas.some((c) => atravessadas.has(hexKey(c))),
      porExcecaoDaLinha: true,
    }));
    return { celulas, fracaoPorCelula, tokens };
  }

  for (const c of celulasCandidatas(regiao, ctx)) {
    const poli = poligonoDaCelula(c, ctx.tamanhoCelula);
    if (caixasSeparadas(caixaDe(poli), caixaRegiao)) continue;
    const fracao = fracaoDeCobertura(regiao, poli, areaCelula);
    // Abaixo da tolerância é RUÍDO de ponto flutuante, não cobertura:
    // registrar isso encheria o mapa de entradas de 1e-16 que mudam
    // conforme a escala de desenho — e o resultado precisa ser idêntico
    // em qualquer escala (logo, em qualquer zoom).
    if (fracao <= TOLERANCIA_FRACAO) continue;
    fracaoPorCelula.set(hexKey(c), fracao);
    if (celulaAfetadaPelaFracao(fracao)) celulas.push(c);
  }

  const tokens = entrada.tokens.map<TokenAfetado>((t) => {
    if (t.celulas.length === 0) return { id: t.id, fracao: 0, afetado: false, porExcecaoDaLinha: false };
    // Fração da pegada = MÉDIA das frações das suas células (hexágonos
    // disjuntos de área igual) — identidade exata, não aproximação. As
    // frações já calculadas acima são reaproveitadas; só as células que
    // nem entraram na varredura precisam do valor 0.
    let soma = 0;
    for (const c of t.celulas) {
      const k = hexKey(c);
      const conhecida = fracaoPorCelula.get(k);
      if (conhecida !== undefined) { soma += conhecida; continue; }
      const poli = poligonoDaCelula(c, ctx.tamanhoCelula);
      if (caixasSeparadas(caixaDe(poli), caixaRegiao)) continue;
      const f = fracaoDeCobertura(regiao, poli, areaCelula);
      if (f > TOLERANCIA_FRACAO) fracaoPorCelula.set(k, f);
      soma += f;
    }
    const fracao = soma / t.celulas.length;
    return { id: t.id, fracao, afetado: fracao >= 0.5 - TOLERANCIA_FRACAO, porExcecaoDaLinha: false };
  });

  return { celulas, fracaoPorCelula, tokens };
}

// ─────────────────────────────────────────────────────────────────
// Validação e normalização
// ─────────────────────────────────────────────────────────────────

export interface Veredito {
  ok: boolean;
  motivo?: string;
}

function limitar(valor: number, minimo: number, maximo: number): number {
  if (!Number.isFinite(valor)) return minimo;
  return Math.min(maximo, Math.max(minimo, valor));
}

/** Clampa um ponto axial pra dentro de `±MAGNITUDE_MAXIMA_COORDENADA` em cada eixo, independentemente. NaN/Infinity viram 0 (origem), nunca propagam. */
function limitarPonto(p: PontoAxial): PontoAxial {
  return {
    q: limitar(p.q, -MAGNITUDE_MAXIMA_COORDENADA, MAGNITUDE_MAXIMA_COORDENADA),
    r: limitar(p.r, -MAGNITUDE_MAXIMA_COORDENADA, MAGNITUDE_MAXIMA_COORDENADA),
  };
}

function normalizarGraus(g: number): number {
  if (!Number.isFinite(g)) return 0;
  return ((g % 360) + 360) % 360;
}

/** Clampa dimensões, normaliza direção e força as regras fixas (45° do Cone, 1 m da Parede, altura = lado do Cubo). */
export function normalizarParametros(p: ParametrosArea): ParametrosArea {
  switch (p.tipo) {
    case "esfera":
    case "domo":
      return {
        ...p,
        origem: limitarPonto(p.origem),
        raioM: limitar(p.raioM, 0, MAXIMO_RAIO_M),
        alturaM: p.alturaM === null ? null : limitar(p.alturaM, 0, MAXIMO_ALTURA_M),
        nivelOrigemM: p.nivelOrigemM === null ? null : limitar(p.nivelOrigemM, -MAXIMO_ALTURA_M, MAXIMO_ALTURA_M),
      };
    case "aura":
      // `origem` NÃO é entrada do usuário aqui — é derivada do token
      // (`origemDeAura`) a cada resolução; clampá-la esconderia um bug
      // de outro lugar em vez de deixá-lo aparecer.
      return { ...p, raioM: limitar(p.raioM, 0, MAXIMO_RAIO_M) };
    case "linha":
      return { ...p, origem: limitarPonto(p.origem), direcaoGraus: normalizarGraus(p.direcaoGraus), comprimentoM: limitar(p.comprimentoM, 0, MAXIMO_COMPRIMENTO_M) };
    case "faixa":
      return {
        ...p,
        origem: limitarPonto(p.origem),
        direcaoGraus: normalizarGraus(p.direcaoGraus),
        comprimentoM: limitar(p.comprimentoM, 0, MAXIMO_COMPRIMENTO_M),
        larguraM: limitar(p.larguraM, 0, MAXIMO_LARGURA_M),
      };
    case "parede":
      return { ...p, pontos: p.pontos.slice(0, MAXIMO_PONTOS).map(limitarPonto), alturaM: limitar(p.alturaM, 0, MAXIMO_ALTURA_M) };
    case "cubo":
      return { ...p, origem: limitarPonto(p.origem), direcaoGraus: normalizarGraus(p.direcaoGraus), ladoM: limitar(p.ladoM, 0, MAXIMO_LARGURA_M) };
    case "cone":
      return { ...p, origem: limitarPonto(p.origem), direcaoGraus: normalizarGraus(p.direcaoGraus), alcanceM: limitar(p.alcanceM, 0, MAXIMO_COMPRIMENTO_M) };
    case "personalizada":
      return { ...p, pontos: p.pontos.slice(0, MAXIMO_PONTOS).map(limitarPonto) };
  }
}

/**
 * Valida o polígono de uma Área personalizada em coordenadas axiais —
 * a mesma checagem que a interface usa pra habilitar "Concluir" e que
 * o servidor repete antes de gravar. Recusa explicitamente: menos de
 * três pontos, pontos duplicados consecutivos, área zero e
 * autointerseção.
 */
export function validarPoligonoPersonalizado(pontos: readonly PontoAxial[]): Veredito {
  if (pontos.length < 3) return { ok: false, motivo: "A área precisa de pelo menos três pontos." };
  if (pontos.length > MAXIMO_PONTOS) return { ok: false, motivo: `Máximo de ${MAXIMO_PONTOS} pontos.` };
  const plano: Poligono = pontos.map((p) => ({ x: p.q, y: p.r }));
  if (temPontosDuplicadosConsecutivos(plano, 1e-6)) return { ok: false, motivo: "Há pontos repetidos em sequência." };
  // Ordem importa: uma gravata-borboleta simétrica tem área ASSINADA
  // zero (os dois lóbulos se cancelam), então checar autointerseção
  // primeiro é o que faz a mensagem dizer a verdade sobre o defeito.
  if (!poligonoSimples(plano)) return { ok: false, motivo: "As arestas se cruzam — a forma precisa ser um polígono simples." };
  if (areaPoligono(plano) <= 1e-9) return { ok: false, motivo: "A área ficaria com superfície zero." };
  return { ok: true };
}

/** Valida a linha quebrada de uma Parede: pelo menos dois pontos distintos, sem repetição consecutiva. */
export function validarPercursoParede(pontos: readonly PontoAxial[]): Veredito {
  if (pontos.length < 2) return { ok: false, motivo: "A parede precisa de pelo menos dois pontos." };
  if (pontos.length > MAXIMO_PONTOS) return { ok: false, motivo: `Máximo de ${MAXIMO_PONTOS} pontos.` };
  for (let i = 0; i < pontos.length - 1; i++) {
    if (Math.hypot(pontos[i].q - pontos[i + 1].q, pontos[i].r - pontos[i + 1].r) < 1e-6) {
      return { ok: false, motivo: "Há pontos repetidos em sequência." };
    }
  }
  return { ok: true };
}

/**
 * A área tem geometria utilizável? Recusa formas degeneradas (clique
 * sem arraste, dimensão abaixo do mínimo, polígono inválido) — é o
 * portão que impede "concluir" uma área que não existe.
 */
export function validarParametros(p: ParametrosArea): Veredito {
  const curto = (rotulo: string) => ({ ok: false, motivo: `${rotulo} precisa de pelo menos ${MINIMO_DIMENSAO_M} m.` });
  switch (p.tipo) {
    case "esfera":
    case "domo":
    case "aura":
      return p.raioM >= MINIMO_DIMENSAO_M ? { ok: true } : curto("O raio");
    case "linha":
      return p.comprimentoM >= MINIMO_DIMENSAO_M ? { ok: true } : curto("O comprimento");
    case "faixa":
      if (p.comprimentoM < MINIMO_DIMENSAO_M) return curto("O comprimento");
      return p.larguraM >= MINIMO_DIMENSAO_M ? { ok: true } : curto("A largura");
    case "cubo":
      return p.ladoM >= MINIMO_DIMENSAO_M ? { ok: true } : curto("O lado");
    case "cone":
      return p.alcanceM >= MINIMO_DIMENSAO_M ? { ok: true } : curto("O alcance");
    case "parede":
      return validarPercursoParede(p.pontos);
    case "personalizada":
      return validarPoligonoPersonalizado(p.pontos);
  }
}

/**
 * Centro de uma AURA: a ORIGEM LÓGICA do token, que é exatamente a que
 * o resto do VTT já usa pra alcance e efeitos — âncora persistida
 * (`vtt_tokens.q/r`) somada à `origemMecanica` da pegada efetiva
 * (`_dominio/pegada.ts`). Nunca um centro inventado só pra aura: para
 * um token de uma célula isso cai no centro da célula ocupada; para
 * pegadas multicelulares ou irregulares, cai no mesmo ponto
 * (possivelmente entre células) que o marcador do token já ocupa no
 * mapa. Como é DERIVADO, a aura acompanha movimento, rotação, troca de
 * tamanho e troca de pegada sem nunca ser duplicada nem regravada.
 */
export function origemDeAura(ancora: { q: number; r: number }, origemMecanicaRelativa: PontoAxial): PontoAxial {
  return { q: ancora.q + origemMecanicaRelativa.q, r: ancora.r + origemMecanicaRelativa.r };
}

/** Comprimento total de um percurso de parede, em metros. */
export function comprimentoDoPercurso(pontos: readonly PontoAxial[], tamanhoCelula: number): number {
  let total = 0;
  for (let i = 0; i < pontos.length - 1; i++) {
    const a = axialParaMundo(pontos[i], tamanhoCelula);
    const b = axialParaMundo(pontos[i + 1], tamanhoCelula);
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total / (tamanhoCelula * Math.sqrt(3));
}

// ─────────────────────────────────────────────────────────────────
// Desenho — o `d` de cada forma, derivado da MESMA região
// ─────────────────────────────────────────────────────────────────

function n(v: number): string {
  return Number.isFinite(v) ? v.toFixed(3) : "0";
}

function caminhoDePoligono(poli: Poligono): string {
  if (poli.length < 2) return "";
  return poli.map((p, i) => `${i === 0 ? "M" : "L"}${n(p.x)},${n(p.y)}`).join(" ") + " Z";
}

/**
 * Caminho SVG do CONTORNO da região — círculo e setor com arco de
 * verdade (`A`), nunca poligonizados; parede como linha central (quem
 * desenha aplica `stroke-width` = largura e `stroke-linejoin="bevel"`,
 * o que reproduz exatamente a mesma região que o cálculo usa).
 */
export function caminhoDaRegiao(regiao: RegiaoArea): string {
  switch (regiao.forma) {
    case "disco": {
      const { centro: c, raio: r } = regiao;
      return `M${n(c.x - r)},${n(c.y)} A${n(r)},${n(r)} 0 1 0 ${n(c.x + r)},${n(c.y)} A${n(r)},${n(r)} 0 1 0 ${n(c.x - r)},${n(c.y)} Z`;
    }
    case "setor": {
      const { centro: c, raio: r } = regiao;
      const a1 = regiao.direcaoRad - regiao.meiaAberturaRad;
      const a2 = regiao.direcaoRad + regiao.meiaAberturaRad;
      const p1 = { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) };
      const p2 = { x: c.x + r * Math.cos(a2), y: c.y + r * Math.sin(a2) };
      const arcoGrande = 2 * regiao.meiaAberturaRad > Math.PI ? 1 : 0;
      return `M${n(c.x)},${n(c.y)} L${n(p1.x)},${n(p1.y)} A${n(r)},${n(r)} 0 ${arcoGrande} 1 ${n(p2.x)},${n(p2.y)} Z`;
    }
    case "poligono":
      return caminhoDePoligono(regiao.contorno);
    case "corredor":
      return regiao.pontos.map((p, i) => `${i === 0 ? "M" : "L"}${n(p.x)},${n(p.y)}`).join(" ");
    case "segmento":
      return `M${n(regiao.a.x)},${n(regiao.a.y)} L${n(regiao.b.x)},${n(regiao.b.y)}`;
  }
}
