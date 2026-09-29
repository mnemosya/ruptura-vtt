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
import { useDicaPortal } from "../_painel/ui/DicaPortal";

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
  /**
   * Quem conduz a rodada (avança janela/rodada) — só o narrador. Para
   * os demais a trilha continua legível, mas as etapas não são botões
   * que respondem. O servidor recusa o avanço de qualquer forma.
   */
  podeConduzir?: boolean;
}

/**
 * Uma etapa da trilha. `aria-disabled`, e não `disabled`: botão
 * desabilitado não dispara os eventos de ponteiro, e a DICA com o motivo
 * da trava é justamente o que a etapa travada tem a dizer. O clique é
 * barrado aqui mesmo.
 */
function Etapa({ destino, atual, rotulo, emAndamento, motivoTrava, onIr }: {
  destino: "rapidos" | "lentos";
  atual: boolean;
  rotulo: string;
  emAndamento: string;
  /** `null` = liberada. */
  motivoTrava: string | null;
  onIr: () => void;
}) {
  const travada = atual || motivoTrava !== null;
  const { alvo, dica } = useDicaPortal(atual ? emAndamento : motivoTrava ?? rotulo, { lado: "abaixo" });
  return (
    <>
      <button
        type="button"
        className="rv-rodadas-etapa"
        data-destino={destino}
        aria-label={atual ? emAndamento : motivoTrava ? `${rotulo} — ${motivoTrava}` : rotulo}
        aria-current={atual ? "step" : undefined}
        aria-disabled={travada || undefined}
        onClick={() => { if (!travada) onIr(); }}
        {...alvo}
      />
      {dica}
    </>
  );
}

export function NucleoRodada({
  trilha, agindo, vez, janelaAcabou, onAvancarJanela, onProximaRodada, podeConduzir = true,
}: NucleoRodadaProps) {
  const estado = agindo
    ? `${agindo.nome} em ação`
    : vez === "pj" ? "Vez dos jogadores"
    : vez === "pn" ? "Vez do narrador"
    : janelaAcabou ? "Janela concluída"
    : "Qualquer lado pode abrir";
  /* O NARRADOR MANDA NO RELÓGIO: nada o impede de trocar de janela ou
     de rodada — nem alguém agindo, nem a janela por terminar. As duas
     transições (`avancarParaLentos`, `proximaRodada`) já encerram a
     ativação em curso. Só a etapa ATUAL não é clicável (não há pra onde
     ir). `janelaAcabou` segue alimentando o texto de estado; quem não
     conduz nem vê as etapas (`podeConduzir`). */
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
        {/* As etapas são o CONTROLE da rodada (avançar janela/rodada) —
            só existem pra quem conduz. O jogador lê a janela no rótulo
            acima; a faixa sozinha, sem clique, só repetia isso. */}
        {podeConduzir && <div className="rv-rodadas-trilha" role="group" aria-label="Etapas da rodada">
          <Etapa
            destino="rapidos"
            atual={trilha.janela === "rapidos"}
            rotulo="Ir para turnos rápidos da próxima rodada"
            emAndamento="Turnos rápidos em andamento"
            motivoTrava={null}
            onIr={onProximaRodada}
          />
          <Etapa
            destino="lentos"
            atual={trilha.janela === "lentos"}
            rotulo="Ir para turnos lentos"
            emAndamento="Turnos lentos em andamento"
            motivoTrava={null}
            onIr={onAvancarJanela}
          />
        </div>}
      </div>
      <p className="rv-rodadas-estado" role="status" aria-live="polite">{estado}</p>
    </section>
  );
}
