import { Section } from "./Section";
import { buttonStyle } from "./styles";
import type { ConditionResistanceCheck } from "../../../../lib/character";

/**
 * Pendências de teste de resistência de fim de rodada/exposição
 * (checkpoint v0.44) — nunca roladas automaticamente. O jogador/
 * narrador resolve manualmente com os botões "Marcar sucesso"/"Marcar
 * falha"; a consequência (dano, aplicar/remover condição) é decidida
 * pela função pura `resolveConditionResistanceCheck`, não aqui.
 */
const EFFECT_TYPE_ORIGEM: Record<ConditionResistanceCheck["effectType"], string> = {
  teste_fim_de_rodada: "Fim de rodada",
  teste_fim_de_rodada_para_remover_condicao: "Fim de rodada (remover condição)",
  teste_apos_exposicao: "Exposição",
};

function consequenciaFalhaTexto(check: ConditionResistanceCheck): string {
  if (check.effectType === "teste_fim_de_rodada_para_remover_condicao") {
    return `Falha: ${check.targetConditionId ?? "condição"} continua ativa.`;
  }
  const falha = check.onFailure as Record<string, unknown> | undefined;
  if (!falha) return "Falha: sem consequência registrada.";
  if (typeof falha.dano === "string") {
    return `Falha: ${falha.dano} de dano ${typeof falha.tipo_dano === "string" ? falha.tipo_dano : ""}.`;
  }
  if (typeof falha.aplicar_condicao === "string") {
    return `Falha: aplica ${falha.aplicar_condicao}${typeof falha.duracao === "string" ? ` (${falha.duracao})` : ""}.`;
  }
  return "Falha: sem consequência registrada.";
}

export function PendingConditionChecks({
  checks,
  onResolve,
}: {
  checks: ConditionResistanceCheck[];
  onResolve: (checkId: string, outcome: "success" | "failure") => void;
}) {
  const pendentes = checks.filter((c) => c.status === "pending");
  if (pendentes.length === 0) return null;

  return (
    <Section title={`Testes de condição pendentes (${pendentes.length})`}>
      <div data-testid="pending-condition-checks-lista" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pendentes.map((check) => (
          <div
            key={check.id}
            data-testid={`pending-condition-check-${check.id}`}
            style={{
              background: "#1d1e24",
              borderLeft: "3px solid #f5a623",
              borderRadius: 8,
              padding: "10px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 13,
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <strong>{check.conditionName}</strong>
              <span style={{ fontSize: 11, opacity: 0.6 }}>{EFFECT_TYPE_ORIGEM[check.effectType]}</span>
            </div>
            <span>
              Teste: {check.resistance.pericia} CD {check.resistance.cd}
            </span>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{consequenciaFalhaTexto(check)}</span>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                data-testid={`pending-condition-check-sucesso-${check.id}`}
                onClick={() => onResolve(check.id, "success")}
                style={buttonStyle}
              >
                Marcar sucesso
              </button>
              <button
                data-testid={`pending-condition-check-falha-${check.id}`}
                onClick={() => onResolve(check.id, "failure")}
                style={{ ...buttonStyle, opacity: 0.85 }}
              >
                Marcar falha
              </button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
