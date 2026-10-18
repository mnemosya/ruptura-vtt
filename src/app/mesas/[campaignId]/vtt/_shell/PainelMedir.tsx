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
 *
 * Linha F: a leitura da régua é a VITRINE (`jf-hero`) — distância
 * grande, custo e trechos ao lado, e a faixa de trechos embaixo com a
 * metragem de cada um. Sem régua, a vitrine ensina o gesto em vez de
 * mostrar "—" em três placas mortas. As opções viram blocos sem
 * subtítulo; o que cada uma FAZ mora numa frase de ajuda só.
 */

import { Fragment, useState } from "react";
import { JanelaFerramenta } from "./JanelaFerramenta";
import { AlertTriangle, CornerDownLeft, Delete, Eraser, Loader2, Pin, Ruler, Timer, User, Users } from "lucide-react";
import { type DuracaoMedicao, type ModoMedicao, type VisibilidadeMedicao } from "../_dominio/medicaoRegua";

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

/* DOIS EIXOS, dois grupos. Eles eram um só ("Instantânea / só pra
   você" contra "Permanente / fica pra mesa"), o que tornava
   inalcançáveis as duas combinações que a mesa mais pede: mostrar uma
   medida ao vivo sem deixar régua no mapa, e salvar uma régua que só eu
   vejo. Cada eixo responde uma pergunta; a `desc` diz a CONSEQUÊNCIA
   (vai pra frase de ajuda), nunca repete o nome. */
const DURACOES: { valor: DuracaoMedicao; nome: string; desc: string; Icone: typeof Timer }[] = [
  { valor: "instantanea", nome: "Instantânea", desc: "Some quando você conclui", Icone: Timer },
  { valor: "permanente", nome: "Permanente", desc: "Fica no mapa até alguém apagar", Icone: Pin },
];

const VISIBILIDADES: { valor: VisibilidadeMedicao; nome: string; desc: string; Icone: typeof Timer }[] = [
  { valor: "privada", nome: "Só pra você", desc: "Nem o narrador vê", Icone: User },
  { valor: "mesa", nome: "Pra mesa", desc: "Todos veem a régua", Icone: Users },
];

/**
 * Resumo das duas escolhas, mostrado quando nada está sob o mouse.
 *
 * "Instantânea + pra mesa" é a única combinação cujo comportamento não
 * se deduz dos dois nomes (a mesa vê AO VIVO, e nada fica gravado) —
 * por isso ganha frase própria em vez da concatenação.
 */
function resumoDoModo(modo: ModoMedicao): string {
  if (modo.duracao === "instantanea" && modo.visibilidade === "mesa") {
    return "A mesa vê a régua ao vivo enquanto você mede · some no fim";
  }
  const d = DURACOES.find((x) => x.valor === modo.duracao) ?? DURACOES[0];
  const v = VISIBILIDADES.find((x) => x.valor === modo.visibilidade) ?? VISIBILIDADES[0];
  return `${d.desc} · ${v.desc.toLowerCase()}`;
}

/** Hexes da vitrine vazia — a fileira do protótipo, em coordenadas fixas. */
const HEX_VAZIO = [18, 38.78, 59.56, 80.34, 101.12].map((cx) =>
  [[0, -12], [10.39, -6], [10.39, 6], [0, 12], [-10.39, 6], [-10.39, -6]]
    .map(([dx, dy]) => `${(cx + dx).toFixed(2)},${20 + dy}`).join(" "),
);

export function PainelMedir(p: PropsPainelMedir) {
  const duracaoAtiva = DURACOES.find((m) => m.valor === p.modo.duracao) ?? DURACOES[0];
  const visibilidadeAtiva = VISIBILIDADES.find((m) => m.valor === p.modo.visibilidade) ?? VISIBILIDADES[0];
  // Descrição da opção sob o mouse/foco; `null` mostra o resumo do modo.
  const [foco, setFoco] = useState<string | null>(null);
  const focar = (txt: string) => ({
    onMouseEnter: () => setFoco(txt), onMouseLeave: () => setFoco(null),
    onFocus: () => setFoco(txt), onBlur: () => setFoco(null),
  });

  const r = p.resumo;
  // Trecho de 0 m (dobra fixada sem sair da célula) ainda é um trecho:
  // ganha peso mínimo pra não sumir da faixa.
  const pesoTrecho = (d: number) => Math.max(d, 0.6);

  return (
    <JanelaFerramenta
      id="medir"
      icone={<Ruler size={16} />}
      titulo="Medir"
      modo={`${duracaoAtiva.nome} · ${visibilidadeAtiva.nome.toLowerCase()}`}
      rotulo="Ferramenta Medir"
      rotuloFechar="Fechar ferramenta Medir"
      aoFechar={p.onFechar}
    >
      <div className="jf-corpo jmed-corpo">
        {/* VITRINE — a leitura da régua. Sem medição, ensina o gesto (e
            não mostra zero: zero é um resultado; ausência não é). */}
        <div className="jf-hero jmed-hero" role="status" aria-live="polite">
          {!r ? (
            <div className="jmed-vazio">
              <svg width="132" height="44" viewBox="0 0 120 40" fill="none" aria-hidden="true" className="jmed-vazio-arte">
                <g className="jmed-vazio-hx">
                  {HEX_VAZIO.map((pts, i) => <polygon key={i} points={pts} />)}
                </g>
                <path d="M18 20H80.34" className="jmed-vazio-linha" />
                <circle cx="18" cy="20" r="2.6" className="jmed-vazio-origem" />
                <rect x="77.34" y="17" width="6" height="6" transform="rotate(45 80.34 20)" className="jmed-vazio-ponta" />
              </svg>
              <span className="jmed-vazio-1">Arraste no mapa pra medir</span>
              <span className="jmed-vazio-2">1 célula = 1 m</span>
            </div>
          ) : (
            <>
              <div className="jmed-leit">
                <span className="jmed-dist" data-testid="medir-distancia">
                  {r.metros}<small>m</small>
                </span>
                <span className="jmed-stats">
                  <span className="jmed-stat" data-acento="custo">
                    <span className="jmed-stat-l"><i aria-hidden="true" />Custo</span>
                    <b>{r.custo}</b>
                  </span>
                  <span className="jmed-stat">
                    <span className="jmed-stat-l"><i aria-hidden="true" />Trechos</span>
                    <b>{r.trechos.length}</b>
                  </span>
                </span>
              </div>

              {/* Faixa de trechos: cada segmento com largura proporcional
                  à distância dele, e a ponta viva (oca) no fim. */}
              {r.trechos.length > 0 && (
                <div
                  className="jmed-trechos"
                  aria-label={`Trechos: ${r.trechos.map((d) => `${d} m`).join(" e ")}`}
                >
                  {r.trechos.map((d, i) => (
                    <Fragment key={i}>
                      <span className="jmed-no" aria-hidden="true" />
                      <span className="jmed-seg" style={{ flexGrow: pesoTrecho(d) }}>
                        <span>{d} m</span>
                      </span>
                    </Fragment>
                  ))}
                  <span className="jmed-no is-oco" aria-hidden="true" />
                </div>
              )}

              {/* Avisos — só quando o mapa de fato cobra algo. O custo
                  maior que a distância É o terreno difícil no caminho. */}
              {(r.custo !== r.metros || r.atravessaBloqueio || p.dobras > 0) && (
                <div className="jmed-avisos">
                  {r.custo !== r.metros && (
                    <span className="jmed-aviso">
                      <AlertTriangle size={12} aria-hidden="true" />
                      Terreno difícil · +{r.custo - r.metros} de custo
                    </span>
                  )}
                  {r.atravessaBloqueio && (
                    <span className="jmed-aviso" data-grave="true">
                      <AlertTriangle size={12} aria-hidden="true" />
                      Atravessa terreno bloqueado
                    </span>
                  )}
                  {/* Com dobra, soltar o botão NÃO conclui — sem esta
                      linha a régua parece presa. */}
                  {p.dobras > 0 && (
                    <span className="jmed-aviso" data-neutro="true">
                      {p.dobras} dobra{p.dobras === 1 ? "" : "s"} · Enter conclui
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="jf-grupo">
          <span className="jf-rot" id="jmed-rot-duracao">Duração</span>
          <div className="jf-tiles" role="group" aria-labelledby="jmed-rot-duracao">
            {DURACOES.map((m) => (
              <button
                key={m.valor}
                type="button" className="jf-tile"
                aria-pressed={p.modo.duracao === m.valor}
                data-testid={`medir-duracao-${m.valor}`}
                onClick={() => p.onModo({ ...p.modo, duracao: m.valor })}
                {...focar(m.desc)}
              >
                <m.Icone size={16} strokeWidth={1.8} aria-hidden="true" />
                <span>{m.nome}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="jf-grupo">
          <span className="jf-rot" id="jmed-rot-visib">Quem vê</span>
          <div className="jf-tiles" role="group" aria-labelledby="jmed-rot-visib">
            {VISIBILIDADES.map((m) => (
              <button
                key={m.valor}
                type="button" className="jf-tile"
                aria-pressed={p.modo.visibilidade === m.valor}
                data-testid={`medir-visibilidade-${m.valor}`}
                onClick={() => p.onModo({ ...p.modo, visibilidade: m.valor })}
                {...focar(m.desc)}
              >
                <m.Icone size={16} strokeWidth={1.8} aria-hidden="true" />
                <span>{m.nome}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="jf-desc">{foco ?? resumoDoModo(p.modo)}</p>

        {/* Limpar só aparece quando há o que limpar — um botão morto
            permanente ensinaria que a ação não funciona. */}
        {p.permanentesNaCena > 0 && (
          <div className="jmm-limpar">
            <span className="jf-leg">
              {p.permanentesNaCena} {p.permanentesNaCena === 1 ? "medição" : "medições"} no mapa
            </span>
            <button
              type="button" className="jf-quieto is-perigo"
              onClick={p.onLimpar}
              disabled={p.limpando || p.permanentesQuePodeLimpar === 0}
              title={
                p.permanentesQuePodeLimpar === 0
                  ? "Todas as medições do mapa são de outros participantes."
                  : undefined
              }
            >
              {p.limpando ? <Loader2 size={13} className="rv-spin" aria-hidden="true" /> : <Eraser size={13} aria-hidden="true" />}
              {p.permanentesQuePodeLimpar === p.permanentesNaCena
                ? "Limpar medições"
                : `Limpar as minhas (${p.permanentesQuePodeLimpar})`}
            </button>
          </div>
        )}

        {/* ATALHOS do gesto — os quatro que `MapaHex` de fato escuta
            enquanto a régua está viva. Backspace e Enter vão como ÍCONE:
            a mono do VTT não tem `⌫`/`↵` e o navegador desenhava um
            retângulo vazio; a palavra inteira não cabia na linha. */}
        <div className="jf-atalhos">
          <span><kbd className="jf-kbd">Q</kbd>dobra</span>
          <span>
            <kbd className="jf-kbd" aria-label="Backspace" title="Backspace"><Delete size={12} aria-hidden="true" /></kbd>
            desfaz
          </span>
          <span>
            <kbd className="jf-kbd" aria-label="Enter" title="Enter"><CornerDownLeft size={12} aria-hidden="true" /></kbd>
            conclui
          </span>
          <span><kbd className="jf-kbd">Esc</kbd>cancela</span>
        </div>
      </div>
    </JanelaFerramenta>
  );
}
