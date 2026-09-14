/**
 * Geometria hexagonal da mesa de Ruptura.
 *
 * Regra de origem (`docs/fontes/16 COMBATE`, "ESPAÇOS E MEDIDAS"): o
 * combate acontece sobre um mapa de células hexagonais, **1 célula =
 * 1 metro**. Toda medida do sistema (alcance, área, deslocamento) é
 * dada em metros e convertida 1:1 em células — então distância aqui
 * NUNCA é pixel nem euclidiana: é contagem de células.
 *
 * Orientação: hexágono de ponta pra cima (*pointy-top*), em
 * coordenadas AXIAIS `{q, r}`. Pointy-top porque o texto descreve
 * "criatura média ocupa 1 célula e pode atingir as 6 células
 * adjacentes" com vizinhança simétrica, e porque as fileiras
 * horizontais resultantes leem melhor num mapa urbano (ruas, corredores
 * e paredes retas de Vosek caem em linhas horizontais limpas).
 *
 * Por que axial e não offset: as contas de distância, anel e linha são
 * triviais em cubo (`x + y + z = 0`), e axial converte pra cubo sem
 * caso especial de paridade de fileira — que é exatamente onde
 * implementações de hex costumam errar.
 */

/** Coordenada axial de uma célula. 1 célula = 1 metro no sistema. */
export interface Hex {
  q: number;
  r: number;
}

/** Cubo derivado — usado só nas contas; `x + y + z === 0` sempre. */
interface Cubo {
  x: number;
  y: number;
  z: number;
}

export function hexKey(h: Hex): string {
  return `${h.q},${h.r}`;
}

export function hexIguais(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r;
}

function paraCubo(h: Hex): Cubo {
  const x = h.q;
  const z = h.r;
  return { x, y: -x - z, z };
}

function paraAxial(c: Cubo): Hex {
  return { q: c.x, r: c.z };
}

/**
 * Distância em CÉLULAS (= metros). É a métrica que o sistema usa pra
 * alcance ("meça a partir do centro da célula de origem até a célula
 * alvo") e pra deslocamento.
 */
export function hexDistancia(a: Hex, b: Hex): number {
  const ca = paraCubo(a);
  const cb = paraCubo(b);
  return Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y), Math.abs(ca.z - cb.z));
}

/** As 6 direções axiais, em ordem horária começando pelo leste. */
const DIRECOES: Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** As 6 células que tocam esta — o alcance "Adjacente" do sistema. */
export function hexVizinhos(h: Hex): Hex[] {
  return DIRECOES.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

/**
 * Rotaciona um offset axial em `passos` incrementos de 60° — sempre
 * HORÁRIO (mesmo sentido de `DIRECOES`), sempre em torno da ORIGEM
 * `{0,0}` (é assim que se rotaciona um offset relativo a uma âncora,
 * não uma célula absoluta). Base: em coordenadas de cubo, um passo de
 * 60° horário é `(x,y,z) → (-y,-z,-x)` — confirmado batendo contra a
 * própria ordem de `DIRECOES` (aplicar uma vez em `DIRECOES[0]` cubo
 * produz exatamente `DIRECOES[1]` cubo, e assim por diante).
 *
 * Usado pra derivar pegadas rotacionadas (`_dominio/pegada.ts`) — não
 * pra rotacionar geometria de desenho, que continua em `hexParaPixel`.
 */
export function hexRotacionar(offset: Hex, passos: number): Hex {
  const n = ((passos % 6) + 6) % 6;
  let c = paraCubo(offset);
  for (let i = 0; i < n; i++) {
    c = { x: -c.y, y: -c.z, z: -c.x };
  }
  return paraAxial(c);
}

/**
 * Todas as células a até `raio` metros do centro (inclusive o centro).
 * Base de ESFERA (◎), DOMO (◯) e AURA (⊙) — as três só diferem no
 * volume narrado (esfera projeta em todas as direções, domo é meia
 * esfera, aura é centrada no personagem); a PROJEÇÃO NO MAPA das três
 * é o mesmo disco de células, então quem distingue é o rótulo/cor da
 * pré-visualização, não a geometria.
 */
export function hexNoRaio(centro: Hex, raio: number): Hex[] {
  const out: Hex[] = [];
  for (let dx = -raio; dx <= raio; dx++) {
    const loInterno = Math.max(-raio, -dx - raio);
    const hiInterno = Math.min(raio, -dx + raio);
    for (let dy = loInterno; dy <= hiInterno; dy++) {
      const dz = -dx - dy;
      out.push(paraAxial({ x: paraCubo(centro).x + dx, y: paraCubo(centro).y + dy, z: paraCubo(centro).z + dz }));
    }
  }
  return out;
}

function lerpCubo(a: Cubo, b: Cubo, t: number): Cubo {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function arredondarCubo(c: Cubo): Cubo {
  let rx = Math.round(c.x);
  let ry = Math.round(c.y);
  let rz = Math.round(c.z);
  const dx = Math.abs(rx - c.x);
  const dy = Math.abs(ry - c.y);
  const dz = Math.abs(rz - c.z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { x: rx, y: ry, z: rz };
}

/**
 * Células atravessadas por uma reta entre duas células — a área LINHA
 * (—) e também a base de checagem de linha de visão/trajeto.
 */
export function hexLinha(a: Hex, b: Hex): Hex[] {
  const n = hexDistancia(a, b);
  if (n === 0) return [a];
  const ca = paraCubo(a);
  const cb = paraCubo(b);
  const out: Hex[] = [];
  for (let i = 0; i <= n; i++) {
    out.push(paraAxial(arredondarCubo(lerpCubo(ca, cb, i / n))));
  }
  return out;
}

/**
 * CONE (◢) — abertura de 45° a partir da origem, na direção do alvo,
 * até `alcance` metros.
 *
 * Nota honesta de aproximação: 45° é um ângulo EUCLIDIANO e a grade é
 * hexagonal, então não existe cone hexagonal exato de 45°. Aqui o
 * cone é resolvido medindo o ângulo real entre o centro da origem e o
 * centro de cada célula candidata (em pixel), aceitando quem cair
 * dentro de ±22,5°. Isso reproduz o desenho do livro (setor triangular
 * que alarga a cada célula) e mantém a regra de alcance em células.
 */
export function hexCone(origem: Hex, direcaoPara: Hex, alcance: number, tamanhoCelula: number): Hex[] {
  const po = hexParaPixel(origem, tamanhoCelula);
  const pd = hexParaPixel(direcaoPara, tamanhoCelula);
  const anguloBase = Math.atan2(pd.y - po.y, pd.x - po.x);
  const meiaAbertura = (45 * Math.PI) / 180 / 2;

  return hexNoRaio(origem, alcance).filter((h) => {
    if (hexIguais(h, origem)) return false;
    const p = hexParaPixel(h, tamanhoCelula);
    const ang = Math.atan2(p.y - po.y, p.x - po.x);
    let delta = Math.abs(ang - anguloBase);
    if (delta > Math.PI) delta = 2 * Math.PI - delta;
    return delta <= meiaAbertura;
  });
}

/**
 * FAIXA (═) — corredor reto de `comprimento` × `largura` metros a
 * partir da origem, na direção do alvo. Implementada como a linha
 * central mais as células perpendiculares até a largura pedida.
 */
export function hexFaixa(origem: Hex, direcaoPara: Hex, comprimento: number, largura: number, tamanhoCelula: number): Hex[] {
  const po = hexParaPixel(origem, tamanhoCelula);
  const pd = hexParaPixel(direcaoPara, tamanhoCelula);
  const ang = Math.atan2(pd.y - po.y, pd.x - po.x);
  const meiaLargura = (largura * tamanhoCelula * Math.sqrt(3)) / 2 / 2;

  return hexNoRaio(origem, comprimento).filter((h) => {
    const p = hexParaPixel(h, tamanhoCelula);
    const dx = p.x - po.x;
    const dy = p.y - po.y;
    // Projeta no eixo do corredor (adiante) e no perpendicular (desvio).
    const adiante = dx * Math.cos(ang) + dy * Math.sin(ang);
    const desvio = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
    return adiante >= 0 && adiante <= comprimento * tamanhoCelula * Math.sqrt(3) && desvio <= meiaLargura;
  });
}

/**
 * Centro da célula em pixels do mundo (antes de zoom/pan).
 * `tamanho` é o RAIO do hexágono (centro → vértice).
 * Fórmula pointy-top padrão.
 */
export function hexParaPixel(h: Hex, tamanho: number): { x: number; y: number } {
  const x = tamanho * Math.sqrt(3) * (h.q + h.r / 2);
  const y = tamanho * (3 / 2) * h.r;
  return { x, y };
}

/** Inverso de `hexParaPixel` — usado pra saber em que célula o cursor está. */
export function pixelParaHex(x: number, y: number, tamanho: number): Hex {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / tamanho;
  const r = ((2 / 3) * y) / tamanho;
  return paraAxial(arredondarCubo({ x: q, y: -q - r, z: r }));
}

/**
 * O mesmo inverso, SEM arredondar — a coordenada axial exata do ponto.
 *
 * `pixelParaHex` devolve a CÉLULA (arredondada), que é o que quase
 * tudo no VTT quer. Isto devolve onde o ponto está de verdade, e a
 * diferença entre os dois é o deslocamento sub-célula que faz um token
 * parar onde foi solto com a grade escondida (migration 0094).
 */
export function pixelParaHexExato(x: number, y: number, tamanho: number): { q: number; r: number } {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / tamanho;
  const r = ((2 / 3) * y) / tamanho;
  return { q, r };
}

/** Os 6 vértices do hexágono, em pixels relativos ao centro. */
export function hexVertices(tamanho: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    // -90° deixa a ponta pra cima (pointy-top).
    const ang = (Math.PI / 180) * (60 * i - 90);
    pts.push({ x: tamanho * Math.cos(ang), y: tamanho * Math.sin(ang) });
  }
  return pts;
}

/** Caminho SVG de um hexágono centrado na origem. */
export function hexPath(tamanho: number): string {
  return hexVertices(tamanho)
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(3)},${p.y.toFixed(3)}`)
    .join(" ") + " Z";
}

/**
 * Perímetro EXTERNO da união de uma pegada (uma célula ou várias) —
 * base geométrica do contorno de seleção de um token. Consome só a
 * lista de células já decidida por quem chama (`projetarPegada`/
 * `pegadaEfetiva`, em `_dominio/pegada.ts`); não reimplementa NENHUMA
 * regra de tamanho/orientação/rotação, só desenha o resultado.
 *
 * Algoritmo — cancelamento de arestas compartilhadas, o jeito padrão
 * de unir polígonos numa malha regular sem biblioteca de geometria
 * computacional:
 *   1. Lista as 6 arestas DIRECIONADAS de cada hex (mesmo sentido de
 *      `hexVertices`, consistente em todas as células).
 *   2. Cada aresta ganha uma CHAVE NÃO-DIRECIONADA (par de vértices
 *      arredondado) — uma aresta entre duas células OCUPADAS aparece
 *      duas vezes, uma vez em CADA sentido (as células ficam de lados
 *      opostos dela); uma aresta na borda externa aparece só uma vez.
 *   3. Arestas que aparecem duas vezes são internas — descartadas.
 *   4. As arestas restantes (aparecem uma vez só) já vêm consistentemente
 *      orientadas ao redor de cada componente conectado — encadeá-las
 *      pelo vértice final de cada uma fecha um ou mais laços, um por
 *      componente conectado da pegada (pegadas com "buracos" no meio
 *      nunca acontecem em uma pegada válida do sistema, então cada
 *      componente sempre fecha num laço simples).
 *
 * Retorna um `d` de SVG por componente conectado — pegadas com partes
 * DESCONECTADAS (pegada personalizada com lacuna) produzem mais de um
 * caminho, nunca um contorno artificial ligando as duas.
 */
type Ponto = { x: number; y: number };
/** Aresta externa (aparece uma vez só na malha) com o índice do hex-dono, na mesma ordem de `pegada`. */
interface ArestaExterna { a: Ponto; b: Ponto; hexIndex: number }

// 2 casas decimais bastam de sobra pro ruído de ponto flutuante do
// trig (a escala aqui é dezenas de pixels) sem arriscar confundir
// vértices geometricamente distintos.
function chaveDoPonto(p: Ponto): string {
  return `${Math.round(p.x * 100)}:${Math.round(p.y * 100)}`;
}

/**
 * Arestas EXTERNAS da união de uma pegada — cancelamento de arestas
 * compartilhadas (ver `contornoDaPegada`, que consome isto pra traçar
 * o perímetro). Extraído à parte porque `ancoraFrontalDaPegada`
 * também precisa das mesmas arestas, com o índice do hex-dono, pra
 * decidir qual delas é a "frente" — nenhuma das duas reimplementa a
 * lógica da outra.
 */
function arestasExternasDaPegada(pegada: readonly Hex[], tamanhoCelula: number): ArestaExterna[] {
  const vertices = hexVertices(tamanhoCelula);
  const contagem = new Map<string, number>();
  const direcionadas: { a: Ponto; b: Ponto; chave: string; hexIndex: number }[] = [];
  pegada.forEach((h, hexIndex) => {
    const centro = hexParaPixel(h, tamanhoCelula);
    const pts = vertices.map((v) => ({ x: centro.x + v.x, y: centro.y + v.y }));
    for (let i = 0; i < 6; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 6];
      const ca = chaveDoPonto(a);
      const cb = chaveDoPonto(b);
      const chave = ca < cb ? `${ca}|${cb}` : `${cb}|${ca}`;
      direcionadas.push({ a, b, chave, hexIndex });
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }
  });
  return direcionadas.filter((e) => contagem.get(e.chave) === 1);
}

export function contornoDaPegada(pegada: readonly Hex[], tamanhoCelula: number): string[] {
  if (pegada.length === 0) return [];
  const externas = arestasExternasDaPegada(pegada, tamanhoCelula);
  if (externas.length === 0) return [];

  const porInicio = new Map<string, { a: Ponto; b: Ponto }>();
  for (const e of externas) porInicio.set(chaveDoPonto(e.a), e);

  const visitadas = new Set<string>();
  const caminhos: string[] = [];
  for (const inicial of externas) {
    const chaveInicial = chaveDoPonto(inicial.a);
    if (visitadas.has(chaveInicial)) continue;
    const pontos: Ponto[] = [inicial.a];
    let atual: { a: Ponto; b: Ponto } = inicial;
    // Trava de segurança: uma malha bem formada nunca precisa de mais
    // passos que arestas externas existem — impede loop infinito se
    // alguma aresta ficar sem par por um bug de arredondamento.
    for (let passo = 0; passo <= externas.length; passo++) {
      visitadas.add(chaveDoPonto(atual.a));
      pontos.push(atual.b);
      if (chaveDoPonto(atual.b) === chaveInicial) break;
      const proxima = porInicio.get(chaveDoPonto(atual.b));
      if (!proxima) break;
      atual = proxima;
    }
    if (pontos.length >= 4) {
      caminhos.push(pontos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ") + " Z");
    }
  }
  return caminhos;
}

/* `ancoraFrontalDaPegada` SAIU (0135). Ela ancorava a frente do token
   numa quina real da pegada — o que fazia sentido enquanto girar
   significava girar a FORMA. Com a direção virando o olhar, as junções
   passaram a atrapalhar: não seguem a grade das 6 direções (duas
   direções caíam na mesma junção, e a alça parecia não alcançar todas)
   e, numa pegada grande, ficam longe do corpo — a alça ia parar num
   canto do contorno enquanto o halo continuava em volta do disco.
   Hoje farpa, halo e alça saem todos do ângulo canônico em torno do
   disco, em `_mapa/MapaHex.tsx`. */
export const TAMANHOS = {
  pequeno: { rotulo: "Pequeno", metros: "até 1 m", escala: 0.62 },
  medio: { rotulo: "Médio", metros: "1 a 2 m", escala: 0.92 },
  grande: { rotulo: "Grande", metros: "2 a 3 m", escala: 1.2 },
  enorme: { rotulo: "Enorme", metros: "3 a 5 m", escala: 1.3 },
  colossal: { rotulo: "Colossal", metros: "5 m ou mais", escala: 1.35 },
} as const;

export type TamanhoCriatura = keyof typeof TAMANHOS;
