"use server";

/**
 * Server Actions dos marcadores da campanha. Mesmo formato das outras
 * fronteiras do VTT (`sceneActions.ts`): acesso à campanha conferido
 * primeiro, para errar cedo e em português; a RLS de `vtt_markers` é a
 * garantia forte de que só o narrador escreve.
 */

import "server-only";
import { resolveCampaignAccess } from "../../../../../lib/campaign/access";
import { addLog } from "../../../../../lib/table/storage";
import { criarMarcador, definirPreenchidos, lerMarcador, listarMarcadores, removerMarcador, restaurarMarcador, type MarcadorDb } from "../../../../../lib/vtt/marcadoresStorage";
import { limitarTotal, normalizarNome, type TipoMarcador } from "../_dominio/marcadores";

type ResultadoAcao<T> = { ok: true; dados: T } | { ok: false; erro: string };

async function exigirAcesso(campaignId: string): Promise<string | null> {
  const acesso = await resolveCampaignAccess(campaignId);
  if (acesso.kind === "ok") return null;
  return acesso.kind === "no_session" ? "Sessão expirada." : "Você não tem acesso a esta campanha.";
}

export async function lerMarcadoresAction(campaignId: string): Promise<ResultadoAcao<MarcadorDb[]>> {
  const erro = await exigirAcesso(campaignId);
  if (erro) return { ok: false, erro };
  return listarMarcadores(campaignId);
}

export async function criarMarcadorAction(params: {
  campaignId: string;
  tipo: TipoMarcador;
  nome: string;
  total: number;
}): Promise<ResultadoAcao<MarcadorDb>> {
  const erro = await exigirAcesso(params.campaignId);
  if (erro) return { ok: false, erro };
  if (params.tipo !== "progresso" && params.tipo !== "pressao") return { ok: false, erro: "Tipo de marcador inválido." };
  return criarMarcador({
    campaignId: params.campaignId,
    tipo: params.tipo,
    nome: normalizarNome(params.nome),
    total: limitarTotal(params.total),
  });
}

export async function definirPreenchidosAction(params: {
  campaignId: string;
  id: string;
  preenchidos: number;
}): Promise<ResultadoAcao<MarcadorDb>> {
  const erro = await exigirAcesso(params.campaignId);
  if (erro) return { ok: false, erro };
  // O teto (`<= total`) é do banco: o cliente não sabe o total com certeza
  // se outra aba mudou o marcador, e a constraint recusa o excedente.
  return definirPreenchidos({ campaignId: params.campaignId, id: params.id, preenchidos: Math.max(0, Math.round(params.preenchidos)) });
}

export async function removerMarcadorAction(params: { campaignId: string; id: string }): Promise<ResultadoAcao<MarcadorDb>> {
  const erro = await exigirAcesso(params.campaignId);
  if (erro) return { ok: false, erro };
  return removerMarcador(params);
}

export async function restaurarMarcadorAction(params: { campaignId: string; marcador: MarcadorDb }): Promise<ResultadoAcao<MarcadorDb>> {
  const erro = await exigirAcesso(params.campaignId);
  if (erro) return { ok: false, erro };
  const m = params.marcador;
  if (m.tipo !== "progresso" && m.tipo !== "pressao") return { ok: false, erro: "Tipo de marcador inválido." };
  const total = limitarTotal(m.total);
  return restaurarMarcador({
    campaignId: params.campaignId,
    marcador: { ...m, nome: m.nome === null ? null : normalizarNome(m.nome), total, preenchidos: Math.max(0, Math.min(total, Math.round(m.preenchidos))) },
  });
}

/**
 * Card do chat para uma SEQUÊNCIA de mudanças num marcador. O cliente
 * agrupa cliques seguidos e manda só o valor de antes; o depois, o
 * total, o nome e o tipo vêm do banco — o card nunca mostra um número
 * que o marcador não tem. Só o narrador registra (é quem muda marcador).
 */
export async function registrarMudancaMarcadorAction(params: {
  campaignId: string;
  id: string;
  antes: number;
}): Promise<ResultadoAcao<null>> {
  const acesso = await resolveCampaignAccess(params.campaignId);
  if (acesso.kind !== "ok") return { ok: false, erro: "Você não tem acesso a esta campanha." };
  if (acesso.role !== "narrator") return { ok: false, erro: "Só o narrador altera marcadores." };

  const r = await lerMarcador({ campaignId: params.campaignId, id: params.id });
  if (!r.ok) return r;
  const m = r.dados;
  if (!m) return { ok: true, dados: null };
  const antes = Math.max(0, Math.min(m.total, Math.round(params.antes)));
  if (antes === m.preenchidos) return { ok: true, dados: null };

  const evento = m.preenchidos >= m.total ? "concluido" : m.preenchidos > antes ? "avancou" : "recuou";
  try {
    await addLog({
      campaignId: params.campaignId,
      type: "marcador_vtt",
      visibility: "public",
      payload: { evento, marcadorId: m.id, tipo: m.tipo, nome: m.nome, total: m.total, antes, depois: m.preenchidos, source: "vtt_marcadores" },
    });
  } catch {
    return { ok: false, erro: "Não foi possível registrar no chat." };
  }
  return { ok: true, dados: null };
}
