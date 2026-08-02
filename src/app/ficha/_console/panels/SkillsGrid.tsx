"use client";

/**
 * Grade de Perícias: 3 colunas × 7 linhas (21 posições), em ordem
 * alfabética. A ordenação acontece ANTES da distribuição, então a
 * ordem de leitura do DOM já é a ordem correta para leitor de tela.
 *
 * A tag mostra o atributo relacionado e a quantidade de d8 rolados
 * (ex.: "M · 3d8") — a quantidade é o valor do atributo, que é como o
 * motor real (`rollPericia`) monta o pool. Nenhuma perícia é hardcoded:
 * a lista vem de `regras_personagem`.
 *
 * Havendo menos de 21 perícias, as posições restantes ficam como
 * células desabilitadas para a grade não parecer quebrada.
 */

import { Target } from "lucide-react";
import type { CharacterAttributes } from "../../../../lib/character";
import type { ConsoleApi } from "../types";

const TOTAL_CELULAS = 21;

const ABREV: Record<string, string> = { corpo: "C", mente: "M", animo: "A" };

export function SkillsGrid({ api, onRolar }: { api: ConsoleApi; onRolar: (periciaId: string) => void }) {
  const definicoes = api.regras?.pericias ?? [];

  const ordenadas = [...definicoes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const celulas = Array.from({ length: Math.max(TOTAL_CELULAS, ordenadas.length) }, (_, i) => ordenadas[i] ?? null);

  if (definicoes.length === 0) {
    return (
      <div className="rc-skills-wrap">
        <span className="rc-caption">Perícias</span>
        <p className="rc-vazio">
          As definições de perícia não vieram de regras_personagem — nenhuma lista local é usada no lugar.
        </p>
      </div>
    );
  }

  return (
    <div className="rc-skills-wrap">
      <span className="rc-caption">Perícias</span>
      <div className="rc-skills">
        {celulas.map((skill, i) => {
          if (!skill) {
            return <span key={`vazio-${i}`} className="rc-skill" data-vazio="true" aria-hidden="true" />;
          }
          const attr = skill.atributo_primario as keyof CharacterAttributes | undefined;
          const dados = attr && attr in api.character.atributos ? api.character.atributos[attr] : 0;
          const abrev = attr ? (ABREV[attr] ?? attr.charAt(0).toUpperCase()) : "";
          return (
            <button
              key={skill.id}
              type="button"
              className="rc-skill"
              onClick={() => onRolar(skill.id)}
              data-testid={`console-pericia-${skill.id}`}
              aria-label={`Rolar ${skill.nome}: ${dados}d8`}
            >
              <Target size={14} className="rc-skill-ico" aria-hidden="true" />
              <span className="rc-skill-nome" title={skill.nome}>
                {skill.nome}
              </span>
              <span className="rc-skill-tag">
                {abrev} · {dados}d8
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
