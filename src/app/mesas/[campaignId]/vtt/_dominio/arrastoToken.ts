/**
 * Estado e transições PURAS do arraste de token — RASTRO DO CURSOR,
 * nunca uma rota prevista.
 *
 * A rota é exatamente por onde o ponteiro passou: cada `pointermove`
 * estende a trilha pelas células REALMENTE atravessadas entre a ponta
 * atual e o cursor. Não há pathfinding, não há reotimização, não há
 * "cauda provisória" que o algoritmo possa redesenhar — o que está na
 * tela é o que a mão fez, e por isso não muda sozinho.
 *
 * Histórico (documentado porque já foram tentadas três abordagens
 * antes desta, e cada uma falhou por um motivo diferente):
 *
 *  1. Rastro bruto célula a célula, sem simplificação: tremor da mão
 *     virava zigue-zague real na rota, com custo cobrado por isso.
 *  2. "Sempre reta pro destino atual": estável, mas o jogador não
 *     conseguia contornar nada — a rota ignorava o gesto inteiro.
 *  3. Pathfinding GLOBAL (origem→destino) a cada movimento, depois
 *     pathfinding LOCAL com cauda provisória e confirmação
 *     incremental: nas duas, o algoritmo escolhia o caminho, e a
 *     sensação era de disputar o controle com o sistema — a linha
 *     mudava de lado sozinha, ou "corrigia" um desvio deliberado.
 *
 * O que resolve as três de uma vez: o rastro é do cursor (resolve 2 e
 * 3 — quem decide o caminho é a mão), e voltar por cima do próprio
 * caminho CORTA o excedente em vez de acumular (resolve 1 — o
 * zigue-zague se desfaz sozinho ao refazer o percurso, sem custo
 * fantasma e sem loop).
 *
 * Nada aqui toca DOM, React nem `requestAnimationFrame` — testável sem
 * browser (`scripts/test-vtt-arrasto-token.ts`), e é a MESMA lógica
 * que `MapaHex.tsx` usa nos handlers de `pointermove`/`keydown`.
 */

import { type Hex, hexIguais, hexKey, hexLinha } from "../_mapa/hex";
import { type MapaTerreno, custoDePassoPegada, type Rota } from "./movimento";
import { type Pegada, pegadaPadrao, projetarPegada } from "./pegada";
import { bloqueiosNaRota } from "./pathfindingHex";

const PEGADA_UMA_CELULA: Pegada = pegadaPadrao("medio");

export interface EstadoArrasto {
  tokenId: string;
  /** Posição inicial do token — nunca muda durante o arraste, é sempre `rota[0]`. */
  origem: Hex;
  /** Marcos fixados EXPLICITAMENTE com a tecla Q — metadado visual, sempre um SUBCONJUNTO de `rota`. Não influencia o traçado. */
  waypoints: Hex[];
  /**
   * A trilha percorrida, célula a célula, sempre adjacente e sempre
   * LEGAL (a pegada inteira cabe em cada posição). Começa na origem.
   * Cresce pelas células que o cursor atravessa; encolhe quando o
   * cursor volta por cima dela (corte do excedente). É a ÚNICA lista
   * que alimenta preview, custo, envio ao servidor, animação,
   * broadcast, undo e redo.
   */
  rota: Hex[];
  /** Hex sob o cursor. Diverge da ponta de `rota` quando o cursor está sobre uma posição onde a pegada não cabe. */
  destinoAtual: Hex;
  /**
   * `false` quando o cursor está sobre uma posição ILEGAL (fora do
   * mapa, ou colidindo com outro token) — a trilha parou na última
   * célula boa e o token fica lá, sem seguir o cursor pra dentro do
   * obstáculo. Terreno bloqueado NUNCA entra aqui: é regra consultiva,
   * vira aviso via `celulasBloqueadas`, nunca impedimento.
   */
  destinoAlcancavel: boolean;
  /**
   * Terreno bloqueado de fato atravessado pela trilha atual —
   * recomputado a cada movimento sobre a rota inteira, nunca acumulado
   * (senão um corte gestual deixaria células fantasma). Puramente
   * informativo pro destaque visual — nunca decide autorização.
   */
  celulasBloqueadas: Hex[];
  /**
   * Paralelo a `rota` (mesmo comprimento, mesma ordem, índice 0 sempre
   * `false`) — `passosBloqueados[i]` diz se a pegada projetada NAQUELE
   * passo toca alguma célula bloqueada. Existe pra `MapaHex.tsx`
   * colorir cada segmento sem recomputar a regra por conta própria —
   * pra pegada multicelular, um passo pode ficar problemático mesmo
   * quando a ÂNCORA cai em terreno livre, se uma célula SECUNDÁRIA da
   * pegada cai sobre bloqueio.
   */
  passosBloqueados: boolean[];
}

/** O que a trilha precisa pra validar cada célula que o cursor atravessa. */
export interface ContextoArrasto {
  terreno: MapaTerreno;
  /** Já a UNIÃO de todas as células de todas as pegadas de OUTROS tokens — nunca só âncoras alheias. */
  ocupados: ReadonlySet<string>;
  largura: number;
  altura: number;
  /** Pegada do token em arrasto, na orientação ATUAL — constante durante todo o deslocamento (a orientação não muda arrastando). Omitida = 1 célula. */
  pegada?: Pegada;
  /**
   * ACOMPANHANTES — os outros tokens selecionados, que se deslocam
   * JUNTO com o líder, rigidamente: cada um mantém exatamente o mesmo
   * vetor que tinha pra ele no início do gesto. Numa grade axial uma
   * translação é soma componente a componente, então a trilha do
   * acompanhante é a do líder somada ao `deslocamento` dele — mesma
   * forma, mesma adjacência, sem nenhum caminho próprio a calcular.
   *
   * A consequência que importa: uma posição da trilha só é legal
   * quando cabe pro GRUPO INTEIRO. O líder para na borda porque um
   * acompanhante lá atrás não caberia — é isso que mantém a formação
   * intacta em vez de deixar o grupo se deformar na primeira parede.
   *
   * `ocupados` (acima) NÃO pode conter as células de quem está no
   * grupo: eles saem das próprias células no mesmo instante, e se
   * contassem como obstáculo o grupo colidiria consigo mesmo antes do
   * primeiro passo.
   */
  grupo?: readonly { deslocamento: Hex; pegada: Pegada }[];
}

function somar(a: Hex, b: Hex): Hex {
  return { q: a.q + b.q, r: a.r + b.r };
}

/**
 * A posição é livre pro GRUPO INTEIRO?
 *
 * A ÚNICA coisa que impede uma posição é COLISÃO com um token de fora
 * do grupo. A borda da cena não impede: o vazio em volta da grade é
 * área de trabalho legítima (fila de reforços, inimigos que ainda não
 * entraram, tokens que uma grade encolhida deixou pra trás), e sair
 * pra lá precisa ser tão possível quanto voltar de lá. Terreno
 * bloqueado também não impede — é regra consultiva desde sempre, vira
 * aviso via `celulasBloqueadas`.
 *
 * Por isso a checagem é escrita aqui em vez de reusar
 * `posicaoDaPegadaValida`: aquela função continua valendo os limites do
 * mapa, e ela é o que o PATHFINDING usa — rota automática e medição
 * seguem confinadas à grade, que é onde a mecânica de combate vive.
 * São duas regras de fato diferentes, não a mesma com um parâmetro.
 */
function posicaoDoGrupoValida(ancora: Hex, pegada: Pegada, ctx: ContextoArrasto): { valido: boolean; celulas: Hex[] } {
  const celulas = projetarPegada(ancora, pegada);
  for (const membro of ctx.grupo ?? []) {
    celulas.push(...projetarPegada(somar(ancora, membro.deslocamento), membro.pegada));
  }
  return { valido: !celulas.some((c) => ctx.ocupados.has(hexKey(c))), celulas };
}

export function iniciarArrastoToken(tokenId: string, origem: Hex): EstadoArrasto {
  return {
    tokenId, origem, waypoints: [],
    rota: [origem], destinoAtual: origem, destinoAlcancavel: true,
    celulasBloqueadas: [], passosBloqueados: [false],
  };
}

/**
 * `pointermove` — estende a trilha pelas células REALMENTE atravessadas
 * entre a ponta atual e o cursor.
 *
 * Interpolação: um `pointermove` pode saltar várias células quando o
 * mouse anda rápido (o browser não garante um evento por pixel).
 * `hexLinha` preenche as intermediárias, então a trilha nunca tem
 * buracos nem teleporte — e como cada intermediária passa pelas mesmas
 * regras abaixo, um salto sobre um obstáculo para NELE, não do outro
 * lado.
 *
 * Cada célula interpolada, na ordem, cai num de três casos:
 *
 * 1. JÁ ESTÁ NA TRILHA — o cursor está voltando por cima do próprio
 *    caminho: corta tudo depois dela. É o que desfaz um desvio (e
 *    dissolve zigue-zague de tremor) sem tecla nenhuma, e o que impede
 *    laço acumulado e custo cobrado duas vezes pela mesma ida-e-volta.
 * 2. POSIÇÃO OCUPADA (a pegada — do token ou de algum acompanhante —
 *    cairia sobre outro token) — para aqui. A trilha fica na última
 *    célula boa e `destinoAlcancavel` vira `false`; o token não entra
 *    no obstáculo mesmo que o cursor entre. Nem a borda da cena nem
 *    terreno bloqueado caem neste caso: a primeira não limita onde um
 *    token pode estar, o segundo é regra consultiva.
 * 3. LIVRE — entra na trilha.
 */
export function moverDestino(a: EstadoArrasto, hex: Hex, ctx: ContextoArrasto): EstadoArrasto {
  if (hexIguais(a.destinoAtual, hex)) return a;

  const pegada = ctx.pegada ?? PEGADA_UMA_CELULA;
  const ponta = a.rota[a.rota.length - 1];
  // `hexLinha` inclui as duas pontas; a primeira já é a ponta atual.
  const atravessadas = hexLinha(ponta, hex).slice(1);

  let rota = a.rota;
  let alcancavel = true;
  let cortou = false;

  for (const c of atravessadas) {
    const idx = rota.findIndex((r) => hexIguais(r, c));
    if (idx !== -1) {
      // Caso 1 — voltando por cima do caminho: corta o excedente.
      // `idx + 1` mantém a própria célula como nova ponta.
      if (idx + 1 !== rota.length) { rota = rota.slice(0, idx + 1); cortou = true; }
      continue;
    }
    // Caso 2 — a pegada INTEIRA precisa caber. `ignorarBloqueioTerreno:
    // true` porque bloqueio de terreno é consultivo: atravessar é
    // permitido (e avisado), só limite de mapa e colisão impedem.
    if (!posicaoDoGrupoValida(c, pegada, ctx).valido) {
      alcancavel = false;
      break;
    }
    // Caso 3 — livre.
    if (rota === a.rota) rota = [...a.rota];
    rota.push(c);
  }

  const mudou = rota !== a.rota || cortou;
  if (!mudou && alcancavel === a.destinoAlcancavel) {
    // Nada na trilha mudou — só a célula sob o cursor. Ainda precisa
    // registrar `destinoAtual` (o rótulo de aviso o acompanha), mas
    // evita recomputar bloqueios à toa.
    return { ...a, destinoAtual: hex };
  }

  // Marcos que ficaram além do corte deixam de existir — nunca um
  // waypoint órfão, fora da trilha que ele deveria marcar.
  const waypoints = cortou ? a.waypoints.filter((wp) => rota.some((c) => hexIguais(c, wp))) : a.waypoints;
  const { celulas: celulasBloqueadas, passos: passosBloqueados } = bloqueiosNaRota(rota, pegada, ctx.terreno);
  return { ...a, rota, waypoints, destinoAtual: hex, destinoAlcancavel: alcancavel, celulasBloqueadas, passosBloqueados };
}

/**
 * Tecla Q — marca a ponta atual da trilha como marco fixo. Metadado
 * visual: a trilha já é imutável pelo que a mão fez, então um marco
 * não precisa "congelar" nada — serve pra o jogador se orientar num
 * percurso longo. Devolve a MESMA referência (recusa silenciosa)
 * quando a ponta é a própria origem ou repete o último marco.
 */
export function adicionarWaypoint(a: EstadoArrasto): EstadoArrasto {
  const ponta = a.rota[a.rota.length - 1];
  if (hexIguais(ponta, a.origem)) return a;
  const ultimo = a.waypoints[a.waypoints.length - 1];
  if (ultimo && hexIguais(ultimo, ponta)) return a;
  return { ...a, waypoints: [...a.waypoints, ponta] };
}

/**
 * Tecla Backspace — remove só o ÚLTIMO marco. NUNCA corta a trilha:
 * desfazer o CAMINHO é gestual (voltar o cursor por cima dele),
 * Backspace desfaz só a marcação. No-op (mesma referência) se não
 * houver marco nenhum.
 */
export function removerUltimoWaypoint(a: EstadoArrasto): EstadoArrasto {
  if (a.waypoints.length === 0) return a;
  return { ...a, waypoints: a.waypoints.slice(0, -1) };
}

/**
 * A MESMA trilha, vista do lugar de um acompanhante — o gesto do líder
 * transladado pelo vetor fixo que separa os dois.
 *
 * É o que garante que o grupo se move como um bloco: ninguém calcula
 * caminho próprio (dois caminhos separados divergiriam ao contornar um
 * obstáculo e a formação se desfaria), e a adjacência célula a célula
 * que o servidor exige é preservada, porque translação não muda
 * vizinhança numa grade axial.
 *
 * `celulasBloqueadas`/`passosBloqueados` do líder NÃO são transladados:
 * eles são aviso visual sobre terreno, e o terreno sob o acompanhante é
 * outro. Vão vazios — quem precisar do aviso por token recalcula com
 * `bloqueiosNaRota`.
 */
export function arrastoDoAcompanhante(a: EstadoArrasto, tokenId: string, deslocamento: Hex): EstadoArrasto {
  return {
    ...a,
    tokenId,
    origem: somar(a.origem, deslocamento),
    waypoints: a.waypoints.map((w) => somar(w, deslocamento)),
    rota: a.rota.map((c) => somar(c, deslocamento)),
    destinoAtual: somar(a.destinoAtual, deslocamento),
    celulasBloqueadas: [],
    passosBloqueados: a.rota.map(() => false),
  };
}

/** A trilha percorrida, célula a célula. */
export function rotaExibida(a: EstadoArrasto): Hex[] {
  return a.rota;
}

/** Onde o token está VISUALMENTE durante o arraste — a ponta da trilha, nunca o cursor (que pode estar sobre um obstáculo). */
export function posicaoVisual(a: EstadoArrasto): Hex {
  return a.rota[a.rota.length - 1];
}

/**
 * Voltar exatamente pra origem sem marco nenhum não é um movimento —
 * distância zero, nada a persistir, nenhuma animação. Com marcos
 * fixados, mesmo terminando na origem, é uma rota de ida-e-volta
 * genuína — essa combinação não é tratada como no-op.
 */
export function semMovimento(a: EstadoArrasto): boolean {
  return a.waypoints.length === 0 && a.rota.length === 1;
}

/**
 * Converte a trilha (célula a célula, já adjacente — cada elemento é a
 * posição da ÂNCORA) pro formato `Rota` que o resto do pipeline
 * consome. Custo de cada PASSO é `custoDePassoPegada` sobre a pegada
 * projetada na posição de chegada — o MAIOR multiplicador entre as
 * células ocupadas, nunca a soma célula a célula (ver
 * `_dominio/movimento.ts`).
 */
export function rotaDoEstadoArrasto(a: EstadoArrasto, terreno: MapaTerreno, pegada: Pegada = PEGADA_UMA_CELULA): Rota {
  const hexes = rotaExibida(a);
  if (hexes.length <= 1) {
    return { pontos: hexes, segmentos: [], distanciaTotal: 0, custoTotal: 0, valida: true };
  }
  const de = hexes[0];
  const para = hexes[hexes.length - 1];
  const celulas = hexes.slice(1);
  const custoTotal = celulas.reduce((acc, ancora) => acc + custoDePassoPegada(terreno, projetarPegada(ancora, pegada)), 0);
  // `bloqueios`/`invalido` (regra consultiva): informam QUE a rota
  // atravessa terreno bloqueado — nunca decidem se ela pode ser
  // confirmada. `a.celulasBloqueadas` já reflete a trilha inteira.
  return {
    pontos: hexes,
    segmentos: [{ de, para, celulas, distancia: hexes.length - 1, custo: custoTotal, invalido: a.celulasBloqueadas.length > 0, bloqueios: a.celulasBloqueadas }],
    distanciaTotal: hexes.length - 1,
    custoTotal,
    valida: a.celulasBloqueadas.length === 0,
  };
}
