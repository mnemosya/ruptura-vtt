"use client";

import type { CamposTalento, CamposTalentoNivel } from "../../../../../lib/contentSchema/draftTypes";
import { inputStyle, labelStyle, sectionStyle } from "./formStyles";
import { RequisitosEditor } from "./RequisitosEditor";

/**
 * Edita a estrutura básica dos 3 níveis de uma árvore de talento, um
 * documento só (nunca vira 3 documentos independentes — ver nota em
 * `draftTypes.ts::CamposTalento`). Ativação/gatilho/usos/cadência/custo
 * de cada nível permanecem somente leitura (seção de efeitos
 * preservados) — não existe campo único e seguro para editá-los ainda
 * (ver `CamposTalentoNivel`).
 */
export function CamposTalentoSection({ campos, onChange }: { campos: CamposTalento; onChange: (novos: Partial<CamposTalento>) => void }) {
  function atualizarNivel(indice: number, novos: Partial<CamposTalentoNivel>) {
    const niveis = [...campos.niveis] as CamposTalento["niveis"];
    niveis[indice] = { ...niveis[indice], ...novos };
    onChange({ niveis });
  }

  return (
    <div>
      {campos.niveis.map((nivel, indice) => (
        <div key={nivel.nivel} style={sectionStyle}>
          <h4 style={{ marginTop: 0, fontSize: 14, color: "#a8a8b3" }}>Nível {nivel.nivel}</h4>
          <label style={{ ...labelStyle, marginBottom: 10 }}>
            Nome do nível
            <input value={nivel.nomeNivel} onChange={(e) => atualizarNivel(indice, { nomeNivel: e.target.value })} style={inputStyle} />
          </label>
          <label style={{ ...labelStyle, marginBottom: 10 }}>
            Descrição curta
            <textarea
              value={nivel.descricaoCurta ?? ""}
              onChange={(e) => atualizarNivel(indice, { descricaoCurta: e.target.value || undefined })}
              rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>
          <label style={{ ...labelStyle, marginBottom: 10 }}>
            Descrição completa
            <textarea
              value={nivel.descricaoLonga ?? ""}
              onChange={(e) => atualizarNivel(indice, { descricaoLonga: e.target.value || undefined })}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>
          <RequisitosEditor requisitos={nivel.requisitos} onChange={(requisitos) => atualizarNivel(indice, { requisitos })} />
        </div>
      ))}
    </div>
  );
}
