"use client";

import { useState } from "react";
import { VanguardaNucleo } from "../../ficha/_console/panels/classe/VanguardaNucleo";
import { createInitialCharacter, normalizeItemContent } from "../../../lib/character";
import { applyClassCommand, type ClassCommand } from "../../../lib/character/classManagement";
import type { Character } from "../../../lib/character/types";
import itens from "../../../../content/v12/db_mercado_itens_v1_2.json";

const catalogo = new Map(itens.itens.map(normalizeItemContent).map(i => [i.slug, i]));
const RANKS = ["F", "E", "D", "C", "B", "A", "S"];
const SUBS = ["", "berserker", "colosso", "guardiao"];
const agora = "2026-10-26T00:00:00.000Z";

const semente = (rank: string, sub: string): Character => {
  const c = createInitialCharacter(null, "Prévia da Vanguarda");
  const escudo = (slug: string, encaixe: "arma_primaria" | "arma_secundaria", pd: number) => {
    const m = catalogo.get(slug)!;
    return { id: `inv-${slug}`, itemSlug: slug, itemNome: m.nome, categoria: m.categoria, quantidade: 1, estado: "empunhado" as const, encaixeEscolhido: encaixe, equipamentoSlot: "escudo" as const, pdAtual: pd, adquiridoEm: agora };
  };
  c.inventario = [escudo("armaduras_e_escudos_escudo_balistico", "arma_primaria", 12), escudo("armaduras_e_escudos_escudo_tatico_leve", "arma_secundaria", 5)];
  return { ...c, atributos: { ...c.atributos, corpo: 2 }, progressao: { classe_id: "vanguarda", subclasse_id: sub || undefined, ranking: rank }, current_round: 1, current_scene: 1 } as Character;
};

/** Prévia isolada da tela da Vanguarda: a tela real com ficha e alterações só em memória. */
export function PreviewVanguarda() {
  const [rank, setRank] = useState("D");
  const [sub, setSub] = useState("");
  const [character, setCharacter] = useState(() => semente("D", ""));
  const [erro, setErro] = useState<string | null>(null);
  const trocar = (r: string, s: string) => { setRank(r); setSub(s); setCharacter(c => ({ ...c, progressao: { classe_id: "vanguarda", subclasse_id: s || undefined, ranking: r } }) as Character); };
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
        <VanguardaNucleo key={`${rank}-${sub}`} rank={rank} subclassId={sub || undefined} api={{
          character, catalogo, glossario: [],
          classe: { alvos: [], executar: (cmd: ClassCommand) => { const r = applyClassCommand(character, cmd, 4); setErro(r.error ?? null); if (!r.error) setCharacter(r.character); } },
        } as never} />
      </div>
    </div>
  </main>;
}
