"use client";

/**
 * Motion do botão principal da tela de acesso (Iniciar sessão / Criar
 * conta), na linguagem de SINAL — a mesma do subtítulo que decodifica. O
 * visual de cada estado está em `auth.css` (bloco "Botão: sinal"); aqui fica
 * só o que precisa de JS:
 *   - hover/foco: o rótulo decodifica (280ms);
 *   - clique: marca o ponto (`--cx`) e dispara a onda (`data-transmite`);
 *   - rótulo novo vindo do React (fases do envio, troca de modo, ACESSO
 *     CONCEDIDO, botão remontado): decodifica (240ms);
 *   - falha (`abalo` mudou): dispara o tranco vermelho (`data-falha`).
 *
 * A decodificação PERMUTA as próprias letras que faltam resolver, sem
 * inventar caracteres: a largura do rótulo não muda e o texto centralizado
 * não treme. Tudo por delegação no painel: o formulário remonta ao trocar de
 * modo, e o botão novo herda o comportamento.
 */

import { useEffect, type RefObject } from "react";

const SEL = "[data-testid='login-submit']";

/** O nó de texto do rótulo (o botão pode ter outros filhos). */
function rotuloDe(botao: HTMLElement): Text | null {
  for (const n of Array.from(botao.childNodes)) if (n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) return n as Text;
  return null;
}

/** Embaralha um nó de texto até `alvo` em `dur` ms. */
function decodificador() {
  let id = 0;
  let no: Text | null = null;
  let alvo = "";
  let escrito = "";
  const parar = () => {
    cancelAnimationFrame(id);
    if (no && no.isConnected && no.data === escrito) { no.data = alvo; escrito = alvo; }
    no = null;
  };
  const rodar = (n: Text, texto: string, dur: number) => {
    parar();
    no = n; alvo = texto; escrito = texto;
    const inicio = performance.now();
    let ultimo = -Infinity;
    const passo = (t: number) => {
      if (!no) return;
      // O React reescreveu o rótulo no meio (fase, modo): recomeça com o texto novo.
      if (no.data !== escrito) { const n2 = no; const novo = n2.data; no = null; rodar(n2, novo, dur); return; }
      // O carimbo do rAF é o início do quadro e pode vir antes de `inicio`: piso em 0.
      const p = Math.min(1, Math.max(0, (t - inicio) / dur));
      if (p >= 1) { parar(); return; }
      id = requestAnimationFrame(passo);
      if (t - ultimo < 35) return;
      ultimo = t;
      const fixos = Math.floor(p * alvo.length);
      const resto = alvo.slice(fixos).replace(/ /g, "").split("");
      for (let i = resto.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [resto[i], resto[j]] = [resto[j], resto[i]]; }
      let s = alvo.slice(0, fixos);
      for (let i = fixos; i < alvo.length; i++) s += alvo[i] === " " ? " " : resto.shift();
      escrito = s;
      no.data = s;
    };
    id = requestAnimationFrame(passo);
  };
  return { rodar, parar, escrito: () => escrito };
}

/** Reinicia uma animação de CSS ligada a um atributo. */
function redisparar(el: HTMLElement, attr: string) {
  el.removeAttribute(attr);
  void el.offsetWidth;
  el.setAttribute(attr, "");
}

export function useBotaoSinal(painelRef: RefObject<HTMLElement | null>, abalo: number) {
  useEffect(() => {
    const painel = painelRef.current;
    if (!painel) return;
    const calmo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const alvoDe = (e: Event) => (e.target as Element | null)?.closest?.(SEL) as HTMLElement | null;
    const dec = decodificador();

    const aoEntrar = (e: PointerEvent | FocusEvent) => {
      const botao = alvoDe(e);
      if (!botao || botao.contains(e.relatedTarget as Node | null)) return;
      if (calmo || botao.hasAttribute("disabled") || botao.hasAttribute("data-estado")) return;
      dec.parar(); // devolve o rótulo inteiro antes de ler (hover repetido no meio)
      const n = rotuloDe(botao);
      if (n) dec.rodar(n, n.data, 280);
    };
    const aoApertar = (e: PointerEvent) => {
      const botao = alvoDe(e);
      if (!botao || botao.hasAttribute("disabled")) return;
      const r = botao.getBoundingClientRect();
      botao.style.setProperty("--cx", `${((e.clientX - r.left) / r.width) * 100}%`);
      if (!calmo) redisparar(botao, "data-transmite");
    };
    const aoFimAnim = (e: AnimationEvent) => {
      const botao = alvoDe(e);
      if (!botao) return;
      if (e.animationName === "rv-onda") botao.removeAttribute("data-transmite");
      if (e.animationName === "rv-falha") botao.removeAttribute("data-falha");
    };
    const obs = new MutationObserver(() => {
      if (calmo) return;
      const botao = painel.querySelector<HTMLElement>(SEL);
      const n = botao && rotuloDe(botao);
      if (!n || n.data === dec.escrito()) return;
      dec.rodar(n, n.data, 240);
    });
    obs.observe(painel, { childList: true, characterData: true, subtree: true });

    painel.addEventListener("pointerover", aoEntrar);
    painel.addEventListener("focusin", aoEntrar);
    painel.addEventListener("pointerdown", aoApertar);
    painel.addEventListener("animationend", aoFimAnim);
    return () => {
      obs.disconnect();
      painel.removeEventListener("pointerover", aoEntrar);
      painel.removeEventListener("focusin", aoEntrar);
      painel.removeEventListener("pointerdown", aoApertar);
      painel.removeEventListener("animationend", aoFimAnim);
      dec.parar();
    };
  }, [painelRef]);

  // Falha: o tranco vermelho no botão, junto com o do painel.
  useEffect(() => {
    if (!abalo) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const botao = painelRef.current?.querySelector<HTMLElement>(SEL);
    if (botao) redisparar(botao, "data-falha");
  }, [abalo, painelRef]);
}
