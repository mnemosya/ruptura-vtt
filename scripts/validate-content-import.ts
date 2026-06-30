/**
 * Ruptura VTT — Validador de importação da Biblioteca do Sistema.
 *
 * Confere as contagens mínimas por content_type em content_documents,
 * além de checagens estruturais básicas (id no formato esperado,
 * payload presente, payload_hash consistente, source_pack registrado).
 * Sai com código != 0 se qualquer expectativa não for atendida.
 *
 * POLÍTICA DE VERSÃO: este projeto usa a Opção A (ver migration 0001) —
 * um único documento vivo por (content_type, slug), sempre da versão de
 * pacote mais recente importada. Por isso as contagens abaixo são
 * globais por content_type, não segmentadas por source_pack_version.
 *
 * Ainda assim, é possível restringir a validação a uma versão de pacote
 * específica via PACK_VERSION — útil para confirmar que uma importação
 * recente realmente atualizou tudo que deveria. Se a Opção B (múltiplas
 * versões coexistindo) for adotada no futuro, este é o ponto a ajustar:
 * as contagens mínimas passariam a ser aplicadas SEMPRE filtrando por
 * source_pack_version (não apenas opcionalmente).
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/validate-content-import.ts
 *
 *   # Restringindo a uma versão de pacote específica:
 *   PACK_VERSION=0.1.0 npx tsx scripts/validate-content-import.ts
 */

import { createHash } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadDotenv({ path: ".env.local" });

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const PACK_VERSION = process.env.PACK_VERSION; // opcional

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Variável de ambiente obrigatória ausente: ${name}`);
    process.exit(1);
  }
  return v;
}

// Contagens MÍNIMAS esperadas por content_type.
const EXPECTED_MIN: Record<string, number> = {
  combat_action: 28,
  condition: 17,
  property: 14,
  item: 119,
  rune: 40,
  escalpo: 58,
  talent: 22,
  spell: 132,
  character_rule: 1,
  combat_field: 1,
  combat_flow: 1,
  master_table: 1,
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`,
  );
  return `{${entries.join(",")}}`;
}

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}

async function main(): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const failures: string[] = [];

  if (PACK_VERSION) {
    console.log(`Validando restrito a source_pack_version = ${PACK_VERSION}\n`);
  }

  // 1) Contagens por content_type.
  console.log("Contagens por content_type (min esperado):");
  for (const ct of Object.keys(EXPECTED_MIN).sort()) {
    let query = supabase
      .from("content_documents")
      .select("id", { count: "exact", head: true })
      .eq("content_type", ct);
    if (PACK_VERSION) query = query.eq("source_pack_version", PACK_VERSION);

    const { count, error } = await query;
    if (error) {
      failures.push(`Erro ao contar ${ct}: ${error.message}`);
      continue;
    }
    const got = count ?? 0;
    const min = EXPECTED_MIN[ct];
    const ok = got >= min;
    console.log(`  ${ok ? "OK  " : "FAIL"} ${ct.padEnd(16)} ${got} (min ${min})`);
    if (!ok) failures.push(`${ct}: ${got} < ${min}`);
  }

  // 2) Checagens estruturais e de integridade do payload.
  let docsQuery = supabase
    .from("content_documents")
    .select("id, content_type, slug, payload, payload_hash, source_pack_id, source_pack_version");
  if (PACK_VERSION) docsQuery = docsQuery.eq("source_pack_version", PACK_VERSION);

  const { data: docs, error: docsErr } = await docsQuery;
  if (docsErr) {
    failures.push(`Erro ao ler content_documents: ${docsErr.message}`);
  } else {
    for (const row of docs ?? []) {
      const expectedId = `${row.content_type}:${row.slug}`;
      if (row.id !== expectedId) {
        failures.push(`id fora do formato: ${row.id} (esperado ${expectedId})`);
      }
      if (row.payload == null) {
        failures.push(`payload vazio em ${row.id}`);
      }
      if (!row.source_pack_id) {
        failures.push(`source_pack_id ausente em ${row.id}`);
      }
      if (!row.payload_hash) {
        failures.push(`payload_hash ausente em ${row.id}`);
      } else if (row.payload != null) {
        const recomputed = hashPayload(row.payload);
        if (recomputed !== row.payload_hash) {
          failures.push(
            `payload_hash inconsistente em ${row.id} (armazenado=${row.payload_hash}, recalculado=${recomputed})`,
          );
        }
      }
    }

    // 3) source_pack referenciado existe em content_packs.
    const packIds = [...new Set((docs ?? []).map((r) => r.source_pack_id))];
    for (const pid of packIds) {
      const { count, error } = await supabase
        .from("content_packs")
        .select("id", { count: "exact", head: true })
        .eq("id", pid);
      if (error || (count ?? 0) === 0) {
        failures.push(`content_pack referenciado não existe: ${pid}`);
      }
    }

    // 4) Opção A: não pode haver duas linhas vivas para o mesmo
    // (content_type, slug). A constraint unique já impede isso no banco;
    // esta checagem é uma segunda camada de sanidade caso a constraint
    // tenha sido removida manualmente.
    const seenTypeSlug = new Map<string, string>(); // "type:slug" -> id já visto
    for (const row of docs ?? []) {
      const key = `${row.content_type}:${row.slug}`;
      if (seenTypeSlug.has(key) && seenTypeSlug.get(key) !== row.id) {
        failures.push(
          `colisão de (content_type, slug) sob Opção A: ${key} aparece em ${seenTypeSlug.get(key)} e ${row.id}`,
        );
      }
      seenTypeSlug.set(key, row.id);
    }
  }

  console.log("");
  if (failures.length > 0) {
    console.error(`Validação FALHOU (${failures.length} problema(s)):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("Validação OK: todas as contagens mínimas e checagens passaram.");
}

main().catch((err) => {
  console.error("Validação FALHOU:", err.message ?? err);
  process.exit(1);
});
