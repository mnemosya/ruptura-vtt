import { Section } from "./Section";
import { Stat } from "./Stat";
import { ResourceField } from "./ResourceField";
import { buttonStyle } from "./styles";
import type {
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
}: {
  regras: CharacterRulesPayload | null;
  derivados: DerivedStats;
  recursosAtuais: CharacterResources | undefined;
  onChangeRecursoAtual: (id: keyof CharacterResources, value: number) => void;
  onRestoreMax: () => void;
}) {
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
    </>
  );
}
