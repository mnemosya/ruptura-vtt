import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getAdminSupabaseClient } from "../supabase/adminClient";

export const AVATAR_BUCKET = "account-avatars";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const LADO = 512;

/**
 * O recorte quadrado já vem feito do navegador (`prepararRecorteQuadrado`),
 * mas o servidor decodifica e reencoda mesmo assim: o que vai para o
 * bucket nunca é o arquivo que o cliente mandou.
 */
export async function uploadAccountAvatar(userId: string, file: File): Promise<string> {
  if (file.size > AVATAR_MAX_BYTES || file.size === 0) throw new Error("O avatar deve ter até 2 MB.");
  const admin = getAdminSupabaseClient();
  if (!admin) throw new Error("Upload de avatar indisponível neste ambiente.");
  const input = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(input).metadata().catch(() => null);
  if (!metadata?.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) {
    throw new Error("Use uma imagem PNG, JPEG ou WebP válida.");
  }
  if (metadata.width > 4096 || metadata.height > 4096) throw new Error("O avatar deve ter no máximo 4096 px por lado.");
  const normalized = await sharp(input).rotate().resize(LADO, LADO, { fit: "cover" }).webp({ quality: 84 }).toBuffer();
  const path = `${userId}/${randomUUID()}.webp`;
  const { error } = await admin.storage.from(AVATAR_BUCKET).upload(path, normalized, { contentType: "image/webp", upsert: false });
  if (error) throw new Error(`Não foi possível enviar o avatar: ${error.message}`);
  return path;
}

export async function removeAccountAvatar(path: string): Promise<void> {
  const admin = getAdminSupabaseClient();
  if (!admin) throw new Error("Limpeza de avatar indisponível neste ambiente.");
  const { error } = await admin.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) throw new Error(`Não foi possível remover o avatar: ${error.message}`);
}
