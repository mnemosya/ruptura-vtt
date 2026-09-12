"use client";

/**
 * Painel da ferramenta IMAGENS — ancorado ao lado da barra, como o de
 * Objetos, e pelo mesmo motivo: colocar imagem é trabalho de montagem
 * de cena, feito olhando o mapa. Um modal esconderia justamente o que
 * a pessoa precisa ver enquanto ajusta.
 *
 * PURAMENTE APRESENTACIONAL: nenhuma RPC, nenhuma revisão otimista,
 * nenhum acesso a `estadoCena`. Recebe a lista já resolvida e devolve
 * intenções — a mecânica fica em `VttClient.tsx`, como em
 * `PainelObjetos.tsx`.
 *
 * ── O QUE ESTE PAINEL DELIBERADAMENTE NÃO FAZ ───────────────────────
 * Ele não é a via principal de colocar imagem: colar e arrastar são.
 * Aqui se ADMINISTRA o que já está na cena (ordem, visibilidade,
 * trava, exclusão) e se acessa a biblioteca da campanha para reusar um
 * arquivo sem subir de novo. Duplicar o fluxo de upload aqui daria dois
 * caminhos que precisariam concordar para sempre.
 */

import { JanelaFerramenta } from "./JanelaFerramenta";
import {
  ChevronDown, ChevronUp, Eye, EyeOff, ImageUp, Images, Lock, LockOpen, Trash2,
} from "lucide-react";
import { type ImagemCena, alturaEfetivaM } from "../_dominio/imagemCena";

export interface PropsPainelImagens {
  imagens: ImagemCena[];
  /** URL assinada por `image_id`. O painel NUNCA assina nada — recebe pronto. */
  urlsAssinadas: Record<string, string>;
  selecionadaId: string | null;
  onSelecionar: (id: string | null) => void;
  onAlternarVisivel: (img: ImagemCena) => void;
  onAlternarTravado: (img: ImagemCena) => void;
  onMudarOrdem: (img: ImagemCena, delta: number) => void;
  onRemover: (img: ImagemCena) => void;
  onEnviarArquivo: () => void;
  onAbrirBiblioteca: () => void;
  onFechar: () => void;
}

export function PainelImagens({
  imagens, urlsAssinadas, selecionadaId, onSelecionar, onAlternarVisivel,
  onAlternarTravado, onMudarOrdem, onRemover, onEnviarArquivo, onAbrirBiblioteca, onFechar,
}: PropsPainelImagens) {
  // Fundo primeiro, depois os tiles por `z` — a mesma ordem que o SVG
  // desenha, para a lista não contradizer o mapa.
  const ordenadas = [...imagens].sort((a, b) => {
    if (a.papel !== b.papel) return a.papel === "fundo" ? -1 : 1;
    return a.z - b.z;
  });

  return (
    <JanelaFerramenta
      id="imagens"
      icone={<Images size={14} aria-hidden />}
      titulo="Imagens"
      rotulo="Imagens da cena"
      rotuloFechar="Fechar imagens"
      aoFechar={onFechar}
    >
      <div className="rv-editor-retrato__acoes">
        <button type="button" onClick={onEnviarArquivo}>
          <ImageUp size={14} aria-hidden /> Enviar arquivo…
        </button>
        <button type="button" onClick={onAbrirBiblioteca}>
          <Images size={14} aria-hidden /> Biblioteca
        </button>
      </div>
      {/* Dito onde a dúvida aparece: o painel não é o único caminho. */}
      <p className="rv-editor-retrato__nota">
        Também dá para colar (Ctrl+V) ou arrastar uma imagem direto sobre o mapa.
      </p>

      {ordenadas.length === 0 ? (
        <p className="rv-imagens-vazio">Nenhuma imagem nesta cena ainda.</p>
      ) : (
        <ul className="rv-imagens-lista">
          {ordenadas.map((img) => {
            const url = urlsAssinadas[img.imageId];
            const altura = alturaEfetivaM(img);
            return (
              <li key={img.id} className="rv-imagens-item"
                data-selecionada={img.id === selecionadaId}
                data-invisivel={!img.visivel}>
                <button type="button" className="rv-imagens-item__miniatura"
                  onClick={() => onSelecionar(img.id === selecionadaId ? null : img.id)}
                  aria-label={`Selecionar ${img.papel === "fundo" ? "o fundo" : "este tile"}`}>
                  {/* Sem URL assinada ainda (ou expirada) a miniatura
                      fica vazia em vez de quebrada — a assinatura é
                      renovável, não um erro. */}
                  {url ? <img src={url} alt="" /> : null}
                </button>

                <span className="rv-imagens-item__rotulo">
                  <span className="rv-imagens-item__papel">
                    {img.papel === "fundo" ? "Fundo do mapa" : "Tile"}
                  </span>
                  <span className="rv-imagens-item__medida">
                    {img.larguraM.toFixed(1)} × {altura.toFixed(1)} m
                    {img.alturaM !== null ? " (distorcida)" : ""}
                  </span>
                </span>

                <span className="rv-imagens-item__acoes">
                  {/* Ordem só existe para tile: o fundo é o fundo. */}
                  {img.papel === "tile" && (
                    <>
                      <button type="button" onClick={() => onMudarOrdem(img, -1)} aria-label="Mandar para trás">
                        <ChevronDown size={14} aria-hidden />
                      </button>
                      <button type="button" onClick={() => onMudarOrdem(img, 1)} aria-label="Trazer para frente">
                        <ChevronUp size={14} aria-hidden />
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => onAlternarVisivel(img)}
                    aria-label={img.visivel ? "Esconder dos jogadores" : "Mostrar aos jogadores"}
                    aria-pressed={!img.visivel}>
                    {img.visivel ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
                  </button>
                  <button type="button" onClick={() => onAlternarTravado(img)}
                    aria-label={img.travado ? "Destravar" : "Travar posição"}
                    aria-pressed={img.travado}>
                    {img.travado ? <Lock size={14} aria-hidden /> : <LockOpen size={14} aria-hidden />}
                  </button>
                  <button type="button" onClick={() => onRemover(img)} disabled={img.travado}
                    aria-label="Remover da cena">
                    <Trash2 size={14} aria-hidden />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </JanelaFerramenta>
  );
}
