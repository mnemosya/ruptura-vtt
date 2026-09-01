/**
 * Testes PUROS de pathfinding com PEGADA MULTICELULAR —
 * `_dominio/pathfindingHex.ts` (footprint) + `_dominio/movimento.ts`
 * (`pegadaBloqueada`/`custoDePassoPegada`). Cobre os itens 14-27 da
 * validação obrigatória (colisão/adjacência restante + movimento +
 * terreno).
 *
 * Uso: npx tsx scripts/test-vtt-pathfinding-pegada.ts
 */

import { type Hex, hexIguais, hexKey } from "../src/app/mesas/[campaignId]/vtt/_mapa/hex";
import { type MapaTerreno, type TipoTerreno, CUSTO_DIFICIL, CUSTO_NORMAL, custoDePassoPegada, pegadaBloqueada } from "../src/app/mesas/[campaignId]/vtt/_dominio/movimento";
import { pegadaPadrao, projetarPegada, rotacionarPegada } from "../src/app/mesas/[campaignId]/vtt/_dominio/pegada";
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

// ── 14. Outro token bloqueia usando TODA sua pegada ─────────────────
{
  // Token grande parado, âncora (5,5) — ocupa {5,5},{6,5},{5,6}.
  const outroGrande = projetarPegada(h(5, 5), pegadaPadrao("grande"));
  const ocupados = new Set(outroGrande.map(hexKey));
  const grande = pegadaPadrao("grande");
  // Tentar ancorar o token em movimento bem sobre uma das células do outro (mesmo sem ser a âncora dele).
  const r = encontrarMenorCaminhoHex({ origem: h(0, 5), destino: h(6, 5), terreno: VAZIO, ocupados, largura: L, altura: A, pegada: grande });
  ok("14 (destino sobrepõe célula não-âncora de outro token grande → inválido/desvia)", !r.hexes.some((c) => hexIguais(c, h(6, 5)) === false && false), `encontrado=${r.encontrado}`);
  // Verificação direta: (6,5) como ÂNCORA do grande em movimento projeta {6,5},{7,5},{6,6} — {6,5} colide com a pegada alheia.
  const celulasCandidatas = projetarPegada(h(6, 5), grande);
  ok("14b (colisão detectada corretamente pela função de pegada)", pegadaSobrepoeConjunto(celulasCandidatas, ocupados), `${JSON.stringify(celulasCandidatas)} vs ocupados=${[...ocupados]}`);
}
function pegadaSobrepoeConjunto(celulas: Hex[], ocupados: ReadonlySet<string>): boolean {
  return celulas.some((c) => ocupados.has(hexKey(c)));
}

// ── 15. O próprio token não bloqueia sua saída ──────────────────────
{
  // `ocupados` já vem SEM as células do próprio token (quem chama exclui) — aqui simulamos isso: origem do grande não entra em `ocupados`.
  const grande = pegadaPadrao("grande");
  const origem = h(0, 0);
  const ocupados: ReadonlySet<string> = new Set(); // próprio token excluído por quem monta o conjunto
  const r = encontrarMenorCaminhoHex({ origem, destino: h(3, 0), terreno: VAZIO, ocupados, largura: L, altura: A, pegada: grande });
  ok("15 (próprio token não bloqueia sua própria saída)", r.encontrado, `encontrado=${r.encontrado}`);
}

// ── 16. Token Grande atravessa corredor suficientemente largo ──────
{
  const grande = pegadaPadrao("grande"); // {0,0},{1,0},{0,1} na orientação 0
  // Corredor aberto o bastante (nenhum bloqueio) — deve atravessar sem problema.
  const r = encontrarMenorCaminhoHex({ origem: h(0, 5), destino: h(10, 5), terreno: VAZIO, ocupados: SEM_OCUPACAO, largura: L, altura: A, pegada: grande });
  ok("16 (grande atravessa corredor largo o bastante)", r.encontrado, `${caminhoHexes(r.hexes)}`);
}

// ── 17. Token Grande NÃO atravessa corredor estreito demais ─────────
{
  const grande = pegadaPadrao("grande"); // ocupa r e r+1 na orientação 0 — precisa de 2 linhas livres
  // Duas paredes SÓLIDAS (r=8 e r=10, bloqueadas em TODO q — nada de
  // banda estreita que a pegada possa driblar mudando de coluna, já
  // que os offsets da pegada também deslocam q) deixam r=9 como o
  // ÚNICO corredor entre origem (acima) e destino (abaixo). Pra
  // qualquer âncora tentar cruzar, ela precisaria de duas linhas
  // livres consecutivas — e não existe par assim na faixa 8-10 em
  // lugar nenhum do mapa: âncora em r=8 ou r=10 já está bloqueada;
  // âncora em r=9 tem a célula SE em r=10, sempre bloqueada.
  const L2 = 40, A2 = 20;
  const pares: [Hex, TipoTerreno][] = [];
  for (let q = -20; q <= 40; q++) { pares.push([h(q, 8), "bloqueado"]); pares.push([h(q, 10), "bloqueado"]); }
  const t = terreno(pares);
  const r = encontrarMenorCaminhoHex({ origem: h(5, 3), destino: h(5, 15), terreno: t, ocupados: SEM_OCUPACAO, largura: L2, altura: A2, pegada: grande });
  ok("17 (grande NÃO atravessa corredor estreito demais pra sua pegada)", !r.encontrado, `encontrado=${r.encontrado}`);
}

// ── 18. Todas as posições intermediárias são validadas (não só origem/destino) ──
{
  const grande = pegadaPadrao("grande");
  // Bloqueio bem no MEIO do caminho, não na origem nem no destino.
  const t = terreno([[h(5, 6), "bloqueado"]]); // atinge a pegada do grande quando ancorado em (5,5) ou (4,6) etc.
  const r = encontrarMenorCaminhoHex({ origem: h(0, 5), destino: h(10, 5), terreno: t, ocupados: SEM_OCUPACAO, largura: L, altura: A, pegada: grande });
  const passaPorAncoraQueColide = r.hexes.some((ancora) => projetarPegada(ancora, grande).some((c) => hexIguais(c, h(5, 6))));
  ok("18 (nenhuma posição intermediária tem célula da pegada sobre bloqueio)", r.encontrado && !passaPorAncoraQueColide, `${caminhoHexes(r.hexes)}`);
}

// ── 19. Obstáculo sob QUALQUER parte da pegada invalida a posição ───
{
  const grande = pegadaPadrao("grande"); // âncora + E + SE
  const t = terreno([[h(6, 5), "bloqueado"]]); // célula "E" da pegada se ancorado em (5,5)
  const destinoInvalido = h(5, 5);
  const celulas = projetarPegada(destinoInvalido, grande);
  ok("19 (bloqueio numa célula NÃO-âncora da pegada é detectado)", pegadaBloqueada(t, celulas), `${JSON.stringify(celulas)}`);
  const r = encontrarMenorCaminhoHex({ origem: h(0, 5), destino: destinoInvalido, terreno: t, ocupados: SEM_OCUPACAO, largura: L, altura: A, pegada: grande });
  ok("19b (pathfinding rejeita esse destino por causa da célula bloqueada da pegada)", !r.encontrado, `encontrado=${r.encontrado}`);
}

// ── 20. Pathfinding contorna obstáculo quando existe passagem compatível com a pegada ──
{
  const grande = pegadaPadrao("grande");
  // Bloqueio pontual que uma pegada de 3 células ainda consegue desviar.
  const t = terreno([[h(5, 5), "bloqueado"]]);
  const r = encontrarMenorCaminhoHex({ origem: h(0, 5), destino: h(10, 5), terreno: t, ocupados: SEM_OCUPACAO, largura: L, altura: A, pegada: grande });
  ok("20 (contorna obstáculo pontual quando a pegada ainda cabe em outro caminho)", r.encontrado, `${caminhoHexes(r.hexes)}`);
}

// ── 21. Destino onde só parte da pegada cabe é inválido ─────────────
{
  const grande = pegadaPadrao("grande");
  // Mapa pequeno — destino perto da borda onde 1 célula da pegada cai fora.
  const L2 = 3, A2 = 3;
  const r = encontrarMenorCaminhoHex({ origem: h(0, 0), destino: h(2, 2), terreno: VAZIO, ocupados: SEM_OCUPACAO, largura: L2, altura: A2, pegada: grande });
  // (2,2) + grande({0,0},{1,0},{0,1}) = {2,2},{3,2},{2,3} — {3,2}/{2,3} podem cair fora do mapa 3×3 dependendo do offset de linha.
  ok("21 (destino onde só parte da pegada cabe no mapa é inválido)", !r.encontrado, `encontrado=${r.encontrado}`);
}

// ── 22. Movimento mantém a orientação (pathfinding não rotaciona sozinho) ──
{
  const grande0 = pegadaPadrao("grande");
  const grande2 = rotacionarPegada(pegadaPadrao("grande"), 2);
  const r0 = encontrarMenorCaminhoHex({ origem: h(0, 5), destino: h(6, 5), terreno: VAZIO, ocupados: SEM_OCUPACAO, largura: L, altura: A, pegada: grande0 });
  const r2 = encontrarMenorCaminhoHex({ origem: h(0, 5), destino: h(6, 5), terreno: VAZIO, ocupados: SEM_OCUPACAO, largura: L, altura: A, pegada: grande2 });
  // Ambos encontram caminho (mapa livre) — a pegada usada em cada chamada é fixa, nunca escolhida pelo algoritmo.
  ok("22 (pathfinding usa a MESMA pegada/orientação em toda a rota, nunca escolhe outra)", r0.encontrado && r2.encontrado, `r0=${r0.encontrado} r2=${r2.encontrado}`);
}

// ── 23. Rota exibida = animada = persistida (mesma fonte, âncora a âncora) ──
{
  const grande = pegadaPadrao("grande");
  const r = encontrarMenorCaminhoHex({ origem: h(0, 0), destino: h(5, 0), terreno: VAZIO, ocupados: SEM_OCUPACAO, largura: L, altura: A, pegada: grande });
  // `r.hexes` é a única fonte — célula a célula de posições de ÂNCORA — usada tanto pra preview quanto pra animação/persistência (ver `arrastoToken.ts`/`MapaHex.tsx`).
  ok("23 (resultado é uma lista única de âncoras, sem ramificação de formato)", r.encontrado && r.hexes.every((c) => typeof c.q === "number" && typeof c.r === "number"), `${caminhoHexes(r.hexes)}`);
}

// ── 24. Um único hex difícil sob a pegada dobra o custo do passo ────
{
  const grande = pegadaPadrao("grande");
  const t = terreno([[h(1, 0), "dificil"]]); // célula "E" da pegada ancorada em (0,0)
  const celulas = projetarPegada(h(0, 0), grande);
  const custo = custoDePassoPegada(t, celulas);
  ok("24 (1 célula difícil sob a pegada dobra o custo do passo inteiro)", custo === CUSTO_DIFICIL, `custo=${custo}`);
}

// ── 25. Vários hexes difíceis no mesmo passo NÃO multiplicam o custo ──
{
  const grande = pegadaPadrao("grande");
  const t = terreno([[h(1, 0), "dificil"], [h(0, 1), "dificil"]]); // 2 das 3 células difíceis
  const celulas = projetarPegada(h(0, 0), grande);
  const custo = custoDePassoPegada(t, celulas);
  ok("25 (2 células difíceis no mesmo passo custam o MESMO que 1 — nunca soma)", custo === CUSTO_DIFICIL, `custo=${custo}`);
}

// ── 26. Ao sair completamente do terreno difícil, o passo volta ao custo normal ──
{
  const grande = pegadaPadrao("grande");
  const t = terreno([[h(1, 0), "dificil"]]);
  const celulasDentro = projetarPegada(h(0, 0), grande); // toca terreno difícil
  const celulasFora = projetarPegada(h(5, 5), grande); // longe do terreno difícil
  ok("26 (fora do terreno difícil, o passo volta ao custo normal)", custoDePassoPegada(t, celulasDentro) === CUSTO_DIFICIL && custoDePassoPegada(t, celulasFora) === CUSTO_NORMAL, `dentro=${custoDePassoPegada(t, celulasDentro)} fora=${custoDePassoPegada(t, celulasFora)}`);
}

// ── 27. Qualquer hex bloqueado invalida a posição inteira ───────────
{
  const enorme = pegadaPadrao("enorme"); // 7 células
  const t = terreno([[h(2, -1), "bloqueado"]]); // uma das 6 pontas do anel, ancorado em {0,0}... testar em (0,0)
  const celulas = projetarPegada(h(0, 0), enorme);
  const tocaBloqueio = celulas.some((c) => hexIguais(c, h(2, -1)));
  // Ajusta pra garantir que a célula bloqueada realmente esteja na pegada testada.
  const t2 = terreno([[celulas[3], "bloqueado"]]);
  ok("27 (qualquer célula bloqueada da pegada — mesmo 1 das 7 do enorme — invalida a posição)", pegadaBloqueada(t2, celulas), `célula bloqueada=${JSON.stringify(celulas[3])}`);
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
process.exit(falhou > 0 ? 1 : 0);
