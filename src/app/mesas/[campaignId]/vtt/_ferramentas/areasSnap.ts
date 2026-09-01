/**
 * Decisões de SNAP e ARREDONDAMENTO do gesto de criar área — funções
 * PURAS, sem React, DOM, estado global ou conhecimento de banco.
 *
 * Existe separado de `areasEstado.ts` de propósito: estas são as
 * regras que o usuário percebe diretamente ("por que meu cone deu 3 m
 * e não 3,07 m?", "por que a direção travou em 45°?") e são as que
 * mais precisam de teste determinístico. A máquina de estados apenas
 * as CONSOME — nunca reimplementa nenhuma delas.
 *
 * Nada aqui olha zoom, pan ou pixel de tela: tudo opera em coordenada
 * axial fracionária e metros, exatamente como o resto do domínio de
 * áreas.
 */

import { type PontoAxial, axialParaMundo, metrosParaMundo } from "../_dominio/escalaMapa";
import { pixelParaHex } from "../_mapa/hex";

// ─────────────────────────────────────────────────────────────────
// Snap angular
// ─────────────────────────────────────────────────────────────────

/**
 * Passo do snap de direção. 15° é coerente com a grade — os 6 eixos do
 * hexágono caem em 0°, 60°, 120°, 180°, 240° e 300°, todos múltiplos de
 * 15° — sem PRENDER a direção a esses seis: o usuário ainda alcança
 * 45°, 30°, 105°… que nenhum eixo de hexágono oferece.
 */
export const PASSO_SNAP_DIRECAO_GRAUS = 15;

/**
 * Normaliza um ângulo qualquer (negativo, acima de 360°, resultado
 * cru de `atan2`) para `[0, 360)`. `-90` vira `270`, `370` vira `10`,
 * `360` vira `0`.
 */
export function normalizarGraus(graus: number): number {
  if (!Number.isFinite(graus)) return 0;
  // Atalho para o caso comum — e NÃO é só performance: o ida-e-volta
  // `((g % 360) + 360) % 360` introduz ruído binário mesmo num valor
  // que já estava na faixa (`37.3` sai como `37.30000000000001`,
  // porque `37.3 + 360` não é exato em ponto flutuante). Devolver o
  // próprio valor quando ele já é válido mantém a direção livre
  // EXATAMENTE como o gesto a produziu.
  if (graus >= 0 && graus < 360) return graus;
  return ((graus % 360) + 360) % 360;
}

/**
 * Aplica (ou não) o snap angular.
 *
 * ESTABILIDADE: `Math.round` tem um único ponto de virada por passo, e
 * a entrada é sempre normalizada ANTES — então o resultado é uma
 * função determinística do ângulo, sem histerese e sem depender do
 * ângulo anterior. Um ponteiro parado produz sempre o mesmo ângulo,
 * quantas vezes o gesto for reavaliado (é o que impede a direção de
 * "piscar" entre dois passos).
 *
 * O empate exato (ex.: 7,5° entre 0° e 15°) segue a regra
 * METADE PARA CIMA do `Math.round` — documentado e testado, nunca
 * deixado ao acaso.
 *
 * O resultado volta normalizado: 352,5° arredonda pra 360°, que é
 * reapresentado como 0° (nunca 360°, que sairia da faixa canônica e
 * quebraria o `CHECK` de `direcao_graus` no banco).
 */
export function snapAngular(graus: number, ligado: boolean): number {
  const base = normalizarGraus(graus);
  if (!ligado) return base;
  return normalizarGraus(Math.round(base / PASSO_SNAP_DIRECAO_GRAUS) * PASSO_SNAP_DIRECAO_GRAUS);
}

/**
 * O tipo tem DIREÇÃO que o snap angular possa travar? Esfera, Domo e
 * Aura são radialmente simétricos — a opção não se aplica a eles e a
 * interface não deve nem oferecê-la.
 */
export function tipoTemDirecao(tipo: string): boolean {
  return tipo === "linha" || tipo === "faixa" || tipo === "parede" || tipo === "cubo" || tipo === "cone";
}

// ─────────────────────────────────────────────────────────────────
// Arredondamento de dimensão
// ─────────────────────────────────────────────────────────────────

/** Casas decimais máximas exibidas/persistidas no modo de precisão livre. */
export const CASAS_PRECISAO_LIVRE = 2;

/**
 * O gesto está no modo de PRECISÃO LIVRE? Lido SEMPRE do evento atual
 * (`altKey`/`metaKey` do próprio `PointerEvent`), nunca de um listener
 * global de teclado que possa ficar presa depois de um `blur`, de um
 * `Alt+Tab` ou de a janela perder o foco no meio do arrasto.
 *
 * `Alt` em qualquer plataforma; `Command`/`Meta` também, que é o
 * modificador que um usuário de macOS tenta primeiro.
 */
export function precisaoLivreDoEvento(e: { altKey?: boolean; metaKey?: boolean }): boolean {
  return e.altKey === true || e.metaKey === true;
}

/**
 * Arredonda para no máximo `CASAS_PRECISAO_LIVRE` casas SEM deixar
 * ruído de ponto flutuante. `2.23 * 100 = 223.00000000000003` em
 * binário; arredondar o produto antes de dividir é o que impede
 * `2.2300000000000004` de aparecer num campo numérico.
 */
export function limitarCasas(valor: number, casas = CASAS_PRECISAO_LIVRE): number {
  if (!Number.isFinite(valor)) return 0;
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

/**
 * A regra de dimensão do ARRASTO.
 *
 * PADRÃO (sem modificador): metro INTEIRO mais próximo. É o que faz um
 * gesto rápido produzir "3 m" em vez de "3,07 m" — as regras de
 * Ruptura são declaradas em metros inteiros, então esse é o valor que
 * o narrador quer em quase todo lance.
 *
 * EMPATE: metade PARA CIMA (2,5 → 3). `Math.round` já faz isso para
 * positivos, e dimensão nunca é negativa aqui; ainda assim a regra
 * fica explícita e testada, em vez de herdada por acidente.
 *
 * PRECISÃO LIVRE (`Alt`/`Command` segurado): mantém a fração, limitada
 * a duas casas.
 *
 * MÍNIMO: um arraste curto demais arredonda pra 0 e continua sendo
 * geometria degenerada — `validarParametros` (domínio) é quem recusa,
 * exatamente como antes. Este módulo nunca "inventa" um mínimo pra
 * salvar um gesto que o usuário não fez: 0,3 m de arrasto vira 0 no
 * modo inteiro (nada é criado), e vira 0,3 m no modo livre.
 */
export function arredondarDimensao(metros: number, precisaoLivre: boolean): number {
  if (!Number.isFinite(metros) || metros < 0) return 0;
  return precisaoLivre ? limitarCasas(metros) : Math.round(metros);
}

/**
 * Formata metros pra exibição — sem casas quando é inteiro ("3 m", não
 * "3,00 m"), com até duas quando não é, e sempre com vírgula decimal
 * (português). Nunca expõe ruído binário.
 */
export function formatarMetros(valor: number): string {
  const v = limitarCasas(valor);
  const texto = Number.isInteger(v) ? String(v) : String(v).replace(".", ",");
  return `${texto} m`;
}

// ─────────────────────────────────────────────────────────────────
// Snap da origem em token
// ─────────────────────────────────────────────────────────────────

/**
 * Raio de captura do snap de origem, em CÉLULAS (= metros). 1,5 célula
 * é a distância em que o ponteiro está visivelmente "em cima" de um
 * token de uma célula sem que um token vizinho dispute a captura
 * (vizinhos ficam a 1 célula de distância entre centros, então 1,5
 * captura o próprio e alcança pouco além da borda dele).
 *
 * Centralizado aqui: quem precisa do limite em unidades do mundo usa
 * `limiteSnapTokenEmMundo`, nunca um número solto no componente.
 */
export const LIMITE_SNAP_TOKEN_CELULAS = 1.5;

export function limiteSnapTokenEmMundo(tamanhoCelula: number): number {
  return metrosParaMundo(LIMITE_SNAP_TOKEN_CELULAS, tamanhoCelula);
}

export interface TokenParaSnap {
  id: string;
  /**
   * ORIGEM MECÂNICA do token (âncora + `origemMecanica` da pegada
   * efetiva) — a MESMA que alcance, efeitos e Aura já usam. Nunca a
   * borda da imagem, nunca o centro visual da sprite, e para pegadas
   * multicelulares/irregulares nunca a âncora sozinha.
   */
  origem: PontoAxial;
  /**
   * O token pode ser capturado? Quem chama decide (token oculto,
   * decorativo, ou que este cliente não recebeu por autorização entra
   * como `false`). Este módulo nunca adivinha visibilidade.
   */
  elegivel: boolean;
}

export interface ResultadoSnapToken {
  /** Origem a usar de fato — a do token capturado, ou o ponto clicado quando nenhum token qualifica. */
  origem: PontoAxial;
  /** `null` quando nada foi capturado (o ponto livre foi mantido). */
  tokenId: string | null;
}

/**
 * Encontra o token elegível mais próximo de `ponto` dentro do limite e
 * devolve a origem efetiva do gesto.
 *
 * DESEMPATE DETERMINÍSTICO: distâncias exatamente iguais são
 * resolvidas pelo MENOR `id` em ordem lexicográfica. Sem isso, dois
 * tokens simétricos em volta do cursor fariam a origem alternar entre
 * eles conforme a ordem em que o array chegasse — que muda a cada
 * releitura da cena.
 *
 * Fora do limite, ou com `ligado: false`, a origem é o próprio ponto
 * clicado: o snap NUNCA bloqueia a criação, só desloca a origem quando
 * de fato há um token perto.
 */
export function resolverSnapToken(params: {
  ponto: PontoAxial;
  tokens: readonly TokenParaSnap[];
  ligado: boolean;
  tamanhoCelula: number;
}): ResultadoSnapToken {
  const { ponto, tokens, ligado, tamanhoCelula } = params;
  if (!ligado) return { origem: ponto, tokenId: null };

  const limite = limiteSnapTokenEmMundo(tamanhoCelula);
  const alvo = axialParaMundo(ponto, tamanhoCelula);

  let melhorId: string | null = null;
  let melhorOrigem: PontoAxial | null = null;
  let melhorDistancia = Infinity;

  for (const t of tokens) {
    if (!t.elegivel) continue;
    const p = axialParaMundo(t.origem, tamanhoCelula);
    const d = Math.hypot(p.x - alvo.x, p.y - alvo.y);
    if (d > limite) continue;
    // `<` mantém o primeiro; o empate exato cai no `else if` abaixo e
    // é decidido pelo id, nunca pela ordem do array.
    if (d < melhorDistancia - 1e-9) {
      melhorDistancia = d; melhorId = t.id; melhorOrigem = t.origem;
    } else if (Math.abs(d - melhorDistancia) <= 1e-9 && melhorId !== null && t.id < melhorId) {
      melhorId = t.id; melhorOrigem = t.origem;
    }
  }

  if (melhorId === null || melhorOrigem === null) return { origem: ponto, tokenId: null };
  return { origem: melhorOrigem, tokenId: melhorId };
}

/**
 * Qual token seria capturado se o gesto começasse AGORA neste ponto —
 * usado só pra realçar o candidato antes do `pointerdown`. Mesma
 * função de decisão do gesto real (`resolverSnapToken`), pra o realce
 * nunca prometer uma captura diferente da que vai acontecer.
 */
export function candidatoAoSnap(params: {
  ponto: PontoAxial;
  tokens: readonly TokenParaSnap[];
  ligado: boolean;
  tamanhoCelula: number;
}): string | null {
  return resolverSnapToken(params).tokenId;
}

// ─────────────────────────────────────────────────────────────────
// Snap da origem no CENTRO DA CÉLULA
// ─────────────────────────────────────────────────────────────────

/**
 * Fixa `ponto` no centro CANÔNICO do hexágono que o contém — reusa
 * `pixelParaHex` (`_mapa/hex.ts`), a MESMA conta que decide "em qual
 * célula o cursor está" no resto do mapa, nunca uma segunda regra de
 * arredondamento. Independe de zoom/pan/tela: opera inteiramente em
 * unidades do mundo, derivadas do próprio ponto axial recebido — o
 * mesmo `ponto` produz sempre o mesmo centro, em qualquer nível de
 * zoom ou posição de pan.
 *
 * Não sabe (nem precisa saber) o que ocupa a célula — token, objeto,
 * terreno ou nada: o centro geométrico é o mesmo em qualquer caso, e
 * não cria vínculo nenhum com o conteúdo dela (mover um token pra fora
 * depois não move a área já fixada nesse ponto).
 */
export function resolverSnapCelula(params: {
  ponto: PontoAxial;
  ligado: boolean;
  tamanhoCelula: number;
}): PontoAxial {
  if (!params.ligado) return params.ponto;
  const mundo = axialParaMundo(params.ponto, params.tamanhoCelula);
  const hex = pixelParaHex(mundo.x, mundo.y, params.tamanhoCelula);
  return { q: hex.q, r: hex.r };
}

export interface ResultadoOrigemArea {
  /** Origem efetiva a usar — token capturado, centro de célula, ou o ponto livre, nesta ordem de prioridade. */
  origem: PontoAxial;
  /** Token capturado, quando a origem veio de um. */
  tokenId: string | null;
  /** A origem veio do snap de CÉLULA (nenhum token foi capturado, mas a opção de célula estava ligada)? */
  viaCelula: boolean;
}

/**
 * Resolve a origem de um gesto quando AS DUAS opções de snap podem
 * estar ligadas ao mesmo tempo — a prioridade pedida:
 *
 *   1. Token elegível dentro do limite de captura → origem mecânica dele.
 *   2. Sem token capturado, com snap de célula ligado → centro do hexágono.
 *   3. Nenhum dos dois → o ponto livre, exatamente como clicado.
 *
 * Nunca falha a criação por "não achou token perto" — só degrada pra
 * célula, e depois pro ponto livre. As duas opções são independentes:
 * qualquer combinação (nenhuma, só uma, as duas) passa por aqui.
 */
export function resolverOrigemArea(params: {
  ponto: PontoAxial;
  tokens: readonly TokenParaSnap[];
  snapToken: boolean;
  snapCelula: boolean;
  tamanhoCelula: number;
}): ResultadoOrigemArea {
  const { ponto, tokens, snapToken, snapCelula, tamanhoCelula } = params;
  const viaToken = resolverSnapToken({ ponto, tokens, ligado: snapToken, tamanhoCelula });
  if (viaToken.tokenId) return { origem: viaToken.origem, tokenId: viaToken.tokenId, viaCelula: false };
  if (snapCelula) return { origem: resolverSnapCelula({ ponto, ligado: true, tamanhoCelula }), tokenId: null, viaCelula: true };
  return { origem: ponto, tokenId: null, viaCelula: false };
}
