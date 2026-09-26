"use client";

/**
 * Perícias — TABELA DE SENSOR.
 *
 * Era uma grade de 21 cards (3 × 7, com células vazias de enchimento
 * quando o catálogo tinha menos). Virou uma tabela de leitura: uma
 * linha por perícia, com índice, nome, atributo que a governa, pool de
 * dados e nível. O que se faz aqui é comparar perícias e escolher uma
 * para rolar, e linha alinhada em colunas se compara melhor que card.
 *
 * QUANTAS COLUNAS — isso é medido, não fixado. O Console é uma janela
 * redimensionável e tem dois modos (Painel e Foco) com larguras bem
 * diferentes; um número fixo de colunas ou espreme os nomes ou
 * desperdiça metade da mesa. Um `ResizeObserver` lê a largura
 * disponível e divide por `LARGURA_MINIMA_COLUNA`.
 *
 * Por que não `repeat(auto-fill, …)`, que faria o mesmo sem JS: ele
 * distribui em ZIGUEZAGUE (1, 2, 3 na primeira linha), e aqui a
 * distribuição é por FATIAS — 01–11 na primeira coluna, 12–21 na
 * segunda, como uma página de catálogo. Saber quantas colunas cabem é
 * o que permite fatiar a lista antes de desenhar, e assim a ordem do
 * DOM — que é a do leitor de tela — continua sendo a ordem visível.
 *
 * Cada linha carrega a cor do atributo que governa a perícia — verde
 * (Corpo), roxo (Mente), petróleo (Ânimo) — num fio vertical na borda
 * esquerda e nas duas colunas técnicas. Nenhuma perícia é hardcoded: a
 * lista e o atributo primário vêm de `regras_personagem`.
 */

import { useEffect, useRef, useState } from "react";
import type { CharacterAttributes } from "../../../../lib/character";
import type { ConsoleApi } from "../types";
import { PassoValor } from "./ModoEvolucao";
import { CabecalhoModulo } from "./CabecalhoModulo";

const ABREV: Record<string, string> = { corpo: "C", mente: "M", animo: "A" };

/** Abaixo disto o nome da perícia começa a ser cortado. */
const LARGURA_MINIMA_COLUNA = 220;
/** Em Evolução a última célula vira os passos −/+ e come ~36px da
    linha — com o mesmo mínimo, o nome sobrava com um terço da largura. */
const LARGURA_MINIMA_COLUNA_EVOLUCAO = 300;
/** Teto de colunas: acima de quatro, a linha vira uma tira fina demais para ler. */
const MAXIMO_COLUNAS = 4;

/** Divide em `quantas` fatias consecutivas, as primeiras maiores. */
function fatiar<T>(itens: T[], quantas: number): T[][] {
  const porColuna = Math.ceil(itens.length / quantas);
  return Array.from({ length: quantas }, (_, c) => itens.slice(c * porColuna, (c + 1) * porColuna)).filter(
    (coluna) => coluna.length > 0,
  );
}

export function SkillsGrid({ api, onRolar }: { api: ConsoleApi; onRolar: (periciaId: string) => void }) {
  const definicoes = api.regras?.pericias ?? [];
  const ordenadas = [...definicoes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const evolucao = api.modo === "evolucao";
  const medidaRef = useRef<HTMLDivElement>(null);
  const [colunas, setColunas] = useState(2);

  useEffect(() => {
    const alvo = medidaRef.current;
    if (!alvo) return;
    const minimo = evolucao ? LARGURA_MINIMA_COLUNA_EVOLUCAO : LARGURA_MINIMA_COLUNA;
    const observer = new ResizeObserver(([entrada]) => {
      const largura = entrada?.contentRect.width ?? 0;
      const cabem = Math.floor(largura / minimo);
      setColunas(Math.min(MAXIMO_COLUNAS, Math.max(1, cabem)));
    });
    observer.observe(alvo);
    return () => observer.disconnect();
  }, [evolucao]);

  if (definicoes.length === 0) {
    return (
      <div className="rc-skills-wrap">
        <div className="rc-skills-card">
          <CabecalhoModulo id="ID://PERÍCIAS" mod="MOD.SKILLS // 03" />
          <p className="rc-vazio">
            As definições de perícia não vieram de regras_personagem — nenhuma lista local é usada no lugar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rc-skills-wrap">
      <div className="rc-skills-card">
        <CabecalhoModulo id="ID://PERÍCIAS" mod="MOD.SKILLS // 03" />
        <div
          className="rc-sensor"
          ref={medidaRef}
          style={{ "--rc-sensor-colunas": colunas } as React.CSSProperties}
          data-evolucao={evolucao ? "true" : undefined}
        >
          {fatiar(ordenadas, colunas).map((coluna, indiceColuna) => (
            <div className="rc-sensor-col" key={indiceColuna}>
              {coluna.map((skill) => {
                const attr = skill.atributo_primario as keyof CharacterAttributes | undefined;
                const dados = attr && attr in api.character.atributos ? api.character.atributos[attr] : 0;
                const abrev = attr ? (ABREV[attr] ?? attr.charAt(0).toUpperCase()) : "";
                const valor = api.character.pericias[skill.id] ?? 0;
                const indice = String(ordenadas.indexOf(skill) + 1).padStart(2, "0");

                const celulas = (
                  <>
                    <span className="rc-sensor-index">{indice}</span>
                    <span className="rc-sensor-name">{skill.nome}</span>
                    <span className="rc-sensor-link">{abrev}</span>
                    <span className="rc-sensor-pool">{dados}d8</span>
                  </>
                );

                // Modo Evolução: a linha para de rolar e passa a
                // ajustar — mesmo motivo dos atributos (clique de
                // rolagem no meio de uma edição é acidente garantido).
                if (evolucao) {
                  return (
                    <div
                      key={skill.id}
                      className="rc-sensor-row"
                      data-attr={attr}
                      data-editando="true"
                      data-testid={`console-pericia-${skill.id}`}
                    >
                      {celulas}
                      <span className="rc-sensor-rank">
                        <PassoValor
                          valor={valor}
                          min={skill.valor_minimo ?? 0}
                          max={skill.valor_maximo ?? 5}
                          rotulo={skill.nome}
                          onDefinir={(novo) => api.editarPericia(skill.id, novo)}
                          testId={`console-pericia-passo-${skill.id}`}
                        />
                      </span>
                    </div>
                  );
                }

                return (
                  <button
                    key={skill.id}
                    type="button"
                    className="rc-sensor-row"
                    data-attr={attr}
                    onClick={() => onRolar(skill.id)}
                    data-testid={`console-pericia-${skill.id}`}
                    aria-label={`Rolar ${skill.nome}: ${dados}d8, valor ${valor}`}
                  >
                    {celulas}
                    <span className="rc-sensor-rank">{valor}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
