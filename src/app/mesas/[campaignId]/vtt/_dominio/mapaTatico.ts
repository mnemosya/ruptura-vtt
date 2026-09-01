/**
 * Mapa TÁTICO EFETIVO — funções PURAS.
 *
 * Responde a uma pergunta só: **como esta célula se comporta agora**,
 * depois de combinar todas as fontes que produzem mecânica.
 *
 * Hoje as fontes são duas:
 *   • terreno PINTADO pelo narrador (`vtt_terrain`, célula a célula);
 *   • OBJETOS da cena que ocupam células (parede, veículo, entulho…).
 *
 * O ponto do módulo é que o movimento **não precisa saber de onde veio**
 * o bloqueio. Um muro, um carro e uma célula pintada à mão produzem o
 * mesmo fato mecânico, e `movimento.ts`/`pathfindingHex.ts` continuam
 * consumindo exatamente o `MapaTerreno` de sempre — só que o efetivo, já
 * com a precedência aplicada. É isso que permite objetos entrarem depois
 * sem reescrever nenhuma função de movimento.
 *
 * PROVENIÊNCIA fica separada em `objetosPorCelula`: quem precisa saber
 * QUAL objeto ocupa a célula (painel, cobertura consultiva, seleção) lê
 * dali, nunca inferindo do tipo de terreno.
 *
 * ⚠ Isto é a projeção do CLIENTE, usada para prévia e interface. A
 * verdade continua sendo do servidor: a RPC de movimento revalida
 * bloqueio contra o banco. Ver `docs/prd/PLANO_IMPLEMENTACAO_TERRENO_
 * OBJETOS_TATICOS.md` (decisões D1/D3).
 */

import { type Hex, hexKey } from "../_mapa/hex";
import { type MapaTerreno, type TipoTerreno } from "./movimento";

/**
 * Como um objeto da cena se projeta na mecânica das células que ocupa.
 *
 * Deliberadamente MENOR que o objeto persistido: nome, PD, cobertura e
 * aparência não interessam à mecânica de passagem, então não entram aqui.
 * Quem monta o mapa converte o objeto completo neste recorte.
 */
export interface ObjetoTatico {
  readonly id: string;
  /** Células ABSOLUTAS ocupadas (já rotacionadas/posicionadas). */
  readonly celulas: readonly Hex[];
  /** Impede passagem — projeta `"bloqueado"` em toda célula ocupada. */
  readonly bloqueiaMovimento: boolean;
  /**
   * Objeto que NÃO bloqueia ainda pode encarecer o passo — entulho é o
   * caso canônico: dá para atravessar, mas custa o dobro. Tipado só como
   * `"dificil"` de propósito: bloqueio se declara em `bloqueiaMovimento`,
   * nunca por duas vias que possam discordar.
   */
  readonly terrenoProjetado?: "dificil" | null;
}

export interface MapaTatico {
  /**
   * Terreno EFETIVO, já com a precedência resolvida — é o que o
   * movimento consome. Mesmo formato de sempre (`MapaTerreno`), de
   * propósito: nenhuma função de movimento precisou mudar de assinatura.
   */
  readonly terrenoEfetivo: MapaTerreno;
  /** Ids dos objetos que ocupam cada célula, por `hexKey`. Só proveniência. */
  readonly objetosPorCelula: ReadonlyMap<string, readonly string[]>;
}

const SEM_OBJETOS: ReadonlyMap<string, readonly string[]> = new Map();

export const MAPA_TATICO_VAZIO: MapaTatico = {
  terrenoEfetivo: new Map(),
  objetosPorCelula: SEM_OBJETOS,
};

/**
 * Combina terreno pintado e objetos num único mapa efetivo.
 *
 * PRECEDÊNCIA (uma vez, aqui — nunca reimplementada por quem desenha):
 *   1. qualquer objeto que bloqueia movimento  → `"bloqueado"`;
 *   2. senão, terreno pintado `"bloqueado"`     → `"bloqueado"`;
 *   3. senão, qualquer fonte de difícil         → `"dificil"`;
 *   4. senão                                    → ausente (custo normal).
 *
 * Sem objetos, devolve o próprio mapa pintado POR REFERÊNCIA — não
 * copiar aqui é o que mantém as memoizações de quem chama estáveis (e
 * torna esta fase provadamente sem mudança de comportamento).
 */
export function montarMapaTatico(params: {
  terrenoPintado: MapaTerreno;
  objetos?: readonly ObjetoTatico[];
}): MapaTatico {
  const { terrenoPintado, objetos } = params;
  if (!objetos || objetos.length === 0) {
    return { terrenoEfetivo: terrenoPintado, objetosPorCelula: SEM_OBJETOS };
  }

  const efetivo = new Map<string, TipoTerreno>(terrenoPintado);
  const porCelula = new Map<string, string[]>();

  for (const obj of objetos) {
    for (const celula of obj.celulas) {
      const chave = hexKey(celula);

      const lista = porCelula.get(chave);
      if (lista) lista.push(obj.id);
      else porCelula.set(chave, [obj.id]);

      if (obj.bloqueiaMovimento) {
        efetivo.set(chave, "bloqueado");
        continue;
      }
      // Difícil nunca rebaixa um bloqueio já estabelecido (pintado ou de
      // outro objeto) — a precedência é bloqueio > difícil, sempre.
      if (obj.terrenoProjetado === "dificil" && efetivo.get(chave) !== "bloqueado") {
        efetivo.set(chave, "dificil");
      }
    }
  }

  return { terrenoEfetivo: efetivo, objetosPorCelula: porCelula };
}

/** Ids dos objetos que ocupam a célula — vazio quando nenhum. */
export function objetosEm(mapa: MapaTatico, h: Hex): readonly string[] {
  return mapa.objetosPorCelula.get(hexKey(h)) ?? [];
}
