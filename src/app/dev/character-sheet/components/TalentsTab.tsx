import { Section } from "./Section";
import { buttonStyle } from "./styles";
import { describeNonAutomatedTalentEffects, getTalentLevelEffects, TALENT_CADENCE_AUTO_RESET } from "../../../../lib/character";
import type { AcquiredTalentLevel, TalentContent, UsableTalentEffect } from "../../../../lib/character";

/**
 * Aba "Talentos" — checkpoint v0.48 (PRD 12), segunda camada no
 * checkpoint pós-v0.63. Catálogo inteiro vem da Biblioteca (`talents`
 * prop, já normalizado por `normalizeTalentContent`) — nunca uma lista
 * manual aqui. Automatizado: "+X em testes específicos" (ActiveEffect),
 * contadores de uso por cadência (`usos`/`cadencia`) e toggles
 * (`toggle_condicional`, modificadores estruturados valem enquanto
 * ativo). O EFEITO dos usos limitados continua manual — o botão "Usar"
 * gasta o uso/PA e loga com lembrete, nunca inventa mecânica.
 */
export function TalentsTab({
  talents,
  catalogError,
  acquired,
  usableEffects,
  onAcquire,
  onRemove,
  onUseEffect,
  onToggleEffect,
  onResetEffect,
}: {
  talents: TalentContent[];
  catalogError: string | null;
  acquired: AcquiredTalentLevel[];
  /** Efeitos usáveis/toggle dos níveis adquiridos (checkpoint pós-v0.63) — ver `getUsableTalentEffects`. */
  usableEffects: UsableTalentEffect[];
  onAcquire: (talentoId: string, nivelId: string, nivel: number) => void;
  onRemove: (acquiredId: string) => void;
  onUseEffect: (key: string) => void;
  onToggleEffect: (key: string) => void;
  onResetEffect: (key: string) => void;
}) {
  const acquiredByLevelId = new Map(acquired.map((a) => [a.nivelId, a]));
  const usableByLevelId = new Map<string, UsableTalentEffect[]>();
  for (const usable of usableEffects) {
    const list = usableByLevelId.get(usable.nivelId) ?? [];
    list.push(usable);
    usableByLevelId.set(usable.nivelId, list);
  }

  return (
    <Section title={`Talentos (${acquired.length} nível(is) adquirido(s))`}>
      <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 12 }}>
        Catálogo inteiro vem da Biblioteca do Sistema (22 talentos, ~60 níveis, PRD 12.2). Só o
        padrão "+X em testes específicos" é automatizado — soma direto no prompt de rolagem (mesmo
        mecanismo de condições/defesa sem Reação). Os demais efeitos de cada nível (promoção de
        margem, reação grátis, contadores por cadência, etc.) aparecem como texto — resolução
        manual, sem automação ainda.
      </p>

      {catalogError && (
        <p style={{ fontSize: 13, color: "#ff6b6b", background: "#2a1717", borderRadius: 8, padding: "10px 12px" }}>
          Catálogo de talentos indisponível. Nenhuma lista local foi usada.
        </p>
      )}

      {!catalogError && (
        <div data-testid="talentos-lista" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {talents
            .filter((t) => t.status === "published")
            .map((talent) => (
              <div key={talent.id} data-testid={`talento-${talent.slug}`} style={{ background: "#1d1e24", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{talent.nome}</div>
                {talent.descricao_curta && <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 8px" }}>{talent.descricao_curta}</p>}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {talent.niveis.map((nivel) => {
                    const acquiredEntry = acquiredByLevelId.get(nivel.id);
                    const nonAutomated = describeNonAutomatedTalentEffects(nivel);
                    const hasModifier = getTalentLevelEffects(nivel).some((e) => e.tipo === "modificador");
                    return (
                      <div
                        key={nivel.id}
                        data-testid={`talento-nivel-${nivel.id}`}
                        style={{
                          borderLeft: acquiredEntry ? "3px solid #4caf50" : "3px solid #555",
                          paddingLeft: 10,
                          fontSize: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <strong>Nível {nivel.nivel} — {nivel.nome}</strong>
                          {hasModifier && <span style={{ color: "#4caf50", fontSize: 11 }}>automatizado</span>}
                        </div>
                        {nivel.descricao_curta && <p style={{ opacity: 0.7, margin: "2px 0" }}>{nivel.descricao_curta}</p>}
                        {nonAutomated.length > 0 && (
                          <p style={{ color: "#5ec8ff", margin: "2px 0" }}>Manual: {nonAutomated.join(" · ")}</p>
                        )}
                        {/* Efeitos usáveis/toggle (checkpoint pós-v0.63) — só em níveis adquiridos. */}
                        {acquiredEntry &&
                          (usableByLevelId.get(nivel.id) ?? []).map((usable) => {
                            const esgotado = usable.kind === "limited_use" && usable.usosMax != null && usable.usosGastos >= usable.usosMax;
                            return (
                              <div
                                key={usable.key}
                                data-testid={`talento-usavel-${usable.key}`}
                                style={{ background: "#15161b", borderRadius: 6, padding: "6px 8px", margin: "6px 0", display: "flex", flexDirection: "column", gap: 4 }}
                              >
                                <span style={{ fontSize: 11, opacity: 0.8 }}>{usable.description}</span>
                                {usable.kind === "limited_use" ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span data-testid={`talento-usos-${usable.key}`} style={{ fontSize: 11, opacity: 0.6 }}>
                                      Usos: {usable.usosGastos}/{usable.usosMax}
                                      {usable.cadencia ? ` por ${usable.cadencia.replace(/_/g, " ")}` : ""}
                                      {usable.custoPa != null ? ` · custo ${usable.custoPa} PA` : " · sem custo de PA estruturado"}
                                    </span>
                                    <button
                                      data-testid={`talento-usar-${usable.key}`}
                                      onClick={() => onUseEffect(usable.key)}
                                      disabled={esgotado}
                                      style={{ ...buttonStyle, fontSize: 11, padding: "2px 8px", opacity: esgotado ? 0.5 : 1 }}
                                    >
                                      Usar talento
                                    </button>
                                    {usable.usosGastos > 0 && (
                                      <button
                                        data-testid={`talento-resetar-${usable.key}`}
                                        onClick={() => onResetEffect(usable.key)}
                                        style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: 0.7 }}
                                        title={
                                          usable.cadencia && TALENT_CADENCE_AUTO_RESET.has(usable.cadencia)
                                            ? "Também reseta automaticamente na cadência"
                                            : "Cadência sem gatilho automático — reset manual"
                                        }
                                      >
                                        Resetar usos
                                      </button>
                                    )}
                                    {esgotado && <span style={{ fontSize: 10, color: "#ff6b6b" }}>Sem usos restantes nesta cadência.</span>}
                                  </div>
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 11, opacity: 0.6 }}>
                                      {usable.toggledOn ? "Ativo — modificadores estruturados aplicados nas rolagens." : "Inativo."}
                                    </span>
                                    <button
                                      data-testid={`talento-toggle-${usable.key}`}
                                      onClick={() => onToggleEffect(usable.key)}
                                      style={{ ...buttonStyle, fontSize: 11, padding: "2px 8px", background: usable.toggledOn ? "#2e4b2e" : undefined }}
                                    >
                                      {usable.toggledOn ? "Desativar" : "Ativar"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        <div style={{ marginTop: 4 }}>
                          {acquiredEntry ? (
                            <button
                              data-testid={`talento-remover-${nivel.id}`}
                              onClick={() => onRemove(acquiredEntry.id)}
                              style={{ ...buttonStyle, fontSize: 11, padding: "2px 8px" }}
                            >
                              Remover
                            </button>
                          ) : (
                            <button
                              data-testid={`talento-adquirir-${nivel.id}`}
                              onClick={() => onAcquire(talent.id, nivel.id, nivel.nivel)}
                              style={{ ...buttonStyle, fontSize: 11, padding: "2px 8px" }}
                            >
                              Adquirir
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </Section>
  );
}
