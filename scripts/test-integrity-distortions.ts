import assert from "node:assert/strict";
import { DISTORCOES_IDENTIDADE, quantidadeDistorcoesIdentidade } from "../src/lib/character/identityDistortions";
import { normalizeCharacter } from "../src/lib/character/normalizeCharacter";
import { createInitialCharacter } from "../src/lib/character/createCharacter";

assert.deepEqual([7, 6, 5, 4, 3, 2, 1, 0].map(quantidadeDistorcoesIdentidade), [0, 1, 1, 2, 2, 3, 3, 3]);
assert.equal(DISTORCOES_IDENTIDADE.length, 10);
assert.equal(new Set(DISTORCOES_IDENTIDADE.map((item) => item.id)).size, 10);
const character = createInitialCharacter(null);
const preserved = normalizeCharacter({ ...character, distorcoes_identidade: ["ritualismo", "", "dissociacao"] });
assert.deepEqual(preserved.distorcoes_identidade, ["ritualismo", "", "dissociacao"]);
console.log("integridade: faixas e dez distorções do capítulo 19 — OK");
