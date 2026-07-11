import { useMemo, useState } from "react";
import { Section } from "./Section";
import { buttonStyle } from "./styles";
import {
  describeNonAutomatedTalentEffects,
  describeTalentTemporaryEffectPreview,
  getTalentLevelEffects,
  classifyTalentEffect,
  describeCadence,
  cadenceResetsAutomatically,
  TALENT_CADENCE_AUTO_RESET,
  type TalentOperationPattern,
} from "../../../../lib/character";
import type {
  AcquiredTalentLevel,
  TalentContent,
  TalentLevelContent,
  UsableTalentEffect,
  TalentContextualOpportunity,
} from "../../../../lib/character";

/**
 * Aba "Talentos" — checkpoint CP14 (engine de operação canônica). Todo
 * nível adquirido termina classificado em um dos 4 padrões operacionais
 * (Automático / Contextual / Atividade própria / Narrativo rastreado),
 * calculado pela engine (`classifyTalentEffect`) a partir do payload
 * canônico — nunca de lista manual. Passivos não têm botão, mas aparecem
 * marcados como operacionais (efeito no fluxo). Filtros: Todos / Passivos
 * / Atividades / Contextuais / Ativos / Indisponíveis.
 */

const PATTERN_LABEL: Record<TalentOperationPattern, string> = {
  automatico: "Automático",
  contextual: "Contextual",
  atividade: "Atividade própria",
  narrativo: "Narrativo rastreado",
};

const PATTERN_COLOR: Record<TalentOperationPattern, string> = {
  automatico: "#4caf50",
  contextual: "#5ec8ff",
  atividade: "#e0a03c",
  narrativo: "#c78bff",
};

type FilterKey = "todos" | "passivos" | "atividades" | "contextuais" | "ativos" | "indisponiveis";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "passivos", label: "Passivos" },
  { key: "atividades", label: "Atividades" },
  { key: "contextuais", label: "Contextuais" },
  { key: "ativos", label: "Ativos" },
  { key: "indisponiveis", label: "Indisponíveis" },
];

/** Conjunto de padrões operacionais de um nível (agregado dos seus efeitos). */
function levelPatterns(nivel: TalentLevelContent): Set<TalentOperationPattern> {
  const set = new Set<TalentOperationPattern>();
  for (const efeito of getTalentLevelEffects(nivel)) set.add(classifyTalentEffect(efeito));
  if (set.size === 0) set.add("automatico");
  return set;
}

export function TalentsTab({
  talents,
  catalogError,
  acquired,
  usableEffects,
  contextualOpportunities,
  onAcquire,
  onRemove,
  onUseEffect,
  onToggleEffect,
  onResetEffect,
}: {
  talents: TalentContent[];
  catalogError: string | null;
  acquired: AcquiredTalentLevel[];
  usableEffects: UsableTalentEffect[];
  contextualOpportunities: TalentContextualOpportunity[];
  onAcquire: (talentoId: string, nivelId: string, nivel: number) => void;
  onRemove: (acquiredId: string) => void;
  onUseEffect: (key: string) => void;
  onToggleEffect: (key: string) => void;
  onResetEffect: (key: string) => void;
}) {
  const [filter, setFilter] = useState<FilterKey>("todos");

  const acquiredByLevelId = useMemo(() => new Map(acquired.map((a) => [a.nivelId, a])), [acquired]);
  const usableByLevelId = useMemo(() => {
    const m = new Map<string, UsableTalentEffect[]>();
    for (const u of usableEffects) {
      const list = m.get(u.nivelId) ?? [];
      list.push(u);
      m.set(u.nivelId, list);
    }
    return m;
  }, [usableEffects]);
  const persistedOppsByLevelId = useMemo(() => {
    const m = new Map<string, TalentContextualOpportunity[]>();
    for (const o of contextualOpportunities.filter((x) => x.persistida)) {
      const list = m.get(o.nivelId) ?? [];
      list.push(o);
      m.set(o.nivelId, list);
    }
    return m;
  }, [contextualOpportunities]);

  /** Um nível passa no filtro atual? "todos" sempre passa (mostra catálogo p/ adquirir). */
  function levelMatchesFilter(nivel: TalentLevelContent): boolean {
    if (filter === "todos") return true;
    const acquiredEntry = acquiredByLevelId.get(nivel.id);
    if (!acquiredEntry) return false; // filtros específicos só sobre adquiridos
    const patterns = levelPatterns(nivel);
    const usables = usableByLevelId.get(nivel.id) ?? [];
    const hasActivity = usables.some((u) => u.kind === "limited_use");
    const anyActive = usables.some((u) => u.kind === "toggle" && u.toggledOn);
    const anyPending = (persistedOppsByLevelId.get(nivel.id) ?? []).length > 0;
    const anyEsgotado = usables.some((u) => u.kind === "limited_use" && u.usosMax != null && u.usosGastos >= u.usosMax);
    switch (filter) {
      case "passivos":
        return patterns.has("automatico") && !hasActivity && !patterns.has("contextual");
      case "atividades":
        return hasActivity;
      case "contextuais":
        return patterns.has("contextual");
      case "ativos":
        return anyActive || anyPending;
      case "indisponiveis":
        return anyEsgotado;
      default:
        return true;
    }
  }

  const published = talents.filter((t) => t.status === "published");

  return (
    <Section title={`Talentos (${acquired.length} nível(is) adquirido(s))`}>
      <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 10 }}>
        Catálogo inteiro vem da Biblioteca do Sistema (22 árvores, 66 níveis). Cada nível adquirido
        termina em um dos 4 padrões operacionais — <strong>Automático</strong> (soma no fluxo),{" "}
        <strong>Contextual</strong> (dispara em gatilho), <strong>Atividade própria</strong> (botão
        com usos/cadência) ou <strong>Narrativo rastreado</strong> (resolvido com o narrador). Nenhum
        talento fica só como descrição.
      </p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            data-testid={`talento-filtro-${f.key}`}
            onClick={() => setFilter(f.key)}
            style={{
              ...buttonStyle,
              fontSize: 11,
              padding: "3px 10px",
              background: filter === f.key ? "#2e4b2e" : undefined,
              fontWeight: filter === f.key ? 700 : 400,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {catalogError && (
        <p style={{ fontSize: 13, color: "#ff6b6b", background: "#2a1717", borderRadius: 8, padding: "10px 12px" }}>
          Catálogo de talentos indisponível. Nenhuma lista local foi usada.
        </p>
      )}

      {!catalogError && (
        <div data-testid="talentos-lista" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {published.map((talent) => {
            const visibleLevels = talent.niveis.filter(levelMatchesFilter);
            if (visibleLevels.length === 0) return null;
            return (
              <div key={talent.id} data-testid={`talento-${talent.slug}`} style={{ background: "#1d1e24", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{talent.nome}</div>
                {talent.descricao_curta && <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 8px" }}>{talent.descricao_curta}</p>}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {visibleLevels.map((nivel) => {
                    const acquiredEntry = acquiredByLevelId.get(nivel.id);
                    const nonAutomated = describeNonAutomatedTalentEffects(nivel);
                    const patterns = Array.from(levelPatterns(nivel));
                    const pendingOpps = persistedOppsByLevelId.get(nivel.id) ?? [];
                    return (
                      <div
                        key={nivel.id}
                        data-testid={`talento-nivel-${nivel.id}`}
                        style={{ borderLeft: acquiredEntry ? "3px solid #4caf50" : "3px solid #555", paddingLeft: 10, fontSize: 12 }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <strong>Nível {nivel.nivel} — {nivel.nome}</strong>
                          {acquiredEntry &&
                            patterns.map((p) => (
                              <span
                                key={p}
                                data-testid={`talento-padrao-${nivel.id}-${p}`}
                                style={{ color: PATTERN_COLOR[p], fontSize: 10, border: `1px solid ${PATTERN_COLOR[p]}`, borderRadius: 4, padding: "0 5px" }}
                              >
                                {PATTERN_LABEL[p]}
                              </span>
                            ))}
                        </div>
                        {nivel.descricao_curta && <p style={{ opacity: 0.7, margin: "2px 0" }}>{nivel.descricao_curta}</p>}
                        {nonAutomated.length > 0 && (
                          <p style={{ color: "#8892a0", margin: "2px 0" }}>Parte manual: {nonAutomated.join(" · ")}</p>
                        )}

                        {acquiredEntry && pendingOpps.length > 0 && (
                          <p data-testid={`talento-oportunidade-${nivel.id}`} style={{ color: "#5ec8ff", margin: "2px 0" }}>
                            Oportunidade pendente: {pendingOpps.map((o) => o.rotulo).join(" · ")}
                          </p>
                        )}

                        {acquiredEntry &&
                          (usableByLevelId.get(nivel.id) ?? []).map((usable) => {
                            const esgotado = usable.kind === "limited_use" && usable.usosMax != null && usable.usosGastos >= usable.usosMax;
                            const tempPreview = describeTalentTemporaryEffectPreview(usable);
                            return (
                              <div
                                key={usable.key}
                                data-testid={`talento-usavel-${usable.key}`}
                                style={{ background: "#15161b", borderRadius: 6, padding: "6px 8px", margin: "6px 0", display: "flex", flexDirection: "column", gap: 4 }}
                              >
                                <span style={{ fontSize: 11, opacity: 0.8 }}>{usable.description}</span>
                                {tempPreview && (
                                  <span data-testid={`talento-efeito-temp-preview-${usable.key}`} style={{ fontSize: 11, color: "#4caf50" }}>
                                    Efeito temporário {usable.kind === "toggle" ? "ao ativar" : "ao usar"}: {tempPreview}
                                  </span>
                                )}
                                {usable.kind === "limited_use" ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span data-testid={`talento-usos-${usable.key}`} style={{ fontSize: 11, opacity: 0.6 }}>
                                      Usos restantes: {usable.usosMax != null ? Math.max(0, usable.usosMax - usable.usosGastos) : "—"}/{usable.usosMax ?? "—"}
                                      {usable.cadencia ? ` · ${describeCadence(usable.cadencia)}` : ""}
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
                                          cadenceResetsAutomatically(usable.cadencia)
                                            ? "Também reseta automaticamente na cadência"
                                            : "Cadência sem gatilho automático — reset manual (logado)"
                                        }
                                      >
                                        Resetar usos
                                      </button>
                                    )}
                                    {esgotado && <span style={{ fontSize: 10, color: "#ff6b6b" }}>Indisponível — sem usos nesta cadência.</span>}
                                  </div>
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 11, opacity: 0.6 }}>
                                      {usable.toggledOn ? "Ativo — efeito temporário na aba Condições; modificadores valem nas rolagens." : "Inativo."}
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
            );
          })}
        </div>
      )}
    </Section>
  );
}
