/**
 * Camada de leitura pública da Biblioteca do Sistema do Ruptura VTT.
 * Ponto de entrada único — importe deste arquivo, não dos módulos internos.
 */

export * from "./types";
export { getContentClient } from "./client";
export * from "./queries";
