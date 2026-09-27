import assert from "node:assert/strict";
import { lerTargets, targetsVisiveis } from "../src/app/mesas/[campaignId]/vtt/_dominio/targets";
const agora = Date.parse("2026-09-27T12:00:00Z");
const vivo = new Date(agora + 90000).toISOString();
const expirado = new Date(agora).toISOString();
const entradas = lerTargets([
  { tokenId: "visivel", autorId: "a", expiresAt: vivo },
  { tokenId: "visivel", autorId: "b", expiresAt: vivo },
  { tokenId: "oculto", autorId: "a", expiresAt: vivo },
  { tokenId: "expirou", autorId: "a", expiresAt: expirado },
  { tokenId: "ruim", autorId: "a", expiresAt: "inválida" },
  null,
]);
assert.equal(entradas.length, 4);
assert.deepEqual(lerTargets(null), []);
assert.equal(targetsVisiveis(entradas, new Set(["visivel", "expirou"]), agora).length, 2);
assert.deepEqual(targetsVisiveis(entradas, new Set(), agora), []);
assert.deepEqual(targetsVisiveis(entradas, new Set(["visivel"]), agora + 90000), []);
console.log("test-vtt-targets: payload, múltiplos autores, ocultação, cena e expiração — OK");
