/**
 * Aviso de regras desatualizadas (Fase 5 do PLANO_COMPENDIO_NOTION).
 *
 * Os arquivos de regras revisados (`content/...`) continuam sendo a fonte
 * do motor. O livro sincronizado só AVISA quando a página de onde um
 * arquivo veio mudou depois da revisão — nada é alterado sozinho.
 *
 * Duas formas de comparar, nessa ordem:
 *   1. `hashRevisado` (gravado por `npm run compendio:revisado`): o hash do
 *      TEXTO convertido da página no momento da revisão. Só avisa se o
 *      conteúdo mudou de fato; tocar a página no Notion não conta.
 *   2. Sem hash ainda: a data de edição no Notion contra `revisadoEm`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface FonteRevisao {
  chave: string;
  rotulo: string;
  arquivo: string;
  pageId: string;
  revisadoEm: string;
  hashRevisado: string | null;
}

export interface EstadoPaginaLivro {
  titulo: string;
  editadoEm: string;
  hash: string;
}

export interface PendenciaRevisao {
  chave: string;
  rotulo: string;
  arquivo: string;
  pagina: string;
  motivo: "texto_mudou" | "editada_depois" | "pagina_ausente";
  editadoEm: string | null;
  revisadoEm: string;
}

export const ARQUIVO_REVISAO = join("content", "v12", "revisao_notion.json");

export function lerFontesRevisao(raiz = process.cwd()): FonteRevisao[] {
  const doc = JSON.parse(readFileSync(join(raiz, ARQUIVO_REVISAO), "utf8")) as { fontes: FonteRevisao[] };
  return doc.fontes;
}

export function avaliarRevisoes(fontes: FonteRevisao[], paginas: Map<string, EstadoPaginaLivro>): PendenciaRevisao[] {
  const pendencias: PendenciaRevisao[] = [];
  for (const f of fontes) {
    const p = paginas.get(f.pageId);
    const base = { chave: f.chave, rotulo: f.rotulo, arquivo: f.arquivo, revisadoEm: f.revisadoEm };
    if (!p) {
      pendencias.push({ ...base, pagina: f.pageId, motivo: "pagina_ausente", editadoEm: null });
      continue;
    }
    if (f.hashRevisado) {
      if (f.hashRevisado !== p.hash) pendencias.push({ ...base, pagina: p.titulo, motivo: "texto_mudou", editadoEm: p.editadoEm });
    } else if (Date.parse(p.editadoEm) > Date.parse(f.revisadoEm)) {
      pendencias.push({ ...base, pagina: p.titulo, motivo: "editada_depois", editadoEm: p.editadoEm });
    }
  }
  return pendencias;
}

/** "02/10/2026 00:31" no fuso de Brasília — com hora, para edições no mesmo dia da revisão. */
function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
}

export function descreverPendencia(p: PendenciaRevisao): string {
  if (p.motivo === "pagina_ausente") return `${p.rotulo}: a página de origem não está mais no livro sincronizado.`;
  const quando = p.editadoEm ? dataHora(p.editadoEm) : "?";
  const desde = dataHora(p.revisadoEm);
  return p.motivo === "texto_mudou"
    ? `${p.rotulo}: o texto de "${p.pagina}" mudou desde a revisão (${desde}).`
    : `${p.rotulo}: "${p.pagina}" foi editada em ${quando}, depois da revisão (${desde}).`;
}
