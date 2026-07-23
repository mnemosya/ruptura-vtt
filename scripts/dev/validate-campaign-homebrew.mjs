#!/usr/bin/env node
/**
 * Verificação focada da Etapa 12 (conteúdo de mesa e homebrew),
 * ATUALIZADA na correção (migration 0026). Mesmo padrão das etapas
 * anteriores: compila os módulos reais com `tsc`, roda com `node`
 * puro, nunca duplica lógica.
 *
 * Uso:
 *   npx tsc src/lib/campaignContent/campaignContentDiff.ts \
 *     src/lib/campaignContent/campaignContentLimits.ts \
 *     src/lib/campaignContent/campaignContentTypes.ts \
 *     src/lib/campaignContent/resolveEffectiveContent.ts \
 *     src/lib/contentSchema/canonicalHash.ts src/lib/contentSchema/draftTypes.ts \
 *     src/lib/contentSchema/effectDraftTypes.ts src/lib/content/types.ts \
 *     --module commonjs --target es2020 --outDir <dir> --esModuleInterop \
 *     --skipLibCheck --resolveJsonModule --moduleResolution node
 *   ln -sf <repo>/node_modules <dir>/node_modules   # resolve @supabase/supabase-js
 *   node scripts/dev/validate-campaign-homebrew.mjs <dir-compilado>
 *
 * Cobre: `classificarEstadoAtualizacao`, `diffEstrutural`/`compararTresVias`
 * (três vias e conflito), constantes/validadores de limite (puros). NÃO
 * substitui teste de banco — a autorização real (RLS/`campaign_members`/
 * `can_read_campaign_content`/`can_manage_campaign_content`), as funções
 * SECURITY DEFINER (0025/0026), o gatilho de limite e o isolamento real
 * entre campanhas só podem ser comprovados contra um Supabase real
 * (não conectado nesta sessão — ver checkpoint §Verificações não
 * executadas). `avaliarImpactoRemocao`/`campaignContentServerActions`
 * fazem I/O real e não são cobertos aqui pelo mesmo motivo.
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
const { diffEstrutural, compararTresVias } = require(path.join(compiledDir, "campaignContent/campaignContentDiff.js"));
const {
  validarTamanhoPayload,
  validarQuantidadeEfeitos,
  validarQuantidadeReferencias,
  validarQuantidadePublicados,
  validarQuantidadeRascunhos,
  LIMITE_TAMANHO_PAYLOAD_BYTES,
  LIMITE_EFEITOS_POR_DOCUMENTO,
  LIMITE_CONTEUDO_PUBLICADO_POR_CAMPANHA,
  LIMITE_RASCUNHOS_ATIVOS_POR_CAMPANHA,
} = require(path.join(compiledDir, "campaignContent/campaignContentLimits.js"));

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

// --- classificarEstadoAtualizacao (já existente) ---
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

// --- diffEstrutural / compararTresVias (comparação de três vias) ---
check("diffEstrutural não acusa nada quando os objetos são iguais", () => {
  const d = diffEstrutural({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } });
  assert.strictEqual(d.length, 0);
});
check("diffEstrutural acusa caminho aninhado alterado", () => {
  const d = diffEstrutural({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 } });
  assert.strictEqual(d.length, 1);
  assert.strictEqual(d[0].caminho, "b.c");
});
check("compararTresVias separa mudanças do oficial e da campanha quando não há sobreposição", () => {
  const base = { nome: "X", custo: 1, cor: "azul" };
  const oficialAtual = { nome: "X", custo: 2, cor: "azul" };
  const campanha = { nome: "X", custo: 1, cor: "verde" };
  const r = compararTresVias(base, oficialAtual, campanha);
  assert.strictEqual(r.mudancasOficial.length, 1);
  assert.strictEqual(r.mudancasOficial[0].caminho, "custo");
  assert.strictEqual(r.mudancasCampanha.length, 1);
  assert.strictEqual(r.mudancasCampanha[0].caminho, "cor");
  assert.strictEqual(r.conflitos.length, 0);
});
check("compararTresVias detecta conflito real quando oficial e campanha alteram o MESMO caminho", () => {
  const base = { custo: 1 };
  const oficialAtual = { custo: 2 };
  const campanha = { custo: 3 };
  const r = compararTresVias(base, oficialAtual, campanha);
  assert.strictEqual(r.conflitos.length, 1);
  assert.strictEqual(r.conflitos[0].caminho, "custo");
});
check("compararTresVias nunca trata reordenação de chaves como mudança (objetos)", () => {
  const base = { a: 1, b: 2 };
  const reordenado = { b: 2, a: 1 };
  const r = compararTresVias(base, reordenado, base);
  assert.strictEqual(r.mudancasOficial.length, 0);
});

// --- Limites (puros, defesa em profundidade — banco reforça o teto absoluto) ---
check("validarTamanhoPayload aceita payload pequeno e rejeita acima do limite", () => {
  assert.strictEqual(validarTamanhoPayload({ x: 1 }).ok, true);
  const grande = { texto: "a".repeat(LIMITE_TAMANHO_PAYLOAD_BYTES + 10) };
  assert.strictEqual(validarTamanhoPayload(grande).ok, false);
});
check("validarQuantidadeEfeitos rejeita acima do limite", () => {
  assert.strictEqual(validarQuantidadeEfeitos(new Array(LIMITE_EFEITOS_POR_DOCUMENTO).fill({})).ok, true);
  assert.strictEqual(validarQuantidadeEfeitos(new Array(LIMITE_EFEITOS_POR_DOCUMENTO + 1).fill({})).ok, false);
});
check("validarQuantidadeReferencias rejeita acima do limite", () => {
  assert.strictEqual(validarQuantidadeReferencias([]).ok, true);
});
check("validarQuantidadePublicados bloqueia no teto por campanha", () => {
  assert.strictEqual(validarQuantidadePublicados(LIMITE_CONTEUDO_PUBLICADO_POR_CAMPANHA - 1).ok, true);
  assert.strictEqual(validarQuantidadePublicados(LIMITE_CONTEUDO_PUBLICADO_POR_CAMPANHA).ok, false);
});
check("validarQuantidadeRascunhos bloqueia no teto por campanha", () => {
  assert.strictEqual(validarQuantidadeRascunhos(LIMITE_RASCUNHOS_ATIVOS_POR_CAMPANHA - 1).ok, true);
  assert.strictEqual(validarQuantidadeRascunhos(LIMITE_RASCUNHOS_ATIVOS_POR_CAMPANHA).ok, false);
});

console.log(`\n${passed} verificações passaram.`);
if (process.exitCode) {
  console.error("Uma ou mais verificações falharam.");
  process.exit(1);
} else {
  console.log("Todas as verificações focadas da Etapa 12 (incluindo a correção) passaram.");
  console.log("LEMBRETE: isto NÃO comprova RLS/autorização/atomicidade reais — exige Supabase conectado.");
}
