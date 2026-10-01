/**
 * Rascunho persistente da criação RUPTURA v1.2.
 *
 * Usa a mesma tabela e a mesma RPC do rascunho anterior
 * (`character_creation_drafts`, `save_character_creation_draft`), mas com
 * `schema_version: 2`: o assistente anterior trata este formato como
 * incompatível e vice-versa, oferecendo descartar.
 *
 * Guarda só ESCOLHAS (slugs, textos, níveis e quantidades). O banco não
 * valida o formato, então `parseDraftV12` nunca confia no conteúdo:
 * qualquer campo fora do formato invalida o rascunho inteiro, e o limite
 * de tamanho evita payloads abusivos. A conferência contra o conteúdo
 * publicado acontece ao restaurar (`sanitizeDraftV12`).
 */

import type { AttributeIdV12 } from "./contracts";

export const DRAFT_V12_SCHEMA_VERSION = 2 as const;
export const DRAFT_V12_STEPS = 5;

export interface DraftEscolhaV12 {
  id: string;
  pontos: 1 | 2;
}

export interface DraftV12 {
  schema_version: typeof DRAFT_V12_SCHEMA_VERSION;
  ruleset_version: "1.2";
  step: number;
  nome: string;
  codinome: string;
  regiaoId: string;
  localOrigem: string;
  idiomaCampanha: string;
  antecedenteId: string;
  antecedente: { meio: string; papel: string; relacao_atual: string };
  refratario: { estopim: string; primeiros_passos: string; consequencia: string };
  rpi: { nome_registrado: string; ocupacao_declarada: string; origem: string };
  qualidades: DraftEscolhaV12[];
  complicacoes: DraftEscolhaV12[];
  classeSlug: string;
  perfilAtributos: string;
  atributos: Record<AttributeIdV12, number | null>;
  perfilPericias: string;
  pericias: Record<string, 0 | 1 | 2 | 3>;
  vertente: string;
  compras: Record<string, number>;
}

const MAX_SERIALIZED_LENGTH = 100_000;
const MAX_TEXT = 2_000;
const MAX_LIST = 40;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.length <= MAX_TEXT;

function textos<K extends string>(raw: unknown, chaves: readonly K[]): Record<K, string> | null {
  if (!isObj(raw)) return null;
  const out = {} as Record<K, string>;
  for (const k of chaves) {
    if (!isText(raw[k])) return null;
    out[k] = raw[k] as string;
  }
  return out;
}

function escolhas(raw: unknown): DraftEscolhaV12[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_LIST) return null;
  const out: DraftEscolhaV12[] = [];
  for (const e of raw) {
    if (!isObj(e) || !isText(e.id) || (e.pontos !== 1 && e.pontos !== 2)) return null;
    out.push({ id: e.id, pontos: e.pontos });
  }
  return out;
}

export function parseDraftV12(raw: unknown): DraftV12 | null {
  try {
    if (JSON.stringify(raw).length > MAX_SERIALIZED_LENGTH) return null;
  } catch {
    return null;
  }
  if (!isObj(raw)) return null;
  if (raw.schema_version !== DRAFT_V12_SCHEMA_VERSION || raw.ruleset_version !== "1.2") return null;
  if (!Number.isInteger(raw.step) || (raw.step as number) < 1 || (raw.step as number) > DRAFT_V12_STEPS) return null;

  for (const k of ["nome", "codinome", "regiaoId", "localOrigem", "idiomaCampanha", "antecedenteId", "classeSlug", "perfilAtributos", "perfilPericias", "vertente"] as const) {
    if (!isText(raw[k])) return null;
  }
  const antecedente = textos(raw.antecedente, ["meio", "papel", "relacao_atual"] as const);
  const refratario = textos(raw.refratario, ["estopim", "primeiros_passos", "consequencia"] as const);
  const rpi = textos(raw.rpi, ["nome_registrado", "ocupacao_declarada", "origem"] as const);
  const qualidades = escolhas(raw.qualidades);
  const complicacoes = escolhas(raw.complicacoes);
  if (!antecedente || !refratario || !rpi || !qualidades || !complicacoes) return null;

  if (!isObj(raw.atributos)) return null;
  const atributos = {} as Record<AttributeIdV12, number | null>;
  for (const a of ["corpo", "mente", "animo"] as const) {
    const v = raw.atributos[a];
    if (v !== null && !(Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 3)) return null;
    atributos[a] = v as number | null;
  }

  if (!isObj(raw.pericias) || Object.keys(raw.pericias).length > MAX_LIST) return null;
  const pericias: Record<string, 0 | 1 | 2 | 3> = {};
  for (const [k, v] of Object.entries(raw.pericias)) {
    if (k.length > 64 || ![0, 1, 2, 3].includes(v as number)) return null;
    pericias[k] = v as 0 | 1 | 2 | 3;
  }

  if (!isObj(raw.compras) || Object.keys(raw.compras).length > 200) return null;
  const compras: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw.compras)) {
    if (k.length > 128 || !Number.isInteger(v) || (v as number) < 0 || (v as number) > 999) return null;
    compras[k] = v as number;
  }

  return {
    schema_version: DRAFT_V12_SCHEMA_VERSION,
    ruleset_version: "1.2",
    step: raw.step as number,
    nome: raw.nome as string,
    codinome: raw.codinome as string,
    regiaoId: raw.regiaoId as string,
    localOrigem: raw.localOrigem as string,
    idiomaCampanha: raw.idiomaCampanha as string,
    antecedenteId: raw.antecedenteId as string,
    antecedente,
    refratario,
    rpi,
    qualidades,
    complicacoes,
    classeSlug: raw.classeSlug as string,
    perfilAtributos: raw.perfilAtributos as string,
    atributos,
    perfilPericias: raw.perfilPericias as string,
    pericias,
    vertente: raw.vertente as string,
    compras,
  };
}

export interface DraftCatalogosV12 {
  regioes: Array<{ id: string; idioma: string }>;
  antecedentes: Array<{ slug: string }>;
  qualidades: Array<{ slug: string; custos: Array<1 | 2>; repetivel: boolean }>;
  complicacoes: Array<{ slug: string; custos: Array<1 | 2>; repetivel: boolean }>;
  classes: Array<{
    slug: string;
    criacao: {
      perfis_atributos: Array<{ slug: string; valores: number[] }>;
      perfis_pericias: Array<{ slug: string }>;
      pericias_valor_3: string[];
      pericias_valor_2: string[];
      pericias_valor_1: "qualquer_nao_escolhida" | string[];
      vertentes_primarias: "qualquer" | string[];
    };
  }>;
  vertentes: string[];
  pericias: Array<{ id: string }>;
  itens: Array<{ slug: string }>;
}

/**
 * Ajusta um rascunho válido ao conteúdo publicado AGORA: escolhas que
 * deixaram de existir (Antecedente arquivado, item removido, perfil
 * renomeado) são descartadas e contadas, nunca mantidas em silêncio.
 */
export function sanitizeDraftV12(draft: DraftV12, cat: DraftCatalogosV12): { draft: DraftV12; descartados: number } {
  let descartados = 0;
  const manter = <T,>(cond: boolean, valor: T, vazio: T): T => {
    if (cond) return valor;
    if (valor !== vazio) descartados++;
    return vazio;
  };

  const d: DraftV12 = structuredClone(draft);
  d.regiaoId = manter(cat.regioes.some((r) => r.id === d.regiaoId), d.regiaoId, cat.regioes[0]?.id ?? "");
  d.idiomaCampanha = manter(d.idiomaCampanha === "" || cat.regioes.some((r) => r.idioma === d.idiomaCampanha), d.idiomaCampanha, "");
  d.antecedenteId = manter(cat.antecedentes.some((a) => a.slug === d.antecedenteId), d.antecedenteId, "");

  const filtrarEscolhas = (lista: DraftEscolhaV12[], opcoes: DraftCatalogosV12["qualidades"]) => {
    const vistos = new Set<string>();
    return lista.filter((e) => {
      const o = opcoes.find((x) => x.slug === e.id);
      const ok = !!o && o.custos.includes(e.pontos) && (o.repetivel || !vistos.has(e.id));
      vistos.add(e.id);
      if (!ok) descartados++;
      return ok;
    });
  };
  d.qualidades = filtrarEscolhas(d.qualidades, cat.qualidades);
  d.complicacoes = filtrarEscolhas(d.complicacoes, cat.complicacoes);

  const classe = cat.classes.find((c) => c.slug === d.classeSlug);
  if (!classe) {
    d.classeSlug = manter(false, d.classeSlug, cat.classes[0]?.slug ?? "");
    d.perfilAtributos = "";
    d.atributos = { corpo: null, mente: null, animo: null };
    d.perfilPericias = "";
    d.pericias = {};
    d.vertente = "";
  } else {
    const perfil = classe.criacao.perfis_atributos.find((p) => p.slug === d.perfilAtributos);
    d.perfilAtributos = manter(!!perfil, d.perfilAtributos, "");
    const usados = (["corpo", "mente", "animo"] as const).map((a) => d.atributos[a]).filter((v): v is number => v !== null);
    const restantes = [...(perfil?.valores ?? [])];
    const cabe = usados.every((u) => {
      const i = restantes.indexOf(u);
      if (i < 0) return false;
      restantes.splice(i, 1);
      return true;
    });
    if (!perfil || !cabe) {
      if (usados.length > 0) descartados++;
      d.atributos = { corpo: null, mente: null, animo: null };
    }
    d.perfilPericias = manter(classe.criacao.perfis_pericias.some((p) => p.slug === d.perfilPericias), d.perfilPericias, "");
    const permitidas = classe.criacao.vertentes_primarias === "qualquer" ? cat.vertentes : classe.criacao.vertentes_primarias;
    d.vertente = manter(d.vertente === "" || permitidas.includes(d.vertente), d.vertente, "");
  }

  const pericias = new Set(cat.pericias.map((p) => p.id));
  const nivelPermitido = (id: string, nivel: number) => {
    if (nivel === 0) return true;
    if (!classe) return false;
    const c = classe.criacao;
    if (nivel === 3) return c.pericias_valor_3.includes(id);
    if (nivel === 2) return c.pericias_valor_2.includes(id);
    return c.pericias_valor_1 === "qualquer_nao_escolhida" || c.pericias_valor_1.includes(id);
  };
  for (const id of Object.keys(d.pericias)) {
    if (!pericias.has(id) || !nivelPermitido(id, d.pericias[id])) {
      if (d.pericias[id] > 0) descartados++;
      delete d.pericias[id];
    }
  }
  const itens = new Set(cat.itens.map((i) => i.slug));
  for (const slug of Object.keys(d.compras)) {
    if (!itens.has(slug)) {
      if (d.compras[slug] > 0) descartados++;
      delete d.compras[slug];
    }
  }
  return { draft: d, descartados };
}
