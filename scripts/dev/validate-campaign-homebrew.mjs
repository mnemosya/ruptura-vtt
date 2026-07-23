#!/usr/bin/env node
/**
 * Verificação focada da Etapa 12 (conteúdo de mesa e homebrew). Mesmo
 * padrão das etapas anteriores: compila os módulos reais com `tsc`,
 * roda com `node` puro, nunca duplica lógica.
 *
 * Uso:
 *   npx tsc src/lib/campaignContent/campaignContentTypes.ts \
 *     src/lib/campaignContent/resolveEffectiveContent.ts \
 *     src/lib/contentSchema/canonicalHash.ts src/lib/contentSchema/draftTypes.ts \
 *     src/lib/contentSchema/effectDraftTypes.ts src/lib/content/types.ts \
 *     --module commonjs --target es2020 --outDir <dir> --esModuleInterop \
 *     --skipLibCheck --resolveJsonModule --moduleResolution node
 *   ln -sf <repo>/node_modules <dir>/node_modules   # resolve @supabase/supabase-js
 *   node scripts/dev/validate-campaign-homebrew.mjs <dir-compilado>
 *
 * Cobre só `classificarEstadoAtualizacao` (pura) — o resto do módulo
 * (`resolveEffectiveList`/`resolveEffectiveOne`, os server actions em
 * `campaignContentServerActions.ts`, e as funções SECURITY DEFINER da
 * migration 0025) fazem I/O real contra Supabase e exigem um projeto
 * conectado para round-trip/atomicidade — não cobertos aqui (ver
 * checkpoint §Verificações não executadas).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
void __dirname;

const compiledDir = process.argv[2];
if (!compiledDir) {
  console.error("Uso: node validate-campaign-homebrew.mjs <diretorio-compilado>");
  process.exit(1);
}

const { classificarEstadoAtualizacao } = require(path.join(compiledDir, "campaignContent/resolveEffectiveContent.js"));

let passed = 0;
function check(nome, fn) {
  try {
    fn();
    passed++;
    console.log(`ok - ${nome}`);
  } catch (err) {
    console.error(`FAIL - ${nome}: ${err.message}`);
    process.exitCode = 1;
  }
}

check("atualizado quando versão e hash batem com a base registrada no override", () => {
  const r = classificarEstadoAtualizacao({ version: "1.0.0", payload_hash: "abc" }, "1.0.0", "abc");
  assert.strictEqual(r, "atualizado");
});

check("oficial_alterado quando a versão oficial atual difere da base — nunca resolvido automaticamente", () => {
  const r = classificarEstadoAtualizacao({ version: "1.0.1", payload_hash: "def" }, "1.0.0", "abc");
  assert.strictEqual(r, "oficial_alterado");
});

check("oficial_alterado quando só o hash difere (versão igual) — nunca depende só do número de versão", () => {
  const r = classificarEstadoAtualizacao({ version: "1.0.0", payload_hash: "def" }, "1.0.0", "abc");
  assert.strictEqual(r, "oficial_alterado");
});

check("oficial_arquivado quando o oficial atual não existe mais publicado", () => {
  const r = classificarEstadoAtualizacao(null, "1.0.0", "abc");
  assert.strictEqual(r, "oficial_arquivado");
});

check("base_ausente quando o override não registrou versão/hash de base", () => {
  const r = classificarEstadoAtualizacao({ version: "1.0.0", payload_hash: "abc" }, null, null);
  assert.strictEqual(r, "base_ausente");
});

console.log(`\n${passed} verificações passaram.`);
if (process.exitCode) {
  console.error("Uma ou mais verificações falharam.");
  process.exit(1);
} else {
  console.log("Todas as verificações focadas da Etapa 12 passaram.");
}
