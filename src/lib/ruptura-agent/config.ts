import { PAGINA_RAIZ_RUPTURA_V12 } from "../compendio/notion";
import type { SourceRole, SourceType } from "./types";

export const ROOT_PAGE_ID = PAGINA_RAIZ_RUPTURA_V12;

export function notionId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

function chave(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

/** Papéis explícitos do corpus; a classificação do Compêndio não participa. */
export function classificarFonte(secao: string | null, titulo: string, tipo: SourceType, herdado: SourceRole = "reference", naRaiz = false): SourceRole {
  const nome = chave(titulo);
  const raiz = chave(secao ?? "");
  if (raiz === "VERSOES ANTERIORES" || herdado === "historical_version") return "historical_version";
  if (raiz === "PATCH NOTES" || herdado === "patch_notes") return "patch_notes";
  if (/^GUIA EDITORIAL(?:\s|$)/.test(nome)) return "editorial_guide";
  if (/^GUIA DE DESIGN(?:\s|$)/.test(nome)) return "design_guide";
  if (/^(DECISOES DE DESIGN|DOCUMENTOS DE DECISAO|DECISOES DE DESENVOLVIMENTO)(?:\s|:|$)/.test(nome) || /\bDECISOES DE DESIGN:/.test(nome)) return "working_reference";
  // O database MAGIAS é consultável, mas as listas nas Vertentes são canônicas.
  if ((tipo === "database" || tipo === "data_source" || tipo === "database_row") && nome === "MAGIAS") return "reference";
  if (naRaiz && (raiz === "SOB A SOMBRA DO IMPERIO CENTRAL" || raiz === "O JOGO EM MOVIMENTO")) return "book";
  return herdado;
}
