/**
 * Personagem RUPTURA v1.2 para fixtures de teste no banco.
 *
 * Desde a Fase 10 o banco recusa personagem sem `schema_version: 2`. Os
 * scripts de dev que criam personagens partem desta base completa (Âncora,
 * Ranking F, gerada por `scripts/dev/v12/gerar_fixture_personagem.ts`) e
 * sobrescrevem só o que o teste precisa (nome, atributos, carteira…).
 * Os campos de envelope v1.2 (schema_version, ruleset_version, progressao,
 * trajetoria, magia) nunca são sobrescritos por engano: `extra` é mesclado
 * por cima, mas objetos aninhados de primeiro nível (atributos, pericias,
 * recursos_atuais, carteira, metadados) são mesclados campo a campo.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "personagem_v12.json"), "utf8"));
const MESCLA_RASA = ["atributos", "pericias", "recursos_atuais", "carteira", "metadados", "estado_jogo"];

/** @param {string} nome @param {Record<string, unknown>} [extra] */
export function personagemV12(nome, extra = {}) {
  const base = structuredClone(BASE);
  const out = { ...base, ...extra, nome };
  for (const k of MESCLA_RASA) {
    if (extra[k] && typeof extra[k] === "object" && !Array.isArray(extra[k])) out[k] = { ...(base[k] ?? {}), ...extra[k] };
  }
  out.schema_version = 2;
  out.ruleset_version = "1.2";
  return out;
}
