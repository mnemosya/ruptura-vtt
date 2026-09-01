/**
 * Testes PUROS da animação de movimento de token — expansão de rota,
 * duração ponderada por terreno, easing e interpolação. Cobre os itens
 * 1-8 da validação obrigatória do pedido que testáveis sem browser:
 *
 *  1/2. movimento não salta — a posição em progresso intermediário
 *       nunca é a mesma da origem nem do destino (pra rota > 1 hex).
 *  3.   rota com curva segue os waypoints, não uma reta direta.
 *  4.   eventos rápidos de ponteiro (pontos não-adjacentes na entrada)
 *       são expandidos pra células adjacentes.
 *  5.   é a MESMA lista expandida usada pra animar e pro `p_rota` (aqui
 *       provado indiretamente: só existe UMA função de expansão,
 *       reusada — o teste de integração prova que é a mesma que sai
 *       pro servidor).
 *  6.   terreno difícil aumenta a duração visual do segmento.
 *  7.   a duração respeita os limites mínimo e máximo.
 *  8.   o token termina exatamente no centro do hex de destino.
 *
 * Sem browser, sem `requestAnimationFrame`: tudo aqui é função de
 * `agora`/`progresso` como parâmetro explícito — o mesmo princípio já
 * usado em `test-vtt-movimento.ts`.
 *
 * Uso: npx tsx scripts/test-vtt-animacao.ts
 */

import { type Hex, hexDistancia, hexKey, hexParaPixel } from "../src/app/mesas/[campaignId]/vtt/_mapa/hex";
import { type MapaTerreno, type TipoTerreno, expandirRota } from "../src/app/mesas/[campaignId]/vtt/_dominio/movimento";
import {
  DURACAO_MAXIMA, DURACAO_MINIMA, MS_POR_HEX, PESO_DIFICIL, PESO_NORMAL,
  calcularDuracao, interpolarMovimento, pesosDaRota, posicaoNaRota, progressoComEasing,
  type MovimentoVisualToken,
} from "../src/app/mesas/[campaignId]/vtt/_dominio/animacaoToken";

let passou = 0;
let falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

const h = (q: number, r: number): Hex => ({ q, r });
function terreno(pares: [Hex, TipoTerreno][]): MapaTerreno {
  return new Map(pares.map(([c, t]) => [hexKey(c), t]));
}
const VAZIO: MapaTerreno = new Map();
const TAM = 26;
const perto = (a: number, b: number, eps = 0.001) => Math.abs(a - b) < eps;

// ── expandirRota ─────────────────────────────────────────────────
{
  const r = expandirRota([h(0, 0), h(3, 0)]);
  ok("1 (expandirRota: reta simples cobre as 4 células, adjacentes)", r.length === 4 && hexKey(r[0]) === hexKey(h(0, 0)) && hexKey(r[3]) === hexKey(h(3, 0)), `${r.length} células: ${r.map(hexKey).join(" ")}`);
  const todasAdjacentes = r.every((c, i) => i === 0 || hexDistancia(r[i - 1], c) === 1);
  ok("2 (expandirRota: distância 1 entre todas as consecutivas)", todasAdjacentes, "adjacência confirmada segmento a segmento");
}
{
  // Simula um evento de ponteiro rápido: só 2 waypoints não-adjacentes
  // (distância 5) — o rastro bruto de pointermove pulou intermediárias.
  const bruto = [h(0, 0), h(5, 0)];
  ok("3 (waypoints brutos podem ser não-adjacentes — distância 5)", hexDistancia(bruto[0], bruto[1]) === 5, "confirma a premissa do teste");
  const expandida = expandirRota(bruto);
  const todasAdjacentes = expandida.every((c, i) => i === 0 || hexDistancia(expandida[i - 1], c) === 1);
  ok("4 (expandirRota fecha o salto: rota expandida vira contínua e adjacente)", expandida.length === 6 && todasAdjacentes, `${expandida.length} células, adjacente=${todasAdjacentes}`);
}
{
  // Rota com CURVA real: origem → ponto intermediário fora da linha reta → destino.
  const comCurva = expandirRota([h(0, 0), h(3, 0), h(3, 3)]);
  const naoAtravessaLinhaReta = !comCurva.some((c) => hexKey(c) === hexKey(h(1, 1)));
  // A reta direta (0,0)→(3,3) passaria por células centrais bem
  // diferentes da rota com curva (que vai reto até (3,0) e SÓ DEPOIS
  // desce) — confirma que a rota expandida segue os waypoints, não
  // interpola direto do primeiro ao último ponto.
  const passaPeloWaypoint = comCurva.some((c) => hexKey(c) === hexKey(h(3, 0)));
  ok("5 (rota com curva passa pelo waypoint intermediário, não é uma reta origem-destino)", passaPeloWaypoint && naoAtravessaLinhaReta, `passa por (3,0)=${passaPeloWaypoint}, evita atalho da reta direta=${naoAtravessaLinhaReta}`);
}
{
  const repetido = expandirRota([h(0, 0), h(0, 0), h(2, 0)]);
  ok("6 (ponto consecutivo repetido não gera célula duplicada)", repetido.length === 3, `${repetido.length} células: ${repetido.map(hexKey).join(" ")}`);
}
{
  const vazia = expandirRota([]);
  const unica = expandirRota([h(1, 1)]);
  ok("7 (rota vazia/de um ponto só não quebra)", vazia.length === 0 && unica.length === 1, `vazia=${vazia.length}, única=${unica.length}`);
}

// ── pesosDaRota / calcularDuracao ────────────────────────────────
{
  const rota = expandirRota([h(0, 0), h(3, 0)]);
  const pesos = pesosDaRota(rota, VAZIO);
  ok("8 (terreno normal: todos os pesos são PESO_NORMAL)", pesos.length === 3 && pesos.every((p) => p === PESO_NORMAL), `${JSON.stringify(pesos)}`);
}
{
  const rota = expandirRota([h(0, 0), h(3, 0)]);
  const t = terreno([[h(2, 0), "dificil"]]);
  const pesos = pesosDaRota(rota, t);
  // Célula (2,0) é a TERCEIRA da rota — a segunda ENTRADA (índice 1 dos pesos).
  ok("9 (terreno difícil pesa PESO_DIFICIL só no segmento que entra nele)", pesos[0] === PESO_NORMAL && pesos[1] === PESO_DIFICIL && pesos[2] === PESO_NORMAL, `${JSON.stringify(pesos)}`);
}
{
  // Exemplos aproximados do pedido: 1 hex ~140ms, 3 hexes ~330ms, 6 hexes ~660ms.
  const d1 = calcularDuracao(pesosDaRota(expandirRota([h(0, 0), h(1, 0)]), VAZIO));
  const d3 = calcularDuracao(pesosDaRota(expandirRota([h(0, 0), h(3, 0)]), VAZIO));
  const d6 = calcularDuracao(pesosDaRota(expandirRota([h(0, 0), h(6, 0)]), VAZIO));
  ok("10 (1 hex: duração no mínimo, ~140ms)", d1 === DURACAO_MINIMA, `${d1}ms (MS_POR_HEX×1=${MS_POR_HEX} < mínimo ${DURACAO_MINIMA})`);
  ok("11 (3 hexes: ~330ms)", perto(d3, 3 * MS_POR_HEX, 1), `${d3}ms (esperado ${3 * MS_POR_HEX}ms)`);
  ok("12 (6 hexes: ~660ms)", perto(d6, 6 * MS_POR_HEX, 1), `${d6}ms (esperado ${6 * MS_POR_HEX}ms)`);
}
{
  // Rota longa o bastante pra estourar DURACAO_MAXIMA sem o clamp.
  const longa = expandirRota([h(0, 0), h(20, 0)]);
  const d = calcularDuracao(pesosDaRota(longa, VAZIO));
  ok("13 (duração respeita o teto DURACAO_MAXIMA)", d === DURACAO_MAXIMA, `${d}ms pra 20 hexes (bruto seria ${20 * MS_POR_HEX}ms)`);
}
{
  // Mesma rota, mas inteira em terreno difícil — duração maior que a normal, sem dobrar.
  const rota = expandirRota([h(0, 0), h(3, 0)]);
  const tDificil = terreno([[h(1, 0), "dificil"], [h(2, 0), "dificil"], [h(3, 0), "dificil"]]);
  const dNormal = calcularDuracao(pesosDaRota(rota, VAZIO));
  const dDificil = calcularDuracao(pesosDaRota(rota, tDificil));
  ok(
    "14 (terreno difícil aumenta a duração visual, sem dobrar integralmente)",
    dDificil > dNormal && dDificil < dNormal * 2,
    `normal=${dNormal}ms, difícil=${dDificil}ms (esperado entre ${dNormal}ms e ${dNormal * 2}ms)`,
  );
}

// ── progressoComEasing ────────────────────────────────────────────
{
  const linear = progressoComEasing(0.5);
  ok("15 (antes do limiar de easing, progresso é linear)", linear === 0.5, `${linear}`);
  const zero = progressoComEasing(0);
  const um = progressoComEasing(1);
  ok("16 (progresso 0→0 e 1→1, sem overshoot)", zero === 0 && um === 1, `0→${zero}, 1→${um}`);
  const noLimiar = progressoComEasing(0.9);
  ok("17 (depois do limiar, ainda monotônico e <1)", noLimiar > 0.85 && noLimiar < 1, `${noLimiar}`);
}

// ── posicaoNaRota / interpolarMovimento ──────────────────────────
{
  const rota = expandirRota([h(0, 0), h(4, 0)]);
  const pesos = pesosDaRota(rota, VAZIO);
  const pOrigem = hexParaPixel(rota[0], TAM);
  const pDestino = hexParaPixel(rota[rota.length - 1], TAM);
  const posInicio = posicaoNaRota(rota, pesos, 0, TAM);
  const posFim = posicaoNaRota(rota, pesos, 1, TAM);
  ok("18 (progresso 0 = centro exato da origem)", perto(posInicio.x, pOrigem.x) && perto(posInicio.y, pOrigem.y), `(${posInicio.x},${posInicio.y}) vs origem (${pOrigem.x},${pOrigem.y})`);
  ok("19 (progresso 1 = centro exato do destino — item 8 da validação)", perto(posFim.x, pDestino.x) && perto(posFim.y, pDestino.y), `(${posFim.x},${posFim.y}) vs destino (${pDestino.x},${pDestino.y})`);

  const posMeio = posicaoNaRota(rota, pesos, 0.5, TAM);
  const distDaOrigem = Math.hypot(posMeio.x - pOrigem.x, posMeio.y - pOrigem.y);
  const distDoDestino = Math.hypot(posMeio.x - pDestino.x, posMeio.y - pDestino.y);
  ok(
    "20 (movimento não salta: posição em progresso intermediário não é a origem nem o destino)",
    distDaOrigem > 1 && distDoDestino > 1,
    `distância da origem=${distDaOrigem.toFixed(1)}px, do destino=${distDoDestino.toFixed(1)}px`,
  );
}
{
  // Rota com curva: em progresso intermediário, a posição precisa estar
  // PERTO do waypoint real, não da reta direta origem→destino (que
  // cortaria caminho por dentro da curva).
  const rota = expandirRota([h(0, 0), h(4, 0), h(4, 4)]);
  const pesos = pesosDaRota(rota, VAZIO);
  const pWaypoint = hexParaPixel(h(4, 0), TAM);
  // Progresso proporcional a onde o waypoint cai na rota (4 de 8 hexes = 0.5).
  const posNoWaypoint = posicaoNaRota(rota, pesos, 0.5, TAM);
  const pOrigem = hexParaPixel(h(0, 0), TAM);
  const pDestino = hexParaPixel(h(4, 4), TAM);
  const distDaRetaDireta = distanciaPontoReta(posNoWaypoint, pOrigem, pDestino);
  ok(
    "21 (rota com curva: posição no meio do percurso segue o waypoint, não a reta direta origem-destino)",
    distDaRetaDireta > TAM,
    `posição a ${distDaRetaDireta.toFixed(1)}px da reta direta (esperado > ${TAM}px, um hex inteiro de desvio)`,
  );
}
{
  const rota = expandirRota([h(0, 0), h(1, 0)]);
  const pesos = pesosDaRota(rota, VAZIO);
  const mov: MovimentoVisualToken = { movementId: "m1", tokenId: "t1", rota, pesos, inicio: 1000, duracao: 200, origem: rota[0], destino: rota[1] };
  const meio = interpolarMovimento(mov, 1100, TAM);
  const fim = interpolarMovimento(mov, 1200, TAM);
  const depoisDoFim = interpolarMovimento(mov, 5000, TAM);
  ok("22 (interpolarMovimento: concluido=false no meio, true ao fim)", !meio.concluido && fim.concluido, `meio.concluido=${meio.concluido}, fim.concluido=${fim.concluido}`);
  const pDestino = hexParaPixel(rota[1], TAM);
  ok("23 (interpolarMovimento: nunca ultrapassa o destino, mesmo bem depois do fim)", perto(depoisDoFim.x, pDestino.x) && perto(depoisDoFim.y, pDestino.y), `(${depoisDoFim.x},${depoisDoFim.y}) vs destino (${pDestino.x},${pDestino.y})`);
}
{
  // Rota de comprimento 1 (origem === destino) — caso de borda defensivo, nunca deveria ser chamado por quem inicia uma animação de verdade.
  const unica = [h(2, 2)];
  const pos = posicaoNaRota(unica, [], 0.5, TAM);
  const pCentro = hexParaPixel(h(2, 2), TAM);
  ok("24 (rota de 1 célula não quebra — devolve o próprio centro)", perto(pos.x, pCentro.x) && perto(pos.y, pCentro.y), `(${pos.x},${pos.y})`);
}

function distanciaPontoReta(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const comprimento2 = dx * dx + dy * dy;
  if (comprimento2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / comprimento2));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
if (falhou > 0) process.exit(1);
