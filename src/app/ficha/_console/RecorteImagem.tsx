"use client";

/**
 * Enquadramento de imagem para as formas do produto — o hexágono do
 * avatar na ficha e o círculo do retrato no mapa.
 *
 * ── POR QUE ISTO NÃO É POLIMENTO ────────────────────────────────────
 * O avatar é desenhado com `clip-path` hexagonal (`AvatarHexPolygon`) e
 * o token dentro de um círculo (`clip-path` em `_mapa/MapaHex.tsx`). Uma
 * foto retangular jogada numa dessas formas corta cabeça ou queixo em
 * quase todo caso — e a pessoa só descobre DEPOIS de subir, porque o
 * lugar onde ela escolheu o arquivo não tem a forma.
 *
 * Então a prévia aqui é recortada pela MESMA forma de destino, e não
 * por um quadrado "que dá pra imaginar". Ver a imagem já hexagonal é a
 * diferença entre enquadrar e adivinhar.
 *
 * ── O QUE ELE DEVOLVE ───────────────────────────────────────────────
 * Um retângulo de origem em pixels da imagem original. Quem chama passa
 * isso para `prepararRecorteQuadrado`, que desenha no `<canvas>` e só aí
 * calcula o `sha256` — o arquivo que sobe já é o recorte. Ver o
 * comentário daquela função para o porquê da ordem.
 *
 * ── O GESTO ─────────────────────────────────────────────────────────
 * Arrastar move a imagem sob a janela fixa; a roda e o slider dão zoom.
 * A janela não se move e não gira: uma moldura fixa com conteúdo móvel
 * é o modelo que toda ferramenta de foto usa, e é o que a mão espera.
 *
 * O zoom parte do "preenche a janela" (`escalaMinima`) e nunca desce
 * abaixo dele — abaixo disso sobraria vazio dentro da forma, que é
 * exatamente o defeito que este componente existe para evitar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, ZoomIn } from "lucide-react";

/** Lado da janela de enquadramento, em pixels de tela. */
const JANELA = 240;

export type FormaRecorte = "hexagono" | "circulo";

/**
 * O polígono do avatar, COPIADO de `.rc-avatar-fill`
 * (`_design/console.css`) — não um hexágono regular aproximado.
 *
 * A cópia é o ponto do componente: se a prévia usasse uma forma
 * "parecida", ela mentiria justamente sobre a única coisa que ela
 * existe para mostrar. Se aquele `clip-path` mudar, este precisa mudar
 * junto — e é por isso que os dois dizem de onde vieram.
 */
const CLIP_AVATAR =
  "polygon(49.93% 0%, 89.97% 19.77%, 99.86% 64.17%, 72.15% 99.78%, 27.71% 99.78%, 0% 64.17%, 9.89% 19.77%)";

export interface RecorteEscolhido {
  x: number;
  y: number;
  tamanho: number;
}

export function RecorteImagem({
  arquivo, forma, onConfirmar, onCancelar, ocupado = false, rotuloConfirmar = "Usar esta imagem",
}: {
  arquivo: File;
  forma: FormaRecorte;
  onConfirmar: (recorte: RecorteEscolhido) => void;
  onCancelar: () => void;
  ocupado?: boolean;
  rotuloConfirmar?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  // Centro do recorte, em coordenadas da IMAGEM. Guardar o centro (e não
  // o canto) faz o zoom acontecer em torno do que a pessoa enquadrou,
  // em vez de escorregar para o canto superior esquerdo.
  const [centro, setCentro] = useState<{ x: number; y: number } | null>(null);
  const arrasteRef = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(arquivo);
    setUrl(objectUrl);
    const img = new Image();
    img.onload = () => {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setCentro({ x: img.naturalWidth / 2, y: img.naturalHeight / 2 });
      setZoom(1);
    };
    img.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [arquivo]);

  /** Lado do recorte na imagem, em pixels dela. Zoom 1 = o maior quadrado que cabe. */
  const ladoRecorte = useMemo(() => {
    if (!natural) return 0;
    return Math.min(natural.w, natural.h) / zoom;
  }, [natural, zoom]);

  // Prender o centro para o recorte nunca sair da imagem — o mesmo
  // motivo do clamp em `prepararRecorteQuadrado`: faixa vazia dentro da
  // forma parece defeito, não escolha.
  const centroPreso = useMemo(() => {
    if (!natural || !centro) return null;
    const meio = ladoRecorte / 2;
    return {
      x: Math.max(meio, Math.min(centro.x, natural.w - meio)),
      y: Math.max(meio, Math.min(centro.y, natural.h - meio)),
    };
  }, [natural, centro, ladoRecorte]);

  const mover = useCallback((e: PointerEvent) => {
    const a = arrasteRef.current;
    if (!a || !natural) return;
    // Converte o deslocamento da TELA para pixels da IMAGEM: com zoom
    // alto, um centímetro de mão precisa mover menos imagem.
    const escala = ladoRecorte / JANELA;
    setCentro({
      x: a.cx - (e.clientX - a.px) * escala,
      y: a.cy - (e.clientY - a.py) * escala,
    });
  }, [natural, ladoRecorte]);

  useEffect(() => {
    function soltar() { arrasteRef.current = null; }
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  }, [mover]);

  if (!url || !natural || !centroPreso) {
    return <div className="rc-recorte rc-recorte--carregando">Lendo a imagem…</div>;
  }

  // A imagem é posicionada por trás da janela: a escala leva o lado do
  // recorte a caber exatamente em `JANELA`.
  const escalaTela = JANELA / ladoRecorte;
  const estiloImagem: React.CSSProperties = {
    position: "absolute",
    width: natural.w * escalaTela,
    height: natural.h * escalaTela,
    left: JANELA / 2 - centroPreso.x * escalaTela,
    top: JANELA / 2 - centroPreso.y * escalaTela,
    maxWidth: "none",
  };

  return (
    <div className="rc-recorte">
      <div
        className="rc-recorte__janela"
        style={{ width: JANELA, height: JANELA }}
        onPointerDown={(e) => {
          if (ocupado) return;
          e.preventDefault();
          arrasteRef.current = { px: e.clientX, py: e.clientY, cx: centroPreso.x, cy: centroPreso.y };
        }}
        onWheel={(e) => {
          if (ocupado) return;
          // Multiplicativo, como o zoom do mapa: cada notch "pesa" o
          // mesmo em qualquer nível.
          setZoom((z) => Math.min(6, Math.max(1, z * Math.exp(-e.deltaY * 0.0015))));
        }}
      >
        {/* Duas cópias: a de baixo, escurecida, mostra o que FICA DE
            FORA — sem ela a pessoa não sabe quanto da foto está sendo
            descartado, e enquadra às cegas. */}
        <div className="rc-recorte__fora" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" style={estiloImagem} draggable={false} />
        </div>
        <div
          className="rc-recorte__dentro"
          style={{ clipPath: forma === "hexagono" ? CLIP_AVATAR : "circle(50% at 50% 50%)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Prévia do enquadramento" style={estiloImagem} draggable={false} />
        </div>
      </div>

      <label className="rc-recorte__zoom">
        <ZoomIn size={13} aria-hidden />
        <input
          type="range" min={100} max={600} step={5}
          value={Math.round(zoom * 100)} disabled={ocupado}
          onChange={(e) => setZoom(Number(e.target.value) / 100)}
          aria-label="Aproximar"
        />
        <button
          type="button" className="rc-recorte__reset" disabled={ocupado}
          onClick={() => { setZoom(1); setCentro({ x: natural.w / 2, y: natural.h / 2 }); }}
          aria-label="Voltar ao enquadramento inicial"
        >
          <RotateCcw size={13} aria-hidden />
        </button>
      </label>

      <p className="rc-recorte__dica">Arraste para enquadrar · role para aproximar</p>

      <div className="rc-recorte__acoes">
        <button type="button" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
        <button
          type="button" className="rc-recorte__confirmar" disabled={ocupado}
          onClick={() => onConfirmar({
            x: Math.round(centroPreso.x - ladoRecorte / 2),
            y: Math.round(centroPreso.y - ladoRecorte / 2),
            tamanho: Math.round(ladoRecorte),
          })}
        >
          {ocupado ? "Enviando…" : rotuloConfirmar}
        </button>
      </div>
    </div>
  );
}
