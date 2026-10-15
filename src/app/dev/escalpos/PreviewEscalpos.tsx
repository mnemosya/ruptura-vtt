"use client";

import { useState } from "react";
import { EscalposPanel } from "../../ficha/_console/panels/EscalposPanel";
import { ConsoleWindow } from "../../ficha/_console/ConsoleWindow";
import { createInitialCharacter, installEscalpo, removeInstalledEscalpo, computeDerivedStats, normalizeItemContent } from "../../../lib/character";
import { normalizeTechnicalContentItem } from "../../../lib/content/technicalLibrary";
import { catalogWithMarketEscalpos } from "../../../lib/character/marketEscalpos";
import db from "../../../../content/v12/db_mercado_escalpos_v1_2.json";
import itens from "../../../../content/v12/db_mercado_itens_v1_2.json";

const catalogo = db.escalpos.map(normalizeTechnicalContentItem);
const mercado = catalogWithMarketEscalpos(itens.itens.map(normalizeItemContent), catalogo);
const semente = () => {
  const c = createInitialCharacter(null, "Prévia de escalpos");
  c.atributos.animo = 8;
  c.recursos_atuais = { ...c.recursos_atuais, integridade: 4 };
  c.escalpos_instalados = ["escalpos_ouvidos_de_cacador", "escalpos_bracos_gorila", "escalpos_olhos_de_cacador", "escalpos_neuroprocessador"].map((contentId, i) => ({ id: `preview-${i}`, contentId, instaladoEm: "2026-10-12T12:00:00Z" }));
  return c;
};

/** Prévia isolada: usa o painel real, catálogo local e alterações apenas em memória. */
export function PreviewEscalpos() {
  const [character, setCharacter] = useState(semente);
  const [somenteLeitura, setSomenteLeitura] = useState(false);
  const [falha, setFalha] = useState(false);
  const [janela, setJanela] = useState(false);
  const painel = <EscalposPanel api={{ character, derivados: computeDerivedStats(character.atributos, null, 0, { integridade_max: { ref: "atributo", id: "animo" } }), catalogo: falha ? new Map() : mercado, glossario: [{ tipo: "acao", slug: "resistir", nome: "Resistir", descricao: "Prévia de dica de regra: consulte a regra de Resistir na mesa." }], somenteLeitura,
    escalpos: { catalogo: falha ? [] : catalogo, erro: falha ? "Prévia de falha" : null, comEfeitoAutomatico: new Set(),
      instalar: contentId => setCharacter(c => installEscalpo(c, { contentId, nowIso: new Date().toISOString() })),
      remover: id => setCharacter(c => removeInstalledEscalpo(c, id)),
    },
  }} />;
  return <main style={{ minHeight: "100dvh", background: "#030b12", padding: "20px 12px", color: "#b8d8e8", fontFamily: "var(--font-corpo)" }}>
    <div style={{ maxWidth: 860, margin: "0 auto 14px", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
      <span>PRÉVIA · alterações locais</span>
      <button onClick={() => setCharacter(semente())}>Restaurar exemplo</button>
      <button onClick={() => setCharacter(c => ({ ...c, escalpos_instalados: [] }))}>Ficha vazia</button>
      <button onClick={() => setJanela(true)}>Abrir no Console</button>
      <label><input type="checkbox" checked={somenteLeitura} onChange={e => setSomenteLeitura(e.target.checked)} /> Somente leitura</label>
      <label><input type="checkbox" checked={falha} onChange={e => setFalha(e.target.checked)} /> Catálogo indisponível</label>
    </div>
    <div className="rc-cursor-scope" style={{ width: "100%", maxWidth: 860, height: "min(820px, calc(100dvh - 100px))", minHeight: 540, margin: "auto", display: "flex" }}>
      {janela ? <ConsoleWindow aberto onClose={() => setJanela(false)} titulo="Prévia de escalpos" dockContent="Escalpos" larguraMaximaFixa={860} alturaFallbackInicial={820}><div className="rc-foco-content" style={{ height: 760, display: "flex", minHeight: 0 }}>{painel}</div></ConsoleWindow> : painel}
    </div>
  </main>;
}
