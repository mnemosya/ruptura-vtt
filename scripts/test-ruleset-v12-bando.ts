import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addCoverV12,
  addExposureV12,
  adjustCashV12,
  dismissSpecialistV12,
  payIntervalV12,
  recruitSpecialistV12,
  alertStageV12,
  crewRankingV12,
  exposureStageV12,
  improveUpgradeV12,
  installUpgradeV12,
  lowerAlertV12,
  moveHeadquartersV12,
  neutralizePistaV12,
  newCrewStateV12,
  qgStatsV12,
  raiseAlertV12,
  resolveOperationCobaltoV12,
  type CrewCatalogV12,
  type CrewResult,
  type CrewStateV12,
} from "../src/lib/rulesetV12";

/** Bando Refratário (capítulo 10): catálogo transcrito e motor puro. */
const catalogo = JSON.parse(readFileSync("content/v12/db_bando_v1_2.json", "utf8")) as CrewCatalogV12;
const valor = <T>(r: CrewResult<T>): T => { if (!r.ok) throw new Error(r.error); return r.value; };
const erro = <T>(r: CrewResult<T>, trecho: string) => { assert.equal(r.ok, false, `esperava erro: ${trecho}`); if (!r.ok) assert.ok(r.error.includes(trecho), r.error); };

// Catálogo.
assert.deepEqual(catalogo.rankings.map((r) => [r.ranking, r.cobalto]), [["F", 0], ["E", 3], ["D", 7], ["C", 12], ["B", 18], ["A", 25], ["S", 35]]);
assert.equal(catalogo.qgs.length, 5);
assert.equal(catalogo.melhorias.length, 8);
assert.equal(catalogo.especialistas.length, 7);

// Criação: F, Refúgio Improvisado, tudo em 0.
let b: CrewStateV12 = newCrewStateV12({ nome: "Vórtex", simbolo: "espiral", principio: "Ninguém fica para trás.", contato_inicial: "Malik", inimigo_ou_divida: "Dívida com o Corvo" });
assert.equal(crewRankingV12(b.cobalto, catalogo), "F");
assert.deepEqual(qgStatsV12(b, catalogo), { capacidade: 1, usados: 0, seguranca: 0 });

// Cobalto: base + no máximo um ajuste, variação de −2 a +3, nunca negativo.
assert.deepEqual(resolveOperationCobaltoV12(0, "cumprido", "repercussao"), { cobalto: 3, variacao: 3 });
assert.deepEqual(resolveOperationCobaltoV12(0, "nenhum", "traicao_confirmada"), { cobalto: 0, variacao: -2 });
assert.deepEqual(resolveOperationCobaltoV12(5, "parcial", "quebra_publica"), { cobalto: 5, variacao: 0 });
assert.equal(crewRankingV12(2, catalogo), "F");
assert.equal(crewRankingV12(3, catalogo), "E");
assert.equal(crewRankingV12(24, catalogo), "B");
assert.equal(crewRankingV12(35, catalogo), "S");

// Exposição: pista obrigatória, +2 por operação, estágios, neutralização.
erro(addExposureV12(b, [" "], "t"), "pista que o originou");
erro(addExposureV12(b, ["a", "b", "c"], "t"), "no máximo 2");
b = valor(addExposureV12(b, ["câmera na rota de fuga", "veículo rastreado"], "t1"));
assert.equal(exposureStageV12(b.exposicao_pistas.length), "Vestígios");
b = valor(addExposureV12(b, ["comunicação rastreada", "informante"], "t2"));
assert.equal(exposureStageV12(b.exposicao_pistas.length), "Perímetro observado");
b = valor(neutralizePistaV12(b, 0));
assert.equal(b.exposicao_pistas.length, 3);
assert.equal(b.exposicao_pistas[0].origem, "veículo rastreado");
erro(neutralizePistaV12(b, 9), "inexistente");
assert.equal(exposureStageV12(6), "Localizado");

// Alerta Imperial: +0..2 por operação, teto 5, redução com causa.
erro(raiseAlertV12(b, 3), "0 a 2");
b = valor(raiseAlertV12(b, 2));
assert.equal(alertStageV12(b.alerta), "Monitorado");
erro(lowerAlertV12(b, ""), "causa concreta");
b = valor(lowerAlertV12(b, "investigação redirecionada"));
assert.equal(b.alerta, 1);
assert.equal(alertStageV12(9), "Caçado");

// Melhorias: Ranking, Capacidade, caixa, aprimoramento só no C.
b = { ...b, caixa: 20000 };
erro(installUpgradeV12(b, "rede_de_vigilancia", catalogo), "exige Ranking E");
b = { ...b, cobalto: 7 }; // D
b = valor(installUpgradeV12(b, "rede_de_vigilancia", catalogo));
assert.equal(qgStatsV12(b, catalogo).seguranca, 1);
erro(installUpgradeV12(b, "sala_isolada", catalogo), "Capacidade");
erro(improveUpgradeV12(b, "rede_de_vigilancia", catalogo), "Ranking C");

// Troca de QG: Oficina (D, Ⱥ 5.000, cap. 4, seg. 1); fixa reconstruída pela metade; Exposição zera.
const antes = b.caixa;
b = valor(moveHeadquartersV12(b, "oficina_ou_galpao", catalogo));
assert.equal(b.qg.slug, "oficina_ou_galpao");
assert.equal(b.caixa, antes - 5000 - 500, "Refúgio não tem revenda; Rede de Vigilância reconstruída por Ⱥ 500");
assert.equal(b.exposicao_pistas.length, 0, "Exposição volta a 0");
assert.equal(b.alerta, 1, "Alerta não muda");
b = valor(installUpgradeV12(b, "sala_isolada", catalogo));
b = valor(installUpgradeV12(b, "saida_de_emergencia", catalogo));
assert.equal(qgStatsV12(b, catalogo).seguranca, 3, "1 base + 3 melhorias, limitado a 3");
b = { ...b, cobalto: 12 }; // C
b = valor(improveUpgradeV12(b, "rede_de_vigilancia", catalogo));
erro(improveUpgradeV12(b, "rede_de_vigilancia", catalogo), "já foi aprimorada");

// Mudança sob pressão: fixas perdidas, sem revenda.
b = { ...b, caixa: 15000 };
const fuga = valor(moveHeadquartersV12(b, "instalacao_clandestina", catalogo, { comprometido: true }));
assert.equal(fuga.qg.melhorias.length, 0, "melhorias fixas abandonadas");
assert.equal(fuga.caixa, 15000 - 10000, "sem revenda do QG comprometido");
erro(moveHeadquartersV12(b, "complexo_refratario", catalogo), "exige Ranking A");

// Especialistas: Ranking mínimo, recrutamento, salário e dois intervalos sem pagamento.
let e = { ...newCrewStateV12({ nome: "X", simbolo: "", principio: "", contato_inicial: "", inimigo_ou_divida: "" }), caixa: 2000 };
erro(recruitSpecialistV12(e, "mecanico", catalogo), "exige Ranking E");
e = { ...e, cobalto: 3 };
erro(recruitSpecialistV12(e, "quimico", catalogo), "exige Ranking D");
e = valor(recruitSpecialistV12(e, "mecanico", catalogo, "Bruna"));
e = valor(recruitSpecialistV12(e, "informante", catalogo));
assert.equal(e.caixa, 2000 - 700 - 600);
let pag = payIntervalV12(e, catalogo); // 700 em caixa: paga Mecânico (250) e Informante (200)
assert.equal(pag.pagos, 450);
e = { ...pag.estado, caixa: 300 };
pag = payIntervalV12(e, catalogo); // paga Mecânico; Informante fica sem salário
assert.deepEqual(pag.semSalario, ["Informante"]);
pag = payIntervalV12({ ...pag.estado, caixa: 0 }, catalogo); // segundo intervalo seguido: Informante sai; Mecânico entra no primeiro
assert.deepEqual(pag.encerrados, ["Informante"]);
assert.deepEqual(pag.estado.especialistas.map((x) => [x.slug, x.intervalos_sem_salario]), [["mecanico", 1]]);
e = valor(dismissSpecialistV12(pag.estado, 0));
assert.equal(e.especialistas.length, 0);

// Coberturas e caixa.
const custosCobertura = { documento_avulso: 100, identidade_simples: 400, identidade_integrada: 1000 };
e = { ...e, caixa: 500 };
erro(addCoverV12(e, "identidade_simples", " ", custosCobertura), "Descreva");
e = valor(addCoverV12(e, "identidade_simples", "Inspetora Ana Duarte", custosCobertura));
assert.equal(e.caixa, 100);
erro(addCoverV12(e, "identidade_integrada", "x", custosCobertura), "Caixa insuficiente");
erro(adjustCashV12(e, -200), "negativo");
assert.equal(valor(adjustCashV12(e, 1500)).caixa, 1600);

console.log("test-ruleset-v12-bando — catálogo e regras do Bando válidos.");
