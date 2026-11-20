import "server-only";

/**
 * Avatar do personagem SEM campanha (migration 20261119180000).
 *
 * O avatar normal é uma imagem da biblioteca da campanha
 * (`characters.avatar_image_id`). Personagem solto guarda a cara num
 * bucket privado da conta do dono, `character-avatars`, em
 * `<owner_id>/<character_id>/<uuid>.webp`, e o caminho fica em
 * `characters.avatar_path`.
 *
 * Quem pode: só o dono, e só enquanto o personagem está sem campanha
 * (a mesma regra de `characters.owner_id` na RLS). A leitura da linha é
 * feita como o usuário logado — se a RLS não devolve, não existe — e só
 * depois o service role mexe no bucket.
 *
 * Ao entrar numa campanha, `promoverAvatarPessoal` copia a imagem para a
 * biblioteca dela pelo fluxo de sempre (reserva → upload → finalize) e
 * apaga a cópia pessoal.
 */

import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { getScopedTableClient } from "../auth/scopedClient";
import { getAdminSupabaseClient } from "../supabase/adminClient";

export const BUCKET_AVATAR_PESSOAL = "character-avatars";
const BYTES_MAXIMO = 2 * 1024 * 1024;
const LADO = 512;

interface LinhaAvatar { id: string; owner_id: string | null; campaign_id: string | null; avatar_path: string | null; avatar_image_id: string | null }

/** A linha do personagem vista pelo usuário logado (RLS decide). */
async function lerLinha(characterId: string): Promise<LinhaAvatar | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("characters")
    .select("id, owner_id, campaign_id, avatar_path, avatar_image_id")
    .eq("id", characterId)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível ler o personagem: ${error.message}`);
  return (data as LinhaAvatar | null) ?? null;
}

function admin() {
  const a = getAdminSupabaseClient();
  if (!a) throw new Error("Avatar indisponível neste ambiente.");
  return a;
}

/** Confere que o personagem é de `userId` e está solto; devolve a linha. */
async function exigirDonoSemCampanha(userId: string, characterId: string): Promise<LinhaAvatar> {
  const linha = await lerLinha(characterId);
  if (!linha || linha.owner_id !== userId) throw new Error("Personagem não encontrado.");
  if (linha.campaign_id) throw new Error("Este personagem está numa campanha: o avatar é enviado pela mesa.");
  return linha;
}

/** Normaliza (decodifica e reencoda) e grava; troca e apaga o anterior. */
export async function enviarAvatarPessoal(userId: string, characterId: string, arquivo: File): Promise<string> {
  if (arquivo.size === 0 || arquivo.size > BYTES_MAXIMO) throw new Error("O avatar deve ter até 2 MB.");
  const linha = await exigirDonoSemCampanha(userId, characterId);
  const entrada = Buffer.from(await arquivo.arrayBuffer());
  const meta = await sharp(entrada).metadata().catch(() => null);
  if (!meta?.width || !meta.height || !["jpeg", "png", "webp"].includes(meta.format ?? "")) {
    throw new Error("Use uma imagem PNG, JPEG ou WebP válida.");
  }
  if (meta.width > 4096 || meta.height > 4096) throw new Error("O avatar deve ter no máximo 4096 px por lado.");
  const normalizada = await sharp(entrada).rotate().resize(LADO, LADO, { fit: "cover" }).webp({ quality: 86 }).toBuffer();

  const a = admin();
  const caminho = `${userId}/${characterId}/${randomUUID()}.webp`;
  const { error: erroEnvio } = await a.storage.from(BUCKET_AVATAR_PESSOAL).upload(caminho, normalizada, { contentType: "image/webp", upsert: false });
  if (erroEnvio) throw new Error(`Não foi possível enviar o avatar: ${erroEnvio.message}`);
  const { error } = await a.from("characters").update({ avatar_path: caminho }).eq("id", characterId);
  if (error) {
    void a.storage.from(BUCKET_AVATAR_PESSOAL).remove([caminho]);
    throw new Error(`Não foi possível salvar o avatar: ${error.message}`);
  }
  if (linha.avatar_path) void a.storage.from(BUCKET_AVATAR_PESSOAL).remove([linha.avatar_path]);
  return caminho;
}

export async function removerAvatarPessoal(userId: string, characterId: string): Promise<void> {
  const linha = await exigirDonoSemCampanha(userId, characterId);
  if (!linha.avatar_path) return;
  const a = admin();
  const { error } = await a.from("characters").update({ avatar_path: null }).eq("id", characterId);
  if (error) throw new Error(`Não foi possível remover o avatar: ${error.message}`);
  void a.storage.from(BUCKET_AVATAR_PESSOAL).remove([linha.avatar_path]);
}

/** Caminho atual do avatar pessoal, para quem consegue ler o personagem. */
export async function lerCaminhoAvatarPessoal(characterId: string): Promise<string | null> {
  return (await lerLinha(characterId))?.avatar_path ?? null;
}

/** Bytes do avatar pessoal, para quem consegue ler o personagem. */
export async function baixarAvatarPessoal(characterId: string): Promise<Blob | null> {
  const linha = await lerLinha(characterId).catch(() => null);
  const caminho = linha?.avatar_path;
  // O caminho só vale na pasta do dono e do próprio personagem.
  if (!linha || !caminho || !linha.owner_id || !caminho.startsWith(`${linha.owner_id}/${characterId}/`)) return null;
  const { data, error } = await admin().storage.from(BUCKET_AVATAR_PESSOAL).download(caminho);
  return error || !data ? null : data;
}

/** URL do avatar pessoal (a versão é o próprio caminho, que muda a cada troca). */
export function urlAvatarPessoal(characterId: string, caminho: string | null | undefined): string | null {
  if (!caminho) return null;
  return `/api/personagens/${characterId}/avatar?v=${encodeURIComponent(caminho.slice(caminho.lastIndexOf("/") + 1, -5))}`;
}

/**
 * Personagem entrou numa campanha: a cara vai para a biblioteca dela.
 * Roda como quem fez a ação (dono que levou o personagem, ou narrador que
 * aceitou o pedido) — a reserva `avatar` exige `can_manage_character`.
 * Falhar aqui nunca desfaz a entrada: o caminho pessoal fica e a próxima
 * chamada tenta de novo.
 */
export async function promoverAvatarPessoal(characterId: string): Promise<void> {
  // Import tardio: o módulo de ações de imagem é "use server" e puxa o resto do VTT.
  const { reservarUploadAction, finalizarUploadAvatarAction, definirAvatarPersonagemAction, cancelarUploadAction } =
    await import("../../app/mesas/[campaignId]/vtt/_acoes/imageActions");
  const a = admin();
  const { data } = await a.from("characters").select("owner_id, campaign_id, avatar_path, avatar_image_id").eq("id", characterId).maybeSingle();
  const linha = data as Omit<LinhaAvatar, "id"> | null;
  if (!linha?.campaign_id || !linha.avatar_path) return;
  const campaignId = linha.campaign_id;
  const caminho = linha.avatar_path;
  // Já tem cara na campanha: a pessoal sobra, só limpa.
  if (!linha.avatar_image_id) {
    const { data: blob, error } = await a.storage.from(BUCKET_AVATAR_PESSOAL).download(caminho);
    if (error || !blob) return;
    const bytes = Buffer.from(await blob.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const reserva = await reservarUploadAction(campaignId, sha256, "avatar", null, characterId);
    if (!reserva.ok || !reserva.dados) return;
    if (reserva.dados.reutilizado) {
      const r = await definirAvatarPersonagemAction(campaignId, characterId, reserva.dados.assetId);
      if (!r.ok) return;
    } else {
      const put = await fetch(reserva.dados.uploadUrl!, { method: "PUT", headers: { "content-type": "image/webp" }, body: new Uint8Array(bytes) });
      const r = put.ok ? await finalizarUploadAvatarAction(campaignId, reserva.dados.reservaId!, sha256, characterId) : { ok: false };
      if (!r.ok) { void cancelarUploadAction(campaignId, reserva.dados.reservaId!).catch(() => {}); return; }
    }
  }
  await a.from("characters").update({ avatar_path: null }).eq("id", characterId);
  void a.storage.from(BUCKET_AVATAR_PESSOAL).remove([caminho]);
}
