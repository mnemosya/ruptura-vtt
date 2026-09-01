/**
 * Movimento e medição sobre a grade — funções PURAS.
 *
 * Fonte das regras: `docs/fontes/16 COMBATE`.
 *   • "O combate acontece sobre um mapa de células hexagonais, onde
 *     cada célula equivale a 1 metro." → distância é contagem de
 *     células, nunca pixel.
 *   • TERRENO DIFÍCIL: "cada deslocamento custa o dobro da distância
 *     percorrida" → entrar numa célula difícil custa 2 em vez de 1.
 *   • Célula bloqueada — REGRA CONSULTIVA pro movimento de um token JÁ
 *     existente pelo mapa (a única operação relaxada; criação/
 *     posicionamento/redimensionamento/rotação/pegada/pintura de
 *     terreno continuam tratando bloqueio como exclusão de verdade,
 *     ver `pegadaBloqueada` e seus chamadores fora deste módulo):
 *     `pegadaBloqueada`/`estaBloqueada` continuam identificando o
 *     bloqueio pro destaque visual, mas NENHUMA função aqui usa isso
 *     pra IMPEDIR nada — quem decide impedir ou não é quem CHAMA
 *     (pathfinding com fallback consultivo, servidor sem essa
 *     exclusão pro movimento). Habilidades, voo, teleporte e decisão
 *     do narrador/jogador podem ignorar a restrição normal.
 *
 * DISTÂNCIA ≠ CUSTO, e a interface precisa mostrar os dois separados:
 * uma rota de 4 células por terreno difícil tem 4 m de distância e 8 de
 * custo. Confundir os dois é o erro clássico de VTT genérico, onde só
 * existe "distância".
 *
 * Nada aqui toca banco, React ou DOM — é o que permite testar as regras
 * sem browser (`scripts/test-vtt-movimento.ts`).
 */

import { type Hex, hexDistancia, hexIguais, hexKey, hexLinha } from "../_mapa/hex";

export type TipoTerreno = "dificil" | "bloqueado";

/** Mapa de terreno indexado por `hexKey` — o formato que o cliente carrega. */
export type MapaTerreno = ReadonlyMap<string, TipoTerreno>;

export const CUSTO_NORMAL = 1;
/** Terreno difícil dobra o custo (`16 COMBATE` → TERRENO). */
export const CUSTO_DIFICIL = 2;

export function terrenoEm(terreno: MapaTerreno, h: Hex): TipoTerreno | null {
  return terreno.get(hexKey(h)) ?? null;
}

export function estaBloqueada(terreno: MapaTerreno, h: Hex): boolean {
  return terrenoEm(terreno, h) === "bloqueado";
}

/**
 * Custo de ENTRAR numa célula. A célula de origem não custa nada —
 * quem já está nela não "entra" nela.
 *
 * Regra EXPLÍCITA e documentada (pedido: nunca `Infinity`/`NaN`,
 * nunca deixar implícito) pra célula bloqueada atravessada sob a
 * regra consultiva do movimento: custa `CUSTO_NORMAL`, igual a uma
 * célula comum — bloqueio não é "difícil" nem "impossível" em
 * deslocamento, é uma restrição normal que uma decisão consciente
 * escolheu ignorar; o aviso visual (nunca o número) é o que comunica
 * que a célula era normalmente proibida.
 */
export function custoDeEntrada(terreno: MapaTerreno, h: Hex): number {
  const tipo = terrenoEm(terreno, h);
  if (tipo === "dificil") return CUSTO_DIFICIL;
  if (tipo === "bloqueado") return CUSTO_NORMAL;
  return CUSTO_NORMAL;
}

/** `true` se QUALQUER célula do conjunto (a pegada projetada numa posição candidata) está bloqueada. */
export function pegadaBloqueada(terreno: MapaTerreno, celulas: readonly Hex[]): boolean {
  return celulas.some((c) => estaBloqueada(terreno, c));
}

/**
 * Custo de um PASSO pra um token multicelular: o MAIOR multiplicador
 * entre as células que a pegada passa a ocupar na posição nova — nunca
 * a soma de cada célula. Um token Grande com 1 das 3 células em
 * terreno difícil paga o dobro do passo inteiro (como se ele todo
 * estivesse pisando em terreno ruim), não 1.33× nem 2×3 — é UM passo,
 * UM custo, decidido pela pior célula que ele precisa ocupar.
 */
export function custoDePassoPegada(terreno: MapaTerreno, celulasOcupadasNaPosicaoNova: readonly Hex[]): number {
  let maior = CUSTO_NORMAL;
  for (const c of celulasOcupadasNaPosicaoNova) {
    const custo = custoDeEntrada(terreno, c);
    if (custo > maior) maior = custo;
  }
  return maior;
}

export interface SegmentoRota {
  de: Hex;
  para: Hex;
  /** Células atravessadas, SEM a de origem (são as que se "entra"). */
  celulas: Hex[];
  /** Distância geométrica do segmento, em metros/células. */
  distancia: number;
  /** Custo de deslocamento do segmento, já com terreno difícil. */
  custo: number;
  /** Alguma célula do segmento é bloqueada. */
  invalido: boolean;
  /** As células bloqueadas encontradas — a interface destaca elas. */
  bloqueios: Hex[];
}

export interface Rota {
  /** Pontos escolhidos pelo usuário: origem + intermediários + destino. */
  pontos: Hex[];
  segmentos: SegmentoRota[];
  /** Soma das distâncias — em metros (= células). */
  distanciaTotal: number;
  /** Soma dos custos — o que de fato consome deslocamento. */
  custoTotal: number;
  /** Qualquer segmento inválido invalida a rota inteira. */
  valida: boolean;
}

/**
 * Monta a rota a partir dos pontos escolhidos pelo usuário.
 *
 * NÃO faz pathfinding: cada par consecutivo de pontos vira uma reta
 * (`hexLinha`). Se essa reta atravessa terreno bloqueado, o segmento é
 * marcado inválido e a interface impede a confirmação — o usuário
 * resolve adicionando um ponto intermediário, que é justamente o
 * controle que o pedido quer nas mãos dele. Calcular um desvio
 * automático aqui tiraria essa decisão do jogador (e é explicitamente
 * fora de escopo nesta fase).
 */
export function montarRota(pontos: Hex[], terreno: MapaTerreno): Rota {
  const segmentos: SegmentoRota[] = [];

  for (let i = 0; i < pontos.length - 1; i++) {
    const de = pontos[i];
    const para = pontos[i + 1];
    // `hexLinha` inclui a origem; ela não conta como entrada.
    const celulas = hexLinha(de, para).filter((c) => !hexIguais(c, de));
    const bloqueios = celulas.filter((c) => estaBloqueada(terreno, c));
    const custo = celulas.reduce((acc, c) => acc + custoDeEntrada(terreno, c), 0);

    segmentos.push({
      de,
      para,
      celulas,
      distancia: hexDistancia(de, para),
      custo,
      invalido: bloqueios.length > 0,
      bloqueios,
    });
  }

  return {
    pontos,
    segmentos,
    distanciaTotal: segmentos.reduce((a, s) => a + s.distancia, 0),
    custoTotal: segmentos.reduce((a, s) => a + s.custo, 0),
    valida: segmentos.length > 0 && segmentos.every((s) => !s.invalido),
  };
}

/**
 * Expande os pontos escolhidos pelo usuário (origem + waypoints) numa
 * lista CONTÍNUA de células adjacentes, célula a célula — origem
 * incluída, nada pulado. Existe porque `rota.pontos` (o rastro bruto
 * de `pointermove`) não tem garantia de continuidade: um evento de
 * ponteiro rápido pode saltar de uma célula pra outra não-vizinha
 * entre duas amostras. A migration 0069 endureceu `move_vtt_token` pra
 * exigir adjacência hexagonal exata entre células consecutivas da rota
 * enviada — sem esta expansão, um arrasto rápido o bastante já
 * produzia rota rejeitada pelo servidor.
 *
 * Diferente de `celulasDaRota` (que deduplica GLOBALMENTE, pensada pra
 * destacar "que células a rota toca" sem repetir o realce): aqui a
 * deduplicação é só CONSECUTIVA. Uma rota que volta sobre uma célula já
 * visitada precisa continuar aparecendo aqui — removê-la quebraria a
 * garantia de distância 1 entre vizinhos na lista.
 *
 * É esta mesma lista, sem modificação nenhuma, que alimenta tanto a
 * animação visual do token quanto o `p_rota` mandado a `move_vtt_token`
 * — uma única rota expandida para os dois usos, nunca duas divergentes.
 */
export function expandirRota(pontos: Hex[]): Hex[] {
  if (pontos.length === 0) return [];
  const out: Hex[] = [pontos[0]];
  for (let i = 0; i < pontos.length - 1; i++) {
    const segmento = hexLinha(pontos[i], pontos[i + 1]);
    // `hexLinha` inclui as duas pontas; a primeira já é o último
    // elemento de `out` (a junção com o segmento anterior) — pula ela
    // pra não duplicar.
    for (let j = 1; j < segmento.length; j++) {
      if (!hexIguais(out[out.length - 1], segmento[j])) out.push(segmento[j]);
    }
  }
  return out;
}

/** Todas as células percorridas pela rota, sem repetição — para o realce. */
export function celulasDaRota(rota: Rota): Hex[] {
  const vistas = new Set<string>();
  const out: Hex[] = [];
  for (const s of rota.segmentos) {
    for (const c of s.celulas) {
      const k = hexKey(c);
      if (!vistas.has(k)) { vistas.add(k); out.push(c); }
    }
  }
  return out;
}

export type MotivoMovimentoInvalido =
  | { tipo: "sem_rota"; texto: string }
  | { tipo: "bloqueado"; texto: string; celulas: Hex[] }
  | { tipo: "token_travado"; texto: string }
  | { tipo: "sem_permissao"; texto: string }
  | { tipo: "fora_do_mapa"; texto: string };

export interface ValidacaoMovimento {
  ok: boolean;
  motivo?: MotivoMovimentoInvalido;
  rota: Rota;
}

export interface ContextoMovimento {
  terreno: MapaTerreno;
  largura: number;
  altura: number;
  tokenBloqueado: boolean;
  /** Já resolvido por quem chama — o servidor revalida, isto é só a UI. */
  podeMover: boolean;
}

/** A célula existe dentro da grade da cena? */
export function dentroDoMapa(h: Hex, largura: number, altura: number): boolean {
  if (h.r < 0 || h.r >= altura) return false;
  const qMin = -Math.floor(h.r / 2);
  return h.q >= qMin && h.q < qMin + largura;
}

/**
 * Valida um movimento completo. A ordem das checagens é a ordem em que
 * elas importam pro usuário: primeiro o que ele não pode mudar
 * (permissão, token travado), depois o que ele pode corrigir mexendo na
 * rota (fora do mapa, bloqueio).
 */
export function validarMovimento(pontos: Hex[], ctx: ContextoMovimento): ValidacaoMovimento {
  const rota = montarRota(pontos, ctx.terreno);

  if (!ctx.podeMover) {
    return { ok: false, rota, motivo: { tipo: "sem_permissao", texto: "Você não controla este token." } };
  }
  if (ctx.tokenBloqueado) {
    return { ok: false, rota, motivo: { tipo: "token_travado", texto: "Token travado. Destrave para mover." } };
  }
  if (pontos.length < 2) {
    return { ok: false, rota, motivo: { tipo: "sem_rota", texto: "Defina um destino." } };
  }

  const fora = pontos.filter((p) => !dentroDoMapa(p, ctx.largura, ctx.altura));
  if (fora.length > 0) {
    return { ok: false, rota, motivo: { tipo: "fora_do_mapa", texto: "A rota sai dos limites da cena." } };
  }

  const bloqueios = rota.segmentos.flatMap((s) => s.bloqueios);
  if (bloqueios.length > 0) {
    return {
      ok: false,
      rota,
      motivo: {
        tipo: "bloqueado",
        texto: `A rota atravessa ${bloqueios.length} célula(s) bloqueada(s).`,
        celulas: bloqueios,
      },
    };
  }

  return { ok: true, rota };
}

/**
 * Medição pura: mesma matemática do movimento, sem as checagens de
 * permissão/travamento. Reusar `montarRota` aqui é o que garante que a
 * régua e o movimento NUNCA divergem — o bug clássico de medir 4 m e o
 * movimento cobrar 8 sem explicar.
 */
export interface Medicao {
  rota: Rota;
  /** Distância geométrica, em metros. */
  metros: number;
  /** Custo de deslocamento, com terreno difícil. */
  custo: number;
  /** Cabe no deslocamento do token? `null` quando não há token de referência. */
  cabeNoDeslocamento: boolean | null;
  atravessaBloqueio: boolean;
}

export function medir(pontos: Hex[], terreno: MapaTerreno, deslocamentoDisponivel?: number): Medicao {
  const rota = montarRota(pontos, terreno);
  return {
    rota,
    metros: rota.distanciaTotal,
    custo: rota.custoTotal,
    cabeNoDeslocamento: deslocamentoDisponivel === undefined ? null : rota.custoTotal <= deslocamentoDisponivel,
    atravessaBloqueio: rota.segmentos.some((s) => s.invalido),
  };
}

/**
 * Células alcançáveis com um orçamento de deslocamento, respeitando
 * custo de terreno e bloqueios — usado na prévia de deslocamento do
 * token selecionado.
 *
 * É uma busca por custo (Dijkstra simples sobre 6 vizinhos). Não é
 * pathfinding para o MOVIMENTO — a rota continua sendo do usuário;
 * isto só pinta "até onde dá pra ir".
 */
export function alcancaveis(origem: Hex, orcamento: number, terreno: MapaTerreno, largura: number, altura: number): Hex[] {
  const custoAte = new Map<string, number>([[hexKey(origem), 0]]);
  const fila: Hex[] = [origem];
  const out: Hex[] = [];

  while (fila.length > 0) {
    // Fila simples com extração do menor custo: o orçamento é pequeno
    // (deslocamento humano em metros), então uma heap não se paga.
    fila.sort((a, b) => (custoAte.get(hexKey(a)) ?? 0) - (custoAte.get(hexKey(b)) ?? 0));
    const atual = fila.shift()!;
    const custoAtual = custoAte.get(hexKey(atual)) ?? 0;

    for (const viz of vizinhosValidos(atual, largura, altura)) {
      if (estaBloqueada(terreno, viz)) continue;
      const novo = custoAtual + custoDeEntrada(terreno, viz);
      if (novo > orcamento) continue;
      const k = hexKey(viz);
      if (custoAte.has(k) && (custoAte.get(k) ?? 0) <= novo) continue;
      custoAte.set(k, novo);
      fila.push(viz);
      if (!out.some((o) => hexIguais(o, viz))) out.push(viz);
    }
  }
  return out;
}

function vizinhosValidos(h: Hex, largura: number, altura: number): Hex[] {
  const dirs: Hex[] = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
  ];
  return dirs
    .map((d) => ({ q: h.q + d.q, r: h.r + d.r }))
    .filter((v) => dentroDoMapa(v, largura, altura));
}

/**
 * Região de células CONTÍGUAS a partir de `inicio` que compartilham o
 * MESMO valor de terreno PINTADO (`null` = normal conta como valor
 * também) — a base do balde de tinta do pincel de Terreno: preenche até
 * topar com uma borda de valor diferente ou com o limite do mapa.
 *
 * BFS simples sobre `vizinhosValidos` (já filtra fora-do-mapa). Sem
 * teto artificial de células: o tamanho da região é sempre ≤
 * `largura × altura`, e esse teto já foi escolhido pelo narrador ao
 * definir o tamanho da cena — impor outro aqui seria uma trava sem
 * fonte na regra.
 */
export function regiaoContiguaDeTerreno(
  inicio: Hex,
  terreno: MapaTerreno,
  largura: number,
  altura: number,
): Hex[] {
  const alvo = terrenoEm(terreno, inicio);
  const visitados = new Set<string>([hexKey(inicio)]);
  const fila: Hex[] = [inicio];
  const resultado: Hex[] = [inicio];
  while (fila.length > 0) {
    const atual = fila.pop()!;
    for (const viz of vizinhosValidos(atual, largura, altura)) {
      const k = hexKey(viz);
      if (visitados.has(k)) continue;
      if (terrenoEm(terreno, viz) !== alvo) continue;
      visitados.add(k);
      fila.push(viz);
      resultado.push(viz);
    }
  }
  return resultado;
}
