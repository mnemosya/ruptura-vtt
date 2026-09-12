"use client";

/**
 * Diálogos do painel — o substituto de `window.prompt` e
 * `window.confirm`.
 *
 * Os nativos estão fora por dois motivos concretos, não por gosto:
 * eles são um popup do SISTEMA OPERACIONAL (tipografia, cores e
 * geometria que nada têm a ver com a estação diegética do Ruptura), e
 * bloqueiam a thread — congelando mapa, Realtime e animações enquanto
 * estão abertos.
 *
 * Estes vivem na mesma moldura das janelas internas: portal, foco
 * contido, Esc para cancelar, Enter para confirmar, e o foco devolvido
 * ao abridor com `preventScroll`.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BotaoTecnico } from "./primitivas";
import type { Acento } from "./primitivas";

function useMoldura(aoFechar: () => void, aberto: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const abridorRef = useRef<HTMLElement | null>(null);
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);
  useEffect(() => {
    if (aberto) abridorRef.current = document.activeElement as HTMLElement | null;
  }, [aberto]);

  const fechar = useCallback(() => {
    aoFechar();
    abridorRef.current?.focus?.({ preventScroll: true });
  }, [aoFechar]);

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        fechar();
        return;
      }
      if (e.key !== "Tab") return;
      const focaveis = ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)");
      if (!focaveis || focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus({ preventScroll: true });
      } else if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus({ preventScroll: true });
      }
    }
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [aberto, fechar]);

  return { ref, fechar, montado };
}

/** Pedido de TEXTO — o que era `window.prompt`. */
export function DialogoTexto({
  aberto,
  titulo,
  rotulo,
  valorInicial = "",
  placeholder,
  rotuloConfirmar = "Confirmar",
  /** Caixa de marcação opcional (ex.: "É um PN"), para não precisar de um segundo diálogo. */
  marcacao,
  onConfirmar,
  onCancelar,
  testId,
}: {
  aberto: boolean;
  titulo: string;
  rotulo: string;
  valorInicial?: string;
  placeholder?: string;
  rotuloConfirmar?: string;
  marcacao?: { rotulo: string; inicial?: boolean };
  onConfirmar: (valor: string, marcado: boolean) => void;
  onCancelar: () => void;
  testId?: string;
}) {
  const { ref, fechar, montado } = useMoldura(onCancelar, aberto);
  const [valor, setValor] = useState(valorInicial);
  const [marcado, setMarcado] = useState(marcacao?.inicial ?? false);
  const campoRef = useRef<HTMLInputElement>(null);
  const idCampo = useId();
  const idTitulo = useId();

  useEffect(() => {
    if (!aberto) return;
    setValor(valorInicial);
    setMarcado(marcacao?.inicial ?? false);
    const t = requestAnimationFrame(() => {
      campoRef.current?.focus({ preventScroll: true });
      campoRef.current?.select();
    });
    return () => cancelAnimationFrame(t);
  }, [aberto, valorInicial, marcacao?.inicial]);

  if (!aberto || !montado) return null;

  const confirmar = () => {
    const v = valor.trim();
    if (!v) return;
    onConfirmar(v, marcado);
  };

  return createPortal(
    <>
      <div className="pn-jan-fundo" role="presentation" onClick={fechar} />
      <div
        ref={ref}
        className="pn-jan pn-dialogo"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        data-testid={testId}
      >
        <div className="pn-jan-top">
          <span className="pn-jan-titulo" id={idTitulo}>{titulo}</span>
        </div>
        <div className="pn-jan-corpo">
          <label className="rv-pn-campo" style={{ marginTop: 0 }} htmlFor={idCampo}>
            <span>{rotulo}</span>
            <input
              id={idCampo}
              ref={campoRef}
              className="rv-pn-input"
              value={valor}
              placeholder={placeholder}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmar();
                }
              }}
              data-testid="painel-dialogo-campo"
            />
          </label>
          {marcacao && (
            <label className="rv-pn-check" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} data-testid="painel-dialogo-marcacao" />
              {marcacao.rotulo}
            </label>
          )}
        </div>
        <div className="pn-dialogo-acoes">
          <BotaoTecnico acento="neutro" onClick={fechar} testId="painel-dialogo-cancelar">
            Cancelar
          </BotaoTecnico>
          <BotaoTecnico acento="cy" onClick={confirmar} desabilitado={!valor.trim()} testId="painel-dialogo-confirmar">
            {rotuloConfirmar}
          </BotaoTecnico>
        </div>
      </div>
    </>,
    document.body,
  );
}

/** Confirmação destrutiva — o que era `window.confirm`. */
export function DialogoConfirmar({
  aberto,
  titulo,
  mensagem,
  rotuloConfirmar = "Confirmar",
  acento = "perigo",
  onConfirmar,
  onCancelar,
  testId,
}: {
  aberto: boolean;
  titulo: string;
  mensagem: ReactNode;
  rotuloConfirmar?: string;
  acento?: Acento;
  onConfirmar: () => void;
  onCancelar: () => void;
  testId?: string;
}) {
  const { ref, fechar, montado } = useMoldura(onCancelar, aberto);
  const idTitulo = useId();

  useEffect(() => {
    if (!aberto) return;
    const t = requestAnimationFrame(() => {
      ref.current?.querySelector<HTMLButtonElement>('[data-testid="painel-dialogo-confirmar"]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(t);
  }, [aberto, ref]);

  if (!aberto || !montado) return null;

  return createPortal(
    <>
      <div className="pn-jan-fundo" role="presentation" onClick={fechar} />
      <div ref={ref} className="pn-jan pn-dialogo" role="alertdialog" aria-modal="true" aria-labelledby={idTitulo} data-testid={testId}>
        <div className="pn-jan-top">
          <span className="pn-jan-titulo" id={idTitulo}>{titulo}</span>
        </div>
        <div className="pn-jan-corpo">
          <p className="pn-texto">{mensagem}</p>
        </div>
        <div className="pn-dialogo-acoes">
          <BotaoTecnico acento="neutro" onClick={fechar} testId="painel-dialogo-cancelar">
            Cancelar
          </BotaoTecnico>
          <BotaoTecnico
            acento={acento}
            onClick={() => {
              onConfirmar();
              fechar();
            }}
            testId="painel-dialogo-confirmar"
          >
            {rotuloConfirmar}
          </BotaoTecnico>
        </div>
      </div>
    </>,
    document.body,
  );
}
