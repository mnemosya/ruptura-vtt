"use client";

/**
 * CHAT DE MENTIRA — o painel lateral do VTT (`.rv-painel`, 316 px,
 * flutuando a 8 px da borda) com a folha REAL do Chat Log
 * (`painel.css`, `.rv-pn-chat`). Só mostra os cartões das rolagens
 * feitas na própria tela, desenhados pela proposta.
 *
 * O cartão entra quando os dois dados assentaram — é quando a rolagem
 * de verdade seria gravada (`registrarRolagemPericiaAction`).
 */

import { useEffect, useRef } from "react";
import { MessagesSquare } from "lucide-react";
import { useProto } from "./estado";

export function ChatFalso() {
  const { rolagens, proposta, focoCartao, focarCartao } = useProto();
  const rolar = useRef<HTMLDivElement>(null);
  const visiveis = rolagens.filter((r) => r.fase === "completa");
  const ultimo = visiveis.at(-1)?.id;

  useEffect(() => {
    const el = rolar.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [ultimo]);

  // Pedido de foco (a janela aponta o cartão): rola até ele e acende.
  useEffect(() => {
    if (!focoCartao) return;
    const alvo = rolar.current?.querySelector<HTMLElement>(`[data-rolagem="${focoCartao}"]`);
    if (!alvo) return;
    alvo.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const botao = alvo.querySelector<HTMLElement>("[data-foco-cartao]");
    botao?.focus({ preventScroll: true });
    const linha = alvo.closest(".pn-cartao-linha") as HTMLElement | null;
    linha?.setAttribute("data-focado", "true");
    const t = setTimeout(() => { linha?.removeAttribute("data-focado"); focarCartao(null); }, 900);
    return () => clearTimeout(t);
  }, [focoCartao, focarCartao]);

  return (
    <aside className="rv-painel rp-chat" data-aberto="true" aria-label="Chat da mesa">
      <header className="rp-chat-cab">
        <MessagesSquare size={15} strokeWidth={1.8} aria-hidden="true" />
        <span>Chat</span>
        <span className="rp-chat-cab-meta">{visiveis.length} {visiveis.length === 1 ? "registro" : "registros"}</span>
      </header>
      <div className="rv-pn-chat">
        <div className="rv-pn-chat-feedwrap">
          <div className="rv-pn-chat-scroll rp-chat-lista" ref={rolar} data-testid="chat-lista">
            {visiveis.length === 0 && <p className="rp-chat-vazio">Nenhuma rolagem nesta cena</p>}
            {visiveis.map((r) => (
              <div key={r.id} className="rp-chat-item">
                <proposta.Cartao r={r} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
