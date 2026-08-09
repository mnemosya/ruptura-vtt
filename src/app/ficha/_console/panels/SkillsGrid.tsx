"use client";

/**
 * Grade de Perícias — redesenho v2 (spec do Figma, ver console.css
 * "── Perícias v2 ──"). 3 colunas × 7 linhas, ordem alfabética antes
 * da distribuição (a ordem de leitura do DOM já é a correta para
 * leitor de tela).
 *
 * Estrutura em 3 camadas, como na spec:
 *   Card externo (`.rc-skills-wrap`, alinhado à esquerda)
 *     → Box título "PERÍCIAS" (`.rc-skills-caption`, borda só em
 *       cima/direita/esquerda — funde visualmente com o card interno)
 *     → Card interno (`.rc-skills-card`, painel com borda+fundo próprios)
 *       → grade de Card perícia (`.rc-skill`)
 *
 * Cada perícia usa a cor do atributo que a governa — verde (Corpo),
 * roxo (Mente), cyan (Ânimo, reaproveita `--cy`, já existente) — via
 * `data-attr` no card, e um ícone próprio (`skillIcons.tsx`), nunca um
 * ícone genérico igual para as 21.
 *
 * Nenhuma perícia é hardcoded: a lista e o atributo primário vêm de
 * `regras_personagem`, nunca de uma tabela local.
 */

import { HelpCircle } from "lucide-react";
import type { CharacterAttributes } from "../../../../lib/character";
import type { ConsoleApi } from "../types";
import { SKILL_ICONS } from "../skillIcons";

const TOTAL_CELULAS = 21;

const ABREV: Record<string, string> = { corpo: "C", mente: "M", animo: "A" };

export function SkillsGrid({ api, onRolar }: { api: ConsoleApi; onRolar: (periciaId: string) => void }) {
  const definicoes = api.regras?.pericias ?? [];

  const ordenadas = [...definicoes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const celulas = Array.from({ length: Math.max(TOTAL_CELULAS, ordenadas.length) }, (_, i) => ordenadas[i] ?? null);

  if (definicoes.length === 0) {
    return (
      <div className="rc-skills-wrap">
        <span className="rc-skills-caption">Perícias</span>
        <div className="rc-skills-card">
          <p className="rc-vazio">
            As definições de perícia não vieram de regras_personagem — nenhuma lista local é usada no lugar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rc-skills-wrap">
      <span className="rc-skills-caption">Perícias</span>
      <div className="rc-skills-card">
        <div className="rc-skills">
          {celulas.map((skill, i) => {
            if (!skill) {
              return <span key={`vazio-${i}`} className="rc-skill" data-vazio="true" aria-hidden="true" />;
            }
            const attr = skill.atributo_primario as keyof CharacterAttributes | undefined;
            const dados = attr && attr in api.character.atributos ? api.character.atributos[attr] : 0;
            const abrev = attr ? (ABREV[attr] ?? attr.charAt(0).toUpperCase()) : "";
            const Icone = SKILL_ICONS[skill.id] ?? HelpCircle;
            const valor = api.character.pericias[skill.id] ?? 0;
            return (
              <button
                key={skill.id}
                type="button"
                className="rc-skill"
                data-attr={attr}
                onClick={() => onRolar(skill.id)}
                data-testid={`console-pericia-${skill.id}`}
                aria-label={`Rolar ${skill.nome}: ${dados}d8, valor ${valor}`}
              >
                <span className="rc-skill-ico" aria-hidden="true">
                  <Icone size={15} strokeWidth={1.8} />
                </span>
                <span className="rc-skill-body">
                  <span className="rc-skill-nome">{skill.nome}</span>
                  <span className="rc-skill-tag">
                    {abrev} · <span className="rc-skill-dado">{dados}d8</span>
                  </span>
                </span>
                <span className="rc-skill-valor">{valor}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
