import { normalizarComando } from "./comandoPericia";

export interface OpcaoComando {
  id: string;
  nome: string;
  detalhe: string;
  complementos?: string[];
  etapas?: EtapaComando[];
  custo?: { pa: string; mana?: string; extra?: string };
  custosPorComplemento?: Record<string, { pa?: string; mana?: string; extra?: string }>;
  identidade?: { familia: "a"; cena: string; grupo: string; slug?: string; classe?: boolean } | { familia: "m"; vertente: string };
}
export interface EtapaComando {
  rotulo: string;
  opcoes: { codigo: string; nome: string; detalhe?: string; custo?: { pa?: string; mana?: string; extra?: string } }[];
  valorLivre?: { prefixo: string; min: number; max: number | null };
}
export type LeituraConteudo =
  | { tipo: "texto" }
  | { tipo: "parcial" }
  | { tipo: "erro"; erro: string }
  | { tipo: "ok"; familia: "a" | "m"; id: string; argumento: string };

/** /a mirar e /m mísseis cinéticos; ação e magia são resolvidas por ID após a busca. */
export function lerComandoConteudo(entrada: string, acoes: readonly OpcaoComando[], magias: readonly OpcaoComando[]): LeituraConteudo {
  const texto = entrada.trim();
  const match = /^\/(a|m)(?:\s|$)/i.exec(texto);
  if (!match) return { tipo: "texto" };
  const familia = match[1].toLowerCase() as "a" | "m";
  const original = texto.slice(match[0].length).trim();
  const corpo = normalizarComando(original);
  if (!corpo) return { tipo: "parcial" };
  const opcoes = familia === "a" ? acoes : magias;
  const exatas = opcoes.filter((o) => normalizarComando(o.nome) === corpo || normalizarComando(o.id) === corpo || normalizarComando(o.id.split(":").at(-1) ?? "") === corpo);
  if (exatas.length > 1) return { tipo: "erro", erro: "Há mais de uma opção com esse nome. Escolha uma na lista." };
  if (exatas.length === 1) return { tipo: "ok", familia, id: exatas[0].id, argumento: "" };
  const prefixos = opcoes.flatMap((o) => [o.nome, o.id].map((nome) => ({ opcao: o, nome: normalizarComando(nome) })))
    .filter((x) => corpo.startsWith(`${x.nome} `)).sort((a, b) => b.nome.length - a.nome.length);
  if (prefixos.length) {
    const maior = prefixos[0].nome.length;
    const candidatos = [...new Map(prefixos.filter((x) => x.nome.length === maior).map((x) => [x.opcao.id, x.opcao])).values()];
    if (candidatos.length > 1) return { tipo: "erro", erro: "Há mais de uma opção com esse nome. Escolha uma na lista." };
    return { tipo: "ok", familia, id: candidatos[0].id, argumento: corpo.slice(maior).trim() };
  }
  if (opcoes.some((o) => normalizarComando(o.nome).startsWith(corpo) || normalizarComando(o.id).includes(corpo))) return { tipo: "parcial" };
  return { tipo: "erro", erro: `${familia === "a" ? "Ação" : "Magia"} indisponível para este personagem.` };
}
