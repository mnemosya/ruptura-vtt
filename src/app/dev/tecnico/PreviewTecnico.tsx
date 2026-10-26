"use client";

import { useState } from "react";
import { TecnicoUnidades } from "../../ficha/_console/panels/classe/TecnicoUnidades";
import { createInitialCharacter, normalizeItemContent } from "../../../lib/character";
import { applyClassCommand, type ClassCommand } from "../../../lib/character/classManagement";
import { normalizeTechnicalContentItem } from "../../../lib/content/technicalLibrary";
import type { Character } from "../../../lib/character/types";
import escalpos from "../../../../content/v12/db_mercado_escalpos_v1_2.json";
import itens from "../../../../content/v12/db_mercado_itens_v1_2.json";

const catalogoEscalpos = escalpos.escalpos.map(normalizeTechnicalContentItem);
const catalogo = new Map(itens.itens.map(normalizeItemContent).map(i => [i.slug, i]));
const RANKS = ["F", "E", "D", "C", "B", "A", "S"];
const SUBS = ["", "artifice", "tecelao", "biomecanico", "roboticista"];
const agora = "2026-10-25T00:00:00.000Z";

const semente = (rank: string, sub: string): Character => {
  const c = createInitialCharacter(null, "Prévia do Técnico");
  const item = (slug: string, estado: "equipado" | "empunhado" | "mochila" = "mochila") => {
    const m = catalogo.get(slug)!;
    return { id: `inv-${slug}`, itemSlug: slug, itemNome: m.nome, categoria: m.categoria, quantidade: 1, estado, adquiridoEm: agora };
  };
  const slugDe = (nome: string) => [...catalogo.values()].find(i => i.nome === nome)?.slug;
  c.inventario = ["Rifle de precisão", "Colete Composto", "Kit de intrusão digital"].map(slugDe).filter((s): s is string => !!s).map(s => item(s, "equipado"));
  c.escalpos_instalados = ["escalpos_ouvidos_de_cacador", "escalpos_armadura_reativa_subdermica_ars", "escalpos_olhos_de_vigilia"].map((contentId, i) => ({ id: `esc-${i}`, contentId, instaladoEm: agora }));
  c.drones = [{ id: "drone-coruja", nome: "Coruja", modelo: "Coruja", modeloSlug: "maquinas_autonomas_coruja", controlador: "", estado: "ativo", acoes: "", ativadoNestaCena: false, gatilho: null, pareamento: null }];
  c.robos = [
    { id: "robo-mula", nome: "Mula", modelo: "Mula", modeloSlug: "maquinas_autonomas_mula", programador: "", estado: "programado", paAtual: 3, paMaximo: 3, acaoAutonoma: "", ordens: "", primeiroTesteBonusDisponivel: false, marchaDuplaAtivaNestaRodada: false, overclockAtiva: false },
    { id: "robo-chacal", nome: "Chacal", modelo: "Chacal", modeloSlug: "maquinas_autonomas_chacal", programador: "", estado: "programado", paAtual: 3, paMaximo: 3, acaoAutonoma: "", ordens: "", primeiroTesteBonusDisponivel: false, marchaDuplaAtivaNestaRodada: false, overclockAtiva: false },
  ];
  return { ...c, progressao: { classe_id: "tecnico", subclasse_id: sub || undefined, ranking: rank }, current_round: 1, current_scene: 1 } as Character;
};

/** Prévia isolada da tela do Técnico: a tela real com ficha e alterações só em memória. */
export function PreviewTecnico() {
  const [rank, setRank] = useState("C");
  const [sub, setSub] = useState("roboticista");
  const [character, setCharacter] = useState(() => semente("C", "roboticista"));
  const [erro, setErro] = useState<string | null>(null);
  const trocar = (r: string, s: string) => { setRank(r); setSub(s); setCharacter(c => ({ ...c, progressao: { classe_id: "tecnico", subclasse_id: s || undefined, ranking: r } }) as Character); };
  return <main style={{ minHeight: "100dvh", background: "#030b12", padding: "20px 12px", color: "#b8d8e8", fontFamily: "var(--font-corpo)" }}>
    <div style={{ maxWidth: 800, margin: "0 auto 14px", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
      <span>PRÉVIA · alterações locais</span>
      <label>Ranking <select value={rank} onChange={e => trocar(e.target.value, sub)}>{RANKS.map(r => <option key={r}>{r}</option>)}</select></label>
      <label>Subclasse <select value={sub} onChange={e => trocar(rank, e.target.value)}>{SUBS.map(s => <option key={s} value={s}>{s || "—"}</option>)}</select></label>
      <button onClick={() => setCharacter(c => ({ ...c, current_round: (c.current_round ?? 1) + 1 }))}>Próxima rodada</button>
      <button onClick={() => setCharacter(c => ({ ...c, current_scene: (c.current_scene ?? 1) + 1, current_round: 1 }))}>Próxima cena</button>
      <button onClick={() => setCharacter(semente(rank, sub))}>Restaurar</button>
      {erro && <span style={{ color: "#e2795f" }}>{erro}</span>}
    </div>
    <div className="rc-cursor-scope" style={{ width: 800, height: 860, margin: "auto", display: "flex" }}>
      <div className="rc-foco-content" style={{ flex: 1, display: "flex", minWidth: 0 }}>
        <TecnicoUnidades key={`${rank}-${sub}`} rank={rank} subclassId={sub || undefined} api={{
          character, catalogo, glossario: [],
          escalpos: { catalogo: catalogoEscalpos, erro: null, comEfeitoAutomatico: new Set(), instalar: () => {}, remover: () => {}, ativarArs: () => {}, desativarArs: () => {} },
          classe: { alvos: [], executar: (cmd: ClassCommand) => { const r = applyClassCommand(character, cmd, 4); setErro(r.error ?? null); if (!r.error) setCharacter(r.character); } },
        } as never} />
      </div>
    </div>
  </main>;
}
