import { Section } from "./Section";
import { NumberField } from "./NumberField";
import type { CharacterSkills, SkillDefinition } from "../../../../lib/character";

export function SkillsTab({
  pericias,
  definitions,
  onChange,
}: {
  pericias: CharacterSkills;
  definitions: SkillDefinition[] | undefined;
  onChange: (id: string, value: number) => void;
}) {
  return (
    <Section title={`Perícias (${Object.keys(pericias).length})`}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px 16px" }}>
        {(definitions ?? []).map((skill) => (
          <NumberField
            key={skill.id}
            label={skill.nome}
            value={pericias[skill.id] ?? 0}
            min={skill.valor_minimo}
            max={skill.valor_maximo}
            compact
            onChange={(v) => onChange(skill.id, v)}
          />
        ))}
      </div>
    </Section>
  );
}
