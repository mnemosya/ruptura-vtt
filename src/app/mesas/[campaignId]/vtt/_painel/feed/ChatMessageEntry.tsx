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

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ImageOff, Lock, Radio, ShieldAlert, X } from "lucide-react";
import type { CartaoMensagem } from "./contratos";
import { rotuloVisibilidade } from "./contratos";
import { BotaoMenuCard } from "./MenuCard";
import { useImagemFeed, useRetratoFeed } from "./retratos";

/**
 * Imagem anexada à mensagem. O espaço é reservado pelas medidas
 * gravadas (sem pulo quando ela carrega); clicar abre em tamanho cheio.
 */
function ImagemDaMensagem({ imagem }: { imagem: NonNullable<CartaoMensagem["imagem"]> }) {
  const assinada = useImagemFeed(imagem.previewUrl ? null : imagem.id);
  const url = imagem.previewUrl ?? assinada;
  const [ampliada, setAmpliada] = useState(false);

  useEffect(() => {
    if (!ampliada) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") setAmpliada(false); };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [ampliada]);

  const proporcao = imagem.largura && imagem.altura ? `${imagem.largura} / ${imagem.altura}` : "4 / 3";
  return (
    <>
      <button
        type="button"
        className="pn-msg-imagem"
        style={{ aspectRatio: proporcao }}
        onClick={() => url && setAmpliada(true)}
        aria-label="Ampliar imagem"
        disabled={!url}
        data-carregando={url ? undefined : "true"}
      >
        {url && <img src={url} alt="" draggable={false} />}
      </button>
      {ampliada && url && typeof document !== "undefined" && createPortal(
        <div className="rv-imagem-ampliada" role="dialog" aria-label="Imagem ampliada" onClick={() => setAmpliada(false)}>
          <img src={url} alt="" onClick={(e) => e.stopPropagation()} />
          <button type="button" className="rv-imagem-ampliada-fechar" aria-label="Fechar" onClick={() => setAmpliada(false)}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}

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
  propria,
  pendente,
}: {
  cartao: CartaoMensagem;
  papel: "narrator" | "player";
  hora: string;
  continuacao: boolean;
  /** A mensagem é da conta que está vendo o feed — espelha para a direita. */
  propria?: boolean;
  pendente?: boolean;
}) {
  const narracao = cartao.estilo === "narracao";
  const selo = rotuloVisibilidade(cartao.visibilidade, papel);
  const privada = cartao.visibilidade !== "public";
  const personagem = cartao.autoria.tipo === "personagem";
  /* Balão de conversa (board "Chat Log"): avatar REDONDO fora do card, à
     esquerda; a mensagem da própria conta espelha para a direita. O
     avatar e a cor do nome seguem o lado do personagem (ciano PJ,
     vermelho PN); sem retrato, cai na sigla. */
  const retrato = useRetratoFeed(personagem ? cartao.autoria.characterId : null);
  const avatarUrl = retrato?.avatarUrl ?? null;
  const corLado = retrato?.tipo === "pn" ? "var(--rv-dg)" : "var(--rv-cy)";

  return (
    <div
      className="pn-msg"
      data-narracao={narracao ? "true" : undefined}
      data-privada={privada ? "true" : undefined}
      data-continuacao={continuacao ? "true" : undefined}
      data-propria={propria ? "true" : undefined}
      data-acento={narracao ? "am" : privada ? "neutro" : "cy"}
      data-testid="painel-feed-mensagem"
      data-visibility={cartao.visibilidade}
    >
      <div className="pn-msg-linha">
        {continuacao ? (
          <span className="pn-msg-av pn-msg-av--vazio" aria-hidden="true" />
        ) : (
          <span
            className="pn-msg-av"
            style={{ "--fg-a": personagem ? corLado : "var(--pn-txt)" } as React.CSSProperties}
            aria-hidden="true"
          >
            {avatarUrl
              ? <img className="pn-msg-av-img" src={avatarUrl} alt="" draggable={false} />
              : iniciais(cartao.autoria.nome)}
          </span>
        )}
        <div className="pn-msg-bolha">
          {!continuacao && (
            <div className="pn-msg-cab">
              <span className="pn-msg-autor" style={personagem ? { color: corLado } : undefined}>{cartao.autoria.nome}</span>
              {narracao && (
                <span className="pn-msg-selo" data-acento="am">
                  <Radio size={9} aria-hidden="true" /> Narração
                </span>
              )}
              <time className="pn-msg-hora" dateTime={cartao.criadoEm}>{hora}</time>
              <BotaoMenuCard />
            </div>
          )}
          {/* Continuação não repete o cabeçalho; o "⋯" fica no canto do balão. */}
          {continuacao && <span className="pn-msg-cont-acoes"><BotaoMenuCard /></span>}
          {cartao.imagem && <ImagemDaMensagem imagem={cartao.imagem} />}
          {cartao.imagemRemovida && (
            <p className="pn-msg-imagem-removida"><ImageOff size={13} aria-hidden="true" /> Imagem removida</p>
          )}
          {(cartao.texto || selo || pendente || (!cartao.imagem && !cartao.imagemRemovida)) && <p className="pn-msg-texto">
            {/* O selo de privacidade acompanha o TEXTO — sobrevive à continuação. */}
            {selo && (
              <span className="pn-msg-selo" data-acento={cartao.visibilidade === "gm" ? "am" : "neutro"} data-testid="painel-feed-selo-visibilidade">
                {cartao.visibilidade === "gm" ? <ShieldAlert size={9} aria-hidden="true" /> : <Lock size={9} aria-hidden="true" />}
                {selo}{" "}
              </span>
            )}
            {cartao.texto}
            {pendente && <span className="pn-msg-selo" data-acento="neutro"> · enviando…</span>}
          </p>}
        </div>
      </div>
    </div>
  );
}
