"use client";

/**
 * MENSAGEM — card de conversa (Figma "FioCardB", nó 469:7881).
 *
 * Duas faixas: um CABEÇALHO com fundo próprio (avatar redondo, nome em
 * mono ciano caixa alta, hora à direita) e o CORPO com a fala. A
 * separação horizontal é o que distingue conversa de card mecânico —
 * aqueles se dividem na VERTICAL, pela espinha.
 *
 * Mensagens consecutivas do mesmo autor, na mesma visibilidade e dentro
 * de uma janela curta, compartilham o cabeçalho (`continuacao`) — mas
 * o selo de privacidade NUNCA é suprimido: autoria e privacidade
 * precisam permanecer inequívocas linha a linha.
 */

import { Lock, Radio, ShieldAlert } from "lucide-react";
import type { CartaoMensagem } from "./contratos";
import { rotuloVisibilidade } from "./contratos";

/** Iniciais do avatar — uma letra para nome simples, duas para composto. */
function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 1).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function ChatMessageEntry({
  cartao,
  papel,
  hora,
  continuacao,
  pendente,
}: {
  cartao: CartaoMensagem;
  papel: "narrator" | "player";
  hora: string;
  continuacao: boolean;
  pendente?: boolean;
}) {
  const narracao = cartao.estilo === "narracao";
  const selo = rotuloVisibilidade(cartao.visibilidade, papel);
  const privada = cartao.visibilidade !== "public";

  return (
    <div
      className="pn-msg"
      data-narracao={narracao ? "true" : undefined}
      data-privada={privada ? "true" : undefined}
      data-continuacao={continuacao ? "true" : undefined}
      data-acento={narracao ? "am" : privada ? "neutro" : "cy"}
      data-testid="painel-feed-mensagem"
      data-visibility={cartao.visibilidade}
    >
      {!continuacao && (
        <div className="pn-msg-cab">
          <span className="pn-msg-face" aria-hidden="true">{iniciais(cartao.autoria.nome)}</span>
          <span className="pn-msg-autor">{cartao.autoria.nome}</span>
          {narracao && (
            <span className="pn-msg-selo" data-acento="am">
              <Radio size={9} aria-hidden="true" /> Narração
            </span>
          )}
          <time className="pn-msg-hora" dateTime={cartao.criadoEm}>{hora}</time>
        </div>
      )}
      <p className="pn-msg-texto">
        {/* O selo de privacidade acompanha o TEXTO, não o cabeçalho —
            assim ele sobrevive à continuação. */}
        {selo && (
          <span className="pn-msg-selo" data-acento={cartao.visibilidade === "gm" ? "am" : "neutro"} data-testid="painel-feed-selo-visibilidade">
            {cartao.visibilidade === "gm" ? <ShieldAlert size={9} aria-hidden="true" /> : <Lock size={9} aria-hidden="true" />}
            {selo}{" "}
          </span>
        )}
        {cartao.texto}
        {pendente && <span className="pn-msg-selo" data-acento="neutro"> · enviando…</span>}
      </p>
    </div>
  );
}
