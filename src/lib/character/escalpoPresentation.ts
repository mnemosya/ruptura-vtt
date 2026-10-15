import type { TechnicalContentItem } from "../content/technicalLibrary";
import { itemDescription } from "./itemDescription";

export const normalizarEscalpo = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/_/g, " ");
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const numero = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? Math.abs(v) : null;
  if (typeof v !== "string" || !/^[−–-]?\s*\d+$/.test(v.trim())) return null;
  return Number(v.replace(/[−–-\s]/g, ""));
};

/** Projeção de leitura: campos explícitos do catálogo, sem alterar regras ou recursos. */
export function dadosEscalpo(item?: TechnicalContentItem) {
  const raw = item?.raw ?? {};
  const notion = record(raw.dados_notion);
  const campos = record(notion.campos), tecnica = record(notion.tabela_tecnica);
  const editorial = (item?.descricaoLonga ?? "").split(/^\s*#{2,}\s+MÓDULOS\b/im)[0];
  const plain = editorial.replace(/[*`]/g, "");
  const integridade = numero(raw.custo_integridade) ?? numero(tecnica.Integridade)
    ?? numero(/^\s*(?:-\s+)?Integridade:\s*([^\n]+)/im.exec(plain)?.[1]);
  const modulos = numero(raw.espacos_modulos) ?? numero(/(?:possui|possuem)\s+(\d+)\s+espaços?\s+para\s+módulos?/i.exec(plain)?.[1]);
  const espacos = numero(raw.espacos) ?? numero(tecnica["Espaços"]) ?? numero(campos["Espaços"])
    ?? numero(/^\s*Espaços:\s*([^\n]+)/im.exec(plain)?.[1]);
  const descricao = itemDescription({ descricao_longa: editorial.replace(/^\s*---\s*$/gm, "").trim(), descricao_curta: item?.descricaoCurta }, ["Integridade"]);
  const linhas = Object.entries(tecnica).filter(([k, v]) => !["integridade", "espacos", "preco", "raridade", "versao"].includes(normalizarEscalpo(k)) && (typeof v === "string" || typeof v === "number"));
  return { integridade, modulos, espacos, descricao, linhas };
}

export const REGIOES_ESCALPOS = [
  { id: "neurais", nome: "Neurais", codigo: "NEU", corpo: "cabeca" },
  { id: "opticos", nome: "Ópticos", codigo: "OPT", corpo: "cabeca" },
  { id: "auditivos", nome: "Auditivos", codigo: "AUD", corpo: "cabeca" },
  { id: "de_braco", nome: "Braços", codigo: "BRA", corpo: "membro_superior" },
  { id: "internos", nome: "Internos", codigo: "INT", corpo: "tronco" },
  { id: "de_perna", nome: "Pernas", codigo: "PER", corpo: "membro_inferior" },
  { id: "de_moda", nome: "Moda", codigo: "MOD", corpo: null },
  { id: "identidade", nome: "Identidade", codigo: "RPI", corpo: null },
  { id: "proteses", nome: "Próteses", codigo: "PRO", corpo: null },
  { id: "outros", nome: "Outros", codigo: "EXT", corpo: null },
] as const;

export function regiaoEscalpo(item?: TechnicalContentItem) {
  const categoria = normalizarEscalpo(item?.categoria ?? item?.categoriaLabel ?? "");
  return REGIOES_ESCALPOS.find(r => categoria === normalizarEscalpo(r.id) || categoria === normalizarEscalpo(r.nome))
    ?? REGIOES_ESCALPOS[REGIOES_ESCALPOS.length - 1];
}
