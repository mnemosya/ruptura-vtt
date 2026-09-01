/**
 * Testes PUROS da rota de movimento por RASTRO DO CURSOR —
 * `_dominio/arrastoToken.ts`.
 *
 * A garantia central: a rota é exatamente por onde o ponteiro passou.
 * Nada de pathfinding, nada de reotimização — o que muda a trilha é o
 * gesto, e só o gesto. Voltar por cima do caminho corta o excedente
 * (sem laço, sem custo dobrado); posições ilegais param a trilha em
 * vez de desviar por conta própria.
 *
 * Uso: npx tsx scripts/test-vtt-arrasto-token.ts
 */

import { type Hex, hexDistancia, hexIguais, hexKey } from "../src/app/mesas/[campaignId]/vtt/_mapa/hex";
import { type MapaTerreno, type TipoTerreno, custoDeEntrada } from "../src/app/mesas/[campaignId]/vtt/_dominio/movimento";
import { pegadaPadrao } from "../src/app/mesas/[campaignId]/vtt/_dominio/pegada";
import {
  type ContextoArrasto, type EstadoArrasto,
  adicionarWaypoint, iniciarArrastoToken, moverDestino, posicaoVisual,
  removerUltimoWaypoint, rotaDoEstadoArrasto, rotaExibida, semMovimento,
} from "../src/app/mesas/[campaignId]/vtt/_dominio/arrastoToken";

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
const L = 30, A = 30;

function ctx(terrenoT: MapaTerreno = VAZIO, ocupados: ReadonlySet<string> = new Set()): ContextoArrasto {
  return { terreno: terrenoT, ocupados, largura: L, altura: A };
}
function arrastar(origem: Hex, sequencia: Hex[], c: ContextoArrasto = ctx()): EstadoArrasto {
  let a = iniciarArrastoToken("t1", origem);
  for (const hex of sequencia) a = moverDestino(a, hex, c);
  return a;
}
function caminho(hexes: readonly Hex[]): string {
  return hexes.map((c) => `${c.q},${c.r}`).join(" ");
}
/** Toda trilha válida é adjacente passo a passo — nunca um salto. */
function adjacentePassoAPasso(hexes: readonly Hex[]): boolean {
  for (let i = 1; i < hexes.length; i++) if (hexDistancia(hexes[i - 1], hexes[i]) !== 1) return false;
  return true;
}
function temRepetida(hexes: readonly Hex[]): boolean {
  return new Set(hexes.map(hexKey)).size !== hexes.length;
}

// ══════════════════════════════════════════════════════════════════
// A. A rota segue o cursor — nunca uma previsão
// ══════════════════════════════════════════════════════════════════

// ── 1: caminho reto célula a célula ────────────────────────────────
{
  const a = arrastar(h(0, 0), [h(1, 0), h(2, 0), h(3, 0)]);
  ok("1 (trilha reta é exatamente o que o cursor percorreu)",
    caminho(rotaExibida(a)) === "0,0 1,0 2,0 3,0", caminho(rotaExibida(a)));
}

// ── 2: desvio DELIBERADO é respeitado, não "corrigido" ─────────────
// Um pathfinder ligaria (0,0)→(2,2) pela reta; o rastro tem que
// manter a volta que a mão fez.
{
  const a = arrastar(h(0, 0), [h(1, 0), h(2, 0), h(2, 1), h(2, 2)]);
  const r = rotaExibida(a);
  const passouPor20 = r.some((c) => hexIguais(c, h(2, 0)));
  ok("2 (o desvio da mão é preservado — nada 'otimiza' a rota)",
    passouPor20 && r.length === 5, caminho(r));
}

// ── 3: trilha é sempre adjacente e sem repetição ───────────────────
{
  const a = arrastar(h(0, 0), [h(3, 0), h(3, 3), h(0, 3)]);
  ok("3 (trilha adjacente passo a passo, sem células repetidas)",
    adjacentePassoAPasso(rotaExibida(a)) && !temRepetida(rotaExibida(a)), caminho(rotaExibida(a)));
}

// ══════════════════════════════════════════════════════════════════
// B. Interpolação (mouse rápido pulando células)
// ══════════════════════════════════════════════════════════════════

// ── 4: um salto grande vira trilha contígua ────────────────────────
{
  const a = arrastar(h(0, 0), [h(6, 0)]); // um único evento, 6 células de distância
  const r = rotaExibida(a);
  ok("4 (salto de 6 células interpola as intermediárias — sem buraco)",
    r.length === 7 && adjacentePassoAPasso(r) && hexIguais(r[6], h(6, 0)), caminho(r));
}

// ── 5: salto na diagonal também fica contíguo ──────────────────────
{
  const a = arrastar(h(0, 0), [h(4, 4)]);
  const r = rotaExibida(a);
  ok("5 (salto diagonal interpola e chega no destino)",
    adjacentePassoAPasso(r) && hexIguais(r[r.length - 1], h(4, 4)) && r.length === hexDistancia(h(0, 0), h(4, 4)) + 1,
    caminho(r));
}

// ── 6: vários saltos seguidos continuam contíguos ──────────────────
{
  const a = arrastar(h(0, 0), [h(5, 0), h(5, 5), h(0, 5)]);
  ok("6 (rajada de saltos mantém a trilha inteira contígua)",
    adjacentePassoAPasso(rotaExibida(a)), `${rotaExibida(a).length} células`);
}

// ── 7: a interpolação PARA num obstáculo, nunca o atravessa ────────
// Muro de tokens em q=3 cobrindo a faixa que a reta usaria.
{
  const ocupados = new Set([hexKey(h(3, 0)), hexKey(h(2, 1)), hexKey(h(3, 1))]);
  const a = arrastar(h(0, 0), [h(6, 0)], ctx(VAZIO, ocupados));
  const r = rotaExibida(a);
  const encostouNoMuro = r.every((c) => !ocupados.has(hexKey(c)));
  ok("7 (salto sobre token alheio para ANTES dele, não do outro lado)",
    encostouNoMuro && !a.destinoAlcancavel && hexIguais(r[r.length - 1], h(2, 0)), caminho(r));
}

// ══════════════════════════════════════════════════════════════════
// C. Voltar pelo caminho — simplificação previsível
// ══════════════════════════════════════════════════════════════════

// ── 8: voltar uma célula encolhe a trilha ──────────────────────────
{
  const a = arrastar(h(0, 0), [h(1, 0), h(2, 0), h(3, 0), h(2, 0)]);
  ok("8 (voltar uma célula corta o excedente)",
    caminho(rotaExibida(a)) === "0,0 1,0 2,0", caminho(rotaExibida(a)));
}

// ── 9: voltar até a origem zera a trilha ───────────────────────────
{
  const a = arrastar(h(0, 0), [h(1, 0), h(2, 0), h(3, 0), h(0, 0)]);
  ok("9 (voltar até a origem desfaz o movimento inteiro)",
    rotaExibida(a).length === 1 && semMovimento(a), caminho(rotaExibida(a)));
}

// ── 10: ida e volta NÃO cobra custo dobrado ────────────────────────
// A garantia central contra "loop acidental": refazer o caminho de
// volta desfaz, em vez de acumular ida+volta.
{
  const a = arrastar(h(0, 0), [h(1, 0), h(2, 0), h(3, 0), h(2, 0), h(1, 0)]);
  const rota = rotaDoEstadoArrasto(a, VAZIO);
  ok("10 (ida-e-volta não acumula custo — a trilha encolheu)",
    rota.distanciaTotal === 1 && rota.custoTotal === custoDeEntrada(VAZIO, h(1, 0)),
    `dist=${rota.distanciaTotal} custo=${rota.custoTotal} trilha=${caminho(rotaExibida(a))}`);
}

// ── 11: um laço fechado não fica registrado como laço ──────────────
// Sai, dá a volta e retorna a uma célula já visitada: a trilha corta
// no ponto de reencontro em vez de guardar o círculo inteiro.
{
  const a = arrastar(h(0, 0), [h(1, 0), h(1, 1), h(0, 2), h(0, 1), h(0, 0)]);
  ok("11 (laço que reencontra o caminho não vira loop na rota)",
    !temRepetida(rotaExibida(a)) && rotaExibida(a).length === 1, caminho(rotaExibida(a)));
}

// ── 12: zigue-zague de tremor se dissolve ao refazer o percurso ────
{
  const a = arrastar(h(0, 0), [h(1, 0), h(2, 0), h(1, 0), h(2, 0), h(3, 0)]);
  ok("12 (tremor sobre o próprio caminho não infla a rota)",
    caminho(rotaExibida(a)) === "0,0 1,0 2,0 3,0", caminho(rotaExibida(a)));
}

// ── 13: avançar de novo depois de cortar refaz a trilha ────────────
{
  const a = arrastar(h(0, 0), [h(3, 0), h(1, 0), h(1, 1), h(1, 2)]);
  const r = rotaExibida(a);
  ok("13 (depois de voltar, a trilha cresce pelo caminho NOVO)",
    adjacentePassoAPasso(r) && hexIguais(r[r.length - 1], h(1, 2)) && !r.some((c) => hexIguais(c, h(3, 0))),
    caminho(r));
}

// ══════════════════════════════════════════════════════════════════
// D. Colisão, limites do mapa e pegada multicelular
// ══════════════════════════════════════════════════════════════════

// ── 14: token alheio bloqueia a entrada ────────────────────────────
{
  const ocupados = new Set([hexKey(h(2, 0))]);
  const a = arrastar(h(0, 0), [h(1, 0), h(2, 0)], ctx(VAZIO, ocupados));
  ok("14 (não entra na célula de outro token)",
    caminho(rotaExibida(a)) === "0,0 1,0" && !a.destinoAlcancavel, caminho(rotaExibida(a)));
}

// ── 15: contornar o obstáculo pelo gesto funciona ──────────────────
// O sistema não desvia sozinho — mas a mão pode, e a trilha registra.
{
  const ocupados = new Set([hexKey(h(2, 0))]);
  const a = arrastar(h(0, 0), [h(1, 0), h(1, 1), h(2, 1), h(2, 0)], ctx(VAZIO, ocupados));
  ok("15 (o obstáculo continua barrado mesmo contornando por baixo)",
    !rotaExibida(a).some((c) => ocupados.has(hexKey(c))), caminho(rotaExibida(a)));
}

// ── 16: borda do mapa barra ────────────────────────────────────────
{
  const a = arrastar(h(0, 0), [h(-1, 0), h(-2, 0)]);
  ok("16 (não sai pela borda do mapa)",
    rotaExibida(a).length === 1 && !a.destinoAlcancavel, caminho(rotaExibida(a)));
}

// ── 17: pegada multicelular valida a PEGADA INTEIRA, não a âncora ──
// Token grande (7 células): um token alheio vizinho à âncora já
// impede, mesmo com a âncora livre.
{
  const grande = pegadaPadrao("grande");
  const ocupados = new Set([hexKey(h(3, 1))]);
  const c: ContextoArrasto = { terreno: VAZIO, ocupados, largura: L, altura: A, pegada: grande };
  const a = arrastar(h(0, 0), [h(1, 0), h(2, 0), h(3, 0)], c);
  const chegouEm30 = rotaExibida(a).some((x) => hexIguais(x, h(3, 0)));
  ok("17 (pegada grande é barrada por colisão numa célula SECUNDÁRIA)",
    !chegouEm30 && !a.destinoAlcancavel, caminho(rotaExibida(a)));
}

// ── 18: terreno bloqueado NÃO barra (regra consultiva) ─────────────
{
  const t = terreno([[h(2, 0), "bloqueado"]]);
  const a = arrastar(h(0, 0), [h(1, 0), h(2, 0), h(3, 0)], ctx(t));
  ok("18 (terreno bloqueado é atravessável — vira aviso, não barreira)",
    rotaExibida(a).length === 4 && a.destinoAlcancavel && a.celulasBloqueadas.length === 1,
    `trilha=${caminho(rotaExibida(a))} bloqueadas=${caminho(a.celulasBloqueadas)}`);
}

// ── 19: aviso de bloqueio some quando a trilha recua pra fora dele ─
{
  const t = terreno([[h(2, 0), "bloqueado"]]);
  const a = arrastar(h(0, 0), [h(1, 0), h(2, 0), h(3, 0), h(1, 0)], ctx(t));
  ok("19 (recuar pra fora do bloqueio limpa o aviso — nunca fica fantasma)",
    a.celulasBloqueadas.length === 0 && a.passosBloqueados.every((p) => !p),
    `bloqueadas=${a.celulasBloqueadas.length}`);
}

// ── 20: terreno difícil cobra custo maior, sem barrar ──────────────
{
  const t = terreno([[h(1, 0), "dificil"], [h(2, 0), "dificil"]]);
  const a = arrastar(h(0, 0), [h(1, 0), h(2, 0)], ctx(t));
  const rota = rotaDoEstadoArrasto(a, t);
  ok("20 (terreno difícil sobe o custo mas não impede)",
    rota.distanciaTotal === 2 && rota.custoTotal === custoDeEntrada(t, h(1, 0)) + custoDeEntrada(t, h(2, 0)),
    `dist=${rota.distanciaTotal} custo=${rota.custoTotal}`);
}

// ══════════════════════════════════════════════════════════════════
// E. Posição visual e confirmação
// ══════════════════════════════════════════════════════════════════

// ── 21: o token fica na PONTA da trilha, nunca no cursor ilegal ────
{
  const ocupados = new Set([hexKey(h(2, 0))]);
  const a = arrastar(h(0, 0), [h(1, 0), h(2, 0)], ctx(VAZIO, ocupados));
  ok("21 (posição visual é a última célula LEGAL, não o hex sob o cursor)",
    hexIguais(posicaoVisual(a), h(1, 0)) && hexIguais(a.destinoAtual, h(2, 0)),
    `visual=${caminho([posicaoVisual(a)])} cursor=${caminho([a.destinoAtual])}`);
}

// ── 22: a rota confirmada é EXATAMENTE a trilha exibida ────────────
{
  const a = arrastar(h(0, 0), [h(1, 0), h(1, 1), h(2, 1)]);
  const rota = rotaDoEstadoArrasto(a, VAZIO);
  ok("22 (o que é enviado é exatamente o que estava desenhado)",
    caminho(rota.pontos) === caminho(rotaExibida(a)), caminho(rota.pontos));
}

// ── 23: cursor parado no mesmo hex é no-op (mesma referência) ──────
{
  let a = arrastar(h(0, 0), [h(1, 0)]);
  const antes = a;
  a = moverDestino(a, h(1, 0), ctx());
  ok("23 (mover dentro do mesmo hex não gera estado novo)", a === antes, "mesma ref");
}

// ══════════════════════════════════════════════════════════════════
// F. Marcos (Q / Backspace) e cancelamento
// ══════════════════════════════════════════════════════════════════

// ── 24: Q marca a ponta da trilha ──────────────────────────────────
{
  let a = arrastar(h(0, 0), [h(1, 0), h(2, 0)]);
  a = adicionarWaypoint(a);
  ok("24 (Q fixa a ponta atual como marco)",
    a.waypoints.length === 1 && hexIguais(a.waypoints[0], h(2, 0)), caminho(a.waypoints));
}

// ── 25: Q não duplica o mesmo marco nem marca a origem ─────────────
{
  let a = iniciarArrastoToken("t1", h(0, 0));
  const naOrigem = adicionarWaypoint(a);
  a = arrastar(h(0, 0), [h(1, 0)]);
  const primeiro = adicionarWaypoint(a);
  const repetido = adicionarWaypoint(primeiro);
  ok("25 (Q na origem e Q repetido são no-op)",
    naOrigem.waypoints.length === 0 && repetido === primeiro, "mesma ref nos dois");
}

// ── 26: Backspace remove só o último marco, sem cortar a trilha ────
{
  let a = arrastar(h(0, 0), [h(1, 0)]);
  a = adicionarWaypoint(a);
  a = moverDestino(a, h(2, 0), ctx());
  a = adicionarWaypoint(a);
  const trilhaAntes = caminho(rotaExibida(a));
  const depois = removerUltimoWaypoint(a);
  ok("26 (Backspace tira o marco e deixa a trilha intacta)",
    depois.waypoints.length === 1 && caminho(rotaExibida(depois)) === trilhaAntes,
    `marcos=${depois.waypoints.length} trilha=${caminho(rotaExibida(depois))}`);
}

// ── 27: marco além do corte gestual é descartado ───────────────────
{
  let a = arrastar(h(0, 0), [h(1, 0), h(2, 0), h(3, 0)]);
  a = adicionarWaypoint(a);            // marco em (3,0)
  a = moverDestino(a, h(1, 0), ctx()); // volta — corta (2,0) e (3,0)
  ok("27 (marco que ficou fora da trilha some junto)",
    a.waypoints.length === 0 && caminho(rotaExibida(a)) === "0,0 1,0",
    `marcos=${a.waypoints.length} trilha=${caminho(rotaExibida(a))}`);
}

// ── 28: voltar à origem apaga TAMBÉM os marcos ─────────────────────
// Um marco vive na trilha; desfazendo a trilha inteira ele não pode
// sobreviver órfão e transformar um gesto anulado em "movimento" — o
// resultado tem que ser indistinguível de nunca ter arrastado.
{
  let a = arrastar(h(0, 0), [h(1, 0), h(2, 0)]);
  a = adicionarWaypoint(a);
  const comMarco = a.waypoints.length === 1;
  a = moverDestino(a, h(0, 0), ctx());
  ok("28 (voltar à origem limpa a trilha E os marcos — gesto anulado de verdade)",
    comMarco && a.waypoints.length === 0 && semMovimento(a),
    `marcos ${comMarco ? 1 : 0}→${a.waypoints.length}, semMovimento=${semMovimento(a)}`);
}

// ── 29: cancelamento — a origem nunca é perdida ────────────────────
// `Esc` no componente descarta o estado inteiro; o domínio garante que
// a origem está sempre disponível pra restaurar a posição.
{
  const a = arrastar(h(0, 0), [h(3, 0), h(3, 3)]);
  ok("29 (origem preservada durante todo o gesto — base do Esc)",
    hexIguais(a.origem, h(0, 0)) && hexIguais(rotaExibida(a)[0], h(0, 0)), caminho([a.origem]));
}

// ── 30: gesto que nunca saiu da origem não persiste nada ───────────
{
  const a = iniciarArrastoToken("t1", h(4, 4));
  ok("30 (clique sem arrasto é no-op — nada a gravar)",
    semMovimento(a) && rotaDoEstadoArrasto(a, VAZIO).distanciaTotal === 0, "sem movimento");
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
process.exit(falhou > 0 ? 1 : 0);
