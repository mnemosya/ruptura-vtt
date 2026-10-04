/**
 * Sincronização Notion → Compêndio (Fase 1 do PLANO_COMPENDIO_NOTION).
 *
 * 1. Lê o índice da página raiz (seções e capítulos).
 * 2. Para cada capítulo cujo `last_edited_time` mudou desde a última
 *    sincronização, lê os blocos e converte.
 * 3. Copia as imagens para o bucket `compendio` (chave estável pelo
 *    caminho do arquivo no Notion; não baixa de novo o que já existe) e
 *    troca o link assinado do Notion, que expira, pelo link público.
 * 4. Grava em `content_documents` (`capitulo`) só o que mudou de fato
 *    (`payload_hash`), com registro em `content_changelog`.
 *
 * Capítulo que sumiu do índice é arquivado (`status = archived`), nunca apagado.
 * Uma falha num capítulo não impede os outros.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { converterBlocos, separarNumero, type BlocoNotion } from "./converter";
import { lerIndice } from "./indice";
import { PAGINA_RAIZ_RUPTURA_V12, type ClienteNotion } from "./notion";
import type { BlocoCompendio, CapituloCompendio } from "./tipos";
import { avaliarRevisoes, lerFontesRevisao, type EstadoPaginaLivro, type PendenciaRevisao } from "./revisao";

export const BUCKET_COMPENDIO = "compendio";
/** Até onde o livro desce em páginas dentro de páginas (capítulo → subpágina → … ). */
export const PROFUNDIDADE_MAXIMA_SUBPAGINAS = 3;
const ARQUIVO_AJUSTES = join("content", "v12", "compendio_ajustes.json");

/** Ajustes por página (content/v12/compendio_ajustes.json). */
interface AjustePagina {
  capa?: { arquivo?: string; subirImagem?: number; posicao?: string };
  desdobrarVerbetes?: string[];
}

function normalizarTitulo(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

/**
 * Verbetes com estes títulos viram títulos comuns, com o conteúdo à mostra logo abaixo
 * (ex.: Sobrecarga e Ruptura no cap. 17). Devolve as âncoras desdobradas.
 */
function desdobrarVerbetes(blocos: BlocoCompendio[], titulos: string[]): Set<string> {
  const alvo = new Set(titulos.map(normalizarTitulo));
  const desdobradas = new Set<string>();
  const andar = (lista: BlocoCompendio[]) => {
    for (let i = 0; i < lista.length; i++) {
      const b = lista[i];
      if (b.tipo === "verbete" && alvo.has(normalizarTitulo(b.titulo.map((t) => t.texto).join("")))) {
        desdobradas.add(b.ancora);
        andar(b.filhos);
        lista.splice(i, 1, { tipo: "titulo", nivel: 3, texto: b.titulo.map((t) => ({ ...t, negrito: undefined })), ancora: b.ancora }, ...b.filhos);
        i += b.filhos.length;
        continue;
      }
      if ("filhos" in b) andar(b.filhos);
    }
  };
  andar(blocos);
  return desdobradas;
}

/** Tira do corpo a N-ésima imagem (contando em toda a página) e a devolve. */
function tirarImagem(blocos: BlocoCompendio[], n: number): Extract<BlocoCompendio, { tipo: "imagem" }> | null {
  let contador = 0;
  const andar = (lista: BlocoCompendio[]): Extract<BlocoCompendio, { tipo: "imagem" }> | null => {
    for (let i = 0; i < lista.length; i++) {
      const b = lista[i];
      if (b.tipo === "imagem" && ++contador === n) {
        lista.splice(i, 1);
        return b;
      }
      const filhos = "filhos" in b ? b.filhos : null;
      const achada = filhos ? andar(filhos) : b.tipo === "lista" ? b.itens.map((it) => andar(it.filhos)).find(Boolean) ?? null : null;
      if (achada) return achada;
    }
    return null;
  };
  return andar(blocos);
}
export const PACK_COMPENDIO = "notion-ruptura-v1-2";

export interface RelatorioSincronizacao {
  criados: string[];
  atualizados: string[];
  inalterados: string[];
  arquivados: string[];
  falhas: { capitulo: string; erro: string }[];
  naoSuportados: Record<string, string[]>;
  imagensCopiadas: number;
  /** Peso das imagens copiadas nesta rodada, antes e depois da otimização. */
  bytesOriginais: number;
  bytesGravados: number;
  imagensOrfasRemovidas: number;
  requisicoesNotion: number;
}

interface OpcoesSincronizacao {
  notion: ClienteNotion;
  supabase: SupabaseClient;
  /** Só mostra o que mudaria: não grava documento nem imagem. */
  seco?: boolean;
  /** Relê todos os capítulos, mesmo os que não mudaram no Notion. */
  forcar?: boolean;
  /** Relê só estes capítulos (número, ex.: 24), mesmo sem mudança no Notion. */
  forcarCapitulos?: number[];
  log?: (msg: string) => void;
}

function hash(valor: unknown): string {
  return createHash("sha256").update(JSON.stringify(valor)).digest("hex");
}

/** Largura máxima das imagens do livro: a coluna de leitura tem ~880px; 1600 cobre telas de alta densidade. */
export const LARGURA_MAXIMA_IMAGEM = 1600;

/** Formatos que o sincronizador recomprime para WebP. SVG e GIF (pode ser animado) ficam como vieram. */
function ehRecomprimivel(ext: string): boolean {
  return ["png", "jpg", "jpeg", "webp", "avif"].includes(ext);
}

function extensaoDe(url: string): string {
  return (url.split("?")[0].match(/\.(png|jpe?g|gif|webp|svg|avif)$/i)?.[1] ?? "png").toLowerCase();
}

/**
 * Chave estável da imagem: o caminho do arquivo no Notion, sem a assinatura.
 * Imagens recomprimidas ganham sufixo com a largura e extensão .webp — trocar a
 * regra de compressão gera chaves novas, e as antigas viram órfãs (limpas no fim).
 */
export function chaveImagem(url: string): string {
  const semQuery = url.split("?")[0];
  const base = createHash("sha256").update(semQuery).digest("hex").slice(0, 32);
  const ext = extensaoDe(url);
  return ehRecomprimivel(ext) ? `${base}-w${LARGURA_MAXIMA_IMAGEM}.webp` : `${base}.${ext}`;
}

/** Redimensiona (nunca amplia) e converte para WebP. */
export async function otimizarImagem(bytes: ArrayBuffer): Promise<Buffer> {
  return sharp(Buffer.from(bytes))
    .rotate()
    .resize({ width: LARGURA_MAXIMA_IMAGEM, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

/** Primeira imagem de uma página, em qualquer profundidade: a capa do card na galeria. */
function primeiraImagem(blocos: BlocoCompendio[]): string | null {
  for (const b of blocos) {
    if (b.tipo === "imagem") return b.url;
    const filhos = "filhos" in b ? b.filhos : b.tipo === "lista" ? b.itens.flatMap((i) => i.filhos) : [];
    const achada = primeiraImagem(filhos);
    if (achada) return achada;
  }
  return null;
}

/** Percorre os blocos anotando largura e altura de cada imagem. */
function anotarDimensoes(blocos: BlocoCompendio[], dims: Map<string, { largura: number; altura: number }>): void {
  for (const b of blocos) {
    if (b.tipo === "imagem") {
      const d = dims.get(b.url);
      if (d) Object.assign(b, d);
    }
    if ("filhos" in b) anotarDimensoes(b.filhos, dims);
    if (b.tipo === "lista") for (const item of b.itens) anotarDimensoes(item.filhos, dims);
  }
}

/** Percorre os blocos trocando a URL de cada imagem. */
async function trocarImagens(blocos: BlocoCompendio[], trocar: (url: string) => Promise<string>): Promise<void> {
  for (const b of blocos) {
    if (b.tipo === "imagem") b.url = await trocar(b.url);
    if ("filhos" in b) await trocarImagens(b.filhos, trocar);
    if (b.tipo === "lista") for (const item of b.itens) await trocarImagens(item.filhos, trocar);
  }
}

export async function sincronizarCompendio(op: OpcoesSincronizacao): Promise<RelatorioSincronizacao> {
  const { notion, supabase, seco = false, forcar = false, forcarCapitulos = [] } = op;
  const log = op.log ?? (() => {});
  const rel: RelatorioSincronizacao = {
    criados: [], atualizados: [], inalterados: [], arquivados: [], falhas: [], naoSuportados: {}, imagensCopiadas: 0, bytesOriginais: 0, bytesGravados: 0, imagensOrfasRemovidas: 0, requisicoesNotion: 0,
  };

  const ajustes = (JSON.parse(readFileSync(join(process.cwd(), ARQUIVO_AJUSTES), "utf8")) as { paginas: Record<string, AjustePagina> }).paginas;
  const indice = lerIndice(await notion.blocos(PAGINA_RAIZ_RUPTURA_V12));
  log(`Índice: ${indice.length} capítulos.`);

  const { data: existentes, error: erroLeitura } = await supabase
    .from("content_documents")
    .select("id, slug, status, payload, payload_hash")
    .eq("content_type", "capitulo")
    .eq("source_pack_id", PACK_COMPENDIO);
  if (erroLeitura) throw new Error(`Falha ao ler capítulos: ${erroLeitura.message}`);
  const porId = new Map((existentes ?? []).map((d) => [d.id as string, d]));

  if (!seco) {
    const { error } = await supabase.from("content_packs").upsert(
      { id: PACK_COMPENDIO, name: "RUPTURA v1.2 — livro (Notion)", version: "1.2", status: "published", manifest: { origem: "notion", raiz: PAGINA_RAIZ_RUPTURA_V12 } },
      { onConflict: "id" },
    );
    if (error) throw new Error(`Falha ao registrar o pacote: ${error.message}`);
  }

  /** Largura e altura de cada imagem já no bucket (pelo link público): o herói usa a proporção. */
  const dimensoes = new Map<string, { largura: number; altura: number }>();
  async function medir(publica: string, bytes?: Buffer): Promise<void> {
    if (dimensoes.has(publica) || publica.endsWith(".svg")) return;
    try {
      const corpo = bytes ?? Buffer.from(await (await fetch(publica)).arrayBuffer());
      const m = await sharp(corpo).metadata();
      if (m.width && m.height) dimensoes.set(publica, { largura: m.width, altura: m.height });
    } catch {
      // sem medida: a imagem só não concorre a capa
    }
  }

  async function copiarImagem(url: string): Promise<string> {
    const caminho = chaveImagem(url);
    const publica = supabase.storage.from(BUCKET_COMPENDIO).getPublicUrl(caminho).data.publicUrl;
    if (seco) return publica;
    const { data: jaExiste } = await supabase.storage.from(BUCKET_COMPENDIO).list("", { search: caminho, limit: 1 });
    if (jaExiste?.some((f) => f.name === caminho)) {
      await medir(publica);
      return publica;
    }
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`imagem ${resp.status}`);
    const original = await resp.arrayBuffer();
    const otimizar = caminho.endsWith(".webp");
    const corpo = otimizar ? await otimizarImagem(original) : Buffer.from(original);
    const tipo = otimizar ? "image/webp" : resp.headers.get("content-type") ?? "image/png";
    rel.bytesOriginais += original.byteLength;
    rel.bytesGravados += corpo.byteLength;
    const { error } = await supabase.storage.from(BUCKET_COMPENDIO).upload(caminho, corpo, { contentType: tipo, upsert: true });
    if (error) throw new Error(`upload da imagem: ${error.message}`);
    rel.imagensCopiadas++;
    await medir(publica, corpo);
    return publica;
  }

  /** Capa escolhida à mão (capa.arquivo em content/v12/compendio_ajustes.json): sobe o arquivo do repositório já otimizado. */
  async function capaManual(pageId: string): Promise<CapituloCompendio["capa"]> {
    const arquivo = ajustes[pageId]?.capa?.arquivo;
    if (!arquivo) return null;
    const original = readFileSync(join(process.cwd(), arquivo));
    const corpo = await otimizarImagem(original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength) as ArrayBuffer);
    const caminho = `capa-${createHash("sha256").update(corpo).digest("hex").slice(0, 32)}.webp`;
    const publica = supabase.storage.from(BUCKET_COMPENDIO).getPublicUrl(caminho).data.publicUrl;
    if (!seco) {
      const { error } = await supabase.storage.from(BUCKET_COMPENDIO).upload(caminho, corpo, { contentType: "image/webp", upsert: true });
      if (error) throw new Error(`upload da capa: ${error.message}`);
    }
    const m = await sharp(corpo).metadata();
    return { url: publica, largura: m.width ?? 0, altura: m.height ?? 0 };
  }

  function aplicarDesdobrar(pageId: string, conv: ReturnType<typeof converterBlocos>): void {
    const titulos = ajustes[pageId]?.desdobrarVerbetes;
    if (!titulos?.length) return;
    const desdobradas = desdobrarVerbetes(conv.blocos, titulos);
    conv.verbetes = conv.verbetes.filter((v) => !desdobradas.has(v.ancora));
  }

  /** Capa da página: a escolhida à mão; senão a primeira imagem, qualquer que seja a proporção (sai do corpo). */
  async function definirCapa(pageId: string, blocos: BlocoCompendio[]): Promise<CapituloCompendio["capa"]> {
    const capa = await escolherCapa(pageId, blocos);
    // Enquadramento (object-position) escolhido à mão, ex.: "18% 60%" puxa a imagem para a direita.
    const posicao = ajustes[pageId]?.capa?.posicao;
    return capa && posicao ? { ...capa, posicao } : capa;
  }

  async function escolherCapa(pageId: string, blocos: BlocoCompendio[]): Promise<CapituloCompendio["capa"]> {
    const manual = await capaManual(pageId);
    if (manual) return manual;
    const n = ajustes[pageId]?.capa?.subirImagem;
    if (n) {
      const img = tirarImagem(blocos, n);
      return img?.largura && img.altura ? { url: img.url, largura: img.largura, altura: img.altura } : null;
    }
    const i = blocos.findIndex((b) => b.tipo !== "divisor");
    const primeiro = blocos[i];
    if (!primeiro || primeiro.tipo !== "imagem" || !primeiro.largura || !primeiro.altura) return null;
    blocos.splice(i, 1);
    return { url: primeiro.url, largura: primeiro.largura, altura: primeiro.altura };
  }

  const vistos = new Set<string>();

  /** Grava um documento se mudou. Devolve "criado", "atualizado" ou "inalterado". */
  async function gravar(payload: CapituloCompendio, nome: string): Promise<"criado" | "atualizado" | "inalterado"> {
    const id = `capitulo:${payload.notionPageId}`;
    const anterior = porId.get(id);
    // O hash ignora as datas de edição: tocar a página sem mudar o texto não republica.
    const { notionEditadoEm: _data, subpaginas: _subs, ...semData } = payload;
    const payloadHash = hash(semData);
    if (anterior && anterior.payload_hash === payloadHash && anterior.status === "published") {
      // Só as datas mudaram: guarda em silêncio para a próxima rodada pular a leitura.
      if (!seco) await supabase.from("content_documents").update({ payload }).eq("id", id);
      return "inalterado";
    }
    if (!seco) {
      const { error } = await supabase.from("content_documents").upsert({
        id, content_type: "capitulo", slug: payload.notionPageId, nome,
        categoria: payload.secao, subtipo: payload.paiPageId ? "subpagina" : null, status: "published", version: "1.2",
        source_pack_id: PACK_COMPENDIO, source_pack_version: "1.2", payload, payload_hash: payloadHash,
      }, { onConflict: "id" });
      if (error) throw new Error(`gravação: ${error.message}`);
      const { error: erroLog } = await supabase.from("content_changelog").insert({
        document_id: id, content_type: "capitulo", change_type: anterior ? "updated" : "created",
        pack_id: PACK_COMPENDIO, pack_version: "1.2", payload_before: anterior?.payload ?? null, payload_after: payload,
      });
      if (erroLog) throw new Error(`changelog: ${erroLog.message}`);
    }
    return anterior ? "atualizado" : "criado";
  }

  function registrar(resultado: "criado" | "atualizado" | "inalterado", rotulo: string) {
    if (resultado === "criado") rel.criados.push(rotulo);
    else if (resultado === "atualizado") rel.atualizados.push(rotulo);
    else rel.inalterados.push(rotulo);
    if (resultado !== "inalterado") log(`${resultado}: ${rotulo}`);
  }

  /** Alguma subpágina guardada mudou (ou sumiu) desde a última rodada? */
  async function subpaginasMudaram(guardadas: Record<string, string> | undefined): Promise<boolean> {
    for (const [id, editadoEm] of Object.entries(guardadas ?? {})) {
      try {
        if ((await notion.pagina(id)).editadoEm !== editadoEm) return true;
      } catch {
        return true;
      }
    }
    return false;
  }

  for (const entrada of indice) {
    const id = `capitulo:${entrada.notionPageId}`;
    vistos.add(id);
    const rotulo = entrada.tituloPagina;
    try {
      const anterior = porId.get(id);
      const pagina = await notion.pagina(entrada.notionPageId);
      const payloadAnterior = anterior?.payload as CapituloCompendio | undefined;
      const mesmaOrdem = payloadAnterior && payloadAnterior.secao === entrada.secao && payloadAnterior.ordem === entrada.ordem && payloadAnterior.titulo === separarNumero(pagina.titulo).titulo;
      const forcarEste = forcar || forcarCapitulos.includes(separarNumero(entrada.tituloPagina).numero ?? -1);
      if (!forcarEste && anterior?.status === "published" && payloadAnterior?.notionEditadoEm === pagina.editadoEm && mesmaOrdem
        && !(await subpaginasMudaram(payloadAnterior?.subpaginas))) {
        for (const sub of Object.keys(payloadAnterior?.subpaginas ?? {})) vistos.add(`capitulo:${sub}`);
        rel.inalterados.push(rotulo);
        continue;
      }

      const conversao = converterBlocos(await notion.blocos(entrada.notionPageId));
      if (conversao.naoSuportados.length) rel.naoSuportados[rotulo] = [...new Set(conversao.naoSuportados)];
      await trocarImagens(conversao.blocos, copiarImagem);
      anotarDimensoes(conversao.blocos, dimensoes);
      aplicarDesdobrar(entrada.notionPageId, conversao);
      const capa = await definirCapa(entrada.notionPageId, conversao.blocos);
      const { numero, titulo } = separarNumero(pagina.titulo);

      // Subpáginas: linhas de galeria (bancos embutidos) e páginas filhas postas no
      // texto (ex.: a Lista de Mercadorias). Cada uma vira uma página do livro; a
      // primeira imagem da linha vira a capa do card, como na galeria do Notion.
      // `subpaginas` guarda TODAS as descendentes e a data de cada uma.
      const subpaginas: Record<string, string> = {};
      let n = 0;
      const processarSubpaginas = async (
        conv: ReturnType<typeof converterBlocos>,
        paiPageId: string,
        secaoSub: string,
        rotuloPai: string,
        profundidade: number,
      ): Promise<void> => {
        const cards = conv.blocos.flatMap((b) => (b.tipo === "galeria" ? b.itens : []));
        const alvos = [
          ...cards.map((card) => ({ pageId: card.pageId, titulo: card.titulo, card })),
          ...conv.paginasFilhas.map((f) => ({ ...f, card: null })),
        ];
        for (const alvo of alvos) {
          if (subpaginas[alvo.pageId]) continue;
          n++;
          const rotuloSub = `${rotuloPai} › ${alvo.titulo}`;
          vistos.add(`capitulo:${alvo.pageId}`);
          try {
            const sub = await notion.pagina(alvo.pageId);
            subpaginas[alvo.pageId] = sub.editadoEm;
            const convSub = converterBlocos(await notion.blocos(alvo.pageId));
            if (convSub.naoSuportados.length) rel.naoSuportados[rotuloSub] = [...new Set(convSub.naoSuportados)];
            await trocarImagens(convSub.blocos, copiarImagem);
            anotarDimensoes(convSub.blocos, dimensoes);
            if (alvo.card) {
              alvo.card.imagem = primeiraImagem(convSub.blocos);
              if (alvo.card.icone && /^https?:/.test(alvo.card.icone)) alvo.card.icone = await copiarImagem(alvo.card.icone);
            }
            const tituloSub = alvo.titulo || sub.titulo;
            // Primeiro as netas (a página precisa da capa dos próprios cards antes de ser gravada).
            if (profundidade < PROFUNDIDADE_MAXIMA_SUBPAGINAS) await processarSubpaginas(convSub, alvo.pageId, tituloSub, rotuloSub, profundidade + 1);
            aplicarDesdobrar(alvo.pageId, convSub);
            const capaSub = await definirCapa(alvo.pageId, convSub.blocos);
            registrar(await gravar({
              notionPageId: alvo.pageId,
              notionEditadoEm: sub.editadoEm,
              numero: null,
              titulo: tituloSub,
              secao: secaoSub,
              ordem: entrada.ordem + n / 1000,
              blocos: convSub.blocos,
              verbetes: convSub.verbetes,
              capa: capaSub,
              paiPageId,
            }, tituloSub), rotuloSub);
          } catch (e) {
            rel.falhas.push({ capitulo: rotuloSub, erro: e instanceof Error ? e.message : String(e) });
          }
        }
      };
      await processarSubpaginas(conversao, entrada.notionPageId, titulo, rotulo, 1);

      registrar(await gravar({
        notionPageId: entrada.notionPageId,
        notionEditadoEm: pagina.editadoEm,
        numero,
        titulo,
        secao: entrada.secao,
        ordem: entrada.ordem,
        blocos: conversao.blocos,
        verbetes: conversao.verbetes,
        capa,
        ...(n ? { subpaginas } : {}),
      }, pagina.titulo), rotulo);
    } catch (e) {
      rel.falhas.push({ capitulo: rotulo, erro: e instanceof Error ? e.message : String(e) });
      log(`FALHA em ${rotulo}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Capítulo que saiu do índice: arquivado, nunca apagado.
  for (const d of existentes ?? []) {
    if (vistos.has(d.id as string) || d.status === "archived") continue;
    if (!seco) {
      const { error } = await supabase.from("content_documents").update({ status: "archived" }).eq("id", d.id);
      if (error) rel.falhas.push({ capitulo: String(d.slug), erro: `arquivar: ${error.message}` });
    }
    rel.arquivados.push(((d.payload as CapituloCompendio | null)?.titulo) ?? String(d.slug));
  }

  // Imagens que nenhum documento publicado usa mais: removidas do bucket.
  // Só numa rodada limpa — com falha, um capítulo pode ter ficado com a versão antiga.
  if (!seco && rel.falhas.length === 0) rel.imagensOrfasRemovidas = await removerImagensOrfas(supabase);

  rel.requisicoesNotion = notion.requisicoes();
  return rel;
}

async function removerImagensOrfas(supabase: SupabaseClient): Promise<number> {
  const { data: docs, error } = await supabase
    .from("content_documents")
    .select("payload")
    .eq("content_type", "capitulo")
    .eq("source_pack_id", PACK_COMPENDIO)
    .eq("status", "published");
  if (error) throw new Error(`Falha ao ler capítulos para limpar imagens: ${error.message}`);
  const usadas = new Set<string>();
  for (const { payload } of docs ?? []) {
    for (const m of JSON.stringify(payload).matchAll(/\/object\/public\/compendio\/([^"?]+)/g)) usadas.add(m[1]);
  }
  const arquivos: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error: erroLista } = await supabase.storage.from(BUCKET_COMPENDIO).list("", { limit: 1000, offset });
    if (erroLista) throw new Error(`Falha ao listar o bucket: ${erroLista.message}`);
    arquivos.push(...(data ?? []).map((f) => f.name));
    if (!data || data.length < 1000) break;
  }
  // Trava de segurança: sem nenhuma imagem referenciada, algo deu errado na leitura — não apaga nada.
  if (usadas.size === 0) return 0;
  const orfas = arquivos.filter((n) => !usadas.has(n));
  for (let i = 0; i < orfas.length; i += 100) {
    const { error: erroRemover } = await supabase.storage.from(BUCKET_COMPENDIO).remove(orfas.slice(i, i + 100));
    if (erroRemover) throw new Error(`Falha ao remover imagens órfãs: ${erroRemover.message}`);
  }
  return orfas.length;
}

/** Estado de cada página publicada do livro (título, data no Notion, hash do texto). */
export async function estadoDasPaginas(supabase: SupabaseClient): Promise<Map<string, EstadoPaginaLivro>> {
  const { data, error } = await supabase
    .from("content_documents")
    .select("slug, payload, payload_hash")
    .eq("content_type", "capitulo")
    .eq("source_pack_id", PACK_COMPENDIO)
    .eq("status", "published");
  if (error) throw new Error(`Falha ao ler o livro: ${error.message}`);
  return new Map(
    (data ?? []).map((d) => {
      const p = d.payload as CapituloCompendio;
      const titulo = p.numero != null ? `${p.numero}. ${p.titulo}` : p.paiPageId ? `${p.secao} › ${p.titulo}` : p.titulo;
      return [d.slug as string, { titulo, editadoEm: p.notionEditadoEm, hash: d.payload_hash as string }];
    }),
  );
}

/** Arquivos de regras cuja página de origem mudou depois da revisão (Fase 5). */
export async function pendenciasDeRevisao(supabase: SupabaseClient): Promise<PendenciaRevisao[]> {
  return avaliarRevisoes(lerFontesRevisao(), await estadoDasPaginas(supabase));
}

/** Tipagem exportada para o teste. */
export type { BlocoNotion };
