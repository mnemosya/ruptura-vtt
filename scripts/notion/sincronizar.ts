/**
 * Sincroniza o livro RUPTURA v1.2 do Notion com o Compêndio do VTT.
 *
 *   npx tsx scripts/notion/sincronizar.ts --seco     # só mostra o que mudaria
 *   npx tsx scripts/notion/sincronizar.ts            # grava
 *   npx tsx scripts/notion/sincronizar.ts --forcar   # relê todos os capítulos
 *   npx tsx scripts/notion/sincronizar.ts --capitulo=24   # relê só o capítulo 24
 *
 * Precisa de NOTION_TOKEN, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.
 * Ver docs/prd/PLANO_COMPENDIO_NOTION.md.
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { criarClienteNotion } from "../../src/lib/compendio/notion";
import { pendenciasDeRevisao, sincronizarCompendio } from "../../src/lib/compendio/sincronizar";
import { descreverPendencia } from "../../src/lib/compendio/revisao";

config({ path: ".env.local" });

const seco = process.argv.includes("--seco");
const forcar = process.argv.includes("--forcar");
// --capitulo=24 (ou --capitulo=9,16): relê só esses capítulos, mesmo sem mudança no Notion.
const forcarCapitulos = (process.argv.find((a) => a.startsWith("--capitulo="))?.split("=")[1] ?? "")
  .split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários.");
  const supabase = createClient(url, chave, { auth: { persistSession: false } });

  console.log(seco ? "Modo seco: nada será gravado.\n" : "Sincronizando…\n");
  const rel = await sincronizarCompendio({ notion: criarClienteNotion(), supabase, seco, forcar, forcarCapitulos, log: (m) => console.log(`  ${m}`) });

  console.log(`\nCriados: ${rel.criados.length} · atualizados: ${rel.atualizados.length} · inalterados: ${rel.inalterados.length} · arquivados: ${rel.arquivados.length}`);
  if (rel.arquivados.length) console.log(`Arquivados: ${rel.arquivados.join(", ")}`);
  const mb = (b: number) => (b / 1024 / 1024).toFixed(1);
  console.log(`Imagens copiadas: ${rel.imagensCopiadas} (${mb(rel.bytesOriginais)} MB → ${mb(rel.bytesGravados)} MB) · órfãs removidas: ${rel.imagensOrfasRemovidas} · requisições ao Notion: ${rel.requisicoesNotion}`);
  for (const [cap, tipos] of Object.entries(rel.naoSuportados)) console.log(`Blocos sem equivalente em "${cap}": ${tipos.join(", ")}`);
  for (const f of rel.falhas) console.log(`FALHA — ${f.capitulo}: ${f.erro}`);

  const pendencias = await pendenciasDeRevisao(supabase);
  if (pendencias.length) {
    console.log(`\nRegras a revisar (${pendencias.length}) — a página mudou depois da revisão do arquivo:`);
    for (const p of pendencias) console.log(`  [${p.chave}] ${descreverPendencia(p)}  → ${p.arquivo}`);
    console.log("Depois de revisar: npm run compendio:revisado -- <chave>");
  } else {
    console.log("\nRegras revisadas: nenhuma página mudou desde a revisão.");
  }
  if (rel.falhas.length) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
