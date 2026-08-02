"use client";

/**
 * Grid de Perícias do Console — três colunas de slots, seguindo a
 * referência anexada: marcador circular, nome, atributo primário
 * abreviado e valor à direita. Perícias com valor investido acendem a
 * borda esquerda e ganham o acento âmbar no canto.
 *
 * As definições vêm de `regras_personagem` (SkillDefinition), nunca de
 * uma lista local — mesma fonte que a ficha antiga já usava.
 * Clicar em uma perícia dispara a mesma rolagem de antes (`onRoll`).
 */

import type { CharacterSkills, SkillDefinition } from "../../../lib/character";

/** "corpo" → "C", "mente" → "M", "animo" → "A". Desconhecido fica vazio. */
function abreviarAtributo(id: string | undefined): string {
  if (!id) return "";
  const inicial = id.trim().charAt(0).toUpperCase();
  return ["C", "M", "A"].includes(inicial) ? inicial : "";
}

function MarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export function SkillsPanel({
  pericias,
  definitions,
}: {
  pericias: CharacterSkills;
  definitions: SkillDefinition[] | undefined;
}) {
  const lista = definitions ?? [];

  if (lista.length === 0) {
    return (
      <>
        <div className="rc-caption">Perícias</div>
        <p className="rc-conditions-empty">
          As definições de perícia não vieram de regras_personagem — nenhuma lista local é usada no lugar.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="rc-caption">Perícias</div>
      <div className="rc-skills">
        {lista.map((skill) => {
          const valor = pericias[skill.id] ?? 0;
          return (
            <div
              key={skill.id}
              className="rc-skill"
              data-invested={valor > 0}
              data-testid={`pericia-${skill.id}`}
              title={skill.nome}
            >
              <span className="rc-skill-mark" aria-hidden="true">
                <MarkIcon />
              </span>
              <span className="rc-skill-name">{skill.nome}</span>
              <span className="rc-skill-attr">{abreviarAtributo(skill.atributo_primario)}</span>
              <span className="rc-skill-value">
                {valor > 0 ? `+${valor}` : "00"}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
