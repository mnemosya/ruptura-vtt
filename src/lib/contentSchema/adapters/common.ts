/**
 * Helpers compartilhados pelos adapters de content_type. Cada adapter
 * (spell/talent/item/condition) permanece responsável só pelo mapeamento
 * de campos específico do seu formato legado — a construção do efeito
 * canônico e o diagnóstico de automação são sempre feitos aqui, para não
 * duplicar a lógica de "derivar modoAutomacao" em cada adapter.
 */

import { diagnosticarEfeito } from "../diagnostics";
import { resolverTipoCanonico } from "../effectTypeRegistry";
import type { EfeitoCanonico } from "../types";

export function construirEfeitoCanonico(params: {
  slugPai: string;
  indice: number;
  contentType: string;
  tipoLegado: string | undefined;
  ordem: number;
  habilitado?: boolean;
  gatilho?: string;
  alvo?: string;
  duracao?: EfeitoCanonico["duracao"];
  payloadEspecifico: Record<string, unknown>;
}): EfeitoCanonico {
  const tipoCanonico = resolverTipoCanonico(params.contentType, params.tipoLegado);
  const diagnostico = diagnosticarEfeito(tipoCanonico);

  const payloadEspecifico =
    tipoCanonico === "outro" ? { ...params.payloadEspecifico, tipoLegado: params.tipoLegado ?? "desconhecido" } : params.payloadEspecifico;

  return {
    id: `${params.slugPai}#efeito-${params.indice}`,
    tipo: tipoCanonico,
    ordem: params.ordem,
    habilitado: params.habilitado ?? true,
    gatilho: params.gatilho,
    alvo: params.alvo,
    duracao: params.duracao,
    payloadEspecifico,
    modoAutomacao: diagnostico.modoAutomacao,
    diagnostico: diagnostico.texto,
  };
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((v): v is string => typeof v === "string");
  return strings.length > 0 ? strings : undefined;
}

export function asTagArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
