import { Section } from "./Section";
import { NumberField } from "./NumberField";
import type { AttributeDefinition, CharacterAttributes } from "../../../../lib/character";

export function AttributesTab({
  atributos,
  definitions,
  onChange,
}: {
  atributos: CharacterAttributes;
  definitions: AttributeDefinition[] | undefined;
  onChange: (id: keyof CharacterAttributes, value: number) => void;
}) {
  return (
    <Section title="Atributos">
      <div style={{ display: "flex", gap: 16 }}>
        {(["corpo", "mente", "animo"] as const).map((id) => {
          const def = definitions?.find((a) => a.id === id);
          return (
            <NumberField
              key={id}
              testId={`atributo-${id}`}
              label={def?.nome ?? id}
              value={atributos[id]}
              min={def?.valor_minimo ?? 1}
              max={def?.valor_maximo ?? 5}
              onChange={(v) => onChange(id, v)}
            />
          );
        })}
      </div>
    </Section>
  );
}
