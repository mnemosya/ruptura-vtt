"use client";

/**
 * Preparo da imagem no BROWSER, antes de qualquer escrita.
 *
 * A ordem aqui é a coisa mais importante do módulo:
 *
 *   decodificar → redimensionar → WebP → preview local → (só então) subir
 *
 * O preview sai de `URL.createObjectURL(blob)`, com o arquivo ainda em
 * memória. É o que torna verdadeira a promessa de que cancelar o ajuste
 * não deixa resíduo: se nada foi enviado, não há reserva para expirar,
 * objeto para coletar nem quota para devolver. Subir primeiro e
 * perguntar o destino depois transformaria todo "Esc" em trabalho de
 * limpeza.
 *
 * O downscale também não é economia à toa: mapas de VTT chegam com 8000
 * px de lado e 12 MB, e o teto de 4096 px derruba isso para a casa de
 * 1,5 MB sem diferença visível no zoom que a mesa usa. Reencodar
 * descarta EXIF de brinde.
 *
 * ── SOBRE O SHA-256 ─────────────────────────────────────────────────
 * O hash é do BLOB FINAL desta execução, não do arquivo original.
 * `canvas.toBlob('image/webp')` não produz bytes idênticos em Chrome,
 * Safari e Firefox, então o mesmo mapa preparado em dois browsers gera
 * dois hashes. A deduplicação, portanto, é best-effort: economiza quota
 * no caso comum (mesma pessoa, mesmo browser, arquivo repetido) e não
 * promete mais que isso.
 */

import { LADO_MAXIMO_PX, dimensoesAposDownscale } from "../../app/mesas/[campaignId]/vtt/_dominio/imagemCena";

/** O que o pipeline aceita RECEBER. WebP também entra: mesmo assim é reencodado. */
export const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp"] as const;

/**
 * Teto do arquivo ORIGINAL. Vale antes de decodificar: um arquivo
 * gigante não deve nem chegar ao `<canvas>`.
 */
export const BYTES_ORIGINAL_MAXIMO = 30 * 1024 * 1024;
/** Teto do resultado — o mesmo `vtt_imagem_bytes_max()` da 0099. */
export const BYTES_MAXIMO = 10 * 1024 * 1024;
/** Teto do retrato — o mesmo `vtt_imagem_bytes_max_retrato()` da 0099. */
export const BYTES_MAXIMO_RETRATO = 2 * 1024 * 1024;

export interface ImagemPreparada {
  blob: Blob;
  sha256: string;
  widthPx: number;
  heightPx: number;
  /** URL local do preview. Quem recebe é dono do `revokeObjectURL`. */
  previewUrl: string;
}

export class ImagemRecusadaError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ImagemRecusadaError";
  }
}

/**
 * Recusa antes de gastar trabalho. As mensagens dizem o MOTIVO porque
 * "formato não suportado" manda a pessoa adivinhar.
 */
export function validarArquivo(arquivo: File): void {
  if (arquivo.type === "image/svg+xml") {
    throw new ImagemRecusadaError(
      "SVG não é aceito: é um formato ativo, que carrega script junto com o desenho. Exporte como PNG ou WebP.",
    );
  }
  if (arquivo.type === "image/gif") {
    throw new ImagemRecusadaError(
      "GIF não é aceito: a imagem é reconvertida para WebP e a animação seria achatada no primeiro quadro.",
    );
  }
  if (!(TIPOS_ACEITOS as readonly string[]).includes(arquivo.type)) {
    throw new ImagemRecusadaError("Só PNG, JPEG e WebP são aceitos.");
  }
  if (arquivo.size > BYTES_ORIGINAL_MAXIMO) {
    throw new ImagemRecusadaError("Arquivo grande demais (máximo 30 MB antes da conversão).");
  }
}

async function decodificar(arquivo: File): Promise<ImageBitmap> {
  try {
    // `createImageBitmap` já aplica a orientação EXIF quando pedimos —
    // sem isto, retrato tirado de celular entra deitado.
    return await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  } catch {
    throw new ImagemRecusadaError("Não foi possível ler esta imagem.");
  }
}

function paraBlobWebp(canvas: HTMLCanvasElement, qualidade: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImagemRecusadaError("Não foi possível converter a imagem."))),
      "image/webp",
      qualidade,
    );
  });
}

async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Decodifica, reduz ao teto, converte para WebP e devolve com preview.
 * `bytesMaximo` fica menor no caso do retrato — 2 MB, o mesmo número
 * que a 0099 cobra do lado do servidor.
 */
export async function prepararImagem(
  arquivo: File,
  bytesMaximo = BYTES_MAXIMO,
): Promise<ImagemPreparada> {
  validarArquivo(arquivo);

  const bitmap = await decodificar(arquivo);
  const { largura, altura } = dimensoesAposDownscale(bitmap.width, bitmap.height, LADO_MAXIMO_PX);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new ImagemRecusadaError("Não foi possível processar a imagem neste navegador.");
  }
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  // Uma segunda passada com qualidade menor só quando a primeira
  // estourou o teto: reduzir sempre custaria nitidez em toda imagem
  // para resolver o caso de algumas.
  let blob = await paraBlobWebp(canvas, 0.82);
  if (blob.size > bytesMaximo) blob = await paraBlobWebp(canvas, 0.6);
  if (blob.size > bytesMaximo) {
    const mb = (bytesMaximo / (1024 * 1024)).toFixed(0);
    throw new ImagemRecusadaError(`A imagem continua acima de ${mb} MB depois da conversão.`);
  }

  return {
    blob,
    sha256: await sha256Hex(blob),
    widthPx: largura,
    heightPx: altura,
    previewUrl: URL.createObjectURL(blob),
  };
}

/**
 * `PUT` direto na signed upload URL. O browser nunca usa credencial
 * própria: a URL é uma capability que o servidor emitiu depois de
 * autorizar e reservar quota.
 */
export async function enviarParaUrlAssinada(url: string, blob: Blob): Promise<void> {
  const resposta = await fetch(url, {
    method: "PUT",
    body: blob,
    headers: { "content-type": "image/webp" },
  });
  if (!resposta.ok) {
    throw new Error("O envio da imagem falhou. Tente de novo.");
  }
}
