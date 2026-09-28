"use client";

/**
 * NÚCLEO DA RODADA — a placa que fica no topo do palco durante o
 * combate. Desenho do Figma (nós 440:1827 e 440:2643).
 *
 * Vive em arquivo próprio, e não dentro de `TrilhaFaccoes`, por um
 * motivo prático: é a peça que mais foi revisada visualmente, e a
 * página de revisão (`/dev/estilos`) precisa desenhá-la em todos os
 * estados sem montar a trilha inteira em volta. Um componente só, dois
 * lugares — a página nunca mostra uma cópia que envelheceu.
 *
 * A rodada, a janela em vigor e a trilha ficam na mesma placa. Quando a
 * janela termina, a própria trilha permite resolver os lentos ou encerrar
 * a rodada. O estado continua disponível para leitor de tela.
 *
 * Nada aqui decide regra: quem diz se a janela acabou é
 * `podeEncerrarJanela`, e de quem é a vez, `ladoDaVez`.
 */

import {
  type EstadoTrilha, type Lado,
  DICA_JANELA, ROTULO_JANELA_CURTO,
} from "./modelo";

export interface NucleoRodadaProps {
  trilha: EstadoTrilha;
  /** Quem está com o turno aberto, se alguém. */
  agindo: { nome: string; lado: Lado } | null;
  /** Lado da vez pela alternância — `null` quando qualquer um pode abrir. */
  vez: Lado | null;
  /** `podeEncerrarJanela(trilha)`: ninguém mais age nesta janela. */
  janelaAcabou: boolean;
  onAvancarJanela: () => void;
  onProximaRodada: () => void;
}

export function NucleoRodada({
  trilha, agindo, vez, janelaAcabou, onAvancarJanela, onProximaRodada,
}: NucleoRodadaProps) {
  const estado = agindo
    ? `${agindo.nome} em ação`
    : vez === "pj" ? "Vez dos jogadores"
    : vez === "pn" ? "Vez do narrador"
    : janelaAcabou ? "Janela concluída"
    : "Qualquer lado pode abrir";
  const podeAvancar = janelaAcabou && !agindo;
  return (
    <section className="rv-rodadas" aria-label="Rodada e ativação" data-janela={trilha.janela}>
      <div className="rv-rodadas-nucleo">
        <p className="rv-rodadas-rodada">
          Rodada {trilha.rodada}
          {trilha.modo !== "combate" && (
            <span className="rv-rodadas-modo" data-modo={trilha.modo}>
              {trilha.modo === "emboscada" ? "Emboscada" : trilha.modo === "tregua" ? "Trégua" : "Exploração"}
            </span>
          )}
        </p>
        <p className="rv-rodadas-janela" data-janela={trilha.janela} title={DICA_JANELA[trilha.janela]}>
          Turnos {ROTULO_JANELA_CURTO[trilha.janela]}
        </p>
        <div className="rv-rodadas-trilha" role="group" aria-label="Etapas da rodada">
          <button
            type="button"
            className="rv-rodadas-etapa"
            data-destino="rapidos"
            aria-label="Ir para turnos rápidos da próxima rodada"
            aria-current={trilha.janela === "rapidos" ? "step" : undefined}
            title={trilha.janela === "rapidos" ? "Turnos rápidos em andamento" : podeAvancar ? "Ir para turnos rápidos da próxima rodada" : "Disponível quando a janela terminar"}
            disabled={trilha.janela === "rapidos" || !podeAvancar}
            onClick={onProximaRodada}
          />
          <button
            type="button"
            className="rv-rodadas-etapa"
            data-destino="lentos"
            aria-label="Ir para turnos lentos"
            aria-current={trilha.janela === "lentos" ? "step" : undefined}
            title={trilha.janela === "lentos" ? "Turnos lentos em andamento" : podeAvancar ? "Ir para turnos lentos" : "Disponível quando a janela terminar"}
            disabled={trilha.janela === "lentos" || !podeAvancar}
            onClick={onAvancarJanela}
          />
        </div>
      </div>
      <p className="rv-rodadas-estado" role="status" aria-live="polite">{estado}</p>
    </section>
  );
}
