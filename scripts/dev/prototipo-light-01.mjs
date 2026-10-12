/** LIGHT-01: experimento isolado de geometria, sem UI, banco ou rede.
 * Execute: node scripts/dev/prototipo-light-01.mjs
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import os from "node:os";
import { fileURLToPath } from "node:url";

const EPS = 0.0001;

function cruz(a, b) { return a.x * b.y - a.y * b.x; }

function distanciaAteSegmento(origem, direcao, segmento, limite) {
  const p = { x: segmento.b.x - segmento.a.x, y: segmento.b.y - segmento.a.y };
  const denominador = cruz(direcao, p);
  if (Math.abs(denominador) < 1e-10) return limite;
  const q = { x: segmento.a.x - origem.x, y: segmento.a.y - origem.y };
  const t = cruz(q, p) / denominador;
  const u = cruz(q, direcao) / denominador;
  return t > 1e-7 && t < limite && u >= 0 && u <= 1 ? t : limite;
}

function segmentoNoRaio(origem, segmento, raio) {
  const x = Math.max(segmento.minX, Math.min(origem.x, segmento.maxX));
  const y = Math.max(segmento.minY, Math.min(origem.y, segmento.maxY));
  return (x - origem.x) ** 2 + (y - origem.y) ** 2 <= raio ** 2;
}

function segmentosLocais(origem, segmentos, raio) {
  return segmentos.filter((s) => segmentoNoRaio(origem, s, raio));
}

export function poligonoVisivel(origem, segmentos, raio, cone = null) {
  const locais = segmentosLocais(origem, segmentos, raio);
  const angulos = [];
  // Amostragem de 2° para o contorno circular e 3 raios em cada ponta.
  for (let i = 0; i < 180; i++) angulos.push(i * Math.PI / 90);
  for (const s of locais) for (const p of [s.a, s.b]) {
    const angulo = Math.atan2(p.y - origem.y, p.x - origem.x);
    angulos.push(angulo - EPS, angulo, angulo + EPS);
  }
  const centro = cone ? cone.direcaoGraus * Math.PI / 180 : 0;
  const meioCone = cone ? cone.aberturaGraus * Math.PI / 360 : Math.PI;
  const relativo = (angulo) => Math.atan2(Math.sin(angulo - centro), Math.cos(angulo - centro));
  if (cone) angulos.push(centro - meioCone, centro + meioCone);
  const pontos = [];
  for (const angulo of angulos) {
    if (cone && Math.abs(relativo(angulo)) > meioCone + 1e-10) continue;
    const direcao = { x: Math.cos(angulo), y: Math.sin(angulo) };
    let distancia = raio;
    for (const s of locais) distancia = distanciaAteSegmento(origem, direcao, s, distancia);
    pontos.push({ angulo, x: origem.x + direcao.x * distancia, y: origem.y + direcao.y * distancia });
  }
  pontos.sort((a, b) => cone ? relativo(a.angulo) - relativo(b.angulo) : a.angulo - b.angulo);
  if (cone) {
    pontos.unshift({ angulo: centro - meioCone, x: origem.x, y: origem.y });
    pontos.push({ angulo: centro + meioCone, x: origem.x, y: origem.y });
  }
  return { pontos, candidatos: locais.length };
}

function segmento(a, b) {
  return { a, b, minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) };
}

// Guarda geométrica: uma parede entre observador e ponto reduz o raio.
const parede = segmento({ x: 3, y: -2 }, { x: 3, y: 2 });
assert.equal(distanciaAteSegmento({ x: 0, y: 0 }, { x: 1, y: 0 }, parede, 10), 3);
assert.equal(distanciaAteSegmento({ x: 0, y: 3 }, { x: 1, y: 0 }, parede, 10), 10);
const cone = poligonoVisivel({ x: 0, y: 0 }, [parede], 10, { direcaoGraus: 0, aberturaGraus: 90 });
assert.ok(cone.pontos.every((p) => p.x >= -1e-7), "o cone não deve revelar o semiplano oposto");

export function gerarCena(largura, altura, quantidadeParedes, quantidadeFontes, seed) {
  let estado = seed >>> 0;
  const aleatorio = () => ((estado = (Math.imul(1664525, estado) + 1013904223) >>> 0) / 4294967296);
  const paredes = [];
  for (let i = 0; i < quantidadeParedes; i++) {
    const x = 2 + aleatorio() * (largura - 4);
    const y = 2 + aleatorio() * (altura - 4);
    const tamanho = 1 + aleatorio() * 5;
    paredes.push(segmento({ x, y }, aleatorio() < 0.5 ? { x: Math.min(largura, x + tamanho), y } : { x, y: Math.min(altura, y + tamanho) }));
  }
  const fontes = Array.from({ length: quantidadeFontes }, () => ({ x: 1 + aleatorio() * (largura - 2), y: 1 + aleatorio() * (altura - 2) }));
  return { paredes, fontes };
}

function medir(nome, largura, altura, paredes, fontes, raio) {
  const cena = gerarCena(largura, altura, paredes, fontes, 20261008);
  const rodar = () => cena.fontes.map((f) => poligonoVisivel(f, cena.paredes, raio));
  for (let i = 0; i < 3; i++) rodar();
  const amostras = [];
  let resultado;
  for (let i = 0; i < 20; i++) {
    const inicio = performance.now();
    resultado = rodar();
    amostras.push(performance.now() - inicio);
  }
  amostras.sort((a, b) => a - b);
  return {
    nome, dimensoes: `${largura}x${altura}`, paredes, fontes, raio,
    candidatosMedios: Math.round(resultado.reduce((n, r) => n + r.candidatos, 0) / fontes),
    verticesTotais: resultado.reduce((n, r) => n + r.pontos.length, 0),
    msP50: Number(amostras[9].toFixed(2)), msP95: Number(amostras[18].toFixed(2)),
    msMax: Number(amostras[19].toFixed(2)),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify({
    maquina: { cpu: os.cpus()[0]?.model, nucleos: os.cpus().length, node: process.version, plataforma: process.platform },
    escopo: "geometria síncrona de todos os observadores; sem pintura SVG/Canvas, composição, rede ou GC controlado",
    cenas: [
      medir("pequena", 32, 24, 40, 4, 12),
      medir("grande", 120, 100, 600, 16, 12),
      medir("teto-proposto", 120, 100, 600, 32, 20),
      medir("pior-alcance", 120, 100, 600, 16, 40),
    ],
  }, null, 2));
}
