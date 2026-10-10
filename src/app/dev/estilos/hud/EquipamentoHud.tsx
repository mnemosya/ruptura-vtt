"use client";

/**
 * Prévia de `ficha/_console/panels/hud/EquipamentoHud.tsx` com dados de
 * exemplo — o MESMO componente da aba Equipamentos do Console, numa
 * moldura do tamanho do Console (860 × 760). Estado local.
 */

import { useState } from "react";
import { EquipamentoHud as Equipamento, type EncaixeHud, type PecaHud } from "../../../ficha/_console/panels/hud/EquipamentoHud";

const p = (id: string, nome: string, categoria: string, x: Partial<PecaHud> = {}): PecaHud => ({
  id, nome, categoria, categoriaRotulo: { arma: "Arma", armadura: "Armadura", escudo: "Escudo", farmacia: "Farmácia", vertina: "Vertina", explosivo: "Explosivo" }[categoria] ?? categoria,
  vertente: { arma: "cinetica", armadura: "material", escudo: "material", farmacia: "biotica", vertina: "cognitiva", explosivo: "energetica" }[categoria] ?? "nenhuma",
  raridade: "comum", onde: "mochila", espacos: 1, ...x,
});
const PECAS: PecaHud[] = [
  p("colete", "Colete balístico", "armadura", { protecao: "fisica", mit: [3, 4], regioes: ["tronco"], descricao: "Placas cerâmicas em tecido de aramida." }),
  p("dissip", "Traje dissipador", "armadura", { raridade: "incomum", protecao: "energetica", mit: [3, 3], regioes: ["tronco"] }),
  p("capacete", "Capacete tático", "armadura", { protecao: "fisica", mit: [3, 3], regioes: ["cabeca"], onde: "abrigo" }),
  p("cotov", "Cotoveleiras", "armadura", { protecao: "fisica", mit: [1, 1], regioes: ["bracos"] }),
  p("calca", "Calça de kevlar trançado", "armadura", { raridade: "raro", protecao: "hibrida", mit: [2, 2], regioes: ["pernas"] }),
  p("adaga", "Adaga", "arma", { dano: { dado: "1d6", tipo: "cortante ou perfurante" }, linhas: [{ rotulo: "Alcance", valor: "Adjacente" }] }),
  p("pistola", "Pistola 9mm", "arma", { dano: { dado: "1d10", tipo: "perfurante" }, municao: [8, 12] }),
  p("escudo", "Escudo compacto", "escudo", { protecao: "fisica", pd: [1, 2], espacos: 2 }),
  p("antidoto", "Antídoto", "farmacia", { usavel: true }),
  p("azulzinha", "Azulzinha", "vertina", { raridade: "incomum", usavel: true }),
  p("granada", "Granada de fumaça", "explosivo", { usavel: true, onde: "abrigo" }),
];
const CABE: Record<EncaixeHud, (x: PecaHud) => boolean> = {
  cabeca: (x) => !!x.regioes?.includes("cabeca"), tronco: (x) => !!x.regioes?.includes("tronco"),
  membro_superior: (x) => !!x.regioes?.includes("bracos"), membro_inferior: (x) => !!x.regioes?.includes("pernas"),
  arma_primaria: (x) => x.categoria === "arma", arma_secundaria: (x) => x.categoria === "arma" || x.categoria === "escudo",
  acesso_rapido_1: (x) => ["farmacia", "vertina", "explosivo"].includes(x.categoria), acesso_rapido_2: (x) => ["farmacia", "vertina", "explosivo"].includes(x.categoria),
};

export function EquipamentoHud() {
  const [pecas, setPecas] = useState(PECAS);
  const [slots, setSlots] = useState<Record<EncaixeHud, string | null>>({
    cabeca: null, tronco: "colete", membro_superior: "cotov", membro_inferior: null,
    arma_primaria: "adaga", arma_secundaria: "escudo", acesso_rapido_1: "antidoto", acesso_rapido_2: null,
  });
  const peca = (id: string | null) => (id ? pecas.find((x) => x.id === id) ?? null : null);
  const encaixes = Object.fromEntries(Object.entries(slots).map(([e, id]) => [e, peca(id) && { ...peca(id)!, onde: "equipado" as const }])) as Record<EncaixeHud, PecaHud | null>;
  const ocupados = new Set(Object.values(slots).filter(Boolean));
  const mudar = (id: string, f: (x: PecaHud) => PecaHud) => setPecas((xs) => xs.map((x) => (x.id === id ? f(x) : x)));
  return (
    <div className="hx hx-hexgrid" style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
      <div className="hx-console">
        <div className="hx-console-cab"><span className="hx-tag" style={{ color: "#cfeff4", opacity: .5 }}>id://equipamento</span><span className="hx-tag" style={{ color: "rgba(0,212,255,.4)" }}>mod.gear // 06</span></div>
        <div className="hx-console-corpo">
          <Equipamento
            encaixes={encaixes}
            candidatos={(e) => pecas.filter((x) => !ocupados.has(x.id) && CABE[e](x))}
            onEquipar={(id, e) => setSlots((s) => ({ ...s, [e]: id }))}
            onTirar={(id) => setSlots((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v === id ? null : v])) as typeof s)}
            onTrazer={(id) => mudar(id, (x) => ({ ...x, onde: "mochila" }))}
            onDefinirMit={(id, v) => mudar(id, (x) => ({ ...x, mit: x.mit ? [Math.max(0, Math.min(x.mit[1], v)), x.mit[1]] : x.mit }))}
            onDefinirPd={(id, v) => mudar(id, (x) => ({ ...x, pd: x.pd ? [Math.max(0, Math.min(x.pd[1], v)), x.pd[1]] : x.pd }))}
            onAtacar={() => {}}
            onRecarregar={(id) => mudar(id, (x) => ({ ...x, municao: x.municao ? [x.municao[1], x.municao[1]] : x.municao }))}
            onUsar={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
