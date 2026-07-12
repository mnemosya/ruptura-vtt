"use client";

import { useState } from "react";
import { Section } from "./Section";
import { buttonStyle } from "./styles";
import {
  getSpellDamageEffect,
  describeSpellManualEffects,
  isSpellLearned,
  getKnownVertentes,
  getVertenteLevel,
  getVertenteCd,
  resolveSpellResistance,
  checkSpellVertenteLevel,
  getSpellAttackProfile,
  applyRangeAreaMultiplierToText,
  type SpellContent,
  type LearnedSpell,
} from "../../../../lib/character";

const input: React.CSSProperties = { background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "4px 8px", fontSize: 12, width: 60 };

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
  niveisVertente,
  sheetMode,
  onLearn,
  onForget,
  onCast,
  onCastWithFusion,
  onRollDamage,
  onSetVertenteLevel,
  spellRangeAreaMultiplier = 1,
}: {
  spells: SpellContent[];
  catalogError: string | null;
  magiasAprendidas: LearnedSpell[];
  /** Multiplicador de alcance/área de magias de ATAQUE de talento (Domínio Territorial). 1 = nenhum. */
  spellRangeAreaMultiplier?: number;
  /** Nível investido por vertente (checkpoint pós-v0.69) — chave = slug da vertente, ausente = nível desconhecido (nunca 0 implícito). */
  niveisVertente: Record<string, number>;
  sheetMode: "jogo" | "evolucao";
  onLearn: (slug: string) => void;
  onForget: (learnedId: string) => void;
  onCast: (slug: string) => void;
  /** Fusão (checkpoint pós-v0.66) — conjura `slug` fundida com `fusedSlug` (+1 Sobrecarga; ambas aprendidas). */
  onCastWithFusion: (slug: string, fusedSlug: string) => void;
  onRollDamage: (slug: string) => void;
  /** Define o nível investido numa vertente (checkpoint pós-v0.69) — só editável em Modo Evolução. */
  onSetVertenteLevel: (vertente: string, value: number) => void;
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
          const nivelVertente = getVertenteLevel({ niveis_vertente: niveisVertente }, vertente);
          const cdVertente = nivelVertente != null ? getVertenteCd(nivelVertente) : null;
          return (
            <div key={vertente} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <h3 style={{ fontSize: 13, textTransform: "capitalize", opacity: 0.8, margin: 0 }}>{vertente}</h3>
                {sheetMode === "evolucao" ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, opacity: 0.7 }}>
                    Nível:
                    <input
                      data-testid={`vertente-nivel-${vertente}`}
                      type="number"
                      min={0}
                      value={nivelVertente ?? ""}
                      placeholder="—"
                      onChange={(e) => {
                        const raw = e.target.value;
                        onSetVertenteLevel(vertente, raw === "" ? 0 : Math.max(0, Number(raw)));
                      }}
                      style={input}
                    />
                  </span>
                ) : (
                  nivelVertente != null && <span style={{ fontSize: 11, opacity: 0.6 }}>Nível {nivelVertente}</span>
                )}
                <span data-testid={`vertente-cd-${vertente}`} style={{ fontSize: 11, opacity: 0.6 }}>
                  {cdVertente != null ? `CD da vertente: ${cdVertente} (6 + ${nivelVertente})` : "CD da vertente: nível não definido"}
                </span>
              </div>
              <div data-testid={`vertente-magias-${vertente}`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {magiasDaVertente.map((spell) => {
                  const dano = getSpellDamageEffect(spell);
                  const resistencia = resolveSpellResistance(spell, nivelVertente);
                  const efeitosManuais = describeSpellManualEffects(spell);
                  const aberto = expandido[spell.slug] ?? false;
                  const aprendida = magiasAprendidas.find((m) => m.spellSlug === spell.slug);
                  const nivelCheck = checkSpellVertenteLevel(spell, { niveis_vertente: niveisVertente });
                  const attackProfile = getSpellAttackProfile(spell);
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
                        {attackProfile.isAttack && (
                          <span
                            data-testid={`magia-ataque-magico-${spell.slug}`}
                            style={{ color: "#ff8a5c", fontSize: 11, fontWeight: 700, border: "1px solid #ff8a5c", borderRadius: 4, padding: "1px 6px" }}
                          >
                            ⚔ Ataque mágico
                          </span>
                        )}
                        {nivelCheck.aboveLevel && (
                          <span data-testid={`magia-nivel-aviso-${spell.slug}`} style={{ color: "#ff6b6b", fontSize: 11, fontWeight: 700 }}>
                            Nível de vertente insuficiente ({spell.estatisticas.nivel} &gt; {nivelCheck.vertenteLevel}) — não pode ser conjurada
                          </span>
                        )}
                      </div>
                      {(spell.estatisticas.alcanceTexto || spell.estatisticas.areaTexto) && (() => {
                        const mult = attackProfile.isAttack ? spellRangeAreaMultiplier : 1;
                        const alcance = spell.estatisticas.alcanceTexto
                          ? applyRangeAreaMultiplierToText(spell.estatisticas.alcanceTexto, mult)
                          : null;
                        const area = spell.estatisticas.areaTexto
                          ? applyRangeAreaMultiplierToText(spell.estatisticas.areaTexto, mult)
                          : null;
                        const dominioAtivo = mult !== 1;
                        const naoEscalado = dominioAtivo && ((alcance && !alcance.changed) || (area && !area.changed));
                        return (
                          <p data-testid={`magia-alcance-area-${spell.slug}`} style={{ fontSize: 11, opacity: 0.75, margin: "2px 0" }}>
                            {alcance && <span>Alcance: {alcance.text}</span>}
                            {alcance && area && " · "}
                            {area && <span>Área: {area.text}</span>}
                            {dominioAtivo && (alcance?.changed || area?.changed) && (
                              <span style={{ color: "#5ec8ff" }}> · Domínio Territorial (+50% em ataque)</span>
                            )}
                            {naoEscalado && (
                              <span style={{ color: "#e0a03c" }}> · Domínio Territorial: +50% não aplicado ao texto — confirme a distância manualmente</span>
                            )}
                          </p>
                        );
                      })()}
                      {spell.descricao_curta && <p style={{ opacity: 0.7, margin: "4px 0" }}>{spell.descricao_curta}</p>}
                      {aberto && spell.descricao_longa && (
                        <p data-testid={`magia-descricao-longa-${spell.slug}`} style={{ opacity: 0.85, margin: "4px 0", whiteSpace: "pre-wrap" }}>
                          {spell.descricao_longa}
                        </p>
                      )}
                      {resistencia && (
                        <p data-testid={`magia-resistencia-${spell.slug}`} style={{ color: "#f5a623", margin: "4px 0" }}>
                          Resistência do alvo: {resistencia.acoes.join("/")}{" "}
                          {resistencia.cd != null
                            ? `CD ${resistencia.cd} (6 + nível ${nivelVertente})`
                            : resistencia.usesVertenteLevel
                              ? "CD depende do nível da vertente (6 + nível) — defina o nível acima"
                              : "CD não estruturada"}
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
                            <button
                              data-testid={`magia-conjurar-${spell.slug}`}
                              onClick={() => onCast(spell.slug)}
                              disabled={nivelCheck.aboveLevel}
                              title={
                                nivelCheck.aboveLevel
                                  ? "Nível de vertente insuficiente"
                                  : attackProfile.isAttack
                                    ? attackProfile.rollable
                                      ? "Conjurar gera ataque mágico — o teste de acerto é rolado automaticamente; dano/MIT/região são resolvidos pelo narrador em /dev/table."
                                      : "Conjurar gera ataque mágico, mas o payload não estrutura perícia/atributo de acerto — o teste precisa ser rolado manualmente."
                                    : undefined
                              }
                              style={{ ...buttonStyle, fontSize: 11, padding: "3px 10px", opacity: nivelCheck.aboveLevel ? 0.5 : 1, cursor: nivelCheck.aboveLevel ? "not-allowed" : "pointer" }}
                            >
                              {attackProfile.isAttack ? "Conjurar (ataque mágico)" : "Conjurar"}
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
                              const fusedSpell = escolhida ? outrasAprendidas.find((m) => m.slug === escolhida) : undefined;
                              const fusedNivelCheck = fusedSpell ? checkSpellVertenteLevel(fusedSpell, { niveis_vertente: niveisVertente }) : null;
                              // Fusão bloqueada se a PRINCIPAL ou a FUNDIDA estiver acima do nível da vertente (checkpoint pós-v0.70).
                              const fusaoBloqueada = nivelCheck.aboveLevel || fusedNivelCheck?.aboveLevel === true;
                              const fusaoDesabilitada = !escolhida || fusaoBloqueada;
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
                                    disabled={fusaoDesabilitada}
                                    onClick={() => {
                                      if (fusaoDesabilitada) return;
                                      onCastWithFusion(spell.slug, escolhida);
                                      setFusaoSelecionada((prev) => ({ ...prev, [spell.slug]: "" }));
                                    }}
                                    style={{ ...buttonStyle, fontSize: 11, padding: "3px 10px", opacity: fusaoDesabilitada ? 0.5 : 1, cursor: fusaoDesabilitada ? "not-allowed" : "pointer" }}
                                    title={fusaoBloqueada ? "Nível de vertente insuficiente" : "Fusão custa sempre 1 Sobrecarga; efeitos combinados são resolvidos manualmente."}
                                  >
                                    Conjurar com Fusão (+1 Sobrecarga)
                                  </button>
                                  {fusedNivelCheck?.aboveLevel && (
                                    <span data-testid={`magia-fusao-nivel-aviso-${spell.slug}`} style={{ color: "#ff6b6b", fontSize: 11 }}>
                                      Nível de vertente insuficiente para {fusedSpell!.nome}
                                    </span>
                                  )}
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
