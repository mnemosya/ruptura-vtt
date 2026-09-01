/**
 * Testes PUROS do domínio de movimento/medição do VTT.
 *
 * Cobre o que o pedido lista como obrigatório em teste unitário:
 * distância hexagonal, linha entre células, custo de rota normal,
 * custo com terreno difícil, rejeição de célula bloqueada, rota
 * multiponto — e a distinção DISTÂNCIA × CUSTO, que é a regra mais
 * fácil de implementar errado (`16 COMBATE` → TERRENO: "cada
 * deslocamento custa o dobro da distância percorrida").
 *
 * Sem browser e sem banco: se um destes quebra, é regra, não interface.
 *
 * Uso: npx tsx scripts/test-vtt-movimento.ts
 */

import { type Hex, hexDistancia, hexKey, hexLinha } from "../src/app/mesas/[campaignId]/vtt/_mapa/hex";
import {
  type MapaTerreno,
  type TipoTerreno,
  alcancaveis,
  celulasDaRota,
  custoDeEntrada,
  dentroDoMapa,
  medir,
  montarRota,
  validarMovimento,
} from "../src/app/mesas/[campaignId]/vtt/_dominio/movimento";

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

// ── Geometria ────────────────────────────────────────────────────
ok("1 (distância de uma célula pra ela mesma é 0)", hexDistancia(h(0, 0), h(0, 0)) === 0, "0");
ok("2 (vizinho imediato = 1 m)", hexDistancia(h(0, 0), h(1, 0)) === 1, "1");
{
  // Em coordenada axial, (3,0) está a 3 células de (0,0) em linha reta.
  const d = hexDistancia(h(0, 0), h(3, 0));
  ok("3 (distância reta de 3 células)", d === 3, `${d}`);
}
{
  // Diagonal axial: (2,-1) fica a 2, não a 3 — é o erro clássico de
  // tratar hexágono como grade quadrada.
  const d = hexDistancia(h(0, 0), h(2, -1));
  ok("4 (diagonal hexagonal não soma como grade quadrada)", d === 2, `${d} (grade quadrada diria 3)`);
}
{
  const linha = hexLinha(h(0, 0), h(3, 0));
  ok("5 (linha inclui origem e destino, sem buracos)", linha.length === 4 && hexKey(linha[3]) === hexKey(h(3, 0)), `${linha.length} células`);
}

// ── Custo: normal × difícil ──────────────────────────────────────
{
  const r = montarRota([h(0, 0), h(3, 0)], VAZIO);
  ok("6 (rota limpa: custo = distância)", r.distanciaTotal === 3 && r.custoTotal === 3, `dist=${r.distanciaTotal}, custo=${r.custoTotal}`);
}
{
  // Só a célula do meio é difícil: 3 células de distância, custo 4
  // (1 + 2 + 1) — a distância NÃO muda com terreno.
  const t = terreno([[h(2, 0), "dificil"]]);
  const r = montarRota([h(0, 0), h(3, 0)], t);
  ok(
    "7 (terreno difícil dobra o custo daquela célula, sem mexer na distância)",
    r.distanciaTotal === 3 && r.custoTotal === 4,
    `dist=${r.distanciaTotal} m, custo=${r.custoTotal} (esperado 3 m / 4)`,
  );
}
{
  const t = terreno([[h(1, 0), "dificil"], [h(2, 0), "dificil"], [h(3, 0), "dificil"]]);
  const r = montarRota([h(0, 0), h(3, 0)], t);
  ok("8 (rota inteira em terreno difícil: custo é o dobro)", r.custoTotal === 6 && r.distanciaTotal === 3, `dist=${r.distanciaTotal}, custo=${r.custoTotal}`);
}
ok("9 (custo de entrada em célula difícil = 2)", custoDeEntrada(terreno([[h(0, 0), "dificil"]]), h(0, 0)) === 2, "2");
ok("9b (custo de entrada em célula limpa = 1)", custoDeEntrada(VAZIO, h(5, 5)) === 1, "1");
{
  // A célula de ORIGEM não custa: quem já está nela não entra nela.
  const t = terreno([[h(0, 0), "dificil"]]);
  const r = montarRota([h(0, 0), h(1, 0)], t);
  ok("10 (origem difícil não é cobrada)", r.custoTotal === 1, `custo=${r.custoTotal} (esperado 1)`);
}

// ── Bloqueio ─────────────────────────────────────────────────────
{
  const t = terreno([[h(2, 0), "bloqueado"]]);
  const r = montarRota([h(0, 0), h(3, 0)], t);
  ok("11 (rota que atravessa bloqueio é inválida)", !r.valida && r.segmentos[0].bloqueios.length === 1, `bloqueios=${r.segmentos[0].bloqueios.length}`);
}
{
  const t = terreno([[h(2, 0), "bloqueado"]]);
  const v = validarMovimento([h(0, 0), h(3, 0)], { terreno: t, largura: 20, altura: 20, tokenBloqueado: false, podeMover: true });
  ok("12 (validação reprova e diz por quê)", !v.ok && v.motivo?.tipo === "bloqueado", `motivo="${v.motivo?.texto}"`);
}
{
  // Contornar o bloqueio com pontos intermediários — o controle é do
  // usuário, não de pathfinding automático.
  //
  // Nota de premissa: um waypoint só (1,1) NÃO resolve — o segmento
  // (1,1)→(3,0) ainda atravessa (2,0), porque em hexágono a reta entre
  // duas células a 2 de distância passa por uma das duas do meio, e o
  // arredondamento escolhe justamente a bloqueada. Desviar de verdade
  // exige passar por (2,1). Um teste que "passasse" com o waypoint
  // errado estaria afirmando um desvio que não existe.
  const t = terreno([[h(2, 0), "bloqueado"]]);
  const pontos = [h(0, 0), h(1, 1), h(2, 1), h(3, 0)];
  const v = validarMovimento(pontos, { terreno: t, largura: 20, altura: 20, tokenBloqueado: false, podeMover: true });
  const passaNoBloqueio = celulasDaRota(v.rota).some((c) => hexKey(c) === hexKey(h(2, 0)));
  ok(
    "13 (pontos intermediários contornam o bloqueio de verdade)",
    v.ok && !passaNoBloqueio,
    `válida=${v.ok}, passa por (2,0)=${passaNoBloqueio}, custo=${v.rota.custoTotal}`,
  );
}

// ── Rota multiponto ──────────────────────────────────────────────
{
  const r = montarRota([h(0, 0), h(2, 0), h(2, 2)], VAZIO);
  ok("14 (rota multiponto soma os segmentos)", r.segmentos.length === 2 && r.distanciaTotal === 4, `segmentos=${r.segmentos.length}, dist=${r.distanciaTotal}`);
  const cs = celulasDaRota(r);
  ok("14b (células da rota não repetem)", cs.length === new Set(cs.map(hexKey)).size, `${cs.length} células únicas`);
}

// ── Autorização e travamento (na camada de domínio) ──────────────
{
  const v = validarMovimento([h(0, 0), h(1, 0)], { terreno: VAZIO, largura: 20, altura: 20, tokenBloqueado: false, podeMover: false });
  ok("15 (sem permissão reprova antes de qualquer geometria)", !v.ok && v.motivo?.tipo === "sem_permissao", `motivo="${v.motivo?.texto}"`);
}
{
  const v = validarMovimento([h(0, 0), h(1, 0)], { terreno: VAZIO, largura: 20, altura: 20, tokenBloqueado: true, podeMover: true });
  ok("16 (token travado reprova)", !v.ok && v.motivo?.tipo === "token_travado", `motivo="${v.motivo?.texto}"`);
}
{
  const v = validarMovimento([h(0, 0), h(50, 0)], { terreno: VAZIO, largura: 10, altura: 10, tokenBloqueado: false, podeMover: true });
  ok("17 (rota fora dos limites reprova)", !v.ok && v.motivo?.tipo === "fora_do_mapa", `motivo="${v.motivo?.texto}"`);
}
ok("17b (dentroDoMapa respeita o deslocamento das fileiras)", dentroDoMapa(h(-1, 2), 10, 10) && !dentroDoMapa(h(-2, 2), 10, 10), "linha r=2 começa em q=-1");

// ── Medição: metros × custo ──────────────────────────────────────
{
  const t = terreno([[h(1, 0), "dificil"], [h(2, 0), "dificil"]]);
  const m = medir([h(0, 0), h(3, 0)], t, 4);
  ok(
    "18 (medição separa metros de custo)",
    m.metros === 3 && m.custo === 5,
    `${m.metros} m de distância, custo ${m.custo} (2 células difíceis)`,
  );
  ok("18b (compara com o deslocamento disponível)", m.cabeNoDeslocamento === false, `custo ${m.custo} > 4 de deslocamento`);
}
{
  const m = medir([h(0, 0), h(2, 0)], VAZIO, 5);
  ok("19 (medição limpa cabe no deslocamento)", m.cabeNoDeslocamento === true && m.custo === 2, `custo=${m.custo}`);
}
{
  const m = medir([h(0, 0), h(3, 0)], terreno([[h(2, 0), "bloqueado"]]));
  ok("20 (medição sinaliza travessia de bloqueio)", m.atravessaBloqueio, "atravessaBloqueio=true");
}

// ── Alcance (prévia de deslocamento) ─────────────────────────────
{
  const alc = alcancaveis(h(5, 5), 1, VAZIO, 20, 20);
  ok("21 (orçamento 1 alcança os 6 vizinhos)", alc.length === 6, `${alc.length} células`);
}
{
  // Com o anel inteiro bloqueado, não dá pra sair.
  const anel: [Hex, TipoTerreno][] = [
    [h(6, 5), "bloqueado"], [h(6, 4), "bloqueado"], [h(5, 4), "bloqueado"],
    [h(4, 5), "bloqueado"], [h(4, 6), "bloqueado"], [h(5, 6), "bloqueado"],
  ];
  const alc = alcancaveis(h(5, 5), 5, terreno(anel), 20, 20);
  ok("22 (cercado por bloqueio não alcança nada)", alc.length === 0, `${alc.length} células`);
}
{
  // Terreno difícil reduz o alcance: com orçamento 2, terreno limpo
  // chega a 2 anéis; todo difícil, só ao primeiro.
  const limpo = alcancaveis(h(5, 5), 2, VAZIO, 20, 20).length;
  const dificilTudo = new Map<string, TipoTerreno>();
  for (let q = 0; q < 20; q++) for (let r = 0; r < 20; r++) dificilTudo.set(hexKey(h(q - Math.floor(r / 2), r)), "dificil");
  const dificil = alcancaveis(h(5, 5), 2, dificilTudo, 20, 20).length;
  ok("23 (terreno difícil encolhe o alcance)", dificil < limpo && dificil === 6, `limpo=${limpo}, difícil=${dificil}`);
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
if (falhou > 0) process.exit(1);
