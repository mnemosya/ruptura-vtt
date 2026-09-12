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
 * ── A BIBLIOTECA É DA CAMPANHA INTEIRA ──────────────────────────────
 * Mapas, retratos de token e avatares de ficha moram no mesmo lugar (a
 * deduplicação por `sha256` é o que torna isso barato), e TODOS
 * aparecem aqui: um retrato pode virar peça de cena, um mapa pode
 * virar avatar. Filtrar por uso seria decidir pela pessoa que ela
 * nunca vai querer o contrário.
 *
 * O que a projeção (0108) traz é o SELO: o uso que cada arquivo já tem
 * na campanha ("em cena", "rosto"). Isso responde à pergunta certa —
 * "o que é este arquivo?" — sem esconder nada.
 */

import { useState } from "react";
import { Images, Loader2, Map, Shapes, Trash2, X } from "lucide-react";
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
  /** Tira o arquivo da campanha. A ação recusa o que está em uso. */
  onExcluir: (imagem: ImagemBiblioteca) => void;
  /**
   * Recusa do servidor — sobretudo "esta imagem está em uso: N em
   * cena…". Sem mostrar isto aqui, clicar em Excluir numa imagem em
   * uso não fazia NADA visível: a ação falhava em silêncio.
   */
  erro?: string | null;
  onFechar: () => void;
}

export function BibliotecaImagens({
  imagens, carregando, urls, jaTemFundo, ocupado, onColocar, onExcluir, erro, onFechar,
}: PropsBibliotecaImagens) {
  /* O papel é escolhido ANTES de clicar na imagem: um clique só, e a
     miniatura é o botão. Perguntar depois ("como quer colocar?")
     colocaria um passo entre a escolha e o resultado. */
  /* PEÇA por padrão: trocar o mapa inteiro é o gesto raro (uma vez por
     cena), pôr uma peça é o gesto de sempre. O padrão tem que ser o
     que acontece mais, não o que é mais dramático. */
  const [papel, setPapel] = useState<"fundo" | "tile">("tile");
  const papelEfetivo = jaTemFundo ? "tile" : papel;

  /* Confirmação por ITEM: o alvo da pergunta é aquele arquivo, e uma
     caixa global ("excluir a imagem?") não diria qual. */
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const visiveis = imagens ?? [];

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

      {erro && <p className="rv-biblioteca__erro" role="alert">{erro}</p>}

      {carregando && imagens === null ? (
        <p className="rv-biblioteca__estado"><Loader2 size={13} className="rv-spin" aria-hidden /> Lendo a biblioteca…</p>
      ) : imagens !== null && visiveis.length === 0 ? (
        <p className="rv-biblioteca__estado">Nenhuma imagem enviada nesta campanha ainda</p>
      ) : (
        <ul className="rv-biblioteca__grade">
          {visiveis.map((img) => {
            const url = urls[img.id];
            return (
              <li key={img.id} className="rv-biblioteca__celula">
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
                        {usoDaImagem(img) === "cena" ? "em cena" : "token"}
                      </span>
                    )}
                  </span>
                  <span className="rv-biblioteca__medida">{img.widthPx}×{img.heightPx}</span>
                  <span className="rv-biblioteca__peso">{pesoLegivel(img.bytes)}</span>
                </button>

                {/* Excluir aparece no hover do item, como o lápis das
                    áreas no mapa — e fora do botão de colocar, senão o
                    clique nele colocaria a imagem na cena. */}
                {confirmando !== img.id && (
                  <button
                    type="button" className="rv-biblioteca__excluir"
                    disabled={ocupado}
                    onClick={() => setConfirmando(img.id)}
                    aria-label="Excluir esta imagem da campanha"
                    title="Excluir da campanha"
                  >
                    <Trash2 size={12} aria-hidden />
                  </button>
                )}
                {confirmando === img.id && (
                  <div className="rv-biblioteca__confirmar" role="alertdialog" aria-label="Confirmar exclusão">
                    <p>Excluir?</p>
                    <div>
                      <button type="button" className="rv-biblioteca__confirmar-sim" disabled={ocupado}
                        onClick={() => { setConfirmando(null); onExcluir(img); }}>
                        Excluir
                      </button>
                      <button type="button" className="rv-biblioteca__confirmar-nao" disabled={ocupado}
                        onClick={() => setConfirmando(null)}>
                        Manter
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
