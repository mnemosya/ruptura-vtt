import { diagnosticarDocumento } from "../../../../../lib/contentSchema/diagnostics";
import type { DraftEfeitosPreservados } from "../../../../../lib/contentSchema/draftView";
import { EffectsPanel } from "../../[contentType]/[slug]/EffectsPanel";
import { DiagnosticsPanel } from "../../[contentType]/[slug]/DiagnosticsPanel";
import { MODO_AUTOMACAO_COR, MODO_AUTOMACAO_SIMBOLO } from "../../labels";

/**
 * Preview somente leitura dos efeitos/diagnóstico preservados — reusa
 * literalmente os componentes da Etapa 2 (nenhuma duplicação de UI de
 * efeito/diagnóstico entre lista/detalhe e editor de rascunho).
 */
export function PreviewPreservado({ resultados }: { resultados: DraftEfeitosPreservados[] }) {
  return (
    <div>
      {resultados.map((r, i) => {
        const diagnostico = diagnosticarDocumento(r.canonico);
        const titulo = resultados.length > 1 ? `Nível ${r.nivel ?? i + 1} — efeitos preservados` : "Efeitos preservados (somente leitura)";
        return (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <h4 style={{ fontSize: 13, color: "#a8a8b3", margin: 0 }}>{titulo}</h4>
              <span style={{ fontSize: 12, color: "#7d7d8a" }}>
                {Object.entries(diagnostico.porModo)
                  .filter(([, n]) => n > 0)
                  .map(([modo, n]) => (
                    <span key={modo} style={{ marginLeft: 8, color: MODO_AUTOMACAO_COR[modo as keyof typeof MODO_AUTOMACAO_COR] }}>
                      {MODO_AUTOMACAO_SIMBOLO[modo as keyof typeof MODO_AUTOMACAO_SIMBOLO]} {n}
                    </span>
                  ))}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "#7d7d8a", marginTop: 0 }}>
              Estes efeitos serão editáveis no Construtor de Automações (Etapa 4) — nesta etapa são somente leitura, preservados do payload original.
            </p>
            <EffectsPanel efeitos={r.canonico.efeitos} />
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", fontSize: 12, color: "#7d7d8a" }}>Diagnóstico técnico</summary>
              <div style={{ marginTop: 8 }}>
                <DiagnosticsPanel validacao={r.validacao} referencias={r.canonico.referencias} camposDesconhecidos={r.camposDesconhecidos} />
              </div>
            </details>
          </div>
        );
      })}
    </div>
  );
}
