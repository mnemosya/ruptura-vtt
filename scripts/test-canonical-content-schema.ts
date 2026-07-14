/**
 * Verificação local (sem Supabase) da camada canônica de definições —
 * Etapa 1 do aditivo do Editor Universal. Roda os 5 exemplos
 * obrigatórios do checkpoint contra os adapters + validação +
 * diagnóstico de automação, e faz um round-trip de compatibilidade com
 * 3 registros REAIS de `content/db_*.json` (não fixtures sintéticas) —
 * prova que os adapters leem conteúdo legado real sem quebrar e sem
 * descartar campos desconhecidos.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adaptCondition, adaptItem, adaptSpell } from "../src/lib/contentSchema/adapters";
import { diagnosticarDocumento } from "../src/lib/contentSchema/diagnostics";
import { EXEMPLOS_OBRIGATORIOS } from "../src/lib/contentSchema/examples/canonicalExamples";
import { validarConteudo } from "../src/lib/contentSchema/validation";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

console.log("=== test-canonical-content-schema ===\n");

console.log("--- 1. Casos obrigatórios (fixtures sintéticas no formato legado real) ---\n");

for (const exemplo of EXEMPLOS_OBRIGATORIOS) {
  const resultados = exemplo.adaptar();
  assert.ok(resultados.length > 0, `${exemplo.id}: deve produzir ao menos um documento canônico.`);

  for (const resultado of resultados) {
    const validacao = validarConteudo(resultado.canonico, resultado.camposDesconhecidos);
    const diagnostico = diagnosticarDocumento(resultado.canonico);
    assert.ok(
      validacao.valido,
      `${exemplo.id} (${resultado.canonico.slug}): esperado válido, erros: ${validacao.erros.join(" | ")}`,
    );
    console.log(
      `✓ ${exemplo.descricao} — slug="${resultado.canonico.slug}" efeitos=${diagnostico.totalEfeitos} modos=${JSON.stringify(diagnostico.porModo)}`,
    );
  }
}

console.log("\n--- 2. Validações específicas dos 5 casos ---\n");

const [magiaFogo] = EXEMPLOS_OBRIGATORIOS[0].adaptar();
const efeitoDano = magiaFogo.canonico.efeitos[0];
assert.equal(efeitoDano.tipo, "dano");
assert.equal(efeitoDano.payloadEspecifico.dado, "1d8");
assert.equal(efeitoDano.payloadEspecifico.subtipoDano, "igneo");
console.log("✓ Magia 1d8 fogo — efeito canônico 'dano' com dado=1d8, subtipoDano=igneo");

const [itemCura] = EXEMPLOS_OBRIGATORIOS[1].adaptar();
const efeitoCura = itemCura.canonico.efeitos[0];
assert.equal(efeitoCura.tipo, "cura");
assert.equal(efeitoCura.modoAutomacao, "automatico");
assert.equal(efeitoCura.payloadEspecifico.dado, "2d6");
console.log("✓ Item 2d6 PV — efeito canônico 'cura' com modoAutomacao=automatico (executor real em itemUse.ts)");

const [talentoNivel1] = EXEMPLOS_OBRIGATORIOS[2].adaptar();
const efeitoModificador = talentoNivel1.canonico.efeitos[0];
assert.equal(efeitoModificador.tipo, "modificar_teste");
assert.equal(efeitoModificador.payloadEspecifico.valor, 1);
assert.deepEqual(efeitoModificador.payloadEspecifico.alvoTags, ["luta"]);
assert.equal(efeitoModificador.duracao?.tipo, "rodadas");
console.log("✓ Talento +1 Luta — efeito canônico 'modificar_teste' com duracao.tipo=rodadas");

const [condicaoCorroido] = EXEMPLOS_OBRIGATORIOS[3].adaptar();
const efeitoDanoRodada = condicaoCorroido.canonico.efeitos[0];
assert.equal(efeitoDanoRodada.tipo, "dano");
assert.equal(efeitoDanoRodada.gatilho, "fim_de_rodada");
assert.equal(efeitoDanoRodada.payloadEspecifico.dado, "1d4");
console.log("✓ Condição 1d4 fim de rodada — efeito canônico 'dano' com gatilho=fim_de_rodada");

const [magiaResistencia] = EXEMPLOS_OBRIGATORIOS[4].adaptar();
assert.equal(magiaResistencia.canonico.resistencia?.cdFormula, "5 + nivel_vertente");
const efeitoAplicarCondicao = magiaResistencia.canonico.efeitos.find((e) => e.tipo === "aplicar_condicao");
assert.ok(efeitoAplicarCondicao, "Deve existir um efeito 'aplicar_condicao'.");
assert.equal((efeitoAplicarCondicao!.payloadEspecifico.condicao as { slug: string }).slug, "atordoado");
assert.equal(efeitoAplicarCondicao!.modoAutomacao, "lembrete");
assert.ok(magiaResistencia.canonico.referencias.some((r) => r.slug === "atordoado" && r.tipoConteudo === "condition"));
console.log("✓ Magia com resistência — aplicar_condicao referencia 'atordoado' (modoAutomacao=lembrete, referência registrada)");

console.log("\n--- 3. Round-trip com conteúdo real (content/db_*.json) — prova de compatibilidade com legado ---\n");

const magias = readJson<{ magias: Record<string, unknown>[] }>("content/db_magias_normalizado_v1_3.json").magias;
const bolaDeFogo = magias.find((m) => m.slug === "energetica_bola_de_fogo");
assert.ok(bolaDeFogo, "Magia real 'energetica_bola_de_fogo' deve existir no conteúdo publicado.");
const resultadoBolaDeFogo = adaptSpell(bolaDeFogo!);
assert.equal(validarConteudo(resultadoBolaDeFogo.canonico, resultadoBolaDeFogo.camposDesconhecidos).valido, true);
assert.equal(resultadoBolaDeFogo.canonico.efeitos.some((e) => e.tipo === "dano" && e.payloadEspecifico.dado === "3d6"), true);
console.log(`✓ Magia real "energetica_bola_de_fogo" adaptada sem erros — ${resultadoBolaDeFogo.camposDesconhecidos.length} campo(s) desconhecido(s)`);

const itens = readJson<{ itens: Record<string, unknown>[] }>("content/db_equipamentos_normalizado_v1_2.json").itens;
const ansiolitico = itens.find((i) => i.slug === "ansiolitico");
assert.ok(ansiolitico, "Item real 'ansiolitico' deve existir no conteúdo publicado.");
const resultadoAnsiolitico = adaptItem(ansiolitico!);
assert.equal(validarConteudo(resultadoAnsiolitico.canonico, resultadoAnsiolitico.camposDesconhecidos).valido, true);
assert.ok(
  resultadoAnsiolitico.camposDesconhecidos.some((c) => c.caminho === "estatisticas"),
  "estatisticas deve ser preservado como campo desconhecido (somente leitura nesta etapa).",
);
console.log(`✓ Item real "ansiolitico" adaptado sem erros — estatisticas preservado como somente leitura`);

const condicoes = readJson<{ condicoes: Record<string, unknown>[] }>("content/db_condicoes_normalizado_v1_5.json").condicoes;
const queimando = condicoes.find((c) => c.slug === "queimando");
assert.ok(queimando, "Condição real 'queimando' deve existir no conteúdo publicado.");
const resultadoQueimando = adaptCondition(queimando!);
assert.equal(validarConteudo(resultadoQueimando.canonico, resultadoQueimando.camposDesconhecidos).valido, true);
assert.ok(resultadoQueimando.canonico.efeitos.some((e) => e.tipo === "dano" && e.gatilho === "fim_de_rodada"));
assert.ok(
  resultadoQueimando.camposDesconhecidos.some((c) => c.caminho === "acoes_habilitadas"),
  "acoes_habilitadas ainda não tem representação canônica — deve ser preservado, não descartado.",
);
console.log("✓ Condição real 'queimando' adaptada sem erros — acoes_habilitadas preservado como campo desconhecido");

console.log("\n=== TODOS OS TESTES PASSARAM ===");
