import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getAdminSupabaseClient } from "../supabase/adminClient";

export const COVER_BUCKET = "campaign-covers";
export const COVER_MAX_BYTES = 5 * 1024 * 1024;

export async function uploadCampaignCover(campaignId: string, file: File): Promise<string> {
  if (file.size > COVER_MAX_BYTES || file.size === 0) throw new Error("A capa deve ter até 5 MB.");
  const admin = getAdminSupabaseClient();
  if (!admin) throw new Error("Upload de capa indisponível neste ambiente.");
  const input = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(input).metadata().catch(() => null);
  if (!metadata?.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) {
    throw new Error("Use uma imagem PNG, JPEG ou WebP válida.");
  }
  if (metadata.width > 4096 || metadata.height > 4096) throw new Error("A capa deve ter no máximo 4096 px por lado.");
  const normalized = await sharp(input).rotate().resize(1600, 900, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
  const path = `${campaignId}/${randomUUID()}.webp`;
  const { error } = await admin.storage.from(COVER_BUCKET).upload(path, normalized, { contentType: "image/webp", upsert: false });
  if (error) throw new Error(`Não foi possível enviar a capa: ${error.message}`);
  return path;
}

export async function removeCampaignCover(path: string): Promise<void> {
  const admin = getAdminSupabaseClient();
  if (!admin) throw new Error("Limpeza de capa indisponível neste ambiente.");
  const { error } = await admin.storage.from(COVER_BUCKET).remove([path]);
  if (error) throw new Error(`Não foi possível remover a capa: ${error.message}`);
}
