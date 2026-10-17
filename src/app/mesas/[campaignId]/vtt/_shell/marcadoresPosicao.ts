/**
 * Onde cada pessoa deixou cada marcador — preferência LOCAL, por
 * usuário e campanha, como a posição das janelas
 * (`_ferramentas/janelasPreferencias.ts`).
 *
 * Arrastar um marcador muda só a tela de quem arrastou. Sem posição
 * guardada, o marcador fica na faixa central, que é o padrão de todos.
 */

export interface PosicaoMarcador {
  /** Canto superior esquerdo do item, relativo ao palco. */
  x: number;
  y: number;
}

const VERSAO = "v1";
/** Distância mínima para um gesto deixar de ser clique e virar arraste. */
export const LIMIAR_ARRASTE_PX = 4;
/** Soltar com o topo do item acima desta linha devolve o marcador à faixa. */
export const ZONA_FAIXA_PX = 64;

export function chavePosicoesMarcadores(usuarioId: string | null, campaignId: string): string {
  return `rv-marcadores-pos:${VERSAO}:${usuarioId ?? "anon"}:${campaignId}`;
}

export function carregarPosicoesMarcadores(chave: string): Record<string, PosicaoMarcador> {
  if (typeof window === "undefined") return {};
  try {
    const bruto = window.localStorage.getItem(chave);
    if (!bruto) return {};
    const json = JSON.parse(bruto) as Record<string, unknown>;
    const saida: Record<string, PosicaoMarcador> = {};
    for (const [id, v] of Object.entries(json)) {
      const p = v as { x?: unknown; y?: unknown };
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) saida[id] = { x: p.x as number, y: p.y as number };
    }
    return saida;
  } catch {
    return {};
  }
}

export function salvarPosicoesMarcadores(chave: string, posicoes: Record<string, PosicaoMarcador>): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(chave, JSON.stringify(posicoes)); } catch { /* storage cheio ou bloqueado: a posição só não persiste */ }
}

/** Mantém o item inteiro dentro do palco. */
export function limitarAoPalco(p: PosicaoMarcador, palco: { width: number; height: number }, item: { width: number; height: number }): PosicaoMarcador {
  return {
    x: Math.max(0, Math.min(palco.width - item.width, p.x)),
    y: Math.max(0, Math.min(palco.height - item.height, p.y)),
  };
}
