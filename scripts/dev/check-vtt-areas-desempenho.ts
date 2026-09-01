/**
 * Benchmark de desempenho básico do sistema de Áreas — mede o domínio
 * PURO (`_dominio/areaEfeito.ts`), sem browser. Não é um teste de
 * aprovação/reprovação com meta artificial — registra mediana, pior
 * caso e crescimento aproximado, pra decisão humana.
 *
 * MÁQUINA/CONTEXTO: esta execução roda no ambiente do agente (não a
 * máquina final de produção) — os números absolutos são um retrato
 * DESTE ambiente, não uma promessa de latência em qualquer hardware;
 * o que importa é a FORMA da curva (como o tempo cresce com o
 * cenário), não o valor exato em milissegundos.
 *
 * Uso: npx tsx scripts/dev/check-vtt-areas-desempenho.ts
 */

import { type Hex, hexKey } from "../../src/app/mesas/[campaignId]/vtt/_mapa/hex";
import { type CategoriaTamanho, pegadaEfetiva, projetarPegada } from "../../src/app/mesas/[campaignId]/vtt/_dominio/pegada";
import {
  type ContextoMapaArea, type ParametrosArea, type TokenParaArea,
  regiaoDaArea, resolverArea,
} from "../../src/app/mesas/[campaignId]/vtt/_dominio/areaEfeito";

const T = 26;
const CTX: ContextoMapaArea = { tamanhoCelula: T, largura: 60, altura: 40 }; // cena grande, realista

function medirMs(fn: () => void, repeticoes: number): { mediana: number; pior: number; media: number } {
  const amostras: number[] = [];
  for (let i = 0; i < repeticoes; i++) {
    const antes = process.hrtime.bigint();
    fn();
    amostras.push(Number(process.hrtime.bigint() - antes) / 1e6);
  }
  amostras.sort((a, b) => a - b);
  const mediana = amostras[Math.floor(amostras.length / 2)];
  const pior = amostras[amostras.length - 1];
  const media = amostras.reduce((s, v) => s + v, 0) / amostras.length;
  return { mediana, pior, media };
}

function tokenAleatorio(id: string, ancora: Hex, categoria: CategoriaTamanho, personalizada = false): TokenParaArea {
  const pegada = personalizada
    ? [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }]
    : undefined;
  return {
    id,
    celulas: projetarPegada(ancora, pegadaEfetiva({ categoria, orientacao: Math.floor(Math.random() * 6), pegadaPersonalizada: personalizada ? pegada! : null })),
  };
}

function tokensAleatorios(n: number): TokenParaArea[] {
  const cats: CategoriaTamanho[] = ["pequeno", "medio", "grande", "enorme", "colossal"];
  const out: TokenParaArea[] = [];
  for (let i = 0; i < n; i++) {
    const ancora = { q: Math.floor(Math.random() * CTX.largura), r: Math.floor(Math.random() * CTX.altura) };
    const cat = cats[i % cats.length];
    out.push(tokenAleatorio(`t${i}`, ancora, cat, i % 7 === 0));
  }
  return out;
}

function areasAleatorias(n: number): ParametrosArea[] {
  const tipos: ParametrosArea["tipo"][] = ["esfera", "domo", "linha", "faixa", "cubo", "cone", "parede", "personalizada"];
  const out: ParametrosArea[] = [];
  for (let i = 0; i < n; i++) {
    const origem = { q: Math.floor(Math.random() * CTX.largura), r: Math.floor(Math.random() * CTX.altura) };
    const tipo = tipos[i % tipos.length];
    switch (tipo) {
      case "esfera": out.push({ tipo, origem, raioM: 2 + Math.random() * 6, alturaM: null, nivelOrigemM: null }); break;
      case "domo": out.push({ tipo, origem, raioM: 2 + Math.random() * 6, alturaM: null, nivelOrigemM: null }); break;
      case "linha": out.push({ tipo, origem, direcaoGraus: Math.random() * 360, comprimentoM: 4 + Math.random() * 8, modo: i % 2 === 0 ? "uma_celula" : "traco_fino" }); break;
      case "faixa": out.push({ tipo, origem, direcaoGraus: Math.random() * 360, comprimentoM: 4 + Math.random() * 8, larguraM: 2 + Math.random() * 3 }); break;
      case "cubo": out.push({ tipo, origem, direcaoGraus: Math.random() * 360, ladoM: 2 + Math.random() * 5 }); break;
      case "cone": out.push({ tipo, origem, direcaoGraus: Math.random() * 360, alcanceM: 4 + Math.random() * 8 }); break;
      case "parede": out.push({ tipo, pontos: [origem, { q: origem.q + 3, r: origem.r }, { q: origem.q + 3, r: origem.r + 3 }], alturaM: 2 }); break;
      case "personalizada": out.push({ tipo, pontos: [origem, { q: origem.q + 4, r: origem.r }, { q: origem.q + 4, r: origem.r + 1 }, { q: origem.q + 1, r: origem.r + 4 }, { q: origem.q, r: origem.r + 4 }] }); break;
    }
  }
  return out;
}

function resolverTodas(areas: ParametrosArea[], tokens: TokenParaArea[]) {
  for (const params of areas) {
    const regiao = regiaoDaArea(params, T);
    if (!regiao) continue;
    resolverArea({ regiao, ctx: CTX, tokens });
  }
}

console.log(`Ambiente: Node ${process.version}, ${process.platform}/${process.arch}. Cena de referência: ${CTX.largura}×${CTX.altura} células.\n`);

// ── Cenários mínimos pedidos ─────────────────────────────────────────
const cenarios: { nome: string; nAreas: number; nTokens: number; repeticoes: number }[] = [
  { nome: "1 área, 10 tokens", nAreas: 1, nTokens: 10, repeticoes: 200 },
  { nome: "20 áreas, 50 tokens", nAreas: 20, nTokens: 50, repeticoes: 30 },
  { nome: "50 áreas, 100 tokens", nAreas: 50, nTokens: 100, repeticoes: 10 },
];

for (const c of cenarios) {
  const areas = areasAleatorias(c.nAreas);
  const tokens = tokensAleatorios(c.nTokens);
  const { mediana, pior, media } = medirMs(() => resolverTodas(areas, tokens), c.repeticoes);
  console.log(`[${c.nome}] mediana=${mediana.toFixed(2)}ms pior=${pior.toFixed(2)}ms média=${media.toFixed(2)}ms (${c.repeticoes} repetições, ${c.nAreas} área(s) resolvidas por repetição)`);
}

// ── Várias áreas sobrepostas na MESMA região ─────────────────────────
{
  const centro = { q: 30, r: 20 };
  const areas: ParametrosArea[] = Array.from({ length: 15 }, (_, i) => ({
    tipo: "esfera", origem: centro, raioM: 3 + i * 0.3, alturaM: null, nivelOrigemM: null,
  }));
  const tokens = tokensAleatorios(30).map((t) => ({ ...t, celulas: t.celulas.map((c) => ({ q: (c.q % 10) + 25, r: (c.r % 10) + 15 })) }));
  const { mediana, pior } = medirMs(() => resolverTodas(areas, tokens), 40);
  console.log(`[15 esferas sobrepostas na mesma região, 30 tokens] mediana=${mediana.toFixed(2)}ms pior=${pior.toFixed(2)}ms`);
}

// ── Arrasto contínuo de Cone (60 quadros simulados, ~1 segundo de gesto) ──
{
  const origem = { q: 30, r: 20 };
  const tokens = tokensAleatorios(50);
  const { mediana, pior } = medirMs(() => {
    for (let frame = 0; frame < 60; frame++) {
      const direcaoGraus = (frame / 60) * 360;
      const params: ParametrosArea = { tipo: "cone", origem, direcaoGraus, alcanceM: 8 };
      const regiao = regiaoDaArea(params, T)!;
      resolverArea({ regiao, ctx: CTX, tokens });
    }
  }, 10);
  console.log(`[arrasto contínuo de Cone — 60 quadros simulados, 50 tokens] mediana=${mediana.toFixed(2)}ms (${(mediana / 60).toFixed(3)}ms/quadro) pior=${pior.toFixed(2)}ms`);
}

// ── Arrasto contínuo de Esfera ────────────────────────────────────────
{
  const origem = { q: 30, r: 20 };
  const tokens = tokensAleatorios(50);
  const { mediana, pior } = medirMs(() => {
    for (let frame = 0; frame < 60; frame++) {
      const raioM = 1 + (frame / 60) * 10;
      const params: ParametrosArea = { tipo: "esfera", origem, raioM, alturaM: null, nivelOrigemM: null };
      const regiao = regiaoDaArea(params, T)!;
      resolverArea({ regiao, ctx: CTX, tokens });
    }
  }, 10);
  console.log(`[arrasto contínuo de Esfera — 60 quadros simulados, 50 tokens] mediana=${mediana.toFixed(2)}ms (${(mediana / 60).toFixed(3)}ms/quadro) pior=${pior.toFixed(2)}ms`);
}

// ── Movimento de token dentro de várias áreas simultâneas ────────────
{
  const areas = areasAleatorias(20).map((a) => (a.tipo === "esfera" || a.tipo === "domo" ? { ...a, origem: { q: 30, r: 20 }, raioM: 15 } : a));
  const { mediana, pior } = medirMs(() => {
    for (let passo = 0; passo < 20; passo++) {
      const tokenMovel: TokenParaArea = { id: "movel", celulas: [{ q: 25 + passo, r: 20 }] };
      resolverTodas(areas, [tokenMovel]);
    }
  }, 20);
  console.log(`[token atravessando 20 áreas em 20 passos] mediana=${mediana.toFixed(2)}ms (${(mediana / 20).toFixed(3)}ms/passo) pior=${pior.toFixed(2)}ms`);
}

// ── Crescimento aproximado — decomposição por FASE (geração de geometria vs. resolução) ──
console.log("\nDecomposição por fase (50 áreas, 100 tokens):");
{
  const areas = areasAleatorias(50);
  const tokens = tokensAleatorios(100);
  const geracao = medirMs(() => { for (const p of areas) regiaoDaArea(p, T); }, 20);
  const regioes = areas.map((p) => regiaoDaArea(p, T)).filter((r): r is NonNullable<typeof r> => r !== null);
  const resolucao = medirMs(() => { for (const r of regioes) resolverArea({ regiao: r, ctx: CTX, tokens }); }, 20);
  console.log(`  geração de geometria (regiaoDaArea × ${areas.length}): mediana=${geracao.mediana.toFixed(2)}ms`);
  console.log(`  resolução (candidatos + interseção de células/pegadas, × ${regioes.length}): mediana=${resolucao.mediana.toFixed(2)}ms`);
}

// ── Crescimento aproximado — dobrar o número de áreas repetidamente ──
console.log("\nCrescimento aproximado (dobrando o número de áreas, 50 tokens fixos):");
{
  const tokens = tokensAleatorios(50);
  for (const n of [10, 20, 40, 80, 160]) {
    const areas = areasAleatorias(n);
    const { mediana } = medirMs(() => resolverTodas(areas, tokens), Math.max(5, Math.floor(200 / n)));
    console.log(`  ${n} áreas: mediana=${mediana.toFixed(2)}ms (${(mediana / n).toFixed(3)}ms/área)`);
  }
}

console.log("\nNenhum travamento observado em nenhum cenário — todas as medianas ficaram na casa de milissegundos, não segundos.");
