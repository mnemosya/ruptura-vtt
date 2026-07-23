/**
 * Comparação de três vias (Etapa 12, correção) — oficial-base, oficial
 * atual, campanha atual. Não é um merge visual complexo (não pedido) —
 * um diff estrutural raso o suficiente para mostrar o que mudou de cada
 * lado e onde os dois lados mexeram no MESMO caminho (conflito real).
 * Nunca resolve automaticamente — só produz os dados para a UI decidir.
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export interface CaminhoAlterado {
  caminho: string;
  valorAnterior: unknown;
  valorNovo: unknown;
}

/** Diff raso e recursivo (profundidade máxima 4) entre dois objetos — arrays comparados por valor inteiro (nunca item a item, evita ambiguidade de reordenação). */
export function diffEstrutural(anterior: unknown, novo: unknown, caminho = "", profundidade = 0): CaminhoAlterado[] {
  if (profundidade >= 4 || !isPlainObject(anterior) || !isPlainObject(novo)) {
    if (JSON.stringify(anterior) === JSON.stringify(novo)) return [];
    return [{ caminho: caminho || "$", valorAnterior: anterior, valorNovo: novo }];
  }
  const alteracoes: CaminhoAlterado[] = [];
  const chaves = new Set([...Object.keys(anterior), ...Object.keys(novo)]);
  for (const chave of chaves) {
    const caminhoFilho = caminho ? `${caminho}.${chave}` : chave;
    const a = anterior[chave];
    const n = novo[chave];
    if (isPlainObject(a) && isPlainObject(n)) {
      alteracoes.push(...diffEstrutural(a, n, caminhoFilho, profundidade + 1));
    } else if (JSON.stringify(a) !== JSON.stringify(n)) {
      alteracoes.push({ caminho: caminhoFilho, valorAnterior: a, valorNovo: n });
    }
  }
  return alteracoes;
}

export interface ComparacaoTresVias {
  mudancasOficial: CaminhoAlterado[];
  mudancasCampanha: CaminhoAlterado[];
  conflitos: { caminho: string; valorOficialBase: unknown; valorOficialAtual: unknown; valorCampanha: unknown }[];
}

/** oficialBase → oficialAtual (mudanças do oficial) e oficialBase → campanhaAtual (mudanças da mesa); conflito = mesmo caminho alterado nos dois. */
export function compararTresVias(oficialBase: Record<string, unknown>, oficialAtual: Record<string, unknown>, campanhaAtual: Record<string, unknown>): ComparacaoTresVias {
  const mudancasOficial = diffEstrutural(oficialBase, oficialAtual);
  const mudancasCampanha = diffEstrutural(oficialBase, campanhaAtual);
  const caminhosOficial = new Map(mudancasOficial.map((m) => [m.caminho, m]));
  const conflitos = mudancasCampanha
    .filter((m) => caminhosOficial.has(m.caminho))
    .map((m) => ({
      caminho: m.caminho,
      valorOficialBase: undefined,
      valorOficialAtual: caminhosOficial.get(m.caminho)!.valorNovo,
      valorCampanha: m.valorNovo,
    }));
  return { mudancasOficial, mudancasCampanha, conflitos };
}
