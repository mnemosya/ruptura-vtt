/**
 * Pegada hexagonal (footprint) de tokens multicelulares — funções
 * PURAS, sem DOM/React. Separa três conceitos que o resto do VTT não
 * pode confundir:
 *
 *   - `categoriaTamanho`: pequeno/medio/grande/enorme/colossal — rótulo
 *     de regra, nunca a ocupação em si.
 *   - `pegada`: o CONJUNTO de offsets axiais (relativos à âncora) que
 *     a entidade ocupa — a forma real, sempre relativa, nunca em
 *     coordenadas absolutas por si só.
 *   - `hexAncora`: a célula ABSOLUTA persistida (`vtt_tokens.q/r`) —
 *     um ponto de referência que pertence à pegada (por convenção,
 *     sempre o offset `{0,0}` dela), não o centro geométrico.
 *   - `origemMecanica`: o ponto (pode ser FRACIONÁRIO, entre células)
 *     usado por alcance/linha de visão/áreas — nunca escolhido só pra
 *     simplificar código (ver `origemMecanica`).
 *
 * Pequeno e Médio têm a MESMA ocupação (1 célula) mas continuam
 * categorias distintas — a categoria é regra de jogo (tamanho da
 * criatura), a pegada é só geometria; duas categorias podem colidir na
 * mesma forma sem serem a mesma coisa.
 *
 * Presets (Lancer como REFERÊNCIA DE FORMATO só — nenhuma regra de
 * movimento/alcance/combate importada):
 *   - grande: 3 células em TRIÂNGULO (âncora + 2 vizinhos mutuamente
 *     adjacentes) — não um disco.
 *   - enorme: 7 células — âncora (centro) + os 6 vizinhos (anel raio 1
 *     completo). Simétrico: rotacionar não muda o conjunto ocupado,
 *     porque rotacionar as 6 direções só as permuta.
 *   - colossal: 12 células — as 7 do "enorme" MAIS as 5 primeiras
 *     células do anel de raio 2 (em ordem horária, começando no offset
 *     `2×SW`) — uma extensão conectada e sem buraco, não o anel de 12
 *     células sozinho (que deixaria o centro vazio) nem o disco de
 *     raio 2 inteiro (que seria 19). Construído por código a partir de
 *     `anelHex` (mesma função usada nos testes), nunca digitado à mão
 *     como lista solta — ver `PRESETS_POR_CATEGORIA`.
 *
 * `hexNoRaio`/`hexVizinhos` de `_mapa/hex.ts` cobrem discos e anéis
 * geométricos genéricos (Medir, áreas) — este arquivo é especificamente
 * sobre OCUPAÇÃO DE TOKEN, um conceito de jogo diferente.
 */

import { type Hex, hexDistancia, hexIguais, hexKey, hexRotacionar, hexVizinhos } from "../_mapa/hex";

export type CategoriaTamanho = "pequeno" | "medio" | "grande" | "enorme" | "colossal";

/** Conjunto de offsets axiais relativos à âncora (offset `{0,0}` sempre presente e pertencente ao conjunto). */
export type Pegada = readonly Hex[];

/**
 * Ponto usado por alcance/linha-de-visão/áreas — pode cair ENTRE
 * células (nunca arredondado pra uma delas só). Mesma semântica axial
 * de `Hex` (`q`/`r`), só que FRACIONÁRIO — converte pra pixel com a
 * MESMA `hexParaPixel(TAM)` de `_mapa/hex.ts` (que é uma transformação
 * linear de `q`/`r`, então funciona igual pra valores não-inteiros;
 * este módulo nunca importa `TAM`/pixel de propósito, pra continuar
 * puro e sem saber nada de renderização).
 */
export interface HexFracionario {
  q: number;
  r: number;
}

function anelHex(raio: number): Hex[] {
  if (raio === 0) return [{ q: 0, r: 0 }];
  const DIRECAO_INICIAL = 4; // SW — mesma convenção usada pra derivar o preset colossal, documentada acima.
  let atual = { q: 0, r: 0 };
  for (let i = 0; i < raio; i++) atual = { q: atual.q + DIRECOES[DIRECAO_INICIAL].q, r: atual.r + DIRECOES[DIRECAO_INICIAL].r };
  const out: Hex[] = [];
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < raio; j++) {
      out.push(atual);
      atual = { q: atual.q + DIRECOES[i].q, r: atual.r + DIRECOES[i].r };
    }
  }
  return out;
}

// Cópia local — `_mapa/hex.ts` não exporta `DIRECOES` (é módulo-privado
// lá); replicar aqui é mais simples que reestruturar o módulo de
// geometria pura por causa de uma função interna de anel.
const DIRECOES: Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

const PEGADA_PEQUENO_MEDIO: Pegada = [{ q: 0, r: 0 }];
const PEGADA_GRANDE: Pegada = [{ q: 0, r: 0 }, DIRECOES[0], DIRECOES[5]]; // âncora + E + SE — mutuamente adjacentes, formação triangular.
const PEGADA_ENORME: Pegada = [{ q: 0, r: 0 }, ...anelHex(1)];
const PEGADA_COLOSSAL: Pegada = [{ q: 0, r: 0 }, ...anelHex(1), ...anelHex(2).slice(0, 5)];

const PRESETS_POR_CATEGORIA: Record<CategoriaTamanho, Pegada> = {
  pequeno: PEGADA_PEQUENO_MEDIO,
  medio: PEGADA_PEQUENO_MEDIO,
  grande: PEGADA_GRANDE,
  enorme: PEGADA_ENORME,
  colossal: PEGADA_COLOSSAL,
};

/** A pegada padrão (offsets relativos, âncora em `{0,0}`) de uma categoria — sem rotação aplicada. */
export function pegadaPadrao(categoria: CategoriaTamanho): Pegada {
  return PRESETS_POR_CATEGORIA[categoria];
}

/**
 * Rotaciona uma pegada em `passos` incrementos de 60° (horário),
 * sempre em torno da âncora (offset `{0,0}`, que nunca se move).
 * Enorme é simétrico por construção (o conjunto de 6 vizinhos rotaciona
 * pra ele mesmo, só permutado) — grande/colossal/pegadas irregulares
 * legitimamente mudam de conjunto ocupado a cada passo não-múltiplo de 6.
 */
export function rotacionarPegada(pegada: Pegada, passos: number): Pegada {
  return pegada.map((o) => hexRotacionar(o, passos));
}

/** Projeta uma pegada (offsets relativos) em células ABSOLUTAS a partir de uma âncora. */
export function projetarPegada(ancora: Hex, pegada: Pegada): Hex[] {
  return pegada.map((o) => ({ q: ancora.q + o.q, r: ancora.r + o.r }));
}

/**
 * Centro geométrico do conjunto de offsets: a MÉDIA simples de `q` e de
 * `r` entre as células. Como `hexParaPixel` é uma transformação LINEAR
 * de `(q,r)`, a média das coordenadas axiais converte pro mesmo ponto
 * que a média dos centros em PIXEL daria — calcular aqui em `(q,r)`
 * evita este módulo puro precisar saber de `TAM`.
 *
 * Pode cair ENTRE células — é exatamente o caso do "grande" (triângulo
 * de 3), cujo centro geométrico não é nenhum dos 3 hexes, e é por isso
 * que `origemMecanica` devolve um `HexFracionario`, não um `Hex`.
 */
export function centroGeometrico(pegada: Pegada): HexFracionario {
  let sq = 0, sr = 0;
  for (const o of pegada) { sq += o.q; sr += o.r; }
  return { q: sq / pegada.length, r: sr / pegada.length };
}

/**
 * Origem mecânica — o ponto que alcance/linha-de-visão/áreas devem
 * usar como referência da entidade, em coordenadas FRACIONÁRIAS
 * relativas à âncora (some com `ancora` convertida pra pixel na hora
 * de desenhar — ver `MapaHex.tsx`). Nunca escolhe arbitrariamente um
 * dos hexes só pra simplificar: pequeno/médio/enorme têm origem exatamente
 * numa célula (a própria âncora, ou o centro do disco simétrico) só
 * porque a geometria realmente cai lá — grande e colossal usam o
 * centro geométrico de verdade, mesmo caindo entre células.
 */
export function origemMecanica(pegada: Pegada): HexFracionario {
  return centroGeometrico(pegada);
}

/** `true` se as duas pegadas (já projetadas em absoluto) têm QUALQUER célula em comum. */
export function pegadasSobrepoem(a: readonly Hex[], b: readonly Hex[]): boolean {
  const chaves = new Set(a.map(hexKey));
  return b.some((c) => chaves.has(hexKey(c)));
}

/**
 * `true` se as pegadas (absolutas) são adjacentes: pelo menos uma
 * célula de `a` é vizinha de uma célula de `b`, SEM nenhuma
 * sobreposição (sobreposição não é adjacência, é colisão).
 */
export function pegadasAdjacentes(a: readonly Hex[], b: readonly Hex[]): boolean {
  if (pegadasSobrepoem(a, b)) return false;
  return a.some((ca) => b.some((cb) => hexDistancia(ca, cb) === 1));
}

/** `true` se `celula` pertence à pegada já projetada em absoluto. */
export function celulaNaPegada(celula: Hex, pegadaAbsoluta: readonly Hex[]): boolean {
  return pegadaAbsoluta.some((c) => hexIguais(c, celula));
}

/** Caixa visual (em células, cantos inclusivos) necessária pra cobrir a pegada projetada — usada pra dimensionar clip/hitbox de renderização. */
export function caixaVisual(pegadaAbsoluta: readonly Hex[]): { minQ: number; maxQ: number; minR: number; maxR: number } {
  let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
  for (const c of pegadaAbsoluta) {
    if (c.q < minQ) minQ = c.q;
    if (c.q > maxQ) maxQ = c.q;
    if (c.r < minR) minR = c.r;
    if (c.r > maxR) maxR = c.r;
  }
  return { minQ, maxQ, minR, maxR };
}

/**
 * Valida uma pegada PERSONALIZADA (narrador): lista não-vazia, offsets
 * únicos, conjunto CONECTADO (adjacência célula-a-célula, BFS a partir
 * do primeiro offset), e a âncora `{0,0}` precisa pertencer ao
 * conjunto (é a convenção que todo o resto do módulo assume).
 */
export function pegadaPersonalizadaValida(offsets: readonly Hex[]): boolean {
  if (offsets.length === 0) return false;
  const chaves = offsets.map(hexKey);
  if (new Set(chaves).size !== chaves.length) return false;
  if (!offsets.some((o) => hexIguais(o, { q: 0, r: 0 }))) return false;

  const vistos = new Set<string>([chaves[0]]);
  const pilha = [offsets[0]];
  while (pilha.length > 0) {
    const atual = pilha.pop()!;
    for (const o of offsets) {
      const k = hexKey(o);
      if (!vistos.has(k) && hexDistancia(atual, o) === 1) {
        vistos.add(k);
        pilha.push(o);
      }
    }
  }
  return vistos.size === offsets.length;
}

/**
 * Resolve a pegada EFETIVA de um token: personalizada se fornecida
 * (já validada na borda — client/servidor rejeitam antes daqui),
 * senão o preset da categoria, rotacionado pela orientação atual.
 */
export function pegadaEfetiva(params: { categoria: CategoriaTamanho; orientacao: number; pegadaPersonalizada: Pegada | null }): Pegada {
  const base = params.pegadaPersonalizada ?? pegadaPadrao(params.categoria);
  return rotacionarPegada(base, params.orientacao);
}

/** Exporta o construtor de anel — usado nos testes pra provar que o preset colossal vem de código, não de uma lista digitada à mão. */
export function anelHexParaTestes(raio: number): Hex[] {
  return anelHex(raio);
}

/**
 * `true` se rotacionar a pegada em 1 passo (60°) não muda NENHUMA
 * célula ocupada (Pequeno/Médio: 1 célula só; Enorme: anel completo de
 * raio 1, simétrico por construção). Único ponto de verdade — quem
 * decide "esta pegada pode girar visivelmente" (menu contextual de
 * token existente, alça de rotação no mapa) reusa ISTO, nunca duas
 * cópias da mesma comparação que podem divergir.
 */
export function pegadaSimetricaSobRotacao(pegada: Pegada): boolean {
  const rotacionada = rotacionarPegada(pegada, 1);
  return rotacionada.length === pegada.length && rotacionada.every((c) => pegada.some((o) => o.q === c.q && o.r === c.r));
}
