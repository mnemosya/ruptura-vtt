/**
 * Marca um arquivo de regras como revisado contra o livro (Fase 5 do
 * PLANO_COMPENDIO_NOTION): grava em `content/v12/revisao_notion.json` o hash
 * do texto atual da página de origem e a data de hoje. A partir daí, o aviso
 * só volta se o TEXTO da página mudar.
 *
 *   npm run compendio:revisado -- condicoes
 *   npm run compendio:revisado -- condicoes classe-face
 *   npm run compendio:revisado -- --todos
 *   npm run compendio:revisado -- --listar
 *
 * Rode depois de sincronizar (o hash vem do livro já sincronizado) e commite o manifesto.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { ARQUIVO_REVISAO, type FonteRevisao } from "../../src/lib/compendio/revisao";
import { estadoDasPaginas } from "../../src/lib/compendio/sincronizar";

config({ path: ".env.local" });

async function main() {
  const args = process.argv.slice(2);
  const doc = JSON.parse(readFileSync(ARQUIVO_REVISAO, "utf8")) as { fontes: FonteRevisao[] };
  if (args.length === 0 || args.includes("--listar")) {
    for (const f of doc.fontes) console.log(`${f.chave.padEnd(20)} ${f.rotulo.padEnd(20)} revisado em ${f.revisadoEm.slice(0, 10)}${f.hashRevisado ? "" : " (só data)"}`);
    return;
  }
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) throw new Error("SUPABASE_URL e SUPABASE_ANON_KEY são necessários.");
  const paginas = await estadoDasPaginas(createClient(url, chave, { auth: { persistSession: false } }));

  const alvos = args.includes("--todos") ? doc.fontes.map((f) => f.chave) : args;
  const agora = new Date().toISOString();
  for (const alvo of alvos) {
    const fonte = doc.fontes.find((f) => f.chave === alvo);
    if (!fonte) throw new Error(`Chave desconhecida: ${alvo}. Use --listar para ver as chaves.`);
    const pagina = paginas.get(fonte.pageId);
    if (!pagina) throw new Error(`${fonte.rotulo}: a página de origem não está no livro sincronizado.`);
    fonte.hashRevisado = pagina.hash;
    fonte.revisadoEm = agora;
    console.log(`revisado: ${fonte.rotulo} ← ${pagina.titulo}`);
  }
  writeFileSync(ARQUIVO_REVISAO, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`\n${ARQUIVO_REVISAO} atualizado — commite junto com a revisão do arquivo de regras.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
