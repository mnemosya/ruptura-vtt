/**
 * Geometria plana exata — funções PURAS, sem React, DOM, estado global
 * ou conhecimento de hexágono/regra de jogo. É a camada que a regra dos
 * 50% de Ruptura usa pra medir de verdade a interseção entre a forma
 * contínua de um efeito e o polígono REAL de uma célula (ou de uma
 * pegada).
 *
 * Por que exata, e não amostragem: a regra é "a área do efeito cobre
 * pelo menos metade da célula". Aproximar isso por contagem de pontos,
 * quantidade de vértices dentro, distância entre centros ou caixa
 * retangular é justamente o erro que a especificação proíbe — e
 * amostragem tem erro grande exatamente na fronteira dos 50%, que é
 * onde a regra decide.
 *
 * Sem dependência nova: as `dependencies` do projeto hoje são
 * `@supabase/supabase-js`, `dotenv`, `lucide-react`, `next`, `pg`,
 * `react`, `react-dom` e `server-only` — nenhuma biblioteca
 * geométrica. Trazer uma (clipper/martinez/turf) custaria peso de
 * bundle no cliente e uma superfície de API grande pra usar três
 * operações; as três estão aqui, em ~300 linhas auditáveis.
 *
 * AS TRÊS OPERAÇÕES:
 *
 *  1. `areaInterseccaoConvexos` — recorte de Sutherland–Hodgman. Exato
 *     quando o recortador é CONVEXO (é o nosso caso: célula hexagonal,
 *     retângulo, quadrado, triângulo, semiplano).
 *
 *  2. `areaUniaoConvexosEm` — área da UNIÃO de várias peças convexas
 *     dentro de um polígono base, sem dupla contagem. Necessário
 *     porque Parede (segmentos + junções) e Área personalizada
 *     (triangulada) são uniões de peças que SE SOBREPÕEM. Faz por
 *     decomposição de diferença convexa: `R \ P` (P convexo) é a união
 *     DISJUNTA de `R ∩ h₁ ∩ … ∩ h_{i-1} ∩ ¬h_i`, uma peça convexa por
 *     semiplano de P — resultado exato, nunca inclusão-exclusão
 *     (que erra com 3+ sobreposições).
 *
 *  3. `areaDiscoPoligono` — interseção de DISCO com polígono, analítica
 *     (setor circular + triângulo por aresta). É o que mantém Esfera,
 *     Domo, Aura e Cone como círculos/setores VERDADEIROS, sem
 *     poligonizar o arco: poligonizar introduziria um erro sistemático
 *     (sempre pra menos) exatamente nas células de borda, que são as
 *     únicas em que a regra dos 50% é disputada.
 *
 * TOLERÂNCIA — ver `TOLERANCIA_FRACAO` e `folgaDeInterior`.
 */

export interface Ponto {
  x: number;
  y: number;
}

export type Poligono = readonly Ponto[];

/**
 * Tolerância da comparação de FRAÇÃO de cobertura (adimensional, 0–1).
 *
 * Valor: `1e-9`. Motivo: as contas rodam em ponto flutuante de dupla
 * precisão (~1e-16 de erro relativo por operação) e um recorte de
 * célula encadeia da ordem de dezenas de operações, então o erro
 * acumulado realista fica em ~1e-13 da área da célula. `1e-9` é ~10⁴
 * vezes maior que esse ruído (portanto estável: uma configuração
 * construída pra dar exatamente 50% — um semiplano passando pelo
 * centro do hexágono, por exemplo — nunca oscila entre afetada e não
 * afetada conforme a posição no mapa) e, ao mesmo tempo, 10⁻⁷ da área
 * de uma célula: uma cobertura "claramente inferior" a 50% jamais é
 * promovida por ela. `>= 0,5 - TOLERANCIA_FRACAO` também cumpre a
 * regra literal de que EXATAMENTE 50% conta como afetada.
 */
export const TOLERANCIA_FRACAO = 1e-9;

/**
 * Folga usada pra decidir "o ponto está no INTERIOR" (não só na
 * borda). É RELATIVA à escala do mapa: `escala · 1e-6`. Absoluta seria
 * errada — o mesmo número teria peso diferente com hexágono de raio 26
 * ou de raio 4. Com raio 26 isso dá 2,6e-5 unidades do mundo, ~1e-6 de
 * uma célula: fino o bastante pra nunca recusar uma travessia real,
 * grosso o bastante pra recusar tangência (segmento rente à aresta ou
 * passando exatamente por um vértice).
 */
export function folgaDeInterior(escala: number): number {
  return Math.abs(escala) * 1e-6;
}

/** Área ASSINADA (fórmula do laço/shoelace). Positiva ou negativa conforme a orientação dos vértices. */
export function areaAssinada(poli: Poligono): number {
  if (poli.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < poli.length; i++) {
    const a = poli[i];
    const b = poli[(i + 1) % poli.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Área absoluta de um polígono simples. */
export function areaPoligono(poli: Poligono): number {
  return Math.abs(areaAssinada(poli));
}

/**
 * Devolve o polígono com orientação POSITIVA (área assinada > 0).
 * Todas as funções que derivam semiplanos das arestas assumem esta
 * orientação — normalizar num lugar só evita que "interior" vire
 * "exterior" por causa da ordem em que alguém digitou os vértices.
 */
export function orientacaoPositiva(poli: Poligono): Poligono {
  return areaAssinada(poli) < 0 ? [...poli].reverse() : poli;
}

/** Semiplano `n·p <= c`. `n` NÃO precisa ser unitário. */
export interface SemiPlano {
  nx: number;
  ny: number;
  c: number;
}

export function complementoDoSemiPlano(s: SemiPlano): SemiPlano {
  return { nx: -s.nx, ny: -s.ny, c: -s.c };
}

/**
 * Semiplanos de um polígono CONVEXO — um por aresta, interior à
 * esquerda (orientação positiva garantida internamente). Arestas
 * degeneradas (comprimento ~0) são descartadas: elas não restringem
 * nada e produziriam normal nula.
 */
export function semiPlanosDeConvexo(poli: Poligono): SemiPlano[] {
  const p = orientacaoPositiva(poli);
  const out: SemiPlano[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) < 1e-15 && Math.abs(dy) < 1e-15) continue;
    out.push({ nx: dy, ny: -dx, c: dy * a.x - dx * a.y });
  }
  return out;
}

/** Recorta um polígono por UM semiplano (passo de Sutherland–Hodgman). Devolve `[]` se nada sobra. */
export function clipPorSemiPlano(poli: Poligono, s: SemiPlano): Poligono {
  if (poli.length === 0) return [];
  const dist = (p: Ponto) => s.nx * p.x + s.ny * p.y - s.c;
  const out: Ponto[] = [];
  for (let i = 0; i < poli.length; i++) {
    const a = poli[i];
    const b = poli[(i + 1) % poli.length];
    const da = dist(a);
    const db = dist(b);
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out.length >= 3 ? out : [];
}

export function clipPorSemiPlanos(poli: Poligono, semiplanos: readonly SemiPlano[]): Poligono {
  let atual = poli;
  for (const s of semiplanos) {
    atual = clipPorSemiPlano(atual, s);
    if (atual.length < 3) return [];
  }
  return atual;
}

/** Interseção de um polígono qualquer com um polígono CONVEXO (o recortador). */
export function interseccaoComConvexo(sujeito: Poligono, convexo: Poligono): Poligono {
  return clipPorSemiPlanos(sujeito, semiPlanosDeConvexo(convexo));
}

export function areaInterseccaoConvexos(a: Poligono, b: Poligono): number {
  return areaPoligono(interseccaoComConvexo(a, b));
}

/**
 * Área da UNIÃO de `pecas` (todas convexas, podendo se sobrepor)
 * DENTRO de `base` (convexo). Exato, sem dupla contagem.
 *
 * Mantém uma lista de polígonos convexos DISJUNTOS que representam "o
 * que de `base` ainda não foi coberto". Cada peça nova soma a parte
 * que cobre desse restante e o restante é reparticionado. Como as
 * peças do restante são disjuntas por construção, somar é seguro.
 */
export function areaUniaoConvexosEm(base: Poligono, pecas: readonly Poligono[]): number {
  if (base.length < 3) return 0;
  let restante: Poligono[] = [base];
  let coberto = 0;
  for (const peca of pecas) {
    if (restante.length === 0) break;
    if (peca.length < 3) continue;
    const semiplanos = semiPlanosDeConvexo(peca);
    if (semiplanos.length < 3) continue;
    const proximo: Poligono[] = [];
    for (const r of restante) {
      const dentro = clipPorSemiPlanos(r, semiplanos);
      if (dentro.length >= 3) coberto += areaPoligono(dentro);
      // `r \ peca` como união DISJUNTA de convexos: para cada
      // semiplano i, a fatia que está fora de i mas dentro de todos os
      // anteriores. Nenhuma fatia se repete, e juntas cobrem tudo que
      // sobrou.
      let acumulado: Poligono = r;
      for (const s of semiplanos) {
        const fora = clipPorSemiPlano(acumulado, complementoDoSemiPlano(s));
        if (fora.length >= 3) proximo.push(fora);
        acumulado = clipPorSemiPlano(acumulado, s);
        if (acumulado.length < 3) break;
      }
    }
    restante = proximo;
  }
  return coberto;
}

// ─────────────────────────────────────────────────────────────────
// Disco × polígono — analítico
// ─────────────────────────────────────────────────────────────────

function cruz(a: Ponto, b: Ponto): number { return a.x * b.y - a.y * b.x; }
function escalar(a: Ponto, b: Ponto): number { return a.x * b.x + a.y * b.y; }

/** Área assinada do SETOR circular de raio `r` entre as direções de `a` e `b` (ângulo assinado). */
function setorAssinado(r: number, a: Ponto, b: Ponto): number {
  return 0.5 * r * r * Math.atan2(cruz(a, b), escalar(a, b));
}

/** Raízes em (0,1) de `|a + t·(b-a)| = r`, em ordem crescente. */
function cortesNoCirculo(a: Ponto, b: Ponto, r: number): number[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const A = dx * dx + dy * dy;
  if (A === 0) return [];
  const B = 2 * (a.x * dx + a.y * dy);
  const C = a.x * a.x + a.y * a.y - r * r;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return [];
  const raiz = Math.sqrt(disc);
  const t1 = (-B - raiz) / (2 * A);
  const t2 = (-B + raiz) / (2 * A);
  return [t1, t2].filter((t) => t > 0 && t < 1);
}

/**
 * Área assinada da interseção do disco (centro na ORIGEM, raio `r`)
 * com o triângulo (origem, a, b).
 *
 * ACHADO DE AUDITORIA (confirmado por diferencial contra Monte Carlo,
 * nunca só por leitura): quando um VÉRTICE do polígono cai exatamente
 * (ou a menos de `EPS_BORDA`) sobre a borda do círculo — tangência num
 * vértice, não numa aresta —, `cortesNoCirculo` não encontra raiz
 * nenhuma no intervalo ABERTO `(0,1)` (a raiz genuína está em t≈0 ou
 * t≈1, exatamente no próprio vértice, e o filtro estrito a descarta).
 * As ramificações `dentroA && !dentroB` / `!dentroA && dentroB`
 * caíam então no fallback `0.5·cruz(a,b)` — a área do TRIÂNGULO
 * INTEIRO, não o pedaço clipado —, produzindo uma "interseção" maior
 * que o próprio disco. Testado: um disco de raio 3 tangente a um
 * vértice do hexágono (que Monte Carlo confirma como ~0 de
 * interseção) devolvia 58,97 — quase o dobro da área do disco inteiro
 * (28,27).
 *
 * CORREÇÃO: sem cruzamento algum no intervalo aberto, a contribuição
 * correta é sempre o SETOR entre as duas direções — nunca o triângulo
 * inteiro —, porque a única forma de `dentroA`/`dentroB` ser
 * verdadeiro aqui (já que uma travessia de verdade sempre produziria
 * uma raiz) é o ponto estar exatamente NA borda (contribuição de
 * comprimento zero, equivalente a "fora" pro propósito desta soma).
 */
function areaDiscoTriangulo(r: number, a: Ponto, b: Ponto): number {
  const dentroA = a.x * a.x + a.y * a.y <= r * r;
  const dentroB = b.x * b.x + b.y * b.y <= r * r;
  if (dentroA && dentroB) return 0.5 * cruz(a, b);

  const ts = cortesNoCirculo(a, b, r);
  const em = (t: number): Ponto => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  if (dentroA && !dentroB) {
    if (ts.length === 0) return setorAssinado(r, a, b); // `a` só toca a borda — ver nota acima
    const p = em(ts[ts.length - 1]);
    return 0.5 * cruz(a, p) + setorAssinado(r, p, b);
  }
  if (!dentroA && dentroB) {
    if (ts.length === 0) return setorAssinado(r, a, b); // `b` só toca a borda — ver nota acima
    const p = em(ts[0]);
    return setorAssinado(r, a, p) + 0.5 * cruz(p, b);
  }
  if (ts.length === 2) {
    const p = em(ts[0]);
    const s = em(ts[1]);
    return setorAssinado(r, a, p) + 0.5 * cruz(p, s) + setorAssinado(r, s, b);
  }
  return setorAssinado(r, a, b);
}

/**
 * Área da interseção entre o DISCO (`centro`, `raio`) e um polígono
 * SIMPLES qualquer — exata, sem discretizar o arco. Soma, aresta a
 * aresta, a área assinada do disco com o triângulo (centro, vértice_i,
 * vértice_{i+1}); as partes fora do polígono se cancelam por sinal,
 * que é o mesmo princípio da fórmula do laço.
 */
export function areaDiscoPoligono(centro: Ponto, raio: number, poli: Poligono): number {
  if (poli.length < 3 || raio <= 0) return 0;
  let total = 0;
  for (let i = 0; i < poli.length; i++) {
    const a = { x: poli[i].x - centro.x, y: poli[i].y - centro.y };
    const b = { x: poli[(i + 1) % poli.length].x - centro.x, y: poli[(i + 1) % poli.length].y - centro.y };
    total += areaDiscoTriangulo(raio, a, b);
  }
  return Math.abs(total);
}

// ─────────────────────────────────────────────────────────────────
// Predicados e utilidades
// ─────────────────────────────────────────────────────────────────

export interface Caixa {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function caixaDe(pontos: readonly Ponto[]): Caixa {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pontos) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function caixasSeparadas(a: Caixa, b: Caixa, folga = 0): boolean {
  return a.maxX + folga < b.minX || b.maxX + folga < a.minX || a.maxY + folga < b.minY || b.maxY + folga < a.minY;
}

/** Ponto dentro de polígono simples (par/ímpar). Borda é indeterminada de propósito — nenhuma regra deste projeto depende dela. */
export function pontoDentroDoPoligono(p: Ponto, poli: Poligono): boolean {
  let dentro = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const a = poli[i];
    const b = poli[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

function seguimentosSeCruzamProprio(p1: Ponto, p2: Ponto, p3: Ponto, p4: Ponto): boolean {
  const d1 = cruz({ x: p4.x - p3.x, y: p4.y - p3.y }, { x: p1.x - p3.x, y: p1.y - p3.y });
  const d2 = cruz({ x: p4.x - p3.x, y: p4.y - p3.y }, { x: p2.x - p3.x, y: p2.y - p3.y });
  const d3 = cruz({ x: p2.x - p1.x, y: p2.y - p1.y }, { x: p3.x - p1.x, y: p3.y - p1.y });
  const d4 = cruz({ x: p2.x - p1.x, y: p2.y - p1.y }, { x: p4.x - p1.x, y: p4.y - p1.y });
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  // Colinear e sobreposto conta como autointerseção (aresta em cima de aresta).
  const colinearNoSegmento = (a: Ponto, b: Ponto, c: Ponto) =>
    Math.abs(cruz({ x: b.x - a.x, y: b.y - a.y }, { x: c.x - a.x, y: c.y - a.y })) < 1e-12
    && Math.min(a.x, b.x) - 1e-12 <= c.x && c.x <= Math.max(a.x, b.x) + 1e-12
    && Math.min(a.y, b.y) - 1e-12 <= c.y && c.y <= Math.max(a.y, b.y) + 1e-12;
  return colinearNoSegmento(p1, p2, p3) || colinearNoSegmento(p1, p2, p4)
    || colinearNoSegmento(p3, p4, p1) || colinearNoSegmento(p3, p4, p2);
}

/** `true` se dois pontos CONSECUTIVOS (incluindo último→primeiro) coincidem. */
export function temPontosDuplicadosConsecutivos(poli: Poligono, tolerancia = 1e-9): boolean {
  if (poli.length < 2) return false;
  for (let i = 0; i < poli.length; i++) {
    const a = poli[i];
    const b = poli[(i + 1) % poli.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) <= tolerancia) return true;
  }
  return false;
}

/** `true` se nenhum par de arestas NÃO adjacentes se cruza e nenhuma adjacente se sobrepõe. */
export function poligonoSimples(poli: Poligono): boolean {
  const n = poli.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacentes = j === i + 1 || (i === 0 && j === n - 1);
      const a1 = poli[i], a2 = poli[(i + 1) % n];
      const b1 = poli[j], b2 = poli[(j + 1) % n];
      if (adjacentes) {
        // Arestas vizinhas só podem tocar no vértice comum — colinear e sobreposta é degenerada.
        const d = cruz({ x: a2.x - a1.x, y: a2.y - a1.y }, { x: b2.x - b1.x, y: b2.y - b1.y });
        if (Math.abs(d) < 1e-12) {
          const dot = (a2.x - a1.x) * (b2.x - b1.x) + (a2.y - a1.y) * (b2.y - b1.y);
          if (dot < 0) return false; // dobra sobre si mesma
        }
        continue;
      }
      if (seguimentosSeCruzamProprio(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

/**
 * Triangulação por corte de orelhas (ear clipping) de um polígono
 * SIMPLES — devolve triângulos DISJUNTOS que particionam o polígono.
 * Disjuntos é a propriedade que importa: permite somar interseções sem
 * dupla contagem (e é por isso que uma Área personalizada CÔNCAVA
 * funciona na regra dos 50% sem nenhum caso especial).
 */
export function triangular(poli: Poligono): Poligono[] {
  const p = orientacaoPositiva(poli).map((v) => ({ x: v.x, y: v.y }));
  const n = p.length;
  if (n < 3) return [];
  if (n === 3) return [p];

  const indices = p.map((_, i) => i);
  const saida: Poligono[] = [];
  let guarda = 0;
  while (indices.length > 3 && guarda++ < 10000) {
    let cortou = false;
    for (let k = 0; k < indices.length; k++) {
      const ia = indices[(k - 1 + indices.length) % indices.length];
      const ib = indices[k];
      const ic = indices[(k + 1) % indices.length];
      const a = p[ia], b = p[ib], c = p[ic];
      const convexo = cruz({ x: b.x - a.x, y: b.y - a.y }, { x: c.x - b.x, y: c.y - b.y }) > 0;
      if (!convexo) continue;
      let contemOutro = false;
      for (const idx of indices) {
        if (idx === ia || idx === ib || idx === ic) continue;
        if (pontoDentroDoPoligono(p[idx], [a, b, c])) { contemOutro = true; break; }
      }
      if (contemOutro) continue;
      saida.push([a, b, c]);
      indices.splice(k, 1);
      cortou = true;
      break;
    }
    if (!cortou) break; // polígono degenerado — devolve o que conseguiu, nunca laço infinito
  }
  if (indices.length === 3) saida.push([p[indices[0]], p[indices[1]], p[indices[2]]]);
  return saida;
}

/**
 * O segmento `a→b` atravessa o INTERIOR do polígono convexo? Tocar só
 * um vértice, ou correr rente a uma aresta, NÃO conta — é exatamente a
 * distinção que a exceção da Linha (traço fino) exige.
 *
 * Recorte paramétrico do segmento pelos semiplanos do polígono; depois,
 * o ponto médio do trecho resultante precisa estar ESTRITAMENTE
 * dentro (com a folga relativa de `folgaDeInterior`), o que descarta o
 * caso do segmento colinear com uma aresta.
 */
export function segmentoCruzaInteriorDoConvexo(a: Ponto, b: Ponto, convexo: Poligono, escala: number): boolean {
  const semiplanos = semiPlanosDeConvexo(convexo);
  if (semiplanos.length < 3) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let tMin = 0;
  let tMax = 1;
  for (const s of semiplanos) {
    const f0 = s.nx * a.x + s.ny * a.y - s.c;
    const df = s.nx * dx + s.ny * dy;
    if (Math.abs(df) < 1e-15) {
      if (f0 > 0) return false;
      continue;
    }
    const t = -f0 / df;
    if (df > 0) tMax = Math.min(tMax, t);
    else tMin = Math.max(tMin, t);
    if (tMin >= tMax) return false;
  }
  const folga = folgaDeInterior(escala);
  const tm = (tMin + tMax) / 2;
  const meio = { x: a.x + dx * tm, y: a.y + dy * tm };
  for (const s of semiplanos) {
    if (s.nx * meio.x + s.ny * meio.y - s.c > -folga) return false;
  }
  return true;
}

/** Rotaciona um ponto em torno de `centro` por `radianos`. */
export function rotacionarPonto(p: Ponto, centro: Ponto, radianos: number): Ponto {
  const cos = Math.cos(radianos);
  const sen = Math.sin(radianos);
  const dx = p.x - centro.x;
  const dy = p.y - centro.y;
  return { x: centro.x + dx * cos - dy * sen, y: centro.y + dx * sen + dy * cos };
}
