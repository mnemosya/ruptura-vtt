"use server";

/**
 * Server Actions dos marcadores da campanha. Mesmo formato das outras
 * fronteiras do VTT (`sceneActions.ts`): acesso à campanha conferido
 * primeiro, para errar cedo e em português; a RLS de `vtt_markers` é a
 * garantia forte de que só o narrador escreve.
 */

import "server-only";
import { resolveCampaignAccess } from "../../../../../lib/campaign/access";
import { criarMarcador, definirPreenchidos, listarMarcadores, type MarcadorDb } from "../../../../../lib/vtt/marcadoresStorage";
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
