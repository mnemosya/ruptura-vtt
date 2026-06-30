import { Section } from "./Section";
import { NumberField } from "./NumberField";
import type { CharacterSkills, SkillDefinition } from "../../../../lib/character";

export function SkillsTab({
  pericias,
  definitions,
  readOnly,
  onChange,
  onRoll,
}: {
  pericias: CharacterSkills;
  definitions: SkillDefinition[] | undefined;
  readOnly: boolean;
  onChange: (id: string, value: number) => void;
  onRoll: (id: string) => void;
}) {
  return (
    <Section title={`Perícias (${Object.keys(pericias).length})`}>
      {readOnly && (
        <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 12 }}>
          Edite este bloco no Modo Evolução.
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px 16px" }}>
        {(definitions ?? []).map((skill) => (
          <div key={skill.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: 1 }}>
              <NumberField
                label={skill.nome}
                value={pericias[skill.id] ?? 0}
                min={skill.valor_minimo}
                max={skill.valor_maximo}
                compact
                disabled={readOnly}
                onChange={(v) => onChange(skill.id, v)}
              />
            </div>
            {/* "Rolar" funciona nos dois modos, mesmo com o campo travado em Modo Jogo. */}
            <button
              data-testid={`pericia-${skill.id}-rolar`}
              onClick={() => onRoll(skill.id)}
              style={{
                background: "transparent",
                color: "#888",
                border: "none",
                fontSize: 12,
                textDecoration: "underline",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Rolar
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}
