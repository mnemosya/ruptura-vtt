"use client";

/**
 * CAMADAS — a pilha única do que está aberto por cima da tela: janelas,
 * diálogos, menus e dicas.
 *
 * Existe por um bug concreto. Cada camada escutava `keydown` no
 * `window`, na fase de captura, e chamava `stopPropagation()`. Isso não
 * impede outro ouvinte no MESMO nó: um Esc num menu aberto dentro de uma
 * janela fechava o menu E a janela. Aqui só a camada do topo (a última
 * aberta) recebe o Esc.
 *
 * O ouvinte fica no `window`, na fase de BOLHA: um campo dentro da
 * camada que usa Esc para outra coisa (cancelar uma renomeação, fechar
 * sugestões) chama `preventDefault()` e a camada não fecha. Ele entra
 * quando este módulo carrega, antes dos ouvintes que os componentes
 * registram nos próprios efeitos, e `stopImmediatePropagation()` impede
 * que esses outros reajam ao mesmo Esc.
 *
 * Camada MODAL ainda contém o Tab: do último focável volta ao primeiro,
 * e vice-versa. Só age quando o foco está dentro dela (ou solto no
 * `body`). Foco num menu ou numa dica que a camada abriu por portal fica
 * onde está.
 */

import { useEffect, useRef, type RefObject } from "react";

interface Camada {
  id: symbol;
  /**
   * Lido na hora da tecla. Função: o Esc fecha a camada. `null`: a
   * camada consome o Esc sem fechar (fluxo que não se dispensa).
   * `undefined`: o Esc segue adiante, para quem mais o escuta (a Forja
   * carregada, por exemplo, deixa o Esc para os Códex dela).
   */
  fechar: () => (() => void) | null | undefined;
  raiz: () => HTMLElement | null;
  modal: boolean;
}

const pilha: Camada[] = [];

const SELETOR_FOCAVEIS = [
  "a[href]",
  "area[href]",
  "button:not(:disabled)",
  "input:not(:disabled):not([type='hidden'])",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "summary",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function visivel(el: HTMLElement): boolean {
  if (el.closest("[inert]")) return false;
  if (typeof el.checkVisibility === "function") return el.checkVisibility({ visibilityProperty: true });
  return el.getClientRects().length > 0;
}

export function listarFocaveis(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(SELETOR_FOCAVEIS)).filter(
    (el) => el.tabIndex >= 0 && visivel(el),
  );
}

/**
 * Dicas feitas só de CSS (`:hover`/`:focus-visible` mostram a `.ca-dica`
 * de dentro do botão) não têm estado para fechar. Esc as esconde pelo
 * atributo na raiz até o mouse ou o foco irem para outro elemento: é o
 * "dispensável sem mover o ponteiro" da WCAG 1.4.13. Não consome a tecla.
 */
function esconderDicasCss() {
  document.documentElement.setAttribute("data-dicas-ocultas", "");
}
function mostrarDicasCss() {
  if (document.documentElement.hasAttribute("data-dicas-ocultas")) {
    document.documentElement.removeAttribute("data-dicas-ocultas");
  }
}

function aoTeclar(e: KeyboardEvent) {
  if (e.key === "Escape" && !e.isComposing) esconderDicasCss();
  if (e.defaultPrevented || pilha.length === 0) return;

  if (e.key === "Escape") {
    // Esc que confirma uma composição (IME, acento morto) não é pedido
    // de fechar.
    if (e.isComposing || e.keyCode === 229) return;
    const fechar = pilha[pilha.length - 1].fechar();
    if (fechar === undefined) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    fechar?.();
    return;
  }

  if (e.key !== "Tab") return;
  let modal: Camada | undefined;
  for (let i = pilha.length - 1; i >= 0; i--) {
    if (pilha[i].modal) { modal = pilha[i]; break; }
  }
  const raiz = modal?.raiz();
  if (!raiz) return;
  const ativo = document.activeElement as HTMLElement | null;
  const solto = !ativo || ativo === document.body;
  if (!solto && !raiz.contains(ativo)) return;

  const focaveis = listarFocaveis(raiz);
  if (focaveis.length === 0) {
    e.preventDefault();
    return;
  }
  const primeiro = focaveis[0];
  const ultimo = focaveis[focaveis.length - 1];
  if (solto) {
    e.preventDefault();
    (e.shiftKey ? ultimo : primeiro).focus({ preventScroll: true });
  } else if (!e.shiftKey && (ativo === ultimo || ativo === raiz)) {
    e.preventDefault();
    primeiro.focus({ preventScroll: true });
  } else if (e.shiftKey && (ativo === primeiro || ativo === raiz)) {
    e.preventDefault();
    ultimo.focus({ preventScroll: true });
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", aoTeclar);
  window.addEventListener("pointerover", mostrarDicasCss, { passive: true });
  window.addEventListener("focusin", mostrarDicasCss);
}

/** Registra uma camada; devolve quem a tira da pilha e quem diz se ela é a de cima. */
export function registrarCamada(camada: Omit<Camada, "id">): { sair: () => void; ehTopo: () => boolean } {
  const registro: Camada = { ...camada, id: Symbol("camada") };
  pilha.push(registro);
  return {
    sair: () => {
      const i = pilha.indexOf(registro);
      if (i >= 0) pilha.splice(i, 1);
    },
    ehTopo: () => pilha[pilha.length - 1] === registro,
  };
}

/**
 * Põe o componente na pilha enquanto `aberta`.
 *
 * `fechar` é lido por ref: a camada entra na pilha UMA vez por abertura.
 * Registrar de novo a cada render a mandaria para o topo e roubaria o Esc
 * de quem está por cima.
 *
 * `modal`: além do Esc, contém o Tab e põe o foco na camada ao abrir
 * (se ninguém já pôs) e o devolve a quem abriu ao fechar.
 */
export function useCamada({
  aberta,
  fechar,
  raiz,
  modal = false,
}: {
  aberta: boolean;
  fechar?: (() => void) | null;
  raiz?: RefObject<HTMLElement | null>;
  modal?: boolean;
}) {
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;
  const topoRef = useRef<() => boolean>(() => true);

  useEffect(() => {
    if (!aberta) return;
    const { sair, ehTopo } = registrarCamada({
      fechar: () => fecharRef.current,
      raiz: () => raiz?.current ?? null,
      modal,
    });
    topoRef.current = ehTopo;
    if (!modal) return sair;

    const abridor = document.activeElement as HTMLElement | null;
    let quadro = requestAnimationFrame(() => {
      // Um quadro a mais: componentes que focam o próprio campo fazem
      // isso num `requestAnimationFrame` do efeito deles.
      quadro = requestAnimationFrame(() => {
        const el = raiz?.current;
        if (!el || el.contains(document.activeElement)) return;
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
        el.focus({ preventScroll: true });
      });
    });
    return () => {
      cancelAnimationFrame(quadro);
      sair();
      const el = raiz?.current;
      const ativo = document.activeElement;
      const focoPerdido = !ativo || ativo === document.body || (el?.contains(ativo) ?? false);
      if (focoPerdido && abridor?.isConnected) abridor.focus({ preventScroll: true });
    };
    // `raiz` é um ref estável; `fechar` é lido pelo ref acima.
  }, [aberta, modal]);

  /**
   * Para quem ainda trata o Esc no próprio ouvinte (o Console da ficha,
   * com as regras de edição inline dele): só aja quando isto for `true`.
   */
  const api = useRef({ ehTopo: () => topoRef.current() });
  return api.current;
}
