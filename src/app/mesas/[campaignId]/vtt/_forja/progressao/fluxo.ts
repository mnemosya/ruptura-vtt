/**
 * As SUB-ETAPAS da Progressão: cada Ranking atravessado vira uma sequência
 * de telas dedicadas — a Entrada do Ranking, a escolha da Subclasse, o
 * "Você ganha" (características que chegam), e as escolhas de Atributo,
 * Vertente e Perícias. Só entram as que aquele Ranking concede.
 *
 * Puro: não guarda estado nem fala com o servidor. As regras (o que falta,
 * a base de cada Ranking) continuam em `etapasProgressaoV12`.
 */
import type { EtapaProgressaoV12, RankingV12 } from "../../../../../../lib/rulesetV12";

export type TipoPasso = "entrada" | "subclasse" | "ganhos" | "atributo" | "vertente" | "pericias";

export interface PassoProgressao {
  /** Chave estável: o Ranking e o tipo (`"E:vertente"`). */
  chave: string;
  para: RankingV12;
  tipo: TipoPasso;
}

export const ROTULO_PASSO: Record<TipoPasso, string> = {
  entrada: "Entrada",
  subclasse: "Subclasse",
  ganhos: "Você ganha",
  atributo: "Atributo",
  vertente: "Vertente",
  pericias: "Perícias",
};

/** As sub-etapas de um Ranking, na ordem da tela. */
export function tiposDaEtapa(e: EtapaProgressaoV12): TipoPasso[] {
  const a = e.avanco;
  const tipos: TipoPasso[] = ["entrada"];
  if (a.escolhe_subclasse) tipos.push("subclasse");
  // As características chegam junto da Subclasse (Rank E) ou sozinhas (Rankings seguintes).
  if (a.escolhe_subclasse || e.caracteristicas_classe.length || e.caracteristicas_subclasse.length || a.magias_adicionais > 0) tipos.push("ganhos");
  if (a.pontos_atributo > 0) tipos.push("atributo");
  if (a.pontos_vertente > 0) tipos.push("vertente");
  if (a.pontos_pericia > 0) tipos.push("pericias");
  return tipos;
}

/** Todas as sub-etapas, Ranking a Ranking. */
export function passosDaProgressao(etapas: EtapaProgressaoV12[]): PassoProgressao[] {
  return etapas.flatMap((e) => tiposDaEtapa(e).map((tipo) => ({ chave: `${e.para}:${tipo}`, para: e.para, tipo })));
}

/** Uma sub-etapa de escolha está resolvida? (A Entrada e o "Você ganha" não pedem nada.) */
export function passoResolvido(e: EtapaProgressaoV12, tipo: TipoPasso): boolean {
  const x = e.escolha, a = e.avanco;
  switch (tipo) {
    case "subclasse": return Boolean(x.subclasse_id);
    case "atributo": return Boolean(x.atributo);
    case "vertente": return Boolean(x.vertente);
    case "pericias": return e.pericias_gastas >= a.pontos_pericia;
    default: return true;
  }
}
