/**
 * Testes PUROS dos presets de objeto tático.
 *
 * O invariante que importa: nenhum preset pode nascer com PD FORA da
 * faixa oficial da própria categoria (`16 COMBATE` → COBERTURA →
 * TABELA DE DURABILIDADE). Um preset é atalho, não licença pra
 * contradizer a regra — e errar isso calado seria pior que não ter
 * preset nenhum.
 *
 * Uso: npx tsx scripts/test-vtt-presets-objeto.ts
 */

import {
  FAIXA_PD_POR_CATEGORIA,
  PRESETS_OBJETO,
  pdDentroDaFaixa,
  valoresIniciaisDoPreset,
} from "../src/app/mesas/[campaignId]/vtt/_dominio/presetsObjeto";
import type { PresetObjeto } from "../src/lib/vtt/sceneStorage";

let passou = 0, falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

const presets = Object.keys(PRESETS_OBJETO) as PresetObjeto[];

// ── Faixas oficiais ───────────────────────────────────────────────
ok("1 (faixa Frágil é 2 a 5 PD)", FAIXA_PD_POR_CATEGORIA.fragil.min === 2 && FAIXA_PD_POR_CATEGORIA.fragil.max === 5, "2–5");
ok("2 (faixa Média é 6 a 15 PD)", FAIXA_PD_POR_CATEGORIA.media.min === 6 && FAIXA_PD_POR_CATEGORIA.media.max === 15, "6–15");
ok("3 (faixa Resistente é 16+, sem teto)", FAIXA_PD_POR_CATEGORIA.resistente.min === 16 && FAIXA_PD_POR_CATEGORIA.resistente.max === null, "16+");

// ── O invariante central ──────────────────────────────────────────
{
  const fora = presets.filter((p) => !pdDentroDaFaixa(PRESETS_OBJETO[p].categoria, PRESETS_OBJETO[p].pd));
  ok("4 (TODO preset nasce com PD dentro da faixa oficial da sua categoria)",
    fora.length === 0, fora.length === 0 ? `${presets.length} presets conferidos` : `fora: ${fora.join(", ")}`);
}

// ── Coerência interna ─────────────────────────────────────────────
{
  const incoerentes = presets.filter((p) => {
    const d = PRESETS_OBJETO[p];
    // Categoria e PD andam juntos: ou os dois existem, ou nenhum.
    return (d.categoria === null) !== (d.pd === null);
  });
  ok("5 (categoria e PD sempre existem juntos — nunca um sem o outro)",
    incoerentes.length === 0, incoerentes.join(", ") || "coerentes");
}
{
  // `terrenoProjetado` só faz sentido em quem NÃO bloqueia: se já
  // bloqueia, encarecer o passo é contradição (não há passo).
  const contraditorios = presets.filter((p) => {
    const d = PRESETS_OBJETO[p];
    return d.bloqueiaMovimento && d.terrenoProjetado !== null;
  });
  ok("6 (nenhum preset bloqueia E projeta terreno difícil ao mesmo tempo)",
    contraditorios.length === 0, contraditorios.join(", ") || "coerentes");
}
{
  const semRotulo = presets.filter((p) => !PRESETS_OBJETO[p].rotulo.trim() || !PRESETS_OBJETO[p].nota.trim());
  ok("7 (todo preset tem rótulo e nota explicando os padrões)", semRotulo.length === 0, semRotulo.join(", ") || "completos");
}

// ── Casos nomeados pelo livro ─────────────────────────────────────
ok("8 (entulho NÃO bloqueia — atravessa como terreno difícil)",
  PRESETS_OBJETO.entulho.bloqueiaMovimento === false && PRESETS_OBJETO.entulho.terrenoProjetado === "dificil",
  "não bloqueia + difícil");
ok("9 (parede sólida = cobertura TOTAL)", PRESETS_OBJETO.muro.grauCobertura === "total", PRESETS_OBJETO.muro.grauCobertura!);
ok("10 (coluna larga = cobertura MAIOR)", PRESETS_OBJETO.coluna.grauCobertura === "maior", PRESETS_OBJETO.coluna.grauCobertura!);
ok("11 (mesa/balcão = cobertura PARCIAL)", PRESETS_OBJETO.mesa.grauCobertura === "parcial", PRESETS_OBJETO.mesa.grauCobertura!);
ok("12 (barricada alta = cobertura TOTAL)", PRESETS_OBJETO.barricada.grauCobertura === "total", PRESETS_OBJETO.barricada.grauCobertura!);

// ── Personalizado não inventa nada ────────────────────────────────
{
  const d = PRESETS_OBJETO.personalizado;
  ok("13 (personalizado não chuta cobertura nem PD)",
    d.grauCobertura === null && d.categoria === null && d.pd === null, "tudo nulo");
}

// ── Valores iniciais ──────────────────────────────────────────────
{
  const v = valoresIniciaisDoPreset("veiculo");
  ok("14 (PD atual nasce CHEIO — igual ao máximo)", v.pd === v.pdMax && v.pd === 10, `${v.pd}/${v.pdMax}`);
  const p = valoresIniciaisDoPreset("personalizado");
  ok("15 (personalizado nasce sem PD nenhum)", p.pd === null && p.pdMax === null, "null/null");
}

// ── Validador de faixa ────────────────────────────────────────────
ok("16 (PD abaixo da faixa é rejeitado)", !pdDentroDaFaixa("media", 5), "5 em Média");
ok("17 (PD acima da faixa é rejeitado)", !pdDentroDaFaixa("fragil", 6), "6 em Frágil");
ok("18 (Resistente aceita valor alto — não tem teto)", pdDentroDaFaixa("resistente", 999), "999");
ok("19 (sem categoria ou sem PD, não há o que validar)",
  pdDentroDaFaixa(null, 3) && pdDentroDaFaixa("media", null), "aceita");

console.log(`\n${passou} ok, ${falhou} falha(s).`);
if (falhou > 0) process.exit(1);
