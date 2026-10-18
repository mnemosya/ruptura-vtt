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
 * LINHA F (largura de gestão): a vitrine É a área de soltar — com
 * Enviar/Biblioteca dentro e o atalho de colar —, a lista "Nesta cena"
 * com as ações no hover e o ajuste fino da selecionada em faixas.
 *
 * ── O QUE ESTE PAINEL DELIBERADAMENTE NÃO FAZ ───────────────────────
 * Ele não é a via principal de colocar imagem: colar e arrastar são.
 * Aqui se ADMINISTRA o que já está na cena (ordem, visibilidade,
 * trava, exclusão) e se acessa a biblioteca da campanha para reusar um
 * arquivo sem subir de novo. Duplicar o fluxo de upload aqui daria dois
 * caminhos que precisariam concordar para sempre.
 */

import { useEffect, useState } from "react";
import { JanelaFerramenta } from "./JanelaFerramenta";
import {
  ArrowDown, ArrowUp, Copy, Eye, EyeOff, ImageIcon, Images, Lock, LockOpen, Trash2, Upload,
} from "lucide-react";
import { type ImagemCena, alturaEfetivaM } from "../_dominio/imagemCena";
import type { AjusteImagemCena } from "../_acoes/imageActions";

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
  /** Ajuste fino da selecionada — rotação, opacidade, camada. */
  onAjustar: (img: ImagemCena, ajuste: AjusteImagemCena) => void;
  onFechar: () => void;
}

/** Tecla modificadora por plataforma — lida depois de montar (o servidor não sabe). */
function useTeclaMod() {
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "")) setMod("⌘");
  }, []);
  return mod;
}

const pct = (v: number, min: number, max: number) => `${Math.round(((v - min) / (max - min)) * 100)}%`;

export function PainelImagens({
  imagens, urlsAssinadas, selecionadaId, onSelecionar, onAlternarVisivel,
  onAlternarTravado, onMudarOrdem, onRemover, onEnviarArquivo, onAbrirBiblioteca,
  onAjustar, onFechar,
}: PropsPainelImagens) {
  const mod = useTeclaMod();
  const [foco, setFoco] = useState<string | null>(null);
  const selecionada = imagens.find((i) => i.id === selecionadaId) ?? null;
  // Fundo primeiro, depois os tiles por `z` — a mesma ordem que o SVG
  // desenha, para a lista não contradizer o mapa.
  const ordenadas = [...imagens].sort((a, b) => {
    if (a.papel !== b.papel) return a.papel === "fundo" ? -1 : 1;
    return a.z - b.z;
  });
  const sobre = (txt: string) => ({
    onMouseEnter: () => setFoco(txt), onMouseLeave: () => setFoco(null),
    onFocus: () => setFoco(txt), onBlur: () => setFoco(null),
  });
  const alvo = (img: ImagemCena) => (img.papel === "fundo" ? "o fundo" : "a peça");
  const travada = selecionada?.travado ?? false;
  const desc = foco ?? (selecionada
    ? travada ? "Destrave pra ajustar" : `Arraste no mapa pra mover · os controles valem pra ${alvo(selecionada)}`
    : ordenadas.length ? "Clique numa imagem da lista pra ajustar" : "Cole, arraste no mapa ou envie um arquivo");

  return (
    <JanelaFerramenta
      id="imagens"
      largura="gestao"
      icone={<Images size={14} aria-hidden />}
      titulo="Imagens"
      modo={ordenadas.length === 0 ? "Nenhuma na cena" : `${ordenadas.length} na cena`}
      rotulo="Imagens da cena"
      rotuloFechar="Fechar imagens"
      aoFechar={onFechar}
    >
      <div className="jf-corpo jf-imagens">
        {/* A vitrine é a própria área de soltar: o lugar que mostra o que
            acontece é o mapa, e é lá que soltar funciona — o painel diz
            isso e oferece os dois caminhos que não dependem de gesto. */}
        <div className="jf-hero jf-img-hero">
          <div className="jf-img-solta">
            <ImageIcon size={34} strokeWidth={1.4} aria-hidden />
            <span className="jf-img-s1">Solte uma imagem direto no mapa</span>
            <span className="jf-img-s2">ou cole com <kbd className="jf-kbd">{mod}</kbd><kbd className="jf-kbd">V</kbd></span>
            <div className="jf-tiles jf-img-botoes">
              <button type="button" className="jf-tile is-on" onClick={onEnviarArquivo} {...sobre("PNG, JPG ou WEBP do computador")}>
                <Upload size={16} aria-hidden />Enviar arquivo
              </button>
              <button type="button" className="jf-tile" onClick={onAbrirBiblioteca} {...sobre("Imagens que você já enviou nesta campanha")}>
                <Copy size={16} aria-hidden />Biblioteca
              </button>
            </div>
          </div>
        </div>

        <div className="jf-grupo">
          <span className="jf-rot"><span>Nesta cena</span><span>{ordenadas.length || ""}</span></span>
          {ordenadas.length === 0 ? (
            <p className="jf-img-vazio">Nenhuma imagem ainda</p>
          ) : (
            <ul className="jf-img-lista">
              {ordenadas.map((img) => {
                const url = urlsAssinadas[img.imageId];
                const altura = alturaEfetivaM(img);
                const sel = img.id === selecionadaId;
                return (
                  <li key={img.id}
                    className={`jf-img${sel ? " is-on" : ""}${img.visivel ? "" : " is-oculta"}`}
                    data-selecionada={sel}
                    data-invisivel={!img.visivel}>
                    <button type="button" className="jf-img-sel"
                      onClick={() => onSelecionar(sel ? null : img.id)}
                      aria-pressed={sel}
                      aria-label={`Selecionar ${img.papel === "fundo" ? "o fundo" : "este tile"}`}>
                      {/* Sem URL assinada ainda (ou expirada) a miniatura
                          fica vazia em vez de quebrada — a assinatura é
                          renovável, não um erro. */}
                      <span className="jf-img-thumb">{url ? <img src={url} alt="" /> : null}</span>
                      <span className="jf-item-txt">
                        {/* "Tile" é o nome da coluna no banco; na tela, PEÇA. */}
                        <span className="jf-item-nome">{img.papel === "fundo" ? "Fundo do mapa" : "Peça"}</span>
                        <span className="jf-img-med">
                          {img.larguraM.toFixed(1)} × {altura.toFixed(1)} m{img.alturaM !== null ? " (distorcida)" : ""}
                        </span>
                      </span>
                    </button>

                    <span className="jf-img-estado" aria-hidden="true">
                      {img.travado && <Lock size={13} />}
                      {!img.visivel && <EyeOff size={13} />}
                    </span>

                    <span className="jf-img-acts">
                      {/* Ordem só existe para tile: o fundo é o fundo. */}
                      {img.papel === "tile" && (
                        <>
                          <button type="button" className="jf-mini" onClick={() => onMudarOrdem(img, -1)} aria-label="Mandar para trás" {...sobre(`Mandar ${alvo(img)} pra trás`)}>
                            <ArrowDown size={14} aria-hidden />
                          </button>
                          <button type="button" className="jf-mini" onClick={() => onMudarOrdem(img, 1)} aria-label="Trazer para frente" {...sobre(`Trazer ${alvo(img)} pra frente`)}>
                            <ArrowUp size={14} aria-hidden />
                          </button>
                        </>
                      )}
                      <button type="button" className={`jf-mini${img.visivel ? "" : " is-on"}`} onClick={() => onAlternarVisivel(img)}
                        aria-label={img.visivel ? "Esconder dos jogadores" : "Mostrar aos jogadores"}
                        aria-pressed={!img.visivel}
                        {...sobre(img.visivel ? "Esconder dos jogadores" : "Mostrar aos jogadores")}>
                        {img.visivel ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
                      </button>
                      <button type="button" className="jf-mini" onClick={() => onAlternarTravado(img)}
                        aria-label={img.travado ? "Destravar" : "Travar posição"}
                        aria-pressed={img.travado}
                        {...sobre(img.travado ? "Destravar pra mover e ajustar" : "Travar a posição no mapa")}>
                        {img.travado ? <Lock size={14} aria-hidden /> : <LockOpen size={14} aria-hidden />}
                      </button>
                      {/* Travada não remove: o botão fica desabilitado (e
                          um <button> desabilitado não recebe hover — quem
                          explica é o cadeado ao lado, que segue clicável). */}
                      <button type="button" className="jf-mini is-perigo"
                        onClick={() => onRemover(img)} disabled={img.travado}
                        aria-label="Remover da cena"
                        {...sobre("Remover da cena · a imagem continua na biblioteca")}>
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Ajuste fino da selecionada ────────────────────────────────
            Mover e escalar são GESTO, no mapa, porque são espaciais.
            Rotação, opacidade e camada são NÚMERO, e aqui, porque
            ninguém acerta 15° arrastando. Os handlers são os de sempre
            (`onAjustar`), só a apresentação virou `jf-faixa`. ──────── */}
        {selecionada && (
          <div className="jf-grupo">
            <span className="jf-rot"><span>Ajustar {alvo(selecionada)}</span></span>

            <label className="jf-faixa" style={{ ["--jf-p" as string]: pct(Math.round(selecionada.rotacaoGraus), 0, 359) }}>
              <span className="jf-l">Rotação</span>
              <input
                type="range" min={0} max={359} step={1}
                value={Math.round(selecionada.rotacaoGraus)}
                disabled={travada}
                onChange={(e) => onAjustar(selecionada, { rotacaoGraus: Number(e.target.value) })}
              />
              <b>{Math.round(selecionada.rotacaoGraus)}°</b>
            </label>

            <label className="jf-faixa" style={{ ["--jf-p" as string]: pct(Math.round(selecionada.opacidade * 100), 10, 100) }}>
              <span className="jf-l">Opacidade</span>
              <input
                type="range" min={10} max={100} step={5}
                value={Math.round(selecionada.opacidade * 100)}
                disabled={travada}
                onChange={(e) => onAjustar(selecionada, { opacidade: Number(e.target.value) / 100 })}
              />
              <b>{Math.round(selecionada.opacidade * 100)}%</b>
            </label>

            <label className="jf-faixa" style={{ ["--jf-p" as string]: pct(Math.min(200, Math.max(1, Math.round(selecionada.larguraM))), 1, 200) }}>
              <span className="jf-l">Largura</span>
              <input
                type="range" min={1} max={200} step={1}
                value={Math.min(200, Math.max(1, Math.round(selecionada.larguraM)))}
                disabled={travada}
                onChange={(e) => onAjustar(selecionada, { larguraM: Number(e.target.value) })}
              />
              <b>{selecionada.larguraM.toFixed(1)} m</b>
            </label>

            <div className="jf-tiles" role="group" aria-label="Posição na pilha">
              <button
                type="button" className="jf-tile" disabled={travada}
                aria-pressed={selecionada.camada === "abaixo_grade"}
                onClick={() => onAjustar(selecionada, { camada: "abaixo_grade" })}
                {...sobre("A grade passa por cima da imagem")}
              >
                Sob a grade
              </button>
              <button
                type="button" className="jf-tile" disabled={travada}
                aria-pressed={selecionada.camada === "acima_grade"}
                onClick={() => onAjustar(selecionada, { camada: "acima_grade" })}
                {...sobre("A imagem cobre a grade")}
              >
                Sobre a grade
              </button>
            </div>

            {/* A distorção é sempre deliberada, então desfazê-la também
                precisa ser um gesto explícito — e só aparece quando há o
                que desfazer. */}
            {selecionada.alturaM !== null && (
              <button
                type="button" className="jf-quieto"
                disabled={travada}
                onClick={() => onAjustar(selecionada, { limparAltura: true })}
              >
                Voltar à proporção do arquivo
              </button>
            )}
          </div>
        )}

        <p className="jf-desc">{desc}</p>
      </div>
    </JanelaFerramenta>
  );
}
