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
 * ── ROSTO NÃO ENTRA AQUI ────────────────────────────────────────────
 * A campanha guarda num lugar só os mapas, os retratos de token e os
 * avatares de ficha — a deduplicação por `sha256` é o que torna isso
 * barato. Mas isto é o seletor de imagem de CENA: avatar de personagem
 * não tem nada a ver com mapa, e listar os dois juntos só cria a
 * pergunta "o que essa cara está fazendo aqui?".
 *
 * A projeção (0108) conta os usos por tipo, e esta janela usa isso para
 * EXCLUIR o que serve de rosto — sem filtro, sem interruptor. Um
 * arquivo que também está numa cena continua aparecendo: aí ele é
 * imagem de cena, e o fato de alguém usá-lo como retrato não muda
 * isso.
 */

import { useMemo, useState } from "react";
import { Images, Loader2, Map, Shapes, X } from "lucide-react";
import { type ImagemBiblioteca, pesoLegivel, usoDaImagem } from "../_dominio/imagemCena";

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

  const visiveis = useMemo(
    () => (imagens ?? []).filter((i) => usoDaImagem(i) !== "rosto"),
    [imagens],
  );
  /* Quantos ficaram de fora por serem rosto — entra no rodapé da
     janela vazia, para a ausência não parecer defeito. */
  const rostos = (imagens ?? []).length - visiveis.length;

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
                : `${visiveis.length} ${visiveis.length === 1 ? "arquivo" : "arquivos"}`}
          </p>
        </div>
        <button type="button" className="rv-biblioteca__fechar" onClick={onFechar} aria-label="Fechar biblioteca">
          <X size={15} />
        </button>
      </header>

      {/* NÃO é uma barra de abas, e o desenho precisa dizer isso.
          Dois segmentos do mesmo tamanho, em cima de uma grade de
          conteúdo, leem como aba — a pessoa clica esperando o conteúdo
          de baixo trocar, e nada troca, porque isto é um MODO para o
          próximo clique. Por isso: um rótulo em linha ("Colocar como"),
          dois chips compactos alinhados à esquerda — nunca ocupando a
          largura toda — e uma frase que muda junto, para o clique ter
          resposta imediata.

          "Tile" também saiu: é o nome da coluna no banco, não palavra
          de quem joga. Na tela é PEÇA. */}
      {!jaTemFundo && (
        <div className="rv-biblioteca__papel">
          <span className="rv-biblioteca__papel-rotulo" id="rv-biblioteca-papel">Colocar como</span>
          <div className="rv-biblioteca__papel-opcoes" role="radiogroup" aria-labelledby="rv-biblioteca-papel">
            <button type="button" className="rv-biblioteca__chip" aria-checked={papel === "fundo"} role="radio"
              onClick={() => setPapel("fundo")}>
              <Map size={12} aria-hidden /> Fundo
            </button>
            <button type="button" className="rv-biblioteca__chip" aria-checked={papel === "tile"} role="radio"
              onClick={() => setPapel("tile")}>
              <Shapes size={12} aria-hidden /> Peça
            </button>
          </div>
        </div>
      )}

      <p className="rv-biblioteca__instrucao" role="status">
        {papelEfetivo === "fundo"
          ? "A imagem escolhida vira o mapa: nasce centrada e cobre a cena inteira"
          : "A imagem escolhida vira uma peça solta no centro do mapa — dá para mover, girar e redimensionar"}
      </p>

      {carregando && imagens === null ? (
        <p className="rv-biblioteca__estado"><Loader2 size={13} className="rv-spin" aria-hidden /> Lendo a biblioteca…</p>
      ) : imagens !== null && visiveis.length === 0 ? (
        <p className="rv-biblioteca__estado">
          {imagens.length === 0
            ? "Nenhuma imagem enviada nesta campanha ainda"
            : `Nenhuma imagem de cena — ${rostos} ${rostos === 1 ? "arquivo é retrato/avatar" : "arquivos são retratos/avatares"}`}
        </p>
      ) : (
        <ul className="rv-biblioteca__grade">
          {visiveis.map((img) => {
            const url = urls[img.id];
            return (
              <li key={img.id}>
                <button
                  type="button" className="rv-biblioteca__item"
                  disabled={ocupado}
                  onClick={() => onColocar(img, papelEfetivo)}
                  title={`${img.widthPx}×${img.heightPx} · ${pesoLegivel(img.bytes)}`}
                  aria-label={`Colocar como ${papelEfetivo === "fundo" ? "fundo da cena" : "peça solta"} — ${img.widthPx} por ${img.heightPx} pixels`}
                >
                  {/* Sem URL assinada a moldura fica vazia, não quebrada:
                      assinatura é renovável, não erro. */}
                  <span className="rv-biblioteca__miniatura">
                    {url ? <img src={url} alt="" /> : null}
                    {/* Selo de uso: diz o que o arquivo JÁ é na campanha,
                        que é exatamente a dúvida de quem vê um rosto no
                        meio dos mapas. */}
                    {usoDaImagem(img) !== "solta" && (
                      <span className="rv-biblioteca__selo" data-uso={usoDaImagem(img)}>
                        {usoDaImagem(img) === "cena" ? "em cena" : "rosto"}
                      </span>
                    )}
                  </span>
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
