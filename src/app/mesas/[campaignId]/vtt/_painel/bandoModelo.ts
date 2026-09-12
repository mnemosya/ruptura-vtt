/**
 * Lógica PURA da aba Bando: busca por nome e agrupamento por
 * categoria do inventário compartilhado.
 *
 * O agrupamento é DERIVADO do dado real (`payload.categoria` da
 * instância) — quando a categoria não existe, a linha cai num grupo
 * "Sem categoria" explícito, nunca num rótulo inventado.
 */

import type { ItemBandoPainel } from "./acoes/bandoPainel";
import { normalizarBusca } from "./personagensModelo";

export interface GrupoBando {
  categoria: string;
  rotulo: string;
  itens: ItemBandoPainel[];
}

const ROTULO_CATEGORIA: Record<string, string> = {
  arma: "Armas",
  armadura: "Armaduras",
  municao: "Munição",
  dispositivo: "Dispositivos",
  explosivo: "Explosivos",
  consumivel: "Consumíveis",
  escalpo: "Escalpos",
  runa: "Runas",
  ferramenta: "Ferramentas",
  vestuario: "Vestuário",
};

const SEM_CATEGORIA = "__sem_categoria__";

export function rotuloDaCategoriaItem(categoria: string | null): string {
  if (!categoria) return "Sem categoria";
  return ROTULO_CATEGORIA[categoria] ?? categoria.charAt(0).toLocaleUpperCase("pt-BR") + categoria.slice(1);
}

export function itemCasaBusca(item: ItemBandoPainel, consulta: string): boolean {
  const alvo = normalizarBusca(consulta);
  if (!alvo) return true;
  return normalizarBusca(item.nome).includes(alvo) || normalizarBusca(item.slug ?? "").includes(alvo);
}

/**
 * Agrupa por categoria, cada grupo com os itens em ordem alfabética
 * (empate desfeito pelo id da linha, pra ordem total e estável). Os
 * grupos saem na ordem alfabética do RÓTULO, com "Sem categoria"
 * sempre por último — nunca no meio, onde pareceria uma categoria
 * qualquer.
 */
export function agruparPorCategoria(itens: readonly ItemBandoPainel[], consulta: string): GrupoBando[] {
  const porCategoria = new Map<string, ItemBandoPainel[]>();
  for (const item of itens) {
    if (!itemCasaBusca(item, consulta)) continue;
    const chave = item.categoria ?? SEM_CATEGORIA;
    const lista = porCategoria.get(chave);
    if (lista) lista.push(item);
    else porCategoria.set(chave, [item]);
  }

  return [...porCategoria.entries()]
    .map(([categoria, lista]) => ({
      categoria,
      rotulo: rotuloDaCategoriaItem(categoria === SEM_CATEGORIA ? null : categoria),
      itens: [...lista].sort((a, b) => {
        const porNome = a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
        return porNome !== 0 ? porNome : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      }),
    }))
    .sort((a, b) => {
      if (a.categoria === SEM_CATEGORIA) return 1;
      if (b.categoria === SEM_CATEGORIA) return -1;
      return a.rotulo.localeCompare(b.rotulo, "pt-BR", { sensitivity: "base" });
    });
}

/**
 * Linhas técnicas do detalhe de uma instância — só o que o payload de
 * fato tem. Nunca inventa "0/0" pra um item sem cargas: um campo
 * ausente simplesmente não vira linha.
 */
export function detalhesDaInstancia(item: ItemBandoPainel): { rotulo: string; valor: string }[] {
  const p = item.payload as unknown as Record<string, unknown> | null;
  if (!p) return [];
  const linhas: { rotulo: string; valor: string }[] = [];
  if (typeof p.subtipo === "string" && p.subtipo) linhas.push({ rotulo: "Subtipo", valor: p.subtipo });
  if (typeof p.estado === "string" && p.estado) linhas.push({ rotulo: "Estado", valor: p.estado });
  if (typeof p.cargasAtual === "number") linhas.push({ rotulo: "Cargas", valor: String(p.cargasAtual) });
  const municao = p.municaoCarregada;
  if (municao && typeof municao === "object") {
    const m = municao as Record<string, unknown>;
    const nome = typeof m.itemNome === "string" ? m.itemNome : "munição";
    const qtd = typeof m.quantidade === "number" ? m.quantidade : null;
    linhas.push({ rotulo: "Carregada", valor: qtd == null ? nome : `${nome} ×${qtd}` });
  }
  const runas = p.runasInstaladas;
  if (Array.isArray(runas) && runas.length > 0) {
    const nomes = runas
      .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>).runaNome : null))
      .filter((n): n is string => typeof n === "string");
    linhas.push({ rotulo: "Runas", valor: nomes.length > 0 ? nomes.join(", ") : `${runas.length} instalada(s)` });
  }
  const propriedades = p.propriedadesTecnicas ?? p.propriedades;
  if (Array.isArray(propriedades) && propriedades.length > 0) {
    linhas.push({ rotulo: "Propriedades", valor: `${propriedades.length} registrada(s)` });
  }
  if (typeof p.precoPago === "number") linhas.push({ rotulo: "Preço pago", valor: String(p.precoPago) });
  return linhas;
}

/** Total de unidades visíveis — o contador da aba. Soma quantidade, não linhas: 3 balas numa linha são 3 unidades. */
export function totalDeUnidades(itens: readonly ItemBandoPainel[]): number {
  return itens.reduce((n, i) => n + (Number.isFinite(i.quantidade) ? i.quantidade : 0), 0);
}

// =====================================================================
// Arrasto de item do Bando
// =====================================================================

/** Formato explícito e versionado do arrasto — nunca `text/plain`, que qualquer campo de texto aceitaria por acidente. */
export const MIME_ITEM_BANDO = "application/x-ruptura-item-bando";

/** O mínimo que o destino precisa saber sobre o item arrastado. A instância inteira nunca viaja pelo `dataTransfer` — quem transfere é o servidor, pelo id da linha. */
export interface ItemTransferivel {
  /** `campaign_inventory_items.id`. */
  id: string;
  nome: string;
  quantidade: number;
}

export function serializarItemBando(item: ItemTransferivel): string {
  return JSON.stringify({ v: 1, id: item.id, nome: item.nome, quantidade: item.quantidade });
}

/** Desserialização tolerante: fora do formato devolve `null` e o drop é ignorado. */
export function desserializarItemBando(bruto: string): ItemTransferivel | null {
  try {
    const json = JSON.parse(bruto) as Record<string, unknown>;
    if (json.v !== 1 || typeof json.id !== "string") return null;
    return {
      id: json.id,
      nome: typeof json.nome === "string" ? json.nome : "(item)",
      quantidade: typeof json.quantidade === "number" && json.quantidade > 0 ? json.quantidade : 1,
    };
  } catch {
    return null;
  }
}
