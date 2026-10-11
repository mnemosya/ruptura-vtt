/** Transcreve o Mercado Noturno para os tipos da Biblioteca, sem herdar mecânica legada. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { slugify } from "../../../src/lib/contentSchema/slug";
import { renderizarBlocos, type BlocoNotion } from "./notionTexto";

type Mercadoria = {
  id: string; slug_sugerido: string; nome: string; categoria: string; tipo_tabela: string; secao: string[];
  campos: Record<string, string>; raridade: string; preco_texto: string; preco_numerico: number; preco_qualificador: string | null;
  detalhe_blocos: BlocoNotion[] | null; fonte: Record<string, unknown>;
  tabela_tecnica?: Record<string, string>; tabela_tecnica_fonte?: Record<string, unknown>;
};
type Classe = {
  id: string; content_type_proposto: "item" | "rune" | "escalpo" | "companion_model" | null;
  categoria_proposta: string | null; subtipo_proposto: string | null;
  vinculos_sugeridos?: { content_type: string; slugs: string[]; criterio: string };
};

const raiz = resolve("content/v12");
const original = JSON.parse(await readFile(resolve(raiz, "db_mercadorias_v1_2_rascunho.json"), "utf8"));
const classificacao = JSON.parse(await readFile(resolve(raiz, "classificacao_mercadorias_v1_2_rascunho.json"), "utf8"));
const mercadorias = original.mercadorias as Mercadoria[];
const classes = new Map((classificacao.linhas as Classe[]).map((c) => [c.id, c]));
const data = original._meta.extraido_em.slice(0, 10);
const titulos: Record<string, string> = {
  acessorio: "Acessório", arma: "Arma", armadura: "Armadura", escudo: "Escudo", dispositivo: "Dispositivo",
  explosivo: "Explosivo", farmacia: "Farmácia", ferramenta: "Ferramenta", mobilidade: "Mobilidade",
  modulo_escalpo: "Módulo de Escalpo", modulo_veicular: "Módulo Veicular", municao: "Munição",
  traje: "Traje", veiculo: "Veículo", veneno: "Veneno", vertina: "Vertina",
};
const raridades: Record<string, string> = { comum: "Comum", incomum: "Incomum", raro: "Raro", muito_comum: "Muito Comum", muito_raro: "Muito Raro" };
const excluirResumo = new Set(["Raridade", "Preço", "Preço (Ⱥ)", "Espaços"]);
function resumo(m: Mercadoria, detalhe: string): string {
  const direto = m.campos.Resumo || m.campos.Efeito || m.campos.Descrição || m.campos.Descricao;
  if (direto?.trim()) return direto.trim();
  const paragrafo = detalhe.split(/\n\n/).find((p) => p && !p.startsWith("#") && !p.startsWith("|") && !/^\*?(Muito Comum|Comum|Incomum|Raro|Muito Raro)\*?$/i.test(p));
  if (paragrafo) return paragrafo;
  const dados = Object.entries(m.campos).filter(([k, v]) => v && !excluirResumo.has(k) && k !== m.tipo_tabela).map(([k, v]) => `${k}: ${v}`);
  return dados.join("; ") || `${m.nome} — ${m.categoria}.`;
}
function corpo(m: Mercadoria): string {
  const detalhe = renderizarBlocos(m.detalhe_blocos ?? []);
  const tabela = Object.entries(m.campos).filter(([k, v]) => v && k !== m.tipo_tabela).map(([k, v]) => `- ${k}: ${v}`).join("\n");
  const tecnica = m.tabela_tecnica
    ? Object.entries(m.tabela_tecnica).map(([k, v]) => `- ${k}: ${v}`).join("\n")
    : "";
  return [detalhe, tabela && `Dados da lista de mercadorias:\n${tabela}`, tecnica && `Dados técnicos do verbete:\n${tecnica}`].filter(Boolean).join("\n\n");
}
function categoriaEscalpo(m: Mercadoria, c: Classe): string {
  if (c.subtipo_proposto === "identidade") return "identidade";
  const secao = m.secao.find((s) => /^ESCALPOS /.test(s)) ?? "";
  return slugify(secao.replace(/^ESCALPOS /, "")) || "escalpo";
}
function slotsRuna(m: Mercadoria): string[] {
  if (m.categoria === "DRONES E ROBÔS") return ["drone", "robo"];
  if (m.categoria === "ARMADURAS E ESCUDOS") return m.secao[0] === "ESCUDOS" ? ["escudo"] : ["armadura"];
  return ["arma"];
}
function tipoRuna(m: Mercadoria): string | null {
  if (m.secao[0] === "ARMAS CORPO A CORPO") return "corpo_a_corpo";
  if (m.secao[0] === "ARMAS DE ARREMESSO E DISPARO") return "arremesso_disparo";
  if (m.secao[0] === "ARMAS DE FOGO") return "fogo";
  if (m.secao[0] === "ARMAS DE ENERGIA") return "energia";
  return null;
}
const grupos: Record<"item" | "rune" | "escalpo" | "companion_model", Record<string, unknown>[]> = { item: [], rune: [], escalpo: [], companion_model: [] };
for (const m of mercadorias) {
  const c = classes.get(m.id);
  if (!c) throw new Error(`Mercadoria sem classificação: ${m.nome}`);
  const tipo = c.content_type_proposto ?? (c.subtipo_proposto === "modulo_escalpo" ? "item" : null);
  if (!tipo) throw new Error(`Mercadoria sem tipo: ${m.nome}`);
  if (!Number.isFinite(m.preco_numerico)) throw new Error(`Preço inválido: ${m.nome}`);
  const raridade = m.raridade === "Módulo" ? null : slugify(m.raridade);
  if (raridade && !(raridade in raridades)) throw new Error(`Raridade inesperada: ${m.nome}: ${m.raridade}`);
  const detalhe = renderizarBlocos(m.detalhe_blocos ?? []);
  const base = {
    id: m.slug_sugerido, slug: m.slug_sugerido, nome: m.nome.replace(/^↳\s*/, ""),
    raridade, raridade_label: raridade ? raridades[raridade] : null,
    preco: m.preco_numerico, preco_texto: m.preco_texto, preco_qualificador: m.preco_qualificador,
    descricao_curta: resumo(m, detalhe), descricao_longa: corpo(m),
    tags: ["loja"],
    dados_notion: { pagina: m.categoria, secao: m.secao, tipo_tabela: m.tipo_tabela, campos: m.campos, tabela_tecnica: m.tabela_tecnica ?? null },
    fonte_notion: { ...m.fonte, tabelaTecnicaFonte: m.tabela_tecnica_fonte ?? null },
    vinculos_sugeridos: c.vinculos_sugeridos ?? null,
    uso_manual: true,
    payload_automacao: { efeitos: [] },
    status: "published", versao: "1.2.0", created_at: data, updated_at: data,
  };
  if (tipo === "item") {
    const categoria = c.categoria_proposta ?? "modulo_escalpo";
    grupos.item.push({ ...base, categoria, categoria_label: titulos[categoria] ?? categoria,
      subtipo: c.subtipo_proposto, estatisticas: { campos_tabela: m.campos, espacos_texto: m.campos["Espaços"] ?? null },
    });
  } else if (tipo === "rune") {
    grupos.rune.push({ ...base, categoria: "runa", categoria_label: "Runa", slots_possiveis: slotsRuna(m),
      restricao_subtipo: tipoRuna(m), custo_integridade: 0,
    });
  } else if (tipo === "escalpo") {
    const categoria = categoriaEscalpo(m, c);
    grupos.escalpo.push({ ...base, categoria, categoria_label: categoria.replaceAll("_", " "),
      custo_integridade: null, slot: null, requisitos: [],
    });
  } else {
    grupos.companion_model.push({ ...base, categoria: m.tipo_tabela === "Drone" ? "drone" : "robo",
      alcance_controle: m.campos.Alcance ?? null, atributos_texto: m.campos.Atributos ?? null,
      acoes: [],
    });
  }
}
const esperado = { item: 273, rune: 52, escalpo: 39, companion_model: 10 };
for (const [tipo, total] of Object.entries(esperado)) {
  const registros = grupos[tipo as keyof typeof grupos];
  if (registros.length !== total || new Set(registros.map((r) => r.slug)).size !== total) throw new Error(`Contagem ou slugs inválidos de ${tipo}: ${registros.length}`);
  if (registros.some((r) => !r.descricao_curta || !r.descricao_longa)) throw new Error(`Texto ausente em ${tipo}`);
}
const manifest: Record<keyof typeof grupos, { arquivo: string; chave: string }> = {
  item: { arquivo: "db_mercado_itens_v1_2.json", chave: "itens" },
  rune: { arquivo: "db_mercado_runas_v1_2.json", chave: "runas" },
  escalpo: { arquivo: "db_mercado_escalpos_v1_2.json", chave: "escalpos" },
  companion_model: { arquivo: "db_mercado_companheiros_v1_2.json", chave: "modelos_companheiros" },
};
for (const [tipo, { arquivo, chave }] of Object.entries(manifest)) {
  const registros = grupos[tipo as keyof typeof grupos];
  const resultado = {
    _schema: `ruptura.vtt.content.mercado_notion.${tipo}.v1.2`,
    _meta: { conteudo: tipo, versao_schema: "1.2.0", total_registros: registros.length,
      fonte: "Notion: capítulo MERCADO NOTURNO / LISTA DE MERCADORIAS", extraido_em: original._meta.extraido_em,
      hash_sha256_origem: createHash("sha256").update(JSON.stringify(mercadorias)).digest("hex"),
      observacao: "Preço e descrição canônicos. Efeitos mecânicos e instalação são manuais nesta transcrição inicial.",
    },
    [chave]: registros,
  };
  await writeFile(resolve(raiz, arquivo), `${JSON.stringify(resultado, null, 2)}\n`);
}
console.log(Object.fromEntries(Object.entries(grupos).map(([tipo, registros]) => [tipo, registros.length])));
