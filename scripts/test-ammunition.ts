/**
 * Testes puros (sem Supabase) das funções de normalização e helpers
 * de munição — checkpoint v0.59, Fase 1.
 */

import assert from "node:assert/strict";
import {
  parseKitQuantidade,
  deriveModoMunicao,
  normalizeAmmoItemProfile,
  createDefaultAljava,
  addFletchasToAljava,
  consumeFletchaFromAljava,
  hasExistingAljava,
  getAljavaTotalFlechas,
  getAljavaEspacoLivre,
  isBowWeapon,
  isCrossbowWeapon,
  isFirearmWeapon,
  isAmmoItem,
  ALJAVA_CAPACIDADE_PADRAO,
  ALJAVA_FLECHAS_INICIAIS_QUANTIDADE,
  ALJAVA_FLECHAS_INICIAIS_SLUG,
  consumeAttackAmmo,
  checkAttackAmmoBlock,
} from "../src/lib/character/ammunition";
import type { Character } from "../src/lib/character/types";

console.log("=== test-ammunition ===\n");

// -------------------------------------------------------------
// 1. parseKitQuantidade
// -------------------------------------------------------------
assert.equal(parseKitQuantidade("12 flechas"), 12, "Extrai número de '12 flechas'.");
assert.equal(parseKitQuantidade("5"), 5, "Extrai número de '5'.");
assert.equal(parseKitQuantidade(null), null, "null retorna null.");
assert.equal(parseKitQuantidade(undefined), null, "undefined retorna null.");
assert.equal(parseKitQuantidade("sem número"), null, "String sem número retorna null.");
assert.equal(parseKitQuantidade(12), null, "Número (não string) retorna null.");
console.log("1. parseKitQuantidade — OK");

// -------------------------------------------------------------
// 2. deriveModoMunicao
// -------------------------------------------------------------
assert.equal(deriveModoMunicao("fogo", 15, "mun_pistola"), "carregador", "Arma de fogo → carregador.");
assert.equal(deriveModoMunicao("arremesso_disparo", 1, "flecha_simples"), "aljava", "Arco → aljava.");
assert.equal(deriveModoMunicao("arremesso_disparo", 1, "virotes"), "virote", "Besta → virote.");
assert.equal(deriveModoMunicao("arremesso_disparo", null, "flecha_simples"), null, "municaoMax null → null (sem munição).");
assert.equal(deriveModoMunicao(undefined, 30, null), "carregador", "municaoCompativelSlug ausente → carregador por padrão.");
console.log("2. deriveModoMunicao — OK");

// -------------------------------------------------------------
// 3. normalizeAmmoItemProfile — flecha simples
// -------------------------------------------------------------
const rawFlechaSimples = {
  slug: "flecha_simples",
  nome: "Flecha simples",
  categoria: "municao",
  estatisticas: {
    kit: "12 flechas",
    compatibilidade: {
      familia: "flecha_simples",
      itens: ["arco_curto", "arco_longo"],
    },
  },
};
const flechaProfile = normalizeAmmoItemProfile(rawFlechaSimples);
assert.equal(flechaProfile.slug, "flecha_simples");
assert.equal(flechaProfile.kitQuantidade, 12);
assert.equal(flechaProfile.familia, "flecha_simples");
assert.deepEqual(flechaProfile.armasCompativeis, ["arco_curto", "arco_longo"]);
console.log("3. normalizeAmmoItemProfile (flecha simples) — OK");

// -------------------------------------------------------------
// 4. normalizeAmmoItemProfile — flecha especial
// -------------------------------------------------------------
const rawFlechaEspecial = {
  slug: "flecha_perfurante",
  nome: "Flecha perfurante",
  categoria: "municao",
  estatisticas: {
    kit: "5 flechas",
    compatibilidade: {
      familia: "flecha_especial",
      itens: ["arco_longo"],
    },
  },
};
const flechaEspProfile = normalizeAmmoItemProfile(rawFlechaEspecial);
assert.equal(flechaEspProfile.kitQuantidade, 5);
assert.equal(flechaEspProfile.familia, "flecha_especial");
console.log("4. normalizeAmmoItemProfile (flecha especial) — OK");

// -------------------------------------------------------------
// 5. normalizeAmmoItemProfile — virote
// -------------------------------------------------------------
const rawVirote = {
  slug: "virote",
  nome: "Virote",
  categoria: "municao",
  estatisticas: {
    kit: "10 virotes",
    compatibilidade: {
      familia: "virotes",
      itens: ["besta_leve", "besta_pesada"],
    },
  },
};
const viroteProfile = normalizeAmmoItemProfile(rawVirote);
assert.equal(viroteProfile.kitQuantidade, 10);
assert.equal(viroteProfile.familia, "virotes");
console.log("5. normalizeAmmoItemProfile (virote) — OK");

// -------------------------------------------------------------
// 6. normalizeAmmoItemProfile — payload ausente/malformado não quebra
// -------------------------------------------------------------
const rawMalformado = { slug: "lixo" };
const malProfile = normalizeAmmoItemProfile(rawMalformado as Record<string, unknown>);
assert.equal(malProfile.slug, "lixo");
assert.equal(malProfile.kitQuantidade, null);
assert.equal(malProfile.familia, null);
assert.deepEqual(malProfile.armasCompativeis, []);
console.log("6. normalizeAmmoItemProfile (payload ausente/malformado) — OK");

// -------------------------------------------------------------
// 7. isBowWeapon / isCrossbowWeapon / isFirearmWeapon / isAmmoItem
// -------------------------------------------------------------
const mockArco = { categoria: "arma" as const, subtipo: "arremesso_disparo", municaoCompativelSlug: "flecha_simples" };
const mockBesta = { categoria: "arma" as const, subtipo: "arremesso_disparo", municaoCompativelSlug: "virotes" };
const mockPistola = { categoria: "arma" as const, subtipo: "fogo" };
const mockMunicao = { categoria: "municao" as const, subtipo: "municao" };
const mockEspada = { categoria: "arma" as const, subtipo: "corte" };

assert.ok(isBowWeapon(mockArco), "Arco reconhecido como bow.");
assert.ok(!isBowWeapon(mockBesta), "Besta não é bow.");
assert.ok(!isBowWeapon(mockPistola as typeof mockArco), "Pistola não é bow.");

assert.ok(isCrossbowWeapon(mockBesta), "Besta reconhecida como crossbow.");
assert.ok(!isCrossbowWeapon(mockArco), "Arco não é crossbow.");

assert.ok(isFirearmWeapon(mockPistola), "Pistola reconhecida como firearm.");
assert.ok(!isFirearmWeapon(mockEspada as typeof mockPistola), "Espada não é firearm.");

assert.ok(isAmmoItem(mockMunicao), "Munição reconhecida como ammo item.");
assert.ok(!isAmmoItem(mockArco), "Arco não é ammo item.");
console.log("7. Classificação de tipos de arma/munição — OK");

// -------------------------------------------------------------
// 8. createDefaultAljava — capacidade e flechas iniciais
// -------------------------------------------------------------
const aljava = createDefaultAljava();
assert.equal(aljava.capacidade, ALJAVA_CAPACIDADE_PADRAO, "Capacidade padrão.");
assert.equal(aljava.stacks.length, 1, "Uma stack inicial.");
assert.equal(aljava.stacks[0].contentSlug, ALJAVA_FLECHAS_INICIAIS_SLUG);
assert.equal(aljava.stacks[0].quantidade, ALJAVA_FLECHAS_INICIAIS_QUANTIDADE);
assert.equal(getAljavaTotalFlechas(aljava), ALJAVA_FLECHAS_INICIAIS_QUANTIDADE);
assert.equal(getAljavaEspacoLivre(aljava), ALJAVA_CAPACIDADE_PADRAO - ALJAVA_FLECHAS_INICIAIS_QUANTIDADE);
console.log("8. createDefaultAljava — OK");

// -------------------------------------------------------------
// 9. addFletchasToAljava — agrupa por tipo, respeita capacidade
// -------------------------------------------------------------
let aljavaVazia = { capacidade: 15, stacks: [] };
const r1 = addFletchasToAljava(aljavaVazia, "flecha_simples", "Flecha simples", 10);
assert.equal(r1.excedente, 0);
assert.equal(getAljavaTotalFlechas(r1.aljava), 10);

const r2 = addFletchasToAljava(r1.aljava, "flecha_simples", "Flecha simples", 10);
assert.equal(r2.excedente, 5, "Só 5 couberam (capacidade 15, já havia 10).");
assert.equal(getAljavaTotalFlechas(r2.aljava), 15, "Aljava cheia.");

const r3 = addFletchasToAljava(r1.aljava, "flecha_perfurante", "Flecha perfurante", 3);
assert.equal(r3.aljava.stacks.length, 2, "Novo tipo cria novo stack.");
assert.equal(getAljavaTotalFlechas(r3.aljava), 13);
console.log("9. addFletchasToAljava — OK");

// -------------------------------------------------------------
// 10. consumeFletchaFromAljava — consome 1 do stack correto
// -------------------------------------------------------------
const aljavaComDoisTipos = r3.aljava;
const aposConsumo = consumeFletchaFromAljava(aljavaComDoisTipos, "flecha_perfurante");
assert.ok(aposConsumo !== null);
assert.equal(getAljavaTotalFlechas(aposConsumo!), 12, "Total diminuiu 1.");
const stackPerf = aposConsumo!.stacks.find((s) => s.contentSlug === "flecha_perfurante");
assert.equal(stackPerf?.quantidade, 2, "Stack perfurante diminuiu 1.");

// Consome o último de um tipo — stack é removido
let aljavaComUm = { capacidade: 15, stacks: [{ contentSlug: "flecha_perfurante", nome: "Flecha perfurante", quantidade: 1 }] };
const aposUltima = consumeFletchaFromAljava(aljavaComUm, "flecha_perfurante");
assert.ok(aposUltima !== null);
assert.equal(aposUltima!.stacks.length, 0, "Stack removido ao zerar.");

// Slug inexistente retorna null
const semSlug = consumeFletchaFromAljava(aljavaComDoisTipos, "slug_inexistente");
assert.equal(semSlug, null, "Slug inexistente retorna null.");
console.log("10. consumeFletchaFromAljava — OK");

// -------------------------------------------------------------
// 11. hasExistingAljava — detecta aljava em inventário
// -------------------------------------------------------------
const charComAljaava: Pick<Character, "inventario"> = {
  inventario: [
    { id: "arco-1", itemSlug: "arco_curto", quantidade: 1, aljava: createDefaultAljava() } as any,
  ],
};
const charSemAljava: Pick<Character, "inventario"> = {
  inventario: [
    { id: "espada-1", itemSlug: "espada_curta", quantidade: 1 } as any,
  ],
};
assert.ok(hasExistingAljava(charComAljaava), "Personagem com aljava detectado.");
assert.ok(!hasExistingAljava(charSemAljava), "Personagem sem aljava não detectado erroneamente.");
assert.ok(!hasExistingAljava({ inventario: [] }), "Inventário vazio retorna false.");
assert.ok(!hasExistingAljava({ inventario: undefined as any }), "Inventário undefined retorna false.");
console.log("11. hasExistingAljava — OK");

// -------------------------------------------------------------
// 12. Personagens antigos sem campos de munição continuam carregando
// -------------------------------------------------------------
const charAntigo: Pick<Character, "inventario"> = {
  inventario: [
    { id: "pistola-velha", itemSlug: "pistola_9mm", quantidade: 1 } as any,
    { id: "arco-velho", itemSlug: "arco_curto", quantidade: 1 } as any,
  ],
};
// Não deve explodir ao acessar campos opcionais
const instanciaAntiga = charAntigo.inventario![0] as any;
assert.equal(instanciaAntiga.municaoAtual, undefined, "Campo municaoAtual ausente em personagem antigo.");
assert.equal(instanciaAntiga.aljava, undefined, "Campo aljava ausente em personagem antigo.");
assert.ok(!hasExistingAljava(charAntigo), "hasExistingAljava não explode com personagem antigo.");
console.log("12. Personagens antigos continuam carregando sem campos de munição — OK");

// -------------------------------------------------------------
// 13. consumeAttackAmmo — carregador: bloqueia com municaoAtual=0;
//     consome quando > 0; aljava: auto-seleciona 1 tipo; requer seleção com 2+
// -------------------------------------------------------------
const modeloPistola = { slug: "pistola_de_bolso", subtipo: "fogo", usesAmmunition: true as const, municaoMax: 8, municaoCompativelSlug: "mun_pistola" };
const modeloArco = { slug: "arco_curto", subtipo: "arremesso_disparo", usesAmmunition: true as const, municaoMax: 1, municaoCompativelSlug: "flecha_simples" };

// Carregador cheio → consome 1
const charPistolaCheia: Character = {
  inventario: [{ id: "p1", itemSlug: "pistola_de_bolso", itemNome: "Pistola", categoria: "arma", subtipo: "fogo", quantidade: 1, estado: "empunhado", municaoAtual: 8 } as any],
} as any;
const consumePistola = consumeAttackAmmo(charPistolaCheia, [modeloPistola]);
assert.equal(consumePistola.motivoFalha, null, "Carregador cheio — sem falha.");
assert.equal(consumePistola.consumedFromInstanceId, "p1");
const municaoApos = (consumePistola.character.inventario?.[0] as any).municaoAtual;
assert.equal(municaoApos, 7, "municaoAtual decrementada de 8 para 7.");

// Carregador vazio → bloqueia
const charPistolaVazia: Character = {
  inventario: [{ id: "p1", itemSlug: "pistola_de_bolso", itemNome: "Pistola", categoria: "arma", subtipo: "fogo", quantidade: 1, estado: "empunhado", municaoAtual: 0 } as any],
} as any;
const bloqueioVazia = consumeAttackAmmo(charPistolaVazia, [modeloPistola]);
assert.equal(bloqueioVazia.motivoFalha, "sem_municao", "Carregador vazio → sem_municao.");
assert.equal(bloqueioVazia.consumedFromInstanceId, null);

// checkAttackAmmoBlock coerente com consumeAttackAmmo
assert.equal(checkAttackAmmoBlock(charPistolaVazia, [modeloPistola]), "sem_municao");
assert.equal(checkAttackAmmoBlock(charPistolaCheia, [modeloPistola]), null);

// Aljava com 1 tipo → auto-seleciona
const aljavaSimples = { capacidade: 15, stacks: [{ contentSlug: "flecha_simples", nome: "Flecha simples", quantidade: 5 }] };
const charArcoSimples: Character = {
  inventario: [{ id: "a1", itemSlug: "arco_curto", itemNome: "Arco curto", categoria: "arma", subtipo: "arremesso_disparo", quantidade: 1, estado: "empunhado", aljava: aljavaSimples } as any],
} as any;
const consumeArcoSimples = consumeAttackAmmo(charArcoSimples, [modeloArco]);
assert.equal(consumeArcoSimples.motivoFalha, null, "Aljava com 1 tipo — auto-seleciona.");
assert.equal(consumeArcoSimples.consumedFlechaSlug, "flecha_simples");
assert.equal(consumeArcoSimples.isFlechaEspecial, false, "flecha_simples não é especial.");
const aljavaTotalApos = getAljavaTotalFlechas((consumeArcoSimples.character.inventario?.[0] as any).aljava);
assert.equal(aljavaTotalApos, 4, "Aljava passou de 5 para 4.");

console.log("13. consumeAttackAmmo (carregador + aljava 1 tipo) — OK");

// -------------------------------------------------------------
// 14. consumeAttackAmmo — aljava 2 tipos: exige seleção explícita;
//     seleção errada → flecha_sem_estoque; flecha especial → isFlechaEspecial
// -------------------------------------------------------------
const aljava2Tipos = {
  capacidade: 15,
  stacks: [
    { contentSlug: "flecha_simples", nome: "Flecha simples", quantidade: 5 },
    { contentSlug: "flecha_flamejante", nome: "Flecha flamejante", quantidade: 3 },
  ],
};
const charArco2: Character = {
  inventario: [{ id: "a2", itemSlug: "arco_curto", itemNome: "Arco curto", categoria: "arma", subtipo: "arremesso_disparo", quantidade: 1, estado: "empunhado", aljava: aljava2Tipos } as any],
} as any;

// Sem seleção → flecha_nao_selecionada
const semSelecao = consumeAttackAmmo(charArco2, [modeloArco]);
assert.equal(semSelecao.motivoFalha, "flecha_nao_selecionada", "2 tipos sem seleção → bloqueado.");
assert.equal(semSelecao.consumedFromInstanceId, null);
assert.equal(checkAttackAmmoBlock(charArco2, [modeloArco]), "flecha_nao_selecionada");

// Com seleção de flecha especial → consome correta e isFlechaEspecial=true
const comSelecao = consumeAttackAmmo(charArco2, [modeloArco], { selectedFlechaSlug: "flecha_flamejante" });
assert.equal(comSelecao.motivoFalha, null, "Seleção explícita de flecha especial — sem falha.");
assert.equal(comSelecao.consumedFlechaSlug, "flecha_flamejante");
assert.equal(comSelecao.isFlechaEspecial, true, "Flecha especial → isFlechaEspecial.");
const stackSimples = (comSelecao.character.inventario?.[0] as any).aljava.stacks.find((s: any) => s.contentSlug === "flecha_simples");
const stackFlam = (comSelecao.character.inventario?.[0] as any).aljava.stacks.find((s: any) => s.contentSlug === "flecha_flamejante");
assert.equal(stackSimples.quantidade, 5, "Flecha simples não foi consumida.");
assert.equal(stackFlam.quantidade, 2, "Flecha flamejante decrementou de 3 para 2.");

// Slug inexistente → flecha_sem_estoque
const slugErrado = consumeAttackAmmo(charArco2, [modeloArco], { selectedFlechaSlug: "flecha_toxica" });
assert.equal(slugErrado.motivoFalha, "flecha_sem_estoque");

// Seleção com checkAttackAmmoBlock coerente
assert.equal(checkAttackAmmoBlock(charArco2, [modeloArco], { selectedFlechaSlug: "flecha_flamejante" }), null);
assert.equal(checkAttackAmmoBlock(charArco2, [modeloArco], { selectedFlechaSlug: "flecha_toxica" }), "flecha_sem_estoque");

console.log("14. consumeAttackAmmo (aljava 2 tipos + flecha especial) — OK");

console.log("\ntest-ammunition — todos os cenários passaram.");
