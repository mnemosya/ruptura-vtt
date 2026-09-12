import "server-only";

/**
 * Serviço de imagens do VTT — a parte que precisa de service role.
 *
 * Três responsabilidades, e nada além:
 *   1. emitir a signed upload URL de uma reserva já autorizada;
 *   2. VALIDAR DE VERDADE o que chegou no bucket, antes de o arquivo
 *      virar `ready`;
 *   3. assinar downloads e recolher lixo.
 *
 * ── POR QUE A VALIDAÇÃO NÃO PODE SER "OLHAR O METADADO" ─────────────
 * `storage.objects.size` e `metadata.mimetype` são consequência da
 * requisição que o BROWSER fez. Um cliente adulterado envia bytes
 * arbitrários com `Content-Type: image/webp` e o metadado concorda com
 * ele. Largura e altura declaradas são igualmente baratas de mentir.
 *
 * Então o servidor baixa o objeto e decodifica: `sharp().metadata()`
 * confirma que é WebP de verdade (assinatura RIFF/WEBP e decode que não
 * explode), e as dimensões que vão para o banco são as MEDIDAS, nunca
 * as declaradas. Em seguida REENCODA e regrava — é a garantia forte
 * (nada do arquivo original sobrevive) e, de quebra, normaliza o que
 * veio de browsers diferentes, que não produzem WebP byte-idêntico.
 *
 * Só depois disso a RPC de finalização promove o asset — e ela cria o
 * USO na mesma transação, para não existir arquivo pronto sem dono.
 */

import sharp from "sharp";
import { type SupabaseClient } from "@supabase/supabase-js";
import { getAdminSupabaseClient } from "../supabase/adminClient";
import { BUCKET_IMAGENS_VTT, type ResultadoColeta, coletarLixoCom } from "./imageGc";

export type { ResultadoColeta };

/** Lado máximo aceito — o mesmo `vtt_imagem_lado_max_px()` da 0099. */
export const LADO_MAXIMO_PX = 4096;
/** Teto físico por arquivo — o mesmo `vtt_imagem_bytes_max()` da 0099. */
export const BYTES_MAXIMO = 10 * 1024 * 1024;
/**
 * TTL da URL de download. Curto de propósito: uma URL já emitida
 * continua válida até expirar, mesmo que a colocação seja escondida no
 * instante seguinte (a 0100 chama isso de consistência eventual de
 * privacidade). Cinco minutos é o tamanho dessa janela.
 */
export const TTL_DOWNLOAD_SEGUNDOS = 300;
/** Vida da capability de upload. Curta pelo mesmo motivo. */
export const TTL_UPLOAD_SEGUNDOS = 600;

export class ImagemIndisponivelError extends Error {
  constructor() {
    super(
      "Upload de imagens indisponível: falta SUPABASE_SERVICE_ROLE_KEY neste ambiente.",
    );
    this.name = "ImagemIndisponivelError";
  }
}

function admin(): SupabaseClient {
  const client = getAdminSupabaseClient();
  if (!client) throw new ImagemIndisponivelError();
  return client;
}

export interface MedidaImagem {
  bytes: number;
  widthPx: number;
  heightPx: number;
}

/**
 * Emite a capability de upload para um caminho que o BANCO derivou
 * (`vtt_imagem_storage_path`) — nunca um caminho vindo do browser, que
 * poderia apontar para a pasta de outra campanha.
 *
 * `upsert: false`: uma reserva, um objeto. Com upsert, um segundo
 * envio sobrescreveria conteúdo já validado pelo mesmo caminho.
 */
export async function assinarUploadUrl(storagePath: string): Promise<{ url: string; token: string }> {
  const { data, error } = await admin()
    .storage.from(BUCKET_IMAGENS_VTT)
    .createSignedUploadUrl(storagePath, { upsert: false });
  if (error || !data) {
    throw new Error(`Não foi possível preparar o envio: ${error?.message ?? "resposta vazia"}`);
  }
  return { url: data.signedUrl, token: data.token };
}

/**
 * Baixa, decodifica, confere e REGRAVA normalizado. Devolve as medidas
 * REAIS, que são as que a RPC de finalização vai gravar.
 *
 * Lança com mensagem em português em qualquer divergência — este é o
 * ponto onde "bytes arbitrários com Content-Type mentiroso" morre.
 */
export async function validarEReencodar(storagePath: string): Promise<MedidaImagem> {
  const client = admin();

  const baixado = await client.storage.from(BUCKET_IMAGENS_VTT).download(storagePath);
  if (baixado.error || !baixado.data) {
    throw new Error("O arquivo enviado não chegou ao servidor. Tente de novo.");
  }

  const original = Buffer.from(await baixado.data.arrayBuffer());
  if (original.byteLength === 0 || original.byteLength > BYTES_MAXIMO) {
    throw new Error("Arquivo fora do tamanho permitido.");
  }

  // Assinatura de contêiner conferida ANTES do decode: "RIFF" nos
  // bytes 0-3 e "WEBP" nos bytes 8-11. Barato, e recusa lixo sem
  // entregá-lo ao decodificador.
  const ehRiffWebp =
    original.length > 12 &&
    original.toString("ascii", 0, 4) === "RIFF" &&
    original.toString("ascii", 8, 12) === "WEBP";
  if (!ehRiffWebp) {
    throw new Error("O arquivo enviado não é uma imagem WebP.");
  }

  let metadados;
  try {
    metadados = await sharp(original).metadata();
  } catch {
    throw new Error("Não foi possível ler a imagem enviada.");
  }

  const { format, width, height } = metadados;
  if (format !== "webp" || !width || !height) {
    throw new Error("O arquivo enviado não é uma imagem WebP válida.");
  }
  if (width > LADO_MAXIMO_PX || height > LADO_MAXIMO_PX) {
    throw new Error(`Imagem acima de ${LADO_MAXIMO_PX} px em um dos lados.`);
  }

  // Reencode: o que fica guardado é sempre produto do NOSSO pipeline.
  // `rotate()` sem argumento aplica a orientação EXIF e a descarta, em
  // vez de deixar um retrato deitado para o `<image>` do SVG resolver.
  const normalizado = await sharp(original).rotate().webp({ quality: 82 }).toBuffer();
  if (normalizado.byteLength > BYTES_MAXIMO) {
    throw new Error("Arquivo fora do tamanho permitido.");
  }
  const medidoDepois = await sharp(normalizado).metadata();
  if (!medidoDepois.width || !medidoDepois.height) {
    throw new Error("Não foi possível ler a imagem enviada.");
  }

  const regravado = await client.storage
    .from(BUCKET_IMAGENS_VTT)
    .upload(storagePath, normalizado, { contentType: "image/webp", upsert: true });
  if (regravado.error) {
    throw new Error("Não foi possível guardar a imagem. Tente de novo.");
  }

  return {
    bytes: normalizado.byteLength,
    widthPx: medidoDepois.width,
    heightPx: medidoDepois.height,
  };
}

/**
 * Assina downloads resolvendo a autorização **id por id**. Um id que o
 * usuário não pode ver simplesmente não aparece na resposta — não vira
 * erro, porque um erro distinguiria "não pode" de "não existe" e isso
 * já é informação.
 */
export async function assinarDownloadUrls(
  assetIds: string[],
  userId: string,
): Promise<Map<string, string>> {
  const resultado = new Map<string, string>();
  const unicos = Array.from(new Set(assetIds.filter(Boolean)));
  if (unicos.length === 0) return resultado;

  const client = admin();

  const autorizados: { id: string; path: string }[] = [];
  for (const id of unicos) {
    const { data: podeVer, error } = await client.rpc("vtt_asset_assinavel_para", {
      p_asset_id: id,
      p_user_id: userId,
    });
    if (error || podeVer !== true) continue;

    const { data: linha, error: erroLinha } = await client
      .from("vtt_image_assets")
      .select("storage_path")
      .eq("id", id)
      .single();
    if (erroLinha || !linha) continue;
    autorizados.push({ id, path: linha.storage_path as string });
  }
  if (autorizados.length === 0) return resultado;

  const { data, error } = await client.storage
    .from(BUCKET_IMAGENS_VTT)
    .createSignedUrls(autorizados.map((a) => a.path), TTL_DOWNLOAD_SEGUNDOS);
  if (error || !data) return resultado;

  for (const assinada of data) {
    if (!assinada.signedUrl || assinada.error) continue;
    // `createSignedUrls` devolve na mesma ordem dos caminhos pedidos,
    // mas casar por caminho é mais seguro que confiar em índice.
    const alvo = autorizados.find((a) => assinada.path === a.path);
    if (alvo) resultado.set(alvo.id, assinada.signedUrl);
  }
  return resultado;
}

/**
 * Passada de coleta. A implementação mora em `imageGc.ts`, sem
 * `server-only`, para o script agendável poder chamar a MESMA lógica —
 * duas cópias da regra de limpeza divergiriam no primeiro ajuste.
 */
export async function coletarLixo(carenciaHoras = 1): Promise<ResultadoColeta> {
  return coletarLixoCom(admin(), carenciaHoras);
}
