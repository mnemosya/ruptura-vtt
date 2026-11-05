/**
 * Teste puro (sem Supabase) de Escalpos instalados — checkpoint v0.54,
 * fase 1. Lê o DB real de escalpos para confirmar instalação/remoção
 * passiva (referência ao modelo, sem efeito mecânico) e que
 * `normalizeCharacter` continua carregando personagens antigos.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  installEscalpo,
  removeInstalledEscalpo,
  normalizeCharacter,
  createInitialCharacter,
  ARS_CONTENT_ID,
  ARS_REGIOES,
  ativarArs,
  desativarArs,
  arsDaRegiao,
  resolveLayeredDefense,
  restaurarArsDescansoLongo,
  definirDesgasteEscalpo,
  deriveInstalledTechnicalEffects,
} from "../src/lib/character";
import { normalizeTechnicalContentItem, type TechnicalContentItem } from "../src/lib/content";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

console.log("=== test-escalpos ===\n");

const db = readJson<{ escalpos: Record<string, unknown>[] }>("content/db_escalpos_normalizado_v1_3.json");
const escalpos: TechnicalContentItem[] = db.escalpos.map(normalizeTechnicalContentItem);
const rpi = escalpos.find((e) => e.slug === "rpi_oficial");
assert.ok(rpi, "Escalpo 'rpi_oficial' deve existir no DB real.");

// -------------------------------------------------------------
// 1. Personagem antigo (sem escalpos_instalados no payload) normaliza sem erro.
// -------------------------------------------------------------
const personagemAntigo = normalizeCharacter({
  nome: "Personagem Antigo",
  atributos: { corpo: 2, mente: 2, animo: 2 },
  pericias: {},
  // sem escalpos_instalados — simula payload salvo antes do checkpoint v0.54.
});
assert.deepEqual(personagemAntigo.escalpos_instalados, [], "Ausência de escalpos_instalados vira [], nunca undefined/erro.");
console.log("1. Personagem antigo (sem escalpos_instalados) normaliza sem erro — OK");

// -------------------------------------------------------------
// 2. Instalar escalpo cria instância referenciando o modelo por slug.
// -------------------------------------------------------------
const personagem = createInitialCharacter(null, "Testador de Escalpos");
const nowIso = "2026-07-03T10:00:00.000Z";
const comEscalpo = installEscalpo(personagem, { contentId: rpi!.slug, nowIso });
assert.equal(comEscalpo.escalpos_instalados?.length, 1);
const instancia = comEscalpo.escalpos_instalados![0];
assert.equal(instancia.contentId, rpi!.slug, "Instância deve referenciar o modelo pelo slug, nunca copiar o payload.");
assert.equal(instancia.instaladoEm, nowIso);
assert.ok(instancia.id, "Instância deve ter um instanceId próprio.");
console.log("2. Instalar escalpo cria instância com referência ao modelo (slug) — OK");

// -------------------------------------------------------------
// 2b. Instalar com nome customizado/notas.
// -------------------------------------------------------------
const comApelido = installEscalpo(personagem, {
  contentId: rpi!.slug,
  nomeCustomizado: "  RPI da Sombra  ",
  notas: "  Ganho na missão X  ",
  nowIso,
});
assert.equal(comApelido.escalpos_instalados![0].nomeCustomizado, "RPI da Sombra", "Nome customizado deve ser aparado (trim).");
assert.equal(comApelido.escalpos_instalados![0].notas, "Ganho na missão X");
const semApelido = installEscalpo(personagem, { contentId: rpi!.slug, nomeCustomizado: "   ", nowIso });
assert.equal(semApelido.escalpos_instalados![0].nomeCustomizado, undefined, "Nome customizado só espaços vira undefined, não string vazia.");
console.log("2b. Nome customizado/notas opcionais são aparados e preservados — OK");

// -------------------------------------------------------------
// 3. Instalar duas vezes o MESMO modelo cria duas instâncias distintas
//    (ex.: dois implantes iguais) — nunca funde/ignora a segunda.
// -------------------------------------------------------------
const comDois = installEscalpo(comEscalpo, { contentId: rpi!.slug, nowIso });
assert.equal(comDois.escalpos_instalados?.length, 2);
assert.notEqual(comDois.escalpos_instalados![0].id, comDois.escalpos_instalados![1].id, "Cada instalação deve ter um instanceId próprio.");
console.log("3. Instalar o mesmo modelo duas vezes cria duas instâncias distintas — OK");

// -------------------------------------------------------------
// 4. Remover escalpo remove SÓ a instância — nunca o modelo (o modelo
//    nem existe no personagem, só o slug de referência).
// -------------------------------------------------------------
const semEscalpo = removeInstalledEscalpo(comEscalpo, instancia.id);
assert.equal(semEscalpo.escalpos_instalados?.length, 0);
const removerInexistente = removeInstalledEscalpo(comEscalpo, "id-que-nao-existe");
assert.equal(removerInexistente, comEscalpo, "Remover um instanceId inexistente não deve mudar o personagem.");
console.log("4. Remover escalpo remove só a instância (nunca o modelo) — OK");

// -------------------------------------------------------------
// 5. Save/load (round-trip via normalizeCharacter) preserva instâncias.
// -------------------------------------------------------------
const payloadSalvo = JSON.parse(JSON.stringify(comDois)) as Record<string, unknown>;
const recarregado = normalizeCharacter(payloadSalvo);
assert.equal(recarregado.escalpos_instalados?.length, 2, "Round-trip de save/load deve preservar as 2 instâncias.");
assert.deepEqual(
  recarregado.escalpos_instalados?.map((e) => ({ id: e.id, contentId: e.contentId })),
  comDois.escalpos_instalados?.map((e) => ({ id: e.id, contentId: e.contentId })),
  "id/contentId de cada instância devem sobreviver ao round-trip JSON (save/load real via Supabase).",
);
console.log("5. Save/load (round-trip) preserva as instâncias instaladas — OK");

// -------------------------------------------------------------
// 6. Modelo ausente da Biblioteca (slug não encontrado) não quebra —
//    a instância continua existindo, só sem dados do modelo para exibir.
// -------------------------------------------------------------
const comModeloInexistente = installEscalpo(personagem, { contentId: "escalpo-que-nao-existe-mais", nowIso });
const modeloEncontrado = escalpos.find((e) => e.slug === comModeloInexistente.escalpos_instalados![0].contentId);
assert.equal(modeloEncontrado, undefined, "Slug inexistente não deve casar com nenhum modelo real — a UI trata isso defensivamente (ver BibliotecaTab).");
assert.equal(comModeloInexistente.escalpos_instalados?.length, 1, "A instância continua registrada mesmo sem o modelo correspondente.");
console.log("6. Modelo ausente da Biblioteca não quebra a instância (UI trata defensivamente) — OK");

// A ARS ocupa uma região por instalação; não admite região vazia ou repetida.
let comArs = personagem;
assert.equal(installEscalpo(comArs, { contentId: ARS_CONTENT_ID, nowIso }), comArs);
for (const regiao of ARS_REGIOES) {
  const anterior = comArs;
  comArs = installEscalpo(comArs, { contentId: ARS_CONTENT_ID, regiaoArs: regiao.id, nowIso });
  assert.equal(comArs.escalpos_instalados?.at(-1)?.regiaoArs, regiao.id);
  assert.equal(installEscalpo(comArs, { contentId: ARS_CONTENT_ID, regiaoArs: regiao.id, nowIso }), comArs);
  assert.equal(comArs.escalpos_instalados!.length, (anterior.escalpos_instalados?.length ?? 0) + 1);
}
assert.equal(comArs.escalpos_instalados?.length, 4);
assert.deepEqual(normalizeCharacter(JSON.parse(JSON.stringify(comArs))).escalpos_instalados?.map(e => e.regiaoArs), ARS_REGIOES.map(r => r.id));
console.log("7. ARS exige região, aceita as quatro opções e bloqueia duplicatas — OK");

const arsInativa = installEscalpo(personagem, { contentId: ARS_CONTENT_ID, regiaoArs: "tronco", nowIso });
assert.equal(arsDaRegiao(arsInativa, "tronco"), null, "ARS precisa ser ativada antes de proteger.");
const ativacao = ativarArs(arsInativa, 3);
assert.equal(ativacao.character.estado_jogo?.pa_gastos, (arsInativa.estado_jogo?.pa_gastos ?? 0) + 1);
assert.equal(arsDaRegiao(ativacao.character, "tronco")?.atual, 4);
assert.equal(ativarArs(ativacao.character, 3).character, ativacao.character, "Ativação repetida não gasta PA.");
const defesa = { armaduras: [{ instance: { id: "colete", itemNome: "Colete" }, item: { regioes: ["tronco"] }, mitMax: 3, mitAtual: 3, tipoProtecao: "fisica" }] } as unknown as Parameters<typeof resolveLayeredDefense>[0]["defense"];
const impacto = resolveLayeredDefense({ character: ativacao.character, damageAmount: 6, damageType: "fisico", wasBlocked: false, defense: defesa, region: "tronco" });
assert.equal(impacto.externa.mitigatedByMit, 3, "A armadura externa absorve primeiro.");
assert.equal(impacto.mitigatedByArs, 3, "A ARS absorve só o dano restante.");
assert.equal(impacto.finalDamage, 0);
assert.equal(arsDaRegiao(impacto.character, "tronco")?.atual, 3);
const soExterna = resolveLayeredDefense({ character: ativacao.character, damageAmount: 2, damageType: "fisico", wasBlocked: false, defense: defesa, region: "tronco" });
assert.equal(soExterna.mitigatedByArs, 0, "A ARS não desgasta quando a camada externa absorve tudo.");
assert.equal(arsDaRegiao(soExterna.character, "tronco")?.atual, 4);
assert.equal(resolveLayeredDefense({ character: ativacao.character, damageAmount: 3, damageType: "fisico", wasBlocked: false, region: "cabeca" }).mitigatedByArs, 0);
assert.equal(resolveLayeredDefense({ character: ativacao.character, damageAmount: 3, damageType: "energetico", wasBlocked: false, region: "tronco" }).mitigatedByArs, 0);
assert.equal(resolveLayeredDefense({ character: ativacao.character, damageAmount: 3, damageType: "fisico", wasBlocked: true, region: "tronco" }).mitigatedByArs, 0);
assert.equal(arsDaRegiao(restaurarArsDescansoLongo(impacto.character), "tronco")?.atual, 4);
assert.equal(arsDaRegiao(desativarArs(ativacao.character), "tronco"), null);
console.log("8. Armadura externa protege antes da ARS; ativação, desgaste e descanso longo — OK");

const danificada = definirDesgasteEscalpo(ativacao.character, arsInativa.escalpos_instalados![0].id, 1);
assert.equal(danificada.escalpos_instalados![0].desgaste, 1);
assert.equal(danificada.escalpos_instalados![0].arsAtiva, false);
assert.equal(arsDaRegiao(danificada, "tronco"), null);
assert.equal(ativarArs(danificada, 3).character, danificada);
const duasArs = installEscalpo(danificada, { contentId: ARS_CONTENT_ID, regiaoArs: "cabeca", nowIso });
const soCabecaAtiva = ativarArs(duasArs, 3).character;
assert.equal(soCabecaAtiva.escalpos_instalados?.find(e => e.regiaoArs === "tronco")?.arsAtiva, false, "Ativar outra região não reativa uma ARS danificada.");
assert.equal(arsDaRegiao(soCabecaAtiva, "cabeca")?.atual, 2);
assert.equal(restaurarArsDescansoLongo(danificada).escalpos_instalados![0].desgaste, 1, "Descanso não repara Desgaste.");
const reparada = definirDesgasteEscalpo(danificada, arsInativa.escalpos_instalados![0].id, 0);
assert.equal(reparada.escalpos_instalados![0].desgaste, 0);
assert.equal(normalizeCharacter(JSON.parse(JSON.stringify(reparada))).escalpos_instalados![0].desgaste, 0);
const modeloComEfeito = { ...rpi!, payloadAutomacao: { efeitos: [{ tipo: "modificador", valor: 1, alvo_tags: ["percepcao"] }] } };
assert.equal(deriveInstalledTechnicalEffects(comEscalpo, [modeloComEfeito]).length, 1);
assert.equal(deriveInstalledTechnicalEffects(definirDesgasteEscalpo(comEscalpo, instancia.id, 1), [modeloComEfeito]).length, 0);
console.log("9. Desgaste desativa funções especiais e não some no descanso — OK");

console.log("\ntest-escalpos — todos os cenários passaram.");
