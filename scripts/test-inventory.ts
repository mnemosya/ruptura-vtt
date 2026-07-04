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
  deriveItemTechnicalProperties,
  normalizeItemTechnicalState,
  removeItemTechnicalPropertyBySource,
  setItemTechnicalState,
  deriveInstalledRuneEffects,
  normalizeItemProperty,
  getItemModelProperties,
  deriveItemProperties,
  getItemMit,
  getItemPdMax,
  getItemMitAtual,
  getItemPdAtual,
  equipDefensiveItem,
  unequipDefensiveItem,
  setItemMitAtual,
  setItemPdAtual,
  getEquippedDefenseProfile,
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
const propriedadesDb = readJson<{ propriedades: Record<string, unknown>[] }>("content/db_propriedades_normalizado_v1.json");
const propriedades: TechnicalContentItem[] = propriedadesDb.propriedades.map(normalizeTechnicalContentItem);
const runaRetratil = runas.find((r) => r.slug === "runa_cac_retratil");
assert.ok(runaRetratil, "Runa 'runa_cac_retratil' deve existir no DB real (slots_possiveis: ['arma'], restricao_subtipo: 'corpo_a_corpo').");

// -------------------------------------------------------------
// 6. normalizeItemContent extrai subtipo/slotsRunaMax reais do payload.
// -------------------------------------------------------------
assert.equal(faca!.subtipo, "corpo_a_corpo");
assert.equal(faca!.slotsRunaMax, 1, "Faca deve ter slots_runa_max real vindo do payload (não inventado).");
assert.deepEqual(faca!.propertySlugs, ["arremesso", "silencioso"]);
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
assert.deepEqual(personagemAntigo.inventario![0].propriedadesTecnicas, []);
assert.deepEqual(personagemAntigo.inventario![0].estadosTecnicos, []);
console.log("7. Personagem/inventário antigo normaliza propriedades/estados técnicos para arrays vazios — OK");

// -------------------------------------------------------------
// 7b. Inventário ausente inteiramente também normaliza para [].
// -------------------------------------------------------------
const semInventario = normalizeCharacter({ nome: "X", atributos: { corpo: 1, mente: 1, animo: 1 }, pericias: {} });
assert.deepEqual(semInventario.inventario, []);
console.log("7b. Ausência total de inventário normaliza para [] — OK");

// -------------------------------------------------------------
// 7c. Camada técnica normaliza defensivamente e preserva campos futuros.
// -------------------------------------------------------------
const personagemComTecnica = normalizeCharacter({
  nome: "Técnico",
  atributos: { corpo: 1, mente: 1, animo: 1 },
  pericias: {},
  inventario: [{
    id: "tech-1",
    itemSlug: "faca",
    itemNome: "Faca",
    categoria: "arma",
    quantidade: 1,
    estado: "mochila",
    adquiridoEm: "2026-01-01T00:00:00.000Z",
    campoFuturoDoItem: "preservado",
    propriedadesTecnicas: [
      {
        id: "prop-1",
        sourceType: "manual",
        sourceContentId: "manual",
        key: "inspecionado",
        label: "Inspecionado",
        value: true,
        campoFuturo: "preservado",
      },
      null,
      "inválido",
      { id: 42 },
    ],
    estadosTecnicos: [
      {
        id: "state-1",
        sourceType: "manual",
        sourceContentId: "manual",
        key: "ativo",
        label: "Estado técnico",
        active: false,
      },
      { id: "state-broken", sourceType: "manual" },
    ],
  }],
});
const itemTecnico = personagemComTecnica.inventario![0];
assert.equal(itemTecnico.propriedadesTecnicas?.length, 1);
assert.equal(itemTecnico.estadosTecnicos?.length, 1);
assert.equal(itemTecnico.propriedadesTecnicas![0].campoFuturo, "preservado");
assert.equal((itemTecnico as unknown as Record<string, unknown>).campoFuturoDoItem, "preservado");
assert.deepEqual(normalizeItemTechnicalState({ propriedadesTecnicas: "quebrado", estadosTecnicos: 42 }), {
  propriedadesTecnicas: [],
  estadosTecnicos: [],
});
assert.equal(deriveItemTechnicalProperties(itemTecnico).length, 1);
console.log("7c. Payload técnico malformado é filtrado e campos desconhecidos são preservados — OK");

// -------------------------------------------------------------
// 7d. Estado técnico alterna sem recurso/efeito; remoção por fonte é reversível.
// -------------------------------------------------------------
const paAntes = personagemComTecnica.estado_jogo?.pa_gastos;
const comEstadoAtivo = setItemTechnicalState(
  personagemComTecnica,
  "tech-1",
  "state-1",
  true,
  "2026-07-04T10:00:00.000Z",
);
assert.equal(comEstadoAtivo.inventario![0].estadosTecnicos![0].active, true);
assert.equal(comEstadoAtivo.inventario![0].estadosTecnicos![0].updatedAt, "2026-07-04T10:00:00.000Z");
assert.equal(comEstadoAtivo.estado_jogo?.pa_gastos, paAntes, "Toggle técnico nunca consome PA.");
const semPropriedadeManual = removeItemTechnicalPropertyBySource(comEstadoAtivo, "tech-1", "manual", "manual");
assert.deepEqual(semPropriedadeManual.inventario![0].propriedadesTecnicas, []);
assert.equal(semPropriedadeManual.inventario![0].estadosTecnicos?.length, 1, "Remover propriedade não apaga estado.");
assert.deepEqual(
  deriveInstalledRuneEffects(personagemComTecnica, runas),
  [],
  "Propriedade/estado técnico nunca vira ActiveEffect por conta própria.",
);
console.log("7d. Toggle técnico e remoção por fonte são puros, reversíveis e não consomem PA — OK");

// -------------------------------------------------------------
// 7e. Propriedades do modelo/catálogo/instância formam uma visão única.
// -------------------------------------------------------------
const tonfa = items.find((item) => item.slug === "tonfa");
assert.ok(tonfa, "Tonfa deve existir no DB real.");
const propriedadesTonfa = getItemModelProperties(tonfa!, propriedades);
assert.deepEqual(propriedadesTonfa.map((property) => property.slug), ["contusao", "aparar"]);
assert.equal(propriedadesTonfa.find((property) => property.slug === "aparar")?.classification, "action_requirement");
assert.equal(propriedadesTonfa.find((property) => property.slug === "contusao")?.classification, "critical_suggestion");

const itemSemPropriedades = items.find((item) => item.categoria === "municao");
assert.ok(itemSemPropriedades);
assert.deepEqual(getItemModelProperties(itemSemPropriedades!, propriedades), []);

const propriedadeMalformada = normalizeTechnicalContentItem({
  id: "malformada",
  slug: "malformada",
  nome: "Malformada",
  status: "published",
  payload_automacao: { efeitos: "não-array" },
});
assert.equal(normalizeItemProperty(propriedadeMalformada).classification, "ambiguous");

const propriedadeAusente = getItemModelProperties(
  { ...faca!, propertySlugs: ["nao_existe"] },
  propriedades,
);
assert.equal(propriedadeAusente[0]?.missingCatalog, true);
assert.equal(propriedadeAusente[0]?.classification, "ambiguous");
console.log("7e. Propriedades base normalizam/classificam; ausentes e malformadas não quebram — OK");

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
const propriedadesComRuna = deriveItemProperties({
  instance: facaComRuna,
  item: faca,
  properties: propriedades,
  runes: runas,
});
assert.deepEqual(
  propriedadesComRuna.map((property) => property.key),
  ["ocultavel", "arremesso", "silencioso"],
  "A visão única deve combinar runa + propriedades base sem perder origem.",
);
const facaComOcultavelDuplicado = {
  ...facaComRuna,
  propriedadesTecnicas: [{
    id: "manual-ocultavel",
    sourceType: "manual" as const,
    sourceContentId: "manual",
    key: "ocultavel",
    label: "Ocultável",
    value: true,
  }],
};
const ocultavelDeduplicado = deriveItemProperties({
  instance: facaComOcultavelDuplicado,
  item: faca,
  properties: propriedades,
  runes: runas,
}).filter((property) => property.key === "ocultavel");
assert.equal(ocultavelDeduplicado.length, 1);
assert.equal(ocultavelDeduplicado[0].sources.length, 2, "Deduplicação preserva as duas origens.");
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

// ===============================================================
// Equipamento defensivo — MIT (armadura) / PD (escudo) (checkpoint v0.58, fase 1).
// ===============================================================

const armadura = items.find((i) => i.slug === "jaqueta_couro_reforcada");
assert.ok(armadura, "Armadura 'jaqueta_couro_reforcada' deve existir no DB real (mit_base:3).");
const escudo = items.find((i) => i.slug === "escudo_compacto");
assert.ok(escudo, "Escudo 'escudo_compacto' deve existir no DB real (pd_max:5).");
const outraArmadura = items.find((i) => i.categoria === "armadura" && i.slug !== armadura!.slug);
assert.ok(outraArmadura, "Deve haver uma segunda armadura no DB real para testar troca de slot.");
const comCarteiraRica = { ...personagem, carteira: { aretz_informal: 100000, cdi: 0, cdi_craqueada: 0 } };

// -------------------------------------------------------------
// 19. normalizeItemContent extrai mit_base/pd_max/tipo_protecao reais do payload.
// -------------------------------------------------------------
assert.equal(getItemMit(armadura!), 3);
assert.equal(getItemPdMax(escudo!), 5);
assert.equal(armadura!.tipoProtecao, "fisica");
assert.equal(getItemMit(faca!), null, "Item que não é armadura não deve ter MIT inventado.");
console.log("19. normalizeItemContent extrai mit_base/pd_max/tipo_protecao reais do payload — OK");

// -------------------------------------------------------------
// 20. Comprar escudo/armadura inicia PD/MIT atual = máximo canônico.
// -------------------------------------------------------------
const comprouEscudo = purchaseItem({ character: comCarteiraRica, item: escudo!, quantidade: 1, walletId: "aretz_informal", nowIso: "2026-07-03T10:00:00.000Z" });
assert.equal(getItemPdAtual(comprouEscudo.instance!, escudo), 5, "PD atual deve iniciar no máximo canônico (5).");
const comprouArmadura = purchaseItem({ character: comprouEscudo.character, item: armadura!, quantidade: 1, walletId: "aretz_informal", nowIso: "2026-07-03T10:00:00.000Z" });
assert.equal(getItemMitAtual(comprouArmadura.instance!, armadura), 3, "MIT atual deve iniciar no máximo canônico (3).");
console.log("20. Comprar escudo/armadura inicia PD/MIT atual no máximo canônico — OK");

// -------------------------------------------------------------
// 21. Personagem antigo (sem mitAtual/pdAtual/equipadoDefensivo) normaliza sem erro.
// -------------------------------------------------------------
const personagemAntigoDefensivo = normalizeCharacter({
  nome: "Personagem Antigo Defensivo",
  atributos: { corpo: 2, mente: 2, animo: 2 },
  pericias: {},
  inventario: [
    { id: "old-armor-1", itemSlug: "jaqueta_couro_reforcada", itemNome: "Jaqueta de couro reforçada", categoria: "armadura", quantidade: 1, estado: "mochila", adquiridoEm: "2026-01-01T00:00:00.000Z" },
  ],
});
assert.equal(personagemAntigoDefensivo.inventario?.length, 1, "Instância antiga sem campos de MIT/PD deve continuar carregando.");
assert.equal(getItemMitAtual(personagemAntigoDefensivo.inventario![0], armadura), 3, "Sem mitAtual próprio, cai no máximo do modelo (nunca inventa um valor diferente).");
console.log("21. Personagem/instância antiga (sem MIT/PD/equipadoDefensivo) normaliza sem erro — OK");

// -------------------------------------------------------------
// 22. Equipar armadura define armadura ativa; equipar outra do MESMO slot troca a anterior.
// -------------------------------------------------------------
const personagemComAmbos = comprouArmadura.character;
const equipouArmadura = equipDefensiveItem(personagemComAmbos, comprouArmadura.instance!.id, armadura!);
assert.equal(equipouArmadura.inventario!.find((i) => i.id === comprouArmadura.instance!.id)?.equipadoDefensivo, true);
assert.equal(equipouArmadura.inventario!.find((i) => i.id === comprouArmadura.instance!.id)?.equipamentoSlot, "armadura");

const comSegundaArmadura = purchaseItem({ character: equipouArmadura, item: outraArmadura!, quantidade: 1, walletId: "aretz_informal", nowIso: "2026-07-03T10:00:00.000Z" });
const trocouArmadura = equipDefensiveItem(comSegundaArmadura.character, comSegundaArmadura.instance!.id, outraArmadura!);
assert.equal(trocouArmadura.inventario!.find((i) => i.id === comprouArmadura.instance!.id)?.equipadoDefensivo, false, "Equipar a 2ª armadura deve desequipar a 1ª (sem somar MIT de duas armaduras).");
assert.equal(trocouArmadura.inventario!.find((i) => i.id === comSegundaArmadura.instance!.id)?.equipadoDefensivo, true);
console.log("22. Equipar armadura define ativa; equipar outra do mesmo slot troca a anterior (nunca soma) — OK");

// -------------------------------------------------------------
// 22b. Categoria que não é armadura/escudo não equipa como defensivo (fallback defensivo).
// -------------------------------------------------------------
const naoEquipavel = equipDefensiveItem(personagemComAmbos, compra.instance!.id, faca!);
assert.equal(naoEquipavel, personagemComAmbos, "Categoria fora de armadura/escudo não deve virar equipamento defensivo.");
console.log("22b. Item fora de armadura/escudo não equipa como defensivo — OK");

// -------------------------------------------------------------
// 23. Desequipar preserva MIT/PD atual (não apaga o histórico de dano).
// -------------------------------------------------------------
const desequipou = unequipDefensiveItem(equipouArmadura, comprouArmadura.instance!.id);
assert.equal(desequipou.inventario!.find((i) => i.id === comprouArmadura.instance!.id)?.equipadoDefensivo, false);
assert.equal(getItemMitAtual(desequipou.inventario!.find((i) => i.id === comprouArmadura.instance!.id)!, armadura), 3, "Desequipar não deve resetar o MIT atual.");
console.log("23. Desequipar preserva MIT/PD atual (não reseta ao desequipar) — OK");

// -------------------------------------------------------------
// 24. PD/MIT atual edita sem passar negativo nem acima do máximo.
// -------------------------------------------------------------
const pdNegativo = setItemPdAtual(comprouEscudo.character, comprouEscudo.instance!.id, -10, escudo!.pdMax);
assert.equal(getItemPdAtual(pdNegativo.inventario!.find((i) => i.id === comprouEscudo.instance!.id)!, escudo), 0, "PD atual nunca fica negativo.");
const pdAcimaDoMax = setItemPdAtual(comprouEscudo.character, comprouEscudo.instance!.id, 999, escudo!.pdMax);
assert.equal(getItemPdAtual(pdAcimaDoMax.inventario!.find((i) => i.id === comprouEscudo.instance!.id)!, escudo), 5, "PD atual nunca passa do máximo conhecido.");
console.log("24. PD/MIT atual editado nunca fica negativo nem acima do máximo — OK");

// -------------------------------------------------------------
// 25. getEquippedDefenseProfile só reflete o que está EQUIPADO — nunca aplica dano (Fase 1 não tem resolução de dano).
// -------------------------------------------------------------
const perfilVazio = getEquippedDefenseProfile(personagemComAmbos, items);
assert.equal(perfilVazio.armadura, undefined, "Sem nada equipado, o perfil defensivo deve estar vazio.");
const perfilComArmadura = getEquippedDefenseProfile(equipouArmadura, items);
assert.equal(perfilComArmadura.armadura?.mitAtual, 3);
assert.equal(perfilComArmadura.escudo, undefined, "Escudo comprado mas não equipado não deve aparecer no perfil ativo.");
console.log("25. getEquippedDefenseProfile só reflete equipamento ativo; nenhum dano é aplicado nesta fase — OK");

console.log("\ntest-inventory — todos os cenários passaram.");
