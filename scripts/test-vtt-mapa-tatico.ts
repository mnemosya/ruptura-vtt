/**
 * Testes PUROS do mapa TÁTICO EFETIVO do VTT.
 *
 * O que se prova aqui é a PRECEDÊNCIA entre as fontes que produzem
 * mecânica numa célula (terreno pintado × objetos da cena) e, sobretudo,
 * que o movimento continua enxergando o mesmo `MapaTerreno` de sempre —
 * é isso que permite objetos entrarem sem reescrever nenhuma função de
 * movimento ou pathfinding.
 *
 * Regra alvo (`docs/prd/PLANO_IMPLEMENTACAO_TERRENO_OBJETOS_TATICOS.md`,
 * decisão D3):
 *   1. objeto que bloqueia  → bloqueado
 *   2. senão pintado bloqueado → bloqueado
 *   3. senão qualquer difícil  → difícil
 *   4. senão                   → custo normal
 *
 * Sem browser e sem banco: se um destes quebra, é regra, não interface.
 *
 * Uso: npx tsx scripts/test-vtt-mapa-tatico.ts
 */

import { type Hex, hexKey } from "../src/app/mesas/[campaignId]/vtt/_mapa/hex";
import {
  type MapaTerreno,
  type TipoTerreno,
  CUSTO_DIFICIL,
  CUSTO_NORMAL,
  custoDeEntrada,
  estaBloqueada,
  pegadaBloqueada,
} from "../src/app/mesas/[campaignId]/vtt/_dominio/movimento";
import {
  type ObjetoTatico,
  MAPA_TATICO_VAZIO,
  montarMapaTatico,
  objetosEm,
} from "../src/app/mesas/[campaignId]/vtt/_dominio/mapaTatico";

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

function obj(id: string, celulas: Hex[], bloqueia: boolean, dificil = false): ObjetoTatico {
  return { id, celulas, bloqueiaMovimento: bloqueia, terrenoProjetado: dificil ? "dificil" : null };
}

// ── Sem objetos: identidade e ausência de cópia ───────────────────
{
  const pintado = terreno([[h(1, 1), "dificil"], [h(2, 2), "bloqueado"]]);
  const m = montarMapaTatico({ terrenoPintado: pintado });
  ok("1 (sem objetos, o terreno efetivo é o PRÓPRIO mapa pintado, por referência)",
    m.terrenoEfetivo === pintado, "mesma referência");
  ok("2 (sem objetos, nenhuma célula reporta objeto)", objetosEm(m, h(1, 1)).length === 0, "0");
  const vazio = montarMapaTatico({ terrenoPintado: VAZIO, objetos: [] });
  ok("3 (lista de objetos vazia equivale a não passar objetos)", vazio.terrenoEfetivo === VAZIO, "mesma referência");
  ok("4 (MAPA_TATICO_VAZIO não tem terreno nem objetos)",
    MAPA_TATICO_VAZIO.terrenoEfetivo.size === 0 && MAPA_TATICO_VAZIO.objetosPorCelula.size === 0, "0/0");
}

// ── Objeto que bloqueia ───────────────────────────────────────────
{
  const m = montarMapaTatico({ terrenoPintado: VAZIO, objetos: [obj("muro", [h(3, 0), h(4, 0)], true)] });
  ok("5 (objeto bloqueador projeta bloqueio em TODAS as células que ocupa)",
    estaBloqueada(m.terrenoEfetivo, h(3, 0)) && estaBloqueada(m.terrenoEfetivo, h(4, 0)), "2 células");
  ok("6 (célula vizinha não ocupada continua livre)", !estaBloqueada(m.terrenoEfetivo, h(5, 0)), "livre");
  ok("7 (o mapa pintado original NÃO é mutado)", VAZIO.size === 0, `size=${VAZIO.size}`);
  ok("8 (proveniência: a célula sabe qual objeto a ocupa)",
    objetosEm(m, h(3, 0)).join() === "muro", objetosEm(m, h(3, 0)).join());
}

// ── Objeto que só encarece (entulho) ──────────────────────────────
{
  const m = montarMapaTatico({ terrenoPintado: VAZIO, objetos: [obj("entulho", [h(1, 0)], false, true)] });
  ok("9 (entulho NÃO bloqueia)", !estaBloqueada(m.terrenoEfetivo, h(1, 0)), "passável");
  ok("10 (entulho custa o dobro para entrar)", custoDeEntrada(m.terrenoEfetivo, h(1, 0)) === CUSTO_DIFICIL, "2");
  const semNada = montarMapaTatico({ terrenoPintado: VAZIO, objetos: [obj("banco", [h(9, 9)], false)] });
  ok("11 (objeto que não bloqueia nem encarece deixa o custo normal)",
    custoDeEntrada(semNada.terrenoEfetivo, h(9, 9)) === CUSTO_NORMAL, "1");
}

// ── Precedência entre fontes ──────────────────────────────────────
{
  const pintadoDificil = terreno([[h(0, 0), "dificil"]]);
  const m = montarMapaTatico({ terrenoPintado: pintadoDificil, objetos: [obj("carro", [h(0, 0)], true)] });
  ok("12 (objeto bloqueador VENCE terreno difícil pintado)",
    estaBloqueada(m.terrenoEfetivo, h(0, 0)), "bloqueado");

  const pintadoBloqueado = terreno([[h(0, 0), "bloqueado"]]);
  const m2 = montarMapaTatico({ terrenoPintado: pintadoBloqueado, objetos: [obj("entulho", [h(0, 0)], false, true)] });
  ok("13 (entulho NÃO rebaixa um bloqueio pintado)",
    estaBloqueada(m2.terrenoEfetivo, h(0, 0)), "segue bloqueado");

  const m3 = montarMapaTatico({
    terrenoPintado: VAZIO,
    objetos: [obj("entulho", [h(0, 0)], false, true), obj("muro", [h(0, 0)], true)],
  });
  ok("14 (bloqueio vence difícil mesmo vindo DEPOIS na lista)", estaBloqueada(m3.terrenoEfetivo, h(0, 0)), "bloqueado");

  const m4 = montarMapaTatico({
    terrenoPintado: VAZIO,
    objetos: [obj("muro", [h(0, 0)], true), obj("entulho", [h(0, 0)], false, true)],
  });
  ok("15 (…e também vindo ANTES — a ordem da lista não altera o resultado)",
    estaBloqueada(m4.terrenoEfetivo, h(0, 0)), "bloqueado");
}

// ── Sobreposição de objetos na mesma célula ───────────────────────
{
  const m = montarMapaTatico({
    terrenoPintado: VAZIO,
    objetos: [obj("a", [h(2, 2)], false), obj("b", [h(2, 2)], false)],
  });
  ok("16 (dois objetos na mesma célula aparecem os dois na proveniência)",
    objetosEm(m, h(2, 2)).slice().sort().join() === "a,b", objetosEm(m, h(2, 2)).join());
}

// ── Continuidade com o movimento já existente ─────────────────────
{
  // O ponto central da fase: pegada multicélula não sabe que existe
  // objeto — ela só consulta o terreno efetivo, como sempre fez.
  const m = montarMapaTatico({ terrenoPintado: VAZIO, objetos: [obj("coluna", [h(5, 5)], true)] });
  const pegadaGrande = [h(4, 5), h(5, 5), h(4, 6)];
  ok("17 (pegada multicélula é invalidada por bloqueio vindo de OBJETO, sem mudança em pegadaBloqueada)",
    pegadaBloqueada(m.terrenoEfetivo, pegadaGrande), "bloqueada");
  const longe = [h(0, 0), h(1, 0), h(0, 1)];
  ok("18 (pegada longe do objeto continua válida)", !pegadaBloqueada(m.terrenoEfetivo, longe), "livre");
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
if (falhou > 0) process.exit(1);
