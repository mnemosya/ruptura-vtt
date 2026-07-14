"use server";

/**
 * Executor genérico reutilizável do efeito canônico `aplicar_condicao`
 * (Etapa 4 do Editor Universal). Não é exclusivo de nenhuma magia,
 * talento ou item — qualquer efeito com `tipo: "aplicar_condicao"` pode
 * chamar esta função com o slug da condição e o alvo já resolvido.
 *
 * Passos, sempre nesta ordem (nunca muta antes de validar):
 *   1. valida que a condição existe e está PUBLICADA na Biblioteca
 *      (nunca aceita texto livre como substituto de referência estruturada);
 *   2. resolve a duração (override do efeito > duração padrão da condição);
 *   3. delega a mutação em si para `applyGmCondition` (já existente,
 *      usado pelo narrador em /dev/table) — que trata "acúmulo": no
 *      modelo atual de `ActiveCondition` (sem campo de pilhas), a mesma
 *      condição não é duplicada enquanto já estiver ativa;
 *   4. gera texto de log legível;
 *   5. nunca aplica parcialmente — qualquer falha de validação retorna
 *      `{ ok: false }` sem tocar o personagem (nenhum recurso é
 *      consumido antes da validação, porque a validação roda primeiro
 *      e a função é pura — não persiste nada sozinha).
 *
 * Conectado (Etapa 4) ao fluxo manual de "aplicar condição" do narrador
 * em `/dev/table` (`TableClient.tsx::handleGmApplyCondition`) — não a
 * todas as 51 ocorrências legadas de `aplicar_condicao` no conteúdo
 * (isso exigiria resolver alvo/distância automaticamente, fora do
 * teatro da mente de Ruptura, e não foi avaliado caso a caso aqui).
 */

import { getContentDocument } from "../content/queries";
import { applyGmCondition } from "./gmActions";
import type { ActiveCondition, Character } from "./types";

export interface AutoriaCondicao {
  sourceCharacterId?: string | null;
  sourceTalentId?: string | null;
  sourceType?: ActiveCondition["sourceType"];
  originalTargetId?: string | null;
  applicationEventId?: string | null;
}

export interface ExecutarAplicarCondicaoResultado {
  ok: boolean;
  motivo?: string;
  character?: Character;
  condicao?: ActiveCondition | null;
  logTexto?: string;
}

export async function executarAplicarCondicao(
  characterPayload: Character,
  condicaoSlug: string,
  nowIso: string,
  duracaoOverride?: string,
  authorship?: AutoriaCondicao,
): Promise<ExecutarAplicarCondicaoResultado> {
  if (!condicaoSlug || condicaoSlug.trim() === "") {
    return { ok: false, motivo: "Nenhuma condição informada." };
  }

  // 1. condição precisa existir e estar publicada — nunca aceita texto livre.
  const condicaoPublicada = await getContentDocument("condition", condicaoSlug).catch(() => null);
  if (!condicaoPublicada) {
    return { ok: false, motivo: `Condição "${condicaoSlug}" não encontrada ou não publicada na Biblioteca.` };
  }

  const payload = (condicaoPublicada.payload as Record<string, unknown>) ?? {};
  const nome = typeof payload.nome === "string" ? payload.nome : condicaoSlug;
  const duracaoPadrao = typeof payload.duracao_padrao === "string" ? payload.duracao_padrao : undefined;

  // 2. duração: override do efeito prevalece sobre a duração padrão da condição.
  const duracao = duracaoOverride ?? duracaoPadrao;

  // 3. mutação em si — pura, não persiste nada (quem chama decide persistência).
  const resultado = applyGmCondition(characterPayload, { slug: condicaoSlug, nome, duracao }, nowIso, authorship);

  // 5. falha sem sucesso parcial: condição já ativa (acúmulo binário do modelo atual).
  if (resultado.jaAtiva) {
    return { ok: false, motivo: `"${nome}" já está ativa neste alvo — o modelo atual não empilha a mesma condição.` };
  }

  // 4. log legível.
  const logTexto = `Condição aplicada: ${nome}${duracao ? ` (${duracao})` : ""}.`;

  return { ok: true, character: resultado.character, condicao: resultado.condicao, logTexto };
}
