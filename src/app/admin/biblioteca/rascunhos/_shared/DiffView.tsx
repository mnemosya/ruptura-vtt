/**
 * Comparação estruturada e legível (Etapa 5) — nunca só um diff textual
 * de JSON. Usada na tela de revisão antes de publicar e na comparação de
 * versões do histórico. Componente puro (sem estado/`use client`).
 */

import type { MudancaCampo, ResultadoDiff } from "../../../../../lib/contentSchema/publishDiff";

function valorCurto(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "string") return v.length > 80 ? `${v.slice(0, 80)}…` : v;
  if (typeof v === "object") {
    const s = JSON.stringify(v);
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  }
  return String(v);
}

const COR_TIPO: Record<MudancaCampo["tipo"], string> = {
  adicionado: "#8fd6a0",
  removido: "#e08a8a",
  alterado: "#e0c56b",
};

const SIMBOLO_TIPO: Record<MudancaCampo["tipo"], string> = {
  adicionado: "+",
  removido: "−",
  alterado: "~",
};

export function DiffView({ diff }: { diff: ResultadoDiff }) {
  const { campos, efeitos } = diff;
  const semMudancaCampos = campos.length === 0;
  const efeitosMudaram = efeitos.adicionados > 0 || efeitos.removidos > 0 || efeitos.alterados > 0 || efeitos.ordemMudou;

  if (semMudancaCampos && !efeitosMudaram) {
    return <p style={{ fontSize: 13, color: "#7d7d8a" }}>Nenhuma diferença estrutural em relação à versão publicada.</p>;
  }

  return (
    <div style={{ fontSize: 13 }}>
      {!semMudancaCampos && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: efeitosMudaram ? 14 : 0 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#7d7d8a", fontSize: 11 }}>
              <th style={{ padding: "4px 8px" }}>Campo</th>
              <th style={{ padding: "4px 8px" }}>Antes</th>
              <th style={{ padding: "4px 8px" }}>Depois</th>
            </tr>
          </thead>
          <tbody>
            {campos.map((m) => (
              <tr key={m.caminho} style={{ borderTop: "1px solid #22232b" }}>
                <td style={{ padding: "4px 8px", color: COR_TIPO[m.tipo], fontFamily: "monospace" }}>
                  {SIMBOLO_TIPO[m.tipo]} {m.caminho}
                </td>
                <td style={{ padding: "4px 8px", color: "#a8a8b3" }}>{valorCurto(m.antes)}</td>
                <td style={{ padding: "4px 8px", color: "#c9c9d1" }}>{valorCurto(m.depois)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {efeitosMudaram && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", color: "#a8a8b3" }}>
          <span>Efeitos:</span>
          {efeitos.adicionados > 0 && <span style={{ color: COR_TIPO.adicionado }}>+{efeitos.adicionados} adicionado(s)</span>}
          {efeitos.removidos > 0 && <span style={{ color: COR_TIPO.removido }}>−{efeitos.removidos} removido(s)</span>}
          {efeitos.alterados > 0 && <span style={{ color: COR_TIPO.alterado }}>~{efeitos.alterados} alterado(s)</span>}
          {efeitos.ordemMudou && <span style={{ color: COR_TIPO.alterado }}>ordem alterada</span>}
        </div>
      )}
    </div>
  );
}
