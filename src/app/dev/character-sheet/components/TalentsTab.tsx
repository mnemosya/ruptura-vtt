import { Section } from "./Section";
import { buttonStyle } from "./styles";
import { describeNonAutomatedTalentEffects, getTalentLevelEffects } from "../../../../lib/character";
import type { AcquiredTalentLevel, TalentContent } from "../../../../lib/character";

/**
 * Aba "Talentos" — checkpoint v0.48 (PRD 12). Catálogo inteiro vem da
 * Biblioteca (`talents` prop, já normalizado por
 * `normalizeTalentContent`) — nunca uma lista manual aqui. Só o padrão
 * "+X em testes específicos" é automatizado (via `ActiveEffect`, ver
 * `deriveActiveEffectsFromTalents`); os demais efeitos de cada nível
 * aparecem como texto para resolução manual, nunca JSON cru.
 */
export function TalentsTab({
  talents,
  catalogError,
  acquired,
  onAcquire,
  onRemove,
}: {
  talents: TalentContent[];
  catalogError: string | null;
  acquired: AcquiredTalentLevel[];
  onAcquire: (talentoId: string, nivelId: string, nivel: number) => void;
  onRemove: (acquiredId: string) => void;
}) {
  const acquiredByLevelId = new Map(acquired.map((a) => [a.nivelId, a]));

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
