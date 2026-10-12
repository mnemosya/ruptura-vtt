/** Catálogo novo das Vertentes, sem herdar efeito ou slug dos bancos antigos. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { renderizarBlocos, type BlocoNotion } from "./notionTexto";

type MagiaFonte = {
  slug: string; nome: string; vertente: string; nivel: number; tipo: string; alcance: string; duracao: string; prerequisito: string;
  custo_mana: { tipo: "fixo"; valor: number; texto: string } | { tipo: "intervalo" | "variavel"; texto: string };
  conjuracao: { tipo: "pa"; pa: number; texto: string } | { tipo: "reacao" | "tempo" | "variavel"; texto: string };
  escolha_mana: unknown; escolha_tempo: unknown; corpo: BlocoNotion[];
  fonte: { paginaNotionId: string; blocoNotionId: string; paginaEditadaEm: string; tituloOriginal: string };
};
const raiz = resolve("content/v12");
const original = JSON.parse(await readFile(resolve(raiz, "db_magias_v1_2_vertentes_rascunho.json"), "utf8"));
const fonte = original.magias as MagiaFonte[];
const labels: Record<string, string> = {
  biotica: "Biótica", cinetica: "Cinética", cognitiva: "Cognitiva", energetica: "Energética", material: "Material", sinaptica: "Sináptica",
};
const data = original._meta.extraido_em.slice(0, 10);
const magias = fonte.map((m) => {
  const descricao = renderizarBlocos(m.corpo);
  if (!descricao) throw new Error(`Magia sem corpo: ${m.slug}`);
  const primeiraFrase = descricao.split(/\n\n/).find((p) => !p.startsWith("#") && !p.startsWith("|")) ?? descricao;
  const custoFixo = m.custo_mana.tipo === "fixo";
  const tempoPa = m.conjuracao.tipo === "pa";
  return {
    id: m.slug, slug: m.slug, nome: m.nome,
    categoria: "magia", categoria_label: "Magia", vertente: m.vertente, vertente_label: labels[m.vertente],
    descricao_curta: primeiraFrase, descricao_longa: descricao, tags: ["magia"],
    estatisticas: {
      nivel: m.nivel, tipo_magia: m.tipo, resolucao: "manual",
      custo_pa: m.conjuracao.tipo === "pa" ? m.conjuracao.pa : 0,
      usa_reacao: m.conjuracao.tipo === "reacao",
      custo_mana: m.custo_mana.tipo === "fixo" ? m.custo_mana.valor : null,
      custo_mana_regra: m.custo_mana, conjuracao: m.conjuracao,
      conjuracao_manual: !custoFixo || !tempoPa,
      escolha_mana: m.escolha_mana, escolha_tempo: m.escolha_tempo,
      alcance: { texto: m.alcance }, duracao: { texto: m.duracao },
      pre_requisito: m.prerequisito,
    },
    payload_automacao: { efeitos: [{ tipo: "narrativo", texto: "Resolver efeito conforme a descrição canônica do Notion." }] },
    fonte_notion: m.fonte,
    status: "published", versao: "1.2.0", created_at: data, updated_at: data,
  };
});
if (magias.length !== 233 || new Set(magias.map((m) => m.slug)).size !== magias.length) throw new Error("Catálogo de magias incompleto ou com slugs duplicados.");
if (magias.some((m) => !m.vertente_label)) throw new Error("Vertente sem rótulo.");
const resultado = {
  _schema: "ruptura.vtt.content.magias.notion.v1.2",
  _meta: {
    conteudo: "magias", versao_schema: "1.2.0", total_registros: magias.length,
    fonte: "Notion: capítulo de cada Vertente, bloco LISTA DE MAGIAS",
    extraido_em: original._meta.extraido_em,
    hash_sha256_origem: createHash("sha256").update(JSON.stringify(fonte)).digest("hex"),
    observacao: "Efeitos são resolvidos pela descrição canônica. Conjuração automática só para custo fixo em PA; escolhas e outros tempos exigem fluxo próprio.",
  },
  contagem_por_vertente: Object.fromEntries(Object.keys(labels).map((v) => [v, magias.filter((m) => m.vertente === v).length])),
  magias,
};
await writeFile(resolve(raiz, "db_magias_vertentes_v1_2.json"), `${JSON.stringify(resultado, null, 2)}\n`);
console.log(`${magias.length} magias: ${magias.filter((m) => !m.estatisticas.conjuracao_manual).length} com custo fixo em PA, ${magias.filter((m) => m.estatisticas.conjuracao_manual).length} de resolução manual.`);
