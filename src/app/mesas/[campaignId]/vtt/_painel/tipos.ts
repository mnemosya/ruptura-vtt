/**
 * Contratos e lógica PURA da moldura do painel lateral da Mesa.
 *
 * Sem React, sem `lucide-react`, sem `window` — de propósito: tudo
 * aqui é exercitado direto por `scripts/test-vtt-painel.ts`, sem DOM e
 * sem servidor. O que precisa de ícone (`PainelAbas.tsx`), de storage
 * (`preferencias.ts`) ou de dado (`*Tab.tsx`) mora ao lado, nunca aqui.
 */

export type AbaId = "chat" | "personagens" | "participantes" | "bando" | "compendio";

/** Ordem canônica das abas — a mesma na barra horizontal (aberto) e na faixa vertical (recolhido). */
export const ABAS_ORDEM: readonly AbaId[] = ["chat", "personagens", "participantes", "bando", "compendio"];

export const ROTULO_ABA: Record<AbaId, string> = {
  chat: "Chat Log",
  personagens: "Personagens",
  participantes: "Participantes",
  bando: "Bando",
  compendio: "Compêndio",
};

/**
 * Limites de largura do painel aberto. O piso existe porque abaixo de
 * ~300px o cartão de rolagem do Chat e a linha do diretório começam a
 * quebrar em duas linhas; o teto, porque o mapa é o conteúdo principal
 * e o painel nunca deve virar metade da tela.
 */
export const LARGURA_MIN = 390;
export const LARGURA_MAX = 420;
/**
 * 316px — EXATAMENTE a largura que o painel tinha antes de ser
 * redimensionável (`vtt.css`). O padrão preserva o enquadramento atual
 * do mapa pixel a pixel; quem quiser mais espaço arrasta a alça, e a
 * escolha fica salva.
 */
export const LARGURA_PADRAO = 390;

/** Clampa (e sanitiza) uma largura vinda de arrasto ou de `localStorage`. Valor não-finito cai no padrão, nunca em `NaN` no CSS. */
export function limitarLarguraPainel(largura: number): number {
  if (!Number.isFinite(largura)) return LARGURA_PADRAO;
  return Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, Math.round(largura)));
}

export function ehAbaId(valor: unknown): valor is AbaId {
  return typeof valor === "string" && (ABAS_ORDEM as readonly string[]).includes(valor);
}

/**
 * Navegação por setas dentro do `role="tablist"` (padrão WAI-ARIA):
 * Left/Right (barra horizontal) e Up/Down (faixa vertical recolhida)
 * andam com WRAP; Home/End vão às pontas. Qualquer outra tecla devolve
 * `null` — quem chama não faz `preventDefault` nesse caso, então
 * Tab/Enter/Espaço seguem com o comportamento nativo.
 *
 * Recebe a ordem como parâmetro (nunca lê `ABAS_ORDEM` direto) pra
 * poder ser testada com listas curtas e pra não presumir que toda aba
 * está sempre visível.
 */
export function proximaAbaPorSeta(atual: AbaId, tecla: string, abas: readonly AbaId[] = ABAS_ORDEM): AbaId | null {
  if (abas.length === 0) return null;
  const i = abas.indexOf(atual);
  if (i < 0) return null;
  switch (tecla) {
    case "ArrowRight":
    case "ArrowDown":
      return abas[(i + 1) % abas.length];
    case "ArrowLeft":
    case "ArrowUp":
      return abas[(i - 1 + abas.length) % abas.length];
    case "Home":
      return abas[0];
    case "End":
      return abas[abas.length - 1];
    default:
      return null;
  }
}

/**
 * Estado de uma leitura assíncrona de aba. União discriminada, nunca
 * `{ carregando, erro, dados }` solto: "carregou e veio vazio" e
 * "falhou ao ler" precisam ser distinguíveis na tela — degradar erro
 * para lista vazia é exatamente o estado enganoso que o resto desta
 * base de código já combate (ver `initialErrors` no
 * `CampaignRealtimeProvider`).
 *
 * `recarregando` guarda os dados ANTIGOS visíveis enquanto uma
 * releitura está em voo, e `erro` também: uma falha de releitura
 * mostra o aviso SEM esvaziar o que já estava na tela.
 */
export type EstadoAba<T> =
  | { fase: "ocioso" }
  | { fase: "carregando" }
  | { fase: "pronto"; dados: T }
  | { fase: "recarregando"; dados: T }
  | { fase: "erro"; mensagem: string; dados: T | null };

/** Dados já disponíveis deste estado, se houver — nunca inventa vazio. */
export function dadosDoEstado<T>(estado: EstadoAba<T>): T | null {
  if (estado.fase === "pronto" || estado.fase === "recarregando") return estado.dados;
  if (estado.fase === "erro") return estado.dados;
  return null;
}

/** Transição "comecei a ler" que PRESERVA o que já estava na tela (vira `recarregando` em vez de `carregando`). */
export function comecarLeitura<T>(estado: EstadoAba<T>): EstadoAba<T> {
  const anteriores = dadosDoEstado(estado);
  return anteriores === null ? { fase: "carregando" } : { fase: "recarregando", dados: anteriores };
}

/** Transição de falha que PRESERVA o que já estava na tela. */
export function falharLeitura<T>(estado: EstadoAba<T>, mensagem: string): EstadoAba<T> {
  return { fase: "erro", mensagem, dados: dadosDoEstado(estado) };
}
