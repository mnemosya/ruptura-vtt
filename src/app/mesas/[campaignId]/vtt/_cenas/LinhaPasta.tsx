"use client";

/**
 * UMA PASTA na lista do catálogo.
 *
 * Irmã do `CartaoCena`, e deliberadamente MENOR que ele: pasta é
 * caminho, cena é destino. Uma linha de pasta com a mesma altura e o
 * mesmo peso visual de um cartão faria o catálogo parecer uma lista de
 * coisas equivalentes, quando metade delas só leva a outro lugar.
 *
 * Também é ALVO DE SOLTURA. Arrastar uma cena para cá é o gesto de
 * organizar — e é por isso que a pasta precisa reagir visivelmente ao
 * arrasto que paira: sem o realce, soltar vira aposta.
 *
 * Puramente apresentacional, como o cartão: quem chama Server Action é
 * o `GerenciadorCenas`.
 */

import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Folder, FolderOpen, Pencil, Trash2, X } from "lucide-react";
import type { PastaCena } from "../../../../../lib/vtt/sceneStorage";

export interface PropsLinhaPasta {
  pasta: PastaCena;
  /** Quantas cenas estão DIRETAMENTE nela — o que o narrador acha lá dentro. */
  quantidade: number;
  ocupada: boolean;
  erro: string | null;
  onAbrir: () => void;
  onRenomear: (nome: string) => void;
  onExcluir: () => void;
  /** Uma cena está sendo arrastada e paira sobre esta pasta. */
  alvoDeArrasto: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

export function LinhaPasta(p: PropsLinhaPasta) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(p.pasta.nome);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const campoRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { if (!editando) setRascunho(p.pasta.nome); }, [p.pasta.nome, editando]);
  useEffect(() => { if (editando) campoRef.current?.select(); }, [editando]);

  function confirmar() {
    const limpo = rascunho.trim();
    setEditando(false);
    if (limpo.length === 0 || limpo === p.pasta.nome) { setRascunho(p.pasta.nome); return; }
    p.onRenomear(limpo);
  }

  return (
    <li
      className="rv-pasta-linha"
      data-alvo={p.alvoDeArrasto || undefined}
      data-testid="pasta-linha"
      data-pasta-id={p.pasta.id}
      onDragOver={p.onDragOver}
      onDragLeave={p.onDragLeave}
      onDrop={p.onDrop}
    >
      <span className="rv-pasta-icone" aria-hidden="true">
        {p.alvoDeArrasto ? <FolderOpen size={15} /> : <Folder size={15} />}
      </span>

      {editando ? (
        <span className="rv-cena-editar rv-pasta-txt">
          <input
            ref={campoRef}
            className="rv-cena-campo"
            value={rascunho}
            maxLength={80}
            aria-label="Nome da pasta"
            data-testid="pasta-campo-nome"
            onChange={(e) => setRascunho(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); confirmar(); }
              if (e.key === "Escape") { e.preventDefault(); setEditando(false); }
            }}
            onBlur={confirmar}
          />
          <button type="button" className="rv-cena-mini-btn" aria-label="Confirmar nome" onMouseDown={(e) => e.preventDefault()} onClick={confirmar}>
            <Check size={15} aria-hidden />
          </button>
          <button type="button" className="rv-cena-mini-btn" aria-label="Cancelar" onMouseDown={(e) => e.preventDefault()} onClick={() => setEditando(false)}>
            <X size={15} aria-hidden />
          </button>
        </span>
      ) : (
        <button
          type="button" className="rv-pasta-nome" data-testid="pasta-abrir"
          disabled={p.ocupada} onClick={p.onAbrir}
        >
          <span className="rv-pasta-nome-txt">{p.pasta.nome}</span>
          <span className="rv-pasta-contagem">
            {p.quantidade === 0 ? "vazia" : p.quantidade === 1 ? "1 cena" : `${p.quantidade} cenas`}
          </span>
          <ChevronRight size={13} aria-hidden="true" />
        </button>
      )}

      {p.erro && <span className="rv-cena-erro" role="alert">{p.erro}</span>}

      <span className="rv-cena-acoes">
        {confirmandoExclusao ? (
          // Sem digitar o nome, ao contrário de excluir CENA: apagar uma
          // pasta não apaga conteúdo nenhum (0117 sobe os filhos pro
          // pai), então a cerimônia de digitar seria desproporcional ao
          // que se perde — uma etiqueta.
          <>
            <span className="rv-pasta-aviso">Os itens sobem um nível.</span>
            <button
              type="button" className="rv-btn rv-btn--perigo"
              data-testid="pasta-excluir-confirmar"
              onClick={() => { setConfirmandoExclusao(false); p.onExcluir(); }}
            >Excluir</button>
            <button type="button" className="rv-btn rv-btn--ghost" onClick={() => setConfirmandoExclusao(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button
              type="button" className="rv-cena-mini-btn" data-testid="pasta-renomear"
              aria-label={`Renomear a pasta "${p.pasta.nome}"`}
              disabled={p.ocupada} onClick={() => setEditando(true)}
            >
              <Pencil size={15} aria-hidden />
              <span className="rv-dica rv-dica--esq">Renomear a pasta</span>
            </button>
            <button
              type="button" className="rv-cena-mini-btn" data-testid="pasta-excluir"
              aria-label={`Excluir a pasta "${p.pasta.nome}"`}
              disabled={p.ocupada} onClick={() => setConfirmandoExclusao(true)}
            >
              <Trash2 size={15} aria-hidden />
              <span className="rv-dica rv-dica--esq">Excluir — o conteúdo sobe um nível</span>
            </button>
          </>
        )}
      </span>
    </li>
  );
}
