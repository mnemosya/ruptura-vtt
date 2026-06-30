import { Section } from "./Section";
import { NumberField } from "./NumberField";
import type { AttributeDefinition, CharacterAttributes } from "../../../../lib/character";

export function AttributesTab({
  atributos,
  definitions,
  readOnly,
  onChange,
}: {
  atributos: CharacterAttributes;
  definitions: AttributeDefinition[] | undefined;
  readOnly: boolean;
  onChange: (id: keyof CharacterAttributes, value: number) => void;
}) {
  return (
    <Section title="Atributos">
      {readOnly && (
        <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 12 }}>
          Edite este bloco no Modo Evolução.
        </p>
      )}
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
              disabled={readOnly}
              onChange={(v) => onChange(id, v)}
            />
          );
        })}
      </div>
    </Section>
  );
}
