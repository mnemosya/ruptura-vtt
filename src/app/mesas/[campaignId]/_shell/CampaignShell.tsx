"use client";

/**
 * Casca da campanha — e o que sobrou dela.
 *
 * Ela desenhava a moldura que toda rota sob `/mesas/[campaignId]`
 * herdava: atmosfera HUD, cabeçalho com nome e papel, trilho de
 * navegação, área de conteúdo roteado e a faixa lateral de sessão. Era
 * a estrutura certa enquanto a campanha tinha oito rotas.
 *
 * Hoje tem UMA: a mesa. As outras sete viraram janelas dentro dela, e
 * o VTT é `position: fixed; inset: 0` — tudo que esta casca desenhava
 * ficava DEBAIXO dele, ocupando DOM, recebendo Tab e sendo anunciado
 * por leitor de tela sem nunca chegar a um pixel. Então ela parou de
 * desenhar, e o que desenhava foi apagado junto: trilho, cabeçalho,
 * dock de turno, fundo decorativo e painel de sessão.
 *
 * O que ficou é o que NÃO desenha e a mesa usa de verdade:
 *
 *   · `.rm-root` — o ESCOPO dos tokens `rm-*`. As janelas que vieram
 *     das páginas (Conteúdo da campanha, o assistente de criação)
 *     trouxeram as classes daquela paleta junto; sem este escopo, as
 *     cores caem no valor inicial;
 *   · os provedores: Console do personagem (janela desta casca, aberta
 *     de três lugares da mesa), mesa de dados 3D e trilha de turnos;
 *   · o cursor HUD.
 *
 * O `CampaignRealtimeProvider`, de onde o Chat tira o log e a aba
 * Participantes tira o roster, fica um degrau acima, no `layout.tsx`.
 */

import { useEffect, useState, type ReactNode } from "react";
import { HudCursor } from "../../_global/GlobalShell";
import { ProvedorConsoleDaMesa } from "./ConsoleDaMesa";
import { ProvedorMesaDados } from "../vtt/_dados3d/ContextoMesaDados";
import { ProvedorTrilhaDaMesa } from "./TrilhaDaMesa";
import "../../../_design/mesa.css";

/** O cursor HUD sai de cena para quem pediu menos movimento. */
function useCursorHabilitado(): boolean {
  const [habilitado, setHabilitado] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setHabilitado(!mq.matches);
    const onChange = () => setHabilitado(!mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return habilitado;
}

export function CampaignShell({ campaignId, children }: { campaignId: string; children: ReactNode }) {
  const cursorHabilitado = useCursorHabilitado();

  return (
    <ProvedorTrilhaDaMesa campaignId={campaignId}>
      {/* A mesa de dados envolve a campanha INTEIRA, não só o mapa: o
          Console é uma janela desta casca e rola pelos mesmos d8 de
          verdade que a ferramenta do mapa. Quem DESENHA a física é quem
          tem palco — o VTT o reivindica. */}
      <ProvedorMesaDados>
        <ProvedorConsoleDaMesa campaignId={campaignId}>
          <div className="rm-root rm-root--vtt">
            <HudCursor enabled={cursorHabilitado} />
            {children}
          </div>
        </ProvedorConsoleDaMesa>
      </ProvedorMesaDados>
    </ProvedorTrilhaDaMesa>
  );
}
