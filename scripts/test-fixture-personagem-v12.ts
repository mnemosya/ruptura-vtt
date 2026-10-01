import assert from "node:assert/strict";
import { validateCharacterV2 } from "../src/lib/rulesetV12";
import { personagemV12 } from "./dev/fixtures/personagemV12";

/** A fixture de personagem v1.2 dos scripts de dev continua válida e mescla direito. */
const base = personagemV12("Base");
const v = validateCharacterV2(base);
assert.equal(v.ok, true, v.errors.join(" | "));
const p = personagemV12("Raven", { atributos: { corpo: 3 }, carteira: { aretz_informal: 99 }, inventario: [] }) as unknown as Record<string, any>;
assert.equal(p.nome, "Raven");
assert.equal(p.atributos.corpo, 3);
assert.equal(p.atributos.mente, 2, "mescla rasa preserva os outros atributos");
assert.equal(p.carteira.aretz_informal, 99);
assert.equal(p.schema_version, 2);
assert.equal(p.progressao.classe_id, "ancora");
assert.equal(validateCharacterV2(p).ok, true);
const forcado = personagemV12("X", { schema_version: 1 }) as unknown as Record<string, any>;
assert.equal(forcado.schema_version, 2, "o envelope v1.2 não é sobrescrito");
console.log("test-fixture-personagem-v12 — fixture v1.2 válida.");
