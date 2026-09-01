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
import { Eraser, Loader2, MousePointerClick, Ruler, Timer } from "lucide-react";
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

        <p className="rv-fp-instrucao">
          <MousePointerClick size={13} />
          <span>
            Pressione e arraste pra medir. <kbd className="rv-fp-tecla">Q</kbd> fixa uma dobra e
            segue medindo a partir dela; <kbd className="rv-fp-tecla">Backspace</kbd> desfaz a
            última. <kbd className="rv-fp-tecla">Enter</kbd> conclui, <kbd className="rv-fp-tecla">Esc</kbd> cancela.
            1 célula = 1 m.
          </span>
        </p>

        {/* Total acumulado — `role="status"` porque muda durante o
            gesto e precisa chegar a leitor de tela sem roubar o foco
            do mapa (mesmo padrão da contagem de células do Terreno). */}
        <div
          className={`rv-fp-medida${medindo ? "" : " rv-fp-medida--vazia"}`}
          role="status" aria-live="polite"
        >
          {p.resumo ? (
            <>
              <div className="rv-fp-medida-total">
                <strong>{p.resumo.metros}</strong>
                <span className="rv-fp-medida-un">m</span>
                {p.resumo.custo !== p.resumo.metros && (
                  <span className="rv-fp-medida-custo">custo {p.resumo.custo}</span>
                )}
              </div>
              {/* Os trechos só aparecem quando há mais de um — com um
                  trecho só, repetir o total como "parcial" seria ruído. */}
              {p.resumo.trechos.length > 1 && (
                <ul className="rv-fp-trechos">
                  {p.resumo.trechos.map((d, i) => (
                    <li key={i} className="rv-fp-trecho">
                      <span className="rv-fp-trecho-n">{i + 1}</span>
                      <span className="rv-fp-trecho-d">{d} m</span>
                    </li>
                  ))}
                </ul>
              )}
              {p.dobras > 0 && (
                <p className="rv-fp-medida-nota">
                  {p.dobras} dobra{p.dobras === 1 ? "" : "s"} fixada{p.dobras === 1 ? "" : "s"}
                </p>
              )}
              {p.resumo.atravessaBloqueio && (
                <p className="rv-fp-medida-aviso">A régua atravessa terreno bloqueado.</p>
              )}
            </>
          ) : (
            <span className="rv-fp-medida-ocioso">Nenhuma medição em andamento</span>
          )}
        </div>
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
