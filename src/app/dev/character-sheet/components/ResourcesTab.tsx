import { Section } from "./Section";
import { Stat } from "./Stat";
import { ResourceField } from "./ResourceField";
import { TurnCounters } from "./TurnCounters";
import { buttonStyle } from "./styles";
import type {
  CharacterAttributes,
  CharacterGameState,
  CharacterResources,
  CharacterRulesPayload,
  DerivedDefinition,
  DerivedStats,
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
}) {
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
