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
