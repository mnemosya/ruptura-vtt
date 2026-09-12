"use client";

import { ProvedorJanelasFerramenta } from "../../mesas/[campaignId]/vtt/_shell/JanelaFerramenta";
import { PainelDados } from "../../mesas/[campaignId]/vtt/_shell/PainelDados";

/** Só a moldura flutuante do painel, para conferir espinha/cantos/cabeçalho. */
export function PainelHarness() {
  return (
    <ProvedorJanelasFerramenta campaignId="harness" usuarioId={null}>
      <div style={{ position: "relative", width: 560, height: 720 }}>
        <PainelDados onFechar={() => {}} campaignId={null} personagemSugerido={null} />
      </div>
    </ProvedorJanelasFerramenta>
  );
}
