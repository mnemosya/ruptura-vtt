"use client";

/**
 * Painel da ferramenta MEDIR — ancorado ao lado da barra, nunca modal
 * (o mapa continua visível e recebendo o gesto da régua por baixo).
 *
 * PURAMENTE APRESENTACIONAL, mesma disciplina de `PainelTerreno`/
 * `PainelObjetos`: não mede, não calcula distância, não fala com o
 * servidor. Recebe o resumo já calculado (`medir()`, em `MapaHex`) e
 * devolve intenções.
 *
 * O painel existe pra responder três coisas que a régua sozinha não
 * responde: em que modo estou (some ou fica?), quanto deu no total
 * (somando TODOS os trechos, não só o último), e como faço uma dobra
 * (`Q` — que ninguém descobre sem alguém contar).
 */

import { JanelaFerramenta } from "./JanelaFerramenta";
import { AlertTriangle, Eraser, Loader2, MousePointerClick, Ruler, Timer } from "lucide-react";
import { type ModoMedicao } from "../_dominio/medicaoRegua";

export type { ModoMedicao };

export interface ResumoMedicao {
  /** Distância de cada trecho, na ordem (origem→dobra, dobra→dobra, …). */
  trechos: number[];
  /** Soma dos trechos, em metros (= células). */
  metros: number;
  /** Soma do custo de deslocamento — difere de `metros` sobre terreno difícil. */
  custo: number;
  /** Alguma parte da régua atravessa terreno bloqueado. */
  atravessaBloqueio: boolean;
}

export interface PropsPainelMedir {
  modo: ModoMedicao;
  onModo: (m: ModoMedicao) => void;
  /** Medição em andamento (ou recém-concluída); `null` quando não há régua na tela. */
  resumo: ResumoMedicao | null;
  /** Quantas dobras foram fixadas com `Q` na medição corrente. */
  dobras: number;
  /** Quantas medições permanentes existem na cena (de todos os participantes). */
  permanentesNaCena: number;
  /** Quantas dessas o usuário corrente pode apagar (as suas; todas, se narrador). */
  permanentesQuePodeLimpar: number;
  limpando: boolean;
  onLimpar: () => void;
  onFechar: () => void;
}

const MODOS: { valor: ModoMedicao; nome: string; sub: string; Icone: typeof Timer }[] = [
  { valor: "instantanea", nome: "Instantânea", sub: "só pra você", Icone: Timer },
  { valor: "permanente", nome: "Permanente", sub: "fica pra mesa", Icone: Ruler },
];

export function PainelMedir(p: PropsPainelMedir) {
  const modoAtivo = MODOS.find((m) => m.valor === p.modo) ?? MODOS[0];
  const medindo = p.resumo !== null;

  return (
    <JanelaFerramenta
      id="medir"
      icone={<Ruler size={16} />}
      titulo="Medir"
      modo={modoAtivo.nome}
      rotulo="Ferramenta Medir"
      rotuloFechar="Fechar ferramenta Medir"
      aoFechar={p.onFechar}
    >

      <div className="rv-fp-corpo">
        {/* INDICADORES — a leitura de relance do estudo: distância,
            custo e trechos como três placas, cada uma com sua barra de
            acento. Sem medição na tela elas mostram "—", nunca zero
            (zero é um resultado; ausência não é). */}
        <div className="rv-fp-placas" role="status" aria-live="polite">
          <div className="rv-fp-placa" data-acento="cy">
            <span className="rv-fp-placa-rot">Distância</span>
            <span className="rv-fp-placa-val">
              {p.resumo ? p.resumo.metros : "—"}
              {p.resumo && <span className="rv-fp-placa-un">m</span>}
            </span>
          </div>
          <div className="rv-fp-placa" data-acento="am">
            <span className="rv-fp-placa-rot">Custo</span>
            <span className="rv-fp-placa-val">{p.resumo ? p.resumo.custo : "—"}</span>
          </div>
          <div className="rv-fp-placa" data-acento="neutro">
            <span className="rv-fp-placa-rot">Trechos</span>
            <span className="rv-fp-placa-val">{p.resumo ? p.resumo.trechos.length : "—"}</span>
          </div>
        </div>

        {/* Avisos — só quando o mapa de fato cobra algo. O custo maior
            que a distância É o terreno difícil no caminho. */}
        {p.resumo && p.resumo.custo !== p.resumo.metros && (
          <p className="rv-fp-medida-aviso">
            <AlertTriangle size={13} />
            <span>A régua atravessa terreno difícil · +{p.resumo.custo - p.resumo.metros} de custo</span>
          </p>
        )}
        {p.resumo?.atravessaBloqueio && (
          <p className="rv-fp-medida-aviso" data-grave="true">
            <AlertTriangle size={13} />
            <span>A régua atravessa terreno bloqueado.</span>
          </p>
        )}

        <div className="rv-fp-grupo">
          <span className="rv-fp-rotulo" id="rv-fp-rot-modo-medir">Modo</span>
          <div className="rv-fp-seg" role="group" aria-labelledby="rv-fp-rot-modo-medir">
            {MODOS.map((m) => (
              <button
                key={m.valor}
                type="button" className="rv-fp-seg-btn" aria-pressed={p.modo === m.valor}
                onClick={() => p.onModo(m.valor)}
              >
                <m.Icone size={15} />
                <span className="rv-fp-seg-nome">{m.nome}</span>
                <span className="rv-fp-seg-sub">{m.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ATALHOS — a mesma informação do parágrafo antigo, agora
            legível de relance: tecla e o que ela faz, em linha. */}
        <div className="rv-fp-grupo">
          <span className="rv-fp-rotulo">Atalhos do gesto</span>
          <ul className="rv-fp-atalhos">
            <li><kbd className="rv-fp-tecla">Q</kbd><span>dobra</span></li>
            {/* Palavra, não `⌫` (U+232B): a mono do VTT não tem esse
                glifo e o navegador desenhava um retângulo vazio. As
                outras três teclas já eram palavra/letra. */}
            <li><kbd className="rv-fp-tecla">Backspace</kbd><span>desfaz ponto</span></li>
            <li><kbd className="rv-fp-tecla">Enter</kbd><span>conclui</span></li>
            <li><kbd className="rv-fp-tecla">Esc</kbd><span>cancela</span></li>
          </ul>
          <p className="rv-fp-nota">
            <MousePointerClick size={12} />
            <span>Pressione e arraste pra medir. 1 célula = 1 m.</span>
          </p>
        </div>

        {/* Detalhe por trecho — só com mais de um, e agora abaixo das
            placas (que já dão o total). */}
        {p.resumo && p.resumo.trechos.length > 1 && (
          <div className="rv-fp-grupo">
            <span className="rv-fp-rotulo">Trechos</span>
            <ul className="rv-fp-trechos">
              {p.resumo.trechos.map((d, i) => (
                <li key={i} className="rv-fp-trecho">
                  <span className="rv-fp-trecho-n">{i + 1}</span>
                  <span className="rv-fp-trecho-d">{d} m</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {p.resumo && p.dobras > 0 && (
          <p className="rv-fp-nota">
            {p.dobras} dobra{p.dobras === 1 ? "" : "s"} fixada{p.dobras === 1 ? "" : "s"}
          </p>
        )}
        {!medindo && <p className="rv-fp-medida-ocioso">Nenhuma medição em andamento</p>}
      </div>

      {/* Limpar só aparece quando há o que limpar — um botão morto
          permanente ensinaria que a ação não funciona. */}
      {p.permanentesNaCena > 0 && (
        <div className="rv-fp-rodape">
          <span className="rv-fp-rotulo">
            {p.permanentesNaCena} {p.permanentesNaCena === 1 ? "medição" : "medições"} no mapa
          </span>
          <button
            type="button" className="rv-btn rv-fp-primaria"
            onClick={p.onLimpar}
            disabled={p.limpando || p.permanentesQuePodeLimpar === 0}
            title={
              p.permanentesQuePodeLimpar === 0
                ? "Todas as medições do mapa são de outros participantes."
                : undefined
            }
          >
            {p.limpando ? <Loader2 size={14} className="rv-spin" /> : <Eraser size={14} />}
            {p.permanentesQuePodeLimpar === p.permanentesNaCena
              ? "Limpar medições"
              : `Limpar as minhas (${p.permanentesQuePodeLimpar})`}
          </button>
        </div>
      )}
    </JanelaFerramenta>
  );
}
