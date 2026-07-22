/**
 * Camada canônica de definições e validação (Etapa 1 do aditivo do
 * Editor Universal). Ponto único de importação — consumidores futuros
 * (Editor, diagnóstico, Etapa 2+) devem importar daqui, nunca de um
 * submódulo interno diretamente.
 */

export * from "./types";
export * from "./contentTypeRegistry";
export * from "./effectTypeRegistry";
export * from "./diagnostics";
export * from "./validation";
export * from "./unknownFields";
export * from "./fields/duracao";
export * from "./fields/resistencia";
export * from "./fields/referencia";
export * from "./adapters";
export * from "./examples/canonicalExamples";
export * from "./adminQueries";
export * from "./adminDiagnostics";
export * from "./manifestDiagnostics";

// --- Etapa 3 — Editor Universal de campos básicos (rascunhos) ---
// draftServerActions.ts ("use server") não é reexportado por este barrel
// de propósito — importe diretamente de "./draftServerActions" onde for
// usar as Server Actions, para manter a fronteira "use server" explícita.
export * from "./slug";
export * from "./draftTypes";
export * from "./draftMapping";
export * from "./draftValidation";
export * from "./draftQueries";
export * from "./draftView";

// --- Etapa 4 — Construtor de Efeitos MVP ---
export * from "./effectDraftTypes";
export * from "./effectDraftMapping";
export * from "./effectDiagnostics";
export * from "./effectDraftValidation";
export * from "./characterRuleOptions";

// --- Etapa 11 — Importação/exportação de pacotes + Biblioteca do Livro ---
// packageExport.ts e packageImport.ts ("use server") não são reexportados
// por este barrel, mesmo critério das Server Actions anteriores.
export * from "./contentPackage";
export * from "./contentDependencies";
export * from "./canonicalHash";
export * from "./importPreview";
export * from "./officialSchemaValidator";
export * from "./bookLinksQueries";
export * from "./importSessionQueries";
export * from "./draftBuilders";
