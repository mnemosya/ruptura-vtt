import { useState } from "react";
import { Section } from "./Section";
import { Stat } from "./Stat";
import { ResourceField } from "./ResourceField";
import { TurnCounters } from "./TurnCounters";
import { buttonStyle } from "./styles";
import {
  OVERLOAD_SURGE_TYPES,
  MAX_OVERLOAD_SURGES_PER_DAY,
  MAX_COLLAPSE_SEGMENTS,
  type CharacterAttributes,
  type CharacterGameState,
  type CharacterResources,
  type CharacterRulesPayload,
  type Character,
  type DerivedDefinition,
  type DerivedStats,
} from "../../../../lib/character";

const RECURSO_MAXIMO_IDS = ["pv_max", "pe_max", "mana_max", "integridade_max"] as const;
const OUTROS_DERIVADOS_IDS = ["reacoes_por_rodada", "andar_m", "correr_m", "pa_max"] as const;

const RECURSO_ATUAL_FIELDS = [
  { id: "pv", label: "PV atual", maxId: "pv_max" },
  { id: "pe", label: "PE atual", maxId: "pe_max" },
  { id: "mana", label: "Mana atual", maxId: "mana_max" },
  { id: "integridade", label: "Integridade atual", maxId: "integridade_max" },
] as const satisfies readonly { id: keyof CharacterResources; label: string; maxId: keyof DerivedStats }[];

function derivedMetaById(regras: CharacterRulesPayload | null, id: string): DerivedDefinition | undefined {
  return regras?.derivados.find((d) => d.id === id);
}

export function ResourcesTab({
  regras,
  derivados,
  recursosAtuais,
  onChangeRecursoAtual,
  onRestoreMax,
  estadoJogo,
  onGastarPA,
  onDesfazerPA,
  onResetarPA,
  onUsarReacao,
  onDesfazerReacao,
  onResetarReacoes,
  atributos,
  onApplyShortRest,
  onApplyLongRest,
  sobrecargaUsadaDia,
  rupturaPendente,
  overloadWillRollPending,
  onUseOverloadSurge,
  onRollOverloadWillTest,
  colapso,
  onStabilizeCollapse,
  onAdvanceCollapseSegment,
  onRollCollapseTest,
}: {
  regras: CharacterRulesPayload | null;
  derivados: DerivedStats;
  recursosAtuais: CharacterResources | undefined;
  onChangeRecursoAtual: (id: keyof CharacterResources, value: number) => void;
  onRestoreMax: () => void;
  estadoJogo: CharacterGameState | undefined;
  onGastarPA: () => void;
  onDesfazerPA: () => void;
  onResetarPA: () => void;
  onUsarReacao: () => void;
  onDesfazerReacao: () => void;
  onResetarReacoes: () => void;
  /** Checkpoint v0.36 — só para calcular a prévia (a aplicação de verdade usa applyShortRest/applyLongRest, com o Character completo). */
  atributos: CharacterAttributes;
  onApplyShortRest: () => void;
  onApplyLongRest: () => void;
  /** Checkpoint v0.37 — Sobrecarga/Ruptura pendente. */
  sobrecargaUsadaDia: number;
  rupturaPendente: boolean;
  overloadWillRollPending: boolean;
  onUseOverloadSurge: (tipo: string) => void;
  onRollOverloadWillTest: () => void;
  /** Checkpoint v0.38 — Colapso por PV/PE 0. */
  colapso: Character["colapso"];
  onStabilizeCollapse: () => void;
  onAdvanceCollapseSegment: () => void;
  onRollCollapseTest: (atributoId: "corpo" | "mente") => void;
}) {
  const [tipoSurto, setTipoSurto] = useState<string>(OVERLOAD_SURGE_TYPES[0]);
  const pvAtual = recursosAtuais?.pv ?? 0;
  const peAtual = recursosAtuais?.pe ?? 0;
  const manaAtual = recursosAtuais?.mana ?? 0;
  const ganhoManaCurto = Math.floor(derivados.mana_max / 2);
  const previewManaCurto = Math.min(derivados.mana_max, manaAtual + ganhoManaCurto);
  const ganhoPvLongo = atributos.corpo + 2;
  const ganhoPeLongo = atributos.mente + 2;
  const previewPvLongo = Math.min(derivados.pv_max, pvAtual + ganhoPvLongo);
  const previewPeLongo = Math.min(derivados.pe_max, peAtual + ganhoPeLongo);
  return (
    <>
      <Section title="Derivados (máximos)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {RECURSO_MAXIMO_IDS.map((id) => {
            const meta = derivedMetaById(regras, id);
            return (
              <Stat
                key={id}
                testId={`derivado-${id}`}
                label={meta?.nome ?? id}
                value={derivados[id]}
                hint={meta?.formula_label}
              />
            );
          })}
          {OUTROS_DERIVADOS_IDS.map((id) => {
            const meta = derivedMetaById(regras, id);
            const unidade = meta?.unidade ? ` ${meta.unidade}` : "";
            return (
              <Stat
                key={id}
                testId={`derivado-${id}`}
                label={meta?.nome ?? id}
                value={`${derivados[id]}${unidade}`}
                hint={meta?.formula_label}
              />
            );
          })}
        </div>
      </Section>

      <Section title="Recursos atuais">
        <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>
          Edição manual (inteiro, sem negativo). Sem regra de dano/cura/gasto ainda — isso
          fica para a etapa de combate.
        </p>
        <button onClick={onRestoreMax} style={{ ...buttonStyle, marginBottom: 12 }}>
          Restaurar recursos ao máximo
        </button>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {RECURSO_ATUAL_FIELDS.map(({ id, label, maxId }) => (
            <ResourceField
              key={id}
              testId={`recurso-atual-${id}`}
              label={label}
              value={recursosAtuais?.[id] ?? 0}
              max={derivados[maxId]}
              onChange={(v) => onChangeRecursoAtual(id, v)}
            />
          ))}
        </div>
      </Section>

      <Section title="Descanso">
        <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 12 }}>
          Regras do PRD, ao pé da letra — <strong>Integridade não recupera por descanso</strong>{" "}
          (nem curto, nem longo).
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ background: "#15161b", border: "1px solid #2a2b33", borderRadius: 8, padding: 12, flex: "1 1 220px" }}>
            <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Descanso curto (30 min)</p>
            <p style={{ fontSize: 11, opacity: 0.6, marginBottom: 8 }}>
              +floor(Mana máxima / 2) Mana. Não altera PV, PE ou Integridade.
            </p>
            <p data-testid="descanso-curto-previa" style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>
              Prévia: Mana {manaAtual} → {previewManaCurto} (+{previewManaCurto - manaAtual})
            </p>
            <button data-testid="descanso-curto-button" onClick={onApplyShortRest} style={buttonStyle}>
              Aplicar descanso curto
            </button>
          </div>
          <div style={{ background: "#15161b", border: "1px solid #2a2b33", borderRadius: 8, padding: 12, flex: "1 1 220px" }}>
            <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Descanso longo (8h)</p>
            <p style={{ fontSize: 11, opacity: 0.6, marginBottom: 8 }}>
              +Corpo+2 PV, +Mente+2 PE, Mana ao máximo. Remove PV/Mana temporários e reseta
              Sobrecarga.
            </p>
            <p data-testid="descanso-longo-previa" style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>
              Prévia: PV {pvAtual} → {previewPvLongo} (+{previewPvLongo - pvAtual}) · PE {peAtual} →{" "}
              {previewPeLongo} (+{previewPeLongo - peAtual}) · Mana → {derivados.mana_max} (máximo)
            </p>
            <button data-testid="descanso-longo-button" onClick={onApplyLongRest} style={buttonStyle}>
              Aplicar descanso longo
            </button>
          </div>
        </div>
      </Section>

      <Section title="Sobrecarga">
        <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>
          Até {MAX_OVERLOAD_SURGES_PER_DAY} surtos por dia — só descanso longo recupera. Cada surto
          causa 1d4 de dano psíquico (ajuste PE manualmente — sem regra automática ainda). O 3º surto
          marca Ruptura pendente e exige teste de Vontade CD 7.
        </p>
        <div data-testid="sobrecarga-cargas" style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {Array.from({ length: MAX_OVERLOAD_SURGES_PER_DAY }, (_, i) => i < sobrecargaUsadaDia).map((usada, i) => (
            <span
              key={i}
              data-testid={`sobrecarga-carga-${i}`}
              data-usada={usada}
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                border: `2px solid ${usada ? "#c0392b" : "#444"}`,
                background: usada ? "#c0392b" : "transparent",
              }}
              title={usada ? "Surto usado" : "Surto disponível"}
            />
          ))}
          <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 8 }}>
            {sobrecargaUsadaDia}/{MAX_OVERLOAD_SURGES_PER_DAY} usados
          </span>
        </div>
        {rupturaPendente && (
          <p data-testid="ruptura-pendente-aviso" style={{ fontSize: 12, color: "#c0392b", marginBottom: 10 }}>
            ⚠ Ruptura pendente — resolvida no fim da cena (Marca/Traço, ainda não implementado).
          </p>
        )}
        {overloadWillRollPending && (
          <div style={{ marginBottom: 10 }}>
            <button data-testid="overload-vontade-button" onClick={onRollOverloadWillTest} style={buttonStyle}>
              Rolar Vontade CD 7 (3º surto)
            </button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            data-testid="sobrecarga-tipo-select"
            value={tipoSurto}
            onChange={(e) => setTipoSurto(e.target.value)}
            style={{
              background: "#0f1014",
              color: "inherit",
              border: "1px solid #333",
              borderRadius: 4,
              padding: "6px 8px",
              fontSize: 13,
            }}
          >
            {OVERLOAD_SURGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            data-testid="sobrecarga-usar-button"
            onClick={() => onUseOverloadSurge(tipoSurto)}
            disabled={sobrecargaUsadaDia >= MAX_OVERLOAD_SURGES_PER_DAY}
            style={{ ...buttonStyle, opacity: sobrecargaUsadaDia >= MAX_OVERLOAD_SURGES_PER_DAY ? 0.5 : 1 }}
          >
            Usar surto
          </button>
        </div>
      </Section>

      {(colapso?.ativo || colapso?.cicatrizPendente) && (
        <Section title="Colapso">
          {colapso.ativo ? (
            <>
              <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                Tipo: <strong>{colapso.tipo === "pv" ? "PV" : "PE"}</strong> · Segmentos:{" "}
                <strong data-testid="colapso-segmentos">{colapso.segmentos}/{MAX_COLLAPSE_SEGMENTS}</strong> ·{" "}
                {colapso.estabilizado ? "Estabilizado" : "Não estabilizado"}
              </p>
              <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 10 }}>
                {colapso.tipo === "pv"
                  ? "3º segmento: risco de morte."
                  : "3º segmento: risco de coma/fora de jogo."}{" "}
                Estabilizar interrompe o avanço, mas não cura. Cura de 1+ do recurso colapsado
                encerra o colapso automaticamente.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  data-testid="colapso-teste-corpo-button"
                  onClick={() => onRollCollapseTest("corpo")}
                  style={buttonStyle}
                >
                  Teste de Colapso — Corpo CD 7
                </button>
                <button
                  data-testid="colapso-teste-mente-button"
                  onClick={() => onRollCollapseTest("mente")}
                  style={buttonStyle}
                >
                  Teste de Colapso — Mente CD 7
                </button>
                <button data-testid="colapso-avancar-button" onClick={onAdvanceCollapseSegment} style={buttonStyle}>
                  Avançar segmento manualmente
                </button>
                <button
                  data-testid="colapso-estabilizar-button"
                  onClick={onStabilizeCollapse}
                  disabled={colapso.estabilizado}
                  style={{ ...buttonStyle, opacity: colapso.estabilizado ? 0.5 : 1 }}
                >
                  Estabilizar Colapso
                </button>
              </div>
            </>
          ) : (
            <p data-testid="colapso-cicatriz-pendente-aviso" style={{ fontSize: 12, color: "#f5a623" }}>
              ⚠ Cicatriz pendente — o personagem sobreviveu a um colapso; preenchimento de cicatriz
              ainda não implementado.
            </p>
          )}
        </Section>
      )}

      <Section title="Turno">
        <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>
          Controle manual de PA gastos e Reações usadas — editável em Modo Jogo e Modo
          Evolução. Sem rodada, janela rápida/lenta ou ações automatizadas ainda.
        </p>
        <TurnCounters
          paGastos={estadoJogo?.pa_gastos ?? 0}
          paMax={derivados.pa_max}
          reacoesUsadas={estadoJogo?.reacoes_usadas ?? 0}
          reacoesMax={derivados.reacoes_por_rodada}
          onGastarPA={onGastarPA}
          onDesfazerPA={onDesfazerPA}
          onResetarPA={onResetarPA}
          onUsarReacao={onUsarReacao}
          onDesfazerReacao={onDesfazerReacao}
          onResetarReacoes={onResetarReacoes}
        />
      </Section>
    </>
  );
}
