"use client";

/**
 * Cortina de entrada na mesa (V1 "Seco"): a arte da campanha, o papel e a
 * região, o nome com glitch e uma barra de carga indeterminada.
 *
 * Duas pontas usam a MESMA cortina, para a entrada ser um gesto só:
 *   - Minhas Campanhas abre a cortina (com a animação de entrada) e
 *     navega; sem `loading.tsx` na rota da campanha, o Next mantém a
 *     página de baixo — e a cortina — até a mesa estar pronta;
 *   - o `VttClient` mostra a cortina como CONTINUAÇÃO (`continuacao`,
 *     sem animar de novo) enquanto a cena carrega, e ela some quando a
 *     cena chega.
 *
 * Traz a própria raiz `.v1` (fontes e folha da área autenticada) porque
 * na mesa ela vive fora da casca global.
 *
 * O loading antigo (o "Terminal da Mesa") está guardado em
 * `_boundaries/TerminalDaMesa.tsx`.
 */

import { useEffect, useState, type CSSProperties } from "react";
import { oxanium } from "../../_design/oxanium";
import { teko } from "../../_design/teko";
import "../../_design/areaV1.css";

export function CortinaDaMesa({ nome, papel, regiao, capa, continuacao = false }: {
  nome: string;
  papel: "narrator" | "player";
  /** Nome da região, ou null. */
  regiao: string | null;
  /** Estilo de fundo da capa (`capaDaCampanha`). */
  capa: CSSProperties;
  /** Já aberta por quem navegou: aparece pronta, sem a animação de entrada. */
  continuacao?: boolean;
}) {
  const entra = (cls: string) => (continuacao ? "" : cls);
  // A arte entra com fade quando termina de carregar, em vez de pipocar
  // no meio da cortina (a capa enviada pode demorar a chegar).
  const url = typeof capa.backgroundImage === "string" ? /url\(['"]?(.*?)['"]?\)/.exec(capa.backgroundImage)?.[1] ?? null : null;
  const [carregada, setCarregada] = useState(!url);
  useEffect(() => {
    if (!url) { setCarregada(true); return; }
    const img = new Image();
    img.onload = img.onerror = () => setCarregada(true);
    img.src = url;
    if (img.complete) setCarregada(true);
  }, [url]);
  return (
    <div className={`v1 ${teko.variable} ${oxanium.variable}`}>
      <div className={`v1-entrada ${entra("v1-cortina")}${continuacao ? " v1-entrada--continua" : ""}`} role="status" aria-live="polite" aria-label={`Entrando em ${nome}`} data-testid="cortina-da-mesa">
        <div className={`v1-entrada-arte ${entra("v1-kenburns")}${carregada ? "" : " v1-entrada-arte--carregando"}`} style={capa} aria-hidden="true" />
        <div className="v1-entrada-veu" aria-hidden="true" />
        <div className="v1-entrada-linhas" aria-hidden="true" />
        <div className="v1-scanline v1-entrada-varredura" aria-hidden="true" />
        <div className="v1-entrada-corpo">
          <span className={`v1-entrada-sobrancelha ${entra("v1-desliza-a")}`} data-papel={papel}>◆ {papel === "narrator" ? "Narrador" : "Jogador"} · {regiao ? `Região · ${regiao}` : "Sem região"}</span>
          <span className={`v1-entrada-nome ${entra("v1-glitch-a")}`}>{nome}</span>
          <div className={`v1-entrada-carga ${entra("v1-desliza-a")}`}>
            <span className="v1-carregando v1-entrada-etapa">Entrando na mesa</span>
            <div className="v1-entrada-barra"><span /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
