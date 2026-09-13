"use client";

/**
 * A COR DA LINHA DA GRADE — paleta do VTT, sem o seletor do sistema.
 *
 * Era um `<input type="color">`, que abre o painel de cores do sistema
 * operacional: uma janela que não é do VTT, não fecha com Escape e, no
 * macOS, precisa de vários cliques fora pra sumir. Escolher a cor de uma
 * linha de grade não justifica abrir o seletor profissional do sistema.
 *
 * No lugar, o mesmo idioma que o resto da mesa já usa pra cor (a fileira
 * de amostras do painel de Marcar): as opções que fazem sentido para uma
 * linha sobre mapa, clicáveis de uma vez. O campo hexadecimal ao lado é
 * a saída pra qualquer outra cor — quem tem um valor exato digita, e
 * quem não tem nunca precisa dele.
 *
 * O par mora aqui, e não em cada folha, porque a de criação e a de
 * parâmetros mostram a MESMA coisa: duas cópias divergiriam na primeira
 * vez que uma das duas ganhasse uma cor nova.
 */

import { useEffect, useState } from "react";

/** Cores de LINHA, não de preenchimento: claras o bastante pra ler sobre mapa escuro. */
export const CORES_DA_GRADE: { hex: string; rotulo: string }[] = [
  { hex: "#96bed7", rotulo: "Ardósia clara (padrão)" },
  { hex: "#eaf3fa", rotulo: "Quase branco" },
  { hex: "#7f95b3", rotulo: "Ardósia" },
  { hex: "#45b8c9", rotulo: "Ciano" },
  { hex: "#cf9a3e", rotulo: "Âmbar" },
  { hex: "#d15068", rotulo: "Carmim" },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

export function CampoCorGrade(p: {
  valor: string;
  onMudar: (hex: string) => void;
  /** Prefixo dos `data-testid` — as duas folhas têm nomes próprios. */
  testid: string;
}) {
  /**
   * O rascunho existe porque "#96bed" é um estado LEGÍTIMO de quem está
   * digitando. Escrever a cada tecla mandaria cores inválidas pro
   * formulário; recusar a tecla impediria de chegar na sexta.
   */
  const [rascunho, setRascunho] = useState(p.valor);
  useEffect(() => { setRascunho(p.valor); }, [p.valor]);

  function confirmar(texto: string) {
    const limpo = texto.trim().startsWith("#") ? texto.trim() : `#${texto.trim()}`;
    if (!HEX.test(limpo)) { setRascunho(p.valor); return; }
    p.onMudar(limpo.toLowerCase());
  }

  return (
    <div className="rv-gav-cor">
      <div className="rv-fp-cores" role="group" aria-label="Cor da linha da grade">
        {CORES_DA_GRADE.map((c) => (
          <button
            key={c.hex}
            type="button"
            className="rv-fp-cor"
            style={{ ["--marca" as string]: c.hex }}
            aria-pressed={p.valor.toLowerCase() === c.hex}
            aria-label={c.rotulo}
            title={c.rotulo}
            data-testid={`${p.testid}-${c.hex.slice(1)}`}
            onClick={() => p.onMudar(c.hex)}
          />
        ))}
      </div>
      <input
        className="rv-cena-campo rv-gav-hex"
        value={rascunho}
        maxLength={7}
        spellCheck={false}
        aria-label="Cor da linha em hexadecimal"
        data-testid={p.testid}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={(e) => confirmar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); confirmar(rascunho); }
          if (e.key === "Escape") { e.preventDefault(); setRascunho(p.valor); }
        }}
      />
    </div>
  );
}
