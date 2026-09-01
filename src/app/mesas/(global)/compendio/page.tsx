/**
 * "Compêndio" no menu GERAL DA CONTA — leitura da Biblioteca do Sistema
 * (`content_documents`) fora de qualquer campanha.
 *
 * Usa exatamente a camada de leitura pública que já existia
 * (`lib/content/queries.ts` → anon key + RLS `content_documents_public_read`,
 * só `status = 'published'`). Não é o editor administrativo
 * (/admin/biblioteca) nem a biblioteca DA CAMPANHA (que resolve
 * homebrew e sobreposições) — é o catálogo oficial, somente leitura.
 *
 * O payload canônico continua sendo a fonte de verdade e NÃO é
 * reinterpretado aqui: a página projeta só identificação e um resumo
 * textual, e nada é reescrito.
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth/session";
import { listContentDocuments } from "../../../../lib/content/queries";
import type { ContentType } from "../../../../lib/content/types";
import CompendioClient, { type CompendioEntry, type CompendioTipo } from "./CompendioClient";

export const dynamic = "force-dynamic";

/**
 * Tipos de conteúdo que são COLEÇÃO (têm muitos registros navegáveis).
 * Os singleton (regras de personagem, campo/fluxo de combate, tabelas
 * mestre) são documentos únicos e continuam sendo lidos onde já eram —
 * não viram lista aqui.
 */
export const TIPOS: CompendioTipo[] = [
  { id: "spell", label: "Magias" },
  { id: "talent", label: "Talentos" },
  { id: "item", label: "Itens" },
  { id: "rune", label: "Runas" },
  { id: "escalpo", label: "Escalpos" },
  { id: "condition", label: "Condições" },
  { id: "property", label: "Propriedades" },
  { id: "combat_action", label: "Ações de combate" },
  { id: "companion_model", label: "Companheiros" },
];

/** Resumo textual do payload canônico, sem interpretar mecânica. */
function resumoDoPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const rec = payload as Record<string, unknown>;
  for (const key of ["descricao_curta", "resumo", "descricao", "texto_curto", "efeito"]) {
    const value = rec[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const texto = rec.texto;
  if (texto && typeof texto === "object") {
    const t = texto as Record<string, unknown>;
    for (const key of ["descricaoCurta", "descricao_curta", "descricao"]) {
      const value = t[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function tagsDoPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const tags = (payload as Record<string, unknown>).tags;
  if (!Array.isArray(tags)) return [];
  return tags.filter((t): t is string => typeof t === "string").slice(0, 4);
}

interface PageProps {
  searchParams: Promise<{ tipo?: string }>;
}

export default async function CompendioPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const tipoAtual: ContentType =
    (TIPOS.find((t) => t.id === params.tipo)?.id as ContentType | undefined) ?? "spell";

  let entradas: CompendioEntry[] = [];
  let errorMessage: string | null = null;
  try {
    const docs = await listContentDocuments(tipoAtual, { orderBy: "nome", ascending: true, limit: 500 });
    entradas = docs.map((doc) => ({
      id: doc.id,
      slug: doc.slug,
      nome: doc.nome ?? doc.slug,
      categoria: doc.categoria,
      subtipo: doc.subtipo,
      versao: doc.version,
      resumo: resumoDoPayload(doc.payload),
      tags: tagsDoPayload(doc.payload),
    }));
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao carregar o compêndio.";
  }

  return (
    <CompendioClient
      tipos={TIPOS}
      tipoAtual={tipoAtual}
      entradas={entradas}
      errorInicial={errorMessage}
    />
  );
}
