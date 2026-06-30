import { Section } from "./Section";
import { NumberField } from "./NumberField";
import { buttonStyle } from "./styles";
import type { AttributeDefinition, CharacterAttributes } from "../../../../lib/character";

export function AttributesTab({
  atributos,
  definitions,
  readOnly,
  onChange,
  onRoll,
}: {
  atributos: CharacterAttributes;
  definitions: AttributeDefinition[] | undefined;
  readOnly: boolean;
  onChange: (id: keyof CharacterAttributes, value: number) => void;
  onRoll: (id: keyof CharacterAttributes) => void;
}) {
  return (
    <Section title="Atributos">
      {readOnly && (
        <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 12 }}>
          Edite este bloco no Modo Evolução.
        </p>
      )}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {(["corpo", "mente", "animo"] as const).map((id) => {
          const def = definitions?.find((a) => a.id === id);
          return (
            <div key={id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <NumberField
                testId={`atributo-${id}`}
                label={def?.nome ?? id}
                value={atributos[id]}
                min={def?.valor_minimo ?? 1}
                max={def?.valor_maximo ?? 5}
                disabled={readOnly}
                onChange={(v) => onChange(id, v)}
              />
              {/* "Rolar" funciona nos dois modos, mesmo com o campo travado em Modo Jogo. */}
              <button data-testid={`atributo-${id}-rolar`} onClick={() => onRoll(id)} style={{ ...buttonStyle, fontSize: 12, padding: "4px 10px" }}>
                Rolar
              </button>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
