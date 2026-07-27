/**
 * Teste do padrão "+X em testes específicos" de Talentos — checkpoint
 * v0.48. Lê o DB real de talentos (sem Supabase) e confirma que a
 * automação genérica de `payload_automacao.efeitos[].tipo==="modificador"`
 * funciona igual para talentos de classes diferentes, sem hardcoding
 * por talento.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeTalentContent,
  deriveActiveEffectsFromTalents,
  acquireTalentLevel,
  removeTalentLevel,
  describeNonAutomatedTalentEffects,
  createInitialCharacter,
  getBricolagemActiveEffects,
  registerBricolagemVulnerabilidade,
  type TalentContent,
} from "../src/lib/character";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

console.log("=== test-talents ===\n");

const db = readJson<{ talentos: Record<string, unknown>[] }>("content/db_talentos_normalizado_v1_3.json");
const talents: TalentContent[] = db.talentos.map(normalizeTalentContent);
assert.ok(talents.length >= 20, "Catálogo real deve ter pelo menos 20 talentos.");

const artifice = talents.find((t) => t.slug === "artifice");
assert.ok(artifice, "Talento 'artifice' deve existir no DB real.");
const bricolagem = artifice!.niveis.find((n) => n.nome === "Bricolagem");
assert.ok(bricolagem, "Nível 'Bricolagem' deve existir.");

// -------------------------------------------------------------
// 1. Nível não adquirido não gera nenhum efeito ativo.
// -------------------------------------------------------------
const personagem = createInitialCharacter(null, "Testador de Talentos");
assert.equal(deriveActiveEffectsFromTalents(personagem, talents).length, 0);
console.log("1. Sem talento adquirido — nenhum efeito ativo — OK");

// -------------------------------------------------------------
// 2. Padrão genérico "+X em testes específicos" — exemplo com um talento
// SEM efeito condicional irmão (Aparar, Espadachim: +1 na ação "aparar",
// sempre ligado). Bricolagem NÃO serve mais de exemplo aqui desde o
// checkpoint pós-v0.72 (ver bloco 2b abaixo) — seu modificador é
// deliberadamente excluído deste pipeline incondicional por ter um
// efeito irmão `detectar_falha_sem_teste` no mesmo nível (talents.ts).
// -------------------------------------------------------------
const espadachim = talents.find((t) => t.slug === "espadachim");
assert.ok(espadachim, "Talento 'espadachim' deve existir no DB real.");
const aparar = espadachim!.niveis.find((n) => n.nome === "Aparar");
assert.ok(aparar, "Nível 'Aparar' deve existir.");

const comAparar = acquireTalentLevel(personagem, {
  talentoId: espadachim!.id,
  nivelId: aparar!.id,
  nivel: aparar!.nivel,
  nowIso: "2026-07-03T10:00:00.000Z",
});
assert.equal(comAparar.talentos_adquiridos?.length, 1);

const efeitos = deriveActiveEffectsFromTalents(comAparar, talents);
assert.ok(efeitos.length >= 1, "Aparar deve gerar pelo menos 1 ActiveEffect (o modificador +1, sempre ligado).");
const modificador = efeitos.find((e) => e.modifier === 1 && e.affectedTags.includes("aparar"));
assert.ok(modificador, "Deve existir um ActiveEffect de +1 com tag/ação 'aparar'.");
assert.equal(modificador!.sourceType, "talent");
console.log("2. Padrão genérico de modificador incondicional (Aparar, +1) — OK");

// -------------------------------------------------------------
// 2b. Bricolagem: o modificador é CONDICIONAL/CONSUMÍVEL (nunca "sempre
// ligado") — adquirir o talento sozinho não gera nenhum ActiveEffect no
// pipeline genérico; só depois de "identificar a falha" (registrar uma
// vulnerabilidade) o bônus aparece, via getBricolagemActiveEffects.
// -------------------------------------------------------------
const comBricolagem = acquireTalentLevel(personagem, {
  talentoId: artifice!.id,
  nivelId: bricolagem!.id,
  nivel: bricolagem!.nivel,
  nowIso: "2026-07-03T10:00:00.000Z",
});
assert.equal(comBricolagem.talentos_adquiridos?.length, 1);
assert.equal(
  deriveActiveEffectsFromTalents(comBricolagem, talents).length,
  0,
  "Bricolagem sozinha (sem vulnerabilidade identificada) não gera ActiveEffect incondicional.",
);

const comVulnerabilidade = registerBricolagemVulnerabilidade(
  comBricolagem,
  {
    nivelId: bricolagem!.id,
    tipo: "mecanismo",
    alvoDescricao: "fechadura eletrônica",
    falhaPrincipal: "trava emperrada",
    periciaBeneficiada: "engenharia",
  },
  "bricolagem-teste-1",
  "2026-07-03T10:05:00.000Z",
);
const bricolagemEfeitos = getBricolagemActiveEffects(comVulnerabilidade, talents);
assert.equal(bricolagemEfeitos.length, 1, "Vulnerabilidade identificada deve gerar exatamente 1 ActiveEffect consumível.");
assert.equal(bricolagemEfeitos[0].modifier, 1, "Bônus de Bricolagem deve ser o valor declarado no payload canônico (+1).");
assert.ok(bricolagemEfeitos[0].id.startsWith("bricolagem:"), "ActiveEffect de Bricolagem usa tag sintética própria.");
console.log("2b. Bricolagem gera modificador consumível só após identificar a falha — OK");

// -------------------------------------------------------------
// 3. Adquirir o mesmo nível duas vezes não duplica.
// -------------------------------------------------------------
const duplicado = acquireTalentLevel(comBricolagem, {
  talentoId: artifice!.id,
  nivelId: bricolagem!.id,
  nivel: bricolagem!.nivel,
  nowIso: "2026-07-03T10:05:00.000Z",
});
assert.equal(duplicado, comBricolagem, "Adquirir o mesmo nível de novo não deve mudar o personagem.");
assert.equal(duplicado.talentos_adquiridos?.length, 1);
console.log("3. Idempotência de aquisição (mesmo nível não duplica) — OK");

// -------------------------------------------------------------
// 4. Remover talento remove o efeito ativo.
// -------------------------------------------------------------
const acquiredId = comBricolagem.talentos_adquiridos![0].id;
const semTalento = removeTalentLevel(comBricolagem, acquiredId);
assert.equal(semTalento.talentos_adquiridos?.length, 0);
assert.equal(deriveActiveEffectsFromTalents(semTalento, talents).length, 0);
console.log("4. Remover talento remove o efeito ativo — OK");

// -------------------------------------------------------------
// 5. Padrão automatizado funciona igual para OUTRO talento de OUTRA classe (sem hardcoding).
//
// Achado real deste checkpoint: nem todo efeito `tipo:"modificador"`
// usa `alvo_tags` — alguns (ex.: Guardião "Blindagem") usam
// `alvo_acoes` (slug de ação, não tag de rolagem). Este módulo só
// automatiza a forma `alvo_tags` (a única mapeável 1:1 pro sistema de
// `ActiveEffect`/tags de rolagem já existente); a outra forma vira
// texto manual (cenário 6) — documentado como achado, não bug.
// -------------------------------------------------------------
let encontrouOutroTalentoAutomatizado = false;
for (const talent of talents) {
  if (talent.id === artifice!.id) continue;
  for (const nivel of talent.niveis) {
    const payload = nivel.payload_automacao as { efeitos?: { tipo?: string; alvo_tags?: unknown; valor?: unknown }[] } | undefined;
    const temModificadorComTags = Array.isArray(payload?.efeitos) && payload!.efeitos!.some(
      (e) => e.tipo === "modificador" && typeof e.valor === "number" && ((Array.isArray(e.alvo_tags) && e.alvo_tags.length > 0) || (Array.isArray((e as { alvo_acoes?: unknown[] }).alvo_acoes) && (e as { alvo_acoes: unknown[] }).alvo_acoes.length > 0)),
    );
    if (!temModificadorComTags) continue;
    const comTalento = acquireTalentLevel(personagem, { talentoId: talent.id, nivelId: nivel.id, nivel: nivel.nivel, nowIso: "2026-07-03T10:00:00.000Z" });
    const efeitosDerivados = deriveActiveEffectsFromTalents(comTalento, talents);
    assert.ok(efeitosDerivados.length >= 1, `${talent.nome} — ${nivel.nome} deveria gerar ActiveEffect (mesmo código de Artífice, sem hardcoding).`);
    encontrouOutroTalentoAutomatizado = true;
    break;
  }
  if (encontrouOutroTalentoAutomatizado) break;
}
assert.ok(encontrouOutroTalentoAutomatizado, "Deve haver pelo menos um outro talento com modificador via alvo_tags no DB real.");
console.log("5. Padrão automatizado funciona para outro talento de outra classe (mesmo código, sem hardcoding) — OK");

// -------------------------------------------------------------
// 6. Efeitos não automatizados aparecem como texto, nunca silenciosamente perdidos.
// -------------------------------------------------------------
const toqueDeMidas = artifice!.niveis.find((n) => n.nome === "Toque de Midas");
assert.ok(toqueDeMidas, "Nível 'Toque de Midas' deve existir.");
const textoManual = describeNonAutomatedTalentEffects(toqueDeMidas!);
assert.ok(textoManual.length >= 1, "Toque de Midas (regra_especial) deve aparecer como texto manual.");
assert.ok(textoManual[0].includes("resolução manual"));
console.log("6. Efeitos não automatizados viram texto manual (nunca perdidos) — OK");

console.log("\ntest-talents — todos os cenários passaram.");
