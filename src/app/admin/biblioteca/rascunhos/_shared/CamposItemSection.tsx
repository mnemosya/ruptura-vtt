"use client";

import type { CamposItem } from "../../../../../lib/contentSchema/draftTypes";
import { RARIDADE_ITEM_LABELS } from "../../../../../lib/contentSchema/itemLabels";
import { fieldGridStyle, inputStyle, labelStyle } from "./formStyles";
import { StringListEditor } from "./StringListEditor";

// Mesmo enum fechado do schema oficial de equipamentos — nunca uma lista
// própria (ver itemLabels.ts, única fonte de verdade). A lista anterior
// aqui tinha "lendario" (nunca existiu no schema/conteúdo real) e
// nunca tinha "muito_comum" (usado por conteúdo real, incl. legado).
const RARIDADES = Object.keys(RARIDADE_ITEM_LABELS);

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

      <h4 style={{ fontSize: 13, color: "#a8a8b3", margin: "14px 0 6px" }}>Defaults de equipamento (Etapa 9)</h4>
      <div style={fieldGridStyle}>
        <label style={labelStyle}>
          MIT-base (armadura)
          <input data-testid="item-mit-base" type="number" min={0} value={campos.mitBase ?? ""} onChange={(e) => onChange({ mitBase: numeroOuIndefinido(e.target.value) })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          PD-base (escudo)
          <input data-testid="item-pd-base" type="number" min={0} value={campos.pdBase ?? ""} onChange={(e) => onChange({ pdBase: numeroOuIndefinido(e.target.value) })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Tipo de proteção
          <input value={campos.tipoProtecao ?? ""} onChange={(e) => onChange({ tipoProtecao: e.target.value || undefined })} style={inputStyle} placeholder="ex.: fisica" />
        </label>
        <label style={labelStyle}>
          Slots de runa (máx.)
          <input data-testid="item-slots-runa-max" type="number" min={0} value={campos.slotsRunaMax ?? ""} onChange={(e) => onChange({ slotsRunaMax: numeroOuIndefinido(e.target.value) })} style={inputStyle} />
        </label>
      </div>
      <div style={fieldGridStyle}>
        <label style={labelStyle}>
          Cargas máximas
          <input data-testid="item-cargas-max" type="number" min={0} value={campos.cargasMax ?? ""} onChange={(e) => onChange({ cargasMax: numeroOuIndefinido(e.target.value) })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Munição máxima (carregador)
          <input data-testid="item-municao-max" type="number" min={0} value={campos.municaoMax ?? ""} onChange={(e) => onChange({ municaoMax: numeroOuIndefinido(e.target.value) })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Munição compatível (slug)
          <input value={campos.municaoCompativelSlug ?? ""} onChange={(e) => onChange({ municaoCompativelSlug: e.target.value || undefined })} style={inputStyle} placeholder="ex.: flecha_simples" />
        </label>
      </div>
      <StringListEditor
        label="Regiões protegidas (informativo — sem leitor real ainda)"
        valores={campos.regioes ?? []}
        onChange={(regioes) => onChange({ regioes })}
        placeholder="ex.: tronco"
      />
      {campos.municaoCompativelSlug === "flecha_simples" && (
        <p data-testid="item-usa-aljava-info" style={{ fontSize: 12, color: "#8fb0d6", marginTop: 4 }}>
          Este item usa a Aljava compartilhada do personagem (detectado automaticamente — nunca cria uma Aljava por arma).
        </p>
      )}

      <p style={{ fontSize: 12, color: "#7d7d8a", marginTop: 8 }}>
        Demais chaves de <code>estatisticas</code> (dano-base, perícia de ataque etc.) continuam somente leitura nesta etapa — ver diagnóstico técnico abaixo.
      </p>
    </div>
  );
}
