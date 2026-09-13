"use client";

/**
 * MODO EVOLUÇÃO no Console — o interruptor da barra de título e a faixa
 * de aviso que ele acende.
 *
 * Por que existir: o Modo Evolução já era real (`sheetMode` em
 * `CharacterSheetClient`, `updateAtributo`/`updatePericia` com clamp,
 * recálculo de derivados, `logPermanentAdjustment` e `table_logs`), mas
 * a ÚNICA porta pra ele era o `ModeToggle` da aba Geral — que o Console
 * do produto nem mostra. Dentro do VTT, portanto, não havia como
 * evoluir a ficha. Aqui ele ganha a porta, sem regra nova nenhuma.
 *
 * Escolhas visuais (linguagem do `console.css`, nada inventado):
 *   · ÂMBAR, nunca vermelho — evolução é ação deliberada, não perigo;
 *     é a mesma cor que o produto já usa para "pendência/atenção".
 *   · O interruptor é um CHIP na barra de título, ao lado dos controles
 *     de janela: fica sempre visível, em qualquer aba, sem ocupar
 *     espaço do conteúdo.
 *   · Ao ligar, uma FAIXA aparece sob a barra de título. Ela não é
 *     decorativa: diz o que muda (permanente + auditado) e mostra o PM
 *     real quando a ficha tem PM. Sem PM registrado, não inventa "0/0"
 *     — simplesmente não mostra o bloco.
 */

import { Check, Crosshair, Sliders } from "lucide-react";
import type { ConsoleApi, ConsoleModo } from "../types";
import { useVerNoMapa } from "../ConsoleCloseContext";

/**
 * "Ver no mapa" — leva a câmera até o token deste personagem e fecha a
 * ficha.
 *
 * Só aparece quando existe pra onde ir: dentro do VTT E com o
 * personagem posicionado na cena. Em Personagens, na Mesa, ou com um
 * personagem que não está em jogo, o botão não é renderizado — melhor
 * ausente do que presente e inerte.
 *
 * Mora aqui, junto do `ModoChip`, porque é a mesma peça de UI: uma
 * ação de barra de título do Console.
 */
export function VerNoMapaChip() {
  const verNoMapa = useVerNoMapa();
  if (!verNoMapa) return null;
  return (
    <button
      type="button"
      className="rc-modo-chip"
      onClick={verNoMapa}
      title="Centralizar o mapa no token deste personagem (fecha a ficha)"
      data-testid="console-ver-no-mapa"
    >
      <span className="rc-modo-chip-ico" aria-hidden="true">
        <Crosshair size={12} strokeWidth={2} />
      </span>
      Ver no mapa
    </button>
  );
}

export function ModoChip({ modo, onAlternar }: { modo: ConsoleModo; onAlternar: (m: ConsoleModo) => void }) {
  const evolucao = modo === "evolucao";
  return (
    <button
      type="button"
      className="rc-modo-chip"
      data-evolucao={evolucao ? "true" : undefined}
      aria-pressed={evolucao}
      onClick={() => onAlternar(evolucao ? "jogo" : "evolucao")}
      title={
        evolucao
          ? "Sair do Modo Evolução (volta para o Modo Jogo)"
          : "Entrar no Modo Evolução — destrava atributos, perícias e talentos"
      }
      data-testid="console-modo-chip"
    >
      <span className="rc-modo-chip-ico" aria-hidden="true">
        {evolucao ? <Check size={12} strokeWidth={2.4} /> : <Sliders size={12} strokeWidth={2} />}
      </span>
      {evolucao ? "Modo Evolução" : "Evoluir"}
    </button>
  );
}

/* Aqui ficava a FAIXA DE AVISO do Modo Evolução — selo, a frase
   "alterações são permanentes e ficam no histórico" e o contador de
   PM. Saiu: o aviso repetia, em uma faixa fixa, o que o próprio chip
   da barra de título já diz ao ficar âmbar, e custava uma tira inteira
   de altura da janela em TODA sessão de evolução — a mesma troca ruim
   que o HUD do token fazia no mapa.

   O que saiu junto e NÃO tem outro lugar hoje: o contador de PM
   (`api.pm`). O dado continua existindo na API do Console; só não é
   mostrado em lugar nenhum. */

/**
 * Passo −/+ de um valor permanente. Aparece SÓ em Modo Evolução; em
 * Modo Jogo o card volta a ser só o botão de rolar, intocado.
 *
 * `min`/`max` vêm das regras publicadas (o handler do client clampa de
 * novo — isto aqui é só para desabilitar a ponta e não oferecer um
 * passo que seria recusado).
 */
export function PassoValor({
  valor,
  min,
  max,
  rotulo,
  onDefinir,
  testId,
}: {
  valor: number;
  min: number;
  max: number;
  rotulo: string;
  onDefinir: (novo: number) => void;
  testId?: string;
}) {
  return (
    <span className="rc-passo" data-testid={testId}>
      <button
        type="button"
        className="rc-passo-btn"
        disabled={valor <= min}
        aria-label={`Diminuir ${rotulo}`}
        onClick={(e) => {
          e.stopPropagation();
          onDefinir(valor - 1);
        }}
      >
        −
      </button>
      <span className="rc-passo-val" aria-label={`${rotulo}: ${valor}`}>
        {valor}
      </span>
      <button
        type="button"
        className="rc-passo-btn"
        disabled={valor >= max}
        aria-label={`Aumentar ${rotulo}`}
        onClick={(e) => {
          e.stopPropagation();
          onDefinir(valor + 1);
        }}
      >
        +
      </button>
    </span>
  );
}
