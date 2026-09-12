"use client";

/**
 * Enquadramento de imagem — UM só, para a ficha e para o mapa.
 *
 * ── POR QUE ISTO NÃO É POLIMENTO ────────────────────────────────────
 * Uma foto retangular jogada num avatar corta cabeça ou queixo em quase
 * todo caso — e a pessoa só descobre DEPOIS de subir, porque o lugar
 * onde ela escolheu o arquivo não tem a forma.
 *
 * Então a prévia aqui é recortada por um CÍRCULO, e não por um quadrado
 * "que dá pra imaginar". Um só formato: ficha e mapa pedem a mesma
 * imagem, e a pessoa não deveria enquadrar duas vezes de jeitos
 * diferentes para o mesmo rosto.
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
import { createPortal } from "react-dom";
import { RotateCcw, ZoomIn } from "lucide-react";

/** Lado da janela de enquadramento, em pixels de tela. */
const JANELA = 240;

export interface RecorteEscolhido {
  x: number;
  y: number;
  tamanho: number;
}

/** Cantos em bracket — os mesmos quatro da janela de ferramenta. */
const CANTOS = ["tl", "tr", "bl", "br"] as const;

/** "RETRATO-MARA.PNG · 132 KB" — nome (cortado se for longo) e peso. */
function descricaoDoArquivo(arquivo: File): string {
  const nome = arquivo.name.length > 28 ? `${arquivo.name.slice(0, 25)}…` : arquivo.name;
  const kb = arquivo.size / 1024;
  const peso = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`;
  return `${nome} · ${peso}`;
}

/**
 * JANELA DE ENQUADRAMENTO — a moldura ÚNICA dos dois enquadramentos.
 *
 * Antes eram duas: o Console abria `.rc-recorte-modal` (fixa, com
 * título próprio) e o VTT desenhava o passo INLINE dentro do editor de
 * retrato, com outro título, outro erro e outro espaçamento. O miolo já
 * era o mesmo componente; o que divergia era justamente a casca — e
 * por isso as duas telas pareciam de produtos diferentes fazendo a
 * mesma coisa.
 *
 * O desenho é o da janela de ferramenta do VTT: espinha com código
 * vertical, brackets nos quatro cantos, cabeçalho em display caixa alta
 * com a linha de modo em mono. Em estilo inline, e não pelas classes
 * `.rv-fp`, porque `vtt.css` só carrega nas rotas do VTT e este passo
 * também roda em `/ficha` — mesmo motivo já registrado na moldura de
 * `_dados3d/ResultadoRolagem.tsx`.
 *
 * PORTAL PARA O `body`, e isso não é detalhe: no VTT o editor de
 * retrato mora dentro do HUD do token, e `.rv-hud` tem
 * `filter: drop-shadow(...)`. Um ancestral com `filter` (ou
 * `transform`, ou `contain`) vira o bloco de contenção de qualquer
 * `position: fixed` abaixo dele — então a janela se centrava NO HUD,
 * nascia baixa e tinha o rodapé cortado pela borda da tela. No `body`
 * ela volta a se medir pela viewport.
 *
 * O wrapper leva `.rc-cursor-scope` porque sai do portal do
 * `ConsoleWindow`: sem ele o cursor nativo reapareceria por cima da
 * janela (o `HudCursor` continua desenhando o anél por baixo).
 */
export function JanelaRecorte({
  erro, ...props
}: Parameters<typeof RecorteImagem>[0] & {
  /** Falha do envio, mostrada no rodapé sem tirar a janela do lugar. */
  erro?: string | null;
}) {
  const titulo = "Enquadrar o avatar";
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);
  if (!montado) return null;

  return createPortal(
    <div className="rc-cursor-scope rc-recorte-janela" role="dialog" aria-modal="true" aria-label={titulo}>
      {CANTOS.map((c) => (
        <span key={c} className="rc-recorte-janela__canto" data-canto={c} aria-hidden="true" />
      ))}
      <span className="rc-recorte-janela__espinha" aria-hidden="true">
        <span className="rc-recorte-janela__indice">::</span>
        <span className="rc-recorte-janela__codigo">Avatar</span>
        <span className="rc-recorte-janela__ponto" />
      </span>
      <div className="rc-recorte-janela__corpo">
        <header className="rc-recorte-janela__cab">
          <h2 className="rc-recorte-janela__titulo">{titulo}</h2>
          {/* A linha de modo das janelas de ferramenta diz o ESTADO
              ("pronto", "medindo"). Aqui o estado útil é QUAL arquivo
              está na mesa — nome e peso, que é o que a pessoa precisa
              para saber se pegou o arquivo certo. "Círculo do avatar"
              só repetia o que a própria prévia mostra. */}
          <p className="rc-recorte-janela__modo">{descricaoDoArquivo(props.arquivo)}</p>
        </header>
        <RecorteImagem {...props} />
        {erro && <p className="rc-recorte-janela__erro" role="alert">{erro}</p>}
      </div>
    </div>,
    document.body,
  );
}

export function RecorteImagem({
  arquivo, onConfirmar, onCancelar, ocupado = false, rotuloConfirmar = "Salvar avatar",
}: {
  arquivo: File;
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
          style={{ clipPath: "circle(50% at 50% 50%)" }}
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
          /* O trilho preenchido até a posição atual: o Chrome não tem
             `::-moz-range-progress`, então a parada do gradiente vem
             daqui — mesma solução dos sliders das ferramentas. */
          style={{ ["--jr-pct" as string]: `${((zoom * 100 - 100) / 5)}%` }}
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
