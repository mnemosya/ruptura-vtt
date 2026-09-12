"use server";

/**
 * Fronteira das imagens do VTT — arquivo novo, ao lado de
 * `sceneActions.ts`, porque o fluxo tem um passo que nenhuma outra ação
 * da mesa tem: o browser fala com o Storage DIRETO, por uma capability
 * que este servidor emitiu.
 *
 * O passo a passo, e o que cada parte garante:
 *
 *   1. o browser prepara o arquivo em memória (WebP, downscale, sha256)
 *      e mostra o preview LOCAL — nada saiu daqui ainda;
 *   2. `reservarUploadAction` autoriza pela INTENÇÃO, reserva o teto
 *      físico de quota e devolve uma signed upload URL;
 *   3. o browser dá `PUT` nessa URL;
 *   4. `finalizar*Action` VALIDA o objeto de verdade (decodifica e
 *      reencoda no servidor) e, na MESMA transação do banco, promove o
 *      arquivo e cria o uso.
 *
 * Nunca existe arquivo pronto sem dono, e nunca existe uso apontando
 * para arquivo não validado.
 *
 * Como em `sceneActions.ts`, todo ponto de entrada revalida o acesso à
 * campanha antes de qualquer coisa — a RLS e as RPCs são a garantia
 * forte; isto aqui é a garantia de UX (erro cedo, em português).
 */

import "server-only";
import { getScopedTableClient } from "../../../../../lib/auth/scopedClient";
import { resolveCampaignAccess } from "../../../../../lib/campaign/access";
import { getCurrentUser } from "../../../../../lib/auth/session";
import {
  ImagemIndisponivelError,
  assinarDownloadUrls,
  assinarUploadUrl,
  validarEReencodar,
} from "../../../../../lib/vtt/imageService";

export interface ResultadoAcao<T = undefined> {
  ok: boolean;
  erro?: string;
  dados?: T;
}

async function exigirAcesso(campaignId: string) {
  const acesso = await resolveCampaignAccess(campaignId);
  if (acesso.kind !== "ok") {
    return { erro: acesso.kind === "no_session" ? "Sessão expirada." : "Você não tem acesso a esta campanha." };
  }
  return { acesso };
}

/** Erro de RPC vira mensagem legível; erro de configuração vira uma frase que diz o que fazer. */
function mensagemDeErro(e: unknown, padrao: string): string {
  if (e instanceof ImagemIndisponivelError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return padrao;
}

export type IntencaoUpload = "fundo" | "tile" | "retrato";

export interface ReservaUpload {
  /** `true` quando o conteúdo já existia nesta campanha: não há o que enviar. */
  reutilizado: boolean;
  assetId: string;
  reservaId: string | null;
  uploadUrl: string | null;
  widthPx: number | null;
  heightPx: number | null;
}

/**
 * Passo 2. A autorização mora na RPC (`reservar_upload_vtt_imagem`),
 * que decide pela intenção: fundo e tile exigem narrador; retrato exige
 * controle sobre AQUELE token. O escopo nunca vem do cliente como
 * afirmação — ele é gravado na reserva e revalidado no finalize.
 */
export async function reservarUploadAction(
  campaignId: string,
  sha256: string,
  intencao: IntencaoUpload,
  tokenId: string | null = null,
): Promise<ResultadoAcao<ReservaUpload>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  try {
    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("reservar_upload_vtt_imagem", {
      p_campaign_id: campaignId,
      p_sha256: sha256,
      p_intencao: intencao,
      p_token_id: tokenId,
    });
    if (error || !data) return { ok: false, erro: error?.message ?? "Não foi possível preparar o envio." };

    const bruto = data as {
      reutilizado: boolean; asset_id: string; reserva_id: string | null;
      storage_path: string; width_px: number | null; height_px: number | null;
    };

    // Conteúdo repetido não sobe de novo — e, sem upload, não há URL
    // para assinar.
    if (bruto.reutilizado) {
      return {
        ok: true,
        dados: {
          reutilizado: true, assetId: bruto.asset_id, reservaId: null, uploadUrl: null,
          widthPx: bruto.width_px, heightPx: bruto.height_px,
        },
      };
    }

    // O caminho vem do BANCO (`vtt_imagem_storage_path`), nunca do
    // browser: um caminho enviado por fora apontaria para a pasta de
    // outra campanha.
    const { url } = await assinarUploadUrl(bruto.storage_path);
    return {
      ok: true,
      dados: {
        reutilizado: false, assetId: bruto.asset_id, reservaId: bruto.reserva_id,
        uploadUrl: url, widthPx: null, heightPx: null,
      },
    };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Não foi possível preparar o envio.") };
  }
}

/** Desistir depois do `PUT`: devolve a quota e marca o objeto para coleta. */
export async function cancelarUploadAction(
  campaignId: string,
  reservaId: string,
): Promise<ResultadoAcao> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  try {
    const client = await getScopedTableClient();
    const { error } = await client.rpc("cancelar_upload_vtt_imagem", { p_reserva_id: reservaId });
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Não foi possível cancelar o envio.") };
  }
}

export interface ColocacaoImagem {
  sceneId: string;
  papel: "fundo" | "tile";
  centroQ: number;
  centroR: number;
  larguraM: number;
  alturaM?: number | null;
  rotacaoGraus?: number;
  opacidade?: number;
  camada?: "abaixo_grade" | "acima_grade";
}

/**
 * Passo 4, caminho da cena. A validação server-side acontece ANTES da
 * RPC porque é ela que produz os números que a RPC vai gravar: tamanho
 * e dimensões REAIS, medidos decodificando o objeto. O que o cliente
 * declarou não chega ao banco.
 */
export async function finalizarUploadCenaAction(
  campaignId: string,
  reservaId: string,
  storagePathSha: string,
  colocacao: ColocacaoImagem,
): Promise<ResultadoAcao<unknown>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  try {
    const medida = await validarEReencodar(`${campaignId}/${storagePathSha}.webp`);
    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("finalizar_upload_e_criar_imagem_cena", {
      p_reserva_id: reservaId,
      p_bytes_reais: medida.bytes,
      p_width_px: medida.widthPx,
      p_height_px: medida.heightPx,
      p_scene_id: colocacao.sceneId,
      p_papel: colocacao.papel,
      p_centro_q: colocacao.centroQ,
      p_centro_r: colocacao.centroR,
      p_largura_m: colocacao.larguraM,
      p_altura_m: colocacao.alturaM ?? null,
      p_rotacao_graus: colocacao.rotacaoGraus ?? 0,
      p_opacidade: colocacao.opacidade ?? 1,
      p_camada: colocacao.camada ?? "abaixo_grade",
    });
    if (error) return { ok: false, erro: error.message };
    return { ok: true, dados: data };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Não foi possível concluir o envio.") };
  }
}

/** Passo 4, caminho do retrato. Mesmo rigor, alvo diferente. */
export async function finalizarUploadRetratoAction(
  campaignId: string,
  reservaId: string,
  storagePathSha: string,
  tokenId: string,
  expectedRevision: number,
): Promise<ResultadoAcao<unknown>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  try {
    const medida = await validarEReencodar(`${campaignId}/${storagePathSha}.webp`);
    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("finalizar_upload_e_definir_retrato", {
      p_reserva_id: reservaId,
      p_bytes_reais: medida.bytes,
      p_width_px: medida.widthPx,
      p_height_px: medida.heightPx,
      p_token_id: tokenId,
      p_expected_revision: expectedRevision,
    });
    if (error) return { ok: false, erro: error.message };
    return { ok: true, dados: data };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Não foi possível concluir o envio.") };
  }
}

/** Retrato vindo de arquivo já existente na campanha (reuso da biblioteca). */
export async function definirRetratoImagemAction(
  campaignId: string,
  tokenId: string,
  imageId: string | null,
  expectedRevision: number,
): Promise<ResultadoAcao<unknown>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("set_vtt_token_portrait_image", {
    p_token_id: tokenId, p_image_id: imageId, p_expected_revision: expectedRevision,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true, dados: data };
}

/**
 * Aba "Endereço" do editor de retrato. Existe como ação separada porque
 * `edit_vtt_token` é narrador-only e este caminho precisa estar
 * disponível a quem controla o token.
 */
export async function definirRetratoUrlAction(
  campaignId: string,
  tokenId: string,
  url: string | null,
  expectedRevision: number,
): Promise<ResultadoAcao<unknown>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("set_vtt_token_portrait_url", {
    p_token_id: tokenId, p_url: url, p_expected_revision: expectedRevision,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true, dados: data };
}

/**
 * Assina em LOTE, resolvendo a autorização id por id (a RPC
 * `vtt_asset_assinavel_para` considera visibilidade da colocação E da
 * camada da cena). Id não autorizado some da resposta em silêncio: um
 * erro distinguiria "não pode" de "não existe", e isso já é informação.
 *
 * O TTL é curto (5 min) porque uma URL já emitida sobrevive a esconder
 * a imagem — a 0100 chama isso de consistência eventual de privacidade.
 * Quem chama renova antes de vencer.
 */
export async function assinarImagensAction(
  campaignId: string,
  assetIds: string[],
): Promise<ResultadoAcao<Record<string, string>>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  const usuario = await getCurrentUser();
  if (!usuario) return { ok: false, erro: "Sessão expirada." };

  try {
    const mapa = await assinarDownloadUrls(assetIds, usuario.id);
    return { ok: true, dados: Object.fromEntries(mapa) };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Não foi possível carregar as imagens.") };
  }
}

/** Biblioteca da campanha — narrador. A RPC recusa quem não for. */
export async function lerBibliotecaImagensAction(
  campaignId: string,
): Promise<ResultadoAcao<unknown>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("read_vtt_campaign_images", { p_campaign_id: campaignId });
  if (error) return { ok: false, erro: error.message };
  return { ok: true, dados: data };
}

// ── Colocações já existentes: ler, ajustar, mover, remover ──────────
// Todas narrador-only no banco (`vtt_exigir_narrador_da_cena`) e todas
// com `revision` otimista, a convenção das RPCs de token: quem escreve
// manda a revisão que leu, e a escrita só passa se ainda for a corrente.

export async function lerImagensCenaAction(
  campaignId: string,
  sceneId: string,
): Promise<ResultadoAcao<unknown>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("read_vtt_scene_images", { p_scene_id: sceneId });
  if (error) return { ok: false, erro: error.message };
  return { ok: true, dados: data };
}

/** Colocar um arquivo que já está na biblioteca — sem upload nenhum. */
export async function criarImagemCenaAction(
  campaignId: string,
  imageId: string,
  colocacao: ColocacaoImagem,
): Promise<ResultadoAcao<unknown>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("criar_vtt_scene_image", {
    p_scene_id: colocacao.sceneId,
    p_image_id: imageId,
    p_papel: colocacao.papel,
    p_centro_q: colocacao.centroQ,
    p_centro_r: colocacao.centroR,
    p_largura_m: colocacao.larguraM,
    p_altura_m: colocacao.alturaM ?? null,
    p_rotacao_graus: colocacao.rotacaoGraus ?? 0,
    p_opacidade: colocacao.opacidade ?? 1,
    p_camada: colocacao.camada ?? "abaixo_grade",
    p_reserva_id: null,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true, dados: data };
}

export interface AjusteImagemCena {
  larguraM?: number | null;
  alturaM?: number | null;
  rotacaoGraus?: number | null;
  opacidade?: number | null;
  camada?: "abaixo_grade" | "acima_grade" | null;
  z?: number | null;
  visivel?: boolean | null;
  travado?: boolean | null;
  /**
   * Volta a altura para a proporção do arquivo. Existe como flag porque
   * `null` em `alturaM` é indistinguível de "não mexer neste campo".
   */
  limparAltura?: boolean;
}

export async function atualizarImagemCenaAction(
  campaignId: string,
  id: string,
  expectedRevision: number,
  ajuste: AjusteImagemCena,
): Promise<ResultadoAcao<unknown>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("atualizar_vtt_scene_image", {
    p_id: id,
    p_expected_revision: expectedRevision,
    p_largura_m: ajuste.larguraM ?? null,
    p_altura_m: ajuste.alturaM ?? null,
    p_rotacao_graus: ajuste.rotacaoGraus ?? null,
    p_opacidade: ajuste.opacidade ?? null,
    p_camada: ajuste.camada ?? null,
    p_z: ajuste.z ?? null,
    p_visivel: ajuste.visivel ?? null,
    p_travado: ajuste.travado ?? null,
    p_limpar_altura: ajuste.limparAltura ?? false,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true, dados: data };
}

export async function moverImagemCenaAction(
  campaignId: string,
  id: string,
  centroQ: number,
  centroR: number,
  expectedRevision: number,
): Promise<ResultadoAcao<unknown>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("mover_vtt_scene_image", {
    p_id: id, p_centro_q: centroQ, p_centro_r: centroR, p_expected_revision: expectedRevision,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true, dados: data };
}

/**
 * Remove a COLOCAÇÃO. O arquivo continua: outro uso pode apontar para
 * ele, e quem decide se ele vai embora é a coleta, por ausência de uso.
 */
export async function removerImagemCenaAction(
  campaignId: string,
  id: string,
  expectedRevision: number,
): Promise<ResultadoAcao> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  const client = await getScopedTableClient();
  const { error } = await client.rpc("excluir_vtt_scene_image", {
    p_id: id, p_expected_revision: expectedRevision,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}
