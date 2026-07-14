"use client";

import type { CamposMagia } from "../../../../../lib/contentSchema/draftTypes";
import { fieldGridStyle, inputStyle, labelStyle } from "./formStyles";
import { RequisitosEditor } from "./RequisitosEditor";

const VERTENTES = ["cinetica", "cognitiva", "energetica", "material", "sinaptica", "somatica"];
const TIPOS_MAGIA = ["ataque", "controle", "utilitario", "cura", "suporte"];
const RESOLUCOES = ["ataque", "resistencia"];

function numeroOuIndefinido(valor: string): number | undefined {
  if (valor.trim() === "") return undefined;
  const n = Number(valor);
  return Number.isNaN(n) ? undefined : n;
}

export function CamposMagiaSection({ campos, onChange }: { campos: CamposMagia; onChange: (novos: Partial<CamposMagia>) => void }) {
  return (
    <div>
      <div style={fieldGridStyle}>
        <label style={labelStyle}>
          Vertente
          <select value={campos.vertente ?? ""} onChange={(e) => onChange({ vertente: e.target.value || undefined })} style={inputStyle}>
            <option value="">—</option>
            {VERTENTES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Nível
          <input type="number" min={0} value={campos.nivel ?? ""} onChange={(e) => onChange({ nivel: numeroOuIndefinido(e.target.value) })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Tipo da magia
          <select value={campos.tipoMagia ?? ""} onChange={(e) => onChange({ tipoMagia: e.target.value || undefined })} style={inputStyle}>
            <option value="">—</option>
            {TIPOS_MAGIA.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Resolução
          <select value={campos.resolucao ?? ""} onChange={(e) => onChange({ resolucao: e.target.value || undefined })} style={inputStyle}>
            <option value="">—</option>
            {RESOLUCOES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={fieldGridStyle}>
        <label style={labelStyle}>
          Custo de PA
          <input type="number" min={0} value={campos.custoPa ?? ""} onChange={(e) => onChange({ custoPa: numeroOuIndefinido(e.target.value) })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Custo de Mana
          <input type="number" min={0} value={campos.custoMana ?? ""} onChange={(e) => onChange({ custoMana: numeroOuIndefinido(e.target.value) })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Custo de Sobrecarga (quando aplicável)
          <input
            type="number"
            min={0}
            value={campos.custoSobrecarga ?? ""}
            onChange={(e) => onChange({ custoSobrecarga: numeroOuIndefinido(e.target.value) })}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Perícia de teste
          <input value={campos.periciaTeste ?? ""} onChange={(e) => onChange({ periciaTeste: e.target.value || undefined })} style={inputStyle} />
        </label>
      </div>

      <div style={fieldGridStyle}>
        <label style={labelStyle}>
          Alcance (metros)
          <input
            type="number"
            min={0}
            value={campos.alcanceValorM ?? ""}
            onChange={(e) => onChange({ alcanceValorM: numeroOuIndefinido(e.target.value) })}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Tipo de alcance
          <input value={campos.alcanceTipo ?? ""} onChange={(e) => onChange({ alcanceTipo: e.target.value || undefined })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Área (texto)
          <input value={campos.areaTexto ?? ""} onChange={(e) => onChange({ areaTexto: e.target.value || undefined })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Alvo (descritivo — sem representação estrutural no schema legado ainda)
          <input value={campos.alvo ?? ""} onChange={(e) => onChange({ alvo: e.target.value || undefined })} style={inputStyle} />
        </label>
      </div>

      <div style={fieldGridStyle}>
        <label style={labelStyle}>
          Duração (texto)
          <input value={campos.duracaoTexto ?? ""} onChange={(e) => onChange({ duracaoTexto: e.target.value || undefined })} style={inputStyle} />
        </label>
        <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={campos.sustentavel ?? false} onChange={(e) => onChange({ sustentavel: e.target.checked })} />
          Sustentável
        </label>
        <label style={labelStyle}>
          Resistência — perícia
          <input value={campos.resistenciaPericia ?? ""} onChange={(e) => onChange({ resistenciaPericia: e.target.value || undefined })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Resistência — CD (fórmula ou valor, campo básico)
          <input value={campos.resistenciaCdFormula ?? ""} onChange={(e) => onChange({ resistenciaCdFormula: e.target.value || undefined })} style={inputStyle} />
        </label>
      </div>

      <RequisitosEditor requisitos={campos.requisitos} onChange={(requisitos) => onChange({ requisitos })} />
    </div>
  );
}
