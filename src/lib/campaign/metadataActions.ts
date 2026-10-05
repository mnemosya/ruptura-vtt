"use server";

import { randomUUID } from "node:crypto";
import { getCurrentUser } from "../auth/session";
import { getScopedTableClient } from "../auth/scopedClient";
import { uploadCampaignCover, removeCampaignCover } from "./coverService";
import type { Campaign } from "../table/types";
import { RANKINGS_V12, type RankingV12 } from "../rulesetV12/contracts";

function cleanDescription(value: string): string | null {
  const description = value.trim();
  if (description.length > 1000) throw new Error("A descrição deve ter até 1000 caracteres.");
  return description || null;
}

export async function createCampaignWithMetadata(form: FormData): Promise<Campaign> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Entre na sua conta para criar uma campanha.");
  const name = String(form.get("name") ?? "").trim();
  if (!name || name.length > 120) throw new Error("Informe um nome de até 120 caracteres.");
  const description = cleanDescription(String(form.get("description") ?? ""));
  const region = String(form.get("region") ?? "") || null;
  if (region && !["beldran", "kravus", "talesh", "torvash", "vastra"].includes(region)) throw new Error("Região inválida.");
  const initialRanking = String(form.get("initial_ranking") ?? "F");
  if (!(RANKINGS_V12 as readonly string[]).includes(initialRanking)) throw new Error("Ranking inicial inválido.");
  const file = form.get("cover");
  const cover = file instanceof File && file.size > 0 ? file : null;
  const requestedId = String(form.get("id") ?? "");
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedId)
    ? requestedId : randomUUID();
  const client = await getScopedTableClient();
  let coverPath: string | null = null;
  try {
    if (cover) coverPath = await uploadCampaignCover(id, cover);
    const { data, error } = await client.from("campaigns")
      .insert({ id, owner_id: user.id, name, description, regiao: region, initial_ranking: initialRanking, cover_path: coverPath })
      .select().single();
    if (error) throw new Error(`Falha ao criar campanha: ${error.message}`);
    return data as Campaign;
  } catch (error) {
    if (coverPath) await removeCampaignCover(coverPath).catch(() => {});
    throw error;
  }
}

/** Altera o rank sugerido para novas criações; a RLS permite só ao narrador. */
export async function setCampaignInitialRanking(campaignId: string, ranking: RankingV12): Promise<Campaign> {
  if (!(RANKINGS_V12 as readonly string[]).includes(ranking)) throw new Error("Ranking inválido.");
  const user = await getCurrentUser();
  if (!user) throw new Error("Entre na sua conta.");
  const client = await getScopedTableClient();
  const { data, error } = await client.from("campaigns")
    .update({ initial_ranking: ranking }).eq("id", campaignId).eq("owner_id", user.id).select().single();
  if (error || !data) throw new Error("Não foi possível salvar o ranking inicial.");
  return data as Campaign;
}

/** Substitui ou limpa a capa; a RLS de campaigns exige o narrador. */
export async function setCampaignCover(campaignId: string, file: File | null): Promise<Campaign> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Entre na sua conta.");
  const client = await getScopedTableClient();
  const { data: current, error: readError } = await client.from("campaigns")
    .select("id, owner_id, cover_path").eq("id", campaignId).single();
  if (readError || current?.owner_id !== user.id) throw new Error("Somente o narrador pode alterar a capa.");
  const nextPath = file && file.size > 0 ? await uploadCampaignCover(campaignId, file) : null;
  let update = client.from("campaigns")
    .update({ cover_path: nextPath }).eq("id", campaignId).eq("owner_id", user.id);
  update = current.cover_path ? update.eq("cover_path", current.cover_path) : update.is("cover_path", null);
  const { data, error } = await update.select().single();
  if (error || !data) {
    if (nextPath) await removeCampaignCover(nextPath).catch(() => {});
    throw new Error("Não foi possível atualizar a capa. Tente novamente.");
  }
  if (current.cover_path) await removeCampaignCover(current.cover_path).catch(() => {
    // O GC remove a versão antiga se o Storage estiver indisponível.
  });
  return data as Campaign;
}

export async function setCampaignDescription(campaignId: string, value: string): Promise<Campaign> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Entre na sua conta.");
  const client = await getScopedTableClient();
  const { data, error } = await client.from("campaigns")
    .update({ description: cleanDescription(value) })
    .eq("id", campaignId).eq("owner_id", user.id).select().single();
  if (error || !data) throw new Error("Não foi possível salvar a descrição.");
  return data as Campaign;
}
