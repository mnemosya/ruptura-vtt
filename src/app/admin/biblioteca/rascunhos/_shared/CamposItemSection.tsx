"use client";

import type { CamposItem } from "../../../../../lib/contentSchema/draftTypes";
import { fieldGridStyle, inputStyle, labelStyle } from "./formStyles";
import { StringListEditor } from "./StringListEditor";

const RARIDADES = ["comum", "incomum", "raro", "muito_raro", "lendario"];

function numeroOuIndefinido(valor: string): number | undefined {
  if (valor.trim() === "") return undefined;
  const n = Number(valor);
  return Number.isNaN(n) ? undefined : n;
}

export function CamposItemSection({ campos, onChange }: { campos: CamposItem; onChange: (novos: Partial<CamposItem>) => void }) {
  return (
    <div>
      <div style={fieldGridStyle}>
        <label style={labelStyle}>
          Raridade
          <select value={campos.raridade ?? ""} onChange={(e) => onChange({ raridade: e.target.value || undefined })} style={inputStyle}>
            <option value="">—</option>
            {RARIDADES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Preço
          <input type="number" min={0} value={campos.preco ?? ""} onChange={(e) => onChange({ preco: numeroOuIndefinido(e.target.value) })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Moeda (quando houver)
          <input value={campos.moeda ?? ""} onChange={(e) => onChange({ moeda: e.target.value || undefined })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Custo de PA
          <input type="number" min={0} value={campos.custoPa ?? ""} onChange={(e) => onChange({ custoPa: numeroOuIndefinido(e.target.value) })} style={inputStyle} />
        </label>
      </div>

      <div style={fieldGridStyle}>
        <label style={labelStyle}>
          Quantidade padrão
          <input
            type="number"
            min={0}
            value={campos.quantidadePadrao ?? ""}
            onChange={(e) => onChange({ quantidadePadrao: numeroOuIndefinido(e.target.value) })}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Cargas padrão
          <input
            type="number"
            min={0}
            value={campos.cargasPadrao ?? ""}
            onChange={(e) => onChange({ cargasPadrao: numeroOuIndefinido(e.target.value) })}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Disponibilidade
          <input value={campos.disponibilidade ?? ""} onChange={(e) => onChange({ disponibilidade: e.target.value || undefined })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Aquisição
          <input value={campos.aquisicao ?? ""} onChange={(e) => onChange({ aquisicao: e.target.value || undefined })} style={inputStyle} />
        </label>
      </div>

      <StringListEditor
        label="Propriedades referenciadas (slugs da Biblioteca)"
        valores={campos.propriedades}
        onChange={(propriedades) => onChange({ propriedades })}
        placeholder="ex.: arremesso"
      />

      <p style={{ fontSize: 12, color: "#7d7d8a", marginTop: 8 }}>
        O campo legado <code>estatisticas</code> (dano-base, munição, slots de runa etc.) continua somente leitura nesta etapa — ainda não tem
        sub-schema fixo por categoria (ver diagnóstico técnico abaixo). O sub-schema por categoria é tratado em etapa posterior.
      </p>
    </div>
  );
}
