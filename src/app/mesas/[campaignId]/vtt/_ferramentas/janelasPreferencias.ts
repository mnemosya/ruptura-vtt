/**
 * Onde cada janela de ferramenta ficou — preferência LOCAL, por
 * usuário e campanha.
 *
 * Uma chave só, com um registro por ferramenta, em vez de uma chave
 * por painel: são todas a mesma coisa ("onde deixei esta janela"), e
 * chaves separadas já produziram formatos divergentes (Áreas guardava
 * posição junto com snap; Rodadas guardava junto com "trilha oculta").
 * Aqui a posição é só posição.
 *
 * Mesmas garantias de `areasPreferencias.ts`: leitura tolerante a
 * qualquer coisa que não bata o formato (campo a campo, nunca
 * descartando o conjunto por causa de uma chave nova) e escrita que
 * nunca quebra a mesa se o storage estiver cheio ou desabilitado.
 *
 * O geométrico (âncora padrão e clamp) mora aqui junto por um motivo:
 * são as regras que definem "onde uma janela pode estar", e mantê-las
 * ao lado do que é gravado impede que a posição salva e a posição
 * permitida divirjam.
 */

import type { FerramentaId } from "./controlador";

export interface PosicaoJanela {
  /** Canto superior esquerdo, relativo ao palco (`.rv-palco`). */
  x: number;
  y: number;
  /**
   * A pessoa já arrastou ESTA janela? Enquanto `false`, ela reancora
   * na barra a cada abertura; a partir do primeiro arrasto, a posição
   * é dela e nunca mais é recalculada sozinha.
   */
  manual: boolean;
}

/** Folga entre a barra de ferramentas (ou o trilho de turnos) e a janela. */
export const GAP_LATERAL = 16;
/**
 * Folga do topo. 74px deixa a janela abaixo do bloco de título da cena
 * (`.rv-cena`, que ocupa o canto superior esquerdo do palco) — abrir
 * colado no topo cobriria o nome da cena.
 */
export const MARGEM_TOPO = 74;
/** Respiro mínimo entre a janela e as bordas do palco no clamp. */
const MARGEM_BORDA = 8;

const VERSAO_SCHEMA = "v1";

export function chaveJanelas(usuarioId: string | null, campaignId: string): string {
  return `rv-janelas:${VERSAO_SCHEMA}:${usuarioId ?? "anon"}:${campaignId}`;
}

function ehPosicao(v: unknown): v is PosicaoJanela {
  return !!v && typeof v === "object"
    && Number.isFinite((v as { x: unknown }).x)
    && Number.isFinite((v as { y: unknown }).y);
}

function lerTudo(chave: string): Record<string, PosicaoJanela> {
  if (typeof window === "undefined") return {};
  try {
    const bruto = window.localStorage.getItem(chave);
    if (!bruto) return {};
    const json = JSON.parse(bruto) as Record<string, unknown>;
    const saida: Record<string, PosicaoJanela> = {};
    for (const [id, valor] of Object.entries(json)) {
      if (ehPosicao(valor)) saida[id] = { x: valor.x, y: valor.y, manual: valor.manual === true };
    }
    return saida;
  } catch {
    return {};
  }
}

/**
 * Posição lembrada de uma janela. `manual: false` (o padrão de quem
 * nunca arrastou) é o sinal para quem chama reancorar em vez de usar
 * `x`/`y` — por isso o retorno nunca é `null`.
 */
export function carregarPosicaoJanela(usuarioId: string | null, campaignId: string, id: FerramentaId): PosicaoJanela {
  return lerTudo(chaveJanelas(usuarioId, campaignId))[id] ?? { x: 0, y: MARGEM_TOPO, manual: false };
}

export function salvarPosicaoJanela(usuarioId: string | null, campaignId: string, id: FerramentaId, pos: PosicaoJanela): void {
  if (typeof window === "undefined") return;
  const chave = chaveJanelas(usuarioId, campaignId);
  try {
    window.localStorage.setItem(chave, JSON.stringify({ ...lerTudo(chave), [id]: pos }));
  } catch {
    // Storage cheio/desabilitado (aba privada) — a posição vira só
    // desta sessão, o que não é motivo pra quebrar a ferramenta.
  }
}

/**
 * Onde uma janela abre por padrão: encostada na barra de ferramentas
 * (o menu lateral), 16px de distância dela — SEMPRE, mesmo com a
 * trilha de turnos aberta. A janela é arrastável e tem z-index acima
 * de tudo (incluindo o trilho), então cobrir o trilho por um instante
 * ao abrir não é um estado ruim — a pessoa pode arrastar pra onde
 * quiser. Priorizar "colada no menu" sobre "nunca sobrepõe o trilho"
 * é a troca pedida explicitamente.
 *
 * Mede a caixa REAL da barra: continua certo se ela mudar de largura.
 */
export function ancoraPadraoJanela(): { x: number; y: number } {
  if (typeof document === "undefined") return { x: GAP_LATERAL, y: MARGEM_TOPO };
  const palco = document.querySelector(".rv-palco")?.getBoundingClientRect();
  const barra = document.querySelector(".rv-ferramentas")?.getBoundingClientRect();
  if (!palco || !barra) return { x: GAP_LATERAL, y: MARGEM_TOPO };
  return { x: barra.right - palco.left + GAP_LATERAL, y: MARGEM_TOPO };
}

/**
 * Mantém a janela INTEIRA dentro do palco.
 *
 * "Inteira", e não "com uma faixa do cabeçalho alcançável": a janela
 * tem altura fixa, e o que sobra pra fora do palco é recortado por
 * `overflow: hidden` — o rodapé (ações, listas, encerrar) sumiria sem
 * jeito de rolar até ele. Quando a janela é mais alta que o palco
 * (viewport curto), ela gruda no topo em vez de assumir uma posição
 * negativa que esconderia o cabeçalho.
 */
export function limitarPosicaoJanela(pos: PosicaoJanela, elemento: HTMLElement | null): PosicaoJanela {
  const pai = elemento?.offsetParent as HTMLElement | null;
  const largura = pai?.clientWidth ?? (typeof window === "undefined" ? 1024 : window.innerWidth);
  const altura = pai?.clientHeight ?? (typeof window === "undefined" ? 768 : window.innerHeight);
  const larguraJanela = elemento?.offsetWidth ?? 300;
  const alturaJanela = elemento?.offsetHeight ?? 320;
  return {
    x: Math.min(Math.max(pos.x, MARGEM_BORDA), Math.max(MARGEM_BORDA, largura - larguraJanela - MARGEM_BORDA)),
    y: Math.min(Math.max(pos.y, MARGEM_BORDA), Math.max(MARGEM_BORDA, altura - alturaJanela - MARGEM_BORDA)),
    manual: pos.manual,
  };
}
