/**
 * Hash determinístico de payload (Etapa 11) — puro, sem I/O. Usado por
 * exportação/importação para detectar conteúdo idêntico/alterado/
 * corrompido, nunca para autoridade de versão (essa continua só no RPC
 * de publicação, `content_next_patch_version`/`publish_content_draft`).
 *
 * Canonicaliza ANTES de gerar o hash: ordena chaves de objeto
 * recursivamente (nunca depende da ordem de inserção), mas preserva a
 * ordem de arrays tal como está (efeitos, resultados, níveis de talento
 * são posicionalmente significativos — reordenar um array é uma
 * mudança real, não um artefato de serialização).
 */

import { createHash } from "node:crypto";

function canonicalizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonicalizar);
  if (valor !== null && typeof valor === "object") {
    const chaves = Object.keys(valor as Record<string, unknown>).sort();
    const saida: Record<string, unknown> = {};
    for (const chave of chaves) saida[chave] = canonicalizar((valor as Record<string, unknown>)[chave]);
    return saida;
  }
  return valor;
}

/** JSON canônico (chaves de objeto ordenadas, arrays preservados) — mesma entrada sempre produz a mesma string. */
export function jsonCanonico(valor: unknown): string {
  return JSON.stringify(canonicalizar(valor));
}

/** sha256 hex do JSON canônico — determinístico independente da ordem de inserção de chaves. */
export function hashCanonico(valor: unknown): string {
  return createHash("sha256").update(jsonCanonico(valor)).digest("hex");
}
