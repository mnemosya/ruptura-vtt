"use client";

/**
 * FILA DE ROLAGEM DA MESA.
 *
 * Antes, cada pool de dados (teste de perícia, conjunto livre, bandeja
 * do chat) montava sua PRÓPRIA `PhysicsDiceArena` numa caixinha dentro
 * do próprio painel. Isso é o "dice tray" do estudo de origem — mas a
 * mesa real segue o Foundry: os dados caem sobre o TABULEIRO, não numa
 * moldura à parte.
 *
 * Esse contexto é o que torna isso possível sem cada pool precisar
 * saber onde fica o palco: quem quer rolar chama `pedir(dice, acento)`
 * e espera a Promise — a MESA (`MesaDadosOverlay`, montada uma vez, no
 * `.rv-palco`) é quem de fato desenha e resolve a física.
 *
 * FILA, não paralelo: só uma rolagem física por vez ocupa a mesa. Se
 * duas pools pedirem ao mesmo tempo (ex.: a bandeja do chat e a janela
 * de ferramenta abertas juntas), a segunda espera a primeira liberar —
 * dois conjuntos de dados caindo um por cima do outro não dá pra ler.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PhysicsDiceArena, type PhysicsDieResult, type PhysicsDieSpec } from "./ArenaDados";

export type PedidoRolagemMesa = {
  token: number;
  dice: PhysicsDieSpec[];
  accent: string;
  /** 0–1 — quanto o botão foi carregado. Ver `lancamento.ts`. */
  forca: number;
};

interface ContextoMesaDadosValor {
  pedido: PedidoRolagemMesa | null;
  pedir: (dice: PhysicsDieSpec[], accent: string, forca?: number) => Promise<PhysicsDieResult[]>;
  /** A física assentou: resolve a Promise de quem pediu. */
  resolverPedido: (token: number, results: PhysicsDieResult[]) => void;
  /** O período de leitura (dados parados na mesa) acabou: libera a mesa pro próximo da fila. */
  finalizarPedido: (token: number) => void;
  /**
   * O PALCO se anuncia.
   *
   * O provedor passou a viver na casca da campanha inteira (pra que o
   * Console — que é uma janela da casca, não do VTT — também role na
   * mesa). Mas o desenho da física continua sendo do VTT, e fora dele
   * não existe palco nenhum: sem isto, um pedido feito na página de
   * Personagens ficaria pendurado pra sempre, esperando uma arena que
   * ninguém montou. Quem monta reivindica; sem reivindicação, o próprio
   * provedor desenha (por cima da página, em tela cheia).
   */
  reivindicarPalco: () => () => void;
  /** `true` enquanto o VTT tem a arena montada. */
  palcoProprio: boolean;
}

const ContextoMesaDados = createContext<ContextoMesaDadosValor | null>(null);

let proximoToken = 1;

export function ProvedorMesaDados({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<PedidoRolagemMesa | null>(null);
  const [palcos, setPalcos] = useState(0);
  const filaRef = useRef<PedidoRolagemMesa[]>([]);
  const resolversRef = useRef<Map<number, (results: PhysicsDieResult[]) => void>>(new Map());

  const pedir = useCallback((dice: PhysicsDieSpec[], accent: string, forca = 0) => {
    return new Promise<PhysicsDieResult[]>((resolve) => {
      const item: PedidoRolagemMesa = { token: proximoToken++, dice, accent, forca };
      resolversRef.current.set(item.token, resolve);
      setPedido((atual) => {
        if (atual) {
          filaRef.current.push(item);
          return atual;
        }
        return item;
      });
    });
  }, []);

  const resolverPedido = useCallback((token: number, results: PhysicsDieResult[]) => {
    resolversRef.current.get(token)?.(results);
    resolversRef.current.delete(token);
  }, []);

  const finalizarPedido = useCallback((token: number) => {
    setPedido((atual) => {
      // Defensivo: um token velho terminando depois de outro já ter
      // assumido a mesa não pode reabrir espaço que não é dele.
      if (atual?.token !== token) return atual;
      return filaRef.current.shift() ?? null;
    });
  }, []);

  const reivindicarPalco = useCallback(() => {
    setPalcos((n) => n + 1);
    return () => setPalcos((n) => Math.max(0, n - 1));
  }, []);

  const palcoProprio = palcos > 0;

  const valor = useMemo<ContextoMesaDadosValor>(
    () => ({ pedido, pedir, resolverPedido, finalizarPedido, reivindicarPalco, palcoProprio }),
    [pedido, pedir, resolverPedido, finalizarPedido, reivindicarPalco, palcoProprio],
  );

  return (
    <ContextoMesaDados.Provider value={valor}>
      {children}
      {/* Palco de RESERVA: fora do VTT (Personagens, ficha aberta por
          cima de qualquer página) ninguém montou arena, e os dados
          precisam cair em algum lugar. Cai por cima da página inteira,
          que é o equivalente da mesa ali. `pointer-events: none` —
          é imagem passando, nunca uma camada que engole clique. */}
      {!palcoProprio && <PalcoDeReserva />}
    </ContextoMesaDados.Provider>
  );
}

const TEMPO_LEITURA_RESERVA_MS = 2600;

function PalcoDeReserva() {
  const ctx = useContext(ContextoMesaDados);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; }, []);
  if (!ctx?.pedido) return null;
  const { pedido } = ctx;
  return (
    <div
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, zIndex: 900, pointerEvents: "none" }}
    >
      <PhysicsDiceArena
        dice={pedido.dice}
        rollToken={pedido.token}
        accent={pedido.accent}
        perfil="mesa"
        forca={pedido.forca}
        onSettled={(results) => {
          ctx.resolverPedido(pedido.token, results);
          timersRef.current.push(setTimeout(() => ctx.finalizarPedido(pedido.token), TEMPO_LEITURA_RESERVA_MS));
        }}
      />
    </div>
  );
}

/**
 * Pede uma rolagem NA MESA. Fora de uma `ProvedorMesaDados` (não deveria
 * acontecer fora de `/dev`, guardado caso a caso por quem chama)
 * retorna `null` — quem chama decide o que fazer sem mesa por perto.
 */
export function useRolarNaMesa(): ((dice: PhysicsDieSpec[], accent: string, forca?: number) => Promise<PhysicsDieResult[]>) | null {
  const ctx = useContext(ContextoMesaDados);
  return ctx?.pedir ?? null;
}

/** Uso interno de `MesaDadosOverlay` — o único lugar que desenha a física. */
export function usePedidoMesaDados() {
  return useContext(ContextoMesaDados);
}
