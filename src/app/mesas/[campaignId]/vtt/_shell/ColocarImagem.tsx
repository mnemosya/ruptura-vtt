"use client";

/**
 * Confirmação de COLOCAÇÃO de imagem — a janela que aparece depois de
 * colar, soltar ou escolher um arquivo, e antes de qualquer byte sair
 * do navegador.
 *
 * ── POR QUE ELA EXISTE ──────────────────────────────────────────────
 * É a lição do Owlbear Rodeo, e a razão está no plano: mapa
 * desalinhado é o erro nº 1, e conferir DEPOIS de gravar é tarde. A
 * imagem já está decodificada e reduzida em memória aqui — o preview é
 * um `object URL` do blob que subiria — então "Cancelar" não deixa
 * resíduo nenhum: nenhuma reserva de quota, nenhum objeto no Storage,
 * nada para a coleta recolher depois.
 *
 * Isso também decide a ORDEM do fluxo, que é deliberadamente o
 * contrário do óbvio:
 *
 *     decodificar → reduzir → preview → ESCOLHER → reservar → enviar
 *
 * e não "enviar primeiro e ajustar depois". Subir 8 MB para a pessoa
 * descobrir que colou o arquivo errado gasta a quota da campanha por um
 * engano de um segundo.
 *
 * ── O QUE SE ESCOLHE AQUI, E O QUE NÃO ──────────────────────────────
 * Só o PAPEL: fundo ou tile. Tamanho, rotação e opacidade ficam de
 * fora de propósito — são ajuste fino, feito olhando o mapa com a
 * imagem já lá, não adivinhando num diálogo. O que este passo precisa
 * acertar é a única decisão que muda o significado da imagem, e que é
 * chata de desfazer depois (fundo é único por cena).
 */

import { useEffect, useState } from "react";
import { Image as IconeImagem, Layers, Loader2, TriangleAlert, X } from "lucide-react";
import type { ImagemPreparada } from "../../../../../lib/vtt/imagePreparation";
import { larguraInicialM } from "../_dominio/imagemCena";

export interface PropsColocarImagem {
  preparada: ImagemPreparada;
  /** Largura da cena em metros — define o tamanho com que um fundo nasce. */
  larguraCena: number;
  /** `true` quando a cena já tem fundo: o papel "fundo" passa a ser TROCA. */
  jaTemFundo: boolean;
  ocupado: boolean;
  erro: string | null;
  onConfirmar: (papel: "fundo" | "tile") => void;
  onCancelar: () => void;
}

export function ColocarImagem({
  preparada, larguraCena, jaTemFundo, ocupado, erro, onConfirmar, onCancelar,
}: PropsColocarImagem) {
  const [papel, setPapel] = useState<"fundo" | "tile">(
    // Uma imagem grande e larga quase sempre é uma planta; um recorte
    // pequeno quase sempre é um móvel. É palpite de PARTIDA, mostrado
    // já selecionado e trocável num clique — não uma decisão tomada
    // pela interface nas costas de quem colou.
    !jaTemFundo && preparada.widthPx >= 1200 ? "fundo" : "tile",
  );

  // Esc cancela, como em toda janela do VTT. Enter NÃO confirma: a
  // escolha de papel é a única coisa que esta janela decide, e confirmar
  // por tecla passaria por cima dela sem a pessoa ter olhado.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape" && !ocupado) { e.preventDefault(); onCancelar(); }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [ocupado, onCancelar]);

  const larguraM = larguraInicialM(papel, preparada.widthPx, larguraCena);
  const alturaM = (larguraM * preparada.heightPx) / preparada.widthPx;
  const megabytes = preparada.blob.size / (1024 * 1024);

  return (
    <div className="rv-colocar-imagem" role="dialog" aria-modal="true" aria-label="Colocar imagem na cena">
      <header className="rv-colocar-imagem__cab">
        <span className="rv-colocar-imagem__titulo">
          <IconeImagem size={14} aria-hidden /> Colocar na cena
        </span>
        <button type="button" onClick={onCancelar} disabled={ocupado} aria-label="Cancelar">
          <X size={14} aria-hidden />
        </button>
      </header>

      <div className="rv-colocar-imagem__preview">
        {/* O blob que subiria, não o arquivo original: o que se vê aqui
            é exatamente o que a mesa vai ver. */}
        <img src={preparada.previewUrl} alt="" />
      </div>

      <div className="rv-colocar-imagem__papeis" role="radiogroup" aria-label="Papel da imagem">
        <button
          type="button" role="radio" aria-checked={papel === "fundo"}
          className={papel === "fundo" ? "is-ativo" : undefined}
          onClick={() => setPapel("fundo")} disabled={ocupado}
        >
          <Layers size={14} aria-hidden />
          <span>
            <strong>{jaTemFundo ? "Trocar o fundo" : "Fundo do mapa"}</strong>
            <em>nasce cobrindo a cena inteira</em>
          </span>
        </button>
        <button
          type="button" role="radio" aria-checked={papel === "tile"}
          className={papel === "tile" ? "is-ativo" : undefined}
          onClick={() => setPapel("tile")} disabled={ocupado}
        >
          <IconeImagem size={14} aria-hidden />
          <span>
            <strong>Imagem solta</strong>
            <em>móvel, mancha, recorte</em>
          </span>
        </button>
      </div>

      {/* Dito ANTES de confirmar, porque depois vira surpresa: trocar o
          fundo não é acrescentar um, e a cena só admite um. */}
      {papel === "fundo" && jaTemFundo && (
        <p className="rv-colocar-imagem__aviso">
          <TriangleAlert size={12} aria-hidden />
          Esta cena já tem um fundo. Remova o atual pelo painel antes de colocar outro.
        </p>
      )}

      <p className="rv-colocar-imagem__medida">
        {preparada.widthPx} × {preparada.heightPx} px · {megabytes.toFixed(1)} MB
        <br />
        entra com {larguraM.toFixed(1)} × {alturaM.toFixed(1)} m no mapa
      </p>

      {erro && (
        <p className="rv-colocar-imagem__erro">
          <TriangleAlert size={12} aria-hidden /> {erro}
        </p>
      )}

      <div className="rv-colocar-imagem__acoes">
        <button type="button" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
        <button
          type="button" className="rv-colocar-imagem__confirmar"
          onClick={() => onConfirmar(papel)}
          disabled={ocupado || (papel === "fundo" && jaTemFundo)}
        >
          {ocupado ? <Loader2 size={14} className="rv-girando" aria-hidden /> : null}
          {ocupado ? "Enviando…" : "Colocar"}
        </button>
      </div>
    </div>
  );
}
