/**
 * Testes PUROS do modelo de marcadores e da ferramenta K.
 *
 * Uso: npx tsx scripts/test-vtt-marcadores.ts
 */

import {
  ajustarPreenchidos, estaCompleto, gradienteAnel, limitarTotal, normalizarNome, rotuloAcessivel,
  SEGMENTOS_MAX, SEGMENTOS_MIN,
} from "../src/app/mesas/[campaignId]/vtt/_dominio/marcadores";
import { ferramentasParaPapel, interpretarAtalho } from "../src/app/mesas/[campaignId]/vtt/_ferramentas/controlador";

let passou = 0;
let falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

// ── Segmentos ─────────────────────────────────────────────────────
ok("1 (total abaixo do mínimo sobe para 2)", limitarTotal(1) === SEGMENTOS_MIN, String(limitarTotal(1)));
ok("2 (total acima do máximo desce para 12)", limitarTotal(40) === SEGMENTOS_MAX, String(limitarTotal(40)));
ok("3 (total livre entre os limites: 2 vale)", limitarTotal(2) === 2, String(limitarTotal(2)));
ok("4 (avançar não passa do total)", ajustarPreenchidos({ total: 4, preenchidos: 4 }, 1) === 4, "4/4 +1 = 4");
ok("5 (recuar não fica negativo)", ajustarPreenchidos({ total: 4, preenchidos: 0 }, -1) === 0, "0/4 −1 = 0");
ok("6 (completo só no último segmento)", estaCompleto({ total: 6, preenchidos: 6 }) && !estaCompleto({ total: 6, preenchidos: 5 }), "6/6 sim, 5/6 não");

// ── Nome ──────────────────────────────────────────────────────────
ok("7 (sem nome continua sem nome)", normalizarNome("   ") === null, String(normalizarNome("   ")));
ok("8 (nome digitado é aparado)", normalizarNome("  Abrir a Passagem ") === "Abrir a Passagem", String(normalizarNome("  Abrir a Passagem ")));
ok("9 (rótulo acessível sem nome usa o tipo)", rotuloAcessivel({ tipo: "pressao", nome: null, total: 4, preenchidos: 1 }) === "Pressão, 1 de 4", rotuloAcessivel({ tipo: "pressao", nome: null, total: 4, preenchidos: 1 }));

// ── Anel ──────────────────────────────────────────────────────────
const anel = gradienteAnel(4, 1);
ok("10 (uma fatia colorida por segmento)", (anel.match(/var\(--mk-cor\)/g) ?? []).length === 1 && (anel.match(/var\(--mk-vazio\)/g) ?? []).length === 3, anel.slice(0, 60) + "…");
ok("11 (anel não carrega hex: a cor é do tema)", !/#[0-9a-f]{3,6}/i.test(anel), "só var(...)");

// ── Ferramenta ────────────────────────────────────────────────────
ok("12 (narrador tem Marcadores)", ferramentasParaPapel(true).includes("marcadores"), "sim");
ok("13 (jogador não tem a ferramenta)", !ferramentasParaPapel(false).includes("marcadores"), "não");
const k = interpretarAtalho({ key: "k", ctrlKey: false, metaKey: false, shiftKey: false, alvoEhEditavel: false }, ferramentasParaPapel(true));
ok("14 (K abre Marcadores)", k?.tipo === "ferramenta" && k.id === "marcadores", JSON.stringify(k));
const m = interpretarAtalho({ key: "m", ctrlKey: false, metaKey: false, shiftKey: false, alvoEhEditavel: false }, ferramentasParaPapel(true));
ok("15 (M continua sendo Medir)", m?.tipo === "ferramenta" && m.id === "medir", JSON.stringify(m));

console.log(`\n${passou} ok, ${falhou} falha(s).`);
if (falhou > 0) process.exit(1);
