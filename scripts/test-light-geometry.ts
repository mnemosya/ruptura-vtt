import assert from "node:assert/strict";
import { paredesEmPixels, poligonoLuz } from "../src/app/mesas/[campaignId]/vtt/_dominio/iluminacao";
import type { ParedeLuz } from "../src/lib/vtt/lightStorage";

function pontos(path: string): { x: number; y: number }[] {
  return [...path.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)]
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}

const parede = [{ a: { x: 15, y: -100 }, b: { x: 15, y: 100 } }];
const radial = pontos(poligonoLuz({ q: 0, r: 0 }, 3, parede, 10));
assert.ok(radial.length > 90, "parede acrescenta raios nos vértices");
assert.ok(radial.every((p) => p.x <= 15.01), "a luz não atravessa a parede");

const cone = pontos(poligonoLuz({ q: 0, r: 0 }, 3, [], 10, { direcaoGraus: 0, aberturaGraus: 90 }));
assert.ok(cone.length > 10);
assert.ok(cone.every((p) => p.x >= -0.01), "cone não ilumina atrás da origem");

const base: ParedeLuz = {
  id: "w", sceneId: "s", a: { q: 0, r: 0 }, b: { q: 1, r: 0 },
  bloqueiaLuz: true, bloqueiaVisao: false, porta: true, aberta: false,
  visivel: true, revision: 1,
};
assert.equal(paredesEmPixels([base], 10, "luz").length, 1);
assert.equal(paredesEmPixels([base], 10, "visao").length, 0);
assert.equal(paredesEmPixels([{ ...base, aberta: true }], 10, "luz").length, 0);
assert.equal(paredesEmPixels([{ ...base, visivel: false }], 10, "luz").length, 0);
console.log("LIGHT-02: geometria, cone e portas aprovados");
