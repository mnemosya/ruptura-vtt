"use client";

/**
 * A MESA é a bandeja. Montado uma vez, como filho de `.rv-palco`
 * (o mapa em tela cheia) — enquanto ninguém pediu uma rolagem
 * (`usePedidoMesaDados().pedido` nulo) não desenha nada, nem monta o
 * `WebGLRenderer`.
 *
 * `pointer-events: none` (via CSS) de propósito: os dados são só
 * espetáculo, o mapa por baixo continua clicável/arrastável enquanto
 * eles caem.
 */

import { useEffect, useRef, useState } from "react";
import { PhysicsDiceArena, type PhysicsDieResult } from "./ArenaDados";
import { usePedidoMesaDados } from "./ContextoMesaDados";

/** Quanto tempo os dados ficam parados na mesa, legíveis, antes de sumir. */
const TEMPO_LEITURA_MS = 950;
/** Janela final desse tempo em que eles se apagam, em vez de sumir seco. */
const TEMPO_SAIDA_MS = 320;

export function MesaDadosOverlay({ zoomMapa }: { zoomMapa?: number } = {}) {
  const ctx = usePedidoMesaDados();
  const [saindo, setSaindo] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const token = ctx?.pedido?.token;

  // Reivindica o palco enquanto esta arena estiver montada — assim o
  // provedor sabe que NÃO precisa desenhar a dele por cima da página.
  const reivindicar = ctx?.reivindicarPalco;
  useEffect(() => reivindicar?.(), [reivindicar]);

  useEffect(() => {
    setSaindo(false);
    return () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };
  }, [token]);

  if (!ctx?.pedido) return null;
  const { pedido } = ctx;

  const aoAssentar = (results: PhysicsDieResult[]) => {
    // Resolve JÁ — quem pediu (o pool no painel) atualiza o número na
    // hora. A mesa só continua mostrando os dados parados mais um
    // instante, pro efeito não sumir no mesmo frame em que assenta.
    ctx.resolverPedido(pedido.token, results);
    timersRef.current.push(
      setTimeout(() => setSaindo(true), Math.max(TEMPO_LEITURA_MS - TEMPO_SAIDA_MS, 0)),
      setTimeout(() => ctx.finalizarPedido(pedido.token), TEMPO_LEITURA_MS),
    );
  };

  return (
    <div className="rv-mesa-dados-overlay" data-saindo={saindo || undefined} aria-hidden="true">
      <PhysicsDiceArena
        dice={pedido.dice}
        rollToken={pedido.token}
        accent={pedido.accent}
        perfil="mesa"
        forca={pedido.forca}
        zoomMapa={zoomMapa}
        onSettled={aoAssentar}
      />
    </div>
  );
}
