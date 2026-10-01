/**
 * Bando Refratário — RUPTURA v1.2 (capítulo 10). Motor puro.
 *
 * Estado persistido em `campaign_crews` (uma linha por campanha que usa
 * bando; a regra é opcional). O Ranking não é gravado: deriva do Cobalto.
 * As tabelas do capítulo vêm de `content/v12/db_bando_v1_2.json` e chegam
 * aqui como `CrewCatalogV12`.
 *
 * Limites do capítulo aplicados:
 *   · Cobalto: resultado-base 0/+1/+2 e no máximo um ajuste (+1, −1, −2);
 *     variação de −2 a +3 por operação; nunca abaixo de 0.
 *   · Exposição: 0–6, cada segmento com a pista de origem; no máximo +2 por
 *     operação; só cai neutralizando uma pista; zera ao trocar de QG.
 *   · Alerta Imperial: 0–5; no máximo +2 por operação; cai 1, no máximo uma
 *     vez por operação ou intervalo, com causa registrada.
 *   · QG: Capacidade = slots de melhoria; Segurança = base + melhorias, até 3.
 */

export const CREW_RANKINGS_V12 = ["F", "E", "D", "C", "B", "A", "S"] as const;
export type CrewRankingV12 = (typeof CREW_RANKINGS_V12)[number];

export interface CrewCatalogV12 {
  rankings: Array<{ ranking: CrewRankingV12; titulo: string; cobalto: number; beneficio: string }>;
  qgs: Array<{ slug: string; nome: string; ranking_minimo: CrewRankingV12; custo: number; capacidade: number; seguranca: number; revendavel: boolean }>;
  melhorias: Array<{ slug: string; nome: string; ranking_minimo: CrewRankingV12; custo: number; transferencia: "portatil" | "fixa"; aprimoramento: number; seguranca: number; seguranca_aprimorada?: number }>;
  especialistas: Array<{ slug: string; nome: string; area: string; ranking_minimo: CrewRankingV12; recrutamento: number; salario: number }>;
  qg_regras: { seguranca_maxima: number; ranking_aprimoramento: CrewRankingV12 };
}

export interface CrewPistaV12 {
  /** O que permite localizar o QG (câmera, informante, comunicação rastreada…). */
  origem: string;
  registrada_em: string;
}

export interface CrewMelhoriaInstaladaV12 {
  slug: string;
  aprimorada: boolean;
}

export interface CrewEspecialistaV12 {
  slug: string;
  nome?: string;
  /** Intervalos seguidos sem salário (2 encerram o contrato). */
  intervalos_sem_salario: number;
}

export interface CrewStateV12 {
  nome: string;
  simbolo: string;
  principio: string;
  contato_inicial: string;
  inimigo_ou_divida: string;
  cobalto: number;
  qg: { slug: string; melhorias: CrewMelhoriaInstaladaV12[] };
  especialistas: CrewEspecialistaV12[];
  exposicao_pistas: CrewPistaV12[];
  alerta: number;
  alerta_notas: string;
  coberturas: Array<{ slug: string; descricao: string; comprometida: boolean }>;
  caixa: number;
}

export type CrewResult<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): CrewResult<T> => ({ ok: true, value });
const err = <T>(error: string): CrewResult<T> => ({ ok: false, error });

export function newCrewStateV12(identidade: Pick<CrewStateV12, "nome" | "simbolo" | "principio" | "contato_inicial" | "inimigo_ou_divida">): CrewStateV12 {
  return {
    ...identidade,
    cobalto: 0,
    qg: { slug: "refugio_improvisado", melhorias: [] },
    especialistas: [],
    exposicao_pistas: [],
    alerta: 0,
    alerta_notas: "",
    coberturas: [],
    caixa: 0,
  };
}

// ── Cobalto e Ranking ──────────────────────────────────────────────────

/** Ranking pelo Cobalto atual (cai junto se o saldo cair abaixo do patamar). */
export function crewRankingV12(cobalto: number, catalogo: CrewCatalogV12): CrewRankingV12 {
  let atual: CrewRankingV12 = "F";
  for (const r of [...catalogo.rankings].sort((a, b) => a.cobalto - b.cobalto)) {
    if (cobalto >= r.cobalto) atual = r.ranking;
  }
  return atual;
}

export function rankingAtLeast(atual: CrewRankingV12, minimo: CrewRankingV12): boolean {
  return CREW_RANKINGS_V12.indexOf(atual) >= CREW_RANKINGS_V12.indexOf(minimo);
}

export const COBALTO_BASE_V12 = { nenhum: 0, parcial: 1, cumprido: 2 } as const;
export const COBALTO_AJUSTE_V12 = { repercussao: 1, quebra_publica: -1, traicao_confirmada: -2 } as const;

export function resolveOperationCobaltoV12(
  cobalto: number,
  base: keyof typeof COBALTO_BASE_V12,
  ajuste?: keyof typeof COBALTO_AJUSTE_V12,
): { cobalto: number; variacao: number } {
  const variacao = Math.max(-2, Math.min(3, COBALTO_BASE_V12[base] + (ajuste ? COBALTO_AJUSTE_V12[ajuste] : 0)));
  return { cobalto: Math.max(0, cobalto + variacao), variacao };
}

// ── Exposição ──────────────────────────────────────────────────────────

export const EXPOSICAO_MAXIMA_V12 = 6;
export const ALERTA_MAXIMO_V12 = 5;

export function exposureStageV12(exposicao: number): "Oculto" | "Vestígios" | "Perímetro observado" | "Localizado" {
  if (exposicao >= 6) return "Localizado";
  if (exposicao >= 4) return "Perímetro observado";
  if (exposicao >= 2) return "Vestígios";
  return "Oculto";
}

/** Uma operação: no máximo duas pistas novas, cada uma com origem concreta. */
export function addExposureV12(estado: CrewStateV12, pistas: string[], agora: string): CrewResult<CrewStateV12> {
  const limpas = pistas.map((p) => p.trim());
  if (limpas.some((p) => !p)) return err("Cada segmento de Exposição precisa da pista que o originou.");
  if (limpas.length > 2) return err("Uma operação aumenta a Exposição em no máximo 2.");
  const novas = limpas.map((origem) => ({ origem, registrada_em: agora }));
  const exposicao_pistas = [...estado.exposicao_pistas, ...novas].slice(0, EXPOSICAO_MAXIMA_V12);
  return ok({ ...estado, exposicao_pistas });
}

/** Neutralizar uma pista registrada reduz a Exposição em 1. */
export function neutralizePistaV12(estado: CrewStateV12, indice: number): CrewResult<CrewStateV12> {
  if (!Number.isInteger(indice) || indice < 0 || indice >= estado.exposicao_pistas.length) return err("Pista inexistente.");
  return ok({ ...estado, exposicao_pistas: estado.exposicao_pistas.filter((_, i) => i !== indice) });
}

// ── Alerta Imperial ───────────────────────────────────────────────────

export function alertStageV12(alerta: number): "Ignorado" | "Fichado" | "Monitorado" | "Investigado" | "Prioritário" | "Caçado" {
  return (["Ignorado", "Fichado", "Monitorado", "Investigado", "Prioritário", "Caçado"] as const)[Math.max(0, Math.min(ALERTA_MAXIMO_V12, alerta))];
}

/** Uma operação: +0 a +2 (o segundo exige causa independente e grave, registrada pelo narrador). */
export function raiseAlertV12(estado: CrewStateV12, delta: number): CrewResult<CrewStateV12> {
  if (!Number.isInteger(delta) || delta < 0 || delta > 2) return err("Uma operação aumenta o Alerta Imperial em 0 a 2.");
  return ok({ ...estado, alerta: Math.min(ALERTA_MAXIMO_V12, estado.alerta + delta) });
}

export function lowerAlertV12(estado: CrewStateV12, causa: string): CrewResult<CrewStateV12> {
  if (!causa.trim()) return err("Reduzir o Alerta Imperial exige uma causa concreta.");
  if (estado.alerta === 0) return err("O Alerta Imperial já está em 0.");
  return ok({ ...estado, alerta: estado.alerta - 1 });
}

// ── QG ─────────────────────────────────────────────────────────────────

export function qgStatsV12(estado: CrewStateV12, catalogo: CrewCatalogV12): { capacidade: number; usados: number; seguranca: number } {
  const tipo = catalogo.qgs.find((q) => q.slug === estado.qg.slug);
  let seguranca = tipo?.seguranca ?? 0;
  for (const m of estado.qg.melhorias) {
    const def = catalogo.melhorias.find((x) => x.slug === m.slug);
    if (!def) continue;
    seguranca += def.seguranca + (m.aprimorada ? def.seguranca_aprimorada ?? 0 : 0);
  }
  return {
    capacidade: tipo?.capacidade ?? 0,
    usados: estado.qg.melhorias.length,
    seguranca: Math.min(catalogo.qg_regras.seguranca_maxima, seguranca),
  };
}

/** Instala uma melhoria (1 slot) e desconta do caixa coletivo. */
export function installUpgradeV12(estado: CrewStateV12, slug: string, catalogo: CrewCatalogV12): CrewResult<CrewStateV12> {
  const def = catalogo.melhorias.find((m) => m.slug === slug);
  if (!def) return err(`Melhoria desconhecida: "${slug}".`);
  if (estado.qg.melhorias.some((m) => m.slug === slug)) return err(`${def.nome} já está instalada.`);
  const ranking = crewRankingV12(estado.cobalto, catalogo);
  if (!rankingAtLeast(ranking, def.ranking_minimo)) return err(`${def.nome} exige Ranking ${def.ranking_minimo}.`);
  const { capacidade, usados } = qgStatsV12(estado, catalogo);
  if (usados >= capacidade) return err("O QG não tem Capacidade livre.");
  if (estado.caixa < def.custo) return err(`Caixa insuficiente: ${def.nome} custa Ⱥ ${def.custo}.`);
  return ok({ ...estado, caixa: estado.caixa - def.custo, qg: { ...estado.qg, melhorias: [...estado.qg.melhorias, { slug, aprimorada: false }] } });
}

export function improveUpgradeV12(estado: CrewStateV12, slug: string, catalogo: CrewCatalogV12): CrewResult<CrewStateV12> {
  const def = catalogo.melhorias.find((m) => m.slug === slug);
  const instalada = estado.qg.melhorias.find((m) => m.slug === slug);
  if (!def || !instalada) return err("Melhoria não instalada.");
  if (instalada.aprimorada) return err(`${def.nome} já foi aprimorada.`);
  if (!rankingAtLeast(crewRankingV12(estado.cobalto, catalogo), catalogo.qg_regras.ranking_aprimoramento)) {
    return err(`Aprimorar exige Ranking ${catalogo.qg_regras.ranking_aprimoramento}.`);
  }
  if (estado.caixa < def.aprimoramento) return err(`Caixa insuficiente: aprimorar custa Ⱥ ${def.aprimoramento}.`);
  return ok({
    ...estado,
    caixa: estado.caixa - def.aprimoramento,
    qg: { ...estado.qg, melhorias: estado.qg.melhorias.map((m) => (m.slug === slug ? { ...m, aprimorada: true } : m)) },
  });
}

/**
 * Troca de QG: recupera metade do preço do anterior (se revendável e não
 * comprometido), leva as melhorias portáteis e reconstrói as fixas pela
 * metade do preço (ou as perde, se a mudança for sob pressão). Exposição
 * volta a 0; Alerta não muda. Melhorias que não cabem no novo QG ficam de
 * fora, a começar pelas fixas.
 */
export function moveHeadquartersV12(
  estado: CrewStateV12,
  novoSlug: string,
  catalogo: CrewCatalogV12,
  opcoes: { comprometido?: boolean } = {},
): CrewResult<CrewStateV12> {
  const atual = catalogo.qgs.find((q) => q.slug === estado.qg.slug);
  const novo = catalogo.qgs.find((q) => q.slug === novoSlug);
  if (!novo) return err(`QG desconhecido: "${novoSlug}".`);
  if (novo.slug === estado.qg.slug) return err("Esse já é o QG atual.");
  if (!rankingAtLeast(crewRankingV12(estado.cobalto, catalogo), novo.ranking_minimo)) return err(`${novo.nome} exige Ranking ${novo.ranking_minimo}.`);
  const revenda = atual && atual.revendavel && !opcoes.comprometido ? Math.floor(atual.custo / 2) : 0;

  let custoReconstrucao = 0;
  const levadas: CrewMelhoriaInstaladaV12[] = [];
  const ordenadas = [...estado.qg.melhorias].sort((a, b) => {
    const ta = catalogo.melhorias.find((m) => m.slug === a.slug)?.transferencia === "portatil" ? 0 : 1;
    const tb = catalogo.melhorias.find((m) => m.slug === b.slug)?.transferencia === "portatil" ? 0 : 1;
    return ta - tb;
  });
  for (const m of ordenadas) {
    const def = catalogo.melhorias.find((x) => x.slug === m.slug);
    if (!def || levadas.length >= novo.capacidade) continue;
    if (def.transferencia === "fixa") {
      if (opcoes.comprometido) continue;
      custoReconstrucao += Math.floor((def.custo + (m.aprimorada ? def.aprimoramento : 0)) / 2);
    }
    levadas.push(m);
  }
  const custo = novo.custo + custoReconstrucao - revenda;
  if (estado.caixa < custo) return err(`Caixa insuficiente: a mudança custa Ⱥ ${custo}.`);
  return ok({ ...estado, caixa: estado.caixa - custo, qg: { slug: novo.slug, melhorias: levadas }, exposicao_pistas: [] });
}
