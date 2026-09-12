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
 * Duas partes:
 *
 *  · o NÚCLEO, sempre presente: a rodada em caixa pequena por cima e a
 *    janela em vigor com o teto de PA embaixo, grande. Os dois juntos
 *    respondem "onde estamos" sem ler mais nada.
 *
 *  · o RODAPÉ, condicional: uma régua, o estado à esquerda e a ação à
 *    direita. Só existe quando há algo a dizer além do óbvio — ver
 *    `temNoticia` abaixo. É a diferença entre os dois estados do Figma.
 *
 * Nada aqui decide regra: quem diz se a janela acabou é
 * `podeEncerrarJanela`, e de quem é a vez, `ladoDaVez`.
 */

import {
  type EstadoTrilha, type Janela, type Lado,
  DICA_JANELA, PISO_PA, ROTULO_JANELA_CURTO, TETO_PA,
} from "./modelo";

/** Teto de PA da janela, curto — derivado das constantes do modelo, nunca digitado à mão. */
export function limiteDaJanela(janela: Janela): string {
  return janela === "rapidos" ? `até ${TETO_PA.rapidos} PA` : `${PISO_PA.lentos}+ PA`;
}

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

  /**
   * Há notícia? Só então o rodapé existe.
   *
   * "Qualquer lado pode abrir" é o estado de repouso: ninguém agindo,
   * nenhuma vez definida pela alternância, janela ainda aberta. Não é
   * informação — é a ausência dela. Uma régua e uma linha extra pra
   * anunciar que nada mudou é ruído numa peça fixa no topo da mesa.
   */
  const temNoticia = agindo !== null || vez !== null || janelaAcabou;

  return (
    <section className="rv-rodadas" aria-label="Rodada e ativação" data-janela={trilha.janela}>
      <span className="rv-rodadas-canto rv-rodadas-canto--se" aria-hidden="true" />
      <span className="rv-rodadas-canto rv-rodadas-canto--sd" aria-hidden="true" />
      <span className="rv-rodadas-canto rv-rodadas-canto--ie" aria-hidden="true" />
      <span className="rv-rodadas-canto rv-rodadas-canto--id" aria-hidden="true" />

      <p className="rv-rodadas-rodada">
        Rodada {trilha.rodada}
        {trilha.modo !== "combate" && (
          <span className="rv-rodadas-modo" data-modo={trilha.modo}>
            {trilha.modo === "emboscada" ? "Emboscada" : trilha.modo === "tregua" ? "Trégua" : "Exploração"}
          </span>
        )}
      </p>
      <p className="rv-rodadas-janela" data-janela={trilha.janela} title={DICA_JANELA[trilha.janela]}>
        {ROTULO_JANELA_CURTO[trilha.janela]} · {limiteDaJanela(trilha.janela)}
      </p>

      {temNoticia && (
        <div className="rv-rodadas-pe">
          <p className="rv-rodadas-estado" data-lado={agindo ? agindo.lado : vez ?? "livre"} role="status" aria-live="polite">
            {estado}
          </p>
          {/* Avançar janela/rodada só aparece quando o modelo diz que
              ninguém mais pode agir nela — e nunca no meio de uma
              ativação aberta (escolha incompatível). */}
          {janelaAcabou && !agindo && (
            <button
              type="button"
              className="rv-rodadas-avanca"
              onClick={trilha.janela === "rapidos" ? onAvancarJanela : onProximaRodada}
            >
              {trilha.janela === "rapidos" ? `Resolver ${ROTULO_JANELA_CURTO.lentos}` : "Encerrar rodada"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
