"use client";

/**
 * BIBLIOTECA DE IMAGENS DA CAMPANHA — escolher um arquivo que já está
 * aqui, em vez de subir o mesmo de novo.
 *
 * ── POR QUE ELA EXISTE ──────────────────────────────────────────────
 * O envio já reconhece conteúdo repetido pelo `sha256` e, nesse caso,
 * só cria um uso novo do asset (ver `confirmarColocacao`). Mas esse
 * atalho depende de a pessoa ACHAR o arquivo original no computador —
 * meses depois, num mapa que ela usou uma vez. A biblioteca mostra o
 * que a campanha já tem e transforma o atalho em escolha.
 *
 * PURAMENTE APRESENTACIONAL, como `PainelImagens`: recebe a lista já
 * lida e devolve a intenção. Nenhuma RPC aqui.
 *
 * ── O QUE ELA NÃO MOSTRA ────────────────────────────────────────────
 * Onde cada arquivo está em uso. `read_vtt_campaign_images` devolve
 * `id`, dimensões, peso e data — nada de usos. Inventar um "em uso
 * em 2 cenas" a partir do que o cliente tem à mão seria adivinhar;
 * quando a projeção carregar isso, a legenda ganha a informação.
 */

import { useState } from "react";
import { Images, Loader2, X } from "lucide-react";
import { type ImagemBiblioteca, pesoLegivel } from "../_dominio/imagemCena";

export interface PropsBibliotecaImagens {
  /** `null` enquanto a primeira leitura não voltou. */
  imagens: ImagemBiblioteca[] | null;
  carregando: boolean;
  /** URL assinada por asset — o mesmo mapa das imagens da cena. */
  urls: Record<string, string>;
  /** A cena já tem fundo? Então "fundo" sai de cena: trocar é outro gesto. */
  jaTemFundo: boolean;
  ocupado: boolean;
  onColocar: (imagem: ImagemBiblioteca, papel: "fundo" | "tile") => void;
  onFechar: () => void;
}

export function BibliotecaImagens({
  imagens, carregando, urls, jaTemFundo, ocupado, onColocar, onFechar,
}: PropsBibliotecaImagens) {
  /* O papel é escolhido ANTES de clicar na imagem: um clique só, e a
     miniatura é o botão. Perguntar depois ("como quer colocar?")
     colocaria um passo entre a escolha e o resultado. */
  const [papel, setPapel] = useState<"fundo" | "tile">(jaTemFundo ? "tile" : "fundo");
  const papelEfetivo = jaTemFundo ? "tile" : papel;

  return (
    <div className="rv-biblioteca" role="dialog" aria-modal="true" aria-label="Biblioteca de imagens" data-testid="biblioteca-imagens">
      <header className="rv-biblioteca__cab">
        <span className="rv-biblioteca__ico" aria-hidden><Images size={15} /></span>
        <div className="rv-biblioteca__txt">
          <h2 className="rv-biblioteca__titulo">Biblioteca da campanha</h2>
          <p className="rv-biblioteca__modo">
            {carregando
              ? "lendo…"
              : imagens === null
                ? "—"
                : `${imagens.length} ${imagens.length === 1 ? "arquivo" : "arquivos"}`}
          </p>
        </div>
        <button type="button" className="rv-biblioteca__fechar" onClick={onFechar} aria-label="Fechar biblioteca">
          <X size={15} />
        </button>
      </header>

      {/* Só faz sentido escolher o papel quando há os dois caminhos. */}
      {!jaTemFundo && (
        <div className="rv-biblioteca__papel rv-segmentado" role="group" aria-label="Colocar como">
          <button type="button" className="rv-segmentado-item" aria-checked={papel === "fundo"} role="radio"
            onClick={() => setPapel("fundo")}>
            <span className="rv-fp-seg-nome">Fundo</span>
            <span className="rv-fp-seg-sub">cobre a cena</span>
          </button>
          <button type="button" className="rv-segmentado-item" aria-checked={papel === "tile"} role="radio"
            onClick={() => setPapel("tile")}>
            <span className="rv-fp-seg-nome">Tile</span>
            <span className="rv-fp-seg-sub">peça solta</span>
          </button>
        </div>
      )}

      {carregando && imagens === null ? (
        <p className="rv-biblioteca__estado"><Loader2 size={13} className="rv-spin" aria-hidden /> Lendo a biblioteca…</p>
      ) : imagens !== null && imagens.length === 0 ? (
        <p className="rv-biblioteca__estado">Nenhuma imagem enviada nesta campanha ainda</p>
      ) : (
        <ul className="rv-biblioteca__grade">
          {(imagens ?? []).map((img) => {
            const url = urls[img.id];
            return (
              <li key={img.id}>
                <button
                  type="button" className="rv-biblioteca__item"
                  disabled={ocupado}
                  onClick={() => onColocar(img, papelEfetivo)}
                  title={`${img.widthPx}×${img.heightPx} · ${pesoLegivel(img.bytes)}`}
                  aria-label={`Colocar como ${papelEfetivo === "fundo" ? "fundo" : "tile"} — ${img.widthPx} por ${img.heightPx} pixels`}
                >
                  {/* Sem URL assinada a moldura fica vazia, não quebrada:
                      assinatura é renovável, não erro. */}
                  <span className="rv-biblioteca__miniatura">{url ? <img src={url} alt="" /> : null}</span>
                  <span className="rv-biblioteca__medida">{img.widthPx}×{img.heightPx}</span>
                  <span className="rv-biblioteca__peso">{pesoLegivel(img.bytes)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
