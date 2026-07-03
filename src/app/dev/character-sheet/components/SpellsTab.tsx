"use client";

import { useState } from "react";
import { Section } from "./Section";
import { buttonStyle } from "./styles";
import { getSpellDamageEffect, getSpellResistanceEffect, type SpellContent } from "../../../../lib/character";

const input: React.CSSProperties = { background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "6px 8px", fontSize: 13 };

const VERTENTES_CONHECIDAS = ["cinetica", "cognitiva", "energetica", "material", "sinaptica", "somatica"] as const;

/**
 * Aba "Magias" — checkpoint v0.50 (PRD 11.4). Catálogo inteiro vem da
 * Biblioteca (`spells` prop) — só as vertentes CONHECIDAS aparecem em
 * Modo Jogo (`sheetMode==="jogo"`); em Modo Evolução, o jogador também
 * pode adicionar/remover vertentes conhecidas. "Conjurar" desconta PA/
 * Mana; magias com dano ganham atalho de rolagem; magias com
 * resistência mostram a CD como texto (sem resolver o alvo — sem alvo
 * estruturado, mesmo critério do ataque contestado, v0.47).
 */
export function SpellsTab({
  spells,
  catalogError,
  vertentesConhecidas,
  sheetMode,
  onAddVertente,
  onRemoveVertente,
  onCast,
  onRollDamage,
}: {
  spells: SpellContent[];
  catalogError: string | null;
  vertentesConhecidas: string[];
  sheetMode: "jogo" | "evolucao";
  onAddVertente: (vertente: string) => void;
  onRemoveVertente: (vertente: string) => void;
  onCast: (slug: string) => void;
  onRollDamage: (slug: string) => void;
}) {
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

  const publicadas = spells.filter((s) => s.status === "published");
  const vertentesVisiveis =
    sheetMode === "jogo"
      ? vertentesConhecidas
      : [...new Set([...vertentesConhecidas, ...VERTENTES_CONHECIDAS])];

  return (
    <>
      {sheetMode === "evolucao" && (
        <Section title="Vertentes conhecidas (Modo Evolução)">
          <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 10 }}>
            Adicionar/remover vertente aqui — em Modo Jogo, a aba mostra só as magias das vertentes
            já conhecidas.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {VERTENTES_CONHECIDAS.map((v) => {
              const conhecida = vertentesConhecidas.includes(v);
              return (
                <button
                  key={v}
                  data-testid={`vertente-toggle-${v}`}
                  onClick={() => (conhecida ? onRemoveVertente(v) : onAddVertente(v))}
                  style={{
                    ...buttonStyle,
                    background: conhecida ? "#2a3f2a" : buttonStyle.background,
                    borderColor: conhecida ? "#4caf50" : "#333",
                  }}
                >
                  {v} {conhecida ? "✓" : ""}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      <Section title={`Magias (${vertentesConhecidas.length} vertente(s) conhecida(s))`}>
        <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 10 }}>
          Catálogo inteiro vem da Biblioteca do Sistema (132 magias, 6 vertentes). Custo de Mana
          pode ser placeholder (PRD 11.4) — quando ausente, "Conjurar" só desconta PA e avisa.
        </p>
        {catalogError && (
          <p style={{ fontSize: 13, color: "#ff6b6b", background: "#2a1717", borderRadius: 8, padding: "10px 12px" }}>
            Catálogo de magias indisponível. Nenhuma lista local foi usada.
          </p>
        )}
        {!catalogError && vertentesVisiveis.length === 0 && (
          <p style={{ fontSize: 12, opacity: 0.6 }}>Nenhuma vertente conhecida ainda (adicione em Modo Evolução).</p>
        )}
        {!catalogError &&
          vertentesVisiveis.map((vertente) => {
            const magiasDaVertente = publicadas
              .filter((m) => m.vertente === vertente)
              .sort((a, b) => a.estatisticas.nivel - b.estatisticas.nivel);
            if (magiasDaVertente.length === 0) return null;
            return (
              <div key={vertente} style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 13, textTransform: "capitalize", opacity: 0.8, marginBottom: 8 }}>{vertente}</h3>
                <div data-testid={`vertente-magias-${vertente}`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {magiasDaVertente.map((spell) => {
                    const dano = getSpellDamageEffect(spell);
                    const resistencia = getSpellResistanceEffect(spell);
                    const aberto = expandido[spell.slug] ?? false;
                    return (
                      <div key={spell.id} data-testid={`magia-${spell.slug}`} style={{ background: "#1d1e24", borderRadius: 8, padding: "10px 12px", fontSize: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <button
                            data-testid={`magia-expandir-${spell.slug}`}
                            onClick={() => setExpandido((prev) => ({ ...prev, [spell.slug]: !aberto }))}
                            style={{ background: "none", border: "none", color: "inherit", fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 13 }}
                          >
                            {spell.nome} (nível {spell.estatisticas.nivel})
                          </button>
                          <span style={{ opacity: 0.6 }}>
                            {spell.estatisticas.custo_pa} PA · Mana{" "}
                            {spell.estatisticas.custo_mana != null ? spell.estatisticas.custo_mana : "(placeholder)"}
                          </span>
                        </div>
                        {spell.descricao_curta && <p style={{ opacity: 0.7, margin: "4px 0" }}>{spell.descricao_curta}</p>}
                        {aberto && spell.descricao_longa && (
                          <p data-testid={`magia-descricao-longa-${spell.slug}`} style={{ opacity: 0.85, margin: "4px 0", whiteSpace: "pre-wrap" }}>
                            {spell.descricao_longa}
                          </p>
                        )}
                        {resistencia && (
                          <p style={{ color: "#f5a623", margin: "4px 0" }}>
                            Resistência do alvo: {resistencia.acoes.join("/")} CD {resistencia.cdFormula} (resolução manual).
                          </p>
                        )}
                        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                          <button data-testid={`magia-conjurar-${spell.slug}`} onClick={() => onCast(spell.slug)} style={{ ...buttonStyle, fontSize: 11, padding: "3px 10px" }}>
                            Conjurar
                          </button>
                          {dano && (
                            <button data-testid={`magia-rolar-dano-${spell.slug}`} onClick={() => onRollDamage(spell.slug)} style={{ ...buttonStyle, fontSize: 11, padding: "3px 10px" }}>
                              Rolar dano ({dano.dado})
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </Section>
    </>
  );
}
