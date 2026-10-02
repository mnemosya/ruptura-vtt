/**
 * Pendências da criação RUPTURA v1.2, calculadas a partir do RASCUNHO.
 *
 * Uma fonte só para tudo que diz "falta isto": a Sincronia e os losangos
 * do menu da Forja, a lista da Revisão e o bloqueio do Selar. As regras
 * repetem `validateCreationChoicesV12` (creation.ts) do ponto de vista de
 * quem ainda está preenchendo; o servidor continua sendo quem decide.
 *
 * Campos narrativos (Meio, Papel, Relação atual, Estopim, Primeiros
 * passos, Consequência e os dados do RPI Forjado) NÃO geram pendência:
 * ficam entre jogador e narrador, e o servidor também os aceita vazios.
 */

import type { AttributeIdV12, ClassContentV12 } from "./contracts";
import type { CreationChoicesV12 } from "./creation";
import type { DraftV12 } from "./draft";

export type CampoCriacaoV12 =
  | "nome"
  | "local"
  | "antecedente"
  | "qualidades"
  | "complicacoes"
  | "classe"
  | "atributos"
  | "pericias"
  | "vertente"
  | "compras";

export interface PendenciaCriacaoV12 {
  campo: CampoCriacaoV12;
  texto: string;
}

/** Os campos que contam para "quanto falta", na ordem da criação. */
export const CAMPOS_CRIACAO_V12: readonly CampoCriacaoV12[] = [
  "nome", "local", "antecedente", "qualidades", "complicacoes", "classe", "atributos", "pericias", "vertente",
];

export const ATRIBUTOS_V12: readonly AttributeIdV12[] = ["corpo", "mente", "animo"];

export interface CatalogoPendenciasV12 {
  classes: ClassContentV12[];
  qualidades: Array<{ slug: string; aretzPorPontos?: Record<string, number> }>;
  itens: Array<{ slug: string; preco: number }>;
}

export const somaPontosV12 = (lista: Array<{ pontos: number }>) => lista.reduce((s, e) => s + e.pontos, 0);

export function contagemPericiasV12(pericias: Record<string, number>): Record<1 | 2 | 3, number> {
  const c = { 1: 0, 2: 0, 3: 0 };
  for (const v of Object.values(pericias)) if (v === 1 || v === 2 || v === 3) c[v]++;
  return c;
}

/** Níveis que a Classe permite para uma perícia na criação (0 sempre). */
export function niveisPericiaV12(classe: ClassContentV12 | undefined, skillId: string): Array<0 | 1 | 2 | 3> {
  if (!classe) return [0];
  const c = classe.criacao;
  const niveis: Array<0 | 1 | 2 | 3> = [0];
  if (c.pericias_valor_1 === "qualquer_nao_escolhida" || c.pericias_valor_1.includes(skillId)) niveis.push(1);
  if (c.pericias_valor_2.includes(skillId)) niveis.push(2);
  if (c.pericias_valor_3.includes(skillId)) niveis.push(3);
  return niveis;
}

/** Orçamento inicial em Ⱥ: o da Classe mais o que as Qualidades concedem. */
export function orcamentoInicialV12(classe: ClassContentV12 | undefined, qualidades: DraftV12["qualidades"], cat: CatalogoPendenciasV12): number {
  let total = classe?.criacao.equipamento_inicial.aretz ?? 0;
  for (const q of qualidades) total += cat.qualidades.find((x) => x.slug === q.id)?.aretzPorPontos?.[String(q.pontos)] ?? 0;
  return total;
}

export function pendenciasCriacaoV12(d: DraftV12, cat: CatalogoPendenciasV12): PendenciaCriacaoV12[] {
  const p: PendenciaCriacaoV12[] = [];
  const classe = cat.classes.find((c) => c.slug === d.classeSlug);
  const perfilAtr = classe?.criacao.perfis_atributos.find((x) => x.slug === d.perfilAtributos);
  const perfilPer = classe?.criacao.perfis_pericias.find((x) => x.slug === d.perfilPericias);

  if (!d.nome.trim()) p.push({ campo: "nome", texto: "Defina o nome do personagem." });
  if (!d.localOrigem.trim()) p.push({ campo: "local", texto: "Defina a cidade, distrito ou comunidade de origem." });
  if (!d.antecedenteId) p.push({ campo: "antecedente", texto: "Escolha um Antecedente." });

  const q = somaPontosV12(d.qualidades);
  if (q !== 3) p.push({ campo: "qualidades", texto: `Qualidades devem somar 3 pontos (atual: ${q}).` });
  const c = somaPontosV12(d.complicacoes);
  if (c < 2) p.push({ campo: "complicacoes", texto: `Complicações devem somar ao menos 2 pontos (atual: ${c}).` });

  if (!classe) p.push({ campo: "classe", texto: "Escolha uma Classe." });

  if (!perfilAtr) p.push({ campo: "atributos", texto: "Escolha um perfil de Atributos." });
  else if (ATRIBUTOS_V12.some((a) => d.atributos[a] === null)) p.push({ campo: "atributos", texto: "Distribua os valores do perfil entre Corpo, Mente e Ânimo." });

  if (!perfilPer) p.push({ campo: "pericias", texto: "Escolha um perfil de Perícias." });
  else {
    const n = contagemPericiasV12(d.pericias);
    for (const v of [3, 2, 1] as const) {
      const esperado = perfilPer.quantidades[`valor_${v}`];
      if (n[v] !== esperado) p.push({ campo: "pericias", texto: `Perícias de valor ${v}: ${n[v]} de ${esperado}.` });
    }
  }

  if (!d.vertente) p.push({ campo: "vertente", texto: "Escolha a Vertente Primária." });

  const gasto = Object.entries(d.compras).reduce((s, [slug, qtd]) => s + (cat.itens.find((i) => i.slug === slug)?.preco ?? 0) * qtd, 0);
  const orcamento = orcamentoInicialV12(classe, d.qualidades, cat);
  if (gasto > orcamento) p.push({ campo: "compras", texto: `Compras (Ⱥ ${gasto.toLocaleString("pt-BR")}) acima do orçamento (Ⱥ ${orcamento.toLocaleString("pt-BR")}).` });
  return p;
}

/** Idiomas conhecidos pela regra de origem: o da região e o da região onde a campanha começa. */
export function idiomasCriacaoV12(d: DraftV12, regioes: Array<{ id: string; idioma: string }>): string[] {
  const proprio = regioes.find((r) => r.id === d.regiaoId)?.idioma;
  return [...new Set([proprio, d.idiomaCampanha].filter((i): i is string => Boolean(i)))];
}

/** As escolhas que o servidor recebe para montar o personagem. */
export function escolhasCriacaoV12(d: DraftV12, regioes: Array<{ id: string; idioma: string }>): CreationChoicesV12 {
  const porNivel = (n: 1 | 2 | 3) => Object.entries(d.pericias).filter(([, v]) => v === n).map(([id]) => id);
  const completos = ATRIBUTOS_V12.every((a) => d.atributos[a] !== null);
  const codinome = d.codinome.trim();
  return {
    nome: d.nome.trim(),
    classe_id: d.classeSlug,
    perfil_atributos: d.perfilAtributos,
    atributos: completos ? (d.atributos as Record<AttributeIdV12, number>) : { corpo: 0, mente: 0, animo: 0 },
    perfil_pericias: d.perfilPericias,
    pericias: { valor_3: porNivel(3), valor_2: porNivel(2), valor_1: porNivel(1) },
    vertente_primaria: d.vertente,
    trajetoria: {
      regiao_id: d.regiaoId,
      local_origem: d.localOrigem.trim(),
      idiomas: idiomasCriacaoV12(d, regioes),
      antecedente: { antecedente_id: d.antecedenteId, ...d.antecedente },
      transformacao_refratario: d.refratario,
      rpi_forjado: { nivel: 1, ...d.rpi },
      ...(codinome ? { codinome } : {}),
      qualidades: d.qualidades.map((q) => ({ quality_id: q.id, pontos: q.pontos, detalhes: {} })),
      complicacoes: d.complicacoes.map((c) => ({ complication_id: c.id, pontos: c.pontos, detalhes: {} })),
    },
    compras: Object.entries(d.compras).filter(([, q]) => q > 0).map(([itemSlug, quantidade]) => ({ itemSlug, quantidade })),
  };
}
