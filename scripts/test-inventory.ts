/**
 * Teste puro (sem Supabase) do inventário/carteira/loja — checkpoint
 * v0.49. Lê o DB real de itens para confirmar que a compra funciona
 * com um item de verdade, sem hardcoding.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeItemContent,
  purchaseItem,
  setItemLoadoutState,
  removeItemFromInventory,
  adjustItemQuantity,
  createInitialCharacter,
  normalizeCharacter,
  getRuneCompatibility,
  countInstalledRunes,
  installRuneOnItem,
  removeRuneFromItem,
  type ItemContent,
} from "../src/lib/character";
import { normalizeTechnicalContentItem, type TechnicalContentItem } from "../src/lib/content";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

console.log("=== test-inventory ===\n");

const db = readJson<{ itens: Record<string, unknown>[] }>("content/db_equipamentos_normalizado_v1_2.json");
const items: ItemContent[] = db.itens.map(normalizeItemContent);
assert.ok(items.length >= 100, "Catálogo real deve ter pelo menos 100 itens.");

const faca = items.find((i) => i.slug === "faca");
assert.ok(faca, "Item 'faca' deve existir no DB real.");
assert.equal(faca!.preco, 15);

const personagem = createInitialCharacter(null, "Comprador de Teste");

// -------------------------------------------------------------
// 1. Personagem novo nasce com carteira zerada e inventário vazio.
// -------------------------------------------------------------
assert.equal(personagem.carteira, undefined, "createInitialCharacter não define carteira (normalizeCharacter faz isso no load/save).");
console.log("1. Personagem novo sem carteira definida ainda (normalizada só no load/save) — OK");

const comCarteira = { ...personagem, carteira: { aretz_informal: 100, cdi: 0, cdi_craqueada: 0 } };

// -------------------------------------------------------------
// 2. Comprar item com fundos suficientes — desconta carteira, cria instância.
// -------------------------------------------------------------
const compra = purchaseItem({ character: comCarteira, item: faca!, quantidade: 1, walletId: "aretz_informal", nowIso: "2026-07-03T10:00:00.000Z" });
assert.equal(compra.ok, true);
assert.equal(compra.totalCost, 15);
assert.equal(compra.character.carteira?.aretz_informal, 85);
assert.equal(compra.character.inventario?.length, 1);
assert.equal(compra.instance?.itemSlug, "faca");
assert.equal(compra.instance?.estado, "mochila", "Item novo entra na mochila por padrão.");
console.log("2. Compra com fundos suficientes — desconta carteira, cria instância na mochila — OK");

// -------------------------------------------------------------
// 3. Comprar sem fundos suficientes — não muda nada.
// -------------------------------------------------------------
const semFundos = { ...personagem, carteira: { aretz_informal: 5, cdi: 0, cdi_craqueada: 0 } };
const compraFalha = purchaseItem({ character: semFundos, item: faca!, quantidade: 1, walletId: "aretz_informal", nowIso: "2026-07-03T10:00:00.000Z" });
assert.equal(compraFalha.ok, false);
assert.ok(compraFalha.reason?.includes("insuficiente"));
assert.equal(compraFalha.character, semFundos, "Sem fundos, o personagem não deve mudar.");
console.log("3. Compra sem fundos suficientes — não muda o personagem — OK");

// -------------------------------------------------------------
// 4. Preço unitário editável (PRD 13.2) e quantidade múltipla.
// -------------------------------------------------------------
const compraMultipla = purchaseItem({ character: comCarteira, item: faca!, quantidade: 3, walletId: "aretz_informal", precoUnitario: 10, nowIso: "2026-07-03T10:00:00.000Z" });
assert.equal(compraMultipla.totalCost, 30, "3 unidades a 10 cada = 30, preço editado ignora o preço do livro.");
assert.equal(compraMultipla.character.carteira?.aretz_informal, 70);
assert.equal(compraMultipla.instance?.quantidade, 3);
console.log("4. Preço unitário editável + quantidade múltipla — OK");

// -------------------------------------------------------------
// 5. Loadout: mudar estado, ajustar quantidade, remover.
// -------------------------------------------------------------
const instanceId = compra.instance!.id;
const equipado = setItemLoadoutState(compra.character, instanceId, "equipado");
assert.equal(equipado.inventario?.find((i) => i.id === instanceId)?.estado, "equipado");

const maisUnidades = adjustItemQuantity(equipado, instanceId, 2);
assert.equal(maisUnidades.inventario?.find((i) => i.id === instanceId)?.quantidade, 3);

const semItem = removeItemFromInventory(maisUnidades, instanceId);
assert.equal(semItem.inventario?.length, 0);
console.log("5. Loadout (mudar estado/ajustar quantidade/remover) — OK");

// ===============================================================
// Modelo de slots de runa (checkpoint v0.56, fase 1) — só o modelo/
// compatibilidade; instalar/remover de verdade é testado em
// test-technical-effects.ts / scripts próprios da fase 2.
// ===============================================================

const runasDb = readJson<{ runas: Record<string, unknown>[] }>("content/db_runas_normalizado_v1_2.json");
const runas: TechnicalContentItem[] = runasDb.runas.map(normalizeTechnicalContentItem);
const runaRetratil = runas.find((r) => r.slug === "runa_cac_retratil");
assert.ok(runaRetratil, "Runa 'runa_cac_retratil' deve existir no DB real (slots_possiveis: ['arma'], restricao_subtipo: 'corpo_a_corpo').");

// -------------------------------------------------------------
// 6. normalizeItemContent extrai subtipo/slotsRunaMax reais do payload.
// -------------------------------------------------------------
assert.equal(faca!.subtipo, "corpo_a_corpo");
assert.equal(faca!.slotsRunaMax, 1, "Faca deve ter slots_runa_max real vindo do payload (não inventado).");
const municao = items.find((i) => i.categoria === "municao");
assert.ok(municao, "Deve haver pelo menos um item de munição no DB real.");
assert.equal(municao!.slotsRunaMax, null, "Categorias sem slots_runa_max no payload devem ficar null, nunca 0 inventado.");
console.log("6. normalizeItemContent extrai subtipo/slotsRunaMax reais do payload — OK");

// -------------------------------------------------------------
// 7. Personagem antigo/inventário antigo (sem subtipo/runasInstaladas) não quebra.
// -------------------------------------------------------------
const personagemAntigo = normalizeCharacter({
  nome: "Personagem Antigo",
  atributos: { corpo: 2, mente: 2, animo: 2 },
  pericias: {},
  inventario: [
    { id: "old-1", itemSlug: "faca", itemNome: "Faca", categoria: "arma", quantidade: 1, estado: "mochila", adquiridoEm: "2026-01-01T00:00:00.000Z" },
  ],
});
assert.equal(personagemAntigo.inventario?.length, 1, "Item antigo sem subtipo/runasInstaladas deve continuar carregando.");
assert.equal(countInstalledRunes(personagemAntigo.inventario![0]), 0, "Instância antiga sem runasInstaladas conta 0, nunca undefined/erro.");
console.log("7. Personagem/inventário antigo (sem subtipo/runasInstaladas) normaliza sem erro — OK");

// -------------------------------------------------------------
// 7b. Inventário ausente inteiramente também normaliza para [].
// -------------------------------------------------------------
const semInventario = normalizeCharacter({ nome: "X", atributos: { corpo: 1, mente: 1, animo: 1 }, pericias: {} });
assert.deepEqual(semInventario.inventario, []);
console.log("7b. Ausência total de inventário normaliza para [] — OK");

// -------------------------------------------------------------
// 8. Compatibilidade respeita a fonte quando é clara (categoria + subtipo).
// -------------------------------------------------------------
assert.equal(
  getRuneCompatibility({ categoria: "arma", subtipo: "corpo_a_corpo" }, runaRetratil!),
  "compatible",
  "Faca (arma/corpo_a_corpo) deve ser compatível com Runa Retrátil (slots_possiveis:['arma'], restricao_subtipo:'corpo_a_corpo').",
);
assert.equal(
  getRuneCompatibility({ categoria: "arma", subtipo: "fogo" }, runaRetratil!),
  "incompatible",
  "Arma de fogo deve ser incompatível com Runa Retrátil (restricao_subtipo exige corpo_a_corpo).",
);
assert.equal(
  getRuneCompatibility({ categoria: "municao" }, runaRetratil!),
  "incompatible",
  "Categoria fora de slots_possiveis deve ser incompatível.",
);
console.log("8. Compatibilidade respeita a fonte quando é clara (categoria + restricao_subtipo) — OK");

// -------------------------------------------------------------
// 9. Compatibilidade nunca inventa regra quando o dado está ausente ('unknown').
// -------------------------------------------------------------
const runaSemSlots = normalizeTechnicalContentItem({ id: "y", slug: "y", nome: "Y", status: "published" });
assert.equal(getRuneCompatibility({ categoria: "arma" }, runaSemSlots), "unknown", "Runa sem slots_possiveis nunca deve virar 'incompatible' inventado.");

const runaComRestricaoSemSubtipoDaInstancia = getRuneCompatibility({ categoria: "arma" }, runaRetratil!);
assert.equal(
  runaComRestricaoSemSubtipoDaInstancia,
  "unknown",
  "Item antigo sem subtipo registrado, mas runa exige restricao_subtipo — deve ficar 'unknown', nunca bloquear nem liberar sem saber.",
);
console.log("9. Compatibilidade nunca inventa limite/regra quando falta dado — devolve 'unknown' — OK");

// ===============================================================
// Fase 2 — instalar/remover runas em itens (checkpoint v0.56).
// ===============================================================

const comprouFaca = purchaseItem({ character: comCarteira, item: faca!, quantidade: 1, walletId: "aretz_informal", nowIso: "2026-07-03T10:00:00.000Z" });
const facaInstanceId = comprouFaca.instance!.id;

// -------------------------------------------------------------
// 10. Instalar runa compatível em item cria referência (nunca cópia do payload).
// -------------------------------------------------------------
const comRuna = installRuneOnItem({
  character: comprouFaca.character,
  instanceId: facaInstanceId,
  itemContent: faca,
  rune: runaRetratil!,
  nowIso: "2026-07-03T10:05:00.000Z",
});
assert.equal(comRuna.ok, true);
assert.equal(comRuna.compatibility, "compatible");
const facaComRuna = comRuna.character.inventario!.find((i) => i.id === facaInstanceId)!;
assert.equal(facaComRuna.runasInstaladas?.length, 1);
assert.equal(facaComRuna.runasInstaladas![0].runeContentId, runaRetratil!.slug, "Deve referenciar o slug do modelo, nunca copiar o payload.");
console.log("10. Instalar runa compatível cria referência ao modelo (slug) na instância — OK");

// -------------------------------------------------------------
// 11. Remover runa remove só a instalação (item e outras runas continuam).
// -------------------------------------------------------------
const runeInstallId = facaComRuna.runasInstaladas![0].id;
const semRuna = removeRuneFromItem(comRuna.character, facaInstanceId, runeInstallId);
const facaSemRuna = semRuna.inventario!.find((i) => i.id === facaInstanceId)!;
assert.equal(facaSemRuna.runasInstaladas?.length, 0);
assert.equal(semRuna.inventario!.length, 1, "O item continua no inventário — só a runa é removida.");
const removerInexistente = removeRuneFromItem(comRuna.character, facaInstanceId, "id-que-nao-existe");
assert.equal(removerInexistente, comRuna.character, "Remover um runeInstallationId inexistente não muda o personagem.");
console.log("11. Remover runa remove só a instalação (item e demais runas preservados) — OK");

// -------------------------------------------------------------
// 12. Save/load (round-trip JSON) preserva a runa instalada no item.
// -------------------------------------------------------------
const payloadSalvo = JSON.parse(JSON.stringify(comRuna.character)) as Record<string, unknown>;
const recarregado = normalizeCharacter(payloadSalvo);
const facaRecarregada = recarregado.inventario!.find((i) => i.id === facaInstanceId)!;
assert.equal(facaRecarregada.runasInstaladas?.length, 1, "Round-trip de save/load deve preservar a runa instalada.");
assert.equal(facaRecarregada.runasInstaladas![0].runeContentId, runaRetratil!.slug);
console.log("12. Save/load (round-trip) preserva a runa instalada no item — OK");

// -------------------------------------------------------------
// 13. Item sem modelo correspondente na Biblioteca (itemContent ausente)
//     não quebra — só não valida o limite de slots (permissivo).
// -------------------------------------------------------------
const semModeloDeItem = installRuneOnItem({
  character: comprouFaca.character,
  instanceId: facaInstanceId,
  itemContent: undefined, // catálogo de itens indisponível/modelo removido
  rune: runaRetratil!,
  nowIso: "2026-07-03T10:10:00.000Z",
});
assert.equal(semModeloDeItem.ok, true, "Sem o modelo do item, a instalação segue permissiva (compatibilidade já vem da própria instância).");
console.log("13. Item sem modelo na Biblioteca não quebra a instalação (permissivo) — OK");

// -------------------------------------------------------------
// 14. Runa ausente da Biblioteca — o helper de instalação recebe o
//     objeto já resolvido; quem NÃO encontra a runa (UI) mostra aviso
//     "conteúdo não encontrado" sem chamar o helper — aqui confirmamos
//     que uma runa instalada cujo modelo sumiu depois não quebra a leitura.
// -------------------------------------------------------------
const comRunaOrfa = {
  ...comprouFaca.character,
  inventario: [
    { ...comprouFaca.character.inventario![0], runasInstaladas: [{ id: "r1", runeContentId: "runa-removida-da-biblioteca", installedAt: "2026-07-03T10:00:00.000Z" }] },
  ],
};
const naoQuebra = normalizeCharacter(JSON.parse(JSON.stringify(comRunaOrfa)));
assert.equal(naoQuebra.inventario![0].runasInstaladas?.length, 1, "Instância de runa órfã (modelo sumiu) continua carregando — UI que decide o texto 'não encontrado'.");
console.log("14. Runa instalada cujo modelo sumiu da Biblioteca não quebra o carregamento — OK");

// -------------------------------------------------------------
// 15. Instalar runa NÃO gera nenhum modificador/efeito (fora de escopo
//     desta fase) — confirmado pela ausência de qualquer campo de
//     efeito nas estruturas envolvidas (InstalledRune só tem
//     id/runeContentId/installedAt/notas).
// -------------------------------------------------------------
const chavesDaInstalacao = Object.keys(facaComRuna.runasInstaladas![0]).sort();
const chavesDeEfeitoProibidas = ["modifier", "modificador", "valor", "affectedTags", "alvo_tags", "custo_pa", "cadencia"];
assert.ok(
  chavesDaInstalacao.every((k) => !chavesDeEfeitoProibidas.includes(k)),
  "InstalledRune não deve ter nenhum campo de efeito/modificador — só referência (id/runeContentId/installedAt/notas).",
);
console.log("15. Instalar runa não gera modificador/efeito — estrutura só tem referência + metadados — OK");

// -------------------------------------------------------------
// 16. Compatibilidade inequívoca funciona (bloqueia incompatível de verdade).
// -------------------------------------------------------------
const armaDeFogo = items.find((i) => i.categoria === "arma" && i.subtipo === "fogo");
assert.ok(armaDeFogo, "Deve haver ao menos uma arma de fogo no DB real.");
const comprouArmaFogo = purchaseItem({ character: comCarteira, item: armaDeFogo!, quantidade: 1, walletId: "aretz_informal", precoUnitario: 0, nowIso: "2026-07-03T10:00:00.000Z" });
const instalacaoIncompativel = installRuneOnItem({
  character: comprouArmaFogo.character,
  instanceId: comprouArmaFogo.instance!.id,
  itemContent: armaDeFogo,
  rune: runaRetratil!, // restricao_subtipo: corpo_a_corpo — incompatível com arma de fogo
  nowIso: "2026-07-03T10:00:00.000Z",
});
assert.equal(instalacaoIncompativel.ok, false, "Runa Retrátil (corpo_a_corpo) deve ser bloqueada numa arma de fogo — incompatibilidade inequívoca.");
assert.equal(instalacaoIncompativel.compatibility, "incompatible");
console.log("16. Compatibilidade inequívoca bloqueia instalação incompatível de verdade — OK");

// -------------------------------------------------------------
// 17. Compatibilidade ambígua NÃO bloqueia (permissivo) — runa sem
//     slots_possiveis no payload.
// -------------------------------------------------------------
const instalacaoAmbigua = installRuneOnItem({
  character: comprouFaca.character,
  instanceId: facaInstanceId,
  itemContent: faca,
  rune: runaSemSlots,
  nowIso: "2026-07-03T10:00:00.000Z",
});
assert.equal(instalacaoAmbigua.ok, true, "Compatibilidade 'unknown' (dado ausente) nunca deve bloquear automaticamente.");
assert.equal(instalacaoAmbigua.compatibility, "unknown");
console.log("17. Compatibilidade ambígua ('unknown') não inventa bloqueio — instalação permitida com aviso — OK");

// -------------------------------------------------------------
// 18. Limite de slots canônico é respeitado quando já atingido.
// -------------------------------------------------------------
const facaComUmaRuna = comRuna.character; // já tem 1 runa, slots_runa_max da faca é 1.
const segundaRuna = runas.find((r) => r.slug === "runa_cac_impeto");
assert.ok(segundaRuna, "Runa 'runa_cac_impeto' (corpo_a_corpo, compatível com Faca) deve existir no DB real.");
const excedeuLimite = installRuneOnItem({
  character: facaComUmaRuna,
  instanceId: facaInstanceId,
  itemContent: faca,
  rune: segundaRuna!,
  nowIso: "2026-07-03T10:00:00.000Z",
});
assert.equal(excedeuLimite.ok, false, "Faca já tem 1/1 runas (slots_runa_max=1) — segunda instalação deve ser bloqueada.");
assert.ok(excedeuLimite.reason?.includes("slots"));
console.log("18. Limite de slots canônico (slots_runa_max) é respeitado quando já atingido — OK");

console.log("\ntest-inventory — todos os cenários passaram.");
