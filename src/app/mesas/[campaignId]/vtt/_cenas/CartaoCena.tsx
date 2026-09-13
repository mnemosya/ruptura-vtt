"use client";

/**
 * UM CARTÃO DO CATÁLOGO.
 *
 * Puramente apresentacional, como `PainelCena`: recebe valores e
 * devolve intenções. Quem chama a Server Action, guarda revisão e
 * reconcilia conflito é o `GerenciadorCenas`.
 *
 * Os dois selos do cartão são a Fase 2 inteira em forma visível:
 *
 *   · VOCÊ ESTÁ AQUI     — a cena que este narrador abriu;
 *   · JOGADORES AQUI     — `vtt_campaign_stage.presented_scene_id`.
 *
 * Eles existem SEPARADOS porque a partir da Fase 1 podem apontar pra
 * cenas diferentes, e é exatamente essa distância que o narrador
 * precisa enxergar pra confiar que abrir um cartão não mexeu na mesa.
 * Um selo só ("cena atual") voltaria a fundir o que a fundação separou.
 *
 * O que NÃO está aqui, de propósito:
 *
 *   · miniatura é da Fase 4. O slot fica reservado no desenho (a
 *     inicial da cena ocupa o lugar) pra que a chegada da imagem não
 *     reorganize o cartão inteiro depois;
 *   · arquivar e excluir são da Fase 4.
 */

import { useEffect, useRef, useState } from "react";
import { Check, GripVertical, MonitorPlay, Pencil, Users, X } from "lucide-react";
import type { CartaoCena as DadosCartaoCena } from "../../../../../lib/vtt/sceneStorage";

export interface PropsCartaoCena {
  cena: DadosCartaoCena;
  /** Esta é a cena que o narrador está olhando. */
  vista: boolean;
  /** Alguma escrita desta cena está em voo — trava os gestos dela. */
  ocupada: boolean;
  /** Renomear falhou; a mensagem pertence a ESTE cartão. */
  erro: string | null;
  onAbrir: () => void;
  onRenomear: (nome: string) => void;
  /** Reordenar pelo teclado — o arrasto não é alcançável sem mouse. */
  onMover: (direcao: -1 | 1) => void;
  /** Levar a MESA para esta cena. Ausente enquanto a cena já é o palco. */
  onApresentar: () => void;
  podeSubir: boolean;
  podeDescer: boolean;
  /** Ganchos do arrasto, montados pelo gerenciador (ele é quem tem a lista). */
  arrasto: {
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    arrastando: boolean;
    alvo: boolean;
  };
}

export function CartaoCena(p: PropsCartaoCena) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(p.cena.nome);
  const campoRef = useRef<HTMLInputElement | null>(null);

  // O nome de fora manda enquanto ninguém está editando: o servidor
  // pode ter devolvido outro (nome em branco volta pro anterior), e o
  // cartão precisa mostrar o que a mesa PASSOU A TER.
  useEffect(() => {
    if (!editando) setRascunho(p.cena.nome);
  }, [p.cena.nome, editando]);

  useEffect(() => {
    if (editando) campoRef.current?.select();
  }, [editando]);

  function confirmar() {
    const limpo = rascunho.trim();
    setEditando(false);
    // Nome igual (ou vazio) não vira round-trip: `set_vtt_scene_config`
    // consome uma revisão a cada chamada, e gastar uma pra gravar o que
    // já estava lá faria o próximo salvamento legítimo ser recusado.
    if (limpo.length === 0 || limpo === p.cena.nome) {
      setRascunho(p.cena.nome);
      return;
    }
    p.onRenomear(limpo);
  }

  function cancelar() {
    setRascunho(p.cena.nome);
    setEditando(false);
  }

  return (
    <li
      className="rv-cena-cartao"
      data-vista={p.vista || undefined}
      data-arrastando={p.arrasto.arrastando || undefined}
      data-alvo={p.arrasto.alvo || undefined}
      data-testid="cena-cartao"
      data-cena-id={p.cena.id}
      draggable={!editando}
      onDragStart={p.arrasto.onDragStart}
      onDragOver={p.arrasto.onDragOver}
      onDrop={p.arrasto.onDrop}
      onDragEnd={p.arrasto.onDragEnd}
    >
      <span className="rv-cena-pegador" aria-hidden="true"><GripVertical size={13} /></span>

      {/* Slot da miniatura (Fase 4). Até lá, a inicial — que já
          distingue cartões de relance sem prometer uma imagem. */}
      <span className="rv-cena-mini" aria-hidden="true">
        {(p.cena.nome.trim()[0] ?? "?").toUpperCase()}
      </span>

      <span className="rv-cena-txt">
        {editando ? (
          <span className="rv-cena-editar">
            <input
              ref={campoRef}
              className="rv-cena-campo"
              value={rascunho}
              maxLength={120}
              aria-label="Nome da cena"
              data-testid="cena-campo-nome"
              onChange={(e) => setRascunho(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); confirmar(); }
                if (e.key === "Escape") { e.preventDefault(); cancelar(); }
              }}
              // Sair do campo confirma, como em toda edição inline da
              // mesa. Perder o que foi digitado por um clique fora é o
              // comportamento que mais irrita e menos protege.
              onBlur={confirmar}
            />
            <button type="button" className="rv-cena-mini-btn" aria-label="Confirmar nome" onMouseDown={(e) => e.preventDefault()} onClick={confirmar}>
              <Check size={13} />
            </button>
            <button type="button" className="rv-cena-mini-btn" aria-label="Cancelar" onMouseDown={(e) => e.preventDefault()} onClick={cancelar}>
              <X size={13} />
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="rv-cena-nome"
            data-testid="cena-abrir"
            disabled={p.ocupada}
            onClick={p.onAbrir}
            // O cartão inteiro ABRE; o lápis renomeia. Clicar no nome
            // pra renomear disputaria com o gesto principal.
            title={p.vista ? "Você já está nesta cena" : "Abrir esta cena"}
          >
            {p.cena.nome}
          </button>
        )}

        <span className="rv-cena-selos">
          {p.vista && <span className="rv-cena-selo" data-tipo="vista">Você está aqui</span>}
          {p.cena.apresentada && (
            <span className="rv-cena-selo" data-tipo="mesa">
              <Users size={11} aria-hidden="true" /> Jogadores aqui
            </span>
          )}
          {p.cena.local && <span className="rv-cena-local">{p.cena.local}</span>}
        </span>

        {p.erro && <span className="rv-cena-erro" role="alert">{p.erro}</span>}
      </span>

      <span className="rv-cena-acoes">
        {/* APRESENTAR — o único gesto do catálogo que mexe no que os
            jogadores veem, e por isso o único que precisa se distinguir
            dos outros à primeira vista. Some no cartão que já é o
            palco: "apresentar a cena que já está apresentada" é um
            clique sem efeito ocupando o lugar de um com efeito. */}
        {!p.cena.apresentada && !p.cena.arquivadaEm && (
          <button
            type="button" className="rv-cena-mini-btn" data-tipo="apresentar"
            aria-label={`Apresentar "${p.cena.nome}" aos jogadores`}
            title="Apresentar aos jogadores"
            data-testid="cena-apresentar"
            disabled={p.ocupada} onClick={p.onApresentar}
          ><MonitorPlay size={13} /></button>
        )}
        {/* Reordenar pelo teclado. O arrasto continua sendo o gesto
            natural, mas ele não existe pra quem navega por teclado — e
            "reordenar" estava no aceite desta fase pra todo mundo. */}
        <button
          type="button" className="rv-cena-mini-btn" aria-label={`Mover "${p.cena.nome}" para cima`}
          disabled={!p.podeSubir || p.ocupada} onClick={() => p.onMover(-1)}
        >↑</button>
        <button
          type="button" className="rv-cena-mini-btn" aria-label={`Mover "${p.cena.nome}" para baixo`}
          disabled={!p.podeDescer || p.ocupada} onClick={() => p.onMover(1)}
        >↓</button>
        {!editando && (
          <button
            type="button" className="rv-cena-mini-btn" aria-label={`Renomear "${p.cena.nome}"`}
            data-testid="cena-renomear"
            disabled={p.ocupada} onClick={() => setEditando(true)}
          ><Pencil size={13} /></button>
        )}
      </span>
    </li>
  );
}
