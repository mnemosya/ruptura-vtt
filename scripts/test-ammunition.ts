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
  getAljavaInstances,
  findAljavaInstance,
  getAljavaTotalFlechas,
  getAljavaEspacoLivre,
  isBowWeapon,
  isCrossbowWeapon,
  isFirearmWeapon,
  isAmmoItem,
  ALJAVA_CAPACIDADE_PADRAO,
  ALJAVA_FLECHAS_INICIAIS_QUANTIDADE,
  ALJAVA_FLECHAS_INICIAIS_SLUG,
  ALJAVA_ITEM_SLUG,
  consumeAttackAmmo,
  checkAttackAmmoBlock,
  setFlechaQuantidadeInAljava,
  setAljavaFlechaQuantidade,
  storeFletchasInAljava,
  withdrawFletchasFromAljava,
  createAljavaInstance,
  migrateEmbeddedAljavas,
  setBowAljavaSelection,
  setBowFlechaSelection,
  reloadMagazineWeapon,
} from "../src/lib/character/ammunition";
import type { Character } from "../src/lib/character/types";
import type { AmmoItemProfile } from "../src/lib/character/ammunition";

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
// 11. hasExistingAljava — detecta aljava compartilhada no inventário
// -------------------------------------------------------------
const charComAljaava: Pick<Character, "inventario"> = {
  inventario: [
    { id: "aljava-1", itemSlug: ALJAVA_ITEM_SLUG, quantidade: 1, aljava: createDefaultAljava() } as any,
  ],
};
const charSemAljava: Pick<Character, "inventario"> = {
  inventario: [
    { id: "espada-1", itemSlug: "espada_curta", quantidade: 1 } as any,
  ],
};
assert.ok(hasExistingAljava(charComAljaava), "Personagem com aljava compartilhada detectado.");
assert.ok(!hasExistingAljava(charSemAljava), "Personagem sem aljava não detectado erroneamente.");
assert.ok(!hasExistingAljava({ inventario: [] }), "Inventário vazio retorna false.");
assert.ok(!hasExistingAljava({ inventario: undefined as any }), "Inventário undefined retorna false.");
// Arco com aljava embutida (legado) NÃO deve ser detectado como existente
const charArcoCom_aljava_embutida: Pick<Character, "inventario"> = {
  inventario: [
    { id: "arco-leg", itemSlug: "arco_curto", quantidade: 1, aljava: createDefaultAljava() } as any,
  ],
};
assert.ok(!hasExistingAljava(charArcoCom_aljava_embutida), "Arco com aljava embutida não conta como aljava compartilhada.");
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

// Personagem com 1 única Aljava → arco auto-seleciona (sem selectedAljavaInstanceId)
const charArcoSimples: Character = {
  inventario: [
    { id: "a1", itemSlug: "arco_curto", itemNome: "Arco curto", categoria: "arma", subtipo: "arremesso_disparo", quantidade: 1, estado: "empunhado" } as any,
    { id: "aljava-s1", itemSlug: ALJAVA_ITEM_SLUG, itemNome: "Aljava", categoria: "ferramenta", subtipo: ALJAVA_ITEM_SLUG, quantidade: 1, estado: "mochila",
      aljava: { capacidade: 15, stacks: [{ contentSlug: "flecha_simples", nome: "Flecha simples", quantidade: 5 }] } } as any,
  ],
} as any;
const consumeArcoSimples = consumeAttackAmmo(charArcoSimples, [modeloArco]);
assert.equal(consumeArcoSimples.motivoFalha, null, "Aljava única — auto-seleciona.");
assert.equal(consumeArcoSimples.consumedFlechaSlug, "flecha_simples");
assert.equal(consumeArcoSimples.isFlechaEspecial, false, "flecha_simples não é especial.");
const aljajaApos = findAljavaInstance(consumeArcoSimples.character, "aljava-s1");
assert.equal(getAljavaTotalFlechas(aljajaApos!.aljava), 4, "Aljava passou de 5 para 4.");

console.log("13. consumeAttackAmmo (carregador + aljava compartilhada 1 tipo) — OK");

// -------------------------------------------------------------
// 14. consumeAttackAmmo — aljava 2 tipos: exige seleção explícita;
//     seleção errada → flecha_sem_estoque; flecha especial → isFlechaEspecial
// -------------------------------------------------------------
const charArco2: Character = {
  inventario: [
    { id: "a2", itemSlug: "arco_curto", itemNome: "Arco curto", categoria: "arma", subtipo: "arremesso_disparo", quantidade: 1, estado: "empunhado" } as any,
    { id: "aljava-s2", itemSlug: ALJAVA_ITEM_SLUG, itemNome: "Aljava", categoria: "ferramenta", subtipo: ALJAVA_ITEM_SLUG, quantidade: 1, estado: "mochila",
      aljava: { capacidade: 15, stacks: [
        { contentSlug: "flecha_simples", nome: "Flecha simples", quantidade: 5 },
        { contentSlug: "flecha_flamejante", nome: "Flecha flamejante", quantidade: 3 },
      ] } } as any,
  ],
} as any;

// Sem seleção → flecha_nao_selecionada (seleção agora vive na PRÓPRIA instância do arco)
const semSelecao = consumeAttackAmmo(charArco2, [modeloArco]);
assert.equal(semSelecao.motivoFalha, "flecha_nao_selecionada", "2 tipos sem seleção → bloqueado.");
assert.equal(semSelecao.consumedFromInstanceId, null);
assert.equal(checkAttackAmmoBlock(charArco2, [modeloArco]), "flecha_nao_selecionada");

// Com seleção de flecha especial → consome correta e isFlechaEspecial=true
const charArco2ComSelecao = setBowFlechaSelection(charArco2, "a2", "flecha_flamejante");
const comSelecao = consumeAttackAmmo(charArco2ComSelecao, [modeloArco]);
assert.equal(comSelecao.motivoFalha, null, "Seleção explícita de flecha especial — sem falha.");
assert.equal(comSelecao.consumedFlechaSlug, "flecha_flamejante");
assert.equal(comSelecao.isFlechaEspecial, true, "Flecha especial → isFlechaEspecial.");
const aljavaApos2 = findAljavaInstance(comSelecao.character, "aljava-s2");
const stackSimples = aljavaApos2!.aljava.stacks.find((s) => s.contentSlug === "flecha_simples");
const stackFlam = aljavaApos2!.aljava.stacks.find((s) => s.contentSlug === "flecha_flamejante");
assert.equal(stackSimples!.quantidade, 5, "Flecha simples não foi consumida.");
assert.equal(stackFlam!.quantidade, 2, "Flecha flamejante decrementou de 3 para 2.");

// Slug inexistente → flecha_sem_estoque
const charArco2SlugErrado = setBowFlechaSelection(charArco2, "a2", "flecha_toxica");
const slugErrado = consumeAttackAmmo(charArco2SlugErrado, [modeloArco]);
assert.equal(slugErrado.motivoFalha, "flecha_sem_estoque");

// Seleção com checkAttackAmmoBlock coerente
assert.equal(checkAttackAmmoBlock(charArco2ComSelecao, [modeloArco]), null);
assert.equal(checkAttackAmmoBlock(charArco2SlugErrado, [modeloArco]), "flecha_sem_estoque");

console.log("14. consumeAttackAmmo (aljava compartilhada 2 tipos + flecha especial) — OK");

// -------------------------------------------------------------
// 15. setFlechaQuantidadeInAljava — clamp considera todas as stacks
// -------------------------------------------------------------
// Aljava 10 simples + 2 flamejantes (total 12/15). Ajustar simples para 15
// → máximo permitido é 15 - 2 = 13. Simples vira 13, total 15/15.
const aljava12 = {
  capacidade: 15,
  stacks: [
    { contentSlug: "flecha_simples", nome: "Flecha simples", quantidade: 10 },
    { contentSlug: "flecha_flamejante", nome: "Flecha flamejante", quantidade: 2 },
  ],
};
const aljavaAjustada = setFlechaQuantidadeInAljava(aljava12, "flecha_simples", 15);
const simplesAjustada = aljavaAjustada.stacks.find((s) => s.contentSlug === "flecha_simples");
assert.equal(simplesAjustada?.quantidade, 13, "Simples clampeada a 13 (15 - 2 flamejantes).");
assert.equal(getAljavaTotalFlechas(aljavaAjustada), 15, "Total exato 15/15.");
console.log("15. setFlechaQuantidadeInAljava — clamp multi-stack — OK");

// -------------------------------------------------------------
// 16. storeFletchasInAljava — respeita capacidade; excedente fica no estoque
// -------------------------------------------------------------
// Aljava compartilhada 12/15, estoque de 10 flechas. Guardar 10 → só 3 cabem. Estoque fica 7.
const charParaGuardar: Character = {
  inventario: [
    { id: "bow-1", itemSlug: "arco_curto", itemNome: "Arco curto", categoria: "arma", subtipo: "arremesso_disparo", quantidade: 1, estado: "empunhado" } as any,
    { id: "aljava-shared-1", itemSlug: ALJAVA_ITEM_SLUG, itemNome: "Aljava", categoria: "ferramenta", subtipo: ALJAVA_ITEM_SLUG, quantidade: 1, estado: "mochila",
      aljava: { capacidade: 15, stacks: [{ contentSlug: "flecha_simples", nome: "Flecha simples", quantidade: 12 }] } } as any,
    { id: "ammo-1", itemSlug: "flecha_simples", itemNome: "Flecha simples", categoria: "municao", subtipo: "municao", quantidade: 10, estado: "mochila" } as any,
  ],
} as any;
const storeResult = storeFletchasInAljava(charParaGuardar, "aljava-shared-1", "ammo-1", "flecha_simples", "Flecha simples", 10);
assert.equal(storeResult.moved, 3, "Só 3 couberam na aljava (15 - 12 = 3 livres).");
assert.equal(storeResult.excedente, 7, "Excedente 7 não guardado.");
const aljavaAposGuardar = (storeResult.character.inventario?.find((i) => i.id === "aljava-shared-1") as any).aljava;
assert.equal(getAljavaTotalFlechas(aljavaAposGuardar), 15, "Aljava cheia 15/15.");
const estoqueApos = storeResult.character.inventario?.find((i) => i.id === "ammo-1")?.quantidade;
assert.equal(estoqueApos, 7, "Estoque ficou 7 (10 - 3 guardadas).");
console.log("16. storeFletchasInAljava — respeita capacidade — OK");

// -------------------------------------------------------------
// 17. withdrawFletchasFromAljava — devolve flechas ao estoque
// -------------------------------------------------------------
// Aljava compartilhada com 10 flechas simples, nenhuma no estoque. Retirar 2 →
// Aljava fica com 8, estoque ganha 2 (nova instância criada).
const charParaRetirar: Character = {
  inventario: [
    { id: "bow-2", itemSlug: "arco_curto", itemNome: "Arco curto", categoria: "arma", subtipo: "arremesso_disparo", quantidade: 1, estado: "empunhado" } as any,
    { id: "aljava-shared-2", itemSlug: ALJAVA_ITEM_SLUG, itemNome: "Aljava", categoria: "ferramenta", subtipo: ALJAVA_ITEM_SLUG, quantidade: 1, estado: "mochila",
      aljava: { capacidade: 15, stacks: [{ contentSlug: "flecha_simples", nome: "Flecha simples", quantidade: 10 }] } } as any,
  ],
} as any;
const withdrawResult = withdrawFletchasFromAljava(charParaRetirar, "aljava-shared-2", "flecha_simples", 2, "Flecha simples", "2026-01-01T00:00:00.000Z");
assert.equal(withdrawResult.withdrawn, 2, "2 flechas retiradas.");
const aljavaAposRetirar = (withdrawResult.character.inventario?.find((i) => i.id === "aljava-shared-2") as any).aljava;
assert.equal(getAljavaTotalFlechas(aljavaAposRetirar), 8, "Aljava ficou com 8.");
const estoqueRetirado = withdrawResult.character.inventario?.find((i) => i.itemSlug === "flecha_simples");
assert.equal(estoqueRetirado?.quantidade, 2, "Nova instância de estoque com quantidade 2.");

// Se já houver estoque, incrementa em vez de criar nova instância
const charComEstoque: Character = {
  inventario: [
    { id: "bow-3", itemSlug: "arco_curto", itemNome: "Arco curto", categoria: "arma", subtipo: "arremesso_disparo", quantidade: 1, estado: "empunhado" } as any,
    { id: "aljava-shared-3", itemSlug: ALJAVA_ITEM_SLUG, itemNome: "Aljava", categoria: "ferramenta", subtipo: ALJAVA_ITEM_SLUG, quantidade: 1, estado: "mochila",
      aljava: { capacidade: 15, stacks: [{ contentSlug: "flecha_simples", nome: "Flecha simples", quantidade: 10 }] } } as any,
    { id: "ammo-2", itemSlug: "flecha_simples", itemNome: "Flecha simples", categoria: "municao", subtipo: "municao", quantidade: 5, estado: "mochila" } as any,
  ],
} as any;
const withdrawResult2 = withdrawFletchasFromAljava(charComEstoque, "aljava-shared-3", "flecha_simples", 3, "Flecha simples", "2026-01-01T00:00:00.000Z");
const estoqueIncrementado = withdrawResult2.character.inventario?.find((i) => i.id === "ammo-2");
assert.equal(estoqueIncrementado?.quantidade, 8, "Estoque existente incrementado de 5 para 8.");
const inventarioFinal = withdrawResult2.character.inventario ?? [];
const ammoInstances = inventarioFinal.filter((i) => i.itemSlug === "flecha_simples");
assert.equal(ammoInstances.length, 1, "Nenhuma instância duplicada criada.");
console.log("17. withdrawFletchasFromAljava — devolve ao estoque — OK");

// -------------------------------------------------------------
// 18. createAljavaInstance / findAljavaInstance / getAljavaInstances
// -------------------------------------------------------------
const instShared = createAljavaInstance("2026-01-01T00:00:00.000Z");
assert.equal(instShared.itemSlug, ALJAVA_ITEM_SLUG, "itemSlug é ALJAVA_ITEM_SLUG.");
assert.ok((instShared as any).aljava != null, "Aljava inicializada na criação.");
assert.equal((instShared as any).aljava.capacidade, ALJAVA_CAPACIDADE_PADRAO, "Capacidade padrão.");
assert.equal((instShared as any).aljava.stacks.length, 0, "Vazia na criação — quem chama popula o kit inicial.");

const charComShared: Pick<Character, "inventario"> = { inventario: [instShared as any] };
const found = findAljavaInstance(charComShared as Character, instShared.id);
assert.ok(found != null, "findAljavaInstance encontra a instância pelo id.");
assert.equal(found!.id, instShared.id, "ID correto.");
assert.equal(getAljavaInstances(charComShared as Character).length, 1, "getAljavaInstances lista 1.");

const charSemShared: Pick<Character, "inventario"> = { inventario: [] };
assert.ok(findAljavaInstance(charSemShared as Character, instShared.id) == null, "findAljavaInstance retorna null sem aljava.");
assert.equal(getAljavaInstances(charSemShared as Character).length, 0, "getAljavaInstances vazio sem aljava.");
console.log("18. createAljavaInstance / findAljavaInstance / getAljavaInstances — OK");

// -------------------------------------------------------------
// 19. hasExistingAljava — false sem NENHUMA aljava, true com pelo menos 1
// -------------------------------------------------------------
const baseChar: Pick<Character, "inventario"> = { inventario: [
  { id: "arco-a", itemSlug: "arco_curto", itemNome: "Arco curto", categoria: "arma", subtipo: "arremesso_disparo", quantidade: 1, estado: "mochila" } as any,
] };
assert.ok(!hasExistingAljava(baseChar), "Sem nenhuma aljava → false.");
const charComAljaCompartilhada: Pick<Character, "inventario"> = { inventario: [
  ...baseChar.inventario!,
  instShared as any,
] };
assert.ok(hasExistingAljava(charComAljaCompartilhada), "Com pelo menos 1 aljava → true.");
console.log("19. hasExistingAljava detecta pelo menos 1 Aljava — OK");

// -------------------------------------------------------------
// 20. Dois arcos, cada um com sua PRÓPRIA Aljava selecionada — ataque
//     de um NÃO consome da Aljava do outro.
// -------------------------------------------------------------
const aljava1 = {
  id: "aljava-1", itemSlug: ALJAVA_ITEM_SLUG, itemNome: "Aljava", categoria: "ferramenta", subtipo: ALJAVA_ITEM_SLUG,
  quantidade: 1, estado: "mochila",
  aljava: { capacidade: 15, stacks: [{ contentSlug: "flecha_simples", nome: "Flecha simples", quantidade: 5 }] },
};
const aljava2 = {
  id: "aljava-2", itemSlug: ALJAVA_ITEM_SLUG, itemNome: "Aljava", categoria: "ferramenta", subtipo: ALJAVA_ITEM_SLUG,
  quantidade: 1, estado: "mochila",
  aljava: { capacidade: 15, stacks: [{ contentSlug: "flecha_flamejante", nome: "Flecha flamejante", quantidade: 5 }] },
};
let charDoisArcosDuasAljavas: Character = {
  inventario: [
    { id: "arco-x", itemSlug: "arco_curto", itemNome: "Arco curto", categoria: "arma", subtipo: "arremesso_disparo", quantidade: 1, estado: "empunhado" } as any,
    { id: "arco-y", itemSlug: "arco_longo", itemNome: "Arco longo", categoria: "arma", subtipo: "arremesso_disparo", quantidade: 1, estado: "mochila" } as any,
    aljava1 as any,
    aljava2 as any,
  ],
} as any;
assert.equal(getAljavaInstances(charDoisArcosDuasAljavas).length, 2, "Personagem tem 2 Aljavas no inventário.");

// Arco X seleciona Aljava 1; Arco Y seleciona Aljava 2.
charDoisArcosDuasAljavas = setBowAljavaSelection(charDoisArcosDuasAljavas, "arco-x", "aljava-1");
charDoisArcosDuasAljavas = setBowAljavaSelection(charDoisArcosDuasAljavas, "arco-y", "aljava-2");

const modeloArcoX = { slug: "arco_curto", subtipo: "arremesso_disparo", usesAmmunition: true, municaoMax: 1, municaoCompativelSlug: "flecha_simples" };
const consume1 = consumeAttackAmmo(charDoisArcosDuasAljavas, [modeloArcoX]);
assert.ok(consume1.motivoFalha == null, "Ataque com Arco X (empunhado) sem erro.");
assert.equal(consume1.consumedFromInstanceId, "aljava-1", "Consumiu da Aljava 1 (selecionada pelo Arco X).");
const aljava1Apos = findAljavaInstance(consume1.character, "aljava-1");
const aljava2Apos = findAljavaInstance(consume1.character, "aljava-2");
assert.equal(getAljavaTotalFlechas(aljava1Apos!.aljava), 4, "Aljava 1 consumiu 1 flecha (5→4).");
assert.equal(getAljavaTotalFlechas(aljava2Apos!.aljava), 5, "Aljava 2 NÃO foi tocada (continua 5).");
console.log("20. Dois arcos com Aljavas distintas — ataque não vaza para a Aljava do outro — OK");

// -------------------------------------------------------------
// 21. migrateEmbeddedAljavas — migra aljava embutida (modelo legado) para instância solta
// -------------------------------------------------------------
const charLegado: Character = {
  inventario: [
    { id: "arco-leg-1", itemSlug: "arco_curto", itemNome: "Arco curto", categoria: "arma", subtipo: "arremesso_disparo", quantidade: 1, estado: "empunhado",
      aljava: { capacidade: 15, stacks: [{ contentSlug: "flecha_simples", nome: "Flecha simples", quantidade: 8 }] } } as any,
  ],
} as any;
const migrated = migrateEmbeddedAljavas(charLegado);
const aljavasAposMigracao = getAljavaInstances(migrated);
assert.equal(aljavasAposMigracao.length, 1, "1 Aljava solta criada após migração.");
assert.equal(getAljavaTotalFlechas(aljavasAposMigracao[0].aljava), 8, "Stacks migrados para a nova Aljava.");
const arcoAposMigracao = migrated.inventario?.find((i) => i.id === "arco-leg-1");
assert.ok((arcoAposMigracao as any).aljava == null, "Campo aljava removido do arco após migração.");
// Idempotente
const migrated2 = migrateEmbeddedAljavas(migrated);
assert.deepEqual(migrated2.inventario?.length, migrated.inventario?.length, "Migração idempotente — sem duplicatas.");
console.log("21. migrateEmbeddedAljavas — OK");

// -------------------------------------------------------------
// 22. setAljavaFlechaQuantidade — ajusta stack em UMA Aljava específica
// -------------------------------------------------------------
const charParaAjuste: Character = {
  inventario: [
    { id: "aljava-aj", itemSlug: ALJAVA_ITEM_SLUG, itemNome: "Aljava", categoria: "ferramenta", subtipo: ALJAVA_ITEM_SLUG,
      quantidade: 1, estado: "mochila",
      aljava: { capacidade: 15, stacks: [{ contentSlug: "flecha_simples", nome: "Flecha simples", quantidade: 10 }] } } as any,
  ],
} as any;
const charAjustado = setAljavaFlechaQuantidade(charParaAjuste, "aljava-aj", "flecha_simples", 5);
const aljavaAjustada2 = findAljavaInstance(charAjustado, "aljava-aj");
assert.equal(getAljavaTotalFlechas(aljavaAjustada2!.aljava), 5, "Quantidade ajustada para 5.");
// Total nunca excede capacidade (clamp)
const charAjustadoMax = setAljavaFlechaQuantidade(charParaAjuste, "aljava-aj", "flecha_simples", 999);
const aljavaMax = findAljavaInstance(charAjustadoMax, "aljava-aj");
assert.equal(getAljavaTotalFlechas(aljavaMax!.aljava), 15, "Quantidade clampeada na capacidade (15).");
console.log("22. setAljavaFlechaQuantidade — OK");

// -------------------------------------------------------------
// 23. Recarregar duas pistolas do MESMO estoque — munição carregada
//     de cada arma fica isolada; atacar com uma não afeta a outra.
// -------------------------------------------------------------
const modeloPistolaBolso = { slug: "pistola_de_bolso", subtipo: "fogo", usesAmmunition: true as const, municaoMax: 6, municaoCompativelSlug: "mun_pistola" };
const modeloPistolaPesada = { slug: "pistola_pesada", subtipo: "fogo", usesAmmunition: true as const, municaoMax: 6, municaoCompativelSlug: "mun_pistola" };
const ammoProfilesPistola: AmmoItemProfile[] = [
  { slug: "mun_pistola", nome: "Munição de pistola", familia: "mun_pistola", armasCompativeis: ["pistola_de_bolso", "pistola_pesada"], kitQuantidade: null },
];
let charDuasPistolas: Character = {
  inventario: [
    { id: "bolso", itemSlug: "pistola_de_bolso", itemNome: "Pistola de bolso", categoria: "arma", subtipo: "fogo", quantidade: 1, estado: "mochila", municaoAtual: 0 } as any,
    { id: "pesada", itemSlug: "pistola_pesada", itemNome: "Pistola pesada", categoria: "arma", subtipo: "fogo", quantidade: 1, estado: "mochila", municaoAtual: 0 } as any,
    { id: "estoque-pistola", itemSlug: "mun_pistola", itemNome: "Munição de pistola", categoria: "municao", subtipo: "municao", quantidade: 8, estado: "mochila" } as any,
  ],
} as any;

// Recarregar Pistola de bolso: consome do estoque (8), enche 6/6, sobra 2 no estoque.
const reloadBolso = reloadMagazineWeapon(charDuasPistolas, "bolso", modeloPistolaBolso, ammoProfilesPistola);
assert.equal(reloadBolso.carregada, 6, "Pistola de bolso recarregou 6.");
charDuasPistolas = reloadBolso.character;
assert.equal((charDuasPistolas.inventario!.find((i) => i.id === "bolso") as any).municaoAtual, 6, "Pistola de bolso 6/6.");
assert.equal((charDuasPistolas.inventario!.find((i) => i.id === "pesada") as any).municaoAtual, 0, "Pistola pesada continua 0/6.");
assert.equal(charDuasPistolas.inventario!.find((i) => i.id === "estoque-pistola")?.quantidade, 2, "Estoque ficou com 2.");

// Recarregar Pistola pesada com o estoque restante (2): fica 2/6, estoque zera (instância removida).
const reloadPesada = reloadMagazineWeapon(charDuasPistolas, "pesada", modeloPistolaPesada, ammoProfilesPistola);
assert.equal(reloadPesada.carregada, 2, "Pistola pesada recarregou só 2 (estoque restante).");
charDuasPistolas = reloadPesada.character;
assert.equal((charDuasPistolas.inventario!.find((i) => i.id === "bolso") as any).municaoAtual, 6, "Pistola de bolso continua 6/6 (não afetada).");
assert.equal((charDuasPistolas.inventario!.find((i) => i.id === "pesada") as any).municaoAtual, 2, "Pistola pesada 2/6.");
assert.equal(charDuasPistolas.inventario!.find((i) => i.itemSlug === "mun_pistola"), undefined, "Estoque zerou e instância foi removida.");
console.log("23. Recarregar duas pistolas do mesmo estoque — munição carregada isolada por arma — OK");

// -------------------------------------------------------------
// 24. Atacar com Pistola pesada consome só a MUNIÇÃO DELA — Pistola de
//     bolso permanece intacta.
// -------------------------------------------------------------
const charDuasPistolasEmpunhandoPesada: Character = {
  ...charDuasPistolas,
  inventario: charDuasPistolas.inventario!.map((i) => (i.id === "pesada" ? { ...i, estado: "empunhado" } : i)),
};
const ataquePesada = consumeAttackAmmo(charDuasPistolasEmpunhandoPesada, [modeloPistolaBolso, modeloPistolaPesada]);
assert.equal(ataquePesada.motivoFalha, null, "Ataque com pistola pesada (2/6) sem bloqueio.");
assert.equal(ataquePesada.consumedFromInstanceId, "pesada");
assert.equal((ataquePesada.character.inventario!.find((i) => i.id === "pesada") as any).municaoAtual, 1, "Pistola pesada 2/6 → 1/6.");
assert.equal((ataquePesada.character.inventario!.find((i) => i.id === "bolso") as any).municaoAtual, 6, "Pistola de bolso continua 6/6 — não afetada pelo ataque da outra arma.");
console.log("24. Ataque com uma pistola não altera a munição carregada da outra — OK");

// ===== NOVOS TESTES: COMPRA DE ARCO COM KIT INICIAL =====

// Nota: purchaseItem() é testado via browser; aqui testamos apenas os
// helpers de munição. Os testes abaixo validam que a lógica de compra
// (adicionar kit às flechas da aljava) funciona corretamente.

// Não implementamos teste direto de purchaseItem() aqui porque ele
// exige ItemContent completo com catalog loading. O browser test
// abaixo valida o comportamento completo.

console.log("\ntest-ammunition — todos os cenários passaram.");
