/** Geometria 2D de luz e visão. Entrada axial; saída em pixels do mapa. */
import { hexParaPixel, type Hex } from "../_mapa/hex";
import type { ParedeLuz } from "../../../../../lib/vtt/lightStorage";

export interface SegmentoPixel { a: { x: number; y: number }; b: { x: number; y: number } }
const RAD = Math.PI / 180;
const EPS = 0.0001;
const cruz = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x * b.y - a.y * b.x;

export function paredesEmPixels(paredes: ParedeLuz[], tamanho: number, tipo: "luz" | "visao", narrador = false): SegmentoPixel[] {
  return paredes.filter((p) => (narrador || p.visivel) && !(p.porta && p.aberta)
    && (tipo === "luz" ? p.bloqueiaLuz : p.bloqueiaVisao)).map((p) => ({
    a: hexParaPixel(p.a, tamanho), b: hexParaPixel(p.b, tamanho),
  }));
}

function intersecao(origem: { x: number; y: number }, direcao: { x: number; y: number }, s: SegmentoPixel, limite: number): number {
  const v = { x: s.b.x - s.a.x, y: s.b.y - s.a.y };
  const den = cruz(direcao, v);
  if (Math.abs(den) < 1e-9) return limite;
  const q = { x: s.a.x - origem.x, y: s.a.y - origem.y };
  const t = cruz(q, v) / den;
  const u = cruz(q, direcao) / den;
  return t > 0.00001 && t < limite && u >= 0 && u <= 1 ? t : limite;
}

function perto(origem: { x: number; y: number }, s: SegmentoPixel, raio: number): boolean {
  const minX = Math.min(s.a.x, s.b.x), maxX = Math.max(s.a.x, s.b.x);
  const minY = Math.min(s.a.y, s.b.y), maxY = Math.max(s.a.y, s.b.y);
  const x = Math.max(minX, Math.min(origem.x, maxX));
  const y = Math.max(minY, Math.min(origem.y, maxY));
  return (x - origem.x) ** 2 + (y - origem.y) ** 2 <= raio ** 2;
}

export function poligonoLuz(origemAxial: Hex, raioM: number, paredes: SegmentoPixel[], tamanho: number,
  cone?: { direcaoGraus: number; aberturaGraus: number }): string {
  const origem = hexParaPixel(origemAxial, tamanho);
  const raio = raioM * Math.sqrt(3) * tamanho;
  const locais = paredes.filter((p) => perto(origem, p, raio));
  const centro = (cone?.direcaoGraus ?? 0) * RAD;
  const metade = cone ? cone.aberturaGraus * RAD / 2 : Math.PI;
  const relativo = (a: number) => Math.atan2(Math.sin(a - centro), Math.cos(a - centro));
  const angulos: number[] = [];
  for (let n = 0; n < 90; n++) angulos.push(n * 4 * RAD);
  for (const s of locais) for (const p of [s.a, s.b]) {
    const a = Math.atan2(p.y - origem.y, p.x - origem.x);
    angulos.push(a - EPS, a, a + EPS);
  }
  if (cone) angulos.push(centro - metade, centro + metade);
  const pontos = angulos.filter((a) => !cone || Math.abs(relativo(a)) <= metade + 1e-9).map((a) => {
    const d = { x: Math.cos(a), y: Math.sin(a) };
    let limite = raio;
    for (const s of locais) limite = intersecao(origem, d, s, limite);
    return { a, x: origem.x + d.x * limite, y: origem.y + d.y * limite };
  }).sort((a, b) => cone ? relativo(a.a) - relativo(b.a)
    : ((a.a % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)) - ((b.a % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)));
  if (pontos.length < 3) return "";
  const fmt = (n: number) => Number(n.toFixed(2));
  const path = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`).join(" ");
  return cone ? `M${fmt(origem.x)} ${fmt(origem.y)} ${path.replace(/^M/, "L")} Z` : `${path} Z`;
}
