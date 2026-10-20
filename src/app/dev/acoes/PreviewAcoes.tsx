"use client";

import { useMemo, useState } from "react";
import { AcoesPanel } from "../../ficha/_console/panels/AcoesPanel";
import { somarPaGastos } from "../../../lib/character/paGastos";
import { createInitialCharacter, computeDerivedStats, normalizeItemContent, type Character, type CharacterRulesPayload } from "../../../lib/character";
import itens from "../../../../content/v12/db_mercado_itens_v1_2.json";
import regrasJson from "../../../../content/db_regras_personagem_normalizado_v1_4.json";

const regras = regrasJson as unknown as CharacterRulesPayload;
const catalogo = new Map(itens.itens.map(normalizeItemContent).map((i) => [i.slug, i]));
const agora = "2026-10-13T12:00:00Z";
const arma = (id: string, itemSlug: string) => ({ id, itemSlug, itemNome: catalogo.get(itemSlug)?.nome ?? itemSlug, categoria: "arma", quantidade: 1, estado: "empunhado" as const, adquiridoEm: agora });

/** Kael: Brutalista C, sem deck, em combate, com Postura ofensiva. */
function kael(): Character {
  const c = createInitialCharacter(regras, "Kael Voss");
  Object.assign(c.pericias, { luta: 3, atletismo: 3, balistica: 1, reflexos: 2, percepcao: 2, vigor: 2 });
  c.estado_jogo = { pa_gastos: 1, reacoes_usadas: 0 };
  c.inventario = [arma("w1", "armas_machado_de_guerra"), arma("w2", "armas_pistola_pesada")];
  c.condicoes_ativas = [{ id: "p1", conditionId: "postura_ofensiva", nome: "Postura ofensiva", aplicadaEm: agora, ativa: true }];
  (c as Character & { progressao: unknown }).progressao = { classe_id: "combatente", subclasse_id: "brutalista", ranking: "C" };
  return c;
}

/** Nyx: Tecelã C, com Deck Sináptico, numa Sessão. */
function nyx(): Character {
  const c = createInitialCharacter(regras, "Nyx Oran");
  Object.assign(c.pericias, { tecnomagia: 3, logica: 1, percepcao: 2, robotica: 1 });
  c.estado_jogo = { pa_gastos: 1, reacoes_usadas: 0 };
  c.escalpos_instalados = [{ id: "e1", contentId: "escalpos_deck_sinaptico_civil", instaladoEm: agora }];
  c.trama_ativa = { id: "t1", nome: "Depósito corporativo", classificacao: "corporativa", limiteDeteccao: 6, niveisRevelados: 1, posicaoAtual: "", bloqueios: [], nos: [], presencasHostis: [], ramAtual: 7, ramMaximo: 12, paGastosNaTrama: 0, deteccaoAtual: 2, detecaoAcionada: false, rastro: 3, protocolosUsados: [], iniciadaEm: agora, ativa: true };
  (c as Character & { progressao: unknown }).progressao = { classe_id: "tecnico", subclasse_id: "tecelao", ranking: "C" };
  return c;
}

/** Prévia isolada da aba Ações: painel real, catálogo local, alterações só em memória. */
export function PreviewAcoes() {
  const [quem, setQuem] = useState<"kael" | "nyx">("kael");
  const [character, setCharacter] = useState<Character>(kael);
  const [leitura, setLeitura] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const derivados = useMemo(() => computeDerivedStats(character.atributos, regras, 0), [character.atributos]);
  const anotar = (t: string) => setLog((l) => [t, ...l].slice(0, 6));
  const trocar = (q: "kael" | "nyx") => { setQuem(q); setCharacter(q === "kael" ? kael() : nyx()); setLog([]); };
  const ajustar = (campo: "pa_gastos" | "reacoes_usadas", delta: number) =>
    setCharacter((c) => ({ ...c, estado_jogo: { ...c.estado_jogo, [campo]: Math.max(0, (c.estado_jogo?.[campo] ?? 0) + delta) } }));

  return (
    <main style={{ minHeight: "100dvh", background: "#030b12", padding: "20px 12px", color: "#b8d8e8", fontFamily: "var(--font-corpo)" }}>
      <div style={{ maxWidth: 860, margin: "0 auto 14px", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
        <span>PRÉVIA · alterações locais</span>
        <button onClick={() => trocar("kael")} aria-pressed={quem === "kael"}>Kael · Brutalista, sem deck</button>
        <button onClick={() => trocar("nyx")} aria-pressed={quem === "nyx"}>Nyx · Tecelã, em Sessão</button>
        <button onClick={() => setCharacter((c) => ({ ...c, estado_jogo: { pa_gastos: 0, reacoes_usadas: 0 } }))}>Nova rodada</button>
        <label><input type="checkbox" checked={leitura} onChange={(e) => setLeitura(e.target.checked)} /> Somente leitura</label>
        <span data-testid="preview-log" style={{ opacity: .7 }}>{log[0] ?? ""}</span>
      </div>
      <div className="rc-cursor-scope" style={{ width: "100%", maxWidth: 860, height: "min(760px, calc(100dvh - 100px))", minHeight: 540, margin: "auto", display: "flex" }}>
        <AcoesPanel
          api={{
            character, derivados, catalogo, glossario: [], regras, somenteLeitura: leitura,
            ajustarPa: (d) => {
              const antes = character.estado_jogo?.pa_gastos ?? 0;
              const depois = somarPaGastos(antes, d, derivados.pa_max);
              setCharacter((c) => ({ ...c, estado_jogo: { ...c.estado_jogo, pa_gastos: depois } }));
              anotar(`PA ${d > 0 ? "−" : "+"}${Math.abs(d)}`);
              return depois - antes;
            },
            ajustarReacoes: (d) => ajustar("reacoes_usadas", d),
            adicionarCondicao: (i) => setCharacter((c) => ({ ...c, condicoes_ativas: [...(c.condicoes_ativas ?? []), { id: `${i.conditionId}-${Date.now()}`, conditionId: i.conditionId, nome: i.nome, aplicadaEm: new Date().toISOString(), ativa: true }] })),
            removerCondicao: (id) => setCharacter((c) => ({ ...c, condicoes_ativas: (c.condicoes_ativas ?? []).map((x) => (x.id === id ? { ...x, ativa: false } : x)) })),
          }}
          onRolar={(p) => anotar(`Rolar ${p.tipo === "acao" || p.tipo === "defesa" ? p.acao : p.tipo} · ${"periciaId" in p ? p.periciaId : ""}`)}
          onAtacar={(id) => anotar(`Atacar com ${id ?? "desarmado"}`)}
        />
      </div>
    </main>
  );
}
