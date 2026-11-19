"use client";

/**
 * MESA DOS PROTÓTIPOS — cópia de `_dados3d/ContextoMesaDados.tsx` +
 * `_dados3d/MesaDadosOverlay.tsx`, com o mesmo contrato de tempo
 * (`TEMPO_LEITURA_MS` 1800, saída de 320) e a mesma camada: portal no
 * `body`, `position: fixed`, `pointer-events: none` (`.rv-mesa-dados-overlay`).
 *
 * O que entra a mais (e o porte precisaria levar):
 *   · `lancar` recebe dados com aparência própria e avisa CADA dado que
 *     assenta (`aoAssentarDado`) — o Normal chega antes do Sobrecarga;
 *   · `controle` — a proposta muda o estado visual dos dados que ainda
 *     estão na mesa (a troca acontecendo diante de todos);
 *   · `encenar` — os dados voltam à mesa parados, na pose em que
 *     assentaram, para uma reencenação curta (proposta C);
 *   · `segurar` — enquanto o ponteiro está num rótulo da mesa, os dados
 *     não saem (proposta C);
 *   · `inscreverProjecao` — posição de cada dado na tela, quadro a
 *     quadro, para rótulos no DOM sem re-render do React.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type MutableRefObject, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ArenaDupla,
  type ControleArena, type DadoArena, type EstadoDado, type MedidaArena, type Pose, type Projecao, type ResultadoDado,
} from "./ArenaDupla";

export const TEMPO_LEITURA_MS = 1800;
export const TEMPO_SAIDA_MS = 320;

export type Cena = { poses: Record<string, Pose>; rotulos: Record<string, number[]>; estados: Record<string, EstadoDado> };

type Pedido = {
  token: number;
  tipo: "lance" | "cena";
  dados: DadoArena[];
  forca: number;
  estadoAoAssentar?: Record<string, EstadoDado>;
  cena?: Cena;
  /** Cena: quanto fica na mesa antes de sair. */
  duracaoMs?: number;
  /** Etiqueta de quem rolou, que acompanha os dados (quem observa). */
  rotulo?: string;
  aoAssentarDado?: (r: ResultadoDado) => void;
  aoCenaPronta?: (c: ControleArena) => void;
  resolver: (r: ResultadoDado[], medida: MedidaArena) => void;
};

export interface OpcoesLance {
  estadoAoAssentar?: Record<string, EstadoDado>;
  aoAssentarDado?: (r: ResultadoDado) => void;
  rotulo?: string;
}

export interface MesaApi {
  pedido: Pedido | null;
  saindo: boolean;
  lancar: (dados: DadoArena[], forca: number, opcoes?: OpcoesLance) => Promise<{ resultados: ResultadoDado[]; medida: MedidaArena }>;
  /** Reencenação: dados parados nas poses dadas; `roteiro` recebe o controle quando a cena aparece. */
  encenar: (dados: DadoArena[], cena: Cena, roteiro: (c: ControleArena) => void, duracaoMs: number) => Promise<void>;
  /** Controle dos dados que estão na mesa agora (ou `null`). */
  controle: MutableRefObject<ControleArena | null>;
  /** Os dados de um lance ainda estão na mesa (e não saindo)? */
  naMesa: () => boolean;
  /** Enquanto `true`, os dados não saem. */
  segurar: (sim: boolean) => void;
  inscreverProjecao: (fn: (p: Projecao[]) => void) => () => void;
  reduzido: boolean;
}

const Contexto = createContext<MesaApi | null>(null);
let proximoToken = 1;

export function ProvedorMesa({ children, reduzido = false }: { children: ReactNode; reduzido?: boolean }) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [saindo, setSaindo] = useState(false);
  const fila = useRef<Pedido[]>([]);
  const controle = useRef<ControleArena | null>(null);
  /** O pedido na mesa agora — fonte da verdade da fila (o estado só desenha). */
  const atual = useRef<Pedido | null>(null);
  const saindoRef = useRef(false);
  saindoRef.current = saindo;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const segurando = useRef(false);
  const assentou = useRef(false);
  const inscritos = useRef(new Set<(p: Projecao[]) => void>());

  const limparTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  /*
   * A fila mora em refs, FORA dos atualizadores do `setState`. A real
   * (`ContextoMesaDados`) faz `push`/`shift` dentro do atualizador — em
   * modo estrito o React chama o atualizador duas vezes, e o `shift`
   * dobrado engole o pedido seguinte: um lance pedido enquanto os dados
   * anteriores ainda estão na mesa nunca cai, e a janela fica em
   * "Rolando…". Reproduzido aqui antes desta correção.
   */
  const enfileirar = useCallback((p: Pedido) => {
    if (atual.current) { fila.current.push(p); return; }
    atual.current = p;
    setPedido(p);
  }, []);

  const finalizar = useCallback((token: number) => {
    if (atual.current?.token !== token) return;
    limparTimers();
    setSaindo(false);
    assentou.current = false;
    const proximo = fila.current.shift() ?? null;
    atual.current = proximo;
    setPedido(proximo);
  }, []);

  const agendarSaida = useCallback((token: number, leitura: number) => {
    limparTimers();
    timers.current.push(
      setTimeout(() => setSaindo(true), Math.max(0, leitura - TEMPO_SAIDA_MS)),
      setTimeout(() => finalizar(token), leitura),
    );
  }, [finalizar]);

  const lancar = useCallback<MesaApi["lancar"]>((dados, forca, opcoes = {}) => new Promise((resolve) => {
    enfileirar({
      token: proximoToken++, tipo: "lance", dados, forca,
      estadoAoAssentar: opcoes.estadoAoAssentar, aoAssentarDado: opcoes.aoAssentarDado, rotulo: opcoes.rotulo,
      resolver: (resultados, medida) => resolve({ resultados, medida }),
    });
  }), [enfileirar]);

  const encenar = useCallback<MesaApi["encenar"]>((dados, cena, roteiro, duracaoMs) => new Promise((resolve) => {
    enfileirar({
      token: proximoToken++, tipo: "cena", dados, forca: 0, cena, duracaoMs,
      aoCenaPronta: roteiro, resolver: () => resolve(),
    });
  }), [enfileirar]);

  const segurar = useCallback((sim: boolean) => {
    segurando.current = sim;
    const p = atual.current;
    if (!p || !assentou.current) return;
    if (sim) { limparTimers(); setSaindo(false); }
    else agendarSaida(p.token, 900);
  }, [agendarSaida]);

  const aoAssentar = useCallback((p: Pedido, resultados: ResultadoDado[], medida: MedidaArena) => {
    assentou.current = true;
    p.resolver(resultados, medida);
    if (p.tipo === "cena") {
      if (controle.current) p.aoCenaPronta?.(controle.current);
      agendarSaida(p.token, p.duracaoMs ?? 1200);
      return;
    }
    if (!segurando.current) agendarSaida(p.token, TEMPO_LEITURA_MS);
  }, [agendarSaida]);

  useEffect(() => () => limparTimers(), []);

  const api = useMemo<MesaApi>(() => ({
    pedido, saindo, lancar, encenar, controle, segurar, reduzido,
    naMesa: () => !!atual.current && atual.current.tipo === "lance" && !saindoRef.current,
    inscreverProjecao: (fn) => { inscritos.current.add(fn); return () => { inscritos.current.delete(fn); }; },
  }), [pedido, saindo, lancar, encenar, segurar, reduzido]);

  return (
    <Contexto.Provider value={api}>
      {children}
      <Overlay pedido={pedido} saindo={saindo} controle={controle} reduzido={reduzido}
        aoAssentar={aoAssentar} inscritos={inscritos} />
    </Contexto.Provider>
  );
}

export function useMesa(): MesaApi {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useMesa fora de ProvedorMesa");
  return ctx;
}

/** Camada da mesa — portal no `body`, atravessável (`.rv-mesa-dados-overlay`). */
function Overlay({ pedido, saindo, controle, reduzido, aoAssentar, inscritos }: {
  pedido: Pedido | null;
  saindo: boolean;
  controle: MutableRefObject<ControleArena | null>;
  reduzido: boolean;
  aoAssentar: (p: Pedido, r: ResultadoDado[], m: MedidaArena) => void;
  inscritos: MutableRefObject<Set<(p: Projecao[]) => void>>;
}) {
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);
  const etiqueta = useRef<HTMLDivElement>(null);
  const assentouEtiqueta = useRef(false);
  useEffect(() => { assentouEtiqueta.current = false; }, [pedido?.token]);
  if (!montado || !pedido) return null;
  const p = pedido;
  return createPortal(
    <div
      className="rv-mesa-dados-overlay rp-overlay"
      data-saindo={saindo || undefined}
      data-tipo={p.tipo}
      data-reduzido={reduzido || undefined}
      aria-hidden="true"
    >
      <ArenaDupla
        key={p.token}
        dados={p.dados}
        token={p.token}
        forca={p.forca}
        reduzido={reduzido}
        cena={p.cena}
        estadoAoAssentar={p.estadoAoAssentar}
        controleRef={controle}
        aoAssentarDado={(r) => p.aoAssentarDado?.(r)}
        aoAssentar={(r, m) => {
          assentouEtiqueta.current = true;
          if (etiqueta.current) etiqueta.current.dataset.assentou = "true";
          aoAssentar(p, r, m);
        }}
        aoProjetar={(proj) => {
          // Etiqueta de quem rolou: segue o centro do punhado, acima dele.
          if (p.rotulo && etiqueta.current && proj.length) {
            const x = proj.reduce((s, q) => s + q.x, 0) / proj.length;
            const y = Math.min(...proj.map((q) => q.y));
            etiqueta.current.style.transform = `translate(${x}px, ${y - 64}px) translate(-50%, -100%)`;
          }
          inscritos.current.forEach((fn) => fn(proj));
        }}
      />
      {p.rotulo && (
        <div ref={etiqueta} className="rp-etiqueta-mesa">{p.rotulo}</div>
      )}
    </div>,
    document.body,
  );
}
