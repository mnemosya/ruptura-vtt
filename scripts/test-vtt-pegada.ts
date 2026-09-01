/**
 * Testes PUROS de pegada hexagonal multicelular —
 * `_dominio/pegada.ts`. Cobre os itens 1-10 da validação obrigatória
 * (presets, rotação, projeção, centro geométrico) e o restante das
 * funções de colisão/adjacência puras (itens 11-13, a parte
 * testável sem pathfinding).
 *
 * Uso: npx tsx scripts/test-vtt-pegada.ts
 */

import { type Hex, hexDistancia, hexIguais, hexKey } from "../src/app/mesas/[campaignId]/vtt/_mapa/hex";
import {
  type Pegada,
  anelHexParaTestes, caixaVisual, celulaNaPegada, centroGeometrico, origemMecanica,
  pegadaEfetiva, pegadaPadrao, pegadaPersonalizadaValida, pegadasAdjacentes, pegadasSobrepoem,
  projetarPegada, rotacionarPegada,
} from "../src/app/mesas/[campaignId]/vtt/_dominio/pegada";

let passou = 0;
let falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}
const h = (q: number, r: number): Hex => ({ q, r });
function conjunto(pegada: readonly Hex[]): Set<string> { return new Set(pegada.map(hexKey)); }
function mesmasCelulas(a: readonly Hex[], b: readonly Hex[]): boolean {
  if (a.length !== b.length) return false;
  const sb = conjunto(b);
  return a.every((c) => sb.has(hexKey(c)));
}
function conectado(pegada: readonly Hex[]): boolean {
  if (pegada.length === 0) return false;
  const vistos = new Set<string>([hexKey(pegada[0])]);
  const pilha = [pegada[0]];
  while (pilha.length) {
    const atual = pilha.pop()!;
    for (const c of pegada) {
      const k = hexKey(c);
      if (!vistos.has(k) && hexDistancia(atual, c) === 1) { vistos.add(k); pilha.push(c); }
    }
  }
  return vistos.size === pegada.length;
}

// ── 1/2. Pequeno e Médio ocupam 1 hex — categorias distintas, mesma forma ──
{
  const peq = pegadaPadrao("pequeno"), med = pegadaPadrao("medio");
  ok("1 (pequeno ocupa 1 hex)", peq.length === 1 && hexIguais(peq[0], h(0, 0)), `${JSON.stringify(peq)}`);
  ok("2 (médio ocupa 1 hex)", med.length === 1 && hexIguais(med[0], h(0, 0)), `${JSON.stringify(med)}`);
  ok("2b (pequeno e médio têm a mesma ocupação, mas continuam categorias distintas)", mesmasCelulas(peq, med), "mesma forma, tipos `CategoriaTamanho` distintos por construção");
}

// ── 3. Grande ocupa exatamente 3 hexes conectados ───────────────────
{
  const g = pegadaPadrao("grande");
  ok("3 (grande ocupa exatamente 3 hexes)", g.length === 3, `${JSON.stringify(g)}`);
  ok("3b (grande é conectado)", conectado(g), "confirmado");
  ok("3c (grande inclui a âncora {0,0})", g.some((c) => hexIguais(c, h(0, 0))), "confirmado");
  const semAncora = g.filter((c) => !hexIguais(c, h(0, 0)));
  ok("3d (as 2 outras células são mutuamente adjacentes — formação triangular de verdade)", semAncora.length === 2 && hexDistancia(semAncora[0], semAncora[1]) === 1, `${JSON.stringify(semAncora)}`);
}

// ── 4. Enorme ocupa exatamente 7 hexes conectados ───────────────────
{
  const e = pegadaPadrao("enorme");
  ok("4 (enorme ocupa exatamente 7 hexes)", e.length === 7, `${JSON.stringify(e)}`);
  ok("4b (enorme é conectado)", conectado(e), "confirmado");
  ok("4c (enorme = âncora + anel de raio 1 completo)", mesmasCelulas(e, [h(0, 0), ...anelHexParaTestes(1)]), "confirmado");
}

// ── 5. Colossal ocupa exatamente 12 hexes no template canônico ─────
{
  const c = pegadaPadrao("colossal");
  ok("5 (colossal ocupa exatamente 12 hexes)", c.length === 12, `${JSON.stringify(c)}`);
  ok("5b (colossal é conectado, sem buraco)", conectado(c), "confirmado");
  const chaves = c.map(hexKey);
  ok("5c (12 células únicas, sem duplicata)", new Set(chaves).size === 12, "confirmado");
  ok("5d (colossal inclui a âncora e o anel de raio 1 inteiro — sem buraco no centro)", mesmasCelulas([h(0, 0), ...anelHexParaTestes(1)], c.slice(0, 7)) || [h(0, 0), ...anelHexParaTestes(1)].every((cel) => c.some((x) => hexIguais(x, cel))), "confirmado");
  ok("5e (construído por código — anel de raio 2 tem exatamente 12 células no total, o preset usa 5 delas)", anelHexParaTestes(2).length === 12, `anel2=${anelHexParaTestes(2).length}`);
}

// ── 6. Rotacionar seis vezes restaura a pegada original ─────────────
{
  for (const cat of ["pequeno", "medio", "grande", "enorme", "colossal"] as const) {
    const base = pegadaPadrao(cat);
    const seisVoltas = rotacionarPegada(base, 6);
    ok(`6 (${cat}: rotacionar 6× restaura a pegada original)`, mesmasCelulas(base, seisVoltas), `${JSON.stringify(seisVoltas)}`);
  }
}

// ── 7. Enorme mantém a mesma ocupação ao rotacionar (qualquer passo) ──
{
  const base = pegadaPadrao("enorme");
  let todasIguais = true;
  for (let passo = 1; passo <= 5; passo++) {
    const rot = rotacionarPegada(base, passo);
    if (!mesmasCelulas(base, rot)) todasIguais = false;
  }
  ok("7 (enorme: rotação em qualquer passo não muda a ocupação — simétrico)", todasIguais, "confirmado 1..5 passos");
}
// Contraprova: grande e colossal MUDAM de ocupação ao rotacionar (exceto passo 0/6).
{
  const g = pegadaPadrao("grande");
  const g1 = rotacionarPegada(g, 1);
  ok("7b (contraprova: grande MUDA de ocupação ao rotacionar 1 passo)", !mesmasCelulas(g, g1), `${JSON.stringify(g1)}`);
  const col = pegadaPadrao("colossal");
  const col1 = rotacionarPegada(col, 1);
  ok("7c (contraprova: colossal MUDA de ocupação ao rotacionar 1 passo)", !mesmasCelulas(col, col1), "confirmado");
}

// ── 8. Pegadas personalizadas desconectadas são rejeitadas ──────────
{
  const desconectada = [h(0, 0), h(5, 5)];
  ok("8 (pegada desconectada é rejeitada)", !pegadaPersonalizadaValida(desconectada), "confirmado");
  const semAncoraNaOrigem = [h(1, 0), h(2, 0)];
  ok("8b (pegada sem a âncora {0,0} no conjunto é rejeitada)", !pegadaPersonalizadaValida(semAncoraNaOrigem), "confirmado");
  const duplicata = [h(0, 0), h(1, 0), h(1, 0)];
  ok("8c (pegada com offset duplicado é rejeitada)", !pegadaPersonalizadaValida(duplicata), "confirmado");
  const vazia: Hex[] = [];
  ok("8d (pegada vazia é rejeitada)", !pegadaPersonalizadaValida(vazia), "confirmado");
  const valida = [h(0, 0), h(1, 0), h(2, 0)];
  ok("8e (pegada conectada, com âncora, sem duplicata — aceita)", pegadaPersonalizadaValida(valida), "confirmado");
}

// ── 9. Projeção absoluta não gera hexes duplicados ──────────────────
{
  for (const cat of ["grande", "enorme", "colossal"] as const) {
    const abs = projetarPegada(h(10, 10), pegadaPadrao(cat));
    const chaves = abs.map(hexKey);
    ok(`9 (${cat}: projeção absoluta sem duplicata)`, new Set(chaves).size === chaves.length, `${chaves.length} células`);
  }
}

// ── 10. Centro geométrico do Grande não é arbitrariamente deslocado pra um hex ──
{
  const g = pegadaPadrao("grande");
  const centro = centroGeometrico(g);
  const caiExatamenteEmAlgumHex = g.some((c) => Math.abs(centro.q - c.q) < 1e-9 && Math.abs(centro.r - c.r) < 1e-9);
  ok("10 (centro geométrico do grande NÃO coincide com nenhum dos 3 hexes — cai entre eles)", !caiExatamenteEmAlgumHex, `centro=${JSON.stringify(centro)}`);

  const peq = pegadaPadrao("pequeno");
  const centroPeq = origemMecanica(peq);
  ok("10b (origem mecânica do pequeno/médio cai exatamente na única célula)", Math.abs(centroPeq.q) < 1e-9 && Math.abs(centroPeq.r) < 1e-9, `${JSON.stringify(centroPeq)}`);

  const e = pegadaPadrao("enorme");
  const centroE = origemMecanica(e);
  ok("10c (origem mecânica do enorme cai no centro do hex central)", Math.abs(centroE.q) < 1e-9 && Math.abs(centroE.r) < 1e-9, `${JSON.stringify(centroE)}`);
}

// ── 11. Sobreposição de um único hex já invalida a posição ─────────
{
  const a = projetarPegada(h(0, 0), pegadaPadrao("grande")); // {0,0},{1,0},{0,1}
  const b = projetarPegada(h(1, 0), pegadaPadrao("pequeno")); // exatamente uma célula de `a`
  ok("11 (sobreposição de 1 hex é detectada)", pegadasSobrepoem(a, b), `a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
}

// ── 12. Pegadas separadas não colidem ───────────────────────────────
{
  const a = projetarPegada(h(0, 0), pegadaPadrao("grande"));
  const b = projetarPegada(h(20, 20), pegadaPadrao("grande"));
  ok("12 (pegadas bem separadas não colidem)", !pegadasSobrepoem(a, b), "confirmado");
}

// ── 13. Tokens multicelulares podem ser adjacentes sem se sobrepor ──
{
  const a = projetarPegada(h(0, 0), pegadaPadrao("enorme")); // ocupa {0,0} + anel1
  // célula logo depois do anel1, adjacente a uma delas mas fora do conjunto.
  const bAncora = h(2, 0);
  const b = projetarPegada(bAncora, pegadaPadrao("pequeno"));
  ok("13 (pegadas adjacentes sem sobrepor)", !pegadasSobrepoem(a, b) && pegadasAdjacentes(a, b), `a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
}

// ── extra: caixaVisual e celulaNaPegada ──────────────────────────────
{
  const abs = projetarPegada(h(5, 5), pegadaPadrao("colossal"));
  const caixa = caixaVisual(abs);
  ok("extra (caixaVisual cobre todas as células)", abs.every((c) => c.q >= caixa.minQ && c.q <= caixa.maxQ && c.r >= caixa.minR && c.r <= caixa.maxR), `${JSON.stringify(caixa)}`);
  ok("extra (celulaNaPegada reconhece célula ocupada)", celulaNaPegada(h(5, 5), abs), "confirmado");
  ok("extra (celulaNaPegada rejeita célula fora)", !celulaNaPegada(h(99, 99), abs), "confirmado");
}

// ── extra: pegadaEfetiva combina categoria + orientação + custom ────
{
  const semCustom = pegadaEfetiva({ categoria: "grande", orientacao: 2, pegadaPersonalizada: null });
  ok("extra (pegadaEfetiva sem custom usa preset rotacionado)", mesmasCelulas(semCustom, rotacionarPegada(pegadaPadrao("grande"), 2)), "confirmado");
  const custom: Pegada = [h(0, 0), h(1, 0)];
  const comCustom = pegadaEfetiva({ categoria: "grande", orientacao: 0, pegadaPersonalizada: custom });
  ok("extra (pegadaEfetiva com custom ignora o preset da categoria)", mesmasCelulas(comCustom, custom), "confirmado");
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
process.exit(falhou > 0 ? 1 : 0);
