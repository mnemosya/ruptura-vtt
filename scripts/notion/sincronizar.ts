/**
 * Sincroniza o livro RUPTURA v1.2 do Notion com o Compêndio do VTT.
 *
 *   npx tsx scripts/notion/sincronizar.ts --seco     # só mostra o que mudaria
 *   npx tsx scripts/notion/sincronizar.ts            # grava
 *   npx tsx scripts/notion/sincronizar.ts --forcar   # relê todos os capítulos
 *   npx tsx scripts/notion/sincronizar.ts --capitulo=24   # relê só o capítulo 24
 *   npx tsx scripts/notion/sincronizar.ts --capitulo=14 --rapido   # relê o nível de cima; recolhíveis vêm do cache
 *   npx tsx scripts/notion/sincronizar.ts --capitulo=14 --rapido --reler="VIGOR,ATRIBUTOS"   # e relê esses recolhíveis
 *
 * Precisa de NOTION_TOKEN, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.
 * Ver docs/prd/PLANO_COMPENDIO_NOTION.md.
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { criarClienteNotion } from "../../src/lib/compendio/notion";
import { pendenciasDeRevisao, sincronizarCompendio } from "../../src/lib/compendio/sincronizar";
import { descreverPendencia } from "../../src/lib/compendio/revisao";
import { criarCacheBlocos } from "./cacheBlocos";

config({ path: ".env.local" });

const seco = process.argv.includes("--seco");
const forcar = process.argv.includes("--forcar");
// --capitulo=24 (ou --capitulo=9,16): relê só esses capítulos, mesmo sem mudança no Notion.
const forcarCapitulos = (process.argv.find((a) => a.startsWith("--capitulo="))?.split("=")[1] ?? "")
  .split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
// --rapido: o conteúdo dos recolhíveis vem do cache da última sincronização (ver cacheBlocos.ts).
const rapido = process.argv.includes("--rapido");
const reler = (process.argv.find((a) => a.startsWith("--reler="))?.slice("--reler=".length) ?? "")
  .split(",").map((t) => t.trim()).filter(Boolean);

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários.");
  const supabase = createClient(url, chave, { auth: { persistSession: false } });

  if (reler.length && !rapido) throw new Error("--reler só faz sentido com --rapido (sem ele, tudo já é relido).");
  const cache = criarCacheBlocos(reler);
  if (rapido && cache.vazio) console.log("Cache vazio: esta sincronização lê tudo e prepara o cache para a próxima.\n");
  const notion = cache.guardar(criarClienteNotion(undefined, rapido ? cache.opcoes : {}));

  console.log(seco ? "Modo seco: nada será gravado.\n" : rapido ? "Sincronizando (rápido)…\n" : "Sincronizando…\n");
  const rel = await sincronizarCompendio({ notion, supabase, seco, forcar, forcarCapitulos, log: (m) => console.log(`  ${m}`) });

  console.log(`\nCriados: ${rel.criados.length} · atualizados: ${rel.atualizados.length} · inalterados: ${rel.inalterados.length} · arquivados: ${rel.arquivados.length}`);
  if (rel.arquivados.length) console.log(`Arquivados: ${rel.arquivados.join(", ")}`);
  const mb = (b: number) => (b / 1024 / 1024).toFixed(1);
  console.log(`Imagens copiadas: ${rel.imagensCopiadas} (${mb(rel.bytesOriginais)} MB → ${mb(rel.bytesGravados)} MB) · órfãs removidas: ${rel.imagensOrfasRemovidas} · requisições ao Notion: ${rel.requisicoesNotion}`);
  if (rapido) console.log(`Recolhíveis reaproveitados do cache: ${cache.reaproveitados()}${reler.length ? ` · relidos por --reler: ${reler.join(", ")}` : ""}`);
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
