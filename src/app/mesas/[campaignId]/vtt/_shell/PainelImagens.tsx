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

export function PainelImagens({
  imagens, urlsAssinadas, selecionadaId, onSelecionar, onAlternarVisivel,
  onAlternarTravado, onMudarOrdem, onRemover, onEnviarArquivo, onAbrirBiblioteca,
  onAjustar, onFechar,
}: PropsPainelImagens) {
  const selecionada = imagens.find((i) => i.id === selecionadaId) ?? null;
  // Fundo primeiro, depois os tiles por `z` — a mesma ordem que o SVG
  // desenha, para a lista não contradizer o mapa.
  const ordenadas = [...imagens].sort((a, b) => {
    if (a.papel !== b.papel) return a.papel === "fundo" ? -1 : 1;
    return a.z - b.z;
  });

  // `modo` é a linha de estado que toda janela de ferramenta tem e esta
  // não tinha — o cabeçalho ficava com um título solto. (Comentário
  // AQUI e não entre os atributos: dentro da tag de abertura, `//` e
  // `/* */` não são comentário de JSX, e o compilador recusa o arquivo
  // inteiro — foi exatamente o que aconteceu.)
  return (
    <JanelaFerramenta
      id="imagens"
      icone={<Images size={14} aria-hidden />}
      titulo="Imagens"
      modo={ordenadas.length === 0
        ? "nenhuma na cena"
        : `${ordenadas.length} ${ordenadas.length === 1 ? "imagem" : "imagens"} na cena`}
      rotulo="Imagens da cena"
      rotuloFechar="Fechar imagens"
      aoFechar={onFechar}
    >
      {/* O CORPO da janela. Este painel era o único que despejava o
          conteúdo direto na casca, sem `.rv-fp-corpo` — e é dela que vem
          TODO o espaçamento das janelas (padding de 16, gap de 20 entre
          seções). Daí a impressão de coisa jogada: não havia respiro
          nenhum, só os elementos empilhados. */}
      <div className="rv-fp-corpo">
        <div className="rv-fp-grupo">
          <span className="rv-fp-rotulo">Adicionar</span>
      {/* Classes PRÓPRIAS. Estas duas ações usavam
          `.rv-editor-retrato__acoes` e `__nota`, emprestadas do editor
          de retrato do token — a regra de lá só faz layout, então os
          botões caíam no padrão do navegador, e a nota vinha centrada
          (certo lá, errado aqui). */}
          <div className="rv-imagens-acoes">
            <button type="button" className="rv-btn rv-btn--pri" onClick={onEnviarArquivo}>
              <ImageUp size={14} aria-hidden /> Enviar arquivo…
            </button>
            <button type="button" className="rv-btn" onClick={onAbrirBiblioteca}>
              <Images size={14} aria-hidden /> Biblioteca
            </button>
          </div>
          {/* Dito onde a dúvida aparece: o painel não é o único caminho. */}
          <p className="rv-imagens-nota">
            Também dá para colar (<kbd>Ctrl</kbd>+<kbd>V</kbd>) ou arrastar uma imagem
            direto sobre o mapa.
          </p>
        </div>

        <div className="rv-fp-grupo">
          <span className="rv-fp-rotulo">Nesta cena</span>
      {ordenadas.length === 0 ? (
        <p className="rv-imagens-vazio">Nenhuma imagem ainda</p>
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
                    {/* "Tile" é o nome da coluna no banco; na tela, PEÇA. */}
                    {img.papel === "fundo" ? "Fundo do mapa" : "Peça"}
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
                      <button type="button" className="rv-imagens-item__acao" onClick={() => onMudarOrdem(img, -1)} aria-label="Mandar para trás">
                        <ChevronDown size={14} aria-hidden />
                      </button>
                      <button type="button" className="rv-imagens-item__acao" onClick={() => onMudarOrdem(img, 1)} aria-label="Trazer para frente">
                        <ChevronUp size={14} aria-hidden />
                      </button>
                    </>
                  )}
                  <button type="button" className="rv-imagens-item__acao" onClick={() => onAlternarVisivel(img)}
                    aria-label={img.visivel ? "Esconder dos jogadores" : "Mostrar aos jogadores"}
                    aria-pressed={!img.visivel}>
                    {img.visivel ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
                  </button>
                  <button type="button" className="rv-imagens-item__acao" onClick={() => onAlternarTravado(img)}
                    aria-label={img.travado ? "Destravar" : "Travar posição"}
                    aria-pressed={img.travado}>
                    {img.travado ? <Lock size={14} aria-hidden /> : <LockOpen size={14} aria-hidden />}
                  </button>
                  <button type="button" className="rv-imagens-item__acao rv-imagens-item__acao--perigo"
                    onClick={() => onRemover(img)} disabled={img.travado}
                    aria-label="Remover da cena">
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
          Mover e escalar são GESTO, no mapa, porque são espaciais: a
          pessoa precisa ver a imagem encaixar na grade enquanto mexe.
          Rotação, opacidade e camada são NÚMERO, e aqui, porque
          ninguém acerta 15° arrastando — e porque opacidade só faz
          sentido comparada com o que está por baixo, que continua
          visível com o painel ao lado.

          Cada controle grava ao SOLTAR (`onChange` do range dispara no
          fim do gesto em todos os navegadores de hoje), não a cada
          pixel: uma escrita por ajuste, a mesma disciplina do arrasto
          de token. ───────────────────────────────────────────────── */}
      {selecionada && (
        <div className="rv-fp-grupo rv-imagens-ajuste">
          <span className="rv-fp-rotulo">
            Ajustar {selecionada.papel === "fundo" ? "o fundo" : "a peça"}
          </span>

          <label className="rv-imagens-ajuste__campo">
            <span>Rotação <em>{Math.round(selecionada.rotacaoGraus)}°</em></span>
            <input
              type="range" min={0} max={359} step={1}
              value={Math.round(selecionada.rotacaoGraus)}
              disabled={selecionada.travado}
              onChange={(e) => onAjustar(selecionada, { rotacaoGraus: Number(e.target.value) })}
            />
          </label>

          <label className="rv-imagens-ajuste__campo">
            <span>Opacidade <em>{Math.round(selecionada.opacidade * 100)}%</em></span>
            <input
              type="range" min={10} max={100} step={5}
              value={Math.round(selecionada.opacidade * 100)}
              disabled={selecionada.travado}
              onChange={(e) => onAjustar(selecionada, { opacidade: Number(e.target.value) / 100 })}
            />
          </label>

          <label className="rv-imagens-ajuste__campo">
            <span>Largura <em>{selecionada.larguraM.toFixed(1)} m</em></span>
            <input
              type="range" min={1} max={200} step={1}
              value={Math.min(200, Math.max(1, Math.round(selecionada.larguraM)))}
              disabled={selecionada.travado}
              onChange={(e) => onAjustar(selecionada, { larguraM: Number(e.target.value) })}
            />
          </label>

          <div className="rv-imagens-ajuste__camada" role="group" aria-label="Posição na pilha">
            <button
              type="button" disabled={selecionada.travado}
              aria-pressed={selecionada.camada === "abaixo_grade"}
              className={selecionada.camada === "abaixo_grade" ? "is-ativo" : undefined}
              onClick={() => onAjustar(selecionada, { camada: "abaixo_grade" })}
            >
              Sob a grade
            </button>
            <button
              type="button" disabled={selecionada.travado}
              aria-pressed={selecionada.camada === "acima_grade"}
              className={selecionada.camada === "acima_grade" ? "is-ativo" : undefined}
              onClick={() => onAjustar(selecionada, { camada: "acima_grade" })}
            >
              Sobre a grade
            </button>
          </div>

          {/* A distorção é sempre deliberada, então desfazê-la também
              precisa ser um gesto explícito — e só aparece quando há o
              que desfazer. */}
          {selecionada.alturaM !== null && (
            <button
              type="button" className="rv-imagens-ajuste__proporcao"
              disabled={selecionada.travado}
              onClick={() => onAjustar(selecionada, { limparAltura: true })}
            >
              Voltar à proporção do arquivo
            </button>
          )}

          {selecionada.travado && (
            <p className="rv-imagens-ajuste__travada">Destrave para ajustar.</p>
          )}
        </div>
      )}
      </div>
    </JanelaFerramenta>
  );
}
