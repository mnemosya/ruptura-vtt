/**
 * Ruptura VTT — Seed da Biblioteca do Sistema (JSONB-first)
 *
 * Lê o manifesto ruptura-core e cada DB JSON normalizado, quebra as
 * coleções em registros individuais, gera id no formato
 * `<content_type>:<slug>`, salva o registro completo em payload (JSONB)
 * e faz upsert em content_documents. Imprime a contagem final por
 * content_type.
 *
 * POLÍTICA DE VERSÃO (Opção A — ver migration 0001 para detalhes):
 * a chave natural é (content_type, slug). Reimportar uma versão nova
 * do pacote SOBRESCREVE o documento existente — não há coexistência de
 * múltiplas versões do mesmo slug nesta tabela.
 *
 * POLÍTICA DE CHANGELOG:
 *   - 'created' quando o id não existia antes deste seed.
 *   - 'updated' apenas quando o id já existia E o payload mudou
 *     (comparação por payload_hash, sha256 do JSON serializado).
 *   - Nenhuma entrada de changelog é gravada quando o payload é
 *     idêntico ao já armazenado — reimportar sem mudanças não gera
 *     ruído no histórico.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   CONTENT_DIR=./content \
 *   npx tsx scripts/seed-content.ts
 *
 * CONTENT_DIR deve conter o manifesto e todos os db_*.json.
 *
 * IMPORTANTE: este seed NÃO interpreta nem reescreve mecânica. Tudo que é
 * mecânica permanece intacto dentro de payload. As colunas escalares são
 * apenas projeções de campos já presentes nos registros.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadDotenv({ path: ".env.local" });

// ---------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------
const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const CONTENT_DIR = process.env.CONTENT_DIR ?? "./content";
const MANIFEST_FILE = process.env.MANIFEST_FILE ?? "ruptura_core_manifest_v0_1.json";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Variável de ambiente obrigatória ausente: ${name}`);
    process.exit(1);
  }
  return v;
}

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------
type ContentType =
  | "master_table"
  | "character_rule"
  | "combat_field"
  | "combat_flow"
  | "combat_action"
  | "condition"
  | "property"
  | "item"
  | "rune"
  | "escalpo"
  | "talent"
  | "spell"
  | "companion_model";

type Mode = "singleton" | "collection";

interface SourceSpec {
  /** id do conteúdo no manifesto (quando aplicável). */
  manifestId?: string;
  contentType: ContentType;
  mode: Mode;
  /** Nome do arquivo db_*.json. */
  file: string;
  /** Para collection: a chave do array dentro do arquivo. */
  collectionKey?: string;
  /** Para singleton: slug e nome estáveis do documento. */
  singletonSlug?: string;
  singletonNome?: string;
}

interface DocumentRow {
  id: string;
  content_type: ContentType;
  slug: string;
  nome: string | null;
  categoria: string | null;
  subtipo: string | null;
  status: string;
  version: string | null;
  source_pack_id: string;
  source_pack_version: string | null;
  payload: unknown;
  payload_hash: string;
}

interface ExistingRow {
  id: string;
  payload_hash: string;
  payload: unknown;
}

// ---------------------------------------------------------------------
// Mapeamento explícito DB JSON -> content_type
//
// Singletons: 1 registro por arquivo (o arquivo inteiro vira payload).
// Collections: 1 registro por elemento do array `collectionKey`.
//
// master_table NÃO está no manifesto do core; é tratado à parte.
// ---------------------------------------------------------------------
const SOURCES: SourceSpec[] = [
  {
    manifestId: "regras_personagem",
    contentType: "character_rule",
    mode: "singleton",
    file: "db_regras_personagem_normalizado_v1_4.json",
    singletonSlug: "regras_personagem",
    singletonNome: "Regras de Personagem",
  },
  {
    manifestId: "campo_combate",
    contentType: "combat_field",
    mode: "singleton",
    file: "db_campo_combate_normalizado_v1_1.json",
    singletonSlug: "campo_combate",
    singletonNome: "Campo de Combate",
  },
  {
    manifestId: "fluxo_combate",
    contentType: "combat_flow",
    mode: "singleton",
    file: "db_fluxo_combate_normalizado_v1_1.json",
    singletonSlug: "fluxo_combate",
    singletonNome: "Fluxo de Combate",
  },
  {
    manifestId: "acoes_combate",
    contentType: "combat_action",
    mode: "collection",
    file: "db_acoes_combate_normalizado_v1_1.json",
    collectionKey: "acoes",
  },
  {
    manifestId: "condicoes",
    contentType: "condition",
    mode: "collection",
    file: "db_condicoes_normalizado_v1_5.json",
    collectionKey: "condicoes",
  },
  {
    manifestId: "propriedades",
    contentType: "property",
    mode: "collection",
    file: "db_propriedades_normalizado_v1.json",
    collectionKey: "propriedades",
  },
  {
    manifestId: "equipamentos",
    contentType: "item",
    mode: "collection",
    file: "db_equipamentos_normalizado_v1_2.json",
    collectionKey: "itens",
  },
  {
    manifestId: "runas",
    contentType: "rune",
    mode: "collection",
    file: "db_runas_normalizado_v1_2.json",
    collectionKey: "runas",
  },
  // Catálogo "Catálogo oficial de drones e robôs consumido pela ficha" —
  // fora do manifesto do core (sem manifestId), fonte:
  // docs/fontes/DRONES E ROBÔS....md.
  {
    contentType: "companion_model",
    mode: "collection",
    file: "db_companion_models_v1.json",
    collectionKey: "modelos_companheiros",
  },
  {
    contentType: "rune",
    mode: "collection",
    file: "db_runas_drones_robos_v1.json",
    collectionKey: "runas_drones_robos",
  },
  {
    manifestId: "escalpos",
    contentType: "escalpo",
    mode: "collection",
    file: "db_escalpos_normalizado_v1_3.json",
    collectionKey: "escalpos",
  },
  {
    manifestId: "talentos",
    contentType: "talent",
    mode: "collection",
    file: "db_talentos_normalizado_v1_3.json",
    collectionKey: "talentos",
  },
  {
    manifestId: "magias",
    contentType: "spell",
    mode: "collection",
    file: "db_magias_normalizado_v1_3.json",
    collectionKey: "magias",
  },
  // Não está no manifesto do core — singleton tratado à parte.
  {
    contentType: "master_table",
    mode: "singleton",
    file: "db_tabelas_mestre_normalizado_v1.json",
    singletonSlug: "tabelas_mestre",
    singletonNome: "Tabelas Mestre",
  },
];

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function readJson<T = any>(file: string): T {
  const path = join(CONTENT_DIR, file);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Hash determinístico do payload. Serializa com chaves ordenadas para
 * que reordenar campos no JSON de origem (sem mudar valores) não gere
 * um hash diferente por acidente.
 */
function hashPayload(payload: unknown): string {
  const canonical = canonicalize(payload);
  return createHash("sha256").update(canonical).digest("hex");
}

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

// ---------------------------------------------------------------------
// Construção das linhas a partir de cada fonte
// ---------------------------------------------------------------------
function buildRowsForSource(
  spec: SourceSpec,
  packId: string,
  packVersion: string,
): DocumentRow[] {
  const doc = readJson<Record<string, any>>(spec.file);
  const meta = (doc._meta ?? {}) as Record<string, any>;
  const packDefaultStatus =
    asString(meta.status_padrao) ?? asString(doc.status) ?? "published";

  if (spec.mode === "singleton") {
    const slug = spec.singletonSlug!;
    const version =
      asString(meta.versao_schema) ?? asString(doc.versao) ?? packVersion;
    return [
      {
        id: `${spec.contentType}:${slug}`,
        content_type: spec.contentType,
        slug,
        nome: spec.singletonNome ?? null,
        categoria: null,
        subtipo: null,
        status: asString(doc.status) ?? packDefaultStatus,
        version,
        source_pack_id: packId,
        source_pack_version: packVersion,
        payload: doc, // arquivo inteiro é o payload canônico
        payload_hash: hashPayload(doc),
      },
    ];
  }

  // collection
  const arr = doc[spec.collectionKey!];
  if (!Array.isArray(arr)) {
    throw new Error(
      `Coleção "${spec.collectionKey}" não encontrada (ou não é array) em ${spec.file}`,
    );
  }

  return arr.map((el: Record<string, any>, idx: number) => {
    const slug = asString(el.slug) ?? asString(el.id);
    if (!slug) {
      throw new Error(
        `Elemento sem slug/id em ${spec.file}[${spec.collectionKey}][${idx}]`,
      );
    }
    return {
      id: `${spec.contentType}:${slug}`,
      content_type: spec.contentType,
      slug,
      nome: asString(el.nome),
      // Projeções diretas: apenas campos já presentes no registro.
      categoria: asString(el.categoria),
      subtipo: asString(el.subtipo),
      status: asString(el.status) ?? packDefaultStatus,
      version: asString(el.versao) ?? packVersion,
      source_pack_id: packId,
      source_pack_version: packVersion,
      payload: el, // registro completo, intacto
      payload_hash: hashPayload(el),
    };
  });
}

// ---------------------------------------------------------------------
// Persistência
// ---------------------------------------------------------------------
async function upsertPack(
  supabase: SupabaseClient,
  manifest: Record<string, any>,
): Promise<{ packId: string; packVersion: string }> {
  const pkg = manifest.package ?? {};
  const packId = asString(pkg.id);
  const packVersion = asString(pkg.version);
  if (!packId || !packVersion) {
    throw new Error("Manifesto sem package.id ou package.version.");
  }

  const { error } = await supabase.from("content_packs").upsert(
    {
      id: packId,
      name: asString(pkg.name) ?? packId,
      version: packVersion,
      status: asString(pkg.status) ?? "draft",
      content_hash: asString(pkg.content_hash_sha256),
      manifest,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`Falha ao upsert content_packs: ${error.message}`);

  return { packId, packVersion };
}

/**
 * Busca os documentos já existentes (id, payload_hash, payload) para os
 * ids que o seed está prestes a processar. Usado para decidir
 * created/updated/sem-mudança sem precisar reescrever tudo às cegas.
 */
async function fetchExisting(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, ExistingRow>> {
  const result = new Map<string, ExistingRow>();
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("content_documents")
      .select("id, payload_hash, payload")
      .in("id", slice);
    if (error) throw new Error(`Falha ao consultar documentos existentes: ${error.message}`);
    for (const row of data ?? []) {
      result.set(row.id as string, row as unknown as ExistingRow);
    }
  }
  return result;
}

interface ClassifiedRows {
  toInsertOrUpdate: DocumentRow[];
  changelogEntries: {
    document_id: string;
    content_type: ContentType;
    change_type: "created" | "updated";
    pack_id: string;
    pack_version: string | null;
    payload_before: unknown;
    payload_after: unknown;
  }[];
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
}

/**
 * Classifica cada linha como created / updated / sem-mudança comparando
 * payload_hash com o estado atual em content_documents. Só linhas com
 * mudança real (ou novas) entram em toInsertOrUpdate e geram changelog.
 */
function classifyRows(
  rows: DocumentRow[],
  existing: Map<string, ExistingRow>,
): ClassifiedRows {
  const toInsertOrUpdate: DocumentRow[] = [];
  const changelogEntries: ClassifiedRows["changelogEntries"] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;

  for (const row of rows) {
    const prev = existing.get(row.id);
    if (!prev) {
      toInsertOrUpdate.push(row);
      changelogEntries.push({
        document_id: row.id,
        content_type: row.content_type,
        change_type: "created",
        pack_id: row.source_pack_id,
        pack_version: row.source_pack_version,
        payload_before: null,
        payload_after: row.payload,
      });
      createdCount++;
    } else if (prev.payload_hash !== row.payload_hash) {
      toInsertOrUpdate.push(row);
      changelogEntries.push({
        document_id: row.id,
        content_type: row.content_type,
        change_type: "updated",
        pack_id: row.source_pack_id,
        pack_version: row.source_pack_version,
        payload_before: prev.payload,
        payload_after: row.payload,
      });
      updatedCount++;
    } else {
      // payload idêntico: não escreve, não gera changelog.
      unchangedCount++;
    }
  }

  return { toInsertOrUpdate, changelogEntries, createdCount, updatedCount, unchangedCount };
}

async function upsertDocuments(supabase: SupabaseClient, rows: DocumentRow[]): Promise<void> {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("content_documents")
      .upsert(slice, { onConflict: "id" });
    if (error) throw new Error(`Falha ao upsert content_documents: ${error.message}`);
  }
}

async function writeChangelog(
  supabase: SupabaseClient,
  entries: ClassifiedRows["changelogEntries"],
): Promise<void> {
  if (entries.length === 0) return;
  const CHUNK = 500;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const slice = entries.slice(i, i + CHUNK);
    const { error } = await supabase.from("content_changelog").insert(slice);
    if (error) throw new Error(`Falha ao inserir content_changelog: ${error.message}`);
  }
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------
async function main(): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`Lendo manifesto: ${MANIFEST_FILE} (dir: ${CONTENT_DIR})`);
  const manifest = readJson<Record<string, any>>(MANIFEST_FILE);

  const { packId, packVersion } = await upsertPack(supabase, manifest);
  console.log(`Pack: ${packId}@${packVersion}`);

  // Monta todas as linhas a partir dos arquivos-fonte.
  const allRows: DocumentRow[] = [];
  for (const spec of SOURCES) {
    const rows = buildRowsForSource(spec, packId, packVersion);
    allRows.push(...rows);
    console.log(`  ${spec.contentType.padEnd(14)} ${spec.file} -> ${rows.length}`);
  }

  // Sanidade: id único global (chave content_type:slug não pode colidir).
  const seen = new Set<string>();
  for (const r of allRows) {
    if (seen.has(r.id)) throw new Error(`id duplicado: ${r.id}`);
    seen.add(r.id);
  }

  // Busca estado atual para decidir created/updated/sem-mudança.
  const existing = await fetchExisting(supabase, allRows.map((r) => r.id));
  const classified = classifyRows(allRows, existing);

  // Só escreve o que de fato mudou (ou é novo).
  await upsertDocuments(supabase, classified.toInsertOrUpdate);
  await writeChangelog(supabase, classified.changelogEntries);

  // Contagem final por content_type (sobre o estado alvo, não só o que mudou).
  const counts = new Map<string, number>();
  for (const r of allRows) {
    counts.set(r.content_type, (counts.get(r.content_type) ?? 0) + 1);
  }
  console.log("\nContagem final por content_type:");
  for (const ct of [...counts.keys()].sort()) {
    console.log(`  ${ct.padEnd(16)} ${counts.get(ct)}`);
  }
  console.log(
    `\nTotal: ${allRows.length} documentos ` +
      `(created=${classified.createdCount}, updated=${classified.updatedCount}, ` +
      `sem_mudanca=${classified.unchangedCount}).`,
  );
}

main().catch((err) => {
  console.error("\nSeed FALHOU:", err.message ?? err);
  process.exit(1);
});
