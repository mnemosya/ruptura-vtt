"use client";

import { useState } from "react";
import { Section } from "./Section";
import { buttonStyle } from "./styles";
import { getSpellDamageEffect, getSpellResistanceEffect, describeSpellManualEffects, isSpellLearned, getKnownVertentes, type SpellContent, type LearnedSpell } from "../../../../lib/character";

/**
 * Aba "Magias" — checkpoint v0.50/v0.50.1/v0.50.2 (PRD 11.4). Catálogo
 * inteiro vem da Biblioteca (`spells` prop). Não existe passo separado
 * de "conhecer vertente": a vertente conhecida é DERIVADA de já ter
 * aprendido pelo menos 1 magia dela (`getKnownVertentes`) — aprender a
 * primeira magia de uma vertente já a torna conhecida, sem toggle
 * manual (removido no v0.50.2 a pedido do usuário).
 *
 * Em Modo Evolução: TODO o catálogo aparece agrupado por vertente,
 * com "Aprender"/"Esquecer" por magia. Em Modo Jogo: só vertentes com
 * pelo menos 1 magia aprendida aparecem, mostrando só as magias já
 * aprendidas, com "Conjurar"/"Rolar dano".
 */
export function SpellsTab({
  spells,
  catalogError,
  magiasAprendidas,
  sheetMode,
  onLearn,
  onForget,
  onCast,
  onCastWithFusion,
  onRollDamage,
}: {
  spells: SpellContent[];
  catalogError: string | null;
  magiasAprendidas: LearnedSpell[];
  sheetMode: "jogo" | "evolucao";
  onLearn: (slug: string) => void;
  onForget: (learnedId: string) => void;
  onCast: (slug: string) => void;
  /** Fusão (checkpoint pós-v0.66) — conjura `slug` fundida com `fusedSlug` (+1 Sobrecarga; ambas aprendidas). */
  onCastWithFusion: (slug: string, fusedSlug: string) => void;
  onRollDamage: (slug: string) => void;
}) {
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  // fusaoSelecionada[slug da principal] = slug da segunda magia a fundir
  const [fusaoSelecionada, setFusaoSelecionada] = useState<Record<string, string>>({});

  const publicadas = spells.filter((s) => s.status === "published");
  const vertentesConhecidas = getKnownVertentes({ magias_aprendidas: magiasAprendidas }, publicadas);
  const todasVertentes = [...new Set(publicadas.map((s) => s.vertente))].sort();
  const vertentesVisiveis = sheetMode === "jogo" ? vertentesConhecidas : todasVertentes;

  return (
    <Section title={`Magias (${magiasAprendidas.length} aprendida(s))`}>
      <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 10 }}>
        Catálogo inteiro vem da Biblioteca do Sistema (132 magias, 6 vertentes). Aprender a
        primeira magia de uma vertente já a torna conhecida — sem passo manual separado. Em Modo
        Evolução, o catálogo inteiro aparece para aprender/esquecer; em Modo Jogo, só as magias já
        aprendidas aparecem. Custo de Mana pode ser placeholder (PRD 11.4).
      </p>
      {catalogError && (
        <p style={{ fontSize: 13, color: "#ff6b6b", background: "#2a1717", borderRadius: 8, padding: "10px 12px" }}>
          Catálogo de magias indisponível. Nenhuma lista local foi usada.
        </p>
      )}
      {!catalogError && vertentesVisiveis.length === 0 && (
        <p style={{ fontSize: 12, opacity: 0.6 }}>Nenhuma magia aprendida ainda (aprenda em Modo Evolução).</p>
      )}
      {!catalogError &&
        vertentesVisiveis.map((vertente) => {
          const magiasDaVertente = publicadas
            .filter((m) => m.vertente === vertente)
            .filter((m) => sheetMode === "evolucao" || isSpellLearned({ magias_aprendidas: magiasAprendidas }, m.slug))
            .sort((a, b) => a.estatisticas.nivel - b.estatisticas.nivel);
          if (magiasDaVertente.length === 0) return null;
          return (
            <div key={vertente} style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, textTransform: "capitalize", opacity: 0.8, marginBottom: 8 }}>{vertente}</h3>
              <div data-testid={`vertente-magias-${vertente}`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {magiasDaVertente.map((spell) => {
                  const dano = getSpellDamageEffect(spell);
                  const resistencia = getSpellResistanceEffect(spell);
                  const efeitosManuais = describeSpellManualEffects(spell);
                  const aberto = expandido[spell.slug] ?? false;
                  const aprendida = magiasAprendidas.find((m) => m.spellSlug === spell.slug);
                  return (
                    <div
                      key={spell.id}
                      data-testid={`magia-${spell.slug}`}
                      style={{ background: "#1d1e24", borderRadius: 8, padding: "10px 12px", fontSize: 12, borderLeft: aprendida ? "3px solid #4caf50" : "3px solid #555" }}
                    >
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
                          {spell.estatisticas.custo_mana != null ? spell.estatisticas.custo_mana : "(placeholder)"} ·{" "}
                          resolução {spell.estatisticas.resolucao || "?"}
                        </span>
                        {aprendida && <span style={{ color: "#4caf50", fontSize: 11 }}>aprendida</span>}
                      </div>
                      {spell.descricao_curta && <p style={{ opacity: 0.7, margin: "4px 0" }}>{spell.descricao_curta}</p>}
                      {aberto && spell.descricao_longa && (
                        <p data-testid={`magia-descricao-longa-${spell.slug}`} style={{ opacity: 0.85, margin: "4px 0", whiteSpace: "pre-wrap" }}>
                          {spell.descricao_longa}
                        </p>
                      )}
                      {resistencia && (
                        <p style={{ color: "#f5a623", margin: "4px 0" }}>
                          Resistência do alvo: {resistencia.acoes.join("/")} CD {resistencia.cdFormula}
                          {resistencia.condicional ? " (condicional)" : ""} (resolução manual — conjurar gera o cartão).
                        </p>
                      )}
                      {efeitosManuais.length > 0 && (
                        <div data-testid={`magia-efeitos-manuais-${spell.slug}`} style={{ margin: "4px 0", display: "flex", flexDirection: "column", gap: 2 }}>
                          {efeitosManuais.map((linha, i) => (
                            <span key={i} style={{ fontSize: 11, color: "#f5a623" }}>Manual: {linha}</span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        {sheetMode === "evolucao" ? (
                          aprendida ? (
                            <button data-testid={`magia-esquecer-${spell.slug}`} onClick={() => onForget(aprendida.id)} style={{ ...buttonStyle, fontSize: 11, padding: "3px 10px" }}>
                              Esquecer
                            </button>
                          ) : (
                            <button data-testid={`magia-aprender-${spell.slug}`} onClick={() => onLearn(spell.slug)} style={{ ...buttonStyle, fontSize: 11, padding: "3px 10px" }}>
                              Aprender
                            </button>
                          )
                        ) : (
                          <>
                            <button data-testid={`magia-conjurar-${spell.slug}`} onClick={() => onCast(spell.slug)} style={{ ...buttonStyle, fontSize: 11, padding: "3px 10px" }}>
                              Conjurar
                            </button>
                            {dano && (
                              <button data-testid={`magia-rolar-dano-${spell.slug}`} onClick={() => onRollDamage(spell.slug)} style={{ ...buttonStyle, fontSize: 11, padding: "3px 10px" }}>
                                {dano.dado ? `Rolar dano (${dano.dado})` : `Dano fixo (${dano.valor})`}
                              </button>
                            )}
                            {(() => {
                              // Fusão (checkpoint pós-v0.66) — só entre magias APRENDIDAS; custa sempre 1 Sobrecarga.
                              const outrasAprendidas = publicadas.filter(
                                (m) => m.slug !== spell.slug && magiasAprendidas.some((a) => a.spellSlug === m.slug),
                              );
                              if (outrasAprendidas.length === 0) return null;
                              const escolhida = fusaoSelecionada[spell.slug] ?? "";
                              return (
                                <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                  <select
                                    data-testid={`magia-fusao-select-${spell.slug}`}
                                    value={escolhida}
                                    onChange={(e) => setFusaoSelecionada((prev) => ({ ...prev, [spell.slug]: e.target.value }))}
                                    style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "4px 6px", fontSize: 11 }}
                                  >
                                    <option value="">— fundir com… —</option>
                                    {outrasAprendidas.map((m) => (
                                      <option key={m.slug} value={m.slug}>{m.nome} ({m.vertente})</option>
                                    ))}
                                  </select>
                                  <button
                                    data-testid={`magia-conjurar-fusao-${spell.slug}`}
                                    disabled={!escolhida}
                                    onClick={() => {
                                      if (!escolhida) return;
                                      onCastWithFusion(spell.slug, escolhida);
                                      setFusaoSelecionada((prev) => ({ ...prev, [spell.slug]: "" }));
                                    }}
                                    style={{ ...buttonStyle, fontSize: 11, padding: "3px 10px", opacity: escolhida ? 1 : 0.5 }}
                                    title="Fusão custa sempre 1 Sobrecarga; efeitos combinados são resolvidos manualmente."
                                  >
                                    Conjurar com Fusão (+1 Sobrecarga)
                                  </button>
                                </span>
                              );
                            })()}
                          </>
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
  );
}
