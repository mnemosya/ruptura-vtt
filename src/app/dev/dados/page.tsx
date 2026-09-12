/**
 * Harness do ROLADOR de dados — monta as peças REAIS
 * (`_dados3d/RoladorDados`) fora da mesa, para conferir o desenho
 * contra o design de origem (`chat % dice tray`) sem precisar de
 * campanha, sessão nem cena.
 *
 * A física agora acontece no PALCO, não numa bandeja dentro do painel
 * (ver `_dados3d/MesaDadosOverlay`) — por isso o harness simula um
 * `.rv-palco` ao lado dos controles: sem ele, `useRolarNaMesa` não
 * teria pra onde pedir a rolagem, e os botões ficariam desabilitados.
 *
 * Guardada por `assertDevRouteAllowed`, como as demais rotas `/dev`.
 */

import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { PainelHarness } from "./PainelHarness";
import { BandejaDados, RoladorDados } from "../../mesas/[campaignId]/vtt/_dados3d/RoladorDados";
import { ProvedorMesaDados } from "../../mesas/[campaignId]/vtt/_dados3d/ContextoMesaDados";
import { MesaDadosOverlay } from "../../mesas/[campaignId]/vtt/_dados3d/MesaDadosOverlay";
import "../../mesas/[campaignId]/vtt/vtt.css";

export const dynamic = "force-dynamic";

export default function DevDadosPage() {
  assertDevRouteAllowed();
  return (
    <ProvedorMesaDados>
      <div style={{ minHeight: "100dvh", background: "#060a12", padding: 24, display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ width: 434, borderRadius: 2, border: "1px solid #18263f", background: "linear-gradient(160deg,#0b1424,#080e19)", padding: 16 }}>
          <RoladorDados />
        </div>
        <div style={{ width: 400 }}>
          <BandejaDados />
        </div>
        {/* Palco simulado — é aqui, e não numa caixinha, que os dados
            caem de verdade na mesa. */}
        <div className="rv-palco" data-testid="palco-simulado" style={{ width: 680, height: 480, borderRadius: 2, border: "1px solid #18263f", background: "radial-gradient(circle at 50% 40%, #0d1a2c 0%, #060a12 72%)" }}>
          <span style={{ position: "absolute", left: 12, top: 10, fontFamily: "var(--font-mono), monospace", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#4f6285" }}>
            palco (simulado)
          </span>
          <MesaDadosOverlay />
        </div>
        <PainelHarness />
      </div>
    </ProvedorMesaDados>
  );
}
