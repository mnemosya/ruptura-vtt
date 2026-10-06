"use server";

import "server-only";
import { getScopedTableClient } from "../../../../../lib/auth/scopedClient";
import { resolveCampaignAccess } from "../../../../../lib/campaign/access";
import { type AnotacaoCena, type CorAnotacao, corAnotacaoValida, pontosValidos, pontosValidosParaAtualizacao, type TipoAnotacao } from "../_dominio/anotacoes";
import type { PontoAxial } from "../_dominio/escalaMapa";

type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string };
const COLUNAS = "id, scene_id, autor_id, tipo, pontos, texto, cor, espessura, tamanho, privada, revision";

function converter(row: Record<string, unknown>): AnotacaoCena {
  return {
    id: row.id as string, sceneId: row.scene_id as string, autorId: row.autor_id as string,
    tipo: row.tipo as TipoAnotacao, pontos: row.pontos as PontoAxial[], texto: row.texto as string | null,
    cor: row.cor as CorAnotacao, espessura: Number(row.espessura), tamanho: Number(row.tamanho), privada: row.privada as boolean, revision: Number(row.revision),
  };
}

async function acesso(campaignId: string) {
  const a = await resolveCampaignAccess(campaignId);
  return a.kind === "ok" ? a : null;
}

export async function lerAnotacoesAction(params: { campaignId: string; sceneId: string }): Promise<Resultado<AnotacaoCena[]>> {
  if (!await acesso(params.campaignId)) return { ok: false, erro: "Sem acesso à campanha." };
  const client = await getScopedTableClient();
  const { data, error } = await client.from("vtt_scene_annotations").select(COLUNAS)
    .eq("campaign_id", params.campaignId).eq("scene_id", params.sceneId).order("created_at");
  if (error) return { ok: false, erro: error.message };
  return { ok: true, dados: (data ?? []).map((row) => converter(row)) };
}

export async function criarAnotacaoAction(params: {
  campaignId: string; sceneId: string; tipo: TipoAnotacao; pontos: PontoAxial[];
  texto: string | null; cor: CorAnotacao; espessura: number; tamanho: number; privada: boolean;
}): Promise<Resultado<AnotacaoCena>> {
  const a = await acesso(params.campaignId);
  if (!a) return { ok: false, erro: "Sem acesso à campanha." };
  if (!pontosValidos(params.pontos, params.tipo) || !corAnotacaoValida(params.cor) || typeof params.privada !== "boolean"
    || !Number.isInteger(params.espessura) || params.espessura < 1 || params.espessura > 6
    || !Number.isInteger(params.tamanho) || params.tamanho < 12 || params.tamanho > 32
    || (params.tipo === "texto" ? !params.texto?.trim() || params.texto.length > 500 : params.texto !== null)) {
    return { ok: false, erro: "Anotação inválida." };
  }
  const client = await getScopedTableClient();
  const { data, error } = await client.from("vtt_scene_annotations").insert({
    scene_id: params.sceneId, campaign_id: params.campaignId, autor_id: a.user.id,
    tipo: params.tipo, pontos: params.pontos, texto: params.texto, cor: params.cor, privada: params.privada,
    espessura: params.espessura, tamanho: params.tamanho,
  }).select(COLUNAS).single();
  if (error || !data) return { ok: false, erro: error?.message ?? "Não foi possível criar a anotação." };
  return { ok: true, dados: converter(data) };
}

export async function atualizarAnotacaoAction(params: {
  campaignId: string; sceneId: string; id: string; revision: number;
  pontos?: PontoAxial[]; texto?: string; cor?: CorAnotacao; espessura?: number; tamanho?: number; privada?: boolean;
}): Promise<Resultado<AnotacaoCena>> {
  if (!await acesso(params.campaignId)) return { ok: false, erro: "Sem acesso à campanha." };
  if (params.pontos && !pontosValidosParaAtualizacao(params.pontos)) return { ok: false, erro: "Pontos inválidos." };
  if (params.texto !== undefined && (!params.texto.trim() || params.texto.length > 500)) return { ok: false, erro: "Texto inválido." };
  if (params.cor !== undefined && !corAnotacaoValida(params.cor)) return { ok: false, erro: "Cor inválida." };
  if (params.privada !== undefined && typeof params.privada !== "boolean") return { ok: false, erro: "Visibilidade inválida." };
  if (params.espessura !== undefined && (!Number.isInteger(params.espessura) || params.espessura < 1 || params.espessura > 6)) return { ok: false, erro: "Espessura inválida." };
  if (params.tamanho !== undefined && (!Number.isInteger(params.tamanho) || params.tamanho < 12 || params.tamanho > 32)) return { ok: false, erro: "Tamanho inválido." };
  const patch: Record<string, unknown> = {};
  if (params.pontos !== undefined) patch.pontos = params.pontos;
  if (params.texto !== undefined) patch.texto = params.texto;
  if (params.cor !== undefined) patch.cor = params.cor;
  if (params.espessura !== undefined) patch.espessura = params.espessura;
  if (params.tamanho !== undefined) patch.tamanho = params.tamanho;
  if (params.privada !== undefined) patch.privada = params.privada;
  if (!Object.keys(patch).length) return { ok: false, erro: "Nenhuma alteração enviada." };
  const client = await getScopedTableClient();
  const { data, error } = await client.from("vtt_scene_annotations").update(patch)
    .eq("campaign_id", params.campaignId).eq("scene_id", params.sceneId).eq("id", params.id)
    .eq("revision", params.revision).select(COLUNAS).maybeSingle();
  if (error || !data) return { ok: false, erro: error?.message ?? "A anotação mudou em outra sessão; selecione-a novamente." };
  return { ok: true, dados: converter(data) };
}

export async function removerAnotacaoAction(params: { campaignId: string; sceneId: string; id: string; revision: number }): Promise<Resultado<{ id: string }>> {
  if (!await acesso(params.campaignId)) return { ok: false, erro: "Sem acesso à campanha." };
  const client = await getScopedTableClient();
  const { data, error } = await client.from("vtt_scene_annotations").delete()
    .eq("campaign_id", params.campaignId).eq("scene_id", params.sceneId).eq("id", params.id)
    .eq("revision", params.revision).select("id").maybeSingle();
  if (error || !data) return { ok: false, erro: error?.message ?? "A anotação mudou em outra sessão; selecione-a novamente." };
  return { ok: true, dados: { id: data.id as string } };
}
