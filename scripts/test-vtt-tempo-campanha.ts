import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CONDICOES_CLIMATICAS, MESES_IMPERIAIS, REGIOES, TEMPO_VAZIO,
  ajustarContextoManual, avancarTempoImperial, definirClimaManual, diaDaSemanaImperial, estacaoDoMes,
  minutoImperial, sortearClima, temperaturaAlvo, validarTempo,
} from "../src/app/mesas/[campaignId]/vtt/_dominio/tempoCampanha";

const base = { ...TEMPO_VAZIO, ano: 186, mes: 6, dia: 6, hora: "18:40" };
assert.equal(MESES_IMPERIAIS.length, 12);
assert.equal(CONDICOES_CLIMATICAS.length, 14);
assert.deepEqual([12, 1, 2, 3, 6, 9].map(estacaoDoMes), ["inverno", "inverno", "inverno", "primavera", "verao", "outono"]);
assert.equal(diaDaSemanaImperial(1, 7), 1);
assert.equal(validarTempo(base), null);
assert.equal(validarTempo({ ...base, dia: 31 }), "Dia inválido.");
assert.equal(validarTempo({ ...base, hora: "24:00" }), "Hora inválida.");
assert.equal(validarTempo({ ...TEMPO_VAZIO, ano: 186 }), "Informe ano, mês, dia e hora juntos.");
assert.equal(temperaturaAlvo({ ...base, regiao: "Talesh" }) > temperaturaAlvo({ ...base, regiao: "Kravus" }), true);
assert.equal(temperaturaAlvo({ ...base, condicao: "nevasca" }) < temperaturaAlvo({ ...base, condicao: "ceu_limpo" }), true);
const virou = avancarTempoImperial({ ...base, mes: 5, dia: 30, hora: "23:40" }, 30)!;
assert.deepEqual([virou.mes, virou.dia, virou.hora], [6, 1, "00:10"]);
assert.equal(estacaoDoMes(virou.mes!), "verao");

for (const regiao of REGIOES) {
  const amostras = Array.from({ length: 500 }, (_, seed) => {
    const estado = { ...base, regiao };
    const clima = sortearClima(seed, estado);
    assert.deepEqual(clima, sortearClima(seed, estado));
    assert.equal(clima.regiao, regiao);
    assert.equal(minutoImperial(clima), minutoImperial(estado));
    assert.equal(validarTempo(clima), null);
    assert.ok(clima.climaAteMinuto! > clima.climaDesdeMinuto!);
    return clima;
  });
  if (regiao !== "Torvash") assert.equal(amostras.some((c) => c.condicao === "tempestade_arcana"), false);
  if (regiao === "Kravus") assert.ok(amostras.filter((c) => c.condicao === "neve" || c.condicao === "nevasca").length > 100);
  if (regiao === "Beldran") assert.equal(amostras.some((c) => c.condicao.startsWith("neve")), false);
}
const estavel = definirClimaManual({ ...base, temperaturaC: 6 }, "nublado");
assert.equal(estavel.temperaturaC, temperaturaAlvo(estavel));
const neveManual = definirClimaManual(estavel, "nevasca");
assert.equal(neveManual.temperaturaC, temperaturaAlvo(neveManual));
assert.ok(neveManual.temperaturaC! < estavel.temperaturaC!);
const outraRegiao = ajustarContextoManual(estavel, { regiao: "Kravus" });
assert.equal(outraRegiao.temperaturaC, temperaturaAlvo(outraRegiao));
assert.ok(outraRegiao.temperaturaC! < estavel.temperaturaC!);
const outraEstacao = ajustarContextoManual(estavel, { mes: 12 });
assert.equal(outraEstacao.temperaturaC, temperaturaAlvo(outraEstacao));
assert.ok(outraEstacao.temperaturaC! < estavel.temperaturaC!);
const aquecendo = { ...estavel, temperaturaC: estavel.temperaturaC! - 6 };
assert.ok(avancarTempoImperial(aquecendo, 10)!.temperaturaC! < estavel.temperaturaC!);
const dez = avancarTempoImperial(estavel, 10)!;
assert.equal(dez.condicao, "nublado");
assert.ok(Math.abs(dez.temperaturaC! - estavel.temperaturaC!) <= 0.17);
let passos = estavel;
for (let i = 0; i < 6; i++) passos = avancarTempoImperial(passos, 10)!;
const hora = avancarTempoImperial(estavel, 60)!;
assert.equal(passos.condicao, hora.condicao);
assert.ok(Math.abs(passos.temperaturaC! - hora.temperaturaC!) < 0.05);
const transicao = avancarTempoImperial({ ...estavel, climaAteMinuto: minutoImperial(estavel)! + 30 }, 90)!;
assert.notEqual(transicao.climaDesdeMinuto, estavel.climaDesdeMinuto);
assert.equal(validarTempo(transicao), null);
const migracao = readFileSync("supabase/migrations/20261006104642_vtt_tempo_campanha.sql", "utf8");
assert.match(migracao, /enable row level security/);
assert.match(migracao, /for select to authenticated\s+using \(public\.is_campaign_member\(campaign_id\)\)/);
assert.match(migracao, /for update to authenticated\s+using \(public\.is_campaign_owner\(campaign_id\)\)/);
assert.match(migracao, /for insert to authenticated\s+with check \(public\.is_campaign_owner\(campaign_id\)\)/);
console.log("Tempo da campanha: calendário, estações, sorteio, transição, temperatura e RLS verificados.");
