/**
 * Testes PUROS do conector local `encontrarMenorCaminhoHex`
 * (`_dominio/pathfindingHex.ts`) — A* simples, sem corredor/penalidade
 * (removidos, ver `_dominio/arrastoToken.ts`). Cobre as garantias
 * básicas que `arrastoToken.ts` depende pra ligar a ponta confirmada
 * ao cursor: menor custo real, desvio de bloqueio/token, "sem rota"
 * honesto, determinismo.
 *
 * Uso: npx tsx scripts/test-vtt-pathfinding.ts
 */

import { type Hex, hexIguais, hexKey } from "../src/app/mesas/[campaignId]/vtt/_mapa/hex";
import { type MapaTerreno, type TipoTerreno, CUSTO_DIFICIL, CUSTO_NORMAL } from "../src/app/mesas/[campaignId]/vtt/_dominio/movimento";
import { encontrarMenorCaminhoHex } from "../src/app/mesas/[campaignId]/vtt/_dominio/pathfindingHex";

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
const SEM_OCUPACAO: ReadonlySet<string> = new Set();
const L = 30, A = 30;

function caminhoHexes(hexes: Hex[]): string {
  return hexes.map((c) => `${c.q},${c.r}`).join(" ");
}

{
  const origem = h(0, 0), destino = h(5, 0);
  const r = encontrarMenorCaminhoHex({ origem, destino, terreno: VAZIO, ocupados: SEM_OCUPACAO, largura: L, altura: A });
  ok("1 (sem obstáculos → rota mínima válida)", r.encontrado && r.hexes.length - 1 === 5 && r.custoTotal === 5, `${caminhoHexes(r.hexes)} custo=${r.custoTotal}`);
}

{
  const origem = h(0, 0), destino = h(4, 0);
  const t = terreno([[h(2, -1), "bloqueado"], [h(2, 0), "bloqueado"], [h(2, 1), "bloqueado"]]);
  const r = encontrarMenorCaminhoHex({ origem, destino, terreno: t, ocupados: SEM_OCUPACAO, largura: L, altura: A });
  const passaPorBloqueio = r.hexes.some((c) => hexIguais(c, h(2, -1)) || hexIguais(c, h(2, 0)) || hexIguais(c, h(2, 1)));
  ok("2 (bloqueio na reta → desvia, chega no destino)", r.encontrado && !passaPorBloqueio && hexIguais(r.hexes[r.hexes.length - 1], destino), `${caminhoHexes(r.hexes)}`);
}

{
  const LARG = 10, ALT = 10;
  const qMinDe = (r: number) => -Math.floor(r / 2);
  const pares: [Hex, TipoTerreno][] = [];
  for (let r = 0; r < ALT; r++) pares.push([h(qMinDe(r) + 5, r), "bloqueado"]);
  const t = terreno(pares);
  const origem = h(qMinDe(0) + 1, 0), destino = h(qMinDe(0) + 8, 0);
  const r = encontrarMenorCaminhoHex({ origem, destino, terreno: t, ocupados: SEM_OCUPACAO, largura: LARG, altura: ALT });
  ok("3 (barreira intransponível → sem rota)", !r.encontrado && r.hexes.length === 0 && r.custoTotal === null, `encontrado=${r.encontrado}`);
}

{
  const origem = h(0, 0), destino = h(4, 0);
  const ocupados = new Set([hexKey(h(2, 0))]);
  const r = encontrarMenorCaminhoHex({ origem, destino, terreno: VAZIO, ocupados, largura: L, altura: A });
  const passaPorToken = r.hexes.some((c) => hexIguais(c, h(2, 0)));
  ok("4 (token na reta → desvia)", r.encontrado && !passaPorToken, `${caminhoHexes(r.hexes)}`);
}

{
  const origem = h(0, 0), destino = h(3, 0);
  const ocupados = new Set([hexKey(destino)]);
  const r = encontrarMenorCaminhoHex({ origem, destino, terreno: VAZIO, ocupados, largura: L, altura: A });
  ok("5 (destino ocupado → sem rota)", !r.encontrado, `encontrado=${r.encontrado}`);
}

{
  const origem = h(0, 0), destino = h(2, 0);
  const t = terreno([[h(1, 0), "dificil"]]);
  const r = encontrarMenorCaminhoHex({ origem, destino, terreno: t, ocupados: SEM_OCUPACAO, largura: L, altura: A });
  ok("6 (terreno difícil precifica corretamente, sem invalidar a rota)", r.encontrado && r.custoTotal === CUSTO_DIFICIL + CUSTO_NORMAL, `custo=${r.custoTotal}`);
}

{
  const origem = h(0, 0), destino = h(0, 4);
  const primeiro = encontrarMenorCaminhoHex({ origem, destino, terreno: VAZIO, ocupados: SEM_OCUPACAO, largura: L, altura: A });
  let estavel = true;
  for (let i = 0; i < 20; i++) {
    const r = encontrarMenorCaminhoHex({ origem, destino, terreno: VAZIO, ocupados: SEM_OCUPACAO, largura: L, altura: A });
    if (r.hexes.length !== primeiro.hexes.length || !r.hexes.every((c, j) => hexIguais(c, primeiro.hexes[j]))) { estavel = false; break; }
  }
  ok("7 (empate de custo → mesma rota em toda chamada repetida — determinismo)", estavel, `${caminhoHexes(primeiro.hexes)}`);
}

{
  const p = h(2, 2);
  const r = encontrarMenorCaminhoHex({ origem: p, destino: p, terreno: VAZIO, ocupados: SEM_OCUPACAO, largura: L, altura: A });
  ok("8 (origem === destino → caminho trivial)", r.encontrado && r.hexes.length === 1 && r.custoTotal === 0, `${caminhoHexes(r.hexes)}`);
}

// ═══════════ Regra CONSULTIVA (movimento de token existente) ═══════════
// `ignorarBloqueioTerreno` — por padrão (omitido/`false`) o comportamento
// é IDÊNTICO a antes (testes 1-8 acima, intocados). Só quando ligado
// explicitamente é que terreno bloqueado deixa de excluir uma posição.

{
  // Barreira GENUINAMENTE intransponível — mesma técnica do teste 3
  // (uma célula bloqueada por LINHA, cobrindo TODA a altura do mapa;
  // um punhado de células isoladas sempre tem um desvio por cima/baixo
  // num mapa "infinito" o bastante, então não prova exclusão de
  // verdade). Sem a flag: sem rota, comportamento de sempre.
  const LARG = 10, ALT = 10;
  const qMinDe = (r: number) => -Math.floor(r / 2);
  const pares: [Hex, TipoTerreno][] = [];
  for (let r = 0; r < ALT; r++) pares.push([h(qMinDe(r) + 5, r), "bloqueado"]);
  const t = terreno(pares);
  const origem = h(qMinDe(0) + 1, 0), destino = h(qMinDe(0) + 8, 0);

  const semFlag = encontrarMenorCaminhoHex({ origem, destino, terreno: t, ocupados: SEM_OCUPACAO, largura: LARG, altura: ALT });
  ok("9 (sem `ignorarBloqueioTerreno`: barreira intransponível → sem rota, comportamento de sempre)", !semFlag.encontrado, `encontrado=${semFlag.encontrado}`);

  const comFlag = encontrarMenorCaminhoHex({ origem, destino, terreno: t, ocupados: SEM_OCUPACAO, largura: LARG, altura: ALT, ignorarBloqueioTerreno: true });
  ok("10 (com `ignorarBloqueioTerreno`: a MESMA barreira agora encontra rota atravessando o bloqueio)", comFlag.encontrado, `encontrado=${comFlag.encontrado}, ${caminhoHexes(comFlag.hexes)}`);
  ok("11 (`celulasBloqueadas` relata exatamente a célula de bloqueio atravessada, não vazio)", comFlag.celulasBloqueadas.length > 0, `${caminhoHexes(comFlag.celulasBloqueadas)}`);
}

{
  // A função em si é só "menor custo dado o que está excluído" — ela
  // NÃO implementa "prefira contornar" como preferência suave (isso é
  // responsabilidade da chamada em DUAS CAMADAS de `arrastoToken.ts`:
  // tenta sem a flag primeiro, só usa a flag se aquilo falhar de
  // verdade). Prova disso, não do oposto: com um único bloqueio (custo
  // igual ao normal) mais barato que o desvio, a busca com a flag
  // ligada ATRAVESSA — exatamente o comportamento que faz a
  // responsabilidade real recair sobre a camada de fora, e não aqui.
  const origem = h(0, 0), destino = h(4, 0);
  const t = terreno([[h(2, 0), "bloqueado"]]);
  const semFlag = encontrarMenorCaminhoHex({ origem, destino, terreno: t, ocupados: SEM_OCUPACAO, largura: L, altura: A });
  const comFlag = encontrarMenorCaminhoHex({ origem, destino, terreno: t, ocupados: SEM_OCUPACAO, largura: L, altura: A, ignorarBloqueioTerreno: true });
  const semFlagDesviou = semFlag.encontrado && !semFlag.hexes.some((c) => hexIguais(c, h(2, 0)));
  const comFlagAtravessouMaisBarato = comFlag.encontrado && comFlag.celulasBloqueadas.length > 0 && comFlag.custoTotal! < semFlag.custoTotal!;
  ok(
    "12 (função pura: sem a flag desvia; com a flag, atravessa o bloqueio quando é mais barato — 'preferir contornar' é da CAMADA DE FORA, não daqui)",
    semFlagDesviou && comFlagAtravessouMaisBarato,
    `sem=${caminhoHexes(semFlag.hexes)} custo=${semFlag.custoTotal} | com=${caminhoHexes(comFlag.hexes)} custo=${comFlag.custoTotal}`,
  );
}

{
  // Limites do mapa e colisão com outro token NUNCA relaxam, mesmo com a flag.
  const origem = h(0, 0), destino = h(-5, 0); // fora dos limites (largura/altura pequenas, propositalmente restritivas aqui)
  const r = encontrarMenorCaminhoHex({ origem, destino, terreno: VAZIO, ocupados: SEM_OCUPACAO, largura: 3, altura: 3, ignorarBloqueioTerreno: true });
  ok("13 (limites do mapa continuam excluindo mesmo com `ignorarBloqueioTerreno`)", !r.encontrado, `encontrado=${r.encontrado}`);

  const destino2 = h(2, 0);
  const ocupadoPorOutroToken: ReadonlySet<string> = new Set([hexKey(destino2)]);
  const r2 = encontrarMenorCaminhoHex({ origem: h(0, 0), destino: destino2, terreno: VAZIO, ocupados: ocupadoPorOutroToken, largura: L, altura: A, ignorarBloqueioTerreno: true });
  ok("14 (colisão com outro token no DESTINO continua excluindo mesmo com `ignorarBloqueioTerreno`)", !r2.encontrado, `encontrado=${r2.encontrado}`);
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
process.exit(falhou > 0 ? 1 : 0);
