import assert from "node:assert/strict";
import {
  characterDerivedFormulas,
  computeDerivedStats,
  limiteSobrecarga,
  previaRuptura,
  removerUltimoSurto,
  resetOverloadForLongRest,
  resolverRupturaV12,
  rupturasSofridas,
  type Character,
} from "../src/lib/character";
import { MARCAS_RUPTURA, TIPOS_TRACO, tracoPorDados } from "../src/lib/rulesetV12/ruptura";

const formula = (c: number, attr: string) => ({ op: "+" as const, args: [{ const: c }, { ref: "atributo" as const, id: attr }] });
const base = {
  nome: "Teste",
  atributos: { corpo: 2, mente: 1, animo: 2 },
  pericias: {},
  recursos_atuais: { pv: 12, pe: 14, mana: 16, integridade: 14 },
  progressao: { formulas_derivados: { pv_max: formula(10, "corpo"), pe_max: formula(13, "mente") } },
  sobrecarga_usada_dia: 3,
  ruptura_pendente: true,
  ruptura_nivel_pendente: 1,
  historico_ruptura: [],
} as unknown as Character;
const nowIso = "2026-10-21T12:00:00Z";
const ok = (r: ReturnType<typeof resolverRupturaV12>) => { if ("erro" in r) throw new Error(r.erro); return r; };

// Catálogo do livro: 15 Marcas, 4 tipos × 8 Traços.
assert.equal(MARCAS_RUPTURA.length, 15);
assert.equal(new Set(MARCAS_RUPTURA.map((m) => m.id)).size, 15);
assert.equal(TIPOS_TRACO.length, 4);
assert.ok(TIPOS_TRACO.every((t) => t.tracos.length === 8));
assert.equal(tracoPorDados(3, 6)?.nome, "Fascínio quebrado");

// 1ª Ruptura: −1 Integridade, Mana + Ânimo + 2, limite 3 → 4 só depois do descanso longo.
const p1 = previaRuptura(base);
assert.deepEqual([p1.numero, p1.integridadeAntes, p1.integridadeDepois, p1.manaBonus, p1.limiteAntes, p1.limiteDepois], [1, 14, 13, 4, 3, 4]);
const r1 = ok(resolverRupturaV12(base, { marcaId: "carapaca_arcana", traco: { tipo: 1, numero: 2 } }, { nowIso }));
assert.equal(r1.character.recursos_atuais?.integridade, 13);
assert.equal(r1.character.mana_bonus_ruptura, 4);
assert.equal(r1.character.ruptura_pendente, false);
assert.equal(rupturasSofridas(r1.character), 1);
assert.equal(limiteSobrecarga(r1.character), 3, "limite novo ainda não vale");
assert.equal(r1.character.historico_ruptura?.[0].marcaId, "carapaca_arcana");
assert.deepEqual(r1.character.historico_ruptura?.[0].traco, { tipo: 1, numero: 2 });

// Carapaça Arcana: PV máx + Corpo + 3 pela fórmula da ficha.
const derivados = computeDerivedStats(r1.character.atributos, null, 0, characterDerivedFormulas(r1.character));
assert.equal(derivados.pv_max, 12 + 5);
assert.equal(derivados.pe_max, 14, "PE não muda com Carapaça");

// Descanso longo: zera a Sobrecarga e o limite passa a 4.
const descansado = resetOverloadForLongRest(r1.character);
assert.equal(descansado.sobrecarga_usada_dia, 0);
assert.equal(limiteSobrecarga(descansado), 4);
assert.equal(descansado.sobrecarga_limite_bonus_pendente, 0);

// 2ª Ruptura custa 2; 3ª custa 3. Limite nunca passa de 5.
const r2 = ok(resolverRupturaV12({ ...descansado, ruptura_pendente: true }, { marcaId: "escudo_psiquico", traco: { tipo: 2, numero: 1 } }, { nowIso }));
assert.equal(r2.character.recursos_atuais?.integridade, 11);
const r3 = ok(resolverRupturaV12({ ...resetOverloadForLongRest(r2.character), ruptura_pendente: true }, { marcaId: "furia_arcana", traco: { tipo: 4, numero: 8 } }, { nowIso }));
assert.equal(r3.character.recursos_atuais?.integridade, 8);
const r3d = resetOverloadForLongRest(r3.character);
assert.equal(limiteSobrecarga(r3d), 5);
const p4 = previaRuptura({ ...r3d, ruptura_pendente: true });
assert.deepEqual([p4.perda, p4.limiteAntes, p4.limiteDepois], [4, 5, 5], "limite trava em 5");

// Integridade a 0: Última Vontade.
const quase = { ...base, recursos_atuais: { ...base.recursos_atuais, integridade: 1 } } as Character;
const fim = ok(resolverRupturaV12(quase, { marcaId: "sussurro_arcano", traco: { tipo: 1, numero: 1 } }, { nowIso }));
assert.equal(fim.character.recursos_atuais?.integridade, 0);
assert.equal(fim.character.ultima_vontade_pendente, true);

// Sem Ruptura pendente, ou sem Marca: recusa.
assert.ok("erro" in resolverRupturaV12({ ...base, ruptura_pendente: false }, { marcaId: "sussurro_arcano", traco: { tipo: 1, numero: 1 } }, { nowIso }));
assert.ok("erro" in resolverRupturaV12(base, { marcaId: "", traco: { tipo: 1, numero: 1 } }, { nowIso }));

// Desfazer o surto que alcançou o limite apaga a Ruptura; um surto anterior, não.
const desfeito = removerUltimoSurto(base, 3);
assert.equal(desfeito.sobrecarga_usada_dia, 2);
assert.equal(desfeito.ruptura_pendente, false);
const doisSurtos = removerUltimoSurto({ ...base, sobrecarga_usada_dia: 2, ruptura_pendente: false }, 3);
assert.equal(doisSurtos.sobrecarga_usada_dia, 1);

console.log("ruptura-v12: preço, limite, Marcas na ficha, Última Vontade e desfazer — OK");
