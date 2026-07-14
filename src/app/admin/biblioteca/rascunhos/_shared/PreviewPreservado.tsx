import type { DraftEfeitosPreservados } from "../../../../../lib/contentSchema/draftView";
import { getEfeitoTipoDefinition } from "../../../../../lib/contentSchema/effectTypeRegistry";
import { EffectsPanel } from "../../[contentType]/[slug]/EffectsPanel";
import { DiagnosticsPanel } from "../../[contentType]/[slug]/DiagnosticsPanel";
import { MODO_AUTOMACAO_COR, MODO_AUTOMACAO_SIMBOLO } from "../../labels";

/**
 * Preview somente leitura dos efeitos que NÃO entraram no Construtor de
 * Efeitos (Etapa 4) — teste_resistencia, "outro"/bespoke etc. Reusa
 * literalmente `EffectsPanel`/`DiagnosticsPanel` da Etapa 2 (nenhuma
 * duplicação de UI de efeito/diagnóstico).
 */
export function PreviewPreservado({ resultados }: { resultados: DraftEfeitosPreservados[] }) {
  const algumComEfeitos = resultados.some((r) => r.efeitosSomenteLeitura.length > 0);
  if (!algumComEfeitos) {
    return <p style={{ fontSize: 13, color: "#7d7d8a" }}>Nenhum efeito fora do Construtor de Efeitos — tudo que existia foi promovido a editável.</p>;
  }

  return (
    <div>
      {resultados.map((r, i) => {
        if (r.efeitosSomenteLeitura.length === 0) return null;
        const porModo: Record<string, number> = {};
        for (const efeito of r.efeitosSomenteLeitura) {
          const modo = getEfeitoTipoDefinition(efeito.tipo).executor.modo;
          porModo[modo] = (porModo[modo] ?? 0) + 1;
        }
        const titulo = resultados.length > 1 ? `Nível ${r.nivel ?? i + 1} — efeitos ainda não editáveis` : "Efeitos ainda não editáveis (somente leitura)";
        return (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <h4 style={{ fontSize: 13, color: "#a8a8b3", margin: 0 }}>{titulo}</h4>
              <span style={{ fontSize: 12, color: "#7d7d8a" }}>
                {Object.entries(porModo).map(([modo, n]) => (
                  <span key={modo} style={{ marginLeft: 8, color: MODO_AUTOMACAO_COR[modo as keyof typeof MODO_AUTOMACAO_COR] }}>
                    {MODO_AUTOMACAO_SIMBOLO[modo as keyof typeof MODO_AUTOMACAO_SIMBOLO]} {n}
                  </span>
                ))}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "#7d7d8a", marginTop: 0 }}>
              Efeitos compostos, teste/resistência com ramificação e estruturas bespoke ficam fora do Construtor de Efeitos MVP — preservados, somente leitura.
            </p>
            <EffectsPanel efeitos={r.efeitosSomenteLeitura} />
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
