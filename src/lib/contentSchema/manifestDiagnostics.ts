/**
 * Diagnóstico de divergência entre `content/ruptura_core_manifest_v0_1.json`
 * (contagens declaradas na hora da geração do pacote) e o estado real de
 * `content_documents` (Etapa 2). A auditoria já encontrou uma
 * divergência real (item: manifesto declara 119, dado real tem 120) —
 * este módulo generaliza a checagem para os demais content_types em vez
 * de hardcodear só esse caso.
 *
 * Import estático do manifesto (JSON local, nunca segredo) — só usado
 * em código server-only (rota /admin), nunca em componente client.
 */

import manifest from "../../../content/ruptura_core_manifest_v0_1.json";
import { countContentDocumentsByType } from "./adminQueries";
import type { ContentTypeId } from "./types";

interface ManifestContentEntry {
  id: string;
  database?: { counts?: Record<string, unknown> };
}

const MANIFEST_ID_PARA_CONTENT_TYPE: Partial<Record<string, { contentType: ContentTypeId; chaveContagem: string }>> = {
  acoes_combate: { contentType: "combat_action", chaveContagem: "acoes" },
  condicoes: { contentType: "condition", chaveContagem: "condicoes" },
  propriedades: { contentType: "property", chaveContagem: "propriedades" },
  equipamentos: { contentType: "item", chaveContagem: "itens" },
  runas: { contentType: "rune", chaveContagem: "runas" },
  escalpos: { contentType: "escalpo", chaveContagem: "escalpos" },
  talentos: { contentType: "talent", chaveContagem: "talentos" },
  magias: { contentType: "spell", chaveContagem: "magias" },
};

export interface DivergenciaManifesto {
  contentType: ContentTypeId;
  manifestId: string;
  contagemManifesto: number | null;
  contagemReal: number;
  divergente: boolean;
}

export interface DiagnosticoManifesto {
  divergencias: DivergenciaManifesto[];
  contentTypesForaDoManifesto: ContentTypeId[];
}

export async function getManifestDiagnostics(): Promise<DiagnosticoManifesto> {
  const contents = (manifest as { contents?: ManifestContentEntry[] }).contents ?? [];
  const contagensReais = await countContentDocumentsByType();

  const divergencias: DivergenciaManifesto[] = [];
  const contentTypesComManifesto = new Set<ContentTypeId>();

  for (const entrada of contents) {
    const mapeamento = MANIFEST_ID_PARA_CONTENT_TYPE[entrada.id];
    if (!mapeamento) continue;
    contentTypesComManifesto.add(mapeamento.contentType);

    const bruto = entrada.database?.counts?.[mapeamento.chaveContagem];
    const contagemManifesto = typeof bruto === "number" ? bruto : null;
    const contagemReal = contagensReais[mapeamento.contentType] ?? 0;

    divergencias.push({
      contentType: mapeamento.contentType,
      manifestId: entrada.id,
      contagemManifesto,
      contagemReal,
      divergente: contagemManifesto !== null && contagemManifesto !== contagemReal,
    });
  }

  const contentTypesForaDoManifesto = (Object.keys(contagensReais) as ContentTypeId[]).filter(
    (ct) => !contentTypesComManifesto.has(ct) && ct !== "character_rule" && ct !== "combat_field" && ct !== "combat_flow",
  );

  return { divergencias, contentTypesForaDoManifesto };
}
