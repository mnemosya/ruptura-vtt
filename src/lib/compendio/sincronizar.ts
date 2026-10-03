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
import type { SupabaseClient } from "@supabase/supabase-js";
import { converterBlocos, separarNumero, type BlocoNotion } from "./converter";
import { lerIndice } from "./indice";
import { PAGINA_RAIZ_RUPTURA_V12, type ClienteNotion } from "./notion";
import type { BlocoCompendio, CapituloCompendio } from "./tipos";

export const BUCKET_COMPENDIO = "compendio";
export const PACK_COMPENDIO = "notion-ruptura-v1-2";

export interface RelatorioSincronizacao {
  criados: string[];
  atualizados: string[];
  inalterados: string[];
  arquivados: string[];
  falhas: { capitulo: string; erro: string }[];
  naoSuportados: Record<string, string[]>;
  imagensCopiadas: number;
  requisicoesNotion: number;
}

interface OpcoesSincronizacao {
  notion: ClienteNotion;
  supabase: SupabaseClient;
  /** Só mostra o que mudaria: não grava documento nem imagem. */
  seco?: boolean;
  /** Relê todos os capítulos, mesmo os que não mudaram no Notion. */
  forcar?: boolean;
  log?: (msg: string) => void;
}

function hash(valor: unknown): string {
  return createHash("sha256").update(JSON.stringify(valor)).digest("hex");
}

/** Chave estável da imagem: o caminho do arquivo no Notion, sem a assinatura. */
export function chaveImagem(url: string): string {
  const semQuery = url.split("?")[0];
  const ext = (semQuery.match(/\.(png|jpe?g|gif|webp|svg|avif)$/i)?.[1] ?? "png").toLowerCase();
  return `${createHash("sha256").update(semQuery).digest("hex").slice(0, 32)}.${ext}`;
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

/** Percorre os blocos trocando a URL de cada imagem. */
async function trocarImagens(blocos: BlocoCompendio[], trocar: (url: string) => Promise<string>): Promise<void> {
  for (const b of blocos) {
    if (b.tipo === "imagem") b.url = await trocar(b.url);
    if ("filhos" in b) await trocarImagens(b.filhos, trocar);
    if (b.tipo === "lista") for (const item of b.itens) await trocarImagens(item.filhos, trocar);
  }
}

export async function sincronizarCompendio(op: OpcoesSincronizacao): Promise<RelatorioSincronizacao> {
  const { notion, supabase, seco = false, forcar = false } = op;
  const log = op.log ?? (() => {});
  const rel: RelatorioSincronizacao = {
    criados: [], atualizados: [], inalterados: [], arquivados: [], falhas: [], naoSuportados: {}, imagensCopiadas: 0, requisicoesNotion: 0,
  };

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

  async function copiarImagem(url: string): Promise<string> {
    const caminho = chaveImagem(url);
    const publica = supabase.storage.from(BUCKET_COMPENDIO).getPublicUrl(caminho).data.publicUrl;
    if (seco) return publica;
    const { data: jaExiste } = await supabase.storage.from(BUCKET_COMPENDIO).list("", { search: caminho, limit: 1 });
    if (jaExiste?.some((f) => f.name === caminho)) return publica;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`imagem ${resp.status}`);
    const tipo = resp.headers.get("content-type") ?? "image/png";
    const { error } = await supabase.storage.from(BUCKET_COMPENDIO).upload(caminho, await resp.arrayBuffer(), { contentType: tipo, upsert: true });
    if (error) throw new Error(`upload da imagem: ${error.message}`);
    rel.imagensCopiadas++;
    return publica;
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
      if (!forcar && anterior?.status === "published" && payloadAnterior?.notionEditadoEm === pagina.editadoEm && mesmaOrdem
        && !(await subpaginasMudaram(payloadAnterior?.subpaginas))) {
        for (const sub of Object.keys(payloadAnterior?.subpaginas ?? {})) vistos.add(`capitulo:${sub}`);
        rel.inalterados.push(rotulo);
        continue;
      }

      const conversao = converterBlocos(await notion.blocos(entrada.notionPageId));
      if (conversao.naoSuportados.length) rel.naoSuportados[rotulo] = [...new Set(conversao.naoSuportados)];
      await trocarImagens(conversao.blocos, copiarImagem);
      const { numero, titulo } = separarNumero(pagina.titulo);

      // Galerias (bancos embutidos): cada linha vira uma subpágina do livro, e a
      // primeira imagem dela vira a capa do card, como na galeria do Notion.
      const subpaginas: Record<string, string> = {};
      const galerias = conversao.blocos.filter((b): b is Extract<BlocoCompendio, { tipo: "galeria" }> => b.tipo === "galeria");
      let n = 0;
      for (const galeria of galerias) {
        for (const card of galeria.itens) {
          n++;
          const rotuloSub = `${rotulo} › ${card.titulo}`;
          vistos.add(`capitulo:${card.pageId}`);
          try {
            const sub = await notion.pagina(card.pageId);
            subpaginas[card.pageId] = sub.editadoEm;
            const convSub = converterBlocos(await notion.blocos(card.pageId));
            if (convSub.naoSuportados.length) rel.naoSuportados[rotuloSub] = [...new Set(convSub.naoSuportados)];
            await trocarImagens(convSub.blocos, copiarImagem);
            card.imagem = primeiraImagem(convSub.blocos);
            if (card.icone && /^https?:/.test(card.icone)) card.icone = await copiarImagem(card.icone);
            registrar(await gravar({
              notionPageId: card.pageId,
              notionEditadoEm: sub.editadoEm,
              numero: null,
              titulo: card.titulo,
              secao: titulo,
              ordem: entrada.ordem + n / 1000,
              blocos: convSub.blocos,
              verbetes: convSub.verbetes,
              paiPageId: entrada.notionPageId,
            }, card.titulo), rotuloSub);
          } catch (e) {
            rel.falhas.push({ capitulo: rotuloSub, erro: e instanceof Error ? e.message : String(e) });
          }
        }
      }

      registrar(await gravar({
        notionPageId: entrada.notionPageId,
        notionEditadoEm: pagina.editadoEm,
        numero,
        titulo,
        secao: entrada.secao,
        ordem: entrada.ordem,
        blocos: conversao.blocos,
        verbetes: conversao.verbetes,
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

  rel.requisicoesNotion = notion.requisicoes();
  return rel;
}

/** Tipagem exportada para o teste. */
export type { BlocoNotion };
