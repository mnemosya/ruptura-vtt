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
