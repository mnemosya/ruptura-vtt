"use client";

import { useMemo, useState } from "react";
import type { CatalogosCriacaoV12 } from "../../../mesas/[campaignId]/vtt/_acoes/criacaoV12Actions";
import { etapasProgressaoV12, type DraftAvancoV12, type PartidaProgressaoV12, type RankingV12 } from "../../../../lib/rulesetV12";
import { ProgressaoFluxo } from "../../../mesas/[campaignId]/vtt/_forja/progressao/ProgressaoFluxo";
import { oxanium } from "../../../_design/oxanium";

/** Os níveis de perícia da prancheta de Perícias. */
const PERICIAS_BASE = { arcanismo: 2, balistica: 1, intimidacao: 2, luta: 3, mobilidade: 1, percepcao: 1, precisao: 1, reflexos: 3, vigor: 1 };

const CASOS: Record<string, { partida: PartidaProgressaoV12; alvo: RankingV12 }> = {
  // Primeira vez no E: escolhe a subclasse.
  E: { alvo: "E", partida: { de: "F", base: { atributos: { corpo: 2, mente: 1, animo: 1 }, pericias: PERICIAS_BASE, vertentes: {} } } },
  // Subclasse já escolhida (Dissecador): o C traz a característica sozinha.
  C: { alvo: "C", partida: { de: "D", base: { atributos: { corpo: 2, mente: 2, animo: 1 }, pericias: PERICIAS_BASE, vertentes: { cinetica: 1 }, subclasse_id: "dissecador" } } },
  // D: Você ganha + Atributo (a prancheta de Atributo).
  D: { alvo: "D", partida: { de: "E", base: { atributos: { corpo: 2, mente: 2, animo: 1 }, pericias: PERICIAS_BASE, vertentes: { cinetica: 1 }, subclasse_id: "dissecador" } } },
  // Vários Rankings de uma vez.
  multi: { alvo: "C", partida: { de: "F", base: { atributos: { corpo: 2, mente: 1, animo: 1 }, pericias: PERICIAS_BASE, vertentes: {} } } },
};

/**
 * Prévia isolada da Progressão em sub-etapas, com o Combatente.
 * `?caso=E|C|D|multi`, `?palco=1440|1920`, `?tela=E:vertente` abre direto numa sub-etapa e
 * `?quadro=1` prende a tela em 1080×700 — o tamanho das pranchetas —
 * para a comparação lado a lado.
 */
export function ProgressaoDev({ catalogos, caso, tela, quadro, palco, escolhas }: { catalogos: CatalogosCriacaoV12; caso: string; tela?: string; quadro: boolean; palco?: number; escolhas: Record<string, DraftAvancoV12> }) {
  const classe = catalogos.classes.find((c) => c.slug === "combatente");
  const { partida, alvo } = CASOS[caso] ?? CASOS.E;
  const [avancos, setAvancos] = useState<Record<string, DraftAvancoV12>>(escolhas);
  const etapas = useMemo(
    () => etapasProgressaoV12({ rankingInicial: alvo, avancos }, classe, catalogos.subclasses ?? [], partida),
    [alvo, avancos, classe, catalogos.subclasses, partida],
  );
  const fluxo = (
    <ProgressaoFluxo
      contexto={caso === "C" ? "evolucao" : "criacao"}
      kicker={caso === "C" ? "Evolução" : "Etapa 09"}
      d={{ classeSlug: "combatente", avancos }}
      set={(p) => setAvancos(p.avancos ?? {})}
      catalogos={catalogos}
      etapas={etapas}
      classe={classe}
      sincronia={70}
      primaria="cinetica"
      inicio={tela}
      voltarForja={{ rotulo: "Vertente", onClick: () => alert("Volta ao passo Vertente da Forja") }}
      concluir={caso === "C"
        ? { rotulo: "Selar progressão", onClick: () => alert("Selar"), desabilitado: etapas.some((e) => e.faltas.length) }
        : { rotulo: "Revisão", onClick: () => alert("Segue para a Revisão") }}
      onFechar={caso === "C" ? () => alert("Fechar") : undefined}
    />
  );
  // `?palco=1280|1440|1920`: a área útil do palco da Forja nesses tamanhos de tela (1280 = 1280×720) (as pranchetas "Console · …").
  const area = palco === 1920 ? { width: 1880, height: 765 } : palco === 1440 ? { width: 1400, height: 815 } : palco === 1280 ? { width: 1240, height: 635 } : null;
  if (area) {
    return (
      <div className={`fj-root ${oxanium.variable} fj-forja`} style={{ minHeight: "100dvh", background: "#06121c" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/forja/regioes/vastra.webp" alt="" className="fj-palco__fundo" />
        <div className="fj-palco__veu" />
        <div className="fj-grade fj-grade--progressao" data-testid="palco" style={{ position: "absolute", left: 20, top: 65, ...area }}>
          <main className="fj-centro">{fluxo}</main>
        </div>
      </div>
    );
  }
  return (
    <div className={`fj-root ${oxanium.variable}`} style={{ minHeight: "100dvh", background: "#030b12", display: "grid", placeItems: quadro ? "start" : "stretch" }}>
      <div data-testid="progressao" style={quadro ? { width: 1080, height: 700 } : { height: "100dvh" }}>{fluxo}</div>
    </div>
  );
}
