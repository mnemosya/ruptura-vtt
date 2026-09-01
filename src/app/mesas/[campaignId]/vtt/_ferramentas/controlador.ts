/**
 * Controlador de ferramenta ativa + undo/redo — lógica PURA, sem DOM.
 *
 * Nada de arquitetura de plugin: `FerramentaId` é um union fechado, não
 * um registro extensível — cada ferramenta nova entra aqui de forma
 * explícita, com rótulo, atalho e regra de papel visíveis num lugar só.
 *
 * REGRA DO UNDO/REDO (simplificação deliberada, documentada — o pedido
 * pede exatamente isto): o histórico é LOCAL por sessão de navegador,
 * não colaborativo. Cada comando sabe desfazer A SI MESMO (`inverso`),
 * então desfazer não é voltar a um snapshot da aplicação — é reemitir a
 * operação oposta, que passa pela MESMA autorização de servidor que a
 * operação original. Se o narrador pintou terreno e o jogador moveu um
 * token depois, o Ctrl+Z do jogador desfaz SÓ o movimento dele — nunca
 * a pintura de outra pessoa. Uma pilha de redo por comando, limpa
 * quando um comando novo entra depois de um undo (regra clássica,
 * simples, sem tentar mesclar histórias concorrentes).
 */

export type FerramentaId = "interagir" | "medir" | "marcar" | "terreno" | "objetos" | "areas" | "rodadas";

export const ROTULO_FERRAMENTA: Record<FerramentaId, string> = {
  interagir: "Interagir",
  medir: "Medir",
  marcar: "Marcar",
  terreno: "Terreno",
  objetos: "Objetos",
  areas: "Áreas",
  rodadas: "Rodadas",
};

export const ATALHO_FERRAMENTA: Record<FerramentaId, string> = {
  interagir: "V",
  medir: "M",
  marcar: "D",
  terreno: "T",
  objetos: "O",
  // R estava livre: as outras teclas simples em uso na mesa são
  // V/M/D/T/O/A (ferramentas) e Q/E (girar token em posicionamento).
  // P deixou de ser atalho de ferramenta com a remoção de "Apontar"
  // (virou gesto de segurar o botão esquerdo — ver `_mapa/MapaHex.tsx`).
  areas: "A",
  rodadas: "R",
};

const TECLA_PARA_FERRAMENTA: Record<string, FerramentaId> = { v: "interagir", m: "medir", d: "marcar", t: "terreno", o: "objetos", a: "areas", r: "rodadas" };

/**
 * Ferramentas visíveis pro papel — Terreno é sempre narrador; ÁREAS e
 * RODADAS são dos dois papéis. Apontar deixou de ser uma ferramenta:
 * é gesto global (segurar o botão esquerdo, `_mapa/MapaHex.tsx`),
 * disponível em qualquer papel sem precisar aparecer aqui.
 *
 * Rodadas (migration 0088): o painel é dos dois papéis porque CONSULTAR
 * o estado do combate é de todo mundo — jogador precisa ver rodada,
 * janela e quem está agindo. O que é só do narrador (iniciar, editar
 * elenco, encerrar) fica desabilitado dentro do painel E é recusado
 * pelo servidor nas RPCs; esconder o botão inteiro só tiraria a
 * consulta de quem tem direito a ela.
 *
 * Áreas (migration 0083): qualquer participante VÁLIDO da campanha
 * pode criar — não existe mais autorização explícita por jogador. A
 * visibilidade do botão aqui é só UX; a autorização de verdade (criar,
 * e depois editar/excluir/duplicar só o que se criou, ou qualquer área
 * se narrador) é sempre decidida no servidor (`pode_criar_vtt_area`/
 * `pode_editar_vtt_area`), nunca só por esconder ou mostrar o botão.
 */
export function ferramentasParaPapel(ehNarrador: boolean): FerramentaId[] {
  const base: FerramentaId[] = ["interagir", "medir", "marcar", "areas", "rodadas"];
  return ehNarrador ? [...base, "terreno", "objetos"] : base;
}

/**
 * Fase do fluxo de criação/edição de token (`VttClient.tsx`, tipo
 * `FluxoToken`) relevante pra decidir se uma troca de ferramenta pode
 * acontecer — só o rótulo da fase importa aqui, nunca o resto do
 * estado (rascunho/âncora/etc.), então este módulo continua sem saber
 * nada de token. `null` = nenhum fluxo aberto (ou modal de configurar
 * aberto — o próprio backdrop do modal já bloqueia o mapa por baixo,
 * então trocar de ferramenta ali não tem efeito colateral nenhum).
 */
export type FaseFluxoTokenParaTroca = "posicionando" | "enviando" | "erro" | null;

export type DecisaoTrocaFerramenta = "bloqueada" | "cancelar-e-trocar" | "trocar";

/**
 * Decide o que uma troca de ferramenta deve fazer, dado em qual fase
 * do fluxo de posicionamento de token o app está — função PURA,
 * testável sem navegador. `VttClient.tsx` é o único chamador; nunca
 * escreve `ferramenta`/`fluxoToken` diretamente por fora dela (ver
 * `trocarFerramenta`), pra nunca existir uma segunda verdade sobre
 * "posso trocar de ferramenta agora?".
 *
 *  - "enviando": uma RPC de criação já está em voo — bloqueada até a
 *    resposta chegar (sucesso ou erro), nunca troca por baixo dela.
 *  - "posicionando"/"erro": cancela o posicionamento primeiro (sem
 *    RPC nenhuma) e SÓ ENTÃO troca — exceto se a ferramenta pedida já
 *    é a ativa, caso em que não há nada pra cancelar.
 *  - qualquer outra coisa (fluxo fechado, ou modal de configurar
 *    aberto): troca direta.
 */
export function decidirTrocaFerramenta(
  fase: FaseFluxoTokenParaTroca,
  novaFerramenta: FerramentaId,
  ferramentaAtual: FerramentaId,
): DecisaoTrocaFerramenta {
  if (fase === "enviando") return "bloqueada";
  if ((fase === "posicionando" || fase === "erro") && novaFerramenta !== ferramentaAtual) return "cancelar-e-trocar";
  return "trocar";
}

/**
 * Um comando reversível — cada AÇÃO conhece sua execução e sua
 * reversão como duas chamadas independentes, ambas passando pela
 * autorização de servidor de novo (nunca um snapshot aplicado
 * localmente sem revalidar).
 */
export interface Comando {
  rotulo: string;
  /** Quem pode desfazer ESTE comando — usado pra restringir undo de jogador às próprias ações. */
  autorId: string;
  executar: () => Promise<void>;
  desfazer: () => Promise<void>;
}

export interface EstadoHistorico {
  desfazer: Comando[];
  refazer: Comando[];
}

export const HISTORICO_VAZIO: EstadoHistorico = { desfazer: [], refazer: [] };

/** Registra um comando JÁ EXECUTADO — limpa a pilha de redo (regra clássica). */
export function registrarComando(hist: EstadoHistorico, cmd: Comando): EstadoHistorico {
  return { desfazer: [...hist.desfazer, cmd], refazer: [] };
}

export interface ResultadoHistorico {
  historico: EstadoHistorico;
  comando: Comando | null;
}

/** Move o topo da pilha de desfazer pra pilha de refazer. NÃO executa `desfazer()` — quem chama faz isso. */
export function prepararUndo(hist: EstadoHistorico, usuarioId: string, ehNarrador: boolean): ResultadoHistorico {
  const idx = ultimoIndiceDe(hist.desfazer, usuarioId, ehNarrador);
  if (idx === -1) return { historico: hist, comando: null };
  const cmd = hist.desfazer[idx];
  const desfazer = [...hist.desfazer.slice(0, idx), ...hist.desfazer.slice(idx + 1)];
  return { historico: { desfazer, refazer: [...hist.refazer, cmd] }, comando: cmd };
}

/** Move o topo da pilha de refazer de volta pra desfazer. NÃO executa `executar()`. */
export function prepararRedo(hist: EstadoHistorico, usuarioId: string, ehNarrador: boolean): ResultadoHistorico {
  const idx = ultimoIndiceDe(hist.refazer, usuarioId, ehNarrador);
  if (idx === -1) return { historico: hist, comando: null };
  const cmd = hist.refazer[idx];
  const refazer = [...hist.refazer.slice(0, idx), ...hist.refazer.slice(idx + 1)];
  return { historico: { desfazer: [...hist.desfazer, cmd], refazer }, comando: cmd };
}

/**
 * Narrador desfaz o topo de QUALQUER autor (controle estrutural da
 * cena); jogador só desfaz o último comando DELE mesmo — não precisa
 * ser o topo absoluto da pilha, senão um jogador nunca conseguiria
 * desfazer nada numa mesa ativa (o topo seria quase sempre de outra
 * pessoa).
 */
function ultimoIndiceDe(pilha: Comando[], usuarioId: string, ehNarrador: boolean): number {
  if (ehNarrador) return pilha.length - 1;
  for (let i = pilha.length - 1; i >= 0; i--) if (pilha[i].autorId === usuarioId) return i;
  return -1;
}

// ─────────────────────────────────────────────────────────────────
// Atalhos globais
// ─────────────────────────────────────────────────────────────────

export type AcaoAtalho =
  | { tipo: "ferramenta"; id: FerramentaId }
  | { tipo: "cancelar" }
  | { tipo: "apagar" }
  | { tipo: "undo" }
  | { tipo: "redo" };

/**
 * Interpreta um evento de teclado em uma ação, ou `null` se não for
 * atalho nosso. PURA — não lê `document`, recebe o que precisa como
 * parâmetro, pra ser testável sem DOM real.
 */
export function interpretarAtalho(evento: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  alvoEhEditavel: boolean;
}, ferramentasDisponiveis: FerramentaId[]): AcaoAtalho | null {
  if (evento.alvoEhEditavel) return null; // nunca disparar atalho com foco em input/textarea/select/editável

  const mod = evento.ctrlKey || evento.metaKey;
  const tecla = evento.key.toLowerCase();

  if (tecla === "escape") return { tipo: "cancelar" };
  if ((tecla === "delete" || tecla === "backspace") && !mod) return { tipo: "apagar" };
  if (mod && tecla === "z" && evento.shiftKey) return { tipo: "redo" };
  if (mod && tecla === "z") return { tipo: "undo" };
  if (mod && tecla === "y") return { tipo: "redo" }; // convenção alternativa comum, sem conflito conhecido no projeto

  if (!mod && !evento.shiftKey) {
    const ferramenta = TECLA_PARA_FERRAMENTA[tecla];
    if (ferramenta && ferramentasDisponiveis.includes(ferramenta)) return { tipo: "ferramenta", id: ferramenta };
  }
  return null;
}

/** A checagem "alvo é editável" que `interpretarAtalho` espera já resolvida — separada pra não exigir DOM no teste da lógica de atalho. */
export function elementoEhEditavel(el: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
