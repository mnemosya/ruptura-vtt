/**
 * Origem canônica dos rótulos humanos de `categoria`/`raridade` de item
 * — único lugar que os deriva. Espelha exatamente o enum fechado de
 * `content/schema_equipamentos_v1_2.json` (`properties.itens.items.properties.categoria|raridade`),
 * com os mesmos rótulos já usados no conteúdo oficial real
 * (`content/db_equipamentos_normalizado_v1_2.json`).
 *
 * Nunca confia em um label vindo do client/rascunho — o servidor sempre
 * deriva o label a partir do valor canônico (`categoria`/`raridade`) na
 * hora de serializar para publicação, o que também impede a combinação
 * inconsistente "categoria válida com label de outra categoria".
 */

export const CATEGORIA_ITEM_LABELS: Readonly<Record<string, string>> = {
  arma: "Arma",
  armadura: "Armadura",
  escudo: "Escudo",
  explosivo: "Explosivo",
  farmacia: "Farmácia",
  vertina: "Vertina",
  ferramenta: "Ferramenta",
  dispositivo: "Dispositivo",
  veiculo: "Veículo",
  municao: "Munição",
};

export const RARIDADE_ITEM_LABELS: Readonly<Record<string, string>> = {
  comum: "Comum",
  incomum: "Incomum",
  muito_comum: "Muito Comum",
  muito_raro: "Muito Raro",
  raro: "Raro",
};

/** `undefined` quando `categoria` está ausente OU não é um valor reconhecido — nunca inventa um rótulo. */
export function categoriaItemLabel(categoria: string | undefined): string | undefined {
  return categoria ? CATEGORIA_ITEM_LABELS[categoria] : undefined;
}

/** `undefined` quando `raridade` está ausente OU não é um valor reconhecido — nunca inventa um rótulo. */
export function raridadeItemLabel(raridade: string | undefined): string | undefined {
  return raridade ? RARIDADE_ITEM_LABELS[raridade] : undefined;
}
