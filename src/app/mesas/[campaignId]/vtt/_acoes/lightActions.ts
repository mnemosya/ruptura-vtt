"use server";

import "server-only";
import { resolveCampaignAccess } from "../../../../../lib/campaign/access";
import { getScopedTableClient } from "../../../../../lib/auth/scopedClient";
import { listCampaignRoster } from "../../../../../lib/table/storage";
import { linhaParaArea, linhaParaObjeto, linhaParaTokenVtt, type AreaVtt, type ObjetoVtt, type TokenVtt } from "../../../../../lib/vtt/sceneStorage";
import { imagensCenaDeJson, type ImagemCena } from "../_dominio/imagemCena";
import {
  lerIluminacaoCena, definirAmbienteLuz, criarParedeLuz, definirParedeLuz, removerParedeLuz,
  criarFonteLuz, definirFonteLuz, removerFonteLuz,
  definirVisaoNoturna,
  type IluminacaoCena, type ModoLuz, type ParedeLuz, type FonteLuz,
} from "../../../../../lib/vtt/lightStorage";

type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string };
export interface PreviaJogadorLuz { tokens: TokenVtt[]; objetos: ObjetoVtt[]; areas: AreaVtt[]; imagens: ImagemCena[] }
const falha = (e: unknown): { ok: false; erro: string } => ({ ok: false, erro: e instanceof Error ? e.message : "Falha ao ajustar iluminação." });
const coordenada = (p: { q: number; r: number }) => Number.isFinite(p.q) && Number.isFinite(p.r)
  && Math.abs(p.q) <= 200 && Math.abs(p.r) <= 200;

async function acesso(campaignId: string, sceneId: string, escrita: boolean): Promise<string | null> {
  const a = await resolveCampaignAccess(campaignId);
  if (a.kind !== "ok") return "Você não tem acesso à campanha.";
  if (escrita && a.role !== "narrator") return "Só o narrador edita iluminação.";
  const client = await getScopedTableClient();
  const { data } = await client.from("vtt_scenes").select("id").eq("id", sceneId).eq("campaign_id", campaignId).maybeSingle();
  return data ? null : "Cena indisponível.";
}

export async function lerIluminacaoAction(campaignId: string, sceneId: string): Promise<Resultado<IluminacaoCena>> {
  const erro = await acesso(campaignId, sceneId, false);
  if (erro) return { ok: false, erro };
  try { return { ok: true, dados: await lerIluminacaoCena(sceneId) }; } catch (e) { return falha(e); }
}
export async function definirAmbienteLuzAction(p: { campaignId: string; sceneId: string; modo: ModoLuz; revision: number }): Promise<Resultado<number>> {
  const erro = await acesso(p.campaignId, p.sceneId, true);
  if (erro) return { ok: false, erro };
  if (!["claro", "penumbra", "escuro"].includes(p.modo) || !Number.isInteger(p.revision) || p.revision < 0) return { ok: false, erro: "Ambiente ou revisão inválida." };
  try { return { ok: true, dados: await definirAmbienteLuz(p.sceneId, p.campaignId, p.modo, p.revision) }; } catch (e) { return falha(e); }
}
export async function criarParedeLuzAction(p: { campaignId: string; sceneId: string; a: { q: number; r: number }; b: { q: number; r: number } }): Promise<Resultado<ParedeLuz>> {
  const erro = await acesso(p.campaignId, p.sceneId, true);
  if (erro) return { ok: false, erro };
  if (!coordenada(p.a) || !coordenada(p.b) || (p.a.q === p.b.q && p.a.r === p.b.r)) return { ok: false, erro: "Segmento inválido." };
  try { return { ok: true, dados: await criarParedeLuz(p.sceneId, p.campaignId, p.a, p.b) }; } catch (e) { return falha(e); }
}
export async function definirParedeLuzAction(p: { campaignId: string; parede: ParedeLuz }): Promise<Resultado<ParedeLuz>> {
  const erro = await acesso(p.campaignId, p.parede.sceneId, true);
  if (erro) return { ok: false, erro };
  if (!Number.isInteger(p.parede.revision) || p.parede.revision < 1) return { ok: false, erro: "Revisão inválida." };
  try { return { ok: true, dados: await definirParedeLuz(p.parede) }; } catch (e) { return falha(e); }
}
export async function removerParedeLuzAction(p: { campaignId: string; sceneId: string; id: string }): Promise<Resultado<null>> {
  const erro = await acesso(p.campaignId, p.sceneId, true);
  if (erro) return { ok: false, erro };
  try { await removerParedeLuz(p.id, p.sceneId); return { ok: true, dados: null }; } catch (e) { return falha(e); }
}
export async function criarFonteLuzAction(p: { campaignId: string; sceneId: string; origem: { q: number; r: number }; raioM: number }): Promise<Resultado<FonteLuz>> {
  const erro = await acesso(p.campaignId, p.sceneId, true);
  if (erro) return { ok: false, erro };
  if (!coordenada(p.origem) || !Number.isFinite(p.raioM) || p.raioM < 1 || p.raioM > 12) return { ok: false, erro: "Fonte inválida." };
  try { return { ok: true, dados: await criarFonteLuz(p.sceneId, p.campaignId, p.origem, p.raioM) }; } catch (e) { return falha(e); }
}
export async function definirFonteLuzAction(p: { campaignId: string; fonte: FonteLuz }): Promise<Resultado<FonteLuz>> {
  const erro = await acesso(p.campaignId, p.fonte.sceneId, true);
  if (erro) return { ok: false, erro };
  if (!Number.isInteger(p.fonte.revision) || p.fonte.revision < 1 || !Number.isFinite(p.fonte.raioM)
    || p.fonte.raioM < 1 || p.fonte.raioM > 12 || !/^#[0-9a-fA-F]{6}$/.test(p.fonte.cor)) return { ok: false, erro: "Fonte inválida." };
  try { return { ok: true, dados: await definirFonteLuz(p.fonte) }; } catch (e) { return falha(e); }
}
export async function removerFonteLuzAction(p: { campaignId: string; sceneId: string; id: string }): Promise<Resultado<null>> {
  const erro = await acesso(p.campaignId, p.sceneId, true);
  if (erro) return { ok: false, erro };
  try { await removerFonteLuz(p.id, p.sceneId); return { ok: true, dados: null }; } catch (e) { return falha(e); }
}

export async function definirVisaoNoturnaAction(p: { campaignId: string; sceneId: string; tokenId: string; revision: number; ativa: boolean }): Promise<Resultado<null>> {
  const erro = await acesso(p.campaignId, p.sceneId, true);
  if (erro) return { ok: false, erro };
  if (!Number.isInteger(p.revision) || p.revision < 1 || typeof p.ativa !== "boolean") return { ok: false, erro: "Visão noturna inválida." };
  try { await definirVisaoNoturna(p.tokenId, p.sceneId, p.revision, p.ativa); return { ok: true, dados: null }; } catch (e) { return falha(e); }
}

export async function listarJogadoresPreviaAction(campaignId: string): Promise<Resultado<{ id: string; nome: string }[]>> {
  const a = await resolveCampaignAccess(campaignId);
  if (a.kind !== "ok" || a.role !== "narrator") return { ok: false, erro: "Só o narrador pode ver a prévia." };
  try {
    const roster = await listCampaignRoster(campaignId);
    return { ok: true, dados: roster.filter((m) => m.role === "player").map((m) => ({ id: m.userId, nome: m.displayName })) };
  } catch (e) { return falha(e); }
}

export async function lerPreviaJogadorAction(p: { campaignId: string; sceneId: string; playerId: string }): Promise<Resultado<PreviaJogadorLuz>> {
  const erro = await acesso(p.campaignId, p.sceneId, true);
  if (erro) return { ok: false, erro };
  try {
    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("read_vtt_light_preview", { p_scene_id: p.sceneId, p_player_id: p.playerId });
    if (error) throw new Error(error.message);
    const row = data as Record<string, unknown> | null;
    const rows = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
    return { ok: true, dados: {
      tokens: rows(row?.tokens).map(linhaParaTokenVtt),
      objetos: rows(row?.objetos).map(linhaParaObjeto),
      areas: rows(row?.areas).map(linhaParaArea),
      imagens: imagensCenaDeJson(row?.imagens),
    } };
  } catch (e) { return falha(e); }
}
