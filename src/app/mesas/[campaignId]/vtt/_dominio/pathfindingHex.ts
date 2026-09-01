/**
 * Pathfinding hexagonal — A* sobre a grade axial, função PURA.
 *
 * Usado como conector LOCAL: liga dois pontos próximos (a ponta de
 * `rotaConfirmada` e o cursor, ver `_dominio/arrastoToken.ts`) pelo
 * menor custo real, contornando bloqueio/ocupação automaticamente
 * quando existe passagem, e nunca inventando um desvio quando não
 * existe. NÃO tem noção de "corredor de intenção" nem penalidade
 * heurística — isso foi tentado e removido: um pathfinding GLOBAL
 * (origem→destino inteiro) com penalidade suave nunca produz rota
 * estável, porque não tem memória do que já foi decidido. A
 * estabilidade agora vem inteiramente do lado de fora desta função —
 * `arrastoToken.ts` só chama isto pra resolver a CAUDA CURTA entre a
 * ponta confirmada (imutável) e o cursor, nunca da origem.
 *
 * `hexLinha` continua apropriada — e INTOCADA — pra Medir (régua reta
 * de verdade, nunca contorna nada) e qualquer outro uso geométrico puro.
 *
 * Reusa as regras de custo/bloqueio já existentes (`custoDeEntrada`,
 * `estaBloqueada`, `dentroDoMapa`, de `movimento.ts`) — nada de regra
 * nova ou duplicada. `terreno` aqui é sempre o `MapaTerreno`
 * PERSISTIDO/funcional (o que `montarRota`/`custoDeEntrada` já
 * respeitam) — nunca a camada decorativa (`cena.terrenos`), que é só
 * visual e nunca bloqueia nem encarece movimento.
 *
 * Nada aqui toca DOM/React — testável sem browser
 * (`scripts/test-vtt-pathfinding.ts`).
 *
 * MOVIMENTO CONSULTIVO (regra nova, só pra deslocar um token JÁ
 * existente): terreno bloqueado deixou de ser uma exclusão
 * incondicional — vira ADVISÓRIO. Esta função continua, por padrão,
 * NUNCA cruzando bloqueio (`ignorarBloqueioTerreno` omitido/`false`):
 * a busca "prefira contornar quando existe passagem" continua
 * funcionando exatamente como sempre, sem mudança de comportamento.
 * Quem chama (`arrastoToken.ts`) é responsável pelo FALLBACK de duas
 * camadas: tenta esta função sem a flag primeiro (rota "limpa"); só se
 * `encontrado === false` tenta de novo COM `ignorarBloqueioTerreno:
 * true` (permite atravessar, nunca ignora limites do mapa nem colisão
 * com outro token). Limites e colisão nunca são relaxados por esta
 * flag — ela afeta só a exclusão por `pegadaBloqueada`.
 */

import { type Hex, hexDistancia, hexIguais, hexKey, hexVizinhos } from "../_mapa/hex";
import { CUSTO_NORMAL, type MapaTerreno, custoDePassoPegada, dentroDoMapa, estaBloqueada, pegadaBloqueada } from "./movimento";
import { type Pegada, pegadaPadrao, projetarPegada } from "./pegada";

const PEGADA_UMA_CELULA: Pegada = pegadaPadrao("medio");

export interface ResultadoCaminho {
  encontrado: boolean;
  /** Célula a célula, adjacentes — cada uma é a posição da ÂNCORA da pegada, não uma célula ocupada solta. Origem incluída, sem duplicata — vazio quando `encontrado` é `false`. */
  hexes: Hex[];
  custoTotal: number | null;
  /** Células de terreno BLOQUEADO de fato atravessadas pelo caminho encontrado — só populado quando `ignorarBloqueioTerreno` permitiu cruzá-las. Vazio no caminho normal (nunca cruza bloqueio pra começo de conversa). Base pro destaque visual — nunca decide sozinho se persiste (isso é autorização/servidor). */
  celulasBloqueadas: Hex[];
}

/** Uma varredura da rota EXIBIDA (célula a célula, âncoras) — quais células de terreno bloqueado a pegada projetada em cada passo de fato atravessa (a origem, índice 0, nunca conta: ninguém "entra" nela), MAIS quais passos individuais têm pelo menos uma célula da própria pegada tocando bloqueio. Uma varredura só, nunca duas — quem renderiza (`MapaHex.tsx`) lê os dois resultados prontos, nunca rechama `estaBloqueada` por conta própria (isso duplicaria a regra de domínio dentro do SVG). */
export interface BloqueiosNaRota {
  /** Células bloqueadas de fato atravessadas, deduplicadas — base do aviso textual. */
  celulas: Hex[];
  /** Paralelo a `hexes` — `passos[i]` é `true` quando a pegada projetada em `hexes[i]` toca alguma célula bloqueada. `passos[0]` é sempre `false` (a origem nunca conta). */
  passos: boolean[];
}
export function bloqueiosNaRota(hexes: Hex[], pegada: Pegada, terreno: MapaTerreno): BloqueiosNaRota {
  const vistas = new Set<string>();
  const celulas: Hex[] = [];
  const passos: boolean[] = hexes.map(() => false);
  for (let i = 1; i < hexes.length; i++) {
    let passoBloqueado = false;
    for (const c of projetarPegada(hexes[i], pegada)) {
      if (!estaBloqueada(terreno, c)) continue;
      passoBloqueado = true;
      const k = hexKey(c);
      if (vistas.has(k)) continue;
      vistas.add(k);
      celulas.push(c);
    }
    passos[i] = passoBloqueado;
  }
  return { celulas, passos };
}

interface ParametrosCaminho {
  origem: Hex;
  destino: Hex;
  /** Terreno FUNCIONAL/persistido — nunca a camada decorativa. */
  terreno: MapaTerreno;
  /** Hexes ocupados por OUTROS tokens — já a UNIÃO de todas as células de todas as pegadas alheias, nunca só âncoras (quem chama monta isso). Nunca inclui células do próprio token em movimento. */
  ocupados: ReadonlySet<string>;
  largura: number;
  altura: number;
  /** Pegada (offsets relativos à âncora) do token em movimento, na orientação ATUAL — a orientação não muda durante o deslocamento. Omitido = 1 célula (compatibilidade — Medir e chamadas que não têm um token real). */
  pegada?: Pegada;
  /**
   * Movimento consultivo (regra nova): quando `true`, terreno marcado
   * "bloqueado" deixa de EXCLUIR uma posição candidata — habilidades,
   * voo, teleporte ou decisão do narrador/jogador podem atravessar uma
   * restrição normal. Limites do mapa e colisão com OUTRO token (nunca
   * o destino final sobre a pegada de alguém) continuam excluindo
   * incondicionalmente — essa relaxação é só sobre bloqueio de
   * TERRENO. Omitido/`false` = comportamento de sempre (não atravessa).
   */
  ignorarBloqueioTerreno?: boolean;
}

/** Uma posição de âncora só é válida se a pegada INTEIRA projetada ali couber: dentro do mapa, sem sobrepor outro token — bloqueio de terreno só exclui quando `ignorarBloqueioTerreno` não está ativo (ver `ParametrosCaminho`). */
export function posicaoDaPegadaValida(ancora: Hex, pegada: Pegada, terreno: MapaTerreno, ocupados: ReadonlySet<string>, largura: number, altura: number, ignorarBloqueioTerreno: boolean): { valido: boolean; celulas: Hex[] } {
  const celulas = projetarPegada(ancora, pegada);
  if (!celulas.every((c) => dentroDoMapa(c, largura, altura))) return { valido: false, celulas };
  if (!ignorarBloqueioTerreno && pegadaBloqueada(terreno, celulas)) return { valido: false, celulas };
  if (celulas.some((c) => ocupados.has(hexKey(c)))) return { valido: false, celulas };
  return { valido: true, celulas };
}

interface NoAberto {
  hex: Hex;
  f: number;
  g: number;
  /** Contador de inserção — desempate final, determinístico, não depende de estabilidade de `Array.sort`. */
  ordem: number;
}

/**
 * A* de origem a destino sobre a grade hexagonal.
 *
 * Heurística ADMISSÍVEL: `hexDistancia(candidato, destino) *
 * CUSTO_NORMAL` — `CUSTO_NORMAL` é o MENOR custo possível de entrar
 * numa célula (terreno difícil só aumenta, nunca diminui), então a
 * heurística nunca superestima o custo restante.
 *
 * Desempate DETERMINÍSTICO (evita a rota "piscar" entre dois caminhos
 * de mesmo custo enquanto o cursor está parado no mesmo hex): entre
 * nós com o mesmo `f`, prioriza o de menor `h` (mais perto do destino
 * em linha reta — tende a produzir o caminho "mais direto" entre
 * empates); ainda empatado, prioriza por ORDEM DE INSERÇÃO, que por
 * sua vez segue a ordem FIXA de `hexVizinhos` (sempre a mesma
 * sequência de 6 direções) — o mesmo par origem/destino/terreno/
 * ocupados sempre produz exatamente o mesmo caminho.
 */
export function encontrarMenorCaminhoHex(params: ParametrosCaminho): ResultadoCaminho {
  const { origem, destino, terreno, ocupados, largura, altura, pegada = PEGADA_UMA_CELULA, ignorarBloqueioTerreno = false } = params;

  if (hexIguais(origem, destino)) {
    return { encontrado: true, hexes: [origem], custoTotal: 0, celulasBloqueadas: [] };
  }
  // Destino: a pegada INTEIRA precisa caber ali (dentro do mapa, sem
  // sobrepor outro token — bloqueio de terreno só exclui fora do modo
  // consultivo) — não só a âncora.
  if (!posicaoDaPegadaValida(destino, pegada, terreno, ocupados, largura, altura, ignorarBloqueioTerreno).valido) {
    return { encontrado: false, hexes: [], custoTotal: null, celulasBloqueadas: [] };
  }

  const origemKey = hexKey(origem);
  const gScore = new Map<string, number>([[origemKey, 0]]);
  const cameFrom = new Map<string, Hex>();
  const fechado = new Set<string>();
  const aberto: NoAberto[] = [{ hex: origem, f: hexDistancia(origem, destino) * CUSTO_NORMAL, g: 0, ordem: 0 }];
  let contador = 1;

  while (aberto.length > 0) {
    aberto.sort((a, b) => {
      if (a.f !== b.f) return a.f - b.f;
      const ha = hexDistancia(a.hex, destino);
      const hb = hexDistancia(b.hex, destino);
      if (ha !== hb) return ha - hb;
      return a.ordem - b.ordem;
    });
    const atual = aberto.shift()!;
    const atualKey = hexKey(atual.hex);
    if (fechado.has(atualKey)) continue; // pode ter entrado mais de uma vez no aberto com f pior — a mais recente (menor g) já venceu
    fechado.add(atualKey);

    if (hexIguais(atual.hex, destino)) {
      const hexes: Hex[] = [atual.hex];
      let cursor = atualKey;
      while (cameFrom.has(cursor)) {
        const anterior = cameFrom.get(cursor)!;
        hexes.unshift(anterior);
        cursor = hexKey(anterior);
      }
      return {
        encontrado: true, hexes, custoTotal: gScore.get(atualKey) ?? atual.g,
        celulasBloqueadas: ignorarBloqueioTerreno ? bloqueiosNaRota(hexes, pegada, terreno).celulas : [],
      };
    }

    // Ordem FIXA de `hexVizinhos` — parte do que garante determinismo.
    for (const viz of hexVizinhos(atual.hex)) {
      const vizKey = hexKey(viz);
      if (fechado.has(vizKey)) continue;
      // A pegada inteira precisa caber em CADA posição intermediária —
      // não basta validar origem e destino. Uma abertura menor que a
      // pegada nunca é atravessável, mesmo que a ÂNCORA sozinha coubesse.
      const posicao = posicaoDaPegadaValida(viz, pegada, terreno, ocupados, largura, altura, ignorarBloqueioTerreno);
      if (!posicao.valido) continue;

      const gTentativo = (gScore.get(atualKey) ?? Infinity) + custoDePassoPegada(terreno, posicao.celulas);
      const gExistente = gScore.get(vizKey);
      // Só atualiza em melhora ESTRITA — nunca em empate. É o que faz
      // o PRIMEIRO caminho descoberto (pela ordem determinística de
      // expansão) vencer empates de custo, em vez do último a
      // sobrescrever silenciosamente.
      if (gExistente === undefined || gTentativo < gExistente) {
        gScore.set(vizKey, gTentativo);
        cameFrom.set(vizKey, atual.hex);
        aberto.push({ hex: viz, f: gTentativo + hexDistancia(viz, destino) * CUSTO_NORMAL, g: gTentativo, ordem: contador++ });
      }
    }
  }

  return { encontrado: false, hexes: [], custoTotal: null, celulasBloqueadas: [] };
}
